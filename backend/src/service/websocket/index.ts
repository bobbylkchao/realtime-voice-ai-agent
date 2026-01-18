import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { WebSocketServer, WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents-realtime'
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions'
import { withTrace } from '@openai/agents'
import { handleRealtimeVoice, VoiceSessionManager } from '../open-ai'
import { mcpServerManager } from '../mcp-server/manager'
import type { RealtimeVoiceEventName, RealtimeVoiceMessage } from './types'
import logger from '../../misc/logger'
import { frontDeskAgentForPhone } from '../open-ai/agents/front-desk-agent-for-phone'

export const initWebSocketServer = (httpServer: HttpServer) => {
  const wsServer = new Server(httpServer, {
    transports: ['websocket'],
    path: '/realtime-voice',
    cors: {
      origin: '*',
    },
  })

  logger.info('[Websocket] Socket.IO server initialized on /realtime-voice')

  wsServer.on('connection', (socket) => {
    logger.info(`[Websocket] Client connected: ${socket.id}`)

    socket.on('message', (message: RealtimeVoiceMessage) => {
      const eventName = message?.event as RealtimeVoiceEventName
      const eventData = message?.data as ArrayBuffer
      handleRealtimeVoice(eventName, eventData, socket)
    })

    socket.on('connect_error', (error) => {
      logger.error(
        { error, socketId: socket.id },
        '[Websocket] Connection error'
      )
    })

    socket.on('disconnect', async (reason: string) => {
      logger.info(
        `[Websocket] Client disconnected: ${socket.id}, reason: ${reason}`
      )
      const sessionManager = new VoiceSessionManager()
      try {
        await sessionManager.closeUserSession(socket.id)
      } catch (error) {
        logger.error(
          { error, clientId: socket.id },
          '[Websocket] Error closing user session'
        )
      }
    })
  })
}


export const initTwilioWebSocketServer = (httpServer: HttpServer) => {
  if (process.env.TWILIO_ENABLE !== 'true') {
    logger.info('[Twilio] Skip initializing Twilio WebSocket server')
    return
  }

  // Use noServer option and handle upgrade manually to avoid conflicts with Socket.IO
  const wss = new WebSocketServer({
    noServer: true, // Don't automatically handle upgrade
  })

  // Manually handle upgrade only for /media-stream path
  httpServer.on('upgrade', (request, socket, head) => {
    // Get the full URL including query string
    // request.url should contain the full path with query string
    const fullUrl = request.url || ''
    console.log('fullUrl', fullUrl)
    const pathname = new URL(fullUrl || '/', `http://${request.headers.host || 'localhost'}`).pathname

    if (pathname === '/media-stream') {
      let customerPhoneNumber = ''

      try {
        // Log the full request details for debugging
        logger.debug(
          {
            requestUrl: fullUrl,
            headers: request.headers,
            method: request.method,
          },
          '[Twilio Media Stream] Full request details'
        )

        // Try multiple methods to extract query parameters
        // Method 1: Direct from request.url
        if (fullUrl.includes('?')) {
          const queryString = fullUrl.split('?')[1]
          const params = new URLSearchParams(queryString)
          customerPhoneNumber = params.get('customerPhoneNumber') || ''
        }

        // Method 2: If not found, try parsing from full URL
        if (!customerPhoneNumber) {
          try {
            const url = new URL(fullUrl, `http://${request.headers.host || 'localhost'}`)
            customerPhoneNumber = url.searchParams.get('customerPhoneNumber') || ''
          } catch (urlError) {
            logger.warn(
              { urlError, fullUrl },
              '[Twilio Media Stream] Failed to parse URL with new URL()'
            )
          }
        }

        // Log for debugging
        logger.info(
          {
            requestUrl: fullUrl,
            customerPhoneNumber: customerPhoneNumber || 'not found',
            pathname,
          },
          '[Twilio Media Stream] Parsed URL query parameters'
        )
      } catch (error) {
        logger.error(
          { error, fullUrl },
          '[Twilio Media Stream] Failed to parse URL query parameters'
        )
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        // Store request and customerPhoneNumber in ws for later use
        logger.info(
          {
            customerPhoneNumber: customerPhoneNumber || 'not provided',
            requestUrl: fullUrl,
          },
          '[Twilio Media Stream] Establishing websocket connection to Twilio in /media-stream'
        )
        ;(ws as any).request = request
        ;(ws as any).customerPhoneNumber = customerPhoneNumber
        wss.emit('connection', ws, request)
      })
    }
    // For all other paths (like /realtime-voice), let Socket.IO handle it
  })

  wss.on('connection', async (ws: WebSocket) => {
    // Use withTrace at the top level to provide tracing context for the entire WebSocket connection lifecycle
    // This ensures all operations (session.connect, updateAgent, function calls) have access to tracing context
    withTrace('twilioWebSocketConnection', async () => {
      let greetingSent = false

      logger.info(
        '[Twilio Media Stream] WebSocket connection established'
      )

      // Wrap ws.send to log outgoing messages (for debugging protocol issues)
      // This helps identify what messages are being sent to Twilio
      const originalSend = ws.send.bind(ws)
      ws.send = function(data: any, ...args: any[]) {
        return originalSend(data, ...args)
      }

      const openAiApiKey = process.env.OPENAI_API_KEY
      if (!openAiApiKey) {
        logger.error('[Twilio Media Stream] OpenAI API key missing')
        ws.close()
        return
      }

      // IMPORTANT: Following "Speed is the name of the game" from OpenAI docs:
      // 1. Create transport layer IMMEDIATELY
      // 2. Create session IMMEDIATELY (without waiting for MCP servers)
      // 3. Connect IMMEDIATELY (user can start talking right away)
      // 4. Connect MCP servers in background and update agent asynchronously

      const twilioTransportLayer = new TwilioRealtimeTransportLayer({
        twilioWebSocket: ws,
      })

      // Helper function to send greeting if not already sent
      const sendGreetingIfReady = () => {
        if (!greetingSent) {
          try {
            // Use transport layer to send message (this is the correct way for Twilio)
            twilioTransportLayer.sendMessage({
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'hi',
                },
              ],
            }, {})
            logger.info('[Twilio Media Stream] Greeting sent')
            greetingSent = true
          } catch {
            logger.info('[Twilio Media Stream] Not ready to send greeting yet' )
          }
        }
      }

      // Remove greeting trigger from twilio_message event to avoid race condition
      // Greeting will be sent only when connection is fully established

      logger.info(
        '[Twilio Media Stream] TwilioRealtimeTransportLayer created immediately'
      )

      // Extract customerPhoneNumber from WebSocket (stored during upgrade)
      let customerPhoneNumber = (ws as any).customerPhoneNumber || ''

      logger.info(
        {
          customerPhoneNumber: customerPhoneNumber || 'not provided',
        },
        '[Twilio Media Stream] Customer phone number extracted from WebSocket connection'
      )

      // Create agent with shared MCP servers (already initialized at server startup)
      // Get phone-call-only MCP servers for Twilio
      const mcpServers = mcpServerManager.getMcpServers(true)
      const agent = frontDeskAgentForPhone(mcpServers, customerPhoneNumber)

      // Create session immediately (user can start talking right away)
      const session = new RealtimeSession(agent, {
        transport: twilioTransportLayer,
        model: process.env.OPENAI_VOICE_MODEL || 'gpt-realtime',
        config: {
          audio: {
            input: {
              turnDetection: {
                type: 'server_vad',
                create_response: true,
                interrupt_response: true,
                silence_duration_ms: 500,
              },
            },
            output: {
              voice: 'verse',
            },
          },
        },
      })

      // Set up event listeners
      session.on('mcp_tools_changed', (tools: { name: string }[]) => {
        const toolNames = tools.map((tool) => tool.name).join(', ')
        logger.info(
          { toolNames },
          `[Twilio Media Stream] Available MCP tools: ${toolNames || 'None'}`
        )
      })

      session.on(
        'mcp_tool_call_completed',
        (_context: unknown, _agent: unknown, toolCall: unknown) => {
          logger.info({ toolCall }, '[Twilio Media Stream] MCP tool call completed')
        }
      )

      session.on('error', (error) => {
        logger.error(
          { error, errorType: (error as any)?.type },
          '[Twilio Media Stream] Session error occurred'
        )
      })

      session.on('connection_change', (status) => {
        logger.info(
          { status },
          '[Twilio Media Stream] Connection status changed'
        )
      })

      // Listen for audio events to ensure audio is working
      session.on('audio', (audioEvent) => {
        logger.debug(
          { audioLength: audioEvent.data?.byteLength },
          '[Twilio Media Stream] Audio output received from session'
        )
      })

      // Listen for response events
      session.on('response.output_item.added', (event) => {
        logger.info(
          { eventType: event.type },
          '[Twilio Media Stream] Response output item added'
        )
      })

      session.on('response.output_item.done', (event) => {
        logger.info(
          { eventType: event.type },
          '[Twilio Media Stream] Response output item done'
        )
      })

      session.on('response.done', () => {
        logger.info('[Twilio Media Stream] Response done')
      })

      // Listen to transport events to access raw Twilio messages (Tip #2 from docs)
      session.on('transport_event', (event) => {
        if (event.type === 'twilio_message') {
          const message = (event as any).message
          logger.debug(
            { message },
            '[Twilio Media Stream] Raw Twilio message received'
          )

          // Try to extract customerPhoneNumber from Twilio message if not already set
          if (!customerPhoneNumber && message) {
            // Twilio messages may contain caller information
            const callerNumber = message?.event?.payload?.callerNumber ||
                                 message?.callerNumber ||
                                 message?.From
            if (callerNumber) {
              customerPhoneNumber = callerNumber
              logger.info(
                { customerPhoneNumber, messageType: message?.event?.event },
                '[Twilio Media Stream] Extracted customer phone number from Twilio message'
              )
              // Update the stored value
              ;(ws as any).customerPhoneNumber = customerPhoneNumber
            }
          }
        }
      })

      // Connect IMMEDIATELY (this is critical!)
      // Agent already includes shared MCP servers (initialized at server startup)
      // 
      // NOTE: MCP servers are now shared across all sessions (initialized at server startup)
      // This improves performance and reduces resource usage
      session
        .connect({
          apiKey: openAiApiKey,
        })
        .then(() => {
          logger.info(
            { mcpServerCount: mcpServers.length },
            '[Twilio Media Stream] Connected to OpenAI Realtime API immediately'
          )
          // Wait for audio streams to be fully ready before sending greeting
          // Increased delay to ensure audio output channel is established
          setTimeout(() => {
            sendGreetingIfReady()
          }, 800)
        })
        .catch((error) => {
          logger.error(
            { error },
            '[Twilio Media Stream] Failed to connect to OpenAI, closing connection'
          )
          ws.close()
        })

      ws.on('close', async () => {
        logger.info('[Twilio Media Stream] WebSocket connection closed')

        try {
          session.close()
          logger.info('[Twilio Media Stream] RealtimeSession closed')
        } catch (error) {
          logger.error(
            { error },
            '[Twilio Media Stream] Error closing RealtimeSession'
          )
        }

        // Note: MCP servers are shared across all sessions and managed globally
        // They will be closed during server shutdown, not per-session
      })

      ws.on('error', (error) => {
        logger.error(
          { error },
          '[Twilio Media Stream] WebSocket error occurred'
        )
      })
    }).catch((tracingError) => {
      // Log tracing errors separately (non-fatal)
      logger.warn(
        { tracingError },
        '[Twilio Media Stream] Tracing error during WebSocket connection (non-fatal)'
      )
    })
  })
}

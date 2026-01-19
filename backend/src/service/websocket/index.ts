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

  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN
  if (!twilioAuthToken) {
    logger.error('[Twilio] Twilio auth token missing')
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
    const pathname = new URL(fullUrl || '/', `http://${request.headers.host || 'localhost'}`).pathname

    if (pathname === '/media-stream') {
      // TODO: how to get customerPhoneNumber from the request
      const customerPhoneNumber = '+12045946733'

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

  const greetingRecord = new Map<string, boolean>()

  const isGreetingSent = (callId: string) => {
    return greetingRecord.get(callId) || false
  }

  const setGreetingSent = (callId: string) => {
    greetingRecord.set(callId, true)
  }

  wss.on('connection', async (ws: WebSocket) => {
    // Use withTrace at the top level to provide tracing context for the entire WebSocket connection lifecycle
    // This ensures all operations (session.connect, updateAgent, function calls) have access to tracing context
    withTrace('twilioWebSocketConnection', async () => {
      const customerPhoneNumber = (ws as any).customerPhoneNumber
      let callId = ''

      logger.info(
        { customerPhoneNumber },
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

      // Helper function to send greeting if conditions are met
      const sendGreetingIfReady = () => {
        if (callId && !isGreetingSent(callId)) {
          try {
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
            logger.info(
              { callId, customerPhoneNumber },
              '[Twilio Media Stream] Greeting sent'
            )
            setGreetingSent(callId)
          } catch {
            logger.info(
              { callId, customerPhoneNumber },
              '[Twilio Media Stream] will retry on next twilio_message to send greeting'
            )
          }
        }
      }

      // Listen for twilio_message events to get callId and trigger greeting
      twilioTransportLayer.on('*', (event) => {
        if (event.type === 'twilio_message') {
          if (!callId) {
            callId = (event as any)?.message?.start?.callSid || ''
            logger.info(
              { callId, customerPhoneNumber },
              '[Twilio Media Stream] Call ID received from twilio_message'
            )
          }
          // Try to send greeting when twilio_message is received
          sendGreetingIfReady()
        }
      })

      logger.info(
        { callId, customerPhoneNumber },
        '[Twilio Media Stream] TwilioRealtimeTransportLayer created immediately'
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

      // Set up essential event listeners
      session.on('error', (error) => {
        logger.error(
          { error, errorType: (error as any)?.type },
          '[Twilio Media Stream] Session error occurred'
        )
      })

      // Listen for audio output to verify it's working
      session.on('audio', (audioEvent) => {
        logger.info(
          { audioLength: audioEvent.data?.byteLength },
          '[Twilio Media Stream] Audio output received from session'
        )
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
            { callId, customerPhoneNumber, mcpServerCount: mcpServers.length },
            '[Twilio Media Stream] Connected to OpenAI Realtime API immediately'
          )
          // Send greeting immediately after session is connected
          // This follows master branch pattern where greeting is sent after connection
          sendGreetingIfReady()
        })
        .catch((error) => {
          logger.error(
            { error },
            '[Twilio Media Stream] Failed to connect to OpenAI, closing connection'
          )
          ws.close()
        })

      ws.on('close', async () => {
        logger.info({ callId, customerPhoneNumber }, '[Twilio Media Stream] WebSocket connection closed')

        try {
          session.close()
          greetingRecord.delete(callId)
          callId = ''
          logger.info({ callId, customerPhoneNumber }, '[Twilio Media Stream] RealtimeSession closed')
        } catch (error) {
          logger.error(
            { error, callId, customerPhoneNumber },
            '[Twilio Media Stream] Error closing RealtimeSession'
          )
        }

        // Note: MCP servers are shared across all sessions and managed globally
        // They will be closed during server shutdown, not per-session
      })

      ws.on('error', (error) => {
        logger.error(
          { error, callId, customerPhoneNumber },
          '[Twilio Media Stream] WebSocket error occurred'
        )
        greetingRecord.delete(callId)
        callId = ''
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

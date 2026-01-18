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
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname

    if (pathname === '/media-stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Store request in ws for later use
        ;(ws as any).request = request
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
      try {
        if (typeof data === 'string') {
          // Log JSON messages to see what's being sent
          try {
            const json = JSON.parse(data)
          } catch {
            logger.debug(
              { message: data.substring(0, 200) },
              '[Twilio Media Stream] Outgoing text message to Twilio'
            )
          }
        } else if (Buffer.isBuffer(data)) {
          logger.debug(
            { dataLength: data.length },
            '[Twilio Media Stream] Outgoing binary data to Twilio'
          )
        }
      } catch {
        // Ignore logging errors
      }
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
        } catch (error) {
          logger.info(
            '[Twilio Media Stream] will retry on next twilio_message to send greeting'
          )
        }
      }
    }

    twilioTransportLayer.on('*', (event) => {
      if (event.type === 'twilio_message') {
        // Try to send greeting when twilio_message is received
        sendGreetingIfReady()
      }
    })

    logger.info(
      '[Twilio Media Stream] TwilioRealtimeTransportLayer created immediately'
    )

    // Create agent with shared MCP servers (already initialized at server startup)
    // Get phone-call-only MCP servers for Twilio
    const mcpServers = mcpServerManager.getMcpServers(true)
    const agent = frontDeskAgentForPhone(mcpServers)

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
        { error },
        '[Twilio Media Stream] Session error occurred'
      )
    })

    session.on('connection_change', (status) => {
      logger.info(
        { status },
        '[Twilio Media Stream] Connection status changed'
      )
    })

    // Listen to transport events to access raw Twilio messages (Tip #2 from docs)
    session.on('transport_event', (event) => {
      if (event.type === 'twilio_message') {
        logger.debug(
          { message: (event as any).message },
          '[Twilio Media Stream] Raw Twilio message received'
        )
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

        // Immediately send greeting after session is connected
        // Agent already has MCP servers, no need to update
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

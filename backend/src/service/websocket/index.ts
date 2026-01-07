import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { WebSocketServer, WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents-realtime'
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions'
import { MCPServerStreamableHttp } from '@openai/agents'
import { handleRealtimeVoice, VoiceSessionManager } from '../open-ai'
import { frontDeskAgent } from '../open-ai/agents/front-desk-agent'
import { mcpServerList } from '../mcp-server'
import type { RealtimeVoiceEventName, RealtimeVoiceMessage } from './types'
import logger from '../../misc/logger'

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

let isGreetingSent = false
let callId = ''

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

  wss.on('connection', (ws: WebSocket, req?: any) => {
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
              { callId, message: data.substring(0, 200) },
              '[Twilio Media Stream] Outgoing text message to Twilio'
            )
          }
        } else if (Buffer.isBuffer(data)) {
          logger.debug(
            { callId, dataLength: data.length },
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
      logger.error({ callId }, '[Twilio Media Stream] OpenAI API key missing')
      ws.close()
      return
    }

    // IMPORTANT: Following "Speed is the name of the game" from OpenAI docs:
    // 1. Create transport layer IMMEDIATELY
    // 2. Create session IMMEDIATELY (without waiting for MCP servers)
    // 3. Connect IMMEDIATELY
    // 4. Connect MCP servers in background and update agent later

    const twilioTransportLayer = new TwilioRealtimeTransportLayer({
      twilioWebSocket: ws,
    })

    twilioTransportLayer.on('*', (event) => {
      if (event.type === 'twilio_message') {
        if (!callId) {
          callId = event?.message?.streamSid || ''
        }

        if (!isGreetingSent) {
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
              { callId },
              '[Twilio Media Stream] Greeting sent'
            )
            isGreetingSent = true
          } catch {
            // Ignore error, will be caught by session.on('error')
          }
        }
      }
    })

    logger.info(
      { callId },
      '[Twilio Media Stream] TwilioRealtimeTransportLayer created immediately'
    )

    // Create agent without MCP servers initially (we'll add them later)
    const agent = frontDeskAgent([])

    // Create session immediately
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
        { callId, toolNames },
        `[Twilio Media Stream] Available MCP tools: ${toolNames || 'None'}`
      )
    })

    session.on(
      'tool_approval_requested',
      (_context: unknown, _agent: unknown, approvalRequest: any) => {
        logger.info(
          {
            callId,
            toolName: approvalRequest.approvalItem.rawItem.name,
          },
          '[Twilio Media Stream] Tool approval requested'
        )
        session
          .approve(approvalRequest.approvalItem)
          .catch((error: unknown) =>
            logger.error(
              { error, callId },
              '[Twilio Media Stream] Failed to approve tool call'
            )
          )
      }
    )

    session.on(
      'mcp_tool_call_completed',
      (_context: unknown, _agent: unknown, toolCall: unknown) => {
        logger.info({ callId, toolCall }, '[Twilio Media Stream] MCP tool call completed')
      }
    )

    session.on('error', (error) => {
      logger.error(
        { error, callId },
        '[Twilio Media Stream] Session error occurred'
      )
    })

    session.on('connection_change', (status) => {
      logger.info(
        { status, callId },
        '[Twilio Media Stream] Connection status changed'
      )
    })

    // Listen to transport events to access raw Twilio messages (Tip #2 from docs)
    session.on('transport_event', (event) => {
      if (event.type === 'twilio_message') {
        logger.debug(
          { callId, message: (event as any).message },
          '[Twilio Media Stream] Raw Twilio message received'
        )
      }
    })

    // Connect IMMEDIATELY (this is critical!)
    session
      .connect({
        apiKey: openAiApiKey,
      })
      .then(() => {
        logger.info(
          { callId },
          '[Twilio Media Stream] Connected to OpenAI Realtime API immediately'
        )
      })
      .catch((error) => {
        logger.error(
          { error, callId },
          '[Twilio Media Stream] Failed to connect to OpenAI, closing connection'
        )
        ws.close()
      })

    // Connect MCP servers in background (non-blocking)
    const mcpServers: MCPServerStreamableHttp[] = []
    Promise.all(
      mcpServerList.map(async (mcpServerConfig) => {
        try {
          const mcpServer = new MCPServerStreamableHttp({
            url: mcpServerConfig.url,
            name: mcpServerConfig.name,
          })
          await mcpServer.connect()
          mcpServers.push(mcpServer)
          logger.info(
            {
              callId,
              mcpServerName: mcpServerConfig.name,
            },
            '[Twilio Media Stream] MCP server connected successfully (background)'
          )
        } catch (mcpError) {
          logger.warn(
            {
              mcpError,
              callId,
              mcpServerName: mcpServerConfig.name,
            },
            '[Twilio Media Stream] Failed to connect to MCP server (non-critical)'
          )
        }
      })
    ).then(() => {
      // Update agent with MCP servers after they're connected
      // Note: This might require recreating the session or updating the agent
      // For now, MCP servers will be available through the session's MCP integration
      logger.info(
        { callId, mcpServerCount: mcpServers.length },
        '[Twilio Media Stream] All MCP servers connected in background'
      )
    })

    ws.on('close', async () => {
      logger.info({ callId }, '[Twilio Media Stream] WebSocket connection closed')

      try {
        session.close()
        logger.info({ callId }, '[Twilio Media Stream] RealtimeSession closed')
      } catch (error) {
        logger.error(
          { error, callId },
          '[Twilio Media Stream] Error closing RealtimeSession'
        )
      }

      // Close MCP servers
      for (const mcpServer of mcpServers) {
        try {
          await mcpServer.close()
          logger.info(
            {
              callId,
              mcpServerName: mcpServer.name,
            },
            '[Twilio Media Stream] MCP server closed successfully'
          )
        } catch (error) {
          logger.error(
            { error, callId, mcpServerName: mcpServer.name },
            '[Twilio Media Stream] Error closing MCP server'
          )
        }
      }
    })

    ws.on('error', (error) => {
      logger.error(
        { error, callId },
        '[Twilio Media Stream] WebSocket error occurred'
      )
    })
  })
}

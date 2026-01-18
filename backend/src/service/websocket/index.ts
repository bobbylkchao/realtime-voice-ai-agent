import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { WebSocketServer, WebSocket } from 'ws'
import { RealtimeSession, RealtimeItem } from '@openai/agents-realtime'
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions'
import { MCPServerStreamableHttp, withTrace } from '@openai/agents'
import { handleRealtimeVoice, VoiceSessionManager } from '../open-ai'
import { mcpServerManager } from '../mcp-server/manager'
import type { RealtimeVoiceEventName, RealtimeVoiceMessage } from './types'
import logger from '../../misc/logger'
import { COMPANY_NAME_FOR_TESTING, frontDeskAgentForPhone } from '../open-ai/agents/front-desk-agent-for-phone'

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

const greetingRecord = new Map<string, boolean>()

const isGreetingSent = (callId: string) => {
  return greetingRecord.get(callId) || false
}

const setGreetingSent = (callId: string) => {
  greetingRecord.set(callId, true)
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
    const pathname = new URL(
      request.url || '',
      `http://${request.headers.host}`
    ).pathname

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
      let callId = ''

      logger.info('[Twilio Media Stream] WebSocket connection established')

      // Wrap ws.send to log outgoing messages (for debugging protocol issues)
      // This helps identify what messages are being sent to Twilio
      const originalSend = ws.send.bind(ws)
      ws.send = function (data: any, ...args: any[]) {
        try {
          if (typeof data === 'string') {
            // Log JSON messages to see what's being sent
            try {
              JSON.parse(data)
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
          logger.info('[Twilio Media Stream] WebSocket is connecting...')
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
      // 3. Connect IMMEDIATELY (user can start talking right away)
      // 4. Connect MCP servers in background and update agent asynchronously

      const twilioTransportLayer = new TwilioRealtimeTransportLayer({
        twilioWebSocket: ws,
      })

      // Helper function to send personalized greeting with phone session data
      const sendPersonalizedGreeting = async (
        session: RealtimeSession<{ history: RealtimeItem[] }>,
        mcpServers: MCPServerStreamableHttp[]
      ) => {
        if (!callId || isGreetingSent(callId)) {
          return
        }

        try {
          // Try to get phone session data from MCP server
          let hotelName: string | null = null
          const phoneSessionMcpServer = mcpServers.find(
            (server) => server.name === 'phone-session-mcp-server'
          )

          logger.info(
            {
              callId,
              hasPhoneSessionMcpServer: !!phoneSessionMcpServer,
              mcpServerNames: mcpServers.map((s) => s.name),
            },
            '[Twilio Media Stream] Checking conditions for personalized greeting'
          )

          if (phoneSessionMcpServer) {
            try {
              // Trigger tool call by sending a message to the agent
              // The agent will call the phone session tool, and we'll listen for the result
              logger.info(
                { callId },
                '[Twilio Media Stream] Requesting phone session data for personalized greeting'
              )

              // Set up a one-time listener for tool call completion
              const toolCallPromise = new Promise<{
                hotelName: string | null
              }>((resolve) => {
                const timeout = setTimeout(() => {
                  resolve({ hotelName: null })
                }, 3000) // 3 second timeout

                const toolCallHandler = (
                  _context: unknown,
                  _agent: unknown,
                  toolCall: any
                ) => {
                  if (
                    toolCall?.name ===
                      'get-phone-session-based-on-phone-number' &&
                    toolCall?.result
                  ) {
                    clearTimeout(timeout)
                    session.off('mcp_tool_call_completed', toolCallHandler)

                    try {
                      const result =
                        typeof toolCall.result === 'string'
                          ? JSON.parse(toolCall.result)
                          : toolCall.result
                      const extractedHotelName =
                        result?.hotelName || result?.structuredContent?.hotelName || null
                      logger.info(
                        { callId, hotelName: extractedHotelName },
                        '[Twilio Media Stream] Phone session data retrieved'
                      )
                      resolve({ hotelName: extractedHotelName })
                    } catch (parseError) {
                      logger.warn(
                        { error: parseError, callId },
                        '[Twilio Media Stream] Failed to parse tool call result'
                      )
                      resolve({ hotelName: null })
                    }
                  }
                }

                session.on('mcp_tool_call_completed', toolCallHandler)
              })

              // Send a message to trigger the tool call
              // The agent should be instructed to call the phone session tool when asked
              twilioTransportLayer.sendMessage(
                {
                  type: 'message',
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: 'Please call get-phone-session-based-on-phone-number tool',
                    },
                  ],
                },
                {}
              )

              // Wait for tool call result (with timeout)
              const result = await toolCallPromise
              hotelName = result.hotelName
              if (!hotelName) {
                logger.warn(
                  { callId },
                  '[Twilio Media Stream] Phone session data retrieved but hotelName is null (timeout or no data)'
                )
              }
            } catch (error) {
              logger.warn(
                { error, callId },
                '[Twilio Media Stream] Failed to get phone session data, using default greeting'
              )
            }
          } else {
            if (!phoneSessionMcpServer) {
              logger.warn(
                {
                  callId,
                  availableMcpServers: mcpServers.map((s) => s.name),
                },
                '[Twilio Media Stream] Phone session MCP server not found, using default greeting'
              )
            }
          }

          // Generate personalized greeting message
          let greetingText = 'hi'
          if (hotelName) {
            greetingText = `Hi, thank you for calling ${COMPANY_NAME_FOR_TESTING}, I see you're looking at the ${hotelName}. How can I help?`
          } else {
            greetingText = `Thanks for calling ${COMPANY_NAME_FOR_TESTING}, how can I help you today?`
          }

          twilioTransportLayer.sendMessage(
            {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: greetingText,
                },
              ],
            },
            {}
          )
          logger.info(
            { callId, hasHotelName: !!hotelName },
            '[Twilio Media Stream] Personalized greeting sent'
          )
          setGreetingSent(callId)
        } catch (error) {
          logger.error(
            { error, callId },
            '[Twilio Media Stream] Error sending personalized greeting'
          )
          // Fallback to default greeting
          try {
            twilioTransportLayer.sendMessage(
              {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: 'Thanks for calling Guestreservation.com, how can I help you today?',
                  },
                ],
              },
              {}
            )
            logger.info({ callId }, '[Twilio Media Stream] Default greeting sent (fallback)')
            setGreetingSent(callId)
          } catch (fallbackError) {
            logger.error(
              { error: fallbackError, callId },
              '[Twilio Media Stream] Error sending fallback greeting'
            )
          }
        }
      }

      twilioTransportLayer.on('*', (event) => {
        if (event.type === 'twilio_message') {
          if (!callId) {
            console.log('[Twilio Media Stream] twilio_message event received')
            const twilioMessage = event?.message as any
            callId = twilioMessage?.start?.callSid || ''
          }
        }
      })

      logger.info(
        { callId },
        '[Twilio Media Stream] TwilioRealtimeTransportLayer created immediately'
      )

      // Create agent without MCP servers initially (we'll update it later)
      const agent = frontDeskAgentForPhone([])

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
          { callId, toolNames },
          `[Twilio Media Stream] Available MCP tools: ${toolNames || 'None'}`
        )
      })

      session.on(
        'mcp_tool_call_completed',
        (_context: unknown, _agent: unknown, toolCall: unknown) => {
          logger.info(
            { callId, toolCall },
            '[Twilio Media Stream] MCP tool call completed'
          )
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
      // After session is connected, use shared MCP servers and update agent
      //
      // NOTE: MCP servers are now shared across all sessions (initialized at server startup)
      // This improves performance and reduces resource usage
      session
        .connect({
          apiKey: openAiApiKey,
        })
        .then(async () => {
          logger.info(
            { callId },
            '[Twilio Media Stream] Connected to OpenAI Realtime API immediately'
          )

          // Get shared MCP servers (phone-call-only servers for Twilio)
          const mcpServers = mcpServerManager.getMcpServers(true)

          if (mcpServers.length > 0) {
            const updatedAgent = frontDeskAgentForPhone(mcpServers)
            try {
              await session.updateAgent(updatedAgent)
              logger.info(
                {
                  callId,
                  mcpServerCount: mcpServers.length,
                },
                '[Twilio Media Stream] Agent updated with MCP servers successfully'
              )

              // Send personalized greeting after agent is updated with MCP servers
              // This allows us to get phone session data before sending greeting
              await sendPersonalizedGreeting(session, mcpServers)
            } catch (error) {
              logger.error(
                { error, callId },
                '[Twilio Media Stream] Failed to update agent with MCP servers'
              )
              // Fallback to default greeting if agent update fails
              if (callId && !isGreetingSent(callId)) {
                try {
                  twilioTransportLayer.sendMessage(
                    {
                      type: 'message',
                      role: 'user',
                      content: [
                        {
                          type: 'input_text',
                          text: 'Thanks for calling Guestreservation.com, how can I help you today?',
                        },
                      ],
                    },
                    {}
                  )
                  logger.info({ callId }, '[Twilio Media Stream] Default greeting sent (fallback)')
                  setGreetingSent(callId)
                } catch (fallbackError) {
                  logger.error(
                    { error: fallbackError, callId },
                    '[Twilio Media Stream] Error sending fallback greeting'
                  )
                }
              }
            }
          } else {
            logger.info(
              { callId },
              '[Twilio Media Stream] No MCP servers available, agent remains unchanged'
            )

            // Even without MCP servers, send default greeting immediately
            if (callId && !isGreetingSent(callId)) {
              try {
                twilioTransportLayer.sendMessage(
                  {
                    type: 'message',
                    role: 'user',
                    content: [
                      {
                        type: 'input_text',
                        text: 'Thanks for calling Guestreservation.com, how can I help you today?',
                      },
                    ],
                  },
                  {}
                )
                logger.info({ callId }, '[Twilio Media Stream] Default greeting sent')
                setGreetingSent(callId)
              } catch (error) {
                logger.error(
                  { error, callId },
                  '[Twilio Media Stream] Error sending default greeting'
                )
              }
            }
          }
        })
        .catch((error) => {
          logger.error(
            { error, callId },
            '[Twilio Media Stream] Failed to connect to OpenAI, closing connection'
          )
          ws.close()
        })

      ws.on('close', async () => {
        logger.info(
          { callId },
          '[Twilio Media Stream] WebSocket connection closed'
        )

        try {
          session.close()
          greetingRecord.delete(callId)
          callId = ''
          logger.info(
            { callId },
            '[Twilio Media Stream] RealtimeSession closed'
          )
        } catch (error) {
          logger.error(
            { error, callId },
            '[Twilio Media Stream] Error closing RealtimeSession'
          )
        }

        // Note: MCP servers are shared across all sessions and managed globally
        // They will be closed during server shutdown, not per-session
      })

      ws.on('error', (error) => {
        logger.error(
          { error, callId },
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

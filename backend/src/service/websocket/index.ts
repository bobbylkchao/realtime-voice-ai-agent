import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { WebSocketServer, WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents-realtime'
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions'
import { handleRealtimeVoice, VoiceSessionManager } from '../open-ai'
import { frontDeskAgent } from '../open-ai/agents/front-desk-agent'
import type { RealtimeVoiceEventName, RealtimeVoiceMessage } from './types'
import logger from '../../misc/logger'
import { MCPServerStreamableHttp } from '@openai/agents'
import { mcpServerList } from '../mcp-server'

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

export const initTwilioWebSocketServer = async (httpServer: HttpServer) => {
  if (process.env.TWILIO_ENABLE !== 'true') {
    logger.info('[Twilio] Skip initializing Twilio WebSocket server')
    return
  }

  // Use noServer option and handle upgrade manually to avoid conflicts with Socket.IO
  const wss = new WebSocketServer({
    noServer: true,
  })

  // Handle upgrade only for /media-stream path
  httpServer.on('upgrade', (request, socket, head) => {
    const pathName = new URL(request.url || '', `http://${request.headers.host}`).pathname
    
    logger.info({
      requestUrl: request.url,
      requestHeaders: request.headers,
      pathName,
      request,
    }, '[Twilio Media Stream] Upgrade request received')

    if (pathName === '/media-stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ;(ws as any).request = request
        wss.emit('connection', ws, request)
      })
    }
  })

  wss.on('connection', async (ws: WebSocket, req?: any) => {
    const request = req || (ws as any).request
    const callId = request?.headers?.['x-twilio-call-sid'] as string || 'unknown'
    let callerId: string | undefined
    
    logger.info(
      { callId },
      '[Twilio Media Stream] WebSocket connection established'
    )

    const openAiApiKey = process.env.OPENAI_API_KEY
    if (!openAiApiKey) {
      logger.error({ callId }, '[Twilio Media Stream] OpenAI API key missing')
      ws.close()
      return
    }

    // Speed is the name of the game: Create transport and session IMMEDIATELY
    const twilioTransportLayer = new TwilioRealtimeTransportLayer({
      twilioWebSocket: ws,
    })

    // TODO: to ensure speed, maybe add MCP servers later?
    /*const mcpServers: MCPServerStreamableHttp[] = []
    for (const mcpServerConfig of mcpServerList) {
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
          '[Twilio Media Stream] MCP server connected successfully'
        )
      } catch (mcpError) {
        logger.warn(
          {
            mcpError,
            callId,
            mcpServerName: mcpServerConfig.name,
          },
          '[Twilio Media Stream] Failed to connect to MCP server'
        )
      }
    }*/
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
            speed: 1.2,
          },
        },
      },
    })

    // Listen to transport events to access raw Twilio messages (Tip #2 from docs)
    session.on('transport_event', (event) => {
      if (event.type === 'twilio_message') {
        const message = (event as any).message
        
        // Extract callerId from 'start' event's customParameters
        if (message?.event === 'start' && message?.start?.customParameters) {
          callerId = message.start.customParameters.callerId
          if (callerId) {
            logger.info(
              { callId, callerId },
              '[Twilio Media Stream] Caller ID extracted from start event'
            )
          }
        }
        
        logger.info(
          { callId, callerId, event },
          '[Twilio Media Stream] Raw Twilio message received'
        )
      }
    })

    // Connect IMMEDIATELY
    try {
      await session.connect({
        apiKey: openAiApiKey,
      })
  
      logger.info(
        { callId },
        '[Twilio Media Stream] Connected to OpenAI Realtime API'
      )
    } catch (error) {
      logger.error(
        { error, callId },
        '[Twilio Media Stream] Failed to connect to OpenAI'
      )
      ws.close()
    }

    ws.on('close', () => {
      logger.info({ callId }, '[Twilio Media Stream] WebSocket closed')
      try {
        session.close()
      } catch (error) {
        logger.error(
          { error, callId },
          '[Twilio Media Stream] Error closing session'
        )
      }
    })

    ws.on('error', (error) => {
      logger.error(
        { error, callId },
        '[Twilio Media Stream] WebSocket error'
      )
    })
  })
}

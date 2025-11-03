import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { WebSocketServer, WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents-realtime'
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions'
import { MCPServerStreamableHttp } from '@openai/agents'
import { handleRealtimeVoice, createTwilioVoiceAgentAndSession, VoiceSessionManager } from '../open-ai'
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

  wsServer.on('connection', (socket) => {
    logger.info(`[Websocket] Client connected: ${socket.id}`)

    socket.on('message', (message: RealtimeVoiceMessage) => {
      const eventName = message?.event as RealtimeVoiceEventName
      const eventData = message?.data as ArrayBuffer
      handleRealtimeVoice(eventName, eventData, socket)
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
    logger.info('[Twilio] Skip initializing Twilio')
    return
  }

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/media-stream',
  })

  wss.on('connection', (ws: WebSocket, req) => {
    const callId = req.headers['x-twilio-call-sid'] as string || 'unknown'
    logger.info(
      { callId, remoteAddress: req.socket.remoteAddress },
      '[Twilio Media Stream] WebSocket connection established'
    )

    // IMPORTANT: Create transport layer IMMEDIATELY to handle Twilio protocol messages
    // This must happen synchronously before any async operations
    const twilioTransportLayer = new TwilioRealtimeTransportLayer({
      twilioWebSocket: ws,
    })

    logger.info(
      { callId },
      '[Twilio Media Stream] TwilioRealtimeTransportLayer created immediately'
    )

    let session: RealtimeSession | null = null
    let mcpServers: MCPServerStreamableHttp[] = []

    // Now asynchronously create the session in the background
    createTwilioVoiceAgentAndSession(callId, twilioTransportLayer)
      .then((result) => {
        session = result.session as unknown as RealtimeSession
        mcpServers = result.mcpServers
        logger.info(
          { callId },
          '[Twilio Media Stream] Session created successfully'
        )
      })
      .catch((error) => {
        logger.error(
          { error, callId },
          '[Twilio Media Stream] Failed to create session, closing connection'
        )
        ws.close()
      })

    ws.on('close', async () => {
      logger.info({ callId }, '[Twilio Media Stream] WebSocket connection closed')

      if (session) {
        try {
          session.close()
          logger.info({ callId }, '[Twilio Media Stream] RealtimeSession closed')
        } catch (error) {
          logger.error(
            { error, callId },
            '[Twilio Media Stream] Error closing RealtimeSession'
          )
        }
      }

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

import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import logger from '../../misc/logger'
import { handleRealtimeVoice } from '../open-ai/handle-realtime-voice'
import { RealtimeVoiceEventName, RealtimeVoiceMessage } from './types'
import { VoiceSessionManager } from '../open-ai'

export const initWebSocketServer = (httpServer: HttpServer) => {
  const wsServer = new Server(httpServer, {
    transports: ['websocket'],
    path: '/realtime-voice',
    cors: {
      origin: '*',
    },
  })

  wsServer.on('connection', (socket) => {
    logger.info(`Websocket client connected: ${socket.id}`)

    socket.on('message', (message: RealtimeVoiceMessage) => {
      const eventName = message?.event as RealtimeVoiceEventName
      const eventData = message?.data as ArrayBuffer
      handleRealtimeVoice(eventName, eventData, socket)
    })
  
    socket.on('disconnect', (reason: string) => {
      logger.info(`Websocket client disconnected: ${socket.id}, reason: ${reason}`)
      const sessionManager = new VoiceSessionManager()
      sessionManager.closeUserSession(socket.id)
    })
  })
}

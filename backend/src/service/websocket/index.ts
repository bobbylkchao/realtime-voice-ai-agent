import { Server as HttpServer } from 'http'
import logger from '../../misc/logger'
import { initRealtimeVoiceWebSocketService } from './endpoints/realtime-voice'
import { initMediaStreamWebSocketService } from './endpoints/relatime-phone/media-stream'

export const initWebSocketServer = (httpServer: HttpServer) => {
  initRealtimeVoiceWebSocketService(httpServer)
}

export const initTwilioWebSocketServer = (httpServer: HttpServer) => {
  if (process.env.TWILIO_ENABLE !== 'true') {
    logger.info('[Twilio] Skip initializing Twilio WebSocket server')
    return
  }
  initMediaStreamWebSocketService(httpServer)
}

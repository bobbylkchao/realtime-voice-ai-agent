import { Socket } from 'socket.io'
import { RealtimeVoiceEventName } from '../websocket/types'
import logger from '../../misc/logger'
import { VoiceSessionManager } from '.'

export const handleRealtimeVoice = async (
  eventName: RealtimeVoiceEventName,
  eventData: ArrayBuffer,
  socket: Socket,
): Promise<void> => {
  const voiceSessionManager = new VoiceSessionManager()

  switch (eventName) {
    case 'SESSION_START':
      try {
        voiceSessionManager.createUserSession(socket)
        socket.emit('message', {
          event: 'SESSION_START_SUCCESS',
          data: null,
        })
      } catch (error) {
        logger.error({ error, clientId: socket.id }, '❌ Error occurred while creating Voice Session')
        socket.emit('message', {
          event: 'SESSION_START_ERROR',
          data: null,
        })
      }
      break
    case 'SESSION_END':
      try {
        voiceSessionManager.closeUserSession(socket.id)
        socket.emit('message', {
          event: 'SESSION_END_SUCCESS',
          data: null,
        })
      } catch (error) {
        logger.error({ error, clientId: socket.id }, '❌ Error occurred while closing Voice Session')
        socket.emit('message', {
          event: 'SESSION_END_ERROR',
          data: null,
        })
      }
      break
    case 'USER_AUDIO_CHUNK':
      const session = voiceSessionManager.getUserSession(socket.id)
      if (session) {
        session.sendAudio(eventData)
      }
      break
    default:
      break
  }
}

import { RealtimeAgent, RealtimeSession, TransportLayerAudio } from '@openai/agents-realtime'
import logger from '../../misc/logger'
import { Socket } from 'socket.io'

const sessions: Map<string, RealtimeSession> = new Map()

const createOpenAiVoiceAgentAndSession = async (
  clientId: string,
  socket: Socket,
): Promise<RealtimeSession | null> => {
  try {
    const openAiApiKey = process.env.OPENAI_API_KEY

    if (!openAiApiKey) {
      throw new Error(
        `OpenAI Realtime API Key is missing, please check the .env file! Client ID: ${clientId}`
      )
    }
  
    const openAiVoiceAgent = new RealtimeAgent({
      name: 'Realtime Voice Agent',
      voice: 'alloy',
      instructions: 'You are a helpful assistant that can answer questions and help with tasks.',
    })
  
    /**
     * VAD part, refer to https://platform.openai.com/docs/guides/realtime-vad
     * The PCM audio format. Only a 24kHz sample rate is supported.
     */
    const openAiVoiceSession = new RealtimeSession(openAiVoiceAgent, {
      model: process.env.OPENAI_VOICE_MODEL || 'gpt-realtime',
      config: {
        audio: {
          input: {
            turnDetection: {
              type: 'server_vad',
              create_response: true,
              interrupt_response: true,
            },
            format: {
              rate: 24000,
              type: 'audio/pcm',
            },
            transcription: {
              language: 'en',
              model: 'gpt-4o-mini-transcribe',
            },
          },
          output: {
            format: 'pcm16',
          },
        },
      },
    })

    await openAiVoiceSession.connect({
      apiKey: openAiApiKey,
    })

    // Set up comprehensive event listeners for debugging
    /*openAiVoiceSession.on('transport_event', (event) => {
      // Handle audio data from OpenAI Voice Agent
      if (event.type === 'response.output_audio.delta' && event.delta) {
        logger.info({ 
          eventType: event.type, 
          deltaLength: event.delta.length, 
          clientId 
        }, '🔊 Received audio delta from OpenAI Voice Agent.')
        
        // TODO: Forward audio to connected WebSocket clients
        // The audio data is in event.delta as base64 encoded PCM data
        // This will be handled in the WebSocket server
      }
    })*/

    openAiVoiceSession.on('audio', (event: TransportLayerAudio) => {
      logger.info('🎵 Audio is generated')
      socket.emit('message', {
        event: 'USER_AUDIO_CHUNK',
        data: event.data,
      })
    })

    openAiVoiceSession.on('audio_start', (context, agent) => {
      logger.info({ clientId }, '🎵 Audio generation started')
    })

    openAiVoiceSession.on('audio_stopped', (context, agent) => {
      logger.info({ clientId }, '🎵 Audio generation stopped')
    })

    openAiVoiceSession.on('audio_interrupted', (context, agent) => {
      logger.info({ clientId }, '⏹️ Audio was interrupted')
    })

    openAiVoiceSession.on('turn_started', (event) => {
      logger.info({ event, clientId }, '🔄 Turn started - model is generating response')
    })

    openAiVoiceSession.on('turn_done', (event) => {
      logger.info({ event, clientId }, '✅ Turn completed - model finished response')
    })

    openAiVoiceSession.on('error', (error) => {
      logger.error({ error, clientId }, '❌ Session error occurred')
    })

    openAiVoiceSession.on('connection_change', (status) => {
      logger.info({ status, clientId }, '🔌 Connection status changed')
    })

    logger.info({ clientId }, '✅  OpenAI Voice Agent Session created.')

    return openAiVoiceSession
  } catch (error) {
    logger.error({ error, clientId }, 'Error occurred while initializing OpenAI Voice Agent.')
    return null
  }
}

// Session manager for multiple users
export class VoiceSessionManager {
  async createUserSession(socket: Socket): Promise<RealtimeSession> {
    const clientId = socket.id
    const session = await createOpenAiVoiceAgentAndSession(clientId, socket)
    if (!session) {
      throw new Error('Failed to create OpenAI Voice Session')
    }
    sessions.set(clientId, session)
    return session
  }
  
  getUserSession(clientId: string): RealtimeSession {
    const session = sessions.get(clientId)
    if (!session) {
      throw new Error('OpenAI Voice Session not found')
    }
    return session
  }
  
  closeUserSession(clientId: string): void {
    try {
      const session = sessions.get(clientId)
      if (session) {
        session.close()
      }
      sessions.delete(clientId)
    } catch (error) {
      throw error
    }
  }
}

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
      voice: 'cedar',
      instructions: `
        1. You are a helpful AI assistant that can help customer make trip bookings.
        2. Your name is Bobby.
        3. Do not answer any questions that are not related to trip bookings or travel related questions.
        4. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
      `,
    })
  
    /**
     * VAD part, refer to https://platform.openai.com/docs/guides/realtime-vad
     * The PCM audio format. Only a 24kHz sample rate is supported.
     * 
     * The rest of configuration please refer to:
     * https://platform.openai.com/docs/api-reference/realtime-client-events/session/update
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
              silence_duration_ms: 1500,
            },
            format: {
              rate: 24000,
              type: 'audio/pcm',
            },
            transcription: {
              model: 'gpt-4o-mini-transcribe',
            },
          },
          output: {
            format: {
              rate: 24000,
              type: 'audio/pcm',
            },
            speed: 1.0,
            voice: 'cedar',
          },
        },
      },
    })

    await openAiVoiceSession.connect({
      apiKey: openAiApiKey,
    })

    openAiVoiceSession.on('transport_event', (event) => {
      // User's audio transcript
      if (
        event.type === 'conversation.item.input_audio_transcription.completed' &&
        event.transcript
      ) {
        socket.emit('message', {
          event: 'USER_AUDIO_TRANSCRIPT',
          data: event.transcript,
        })
      }

      // Agent's audio transcript
      if (
        event.type === 'response.output_audio_transcript.done' &&
        event.transcript
      ) {
        socket.emit('message', {
          event: 'ASSISTANT_AUDIO_TRANSCRIPT',
          data: event.transcript,
        })
      }
    })

    openAiVoiceSession.on('audio', (event: TransportLayerAudio) => {
      socket.emit('message', {
        event: 'ASSISTANT_AUDIO_CHUNK',
        data: event.data,
      })
    })

    openAiVoiceSession.on('audio_interrupted', (context, agent) => {
      logger.info({ clientId }, 'Audio was interrupted')
    })

    openAiVoiceSession.on('turn_started', (event) => {
      logger.info({ event, clientId }, 'Turn started - model is generating response')
    })

    openAiVoiceSession.on('turn_done', (event) => {
      logger.info({ event, clientId }, 'Turn completed - model finished response')
    })

    openAiVoiceSession.on('error', (error) => {
      logger.error({ error, clientId }, 'Session error occurred')
    })

    openAiVoiceSession.on('connection_change', (status) => {
      logger.info({ status, clientId }, 'Connection status changed')
    })

    logger.info({ clientId }, 'OpenAI Voice Agent Session created.')

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
  
  getUserSession(clientId: string): RealtimeSession | undefined {
    return sessions.get(clientId)
  }
  
  closeUserSession(clientId: string): void {
    try {
      const session = sessions.get(clientId)
      if (session) {
        logger.info({ clientId }, 'Closing OpenAI Voice Session')
        session.close()
      }
      sessions.delete(clientId)
      logger.info({ sessions }, 'All sessions list')
    } catch (error) {
      throw error
    }
  }
}

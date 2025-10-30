import { RealtimeAgent, RealtimeSession, TransportLayerAudio } from '@openai/agents-realtime'
import logger from '../../misc/logger'
import { Socket } from 'socket.io'
import { MCPServerStreamableHttp, withTrace } from '@openai/agents'

const sessions: Map<string, RealtimeSession> = new Map()
const mcpServers: Map<string, MCPServerStreamableHttp> = new Map()

const createOpenAiVoiceAgentAndSession = async (
  clientId: string,
  socket: Socket,
): Promise<RealtimeSession | null> => {
  return withTrace('createOpenAiVoiceAgentAndSession', async () => {
    try {
      const openAiApiKey = process.env.OPENAI_API_KEY

      if (!openAiApiKey) {
        throw new Error(
          `OpenAI Realtime API Key is missing, please check the .env file! Client ID: ${clientId}`
        )
      }
  
      // Create MCP server connection
      let mcpServer: MCPServerStreamableHttp | null = null
      try {
        mcpServer = new MCPServerStreamableHttp({
          url: 'http://localhost:4000/mcp',
          name: 'Local MCP Server',
        })

        // Connect to MCP server
        await mcpServer.connect()
        
        // Store MCP server connection for later closing
        mcpServers.set(clientId, mcpServer)
        logger.info({ clientId }, '[OpenAI Voice Agent] MCP server connected successfully')
      } catch (mcpError) {
        logger.warn({ mcpError, clientId }, '[OpenAI Voice Agent] Failed to connect to MCP server, continuing without MCP tools')
        mcpServer = null
      }

      logger.info({ clientId, hasMcpServer: !!mcpServer }, '[OpenAI Voice Agent] Creating RealtimeAgent')
      
      const openAiVoiceAgent = new RealtimeAgent({
        name: 'Realtime Voice Agent',
        voice: 'cedar',
        instructions: `
          1. You are a helpful AI assistant that can help customer make trip bookings.
          2. Your name is Bobby.
          3. Do not answer any questions that are not related to trip bookings or travel related questions or destination city weather.
          4. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
          ${mcpServer ? '5. You have access to tools to search for hotels and get weather information for destinations.' : ''}
        `,
        mcpServers: mcpServer ? [mcpServer] : []
      })
      
      logger.info({ clientId }, '[OpenAI Voice Agent] RealtimeAgent created successfully')
      
      /**
       * VAD part, refer to https://platform.openai.com/docs/guides/realtime-vad
       * The PCM audio format. Only a 24kHz sample rate is supported.
       * 
       * The rest of configuration please refer to:
       * https://platform.openai.com/docs/api-reference/realtime-client-events/session/update
       */
      logger.info({ clientId }, '[OpenAI Voice Agent] Creating RealtimeSession')
      
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

      logger.info({ clientId }, '[OpenAI Voice Session] Connecting to OpenAI Realtime API')
      
      await openAiVoiceSession.connect({
        apiKey: openAiApiKey,
      })
      
      logger.info({ clientId }, '[OpenAI Voice Session] Connected to OpenAI Realtime API successfully')

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
        logger.info({ clientId }, '[OpenAI Voice Session] Audio was interrupted')
      })

      openAiVoiceSession.on('turn_started', (event) => {
        logger.info({ event, clientId }, '[OpenAI Voice Session] Turn started - model is generating response')
      })

      openAiVoiceSession.on('turn_done', (event) => {
        logger.info({ event, clientId }, '[OpenAI Voice Session] Turn completed - model finished response')
      })

      openAiVoiceSession.on('error', (error) => {
        logger.error({ error, clientId }, '[OpenAI Voice Session] Session error occurred')
      })

      openAiVoiceSession.on('connection_change', (status) => {
        logger.info({ status, clientId }, '[OpenAI Voice Session] Connection status changed')
      })

      logger.info({ clientId }, '[OpenAI Voice Session] OpenAI Voice Session created.')

      return openAiVoiceSession
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error({ error, clientId, errorMessage, errorStack }, '[OpenAI Voice Session] Error occurred while initializing OpenAI Voice Session.')
      return null
    }
  })
}

// Session manager for multiple users
export class VoiceSessionManager {
  async createUserSession(socket: Socket): Promise<RealtimeSession> {
    const clientId = socket.id
    const session = await createOpenAiVoiceAgentAndSession(clientId, socket)
    if (!session) {
      throw new Error('[Voice Session Manager] Failed to create OpenAI Voice Session')
    }
    sessions.set(clientId, session)
    return session
  }
  
  getUserSession(clientId: string): RealtimeSession | undefined {
    return sessions.get(clientId)
  }
  
  async closeUserSession(clientId: string): Promise<void> {
    try {
      const session = sessions.get(clientId)
      if (session) {
        logger.info({ clientId }, '[Voice Session Manager] Closing OpenAI Voice Session')
        session.close()
      }

      const mcpServer = mcpServers.get(clientId)
      if (mcpServer) {
        logger.info({ clientId }, '[Voice Session Manager] Closing MCP Server connection')
        try {
          await mcpServer.close()
        } catch (closeError) {
          logger.error({ closeError, clientId }, '[Voice Session Manager] Error closing MCP server connection')
        }
        mcpServers.delete(clientId)
      }
      
      sessions.delete(clientId)
    } catch (error) {
      throw error
    }
  }
}

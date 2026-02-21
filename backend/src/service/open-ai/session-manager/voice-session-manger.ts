import { RealtimeSession, TransportLayerAudio } from '@openai/agents-realtime'
import { MCPServerStreamableHttp, withTrace } from '@openai/agents'
import { Socket } from 'socket.io'
import { mcpServerList } from '../../mcp-server'
import logger from '../../../misc/logger'
import { frontDeskAgent } from '../agents/realtime-voice/front-desk-agent'

const sessions = new Map<string, RealtimeSession>()
const mcpServers: Map<string, MCPServerStreamableHttp[]> = new Map()

const createOpenAiVoiceAgentAndSession = async (
  clientId: string,
  socket: Socket
) => {
  return withTrace('createOpenAiVoiceAgentAndSession', async () => {
    try {
      const openAiApiKey = process.env.OPENAI_API_KEY

      if (!openAiApiKey) {
        throw new Error(
          `OpenAI Realtime API Key is missing, please check the .env file! Client ID: ${clientId}`
        )
      }

      // Create MCP server connections
      for (const mcpServerConfig of mcpServerList) {
        try {
          if (mcpServerConfig.phoneCallOnly) {
            continue
          }
          const mcpServer = new MCPServerStreamableHttp({
            url: mcpServerConfig.url,
            name: mcpServerConfig.name,
          })
          await mcpServer.connect()
          mcpServers.set(clientId, [
            ...(mcpServers.get(clientId) || []),
            mcpServer,
          ])
          logger.info(
            {
              clientId,
              mcpServerName: mcpServerConfig.name,
            },
            '[OpenAI Voice Agent] MCP server connected successfully'
          )
        } catch (mcpError) {
          logger.warn(
            {
              mcpError,
              clientId,
              mcpServerName: mcpServerConfig.name,
            },
            '[OpenAI Voice Agent] Failed to connect to MCP server'
          )
        }
      }

      /**
       * VAD part, refer to https://platform.openai.com/docs/guides/realtime-vad
       * The PCM audio format. Only a 24kHz sample rate is supported.
       *
       * The rest of configuration please refer to:
       * https://platform.openai.com/docs/api-reference/realtime-client-events/session/update
       */
      logger.info({ clientId }, '[OpenAI Voice Agent] Creating RealtimeSession')

      const openAiVoiceSession = new RealtimeSession(
        frontDeskAgent(mcpServers.get(clientId) || []),
        {
          model: process.env.OPENAI_MODEL || 'gpt-realtime',
          config: {
            audio: {
              input: {
                turnDetection: {
                  type: 'server_vad',
                  create_response: true,
                  interrupt_response: true,
                  silence_duration_ms: 2000,
                },
                format: {
                  rate: 24000,
                  type: 'audio/pcm',
                },
                transcription: {
                  language: 'en',
                  model: 'gpt-4o-transcribe',
                  prompt: 'This is the conversation between a user and an AI trip booking assistant. The language of the audio is English.',
                },
              },
              output: {
                format: {
                  rate: 24000,
                  type: 'audio/pcm',
                },
                speed: 1.2,
              },
            },
          },
        },
      )

      logger.info(
        { clientId },
        '[OpenAI Voice Session] Connecting to OpenAI Realtime API'
      )

      await openAiVoiceSession.connect({
        apiKey: openAiApiKey,
      })

      logger.info(
        { clientId },
        '[OpenAI Voice Session] Connected to OpenAI Realtime API successfully'
      )

      openAiVoiceSession.on('transport_event', (event) => {
        // User's audio transcript
        if (
          event.type ===
            'conversation.item.input_audio_transcription.completed' &&
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

      openAiVoiceSession.on('audio_interrupted', (_context, _agent) => {
        logger.info(
          { clientId },
          '[OpenAI Voice Session] Audio was interrupted'
        )
      })

      openAiVoiceSession.on('turn_started', (event) => {
        logger.info(
          { event, clientId },
          '[OpenAI Voice Session] Turn started - model is generating response'
        )
      })

      openAiVoiceSession.on('turn_done', (event) => {
        logger.info(
          { event, clientId },
          '[OpenAI Voice Session] Turn completed - model finished response'
        )
      })

      openAiVoiceSession.on('error', (error) => {
        logger.error(
          { error, clientId },
          '[OpenAI Voice Session] Session error occurred'
        )
      })

      openAiVoiceSession.on('connection_change', (status) => {
        logger.info(
          { status, clientId },
          '[OpenAI Voice Session] Connection status changed'
        )
      })

      logger.info(
        { clientId },
        '[OpenAI Voice Session] OpenAI Voice Session created.'
      )

      return openAiVoiceSession
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error(
        { error, clientId, errorMessage, errorStack },
        '[OpenAI Voice Session] Error occurred while initializing OpenAI Voice Session.'
      )
      return null
    }
  })
}

// Session manager for multiple users
export class VoiceSessionManager {
  async createUserSession(socket: Socket) {
    const clientId = socket.id
    const session = await createOpenAiVoiceAgentAndSession(clientId, socket)
    if (!session) {
      throw new Error(
        '[Voice Session Manager] Failed to create OpenAI Voice Session'
      )
    }
    sessions.set(clientId, session as RealtimeSession)
    return session
  }

  getUserSession(clientId: string): RealtimeSession | undefined {
    return sessions.get(clientId)
  }

  async closeUserSession(clientId: string): Promise<void> {
    const session = sessions.get(clientId)
    if (session) {
      logger.info(
        { clientId },
        '[Voice Session Manager] Closing OpenAI Voice Session'
      )
      session.close()
    }

    const getMcpServers = mcpServers.get(clientId)
    if (getMcpServers) {
      for (const mcpServer of getMcpServers) {
        await mcpServer.close()
        logger.info(
          {
            clientId,
            mcpServerName: mcpServer.name,
          },
          '[Voice Session Manager] MCP server closed successfully'
        )
      }
      mcpServers.delete(clientId)
    }

    sessions.delete(clientId)
  }
}

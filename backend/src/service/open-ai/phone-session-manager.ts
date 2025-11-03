import { WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents-realtime'
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions'
import { MCPServerStreamableHttp, withTrace } from '@openai/agents'
import { mcpServerList } from '../mcp-server'
import { frontDeskAgent } from '../open-ai/agents/front-desk-agent'
import logger from '../../misc/logger'

export const createTwilioVoiceAgentAndSession = async (
  callId: string,
  twilioTransportLayer: TwilioRealtimeTransportLayer
) => {
  return withTrace('createTwilioVoiceAgentAndSession', async () => {
    try {
      const openAiApiKey = process.env.OPENAI_API_KEY

      if (!openAiApiKey) {
        throw new Error(
          `OpenAI Realtime API Key is missing, please check the .env file! Caller ID: ${callId}`
        )
      }

      const mcpServers: MCPServerStreamableHttp[] = []
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
      }

      logger.info({ callId }, '[Twilio Media Stream] Creating RealtimeSession')

      const agent = frontDeskAgent(mcpServers)

      // Create RealtimeSession with provided Twilio transport layer
      const session = new RealtimeSession(agent, {
        transport: twilioTransportLayer,
        model: process.env.OPENAI_VOICE_MODEL || 'gpt-realtime',
        config: {
          audio: {
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
        'tool_approval_requested',
        (_context: unknown, _agent: unknown, approvalRequest: any) => {
          logger.info(
            {
              callId,
              toolName: approvalRequest.approvalItem.rawItem.name,
            },
            '[Twilio Media Stream] Tool approval requested'
          )
          // Auto-approve for now, you can add manual approval logic later if needed
          session
            .approve(approvalRequest.approvalItem)
            .catch((error: unknown) =>
              logger.error(
                { error, callId },
                '[Twilio Media Stream] Failed to approve tool call'
              )
            )
        }
      )

      session.on(
        'mcp_tool_call_completed',
        (_context: unknown, _agent: unknown, toolCall: unknown) => {
          logger.info({ callId, toolCall }, '[Twilio Media Stream] MCP tool call completed')
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

      // Connect to OpenAI Realtime API
      await session.connect({
        apiKey: openAiApiKey,
      })

      logger.info(
        { callId },
        '[Twilio Media Stream] Connected to OpenAI Realtime API successfully'
      )

      return { session, mcpServers }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error(
        { error, callId, errorMessage, errorStack },
        '[Twilio Media Stream] Error occurred while initializing RealtimeSession'
      )
      throw error
    }
  })
}

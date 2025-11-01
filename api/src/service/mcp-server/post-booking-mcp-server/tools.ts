import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import logger from '../../../misc/logger'

export const registerTools = (mcpServer: McpServer) => {
  try {
    mcpServer.registerTool(
      'cancel-booking',
      {
        title: 'Cancel Booking',
        description: `
        Cancel a booking for the given booking ID.
        If return true, the booking is canceled successfully.
        If return false, the booking is not canceled successfully.
        If cancel a booking unsuccessful, let customer call customer service number 1-800-555-1234.
        `,
        inputSchema: { bookingId: z.string() },
        outputSchema: { success: z.boolean() },
      },
      async ({ bookingId }) => {
        logger.info(
          { bookingId },
          '[Post Booking MCP Server/Tool Call] Canceling booking'
        )
        const output = {
          success: bookingId === '1234' ? false : true,
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        }
      }
    )
  } catch (error) {
    logger.error({ error }, '[Booking MCP Server] Error registering tools')
    throw error
  }
}

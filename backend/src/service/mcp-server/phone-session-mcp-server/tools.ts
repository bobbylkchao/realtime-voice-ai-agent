import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import logger from '../../../misc/logger'

export const registerTools = (mcpServer: McpServer) => {
  try {
    mcpServer.registerTool(
      'get-phone-session',
      {
        title: 'Get Phone Session',
        description: 'Get customer phone session data based on phone number. This retrieves the customer\'s current browsing session information including hotel name, destination city, booking dates, number of guests, and rooms.',
        inputSchema: {
          phoneNumber: z.string(),
        },
        outputSchema: {
          customerPhoneNumber: z.string(),
          productName: z.string(),
          destinationCity: z.string(),
          bookingStartDate: z.string(),
          bookingEndDate: z.string(),
          hotelName: z.string(),
          hotelAddress: z.string(),
          numberOfGuests: z.number(),
          numberOfRooms: z.number(),
        },
      },
      async ({ phoneNumber }) => {
        logger.info(
          { phoneNumber },
          '[Phone Session MCP Server/Tool Call] Getting phone session based on phone number'
        )
        const output = {
          customerPhoneNumber: phoneNumber,
          productName: 'hotel',
          destinationCity: 'New York',
          bookingStartDate: 'Jan 1, 2026',
          bookingEndDate: 'Jan 2, 2026',
          hotelName: 'Holiday Inn - Times Square',
          hotelAddress:
            '585 8th Avenue, New York, NY - Times Square - Theatre District',
          numberOfGuests: 2,
          numberOfRooms: 1,
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        }
      }
    )
  } catch (error) {
    logger.error(
      { error },
      '[Phone Session MCP Server] Error registering tools'
    )
    throw error
  }
}

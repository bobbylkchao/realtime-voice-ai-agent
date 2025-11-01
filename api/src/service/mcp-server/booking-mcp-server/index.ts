import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Express } from 'express'
import logger from '../../../misc/logger'
import { registerTools } from './tools'

export const initBookingMcpServer = (app: Express, port: number) => {
  try {
    const server = new McpServer({
      name: 'booking-mcp-server',
      version: '1.0.0',
    })

    registerTools(server)

    app.post('/booking-mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })

      res.on('close', () => {
        transport.close()
      })

      try {
        await server.connect(transport)
      } catch (error) {
        logger.error(
          { error },
          '[Booking MCP Server] Error connecting to MCP server'
        )
        res.status(500).json({ error: 'Internal server error' })
        return
      }

      await transport.handleRequest(req, res, req.body)
    })

    logger.info(
      `[Server] Booking MCP Server ready at: http://localhost:${port}/booking-mcp`
    )
  } catch (error) {
    logger.error(
      { error },
      '[Booking MCP Server] Error initializing MCP server'
    )
  }
}

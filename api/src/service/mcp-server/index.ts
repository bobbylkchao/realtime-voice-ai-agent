import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Express } from 'express'
import logger from '../../misc/logger'
import { registerTools } from './register-tools'

export const initMcpServer = (app: Express) => {
  const server = new McpServer({
    name: 'mcp-server',
    version: '1.0.0'
  })

  registerTools(server)

  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    })

    res.on('close', () => {
      transport.close()
    })

    try {
      await server.connect(transport)
    } catch (error) {
      logger.error({ error }, '[MCP Server] Error connecting to MCP server')
      res.status(500).json({ error: 'Internal server error' })
      return
    }

    await transport.handleRequest(req, res, req.body)
  })
}

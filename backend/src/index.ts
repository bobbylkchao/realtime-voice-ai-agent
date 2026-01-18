import express from 'express'
import { config } from 'dotenv'
import { createServer } from 'http'
import logger from './misc/logger'
import {
  initTwilioWebSocketServer,
  initWebSocketServer,
} from './service/websocket'
import { initMcpServers } from './service/mcp-server'
import { mcpServerManager } from './service/mcp-server/manager'
import { initTwilioHttpRoute } from './service/twilio/http-route'

config()

const startServices = async () => {
  const PORT = Number(process.env.PORT) || 4000
  const IS_TWILIO_ENABLE = process.env.TWILIO_ENABLE === 'true'
  const TWILIO_WEBHOOK_URL = process.env.TWILIO_WEBHOOK_URL

  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  const httpServer = createServer(app)

  // Initialize MCP server HTTP endpoints first
  initMcpServers(app, PORT)

  initTwilioHttpRoute(app)
  initWebSocketServer(httpServer)
  initTwilioWebSocketServer(httpServer)

  // Start HTTP server first, then initialize MCP server connections
  // MCP clients need the HTTP server to be listening before they can connect
  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, () => {
      logger.info(`[Server] HTTP Server ready at: http://localhost:${PORT}`)
      logger.info(
        `[Server] Websocket Server ready at: ws://localhost:${PORT}/realtime-voice`
      )

      if (IS_TWILIO_ENABLE) {
        logger.info(
          `[Server] Twilio Media Stream ready at: ${TWILIO_WEBHOOK_URL}`
        )
      }

      resolve()
    })
  })

  // Initialize MCP server connections after HTTP server is listening
  // This ensures the MCP server endpoints are available when clients try to connect
  // If any MCP server fails to connect, the server will not start
  await mcpServerManager.initialize()
  logger.info('[Server] MCP server connections initialized successfully')

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('[Server] Shutting down gracefully...')
    await mcpServerManager.closeAll()
    httpServer.close(() => {
      logger.info('[Server] HTTP server closed')
      process.exit(0)
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

startServices().catch((err) => {
  logger.error({ err }, '[Server] Application start failed due to error')
  process.exit(1)
})

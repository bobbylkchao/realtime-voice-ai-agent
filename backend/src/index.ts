import express from 'express'
import { config } from 'dotenv'
import { createServer } from 'http'
import logger from './misc/logger'
import { initWebSocketServer } from './service/websocket'
import { initMcpServers } from './service/mcp-server'

config()

const startServices = async () => {
  const PORT = Number(process.env.PORT) || 4000
  const app = express()
  app.use(express.json())
  const httpServer = createServer(app)
  initWebSocketServer(httpServer)
  initMcpServers(app, PORT)

  httpServer.listen(PORT, () => {
    logger.info(`[Server] HTTP Server ready at: http://localhost:${PORT}`)
    logger.info(
      `[Server] Websocket Server ready at: ws://localhost:${PORT}/realtime-voice`
    )
  })
}

try {
  startServices()
} catch (err) {
  logger.error({ err }, '[Server] Application start failed due to error')
}

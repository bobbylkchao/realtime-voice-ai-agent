import express from 'express'
import { config } from 'dotenv'
import { createServer } from 'http'
import logger from './misc/logger'
import { initWebSocketServer } from './service/websocket'

config()

const startServices = async () => {
  const PORT = process.env.PORT || 4000
  const app = express()
  app.use(express.json())
  const httpServer = createServer(app)
  initWebSocketServer(httpServer)

  httpServer.listen(PORT, () => {
    logger.info(`🚀  HTTP Server ready at: http://localhost:${PORT}`)
    logger.info(`🚀  Websocket Server ready at: ws://localhost:${PORT}/realtime-voice`)
  })
}

try {
  startServices()
} catch (err) {
  logger.error({ err }, 'Application start failed due to error')
}

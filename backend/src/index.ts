import express from 'express'
import { config } from 'dotenv'
import { createServer } from 'http'
import logger from './misc/logger'
import { initTwilioWebSocketServer, initWebSocketServer } from './service/websocket'
import { initMcpServers } from './service/mcp-server'
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

  initTwilioHttpRoute(app)
  initWebSocketServer(httpServer)
  initMcpServers(app, PORT)
  initTwilioWebSocketServer(httpServer)

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
  })
}

try {
  startServices()
} catch (err) {
  logger.error({ err }, '[Server] Application start failed due to error')
}

/**
 * HTTP routes for Amazon Connect External Voice Transfer
 * Handles configuration and callbacks from Amazon Connect
 */

import type { Express } from 'express'
import logger from '../../misc/logger'

export const initAmazonConnectHttpRoute = (app: Express) => {
  if (process.env.AMAZONCONNECT_ENABLE !== 'true') {
    logger.info('[Amazon Connect] Skip initializing Amazon Connect HTTP routes')
    return
  }

  /**
   * Health check endpoint for Amazon Connect External Voice Transfer
   */
  app.get('/amazon-connect/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'amazon-connect-sip-server',
      timestamp: new Date().toISOString(),
    })
  })

  /**
   * SIP endpoint information endpoint
   * Amazon Connect can use this to discover SIP server details
   */
  app.get('/amazon-connect/sip-endpoint', (_req, res) => {
    const sipHost = process.env.AMAZON_CONNECT_SIP_HOST || 'localhost'
    const sipPort = process.env.AMAZON_CONNECT_SIP_PORT || 5060
    const sipDomain = process.env.AMAZON_CONNECT_SIP_DOMAIN || 'sip.example.com'
    const sipUsername = process.env.AMAZON_CONNECT_SIP_USERNAME || 'ai-agent'

    res.json({
      sipUri: `sip:${sipUsername}@${sipDomain}:${sipPort}`,
      host: sipHost,
      port: sipPort,
      domain: sipDomain,
      username: sipUsername,
      transport: 'UDP', // or TCP, TLS
    })
  })

  /**
   * Callback endpoint for Amazon Connect External Voice Transfer events
   * This can be used to receive call metadata and events
   */
  app.post('/amazon-connect/callback', (req, res) => {
    logger.info(
      {
        body: req.body,
        headers: req.headers,
      },
      '[Amazon Connect] Received callback from Amazon Connect'
    )

    // Handle different event types
    const eventType = req.body?.EventType || req.body?.eventType

    switch (eventType) {
      case 'CALL_STARTED':
      case 'call-started':
        logger.info(
          { contactId: req.body?.ContactId, eventType },
          '[Amazon Connect] Call started event'
        )
        break

      case 'CALL_ENDED':
      case 'call-ended':
        logger.info(
          { contactId: req.body?.ContactId, eventType },
          '[Amazon Connect] Call ended event'
        )
        break

      default:
        logger.info(
          { eventType, body: req.body },
          '[Amazon Connect] Unknown event type'
        )
    }

    res.status(200).json({ status: 'ok' })
  })

  logger.info('[Amazon Connect] HTTP routes initialized')
}




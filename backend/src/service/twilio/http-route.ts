import type { Express } from 'express'
import logger from '../../misc/logger'

export const initTwilioHttpRoute = (app: Express) => {
  if (process.env.TWILIO_ENABLE !== 'true' || !process.env.TWILIO_WEBHOOK_URL) {
    logger.info('[Twilio] Skip initializing Twilio')
    return
  }

  app.all('/incoming-call', (req, res) => {
    const mediaStreamUrl = process.env.TWILIO_WEBHOOK_URL
    
    const twimlResponse = `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hi, No phone agents available at this moment. I am your AI agent and I can try to help you. How can I assist you today?</Say>
  <Connect>
    <Stream url="${mediaStreamUrl}" />
  </Connect>
</Response>`.trim()

    logger.info(
      {
        mediaStreamUrl,
        callerId: req.body?.From || req.query?.From,
      },
      '[Twilio] Incoming call received'
    )

    res.type('text/xml').send(twimlResponse)
    logger.info('[Twilio] TwiML response sent, connecting to media stream')
  })
}

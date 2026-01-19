import type { Express } from 'express'
import logger from '../../misc/logger'

export const initTwilioHttpRoute = (app: Express) => {
  if (process.env.TWILIO_ENABLE !== 'true' || !process.env.TWILIO_WEBHOOK_HOST) {
    logger.info('[Twilio] Skip initializing Twilio')
    return
  }

  app.all('/incoming-call', (req, res) => {
    const mediaStreamUrl = process.env.TWILIO_WEBHOOK_HOST

    const twimlResponse = `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
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

import type { Express } from 'express'
import logger from '../../misc/logger'

export const initTwilioHttpRoute = (app: Express) => {
  if (process.env.TWILIO_ENABLE !== 'true' || !process.env.TWILIO_WEBHOOK_URL) {
    logger.info('[Twilio] Skip initializing Twilio')
    return
  }

  app.all('/incoming-call', (req, res) => {
    const mediaStreamUrl = process.env.TWILIO_WEBHOOK_URL
    const callerId = req.body?.From || req.query?.From
    
    // Use <Parameter> element instead of query string
    // Query parameters are not supported in Twilio Stream URL
    // Parameters will be available in WebSocket 'start' event's customParameters
    const twimlResponse = `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Salli">
    <prosody rate="fast">Hi, thanks for calling. I'm your AI phone agent. How can I help with your trip today?</prosody>
  </Say>
  <Connect>
    <Stream url="${mediaStreamUrl}">
      <Parameter name="callerId" value="${callerId || ''}" />
    </Stream>
  </Connect>
</Response>`.trim()

    logger.info(
      {
        callerId,
      },
      '[Twilio] Incoming call received'
    )

    res.type('text/xml').send(twimlResponse)
    logger.info({
      mediaStreamUrl,
      callerId,
    }, '[Twilio] TwiML response sent, connecting to media stream')
  })
}

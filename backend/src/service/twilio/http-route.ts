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
  <Connect>
    <Stream url="${mediaStreamUrl}" />
  </Connect>
</Response>`.trim()

    const callInfo = {
      customerPhoneNumber: req.body?.Caller || '',
      systemPhoneNumber: req.body?.Called || '',
      customerPhoneCity: req.body?.CallerCity || '',
      customerPhoneState: req.body?.CallerState || '',
      customerPhoneCountry: req.body?.CallerCountry || '',
      callSid: req.body?.CallSid || '',
    }

    logger.info(
      {
        mediaStreamUrl,
        callInfo,
      },
      '[Twilio] Incoming call received'
    )

    res.type('text/xml').send(twimlResponse)
    logger.info('[Twilio] TwiML response sent, connecting to media stream')
  })
}

import { RealtimeAgent } from '@openai/agents-realtime'

export const flightBookingAgent = (): RealtimeAgent => {
  return new RealtimeAgent({
    name: 'Flight Booking Agent',
    voice: 'cedar',
    instructions: `
      1. You are a helpful AI assistant that can help customer make flight bookings.
      2. Do not answer any questions that are not related to flight bookings or flight related questions or destination city weather.
      3. Transfer to Front Desk Agent if the customer requests bookings other than flight, such as hotels or car rentals.
      4. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    `,
  })
}

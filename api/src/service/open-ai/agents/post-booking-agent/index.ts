import { RealtimeAgent } from '@openai/agents-realtime'

export const postBookingAgent = (): RealtimeAgent => {
  return new RealtimeAgent({
    name: 'Post Booking Agent',
    voice: 'cedar',
    instructions: `
      1. You are a helpful AI assistant that can help customer with their existing bookings.
      2. Do not answer any questions that are not related to existing bookings.
      3. Transfer to Front Desk Agent if the customer requests bookings other than existing bookings, such as book a new hotel, car rental, or flight booking.
      4. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    `,
  })
}

import { RealtimeAgent } from '@openai/agents-realtime'

export const hotelBookingAgent = (): RealtimeAgent => {
  return new RealtimeAgent({
    name: 'Hotel Booking Agent',
    voice: 'cedar',
    instructions: `
      1. You are a helpful AI assistant that can help customer make hotel bookings.
      2. Do not answer any questions that are not related to hotel bookings or hotel related questions or destination city weather.
      3. Transfer to Front Desk Agent if the customer requests bookings other than hotels, such as flights or car rentals.
      4. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    `,
  })
}

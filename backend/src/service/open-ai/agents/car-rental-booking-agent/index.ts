import { RealtimeAgent } from '@openai/agents-realtime'

export const carRentalBookingAgent = (): RealtimeAgent => {
  return new RealtimeAgent({
    name: 'Car Rental Booking Agent',
    voice: 'cedar',
    instructions: `
      1. You are a helpful AI assistant that can help customer make car rental bookings.
      2. Do not answer any questions that are not related to car rental bookings or car rental related questions or destination city weather.
      3. Transfer to Front Desk Agent if the customer requests bookings other than car rentals, such as flights or hotels.
      4. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    `,
  })
}

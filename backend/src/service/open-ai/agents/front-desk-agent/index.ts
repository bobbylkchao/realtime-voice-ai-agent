import { RealtimeAgent, RealtimeItem } from '@openai/agents-realtime'
import { MCPServerStreamableHttp } from '@openai/agents'
import { hotelBookingAgent } from '../hotel-booking-agent'
import { carRentalBookingAgent } from '../car-rental-booking-agent'
import { flightBookingAgent } from '../flight-booking-agent'
import { postBookingAgent } from '../post-booking-agent'

export const frontDeskAgent = (
  mcpServers: MCPServerStreamableHttp[]
): RealtimeAgent<{ history: RealtimeItem[] }> => {
  return new RealtimeAgent({
    name: 'Front Desk Agent',
    voice: 'marin',
    instructions: `
    1. You are a helpful AI assistant.
    2. Talk to the user directly for general trip booking questions.
    3. If you need greeting the user, or say something to the user at the beginning, say: "Hi, I am your AI phone agent. How can I assist you today?". Only greet the user once!
    4. Call the matching tool when the user requests book a hotel, car rental, or flight.
    5. Do not answer any questions that are not related to trip bookings or travel related questions or destination city weather.
    6. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    7. You only serve hotel, car rental, and flight bookings.
    8. Speak English only. Do not use any other language.
    ${mcpServers.length > 0 ? '9. You have access to tools through MCP server for searching hotels, car rentals, flights, getting weather information and canceling existing bookings etc.' : ''}
    `,
    tools: [
      hotelBookingAgent().asTool({
        toolName: 'hotel_booking_expert',
        toolDescription: 'Book a hotel for the user.',
      }),
      carRentalBookingAgent().asTool({
        toolName: 'car_rental_booking_expert',
        toolDescription: 'Book a car rental for the user.',
      }),
      flightBookingAgent().asTool({
        toolName: 'flight_booking_expert',
        toolDescription: 'Book a flight for the user.',
      }),
      postBookingAgent().asTool({
        toolName: 'post_booking_expert',
        toolDescription: 'Help customer with their existing bookings.',
      }),
    ],
    mcpServers: mcpServers.length > 0 ? mcpServers : [],
  })
}

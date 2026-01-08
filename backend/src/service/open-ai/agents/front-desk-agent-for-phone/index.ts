import { RealtimeAgent, RealtimeItem } from '@openai/agents-realtime'
import { MCPServerStreamableHttp } from '@openai/agents'
import { hotelBookingAgent } from '../hotel-booking-agent'
import { carRentalBookingAgent } from '../car-rental-booking-agent'
import { flightBookingAgent } from '../flight-booking-agent'
import { postBookingAgent } from '../post-booking-agent'

export const frontDeskAgentForPhone = (
  mcpServers: MCPServerStreamableHttp[]
): RealtimeAgent<{ history: RealtimeItem[] }> => {
  return new RealtimeAgent({
    name: 'Front Desk Agent for Phone',
    voice: 'marin',
    instructions: `
    1. You are a helpful AI assistant helping customers with their trip bookings over the phone.
    2. You are an AI phone agent for guestreservations.com
    3. The reason you are here is because no phone agents are available at this moment. You will be transferred to a human agent when one is available.
    4. Talk to the user directly for general trip booking questions.
    5. You do not have to put 'hello' or 'hi' at the beginning of your response every time, just act as a call center agent.
    6. Call the matching tool when the user requests book a hotel, car rental, or flight.
    7. Do not answer any questions that are not related to trip bookings or travel related questions or destination city weather.
    8. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    9. You only serve hotel, car rental, and flight bookings.
    10. Speak English only. Do not use any other language.
    11. Currently we are testing this agent with a small number of customers. Please response as quick, fast as possible.
    ${mcpServers.length > 0 ? '12. You have access to tools through MCP server for searching hotels, car rentals, flights, getting weather information and canceling existing bookings etc.' : ''}
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

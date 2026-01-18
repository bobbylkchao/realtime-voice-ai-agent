import { RealtimeAgent, RealtimeItem } from '@openai/agents-realtime'
import { MCPServerStreamableHttp } from '@openai/agents'
import { hotelBookingAgent } from '../hotel-booking-agent'
import { carRentalBookingAgent } from '../car-rental-booking-agent'
import { flightBookingAgent } from '../flight-booking-agent'
import { postBookingAgent } from '../post-booking-agent'
import { hotelInfoSearchAgent } from '../hotel-info-search-agent'
import { GLOBAL_INSTRUCTIONS } from '../instructions/global-instructions'
import { getFrontDeskPhoneAgentInstructions } from '../instructions/front-desk-phone-agent-instructions'

/**
 * Testing purpose, do not use this agent for production.
 */
const TESTING_TYPE = 'B2B'
const TESTING_COMPANY_NAME = {
  B2B: 'Guest Reservations',
  B2C: 'Priceline',
}
export const COMPANY_NAME_FOR_TESTING = TESTING_COMPANY_NAME[TESTING_TYPE]

export const frontDeskAgentForPhone = (
  mcpServers: MCPServerStreamableHttp[],
  customerPhoneNumber?: string
): RealtimeAgent<{ history: RealtimeItem[] }> => {
  const companyName = TESTING_COMPANY_NAME[TESTING_TYPE]
  const frontDeskInstructions = getFrontDeskPhoneAgentInstructions(
    companyName,
    customerPhoneNumber
  )

  return new RealtimeAgent({
    name: 'Front Desk Agent for Phone',
    voice: 'marin',
    instructions: `
    ${GLOBAL_INSTRUCTIONS}

    ${frontDeskInstructions}

    ${mcpServers.length > 0 ? `
    ## Additional Tools Available ##
    You have access to additional tools through MCP servers for:
    - Searching hotels, car rentals, and flights
    - Getting weather information for destination cities
    - Canceling existing bookings
    - Getting phone session data (use phone-session-mcp-server at conversation start)
    ` : ''}
    `,
    tools: [
      hotelInfoSearchAgent().asTool({
        toolName: 'hotel_info_search_expert',
        toolDescription:
          'Search for hotel information such as amenities, pet-friendly policy, cancellation policy, location, reviews, and other hotel details.',
      }),
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

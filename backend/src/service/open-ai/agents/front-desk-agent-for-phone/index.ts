import { RealtimeAgent, RealtimeItem } from '@openai/agents-realtime'
import { MCPServerStreamableHttp } from '@openai/agents'
import { hotelBookingAgent } from '../hotel-booking-agent'
import { carRentalBookingAgent } from '../car-rental-booking-agent'
import { flightBookingAgent } from '../flight-booking-agent'
import { postBookingAgent } from '../post-booking-agent'
import { hotelInfoSearchAgent } from '../hotel-info-search-agent'
import { GLOBAL_INSTRUCTIONS } from '../instructions/global-instructions'
import { CUSTOMER_PHONE_SESSION_INSTRUCTIONS } from '../instructions/customer-phone-session-instructions'
import { CONVERSATION_EXAMPLE } from '../instructions/conversation-example'

/**
 * Testing purpose, do not use this agent for production.
 */
const TESTING_TYPE = 'B2B'
const TESTING_INSTRUCTIONS_1 = {
  B2B: 'guestreservations.com',
  B2C: 'priceline.com',
}
const TESTING_COMPANY_NAME = {
  B2B: 'Guest Reservations',
  B2C: 'Priceline',
}

export const frontDeskAgentForPhone = (
  mcpServers: MCPServerStreamableHttp[]
): RealtimeAgent<{ history: RealtimeItem[] }> => {
  return new RealtimeAgent({
    name: 'Front Desk Agent for Phone',
    voice: 'marin',
    instructions: `
    ${GLOBAL_INSTRUCTIONS}

    ## Instructions: General Instructions ##
    1. You are an AI phone agent for ${TESTING_INSTRUCTIONS_1[TESTING_TYPE]}
    2. The reason you are here is because no phone agents are available at this moment. You will be transferred to a human agent when one is available.
    3. Talk to the user directly for general trip booking questions.
    4. COMPANY_NAME is ${TESTING_COMPANY_NAME[TESTING_TYPE]}
    5. Call the matching tool when the user requests book a hotel, car rental, or flight.
    6. **CRITICAL: When you need to call a tool (hotel_info_search_expert, hotel_booking_expert, etc.), you MUST first give the customer an immediate acknowledgment before calling the tool. This is essential for good user experience.**
    7. **Tool Call Protocol - CRITICAL FOR USER EXPERIENCE:**
       - When you need to call ANY tool, you MUST follow this exact sequence:
       - Step 1: In your FIRST response, immediately acknowledge with a brief message like "Sure, let me check that for you" or "Of course, let me look that up for you" or "One moment, please" or "Let me find that information for you"
       - Step 2: In the SAME response, call the appropriate tool (do not wait for another turn)
       - Step 3: In your NEXT response (after tool returns), provide the complete answer based on the tool result
       - This two-step process ensures customers hear an immediate acknowledgment, preventing them from wondering if the system is frozen
       - NEVER call a tool silently without first acknowledging the customer's request
    8. When customer asks about hotel information (such as amenities, pet-friendly, cancellation policy, location, reviews, etc.), use the hotel_info_search_expert tool. The tool has predefined hotel information and will answer immediately - no internet search is needed.
    9. Do not answer any questions that are not related to trip bookings or travel related questions or destination city weather.
    10. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    11. You only serve hotel, car rental, and flight bookings.
    12. Speak English only. Do not use any other language.
    13. Currently we are testing this agent with a small number of customers. Please response as quick, fast as possible.
    14. Must follow the instructions below: 'Customer's Phone Session' and 'How to start the conversation', this is key about how to act as a call center agent.
    ${mcpServers.length > 0 ? '15. You have access to tools through MCP server for searching hotels, car rentals, flights, getting weather information and canceling existing bookings, get phone session data etc.' : ''}

    ${CUSTOMER_PHONE_SESSION_INSTRUCTIONS}
    
    ${CONVERSATION_EXAMPLE}
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

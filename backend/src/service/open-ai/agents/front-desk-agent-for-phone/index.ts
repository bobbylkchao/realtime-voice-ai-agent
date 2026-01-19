import { RealtimeAgent, RealtimeItem } from '@openai/agents-realtime'
import { MCPServerStreamableHttp } from '@openai/agents'
import { hotelInfoSearchTool } from '../hotel-info-search-agent/tool'
import { hotelBookingTool } from '../hotel-booking-agent/tool'
import { carRentalBookingTool } from '../car-rental-booking-agent/tool'
import { flightBookingTool } from '../flight-booking-agent/tool'
import { postBookingTool } from '../post-booking-agent/tool'
import { getPhoneSessionTool } from '../phone-session-agent'
import { checkoutTool } from '../checkout-agent/tool'
import { getGeneralInstructions } from './instructions/general-instructions'
import { getCustomerPhoneSessionInstructions } from './instructions/customer-phone-session'
import { getConversationInstructions } from './instructions/conversation'
import { getConversationExample } from './instructions/conversation-example'

export const frontDeskAgentForPhone = (
  mcpServers: MCPServerStreamableHttp[],
  phoneNumber: string,
): RealtimeAgent<{ history: RealtimeItem[] }> => {
  const instructions = [
    getGeneralInstructions(mcpServers.length),
    getCustomerPhoneSessionInstructions(phoneNumber),
    getConversationInstructions(phoneNumber),
    getConversationExample(phoneNumber),
  ].join('\n\n')

  return new RealtimeAgent<{ history: RealtimeItem[] }>({
    name: 'Front Desk Agent for Phone',
    voice: 'marin',
    instructions,
    tools: [
      getPhoneSessionTool,
      hotelInfoSearchTool,
      hotelBookingTool,
      carRentalBookingTool,
      flightBookingTool,
      postBookingTool,
      checkoutTool,
    ],
    mcpServers: mcpServers.length > 0 ? mcpServers : [],
  })
}

import { z } from 'zod'
import { tool } from '@openai/agents-realtime'
import logger from '../../../../misc/logger'

/**
 * Get phone session data based on phone number
 * This is a helper function that can be used to retrieve phone session data
 * 
 * @param phoneNumber - The customer's phone number
 * @returns Phone session data object
 */
export const getPhoneSessionData = (phoneNumber: string) => {
  // For now, return hardcoded test data
  // In production, this would query a database or API

  // As default, return null for no phone session case
  let phoneSessionData: any = null

  // Test case 1: Has date search
  if (phoneNumber === '+14000000000') {
    phoneSessionData = {
      customerPhoneNumber: phoneNumber,
      productName: 'hotel',
      destinationCity: 'New York',
      bookingStartDate: 'Jan 1, 2026',
      bookingEndDate: 'Jan 2, 2026',
      hotelName: 'Holiday Inn - Times Square',
      hotelAddress: '585 8th Avenue, New York, NY - Times Square - Theatre District',
      numberOfGuests: 2,
      numberOfRooms: 1,
    }
  }
  
  // Test case 2: No date search
  if (phoneNumber === '+15000000000') {
    phoneSessionData = {
      customerPhoneNumber: phoneNumber,
      productName: 'hotel',
      destinationCity: 'New York',
      bookingStartDate: null,
      bookingEndDate: null,
      hotelName: 'Holiday Inn - Times Square',
      hotelAddress: '585 8th Avenue, New York, NY - Times Square - Theatre District',
      numberOfGuests: null,
      numberOfRooms: null,
    }
  }

  logger.info(
    { phoneNumber, phoneSessionData },
    '[Phone Session Agent] Getting phone session based on phone number'
  )

  return phoneSessionData
}

/**
 * Phone Session Tool
 * 
 * This tool retrieves phone session data based on a phone number.
 * It replaces the phone-session-mcp-server functionality.
 * 
 * @returns Tool that can be used in RealtimeAgent tools array
 */
export const getPhoneSessionTool = tool({
  name: 'get_phone_session',
  description:
    'Get phone session data based on phone number. Returns customer phone session information including product name, destination city, booking dates, hotel name and address, number of guests and rooms.',
  parameters: z.object({
    phoneNumber: z.string().describe('The customer\'s phone number'),
  }),
  execute: async ({ phoneNumber }: { phoneNumber: string }) => {
    const data = getPhoneSessionData(phoneNumber)
    return JSON.stringify(data)
  },
})


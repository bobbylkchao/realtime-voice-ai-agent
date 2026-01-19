import { z } from 'zod'
import { tool } from '@openai/agents-realtime'

/**
 * Checkout Tool
 * 
 * This tool validates checkout parameters and determines if all required information
 * is available before proceeding with checkout (transfer to agent or email checkout link).
 * 
 * The tool checks for required parameters:
 * - hotelName (required)
 * - checkInDate (required)
 * - checkOutDate (required)
 * - numberOfGuests (required)
 * - numberOfRooms (required)
 * 
 * If any parameters are missing, the tool returns a list of missing parameters
 * so the agent can ask the customer for them.
 */
export const checkoutTool = tool({
  name: 'checkout_expert',
  description:
    'Validate checkout parameters and check if all required information (hotel name, check-in date, check-out date, number of guests, number of rooms) is available before proceeding with checkout. If any parameters are missing, returns a list of missing parameters that need to be collected from the customer.',
  parameters: z.object({
    hotelName: z.string().nullish().describe('The hotel name for checkout'),
    checkInDate: z.string().nullish().describe('Check-in date'),
    checkOutDate: z.string().nullish().describe('Check-out date'),
    numberOfGuests: z.number().nullish().describe('Number of guests'),
    numberOfRooms: z.number().nullish().describe('Number of rooms'),
  }),
  execute: async (input) => {
    const { hotelName, checkInDate, checkOutDate, numberOfGuests, numberOfRooms } = input

    const missingParams: string[] = []

    if (!hotelName) {
      missingParams.push('hotel name')
    }
    if (!checkInDate) {
      missingParams.push('check-in date')
    }
    if (!checkOutDate) {
      missingParams.push('check-out date')
    }
    if (numberOfGuests === null || numberOfGuests === undefined) {
      missingParams.push('number of guests')
    }
    if (numberOfRooms === null || numberOfRooms === undefined) {
      missingParams.push('number of rooms')
    }

    if (missingParams.length > 0) {
      return JSON.stringify({
        status: 'missing_parameters',
        message: `The following information is required to proceed with checkout: ${missingParams.join(', ')}. Please ask the customer for these details.`,
        missingParameters: missingParams,
        availableParameters: {
          hotelName: hotelName || null,
          checkInDate: checkInDate || null,
          checkOutDate: checkOutDate || null,
          numberOfGuests: numberOfGuests ?? null,
          numberOfRooms: numberOfRooms ?? null,
        },
      })
    }

    // All parameters are available
    return JSON.stringify({
      status: 'ready_for_checkout',
      message: 'All required checkout parameters are available. You can now proceed with checkout options (transfer to an agent or email checkout link).',
      parameters: {
        hotelName,
        checkInDate,
        checkOutDate,
        numberOfGuests,
        numberOfRooms,
      },
    })
  },
})


import { z } from 'zod'
import { tool } from '@openai/agents-realtime'

/**
 * Hotel Info Search Tool
 * 
 * This tool provides hotel information based on predefined data.
 * It replaces the hotelInfoSearchAgent functionality.
 */
export const hotelInfoSearchTool = tool({
  name: 'hotel_info_search_expert',
  description:
    'Search for hotel information such as amenities, pet-friendly policy, cancellation policy, location, reviews, and other hotel details.',
  parameters: z.object({
    query: z.string().nullish().describe('The hotel information query (optional)'),
  }),
  execute: async () => {
    // Return predefined hotel information
    // This matches the information from hotelInfoSearchAgent instructions
    return JSON.stringify({
      hotelName: 'Holiday Inn New York City - Times Square',
      address: '123 Main St, New York, NY 10001',
      roomPrice: '$100 per night',
      rating: '4.5 stars',
      availability: 'Available',
      amenities: [
        'Free Wi-Fi',
        'Free breakfast',
        'Free parking',
        'pet-friendly',
        'swimming pool',
      ],
      reviews: '4.5 stars',
      locationInfo: {
        timesSquare: '1 km',
        centralPark: '2 km',
        empireStateBuilding: '3 km',
        statueOfLiberty: '4 km',
        brooklynBridge: '5 km',
        jfkAirport: '10 km',
        laguardiaAirport: '20 km',
        newarkAirport: '30 km',
      },
    })
  },
})


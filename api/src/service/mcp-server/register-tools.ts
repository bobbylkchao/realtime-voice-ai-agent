import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import logger from '../../misc/logger'

export const registerTools = (mcpServer: McpServer) => {
  try {
    // Demo call internal API to search for hotels
    mcpServer.registerTool(
      'search-hotel',
      {
        title: 'Search Hotel',
        description: "Search hotels in the given location by city name and country name and check in date and check out date, return the hotel name, address, price, rating, and availabilitySearch for hotels by city, country, check-in date, and check-out date, and return each hotel's name, address, price, rating, and availability.",
        inputSchema: { city: z.string(), country: z.string(), checkInDate: z.string(), checkOutDate: z.string() },
        outputSchema: { hotels: z.array(z.object({ name: z.string(), address: z.string(), price: z.number(), rating: z.number(), availability: z.boolean() })) }
      },
      async ({ city, country, checkInDate, checkOutDate }) => {
        logger.info({ city, country, checkInDate, checkOutDate }, '[MCP Server/Tool Call] Searching for hotels')
        const output = {
          hotels: [
            { name: 'Hotel 1', address: '123 Main St', price: 100, rating: 4.5, availability: true },
            { name: 'Hotel 2', address: '456 Main St', price: 200, rating: 4.0, availability: false },
            { name: 'Hotel 3', address: '789 Main St', price: 300, rating: 4.2, availability: true },
          ]
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output
        }
      }
    )

    // Demo call external API to search for destination city weather
    mcpServer.registerTool(
      'get-destination-weather',
      {
        title: 'Get Destination City Weather',
        description: 'Get weather data for a destination city for the given date',
        inputSchema: { city: z.string(), country: z.string(), date: z.string() },
        outputSchema: { maxTemperature: z.number(), minTemperature: z.number(), precipitation: z.number() }
      },
      async ({ city, country, date }) => {
        logger.info({ city, country }, '[MCP Server/Tool Call] Getting weather for destination city')

        try {
          const destination = `${city}, ${country}`
          const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}`)
          const geoData = await geo.json()
          const { latitude, longitude } = geoData?.results?.[0]

          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
          const res = await fetch(url)
          const data = await res.json()

          const maxTemp = data?.daily?.temperature_2m_max?.[0]
          const minTemp = data?.daily?.temperature_2m_min?.[0]
          const precipitation = data?.daily?.precipitation_sum?.[0]

          const output = { maxTemperature: maxTemp, minTemperature: minTemp, precipitation: precipitation }
          return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
          }
        } catch (error) {
          logger.error({ error }, '[MCP Server/Tool Call] Error getting weather for destination city')
          return {
            content: [{ type: 'text', text: 'Error getting weather for destination city' }],
            structuredContent: { maxTemperature: null, minTemperature: null, precipitation: null }
          }
        }
      }
    )

    logger.info('[MCP Server] Tools registered successfully')
  } catch (error) {
    logger.error({ error }, '[MCP Server] Error registering tools')
    throw error
  }
}

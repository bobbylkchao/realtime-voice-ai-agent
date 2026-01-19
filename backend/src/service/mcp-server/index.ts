import type { Express } from 'express'
import { initBookingMcpServer } from './booking-mcp-server'
import { initPostBookingMcpServer } from './post-booking-mcp-server'

export const initMcpServers = (app: Express, port: number): void => {
  initBookingMcpServer(app, port)
  initPostBookingMcpServer(app, port)
}

export const mcpServerList: { name: string; url: string, phoneCallOnly: boolean }[] = [
  {
    name: 'booking-mcp-server',
    url: 'http://localhost:4000/booking-mcp',
    phoneCallOnly: false,
  },
  {
    name: 'post-booking-mcp-server',
    url: 'http://localhost:4000/post-booking-mcp',
    phoneCallOnly: false,
  },
]

import type { Express } from 'express'
import { initBookingMcpServer } from './booking-mcp-server'
import { initPostBookingMcpServer } from './post-booking-mcp-server'
import { initPhoneSessionMcpServer } from './phone-session-mcp-server'

export const initMcpServers = (app: Express, port: number): void => {
  initBookingMcpServer(app, port)
  initPostBookingMcpServer(app, port)
  initPhoneSessionMcpServer(app, port)
}

export const mcpServerList: {
  name: string
  url: string
  phoneCallOnly: boolean
}[] = [
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
  {
    name: 'phone-session-mcp-server',
    url: 'http://localhost:4000/phone-session-mcp',
    phoneCallOnly: true,
  },
]

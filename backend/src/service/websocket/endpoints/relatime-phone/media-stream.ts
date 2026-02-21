import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { handleRealtimePhone } from './handler'

export const initMediaStreamWebSocketService = (httpServer: HttpServer) => {
  // Use noServer option and handle upgrade manually to avoid conflicts with Socket.IO
  const wss = new WebSocketServer({
    noServer: true, // Don't automatically handle upgrade
  })

  // Manually handle upgrade only for /media-stream path
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname

    if (pathname === '/media-stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Store request in ws for later use
        ;(ws as any).request = request
        wss.emit('connection', ws, request)
      })
    }
    // For all other paths (like /realtime-voice), let Socket.IO handle it
  })

  wss.on('connection', async (ws: WebSocket) => {
    await handleRealtimePhone(ws)
  })
}

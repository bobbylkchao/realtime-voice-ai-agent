/**
 * Native Node.js SIP Server for Amazon Connect External Voice Transfer
 * Handles SIP INVITE requests from Amazon Connect using raw UDP/TCP sockets
 * 
 * Note: This is a simplified implementation. For production, consider using
 * a dedicated SIP stack like Asterisk, FreeSWITCH, or a managed SIP service.
 */

import { createSocket, Socket as UDPSocket } from 'dgram'
import { createServer, Socket as TCPSocket } from 'net'
import logger from '../../misc/logger'
import { RealtimeSession } from '@openai/agents-realtime'
import { MCPServerStreamableHttp, withTrace } from '@openai/agents'
import { frontDeskAgentForPhone } from '../open-ai/agents/front-desk-agent-for-phone'
import { mcpServerList } from '../mcp-server'
import { AmazonConnectSipTransportLayer } from './amazon-connect-sip-transport-layer'

interface SipCall {
  callId: string
  from: string
  to: string
  contactId?: string
  session: RealtimeSession | null
  transportLayer: AmazonConnectSipTransportLayer | null
  socket: UDPSocket | TCPSocket
  remoteAddress: string
  remotePort: number
}

// Store active SIP calls
const activeCalls = new Map<string, SipCall>()

/**
 * Parse SIP message
 */
function parseSipMessage(message: string): {
  method?: string
  requestUri?: string
  statusCode?: number
  statusText?: string
  headers: Record<string, string>
  body?: string
} {
  const lines = message.split('\r\n')
  const firstLine = lines[0]
  const headers: Record<string, string> = {}
  let bodyStart = -1

  // Parse first line (request or response)
  const isRequest = !firstLine.startsWith('SIP/')
  let method: string | undefined
  let requestUri: string | undefined
  let statusCode: number | undefined
  let statusText: string | undefined

  if (isRequest) {
    const parts = firstLine.split(' ')
    method = parts[0]
    requestUri = parts[1]
  } else {
    const parts = firstLine.split(' ')
    statusCode = parseInt(parts[1], 10)
    statusText = parts.slice(2).join(' ')
  }

  // Parse headers
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === '') {
      bodyStart = i + 1
      break
    }
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()
      headers[key] = value
    }
  }

  // Parse body
  let body: string | undefined
  if (bodyStart > 0 && bodyStart < lines.length) {
    body = lines.slice(bodyStart).join('\r\n')
  }

  return {
    method,
    requestUri,
    statusCode,
    statusText,
    headers,
    body,
  }
}

/**
 * Generate SIP response
 */
function generateSipResponse(
  statusCode: number,
  statusText: string,
  headers: Record<string, string>,
  body?: string
): string {
  let response = `SIP/2.0 ${statusCode} ${statusText}\r\n`
  
  for (const [key, value] of Object.entries(headers)) {
    response += `${key}: ${value}\r\n`
  }
  
  if (body) {
    response += `Content-Length: ${Buffer.byteLength(body)}\r\n`
    response += '\r\n'
    response += body
  } else {
    response += '\r\n'
  }
  
  return response
}

/**
 * Handle SIP INVITE request
 */
async function handleSipInvite(
  message: string,
  socket: UDPSocket | TCPSocket,
  remoteAddress: string,
  remotePort: number
): Promise<void> {
  return withTrace('handleSipInvite', async () => {
    const parsed = parseSipMessage(message)
    const callId = parsed.headers['Call-ID'] || `call-${Date.now()}`
    const from = parsed.headers.From || ''
    const to = parsed.headers.To || ''
    const contactId = parsed.headers['X-Contact-ID'] || parsed.headers['Contact-ID']

    logger.info(
      {
        callId,
        from,
        to,
        contactId,
        remoteAddress,
        remotePort,
      },
      '[Amazon Connect SIP] Received SIP INVITE from Amazon Connect'
    )

    // Create call record
    const call: SipCall = {
      callId,
      from,
      to,
      contactId,
      session: null,
      transportLayer: null,
      socket,
      remoteAddress,
      remotePort,
    }
    activeCalls.set(callId, call)

    // Send 100 Trying (optional, but good practice)
    const tryingResponse = generateSipResponse(100, 'Trying', {
      'Via': parsed.headers.Via || '',
      'From': from,
      'To': to,
      'Call-ID': callId,
      'CSeq': parsed.headers.CSeq || '1 INVITE',
    })
    sendSipMessage(socket, tryingResponse, remoteAddress, remotePort)

    // Send 200 OK with SDP (simplified - in production, you'd negotiate codecs properly)
    const sdpBody = generateSdpAnswer(remoteAddress)
    const okResponse = generateSipResponse(200, 'OK', {
      'Via': parsed.headers.Via || '',
      'From': from,
      'To': `${to};tag=${Date.now()}`,
      'Call-ID': callId,
      'CSeq': parsed.headers.CSeq || '1 INVITE',
      'Contact': `<sip:${process.env.AMAZON_CONNECT_SIP_USERNAME}@${process.env.AMAZON_CONNECT_SIP_DOMAIN || 'sip.example.com'}>`,
      'Content-Type': 'application/sdp',
    }, sdpBody)
    sendSipMessage(socket, okResponse, remoteAddress, remotePort)

    logger.info(
      { callId },
      '[Amazon Connect SIP] Sent 200 OK, establishing media session'
    )

    // Setup OpenAI session for this call
    await setupOpenAiSessionForSipCall(call)
  })
}

/**
 * Generate SDP answer (simplified)
 */
function generateSdpAnswer(_remoteAddress: string): string {
  const localIp = process.env.AMAZON_CONNECT_SIP_HOST || '127.0.0.1'
  const rtpPort = 10000 // Default RTP port (should be dynamic in production)
  
  return `v=0
o=- ${Date.now()} ${Date.now()} IN IP4 ${localIp}
s=Amazon Connect AI Agent
c=IN IP4 ${localIp}
t=0 0
m=audio ${rtpPort} RTP/AVP 0 8 101
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
a=sendrecv
`
}

/**
 * Send SIP message
 */
function sendSipMessage(
  socket: UDPSocket | TCPSocket,
  message: string,
  address: string,
  port: number
): void {
  const buffer = Buffer.from(message)
  
  if ('send' in socket) {
    // UDP socket
    socket.send(buffer, port, address, (error) => {
      if (error) {
        logger.error(
          { error, address, port },
          '[Amazon Connect SIP] Error sending SIP message (UDP)'
        )
      }
    })
  } else {
    // TCP socket
    socket.write(message)
  }
}

/**
 * Setup OpenAI RealtimeSession for SIP call
 */
async function setupOpenAiSessionForSipCall(call: SipCall): Promise<void> {
  return withTrace('setupOpenAiSessionForSipCall', async () => {
    const openAiApiKey = process.env.OPENAI_API_KEY
    if (!openAiApiKey) {
      logger.error({ callId: call.callId }, '[Amazon Connect SIP] OpenAI API key missing')
      return
    }

    logger.info(
      { callId: call.callId },
      '[Amazon Connect SIP] Setting up OpenAI RealtimeSession for SIP call'
    )

    // Create transport layer for SIP audio
    // Note: We'll need to adapt this to work with raw RTP streams
    const transportLayer = new AmazonConnectSipTransportLayer({
      callId: call.callId,
      socket: call.socket,
      remoteAddress: call.remoteAddress,
      remotePort: call.remotePort,
    })

    // Create agent
    const mcpServers: MCPServerStreamableHttp[] = []
    await Promise.all(
      mcpServerList.map(async (mcpServerConfig) => {
        try {
          const mcpServer = new MCPServerStreamableHttp({
            url: mcpServerConfig.url,
            name: mcpServerConfig.name,
          })
          await mcpServer.connect()
          mcpServers.push(mcpServer)
          logger.info(
            { callId: call.callId, mcpServerName: mcpServerConfig.name },
            '[Amazon Connect SIP] MCP server connected successfully'
          )
        } catch (mcpError) {
          logger.warn(
            { callId: call.callId, error: mcpError, mcpServerName: mcpServerConfig.name },
            '[Amazon Connect SIP] Failed to connect to MCP server (non-critical)'
          )
        }
      })
    )
    const agent = frontDeskAgentForPhone(mcpServers)

    // Create session
    const session = new RealtimeSession(agent, {
      transport: transportLayer,
      model: process.env.OPENAI_VOICE_MODEL || 'gpt-realtime',
      config: {
        audio: {
          input: {
            turnDetection: {
              type: 'server_vad',
              create_response: true,
              interrupt_response: true,
              silence_duration_ms: 500,
            },
          },
          output: {
            voice: 'verse',
          },
        },
      },
    })

    // Connect to OpenAI
    await session.connect({
      apiKey: openAiApiKey,
    })

    logger.info(
      { callId: call.callId },
      '[Amazon Connect SIP] Connected to OpenAI Realtime API'
    )

    // Handle audio from OpenAI (to send back to Amazon Connect)
    session.on('audio', (event: any) => {
      transportLayer.sendAudio(event.data, { commit: false })
    })

    // Handle session events
    session.on('error', (error) => {
      logger.error(
        { error, callId: call.callId },
        '[Amazon Connect SIP] OpenAI session error'
      )
    })

    session.on('connection_change', (status) => {
      logger.info(
        { status, callId: call.callId },
        '[Amazon Connect SIP] OpenAI connection status changed'
      )
    })

    // Update call record
    call.session = session
    call.transportLayer = transportLayer
  })
}

/**
 * Initialize SIP server for Amazon Connect External Voice Transfer
 */
export const initAmazonConnectSipServer = async (): Promise<void> => {
  return withTrace('initAmazonConnectSipServer', async () => {
    const sipServerHost = process.env.AMAZON_CONNECT_SIP_HOST || '0.0.0.0'
    const sipServerPort = Number(process.env.AMAZON_CONNECT_SIP_PORT) || 5060
    const sipDomain = process.env.AMAZON_CONNECT_SIP_DOMAIN || 'sip.example.com'

    logger.info(
      {
        host: sipServerHost,
        port: sipServerPort,
        domain: sipDomain,
      },
      '[Amazon Connect SIP] Initializing native SIP server for External Voice Transfer'
    )

    // Create UDP server for SIP signaling
    const udpServer = createSocket('udp4')
    
    udpServer.on('message', (msg, rinfo) => {
      const message = msg.toString()
      const parsed = parseSipMessage(message)

      logger.debug(
        {
          method: parsed.method,
          from: rinfo.address,
          port: rinfo.port,
          messageLength: message.length,
        },
        '[Amazon Connect SIP] Received SIP message (UDP)'
      )

      if (parsed.method === 'INVITE') {
        handleSipInvite(message, udpServer, rinfo.address, rinfo.port).catch(
          (error) => {
            logger.error(
              { error, from: rinfo.address, port: rinfo.port },
              '[Amazon Connect SIP] Error handling SIP INVITE'
            )
          }
        )
      } else if (parsed.method === 'ACK') {
        logger.info(
          { callId: parsed.headers['Call-ID'] },
          '[Amazon Connect SIP] Received ACK, call established'
        )
      } else if (parsed.method === 'BYE') {
        const callId = parsed.headers['Call-ID']
        if (callId) {
          cleanupSipCall(callId)
        }
      }
    })

    udpServer.on('error', (error) => {
      logger.error(
        { error },
        '[Amazon Connect SIP] UDP server error'
      )
    })

    udpServer.bind(sipServerPort, sipServerHost, () => {
      logger.info(
        {
          host: sipServerHost,
          port: sipServerPort,
        },
        '[Amazon Connect SIP] UDP SIP server listening'
      )
    })

    // Create TCP server for SIP signaling (optional, for TLS support)
    const tcpServer = createServer((socket: TCPSocket) => {
      let buffer = ''

      socket.on('data', (data) => {
        buffer += data.toString()
        
        // Check if we have a complete SIP message
        if (buffer.includes('\r\n\r\n')) {
          const messages = buffer.split('\r\n\r\n')
          buffer = messages.pop() || '' // Keep incomplete message in buffer

          for (const msg of messages) {
            const message = msg + '\r\n\r\n'
            const parsed = parseSipMessage(message)

            logger.debug(
              {
                method: parsed.method,
                from: socket.remoteAddress,
                port: socket.remotePort,
              },
              '[Amazon Connect SIP] Received SIP message (TCP)'
            )

            if (parsed.method === 'INVITE') {
              handleSipInvite(
                message,
                socket,
                socket.remoteAddress || 'unknown',
                socket.remotePort || 0
              ).catch((error) => {
                logger.error(
                  { error },
                  '[Amazon Connect SIP] Error handling SIP INVITE (TCP)'
                )
              })
            } else if (parsed.method === 'BYE') {
              const callId = parsed.headers['Call-ID']
              if (callId) {
                cleanupSipCall(callId)
              }
            }
          }
        }
      })

      socket.on('error', (error) => {
        logger.error(
          { error },
          '[Amazon Connect SIP] TCP socket error'
        )
      })

      socket.on('close', () => {
        logger.debug('[Amazon Connect SIP] TCP socket closed')
      })
    })

    tcpServer.on('error', (error) => {
      logger.error(
        { error },
        '[Amazon Connect SIP] TCP server error'
      )
    })

    tcpServer.listen(sipServerPort, sipServerHost, () => {
      logger.info(
        {
          host: sipServerHost,
          port: sipServerPort,
        },
        '[Amazon Connect SIP] TCP SIP server listening'
      )
    })

    logger.info(
      {
        udpPort: sipServerPort,
        tcpPort: sipServerPort,
        domain: sipDomain,
      },
      '[Amazon Connect SIP] SIP server initialized and ready to receive calls from Amazon Connect'
    )
  })
}

/**
 * Cleanup SIP call
 */
function cleanupSipCall(callId: string): void {
  const call = activeCalls.get(callId)
  if (!call) {
    return
  }

  logger.info(
    { callId },
    '[Amazon Connect SIP] Cleaning up SIP call'
  )

  // Close OpenAI session
  if (call.session && call.transportLayer) {
    // RealtimeSession uses transport layer's close method
    call.transportLayer.close()
  }

  // Send BYE if needed
  // In a real implementation, you'd send BYE to Amazon Connect

  activeCalls.delete(callId)
}

/**
 * Get active SIP call by call ID
 */
export const getSipCall = (callId: string): SipCall | undefined => {
  return activeCalls.get(callId)
}


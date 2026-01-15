import {
  KinesisVideoClient,
  GetSignalingChannelEndpointCommand,
} from '@aws-sdk/client-kinesis-video'
import { WebSocket } from 'ws'
import { RealtimeSession } from '@openai/agents-realtime'
import { MCPServerStreamableHttp, withTrace } from '@openai/agents'
import logger from '../../misc/logger'
import { signWssUrl } from './sign-wss-url'
import { testAwsCredentials } from './test-aws-credentials'
import { KvsWebRtcHandler, KvsSignalingMessage } from './webrtc-handler'
import { AmazonConnectRealtimeTransportLayer } from './amazon-connect-transport-layer'
import { frontDeskAgentForPhone } from '../open-ai/agents/front-desk-agent-for-phone'
import { mcpServerList } from '../mcp-server'
import { RTCRtpSender } from '@roamhq/wrtc'

// Store WebRTC handlers per WebSocket connection
const webrtcHandlers = new Map<WebSocket, KvsWebRtcHandler>()

export const initAmazonConnectMediaStreamingService = async () => {
  logger.info('[Amazon Connect] Initializing Amazon Connect media streaming service')

  // Test AWS credentials and permissions first
  const credentialsValid = await testAwsCredentials()
  if (!credentialsValid) {
    throw new Error(
      'AWS credentials test failed. Please check your IAM permissions and credentials.'
    )
  }
  const awsRegion = process.env.AWS_REGION || 'us-east-1'
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const awsKinesisVideoChannelArn = process.env.AWS_KINESIS_VIDEO_CHANNEL_ARN

  if (!awsAccessKeyId || !awsSecretAccessKey || !awsKinesisVideoChannelArn) {
    throw new Error(
      'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_KINESIS_VIDEO_CHANNEL_ARN are required for Amazon Connect media streaming service'
    )
  }

  const kinesisVideoClient = new KinesisVideoClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  })

  // Get signaling endpoint
  const getSignalingChannelEndpointCommand = new GetSignalingChannelEndpointCommand({
    ChannelARN: process.env.AWS_KINESIS_VIDEO_CHANNEL_ARN,
    SingleMasterChannelEndpointConfiguration: {
      Protocols: ['WSS'],
      Role: 'VIEWER',
    },
  })

  const sendSignalingChannelEndpointCommand =
    await kinesisVideoClient.send(getSignalingChannelEndpointCommand)

  // TODO: search in sendSignalingChannelEndpointComment array, and get the first item that has Protocol = WSS
  const signalingEndpoint = sendSignalingChannelEndpointCommand?.ResourceEndpointList?.find(
    (item) => item?.Protocol === 'WSS'
  )

  const wssUrl = signalingEndpoint?.ResourceEndpoint as string

  if (!wssUrl) {
    throw new Error('No signaling endpoint found from Amazon Connect')
  }
  logger.info('[Amazon Connect] Retrieved signaling endpoint')

  // Extract region from WSS URL if it contains region information
  // Format: wss://v-xxxxx.kinesisvideo.{region}.amazonaws.com
  let signingRegion = awsRegion
  try {
    const urlMatch = wssUrl.match(/kinesisvideo\.([^.]+)\.amazonaws\.com/)
    if (urlMatch && urlMatch[1]) {
      const urlRegion = urlMatch[1]
      if (urlRegion !== awsRegion) {
        logger.warn(
          { urlRegion, configuredRegion: awsRegion },
          '[Amazon Connect] Region mismatch detected, using region from URL for signing'
        )
        signingRegion = urlRegion
      }
    }
  } catch (error) {
    logger.warn(error, '[Amazon Connect] Could not extract region from URL, using configured region')
  }

  const signedWssUrl = await signWssUrl(
    wssUrl,
    signingRegion,
    awsKinesisVideoChannelArn,
    awsAccessKeyId,
    awsSecretAccessKey
  )

  logger.info('[Amazon Connect] Attempting to connect to AWS KVS signaling channel')

  const ws = new WebSocket(signedWssUrl, {
    // AWS KVS may require specific protocols, but typically works without
    perMessageDeflate: false,
  })

  ws.on('open', () => {
    logger.info('[Amazon Connect] Connected to AWS KVS signaling channel')
  })

  ws.on('error', (error: Error & { code?: string; statusCode?: number }) => {
    logger.error(
      {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      },
      '[Amazon Connect] Error connecting to AWS KVS signaling channel'
    )
  })

  ws.on('close', (code, reason) => {
    logger.info(
      { code, reason: reason.toString() },
      '[Amazon Connect] Disconnected from AWS KVS signaling channel'
    )
    // Cleanup WebRTC handler
    const handler = webrtcHandlers.get(ws)
    if (handler) {
      handler.close()
      webrtcHandlers.delete(ws)
    }
  })

  ws.on('message', async (msg) => {
    try {
      const data: KvsSignalingMessage = JSON.parse(msg.toString())
      await handleSignalingMessage(data, ws, kinesisVideoClient, awsKinesisVideoChannelArn)
    } catch (error) {
      logger.error(
        { error },
        '[Amazon Connect] Error handling signaling message'
      )
    }
  })
}

/**
 * Handle KVS signaling messages and establish WebRTC connection
 */
async function handleSignalingMessage(
  message: KvsSignalingMessage,
  ws: WebSocket,
  _kinesisVideoClient: KinesisVideoClient,
  _channelArn: string
): Promise<void> {
  return withTrace('handleKvsSignalingMessage', async () => {
    const messageType = message.messageType

    logger.info(
      { messageType },
      '[Amazon Connect] Received signaling message'
    )

    switch (messageType) {
      case 'SDP_OFFER': {
        // Initialize WebRTC handler
        const webrtcHandler = new KvsWebRtcHandler()
        const callId = `amazon-connect-${Date.now()}`
        webrtcHandler.setCallId(callId)

        // Store handler for this WebSocket connection
        webrtcHandlers.set(ws, webrtcHandler)

        // TODO: Get ICE server configuration from GetIceServerConfig API
        // For now, using default STUN server

        // Handle SDP offer
        const sdpAnswer = await webrtcHandler.handleSdpOffer(message.sdpOffer)

        // Send SDP answer back to KVS
        const answerMessage = {
          messageType: 'SDP_ANSWER',
          sdpAnswer,
        }
        ws.send(JSON.stringify(answerMessage))

        logger.info(
          { callId },
          '[Amazon Connect] Sent SDP answer to KVS'
        )

        // Setup audio track handling
        webrtcHandler.on('audio-track', (track) => {
          setupOpenAiSession(track, callId, webrtcHandler, ws)
        })

        // Handle ICE candidates from WebRTC
        webrtcHandler.on('ice-candidate', (candidate) => {
          const candidateMessage = {
            messageType: 'ICE_CANDIDATE',
            candidate: {
              candidate: candidate.candidate,
              sdpMLineIndex: candidate.sdpMLineIndex,
              sdpMid: candidate.sdpMid,
            },
          }
          ws.send(JSON.stringify(candidateMessage))
        })

        break
      }

      case 'ICE_CANDIDATE': {
        // Handle ICE candidate from KVS
        const webrtcHandler = webrtcHandlers.get(ws)
        if (webrtcHandler && message.candidate) {
          await webrtcHandler.handleIceCandidate(message.candidate)
        } else {
          logger.warn(
            '[Amazon Connect] Received ICE candidate but no WebRTC handler found'
          )
        }
        break
      }

      default:
        logger.warn(
          { messageType },
          '[Amazon Connect] Unknown signaling message type'
        )
    }
  })
}

/**
 * Setup OpenAI RealtimeSession with WebRTC audio track
 */
async function setupOpenAiSession(
  audioTrack: MediaStreamTrack,
  callId: string,
  webrtcHandler: KvsWebRtcHandler,
  _ws: WebSocket
): Promise<void> {
  return withTrace('setupOpenAiSessionForAmazonConnect', async () => {
    const openAiApiKey = process.env.OPENAI_API_KEY
    if (!openAiApiKey) {
      logger.error({ callId }, '[Amazon Connect] OpenAI API key missing')
      return
    }

    // Create transport layer
    // Get RTP sender for outgoing audio
    const pc = (webrtcHandler as any).peerConnection
    let rtpSender: RTCRtpSender | undefined = undefined
    if (pc) {
      const senders = pc.getSenders()
      rtpSender = senders.find((s: RTCRtpSender) => s.track?.kind === 'audio') || undefined
    }

    const transportLayer = new AmazonConnectRealtimeTransportLayer({
      audioTrack,
      rtpSender,
      callId,
    })

    // Create agent without MCP servers initially (we'll update it later)
    const mcpServers: MCPServerStreamableHttp[] = []
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
      { callId },
      '[Amazon Connect] Connected to OpenAI Realtime API'
    )

    // Handle audio from OpenAI (to send back to Amazon Connect)
    session.on('audio', (event: any) => {
      transportLayer.sendAudio(event.data, { commit: false })
    })

    // Handle session events
    session.on('error', (error) => {
      logger.error(
        { error, callId },
        '[Amazon Connect] OpenAI session error'
      )
    })

    session.on('connection_change', (status) => {
      logger.info(
        { status, callId },
        '[Amazon Connect] OpenAI connection status changed'
      )
    })

    // Connect MCP servers in background and update agent asynchronously
    // Similar to Twilio implementation
    Promise.all(
      mcpServerList.map(async (mcpServerConfig) => {
        try {
          const mcpServer = new MCPServerStreamableHttp({
            url: mcpServerConfig.url,
            name: mcpServerConfig.name,
          })
          await mcpServer.connect()
          mcpServers.push(mcpServer)
          logger.info(
            { callId, mcpServerName: mcpServerConfig.name },
            '[Amazon Connect] MCP server connected successfully'
          )
        } catch (mcpError) {
          logger.warn(
            { callId, error: mcpError, mcpServerName: mcpServerConfig.name },
            '[Amazon Connect] Failed to connect to MCP server (non-critical)'
          )
        }
      })
    )
      .then(() => {
        // Update agent with MCP servers after they're connected
        if (mcpServers.length > 0) {
          const updatedAgent = frontDeskAgentForPhone(mcpServers)
          session.updateAgent(updatedAgent)
          logger.info(
            { callId, mcpServerCount: mcpServers.length },
            '[Amazon Connect] Agent updated with MCP servers'
          )
        }
      })
      .catch((error) => {
        logger.error(
          { error, callId },
          '[Amazon Connect] Error during MCP server connection process'
        )
      })

    // Process WebRTC audio and send to OpenAI
    // The audio track will be processed to extract PCM data
    // Note: In Node.js, WebRTC audio processing requires special handling
    // We'll need to process audio frames as they arrive from the WebRTC connection
    
    // Set up audio processing from the WebRTC track
    // The transport layer will handle audio conversion
    logger.info(
      { callId },
      '[Amazon Connect] WebRTC audio track ready, waiting for audio frames'
    )
    
    // Note: Actual audio frame processing will happen when WebRTC starts receiving audio
    // The transport layer's processIncomingAudio method will be called with audio data
    
    // Cleanup on WebRTC disconnect
    webrtcHandler.on('disconnected', async () => {
      transportLayer.close()
      await webrtcHandler.close()
      logger.info(
        { callId },
        '[Amazon Connect] Cleaned up session and WebRTC connection'
      )
    })
  })
}

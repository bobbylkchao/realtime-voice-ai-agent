/**
 * WebRTC Service
 * Handles WebRTC connections, data channels, and audio stream transmission
 */

import { SignalingMessage, createWebSocketService, DEFAULT_WEBSOCKET_CONFIG, WebSocketServiceConfig, WebSocketService } from './websocket'

export interface WebRTCConfig {
  iceServers: RTCIceServer[]
}

export interface WebRTCServiceCallbacks {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  onDataChannelOpen?: (channel: RTCDataChannel) => void
  onDataChannelMessage?: (message: any) => void
  onDataChannelError?: (error: Event) => void
  onIceCandidate?: (candidate: RTCIceCandidate) => void
}

export interface AudioData {
  type: 'audio-chunk' | 'audio-stop'
  data?: number[]
  timestamp: number
  rms?: number
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private config: WebRTCConfig
  private callbacks: WebRTCServiceCallbacks

  constructor(config: WebRTCConfig, callbacks: WebRTCServiceCallbacks = {}) {
    this.config = config
    this.callbacks = callbacks
  }

  /**
   * Initialize PeerConnection
   */
  async initPeerConnection(): Promise<RTCPeerConnection> {
    if (this.peerConnection) {
      return this.peerConnection
    }

    this.peerConnection = new RTCPeerConnection(this.config)

    // Setup ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate?.(event.candidate)
      }
    }

    // Setup connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      if (state) {
        console.log('WebRTC connection state:', state)
        this.callbacks.onConnectionStateChange?.(state)
      }
    }

    // Setup data channel monitoring
    this.peerConnection.ondatachannel = (event) => {
      const channel = event.channel
      this.setupDataChannel(channel)
    }

    return this.peerConnection
  }

  /**
   * Create data channel
   */
  createDataChannel(label: string = 'audio', options?: RTCDataChannelInit): RTCDataChannel {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized')
    }

    const channel = this.peerConnection.createDataChannel(label, {
      ordered: true,
      ...options
    })

    this.setupDataChannel(channel)
    this.dataChannel = channel

    return channel
  }

  /**
   * Setup data channel event listeners
   */
  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log('Data channel opened')
      this.callbacks.onDataChannelOpen?.(channel)
    }

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.callbacks.onDataChannelMessage?.(data)
      } catch (error) {
        console.error('Failed to parse data channel message:', error)
      }
    }

    channel.onerror = (error) => {
      console.error('Data channel error:', error)
      this.callbacks.onDataChannelError?.(error)
    }

    channel.onclose = () => {
      console.log('Data channel closed')
    }
  }

  /**
   * Create offer
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized')
    }

    const offer = await this.peerConnection.createOffer()
    await this.peerConnection.setLocalDescription(offer)
    return offer
  }

  /**
   * Create answer
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized')
    }

    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)
    return answer
  }

  /**
   * Set remote description
   */
  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized')
    }

    await this.peerConnection.setRemoteDescription(description)
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized')
    }

    await this.peerConnection.addIceCandidate(candidate)
  }

  /**
   * Send audio data
   */
  sendAudioData(audioData: AudioData): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(audioData))
      return true
    } else {
      console.warn('Data channel not open, cannot send audio data')
      return false
    }
  }

  /**
   * Send audio chunk
   */
  sendAudioChunk(data: number[], timestamp: number, rms: number): boolean {
    return this.sendAudioData({
      type: 'audio-chunk',
      data,
      timestamp,
      rms
    })
  }

  /**
   * Send audio stop signal
   */
  sendAudioStop(timestamp: number): boolean {
    return this.sendAudioData({
      type: 'audio-stop',
      timestamp
    })
  }

  /**
   * Get connection state
   */
  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.peerConnection?.connectionState === 'connected'
  }

  /**
   * Get data channel state
   */
  getDataChannelState(): RTCDataChannelState | null {
    return this.dataChannel?.readyState || null
  }

  /**
   * Check if data channel is open
   */
  isDataChannelOpen(): boolean {
    return this.dataChannel?.readyState === 'open'
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }

    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }
  }

  /**
   * Update callback functions
   */
  updateCallbacks(newCallbacks: Partial<WebRTCServiceCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...newCallbacks }
  }
}

/**
 * Create WebRTC service instance
 */
export const createWebRTCService = (
  config: WebRTCConfig, 
  callbacks?: WebRTCServiceCallbacks
): WebRTCService => {
  return new WebRTCService(config, callbacks)
}

/**
 * Default WebRTC configuration
 */
export const DEFAULT_WEBRTC_CONFIG: WebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

/**
 * Utility function to handle signaling messages
 */
export const handleSignalingMessage = async (
  webrtcService: WebRTCService,
  message: SignalingMessage,
  onSendMessage: (message: SignalingMessage) => void
): Promise<void> => {
  switch (message.type) {
    case 'offer':
      if (message.offer) {
        await webrtcService.setRemoteDescription(message.offer)
        const answer = await webrtcService.createAnswer()
        onSendMessage({
          type: 'answer',
          answer
        })
      }
      break

    case 'answer':
      if (message.answer) {
        await webrtcService.setRemoteDescription(message.answer)
      }
      break

    case 'ice-candidate':
      if (message.candidate) {
        await webrtcService.addIceCandidate(message.candidate)
      }
      break

    default:
      console.log('Unknown signaling message type:', message.type)
  }
}

/**
 * Initialize WebRTC services with WebSocket signaling
 */
export const initWebRTCServices = async (
  webrtcConfig: WebRTCConfig = DEFAULT_WEBRTC_CONFIG,
  websocketConfig: Partial<WebSocketServiceConfig> = DEFAULT_WEBSOCKET_CONFIG,
  callbacks?: {
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void
    onDataChannelOpen?: (channel: RTCDataChannel) => void
    onDataChannelMessage?: (message: any) => void
    onWebSocketOpen?: () => void
    onWebSocketClose?: () => void
    onWebSocketError?: (error: Event) => void
  }
): Promise<{ webrtcService: WebRTCService, wsService: WebSocketService }> => {
  // Create WebSocket service first
  const wsService = createWebSocketService({
    serverUrl: websocketConfig.serverUrl || DEFAULT_WEBSOCKET_CONFIG.serverUrl || 'ws://localhost:4000',
    onMessage: async (message: SignalingMessage) => {
      // This will be set after WebRTC service is created
      if (webrtcService) {
        await handleSignalingMessage(
          webrtcService,
          message,
          (msg) => wsService.send(msg)
        )
      }
    },
    onOpen: callbacks?.onWebSocketOpen,
    onClose: callbacks?.onWebSocketClose,
    onError: callbacks?.onWebSocketError
  })

  // Create WebRTC service
  const webrtcService = createWebRTCService(webrtcConfig, {
    onConnectionStateChange: callbacks?.onConnectionStateChange,
    onDataChannelOpen: callbacks?.onDataChannelOpen,
    onDataChannelMessage: callbacks?.onDataChannelMessage,
    onIceCandidate: (candidate) => {
      wsService.sendIceCandidate(candidate)
    }
  })

  // Connect WebSocket
  await wsService.connect()

  // Initialize PeerConnection
  await webrtcService.initPeerConnection()

  // Create data channel
  webrtcService.createDataChannel('audio')

  // Create and send offer
  const offer = await webrtcService.createOffer()
  wsService.sendOffer(offer)

  return { webrtcService, wsService }
}

import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from '@roamhq/wrtc'
import { EventEmitter } from 'events'
import logger from '../../misc/logger'

export interface KvsSignalingMessage {
  messageType: string
  [key: string]: any
}

export class KvsWebRtcHandler extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null
  private callId: string = ''

  constructor() {
    super()
  }

  /**
   * Initialize WebRTC peer connection
   */
  initializePeerConnection(): RTCPeerConnection {
    if (this.peerConnection) {
      return this.peerConnection
    }

    // Create peer connection with STUN servers
    // AWS KVS provides TURN servers via GetIceServerConfig
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:stun.kinesisvideo.us-east-1.amazonaws.com:443',
        },
      ],
    })

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        logger.debug(
          { candidate: event.candidate.candidate },
          '[Amazon Connect WebRTC] ICE candidate generated'
        )
        this.emit('ice-candidate', event.candidate)
      }
    }

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState
      logger.info(
        { state, callId: this.callId },
        '[Amazon Connect WebRTC] ICE connection state changed'
      )

      if (state === 'connected' || state === 'completed') {
        this.emit('connected')
      } else if (state === 'failed' || state === 'disconnected') {
        this.emit('disconnected')
      }
    }

    // Handle incoming audio tracks
    this.peerConnection.ontrack = (event) => {
      logger.info(
        { callId: this.callId, kind: event.track.kind },
        '[Amazon Connect WebRTC] Received remote track'
      )

      if (event.track.kind === 'audio') {
        this.emit('audio-track', event.track)
      }
    }

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      logger.info(
        { state, callId: this.callId },
        '[Amazon Connect WebRTC] Connection state changed'
      )
    }

    return this.peerConnection
  }

  /**
   * Handle SDP offer from KVS
   */
  async handleSdpOffer(sdpOffer: string): Promise<string> {
    if (!this.peerConnection) {
      this.initializePeerConnection()
    }

    const pc = this.peerConnection!
    const offer = new RTCSessionDescription({
      type: 'offer',
      sdp: sdpOffer,
    })

    await pc.setRemoteDescription(offer)
    logger.info(
      { callId: this.callId },
      '[Amazon Connect WebRTC] Set remote description (offer)'
    )

    // Create answer
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    logger.info(
      { callId: this.callId },
      '[Amazon Connect WebRTC] Created and set local description (answer)'
    )

    return pc.localDescription!.sdp
  }

  /**
   * Handle ICE candidate from KVS
   */
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      logger.warn('[Amazon Connect WebRTC] Peer connection not initialized, ignoring ICE candidate')
      return
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      logger.debug(
        { callId: this.callId },
        '[Amazon Connect WebRTC] Added ICE candidate'
      )
    } catch (error) {
      logger.error(
        { error, callId: this.callId },
        '[Amazon Connect WebRTC] Error adding ICE candidate'
      )
    }
  }

  /**
   * Add audio track for sending to KVS
   * This creates a local audio track that will be sent to Amazon Connect
   */
  async addLocalAudioTrack(): Promise<MediaStreamTrack | null> {
    if (!this.peerConnection) {
      logger.warn('[Amazon Connect WebRTC] Peer connection not initialized')
      return null
    }

    try {
      // Create a MediaStreamTrack for audio output
      // In @roamhq/wrtc, we need to use a different approach
      // We'll create a track using the peer connection's addTrack method
      
      // For now, return null - we'll need to implement proper audio track creation
      // This requires creating an audio source and adding it to the peer connection
      logger.info(
        { callId: this.callId },
        '[Amazon Connect WebRTC] Local audio track creation - to be implemented'
      )
      
      return null
    } catch (error) {
      logger.error(
        { error, callId: this.callId },
        '[Amazon Connect WebRTC] Error creating local audio track'
      )
      return null
    }
  }

  /**
   * Get audio track for receiving from KVS
   */
  getRemoteAudioTrack(): MediaStreamTrack | null {
    if (!this.peerConnection) {
      return null
    }

    const receivers = this.peerConnection.getReceivers()
    const audioReceiver = receivers.find((receiver) => receiver.track?.kind === 'audio')
    return audioReceiver?.track || null
  }

  /**
   * Close peer connection
   */
  async close(): Promise<void> {
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
      logger.info(
        { callId: this.callId },
        '[Amazon Connect WebRTC] Peer connection closed'
      )
    }
  }

  setCallId(callId: string): void {
    this.callId = callId
  }
}


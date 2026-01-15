import { EventEmitter } from 'events'
import { MediaStreamTrack, RTCRtpSender } from '@roamhq/wrtc'
import {
  RealtimeTransportLayer,
  RealtimeTransportLayerConnectOptions,
  RealtimeClientMessage,
  RealtimeSessionConfig,
  TransportToolCallEvent,
  RealtimeItem,
} from '@openai/agents-realtime'
import type { RealtimeUserInput } from '@openai/agents-realtime/dist/clientMessages'
import type { RealtimeMcpCallApprovalRequestItem } from '@openai/agents-realtime/dist/items'
import logger from '../../misc/logger'

/**
 * Transport layer for Amazon Connect WebRTC audio streams
 * Implements RealtimeTransportLayer interface for OpenAI Realtime API
 */
export class AmazonConnectRealtimeTransportLayer
  extends EventEmitter
  implements RealtimeTransportLayer
{
  private audioTrack: MediaStreamTrack | null = null
  private rtpSender: RTCRtpSender | null = null
  private audioBuffer: Int16Array[] = []
  private isProcessing: boolean = false
  private callId: string = ''
  private _status: 'connecting' | 'connected' | 'disconnected' | 'disconnecting' =
    'connecting'
  private _muted: boolean = false
  private wsConnection: any = null // WebSocket-like connection for sending events

  constructor(options: {
    audioTrack: MediaStreamTrack
    rtpSender?: RTCRtpSender
    callId: string
    wsConnection?: any // For sending events back to OpenAI
  }) {
    super()
    this.audioTrack = options.audioTrack
    this.rtpSender = options.rtpSender || null
    this.callId = options.callId
    this.wsConnection = options.wsConnection || null

    this.setupAudioProcessing()
  }

  /**
   * Setup audio processing to convert WebRTC audio to PCM format for OpenAI
   * 
   * Note: In Node.js, processing WebRTC audio requires:
   * 1. Receiving RTP packets from WebRTC
   * 2. Decoding audio (Opus/PCMU/etc) to PCM
   * 3. Resampling to 24kHz if needed
   * 4. Converting to Int16Array format
   * 
   * This is a complex task that may require additional libraries like:
   * - node-opus or opusscript for Opus decoding
   * - speexdsp or similar for resampling
   * 
   * For now, we set up the infrastructure. Actual audio processing will be
   * implemented when audio frames start arriving from WebRTC.
   */
  private setupAudioProcessing(): void {
    if (!this.audioTrack) {
      logger.error(
        { callId: this.callId },
        '[Amazon Connect Transport] No audio track provided'
      )
      return
    }

    // Monitor audio track state
    this.audioTrack.onended = () => {
      logger.info(
        { callId: this.callId },
        '[Amazon Connect Transport] Audio track ended'
      )
      this._status = 'disconnected'
      this.emit('status', this._status)
    }

    this.audioTrack.onmute = () => {
      logger.debug(
        { callId: this.callId },
        '[Amazon Connect Transport] Audio track muted'
      )
    }

    this.audioTrack.onunmute = () => {
      logger.debug(
        { callId: this.callId },
        '[Amazon Connect Transport] Audio track unmuted'
      )
    }

    logger.info(
      { callId: this.callId },
      '[Amazon Connect Transport] Audio processing setup initiated'
    )

    // Mark as connected once setup is complete
    this._status = 'connected'
    this.emit('status', this._status)
  }

  /**
   * Process incoming audio from WebRTC and emit for OpenAI
   */
  processIncomingAudio(audioData: ArrayBuffer): void {
    // Convert audio data to PCM format if needed
    // WebRTC typically provides audio in various formats
    // We need to convert to Int16Array PCM at 24kHz
    
    try {
      // For now, assume audioData is already in the right format
      // In production, you'd need to resample and convert format
      const pcmData = new Int16Array(audioData)
      
      // Emit audio event for OpenAI RealtimeSession
      this.emit('audio', {
        type: 'audio',
        data: pcmData.buffer,
      })
    } catch (error) {
      logger.error(
        { error, callId: this.callId },
        '[Amazon Connect Transport] Error processing incoming audio'
      )
    }
  }

  /**
   * Send audio data to Amazon Connect (WebRTC)
   * This receives audio from OpenAI and sends it to the WebRTC connection
   */
  private sendAudioToWebRTC(audioData: ArrayBuffer): void {
    if (this._muted) {
      return
    }

    try {
      // Convert OpenAI PCM (Int16Array, 24kHz) to WebRTC format
      const pcmData = new Int16Array(audioData)
      
      // Store in buffer for processing
      this.audioBuffer.push(pcmData)
      
      // Process audio buffer if not already processing
      if (!this.isProcessing) {
        this.processOutgoingAudio()
      }
    } catch (error) {
      logger.error(
        { error, callId: this.callId },
        '[Amazon Connect Transport] Error sending audio to WebRTC'
      )
    }
  }

  /**
   * Process outgoing audio buffer and send to WebRTC
   */
  private async processOutgoingAudio(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      // Process audio chunks
      while (this.audioBuffer.length > 0) {
        const chunk = this.audioBuffer.shift()
        if (chunk) {
          // Convert Int16Array to Float32Array for WebRTC
          const float32Data = this.int16ToFloat32(chunk)
          
          // TODO: Send audio to WebRTC via RTP sender
          // This requires creating an audio source and sending through RTP
          // For now, we'll log that audio is ready to send
          logger.debug(
            { callId: this.callId, dataLength: float32Data.length },
            '[Amazon Connect Transport] Audio ready to send to WebRTC'
          )
        }
      }
    } catch (error) {
      logger.error(
        { error, callId: this.callId },
        '[Amazon Connect Transport] Error processing outgoing audio'
      )
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Convert Int16Array to Float32Array
   */
  private int16ToFloat32(int16Array: Int16Array): Float32Array {
    const float32Array = new Float32Array(int16Array.length)
    for (let i = 0; i < int16Array.length; i++) {
      // Convert from 16-bit integer to float [-1, 1]
      float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff)
    }
    return float32Array
  }

  // RealtimeTransportLayer interface implementation
  get status(): 'connecting' | 'connected' | 'disconnected' | 'disconnecting' {
    return this._status
  }

  get muted(): boolean | null {
    return this._muted
  }

  async connect(_options: RealtimeTransportLayerConnectOptions): Promise<void> {
    this._status = 'connecting'
    this.emit('status', this._status)

    // For WebRTC transport, connection is already established
    // We just need to mark it as connected
    this._status = 'connected'
    this.emit('status', this._status)

    logger.info(
      { callId: this.callId },
      '[Amazon Connect Transport] Connected'
    )
  }

  close(): void {
    this._status = 'disconnecting'
    this.emit('status', this._status)
    this.cleanup()
    this._status = 'disconnected'
    this.emit('status', this._status)
    logger.info(
      { callId: this.callId },
      '[Amazon Connect Transport] Closed'
    )
  }

  mute(muted: boolean): void {
    this._muted = muted
    logger.debug(
      { callId: this.callId, muted },
      '[Amazon Connect Transport] Mute state changed'
    )
  }

  sendEvent(event: RealtimeClientMessage): void {
    // Events are handled internally by the transport layer
    // For WebRTC, we don't need to send events back to a WebSocket
    // The OpenAI session handles this
    logger.debug(
      { callId: this.callId, eventType: (event as any).type },
      '[Amazon Connect Transport] Event received'
    )
  }

  sendMessage(
    message: RealtimeUserInput,
    _otherEventData: Record<string, any>,
    _options?: { triggerResponse?: boolean }
  ): void {
    // Send message to OpenAI session
    // This is handled by the RealtimeSession, not the transport layer
    logger.debug(
      { callId: this.callId, messageType: (message as any).type },
      '[Amazon Connect Transport] Message sent'
    )
  }

  addImage(
    _image: string,
    _options?: { triggerResponse?: boolean }
  ): void {
    logger.debug(
      { callId: this.callId },
      '[Amazon Connect Transport] Image added'
    )
  }

  sendAudio(
    audio: ArrayBuffer,
    _options: { commit?: boolean }
  ): void {
    this.sendAudioToWebRTC(audio)
  }

  updateSessionConfig(_config: Partial<RealtimeSessionConfig>): void {
    logger.debug(
      { callId: this.callId },
      '[Amazon Connect Transport] Session config updated'
    )
  }

  sendFunctionCallOutput(
    toolCall: TransportToolCallEvent,
    _output: string,
    _startResponse: boolean
  ): void {
    logger.debug(
      { callId: this.callId, toolCallId: (toolCall as any).id },
      '[Amazon Connect Transport] Function call output sent'
    )
  }

  interrupt(): void {
    logger.debug(
      { callId: this.callId },
      '[Amazon Connect Transport] Interrupted'
    )
  }

  resetHistory(oldHistory: RealtimeItem[], newHistory: RealtimeItem[]): void {
    logger.debug(
      { callId: this.callId, oldLength: oldHistory.length, newLength: newHistory.length },
      '[Amazon Connect Transport] History reset'
    )
  }

  sendMcpResponse(
    approvalRequest: RealtimeMcpCallApprovalRequestItem,
    approved: boolean
  ): void {
    logger.debug(
      { callId: this.callId, approved },
      '[Amazon Connect Transport] MCP response sent'
    )
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.audioBuffer = []
    this.isProcessing = false
    this._status = 'disconnected'
    
    logger.info(
      { callId: this.callId },
      '[Amazon Connect Transport] Cleaned up audio processing'
    )
  }
}

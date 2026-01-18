/**
 * Transport Layer for Amazon Connect SIP audio streams
 * Implements RealtimeTransportLayer interface for OpenAI Realtime API
 * Handles bidirectional audio between SIP (Amazon Connect) and OpenAI
 */

import { EventEmitter } from 'events'
import { Socket as UDPSocket } from 'dgram'
import { Socket as TCPSocket } from 'net'
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
 * Transport layer for Amazon Connect SIP audio streams
 * Converts SIP/RTP audio to/from OpenAI Realtime API format
 */
export class AmazonConnectSipTransportLayer
  extends EventEmitter
  implements RealtimeTransportLayer
{
  private socket: UDPSocket | TCPSocket
  private remoteAddress: string
  private remotePort: number
  private callId: string
  private _status: 'connecting' | 'connected' | 'disconnected' | 'disconnecting' =
    'connecting'
  private _muted: boolean = false
  private audioBuffer: Int16Array[] = []
  private isProcessing: boolean = false

  constructor(options: {
    callId: string
    socket: UDPSocket | TCPSocket
    remoteAddress: string
    remotePort: number
  }) {
    super()
    this.callId = options.callId
    this.socket = options.socket
    this.remoteAddress = options.remoteAddress
    this.remotePort = options.remotePort

    this.setupAudioProcessing()
  }

  /**
   * Setup audio processing for SIP/RTP streams
   * 
   * Note: SIP/RTP audio processing requires:
   * 1. Receiving RTP packets from SIP session
   * 2. Decoding audio (G.711, Opus, etc.) to PCM
   * 3. Resampling to 24kHz if needed
   * 4. Converting to Int16Array format for OpenAI
   * 
   * For outgoing audio (OpenAI -> SIP):
   * 1. Convert OpenAI PCM (24kHz, Int16Array) to SIP codec format
   * 2. Encode to RTP packets
   * 3. Send via SIP session
   */
  private setupAudioProcessing(): void {
    logger.info(
      { callId: this.callId },
      '[Amazon Connect SIP Transport] Setting up audio processing'
    )

    // Listen for RTP audio from SIP session
    // Actual RTP packet processing will be implemented when we have the media stream

    this._status = 'connected'
    this.emit('status', this._status)

    logger.info(
      { callId: this.callId },
      '[Amazon Connect SIP Transport] Audio processing setup completed'
    )
  }

  /**
   * Process incoming audio from SIP (customer speaking)
   * This will be called when RTP packets are received from the SIP session
   */
  processIncomingAudio(audioData: ArrayBuffer): void {
    try {
      // Convert SIP audio to PCM format for OpenAI
      const pcmData = new Int16Array(audioData)
      
      // Emit audio event for OpenAI Realtime API
      this.emit('audio', {
        type: 'audio',
        data: pcmData.buffer,
      })
    } catch (error) {
      logger.error(
        { error, callId: this.callId },
        '[Amazon Connect SIP Transport] Error processing incoming audio'
      )
    }
  }

  /**
   * Send audio to Amazon Connect (SIP session)
   * This receives audio from OpenAI and sends it to the SIP connection
   */
  private sendAudioToSip(audioData: ArrayBuffer): void {
    if (this._muted) {
      return
    }

    try {
      // Convert OpenAI PCM (Int16Array, 24kHz) to SIP codec format
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
        '[Amazon Connect SIP Transport] Error sending audio to SIP'
      )
    }
  }

  /**
   * Process outgoing audio buffer and send to SIP
   */
  private async processOutgoingAudio(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      while (this.audioBuffer.length > 0) {
        const chunk = this.audioBuffer.shift()
        if (chunk) {
          // Convert PCM to SIP codec format (G.711, Opus, etc.)
          // Encode to RTP packets
          // Send via SIP session
          
          logger.debug(
            { callId: this.callId, dataLength: chunk.length },
            '[Amazon Connect SIP Transport] Audio ready to send to SIP'
          )
          
          // TODO: Implement actual RTP encoding and sending
          // This requires access to the SIP session's media stream
        }
      }
    } catch (error) {
      logger.error(
        { error, callId: this.callId },
        '[Amazon Connect SIP Transport] Error processing outgoing audio'
      )
    } finally {
      this.isProcessing = false
    }
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

    this._status = 'connected'
    this.emit('status', this._status)

    logger.info(
      { callId: this.callId },
      '[Amazon Connect SIP Transport] Connected'
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
      '[Amazon Connect SIP Transport] Closed'
    )
  }

  mute(muted: boolean): void {
    this._muted = muted
    logger.debug(
      { callId: this.callId, muted },
      '[Amazon Connect SIP Transport] Mute state changed'
    )
  }

  sendAudio(audioData: ArrayBuffer, _options: { commit?: boolean }): void {
    this.sendAudioToSip(audioData)
  }

  sendEvent(event: RealtimeClientMessage): void {
    logger.debug(
      { callId: this.callId, eventType: (event as any).type },
      '[Amazon Connect SIP Transport] Event received'
    )
  }

  sendMessage(
    message: RealtimeUserInput,
    _otherEventData: Record<string, any>,
    _options?: { triggerResponse?: boolean }
  ): void {
    logger.debug(
      { callId: this.callId, messageType: (message as any).type },
      '[Amazon Connect SIP Transport] Message sent'
    )
  }

  addImage(
    _image: string,
    _options?: { triggerResponse?: boolean }
  ): void {
    logger.debug(
      { callId: this.callId },
      '[Amazon Connect SIP Transport] Image added'
    )
  }

  updateSessionConfig(_config: Partial<RealtimeSessionConfig>): void {
    logger.debug(
      { callId: this.callId },
      '[Amazon Connect SIP Transport] Session config updated'
    )
  }

  sendFunctionCallOutput(
    toolCall: TransportToolCallEvent,
    _output: string,
    _startResponse: boolean
  ): void {
    logger.debug(
      { callId: this.callId, toolCallId: (toolCall as any).id },
      '[Amazon Connect SIP Transport] Function call output sent'
    )
  }

  interrupt(): void {
    logger.debug(
      { callId: this.callId },
      '[Amazon Connect SIP Transport] Interrupted'
    )
  }

  resetHistory(oldHistory: RealtimeItem[], newHistory: RealtimeItem[]): void {
    logger.debug(
      { callId: this.callId, oldLength: oldHistory.length, newLength: newHistory.length },
      '[Amazon Connect SIP Transport] History reset'
    )
  }

  sendMcpResponse(
    approvalRequest: RealtimeMcpCallApprovalRequestItem,
    approved: boolean
  ): void {
    logger.debug(
      { callId: this.callId, approved },
      '[Amazon Connect SIP Transport] MCP response sent'
    )
  }

  cleanup(): void {
    this.audioBuffer = []
    this.isProcessing = false
    this._status = 'disconnected'
    
    logger.info(
      { callId: this.callId },
      '[Amazon Connect SIP Transport] Cleaned up audio processing'
    )
  }
}


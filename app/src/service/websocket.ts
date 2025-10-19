/**
 * WebSocket Signaling Service
 */

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'audio-chunk' | 'audio-stop'
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  data?: any
  timestamp?: number
}

export interface WebSocketServiceConfig {
  serverUrl: string
  onMessage?: (message: SignalingMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
}

export class WebSocketService {
  private ws: WebSocket | null = null
  private config: WebSocketServiceConfig
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(config: WebSocketServiceConfig) {
    this.config = config
  }

  async connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl)
        
        this.ws.onopen = () => {
          console.log('WebSocket connection established')
          this.reconnectAttempts = 0
          this.config.onOpen?.()
          resolve(this.ws!)
        }
        
        this.ws.onerror = (error) => {
          console.error('WebSocket connection error:', error)
          this.config.onError?.(error)
          reject(error)
        }
        
        this.ws.onclose = () => {
          console.log('WebSocket connection closed')
          this.config.onClose?.()
          this.handleReconnect()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data: SignalingMessage = JSON.parse(event.data)
            this.config.onMessage?.(data)
          } catch (error) {
            console.error('Error processing signaling message:', error)
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Send message to server
   */
  send(message: SignalingMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      return true
    } else {
      console.warn('WebSocket not connected, cannot send message')
      return false
    }
  }

  /**
   * Send offer
   */
  sendOffer(offer: RTCSessionDescriptionInit): boolean {
    return this.send({
      type: 'offer',
      offer
    })
  }

  /**
   * Send answer
   */
  sendAnswer(answer: RTCSessionDescriptionInit): boolean {
    return this.send({
      type: 'answer',
      answer
    })
  }

  /**
   * Send ICE candidate
   */
  sendIceCandidate(candidate: RTCIceCandidateInit): boolean {
    return this.send({
      type: 'ice-candidate',
      candidate
    })
  }

  /**
   * Send audio data
   */
  sendAudioData(data: any, timestamp: number): boolean {
    return this.send({
      type: 'audio-chunk',
      data,
      timestamp
    })
  }

  /**
   * Send audio stop signal
   */
  sendAudioStop(timestamp: number): boolean {
    return this.send({
      type: 'audio-stop',
      timestamp
    })
  }

  /**
   * Get connection state
   */
  getConnectionState(): number | null {
    return this.ws?.readyState || null
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error)
        })
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.error('Maximum reconnection attempts reached, stopping reconnection')
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WebSocketServiceConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }
}

/**
 * Create WebSocket service instance
 */
export const createWebSocketService = (config: WebSocketServiceConfig): WebSocketService => {
  return new WebSocketService(config)
}

/**
 * Default configuration
 */
export const DEFAULT_WEBSOCKET_CONFIG: Partial<WebSocketServiceConfig> = {
  serverUrl: 'ws://localhost:4000'
}

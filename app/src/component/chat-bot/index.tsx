import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  PhoneOutlined,
  PoweroffOutlined,
} from '@ant-design/icons'
import {
  ChatContainer,
  ChatDisplay,
  ChatInputContainer,
  SubmitButton,
  StopButton,
} from './styled'
import { initAudioStreaming, terminateAudioStreaming } from '../../service/audio-streaming'
import type { WebsocketCallbackArgs } from '../../service/websocket'
import { initWebSocketConnection, WebsocketClient } from '../../service/websocket'

const endCallButtonContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const StartCallButton = React.memo(({
  onStart,
  isConnected,
}: {
  onStart: () => void
  isConnected: boolean
}): React.ReactElement => {
  return (
    <SubmitButton
      onClick={onStart}
      disabled={!isConnected}
    >
      <PhoneOutlined style={{ fontSize: 25 }} />
    </SubmitButton>
  )
})

const EndCallButton = React.memo(({ 
  onEnd,
}: { 
  onEnd: () => void
}): React.ReactElement => {
  return (
    <div style={endCallButtonContainerStyle}>
      <StopButton onClick={onEnd}>
        <PoweroffOutlined style={{ fontSize: 25 }} />
      </StopButton>
    </div>
  )
})

const ChatBot = (): React.ReactElement => {
  // TODO: Deprecated, use isSessionStarted
  const [isPhoneStart, setIsPhoneStart] = useState<boolean>(false)
  const [websocketTunnel, setWebsocketTunnel] = useState<WebsocketCallbackArgs>({
    status: 'CONNECTING',
    responseData: undefined,
  })
  const isSessionStartedRef = useRef<boolean>(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef<boolean>(false)

  useEffect(() => {
    initWebSocketConnection(({ status, responseData }) => {
      setWebsocketTunnel({
        status,
        responseData,
      })

      if (responseData?.event === 'SESSION_START_SUCCESS') {
        isSessionStartedRef.current = true
      }
    })
  }, [])

  const handleVoiceStart = useCallback(async () => {
    if (isPhoneStart) return

    WebsocketClient?.emit('message', {
      event: 'SESSION_START',
    })

    await initAudioStreaming((audioChunk) => {
      if (!isSessionStartedRef.current) {
        return
      }
      WebsocketClient?.emit('message', {
        event: 'USER_AUDIO_CHUNK',
        data: audioChunk,
      })
    })

    setIsPhoneStart(true)
  }, [isPhoneStart])

  const handleVoiceEnd = useCallback(() => {
    WebsocketClient?.emit('message', {
      event: 'SESSION_END',
    })
    setIsPhoneStart(false)
    isSessionStartedRef.current = false
    terminateAudioStreaming()
    
    // Clear audio queue when session ends
    audioQueueRef.current = []
    isPlayingRef.current = false
    console.log('Cleared audio queue')
  }, [])

  const playAudioChunk = useCallback(async (audioChunk: ArrayBuffer) => {
    // Add to queue
    audioQueueRef.current.push(audioChunk)
    console.log('Added audio chunk to queue. Queue length:', audioQueueRef.current.length)
    
    // Start processing queue if not already playing
    if (!isPlayingRef.current) {
      processAudioQueue()
    }
  }, [])

  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return
    }

    isPlayingRef.current = true
    const audioChunk = audioQueueRef.current.shift()
    
    if (!audioChunk) {
      isPlayingRef.current = false
      return
    }

    try {
      console.log('Playing audio chunk:', {
        size: audioChunk.byteLength,
        queueLength: audioQueueRef.current.length,
      })
      
      // Create an AudioContext
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Convert ArrayBuffer to Int16Array (PCM16)
      const int16Array = new Int16Array(audioChunk)
      
      // Convert Int16Array to Float32Array
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 0x7FFF // Normalize to -1.0 to 1.0
      }
      
      // Create an AudioBuffer with the correct sample rate (OpenAI Realtime API uses 24kHz)
      const audioBufferObj = audioContext.createBuffer(1, float32Array.length, 24000)
      audioBufferObj.copyToChannel(float32Array, 0) // Copy PCM data to the buffer
      
      // Create a BufferSource to play the audio
      const source = audioContext.createBufferSource()
      source.buffer = audioBufferObj
      source.connect(audioContext.destination)
      
      // When this chunk finishes playing, process the next one
      source.onended = () => {
        console.log('Audio chunk finished playing')
        isPlayingRef.current = false
        // Process next chunk in queue
        setTimeout(() => processAudioQueue(), 10) // Small delay to prevent overlap
      }
      
      source.start(0) // Start playback
      console.log('Started playing audio chunk')
      
    } catch (error) {
      console.error('Error playing audio chunk:', error)
      isPlayingRef.current = false
      // Try next chunk even if this one failed
      setTimeout(() => processAudioQueue(), 10)
    }
  }, [])

  useEffect(() => {
    if (
      websocketTunnel.status === 'CONNECTED' &&
      websocketTunnel?.responseData?.event === 'USER_AUDIO_CHUNK'
    ) {
      console.log('Received audio chunk')
      console.log('WebSocket response data:', websocketTunnel.responseData)
      console.log('Data type:', typeof websocketTunnel.responseData.data)
      console.log('Data constructor:', websocketTunnel.responseData.data?.constructor?.name)
      
      const audioChunkFromServer = websocketTunnel.responseData.data as ArrayBuffer
      playAudioChunk(audioChunkFromServer)
    }
  }, [websocketTunnel])

  return (
    <ChatContainer>
      <div style={{
        marginBottom: 10,
        color: 'gray',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        Connection status: { websocketTunnel.status }
      </div>
      <ChatDisplay>
        <div id="chatbot-container-bottom" style={{height: 20}} ref={chatEndRef} />
      </ChatDisplay>
      <ChatInputContainer>
        {
          isPhoneStart
            ? <EndCallButton 
                onEnd={handleVoiceEnd}
              />
            : <StartCallButton
                onStart={handleVoiceStart}
                isConnected={websocketTunnel.status === 'CONNECTED'}
              />
        }
      </ChatInputContainer>
    </ChatContainer>
  )
}

export default ChatBot

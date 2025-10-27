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
  const [websocketTunnel, setWebsocketTunnel] = useState<WebsocketCallbackArgs>({
    status: 'CONNECTING',
    responseData: undefined,
  })
  const isSessionStartedRef = useRef<boolean>(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef<boolean>(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBufferQueueRef = useRef<AudioBuffer[]>([])
  const isProcessingQueueRef = useRef<boolean>(false)

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
    if (isSessionStartedRef.current) return

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
  }, [])

  const handleVoiceEnd = useCallback(() => {
    WebsocketClient?.emit('message', {
      event: 'SESSION_END',
    })
    isSessionStartedRef.current = false
    terminateAudioStreaming()
    
    // Clear audio queue when session ends
    audioQueueRef.current = []
    isPlayingRef.current = false
    
    // Close AudioContext to free resources
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }, [])

  const playAudioChunk = useCallback(async (audioChunk: ArrayBuffer) => {
    // Add to queue
    audioQueueRef.current.push(audioChunk)
    
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
    
    // Process all available chunks at once to create seamless audio
    const chunksToProcess: ArrayBuffer[] = []
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()
      if (chunk) {
        chunksToProcess.push(chunk)
      }
    }
    
    if (chunksToProcess.length === 0) {
      isPlayingRef.current = false
      return
    }

    try {
      // Get or create AudioContext (reuse existing one)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      
      // Resume context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      const audioContext = audioContextRef.current
      
      // Concatenate all chunks into one continuous audio buffer
      const allInt16Arrays: Int16Array[] = []
      let totalSamples = 0
      
      for (const chunk of chunksToProcess) {
        const int16Array = new Int16Array(chunk)
        allInt16Arrays.push(int16Array)
        totalSamples += int16Array.length
      }
      
      // Create combined float32 array
      const combinedFloat32Array = new Float32Array(totalSamples)
      let offset = 0
      for (const int16Array of allInt16Arrays) {
        for (let i = 0; i < int16Array.length; i++) {
          combinedFloat32Array[offset + i] = int16Array[i] / 32768.0
        }
        offset += int16Array.length
      }
      
      // Create buffer with AudioContext's actual sample rate to avoid resampling issues
      const targetSampleRate = audioContext.sampleRate
      const resampleRatio = targetSampleRate / 24000
      const resampledLength = Math.floor(combinedFloat32Array.length * resampleRatio)
      
      // Simple linear interpolation resampling
      const resampledArray = new Float32Array(resampledLength)
      for (let i = 0; i < resampledLength; i++) {
        const originalIndex = i / resampleRatio
        const index1 = Math.floor(originalIndex)
        const index2 = Math.min(index1 + 1, combinedFloat32Array.length - 1)
        const fraction = originalIndex - index1
        
        if (index1 >= combinedFloat32Array.length) {
          resampledArray[i] = 0
        } else if (index1 === index2 || fraction === 0) {
          resampledArray[i] = combinedFloat32Array[index1]
        } else {
          resampledArray[i] = combinedFloat32Array[index1] * (1 - fraction) + combinedFloat32Array[index2] * fraction
        }
      }
      
      const audioBufferObj = audioContext.createBuffer(1, resampledArray.length, targetSampleRate)
      audioBufferObj.copyToChannel(resampledArray, 0)
      
      // Create a BufferSource to play the audio
      const source = audioContext.createBufferSource()
      source.buffer = audioBufferObj
      
      // Connect directly to destination for seamless playback
      source.connect(audioContext.destination)
      
      // When this combined audio finishes playing, process the next batch
      source.onended = () => {
        isPlayingRef.current = false
        // Process next batch of chunks
        processAudioQueue()
      }
      
      source.start(0) // Start playback
    } catch (error) {
      console.error('Error playing audio chunk:', error)
      isPlayingRef.current = false
      // Try next chunk immediately even on error
      processAudioQueue()
    }
  }, [])

  useEffect(() => {
    if (
      websocketTunnel.status === 'CONNECTED' &&
      websocketTunnel?.responseData?.event === 'USER_AUDIO_CHUNK'
    ) {
      
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
          isSessionStartedRef.current
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

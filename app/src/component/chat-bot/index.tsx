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
import { IMessage } from './types'
import { fetchChatApi } from './fetch-chat-api'
import { toast } from 'react-hot-toast'
import MessageComponent from './message-component'
import { initWebRTCServices } from '../../service/webrtc'

const MESSAGE_FILTER_REGEX = /MESSAGE_START\|([\s\S]*?)\|MESSAGE_END/g
const MESSAGE_JSON_FILTER_REGEX = /JSON_START\|([\s\S]*?)\|JSON_END/g

const endCallButtonContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const speakingIndicatorStyle: React.CSSProperties = {
  marginBottom: 10,
  color: 'gray'
}

const StartCallButton = React.memo(({ onStart }: { onStart: () => void }): React.ReactElement => {
  return (
    <SubmitButton onClick={onStart}>
      <PhoneOutlined style={{ fontSize: 25 }} />
    </SubmitButton>
  )
})

const EndCallButton = React.memo(({ 
  isSpeaking, 
  onEnd,
  isWebRTCConnected 
}: { 
  isSpeaking: boolean
  onEnd: () => void
  isWebRTCConnected: boolean
}): React.ReactElement => {
  return (
    <div style={endCallButtonContainerStyle}>
      {isSpeaking && (
        <div style={speakingIndicatorStyle}>You're talking</div>
      )}
      {!isWebRTCConnected && (
        <div style={{...speakingIndicatorStyle, color: 'orange'}}>
          Connecting to server...
        </div>
      )}
      {isWebRTCConnected && (
        <div style={{...speakingIndicatorStyle, color: 'green'}}>
          Connected
        </div>
      )}
      <StopButton onClick={onEnd}>
        <PoweroffOutlined style={{ fontSize: 25 }} />
      </StopButton>
    </div>
  )
})

const ChatBot = (): React.ReactElement => {
  const [isPhoneStart, setIsPhoneStart] = useState<boolean>(false)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false)
  const [rafId, setRafId] = useState<number>(0)
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [isWebRTCConnected, setIsWebRTCConnected] = useState<boolean>(false)
  
  // Service instances
  const wsServiceRef = useRef<any>(null)
  const webrtcServiceRef = useRef<any>(null)




  const [messages, setMessages] = useState<IMessage[] | []>([])
  const [quickActions, setQuickActions] = useState<string>('')
  const [input, setInput] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  
  
  /**
   * Voice Activity Detection (VAD)
   */
  const initVad = async (): Promise<boolean> => {
    if (audioContext) return true
    try {
      let speaking = false
      let lastSpokeTime = 0
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Initialize WebRTC services
      try {
        const { webrtcService, wsService } = await initWebRTCServices(
          undefined, // Use default WebRTC config
          undefined, // Use default WebSocket config
          {
            onConnectionStateChange: (state) => {
              console.log('WebRTC connection state:', state)
              setIsWebRTCConnected(state === 'connected')
            },
            onDataChannelOpen: (channel) => {
              console.log('Data channel opened')
            },
            onDataChannelMessage: (message) => {
              console.log('Received data channel message:', message)
            },
            onWebSocketOpen: () => {
              console.log('WebSocket connection established')
            },
            onWebSocketClose: () => {
              console.log('WebSocket connection closed')
            },
            onWebSocketError: (error) => {
              console.error('WebSocket connection error:', error)
            }
          }
        )

        webrtcServiceRef.current = webrtcService
        wsServiceRef.current = wsService
      } catch (error) {
        console.error('Failed to initialize WebRTC services:', error)
        toast.error('WebRTC initialization failed')
        return false
      }
      
      const audioContext = new AudioContext()
      setAudioContext(audioContext)
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 512

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      source.connect(analyser)

      const checkSpeaking = () => {
        if (!analyser) return
        analyser.getByteTimeDomainData(dataArray)

        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128
          sum += val * val
        }
        const rms = Math.sqrt(sum / dataArray.length)

        const now = performance.now()
        const threshold = 0.02
        const silenceDelay = 300

        if (rms > threshold) {
          lastSpokeTime = now
          if (!speaking) {
            speaking = true
            setIsSpeaking(true)
            console.log('Started speaking, sending audio data')
          }
          
          // Send audio data to backend when user is speaking
          if (webrtcServiceRef.current?.isDataChannelOpen()) {
            webrtcServiceRef.current.sendAudioChunk(
              Array.from(dataArray),
              now,
              rms
            )
          }
        } else if (speaking && now - lastSpokeTime > silenceDelay) {
          speaking = false
          setIsSpeaking(false)
          console.log('Stopped speaking')
          
          // Send stop signal
          if (webrtcServiceRef.current?.isDataChannelOpen()) {
            webrtcServiceRef.current.sendAudioStop(now)
          }
        }

        const rafId = requestAnimationFrame(checkSpeaking)
        setRafId(rafId)
      }

      checkSpeaking()

      return true
    } catch (err) {
      console.error('Microphone access failed:', err)
      return false
    }
  }

  const handleErrorMessage = () => {
    setMessages(preMessage => {
      if (preMessage.length === 0) {
        return [{
          content: 'Request failed, please refresh the page and try again.',
          role: 'assistant',
          timestamp: new Date(),
        }]
      }

      return preMessage.map(msg => {
        if (msg.content === 'loading' && msg.role === 'assistant') {
          return { ...msg, content: 'Request failed, please refresh the page and try again.' }
        }
        return msg
      })
    })
  }

  const handleSend = useCallback(async (value?: string) => {
    const inputValue = value || input.trim()
    if (inputValue) {
      const userNewMessage: IMessage = {
        role: 'user',
        content: inputValue,
        timestamp: new Date(),
      }
  
      const loadingMessage: IMessage = {
        role: 'assistant',
        content: 'loading',
        timestamp: new Date(),
      }

      setMessages((prevMessages) => [...prevMessages, userNewMessage, loadingMessage])
      setInput('')

      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
  
      try {
        const requestPayload = JSON.stringify({
          messages: [...messages, userNewMessage],
        })

        const response = await fetchChatApi(requestPayload)
        
        if (!response || !response?.ok) {
          handleErrorMessage()
          return toast.error(response?.statusText || 'Data fetch failed!')
        }

        const stream = response.body
        if (!stream) return
  
        const reader = stream.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ''
  
        const readChunk = async () => {
          const { value, done } = await reader.read()
          if (done) {
            const messagesFilterInArray = Array.from(
              assistantContent.matchAll(MESSAGE_FILTER_REGEX),
              match => match[1].trim()
            )

            const newMessage: IMessage[] = messagesFilterInArray.map(eachNewMessage => ({
              role: 'assistant',
              content: eachNewMessage,
              timestamp: new Date(),
            }))

            setMessages(prevMessages => {
              const updatedMessages = [...prevMessages]
              const lastCurrentMessage = updatedMessages[updatedMessages.length - 1]

              if (lastCurrentMessage?.content === 'loading' && lastCurrentMessage?.role === 'assistant') {
                updatedMessages[updatedMessages.length - 1] = {
                  ...lastCurrentMessage,
                  content: newMessage[0].content,
                  timestamp: newMessage[0].timestamp,
                }
                updatedMessages.push(...newMessage.slice(1))
              } else {
                updatedMessages.push(...newMessage)
              }

              return updatedMessages
            })

            setTimeout(() => {
              chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 100)

            return
          }
  
          const chunkString = decoder.decode(value)
          assistantContent += chunkString
          readChunk()
        }
  
        readChunk()
      } catch (error) {
        console.error('Error sending message:', error)
      }
    }
  }, [input, messages])

  const handleVoiceStart = async () => {
    const isVadInitialized = await initVad()
    if (!isVadInitialized) {
      console.error('Failed to initialize VAD')
    } else {
      console.log('VAD initialized')
      setMessages([])
      setQuickActions('')
      setIsPhoneStart(true)
    }
  }
  
  const hasFetchedGreeting = useRef(false)
  const getGreetingMessage = useCallback(async () => {
    if (hasFetchedGreeting.current) return
    hasFetchedGreeting.current = true
    try {
      const requestPayload = JSON.stringify({
        messages: [],
      })
      const response = await fetchChatApi(requestPayload)

      if (!response || !response?.ok) {
        handleErrorMessage()
        return toast.error(response?.statusText || 'Data fetch failed!')
      }

      const stream = response.body
      if (!stream) return
      
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      const readChunk = async () => {
        const { value, done } = await reader.read()
        if (done) {
          const messagesArray = Array.from(
            assistantContent.matchAll(MESSAGE_FILTER_REGEX),
            match => match[1].trim() 
          )
          
          const quickActionArray = Array.from(
            assistantContent.matchAll(MESSAGE_JSON_FILTER_REGEX),
            match => match[1].trim() 
          )

          if (quickActionArray && quickActionArray.length > 0) {
            setQuickActions(quickActionArray[0])
          }

          const newMessages: IMessage[] = []
          messagesArray.map(message => {
            newMessages.push({
              role: 'assistant',
              content: message,
              timestamp: new Date(),
            })
          })
          setMessages(newMessages)
          hasFetchedGreeting.current = false
          return
        }

        let chunkString = decoder.decode(value)
        chunkString = chunkString.replace(/ +/g, ' ')
        chunkString = chunkString.replace(/\s*'\s*/g, '\'')
        chunkString = chunkString.replace(/`/g, '')
        assistantContent += chunkString
        readChunk()
      }

      readChunk()
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }, [])

  useEffect(() => {
    if (isPhoneStart && messages.length === 0) {
      getGreetingMessage()
    }
  }, [isPhoneStart])

  const handleVoiceEnd = useCallback(() => {
    setIsPhoneStart(false)
    setIsSpeaking(false)
    cancelAnimationFrame(rafId)
    
    // Cleanup WebRTC service
    if (webrtcServiceRef.current) {
      webrtcServiceRef.current.close()
      webrtcServiceRef.current = null
    }
    
    // Cleanup WebSocket service
    if (wsServiceRef.current) {
      wsServiceRef.current.close()
      wsServiceRef.current = null
    }
    
    // Cleanup audio context
    if (audioContext) {
      audioContext.close()
      setAudioContext(null)
    }
    
    setRafId(0)
    setIsWebRTCConnected(false)
  }, [rafId, audioContext])


  return (
    <ChatContainer>
      <ChatDisplay>
        <MessageComponent
          messages={messages}
          quickActions={quickActions}
          handleSend={handleSend}
        />
        <div id="chatbot-container-bottom" style={{height: 20}} ref={chatEndRef} />
      </ChatDisplay>
      <ChatInputContainer>
        {
          isPhoneStart
            ? <EndCallButton 
                isSpeaking={isSpeaking} 
                onEnd={handleVoiceEnd} 
                isWebRTCConnected={isWebRTCConnected}
              />
            : <StartCallButton onStart={handleVoiceStart} />
        }
      </ChatInputContainer>
    </ChatContainer>
  )
}

export default ChatBot

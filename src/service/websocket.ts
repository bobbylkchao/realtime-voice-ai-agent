import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

export let WebsocketClient: Socket | undefined = undefined

export type WebsocketClientEventType =
  'DISCONNECTED' | 'CONNECTED' | 'CONNECTING' | 'ERROR'

export type WebsocketServerEventType =
  'SESSION_START_ERROR' | 'SESSION_START_SUCCESS' | 'SESSION_END_SUCCESS' |
  'SESSION_END_ERROR' | 'USER_AUDIO_CHUNK' | 'USER_AUDIO_TRANSCRIPT' |
  'ASSISTANT_AUDIO_CHUNK' | 'ASSISTANT_AUDIO_TRANSCRIPT'

export interface WebsocketCallbackArgs {
  status: WebsocketClientEventType
  responseData?: {
    event: WebsocketServerEventType,
    data?: object | null | string | ArrayBuffer
  }
}

export const initWebSocketConnection = (
  callback: (_args: WebsocketCallbackArgs) => void,
): typeof WebsocketClient => {
  try {
    if (WebsocketClient) return WebsocketClient

    WebsocketClient = io(import.meta.env.VITE_API_CHAT_SERVER_URL, {
      path: import.meta.env.VITE_APP_API_CHAT_SERVER_REALTIME_PATH,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })
  
    WebsocketClient.on('error', (error) => {
      console.error('Websocket connection error', error)
      callback({
        status: 'ERROR',
      })
    })
  
    WebsocketClient.on('disconnect', (reason) => {
      console.error('Websocket connection disconnected', reason)
      callback({
        status: 'DISCONNECTED',
      })
    })

    WebsocketClient.on('connect', () => {
      console.log(`Websocket connection established! Socket ID: ${WebsocketClient?.id}`)
      callback({
        status: 'CONNECTED',
      })
    })

    WebsocketClient.on('message', (data) => {
       
      callback({
        status: 'CONNECTED',
        responseData: data,
      })
    })
  
    return WebsocketClient
  } catch (err) {
    console.error('Failed init Websocket connection', err)
    callback({
      status: 'ERROR',
    })
  }
}

export type RealtimeVoiceEventName =
  'SESSION_START' | 'SESSION_END' | 'USER_SPEAKING_START' | 'USER_SPEAKING_STOP' | 'USER_AUDIO_CHUNK'

export interface RealtimeVoiceMessage {
  event: RealtimeVoiceEventName
  data: ArrayBuffer
}

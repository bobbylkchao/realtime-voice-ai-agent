export type RealtimeVoiceEventName =
  'SESSION_START' | 'SESSION_END' | 'USER_SPEAKING_START'|
  'USER_SPEAKING_STOP'|'USER_AUDIO_CHUNK' | 'USER_AUDIO_TRANSCRIPT' |
  'ASSISTANT_AUDIO_CHUNK' | 'ASSISTANT_AUDIO_TRANSCRIPT'

export interface RealtimeVoiceMessage {
  event: RealtimeVoiceEventName
  data: ArrayBuffer
}

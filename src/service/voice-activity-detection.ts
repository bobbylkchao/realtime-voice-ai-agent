let audioContext: AudioContext | null = null
let rafId = 0
let mediaStream: MediaStream | null = null

export const initVoiceActivityDetection = async (
  callback: (_isSpeaking: boolean, _audioChunk?: ArrayBuffer) => void
): Promise<void> => {
  if (audioContext) return
  try {
    let speaking = false
    let lastSpokeTime = 0

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // raw PCM16 (24kHz for OpenAI Realtime API)
    audioContext = new AudioContext({ sampleRate: 24000 })
    const source = audioContext.createMediaStreamSource(mediaStream)

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)

    const bufferLength = analyser.fftSize
    const dataArray = new Float32Array(bufferLength)

    // Convert Float32Array to PCM16 ArrayBuffer
    const float32ToPCM16 = (float32Array: Float32Array): ArrayBuffer => {
      const buffer = new ArrayBuffer(float32Array.length * 2) // 2 bytes per 16-bit sample
      const view = new DataView(buffer)

      for (let i = 0; i < float32Array.length; i++) {
        // Convert from [-1, 1] range to [-32768, 32767] range
        const sample = Math.max(-1, Math.min(1, float32Array[i]))
        const pcm16 = Math.round(sample * 32767)
        view.setInt16(i * 2, pcm16, true) // little-endian
      }

      return buffer
    }

    const checkSpeaking = () => {
      if (!analyser) return
      analyser.getFloatTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)

      const now = performance.now()
      const threshold = 0.02
      const silenceDelay = 300

      if (rms > threshold) {
        lastSpokeTime = now
        if (!speaking) {
          speaking = true
          callback(speaking)
        }
        // Convert to PCM16 ArrayBuffer for OpenAI Realtime API
        const pcm16Buffer = float32ToPCM16(dataArray.slice())

        callback(speaking, pcm16Buffer)
      } else if (speaking && now - lastSpokeTime > silenceDelay) {
        speaking = false
        callback(speaking)
      }

      rafId = requestAnimationFrame(checkSpeaking)
    }

    checkSpeaking()
  } catch (err) {
    console.error('Microphone access failed:', err)
  }
}

export const terminateVoiceActivityDetection = () => {
  cancelAnimationFrame(rafId)
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
}

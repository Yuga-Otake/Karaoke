import { useState, useEffect, useRef, useCallback } from 'react'
import { detectPitch } from '../utils/pitchDetection'
import { frequencyToNote, NoteInfo } from '../utils/musicTheory'
import { analyzeResonance, ResonanceData } from '../utils/resonanceAnalysis'

export interface AudioState {
  isListening: boolean
  frequency: number | null
  noteInfo: NoteInfo | null
  resonanceData: ResonanceData | null
  volume: number
  error: string | null
}

const FFT_SIZE = 4096

export function useAudioAnalyzer() {
  const [state, setState] = useState<AudioState>({
    isListening: false,
    frequency: null,
    noteInfo: null,
    resonanceData: null,
    volume: 0,
    error: null,
  })

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const smoothedFreqRef = useRef<number | null>(null)

  // Expose analyserNode for canvas components to read directly
  const getAnalyser = useCallback(() => analyserRef.current, [])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.6
      analyser.minDecibels = -100
      analyser.maxDecibels = -10
      analyserRef.current = analyser

      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      sourceRef.current = source

      const timeBuffer = new Float32Array(FFT_SIZE)
      const freqBuffer = new Float32Array(FFT_SIZE / 2)

      intervalRef.current = setInterval(() => {
        if (!analyserRef.current || !audioCtxRef.current) return

        analyserRef.current.getFloatTimeDomainData(timeBuffer)
        analyserRef.current.getFloatFrequencyData(freqBuffer)

        // RMS volume
        let rmsSum = 0
        for (let i = 0; i < timeBuffer.length; i++) rmsSum += timeBuffer[i] * timeBuffer[i]
        const volume = Math.sqrt(rmsSum / timeBuffer.length)

        // Pitch detection
        const rawFreq = detectPitch(timeBuffer, audioCtxRef.current.sampleRate)

        // Smooth frequency to reduce jitter
        let smoothedFreq: number | null = null
        if (rawFreq !== null) {
          if (smoothedFreqRef.current === null) {
            smoothedFreqRef.current = rawFreq
          } else {
            const ratio = rawFreq / smoothedFreqRef.current
            // Only smooth if within ~2 semitones (avoids octave jump smearing)
            if (ratio > 0.89 && ratio < 1.12) {
              smoothedFreqRef.current = 0.75 * smoothedFreqRef.current + 0.25 * rawFreq
            } else {
              smoothedFreqRef.current = rawFreq
            }
          }
          smoothedFreq = smoothedFreqRef.current
        } else {
          if (volume < 0.005) smoothedFreqRef.current = null
          smoothedFreq = smoothedFreqRef.current
        }

        const noteInfo = smoothedFreq ? frequencyToNote(smoothedFreq) : null
        const resonanceData = smoothedFreq
          ? analyzeResonance(freqBuffer, smoothedFreq, audioCtxRef.current.sampleRate, FFT_SIZE)
          : null

        setState({
          isListening: true,
          frequency: smoothedFreq,
          noteInfo,
          resonanceData,
          volume,
          error: null,
        })
      }, 50) // ~20fps for data updates

      setState(prev => ({ ...prev, isListening: true, error: null }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'マイクへのアクセスが拒否されました'
      setState(prev => ({ ...prev, error: msg }))
    }
  }, [])

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (sourceRef.current) sourceRef.current.disconnect()
    if (audioCtxRef.current) audioCtxRef.current.close()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    analyserRef.current = null
    smoothedFreqRef.current = null
    setState({
      isListening: false,
      frequency: null,
      noteInfo: null,
      resonanceData: null,
      volume: 0,
      error: null,
    })
  }, [])

  useEffect(() => () => stop(), [stop])

  return { state, getAnalyser, start, stop }
}

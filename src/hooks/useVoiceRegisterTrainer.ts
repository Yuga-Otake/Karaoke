import { useState, useRef, useCallback, useEffect } from 'react'
import { detectPitch } from '../utils/pitchDetection'
import { analyzeResonance } from '../utils/resonanceAnalysis'
import { frequencyToNote } from '../utils/musicTheory'
import { playBeep } from '../utils/audioUtils'
import {
  VoiceRegister,
  detectVoiceRegister,
  harmonicRichnessScore,
  REGISTER_INFO,
} from '../utils/voiceRegister'

type PracticeStep = 'idle' | 'beep' | 'sing' | 'result'

export interface PracticeResult {
  note: number
  targetRegister: 'chest' | 'mix' | 'falsetto'
  detectedRegister: VoiceRegister
  hit: boolean
}

export interface VRState {
  active: boolean
  detectedRegister: VoiceRegister
  stableRegister: VoiceRegister
  harmonicRichness: number
  brightnessScore: number
  totalHarmonics: number
  freq: number | null
  cents: number | null
  volume: number
  targetRegister: 'chest' | 'mix' | 'falsetto'
  practiceStep: PracticeStep
  practiceNote: number
  practiceNoteIdx: number
  practiceResults: PracticeResult[]
  error: string | null
}

const FFT_SIZE = 4096
const INTERVAL_MS = 50

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useVoiceRegisterTrainer() {
  const [state, setState] = useState<VRState>({
    active: false,
    detectedRegister: 'none',
    stableRegister: 'none',
    harmonicRichness: 0,
    brightnessScore: 0,
    totalHarmonics: 0,
    freq: null,
    cents: null,
    volume: 0,
    targetRegister: 'chest',
    practiceStep: 'idle',
    practiceNote: 60,
    practiceNoteIdx: 0,
    practiceResults: [],
    error: null,
  })

  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopRef = useRef(false)
  const regRunRef = useRef<{ reg: VoiceRegister; count: number }>({ reg: 'none', count: 0 })
  const stableRegRef = useRef<VoiceRegister>('none')

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream

      const ctx = new AudioContext()
      ctxRef.current = ctx

      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.5
      analyser.minDecibels = -100
      analyser.maxDecibels = 0
      analyserRef.current = analyser

      ctx.createMediaStreamSource(stream).connect(analyser)

      const timeBuf = new Float32Array(FFT_SIZE)
      const freqBuf = new Float32Array(FFT_SIZE / 2)

      timerRef.current = setInterval(() => {
        if (!analyserRef.current || !ctxRef.current) return
        analyserRef.current.getFloatTimeDomainData(timeBuf)
        analyserRef.current.getFloatFrequencyData(freqBuf)

        let rms = 0
        for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i]
        const volume = Math.sqrt(rms / timeBuf.length)

        const freq = detectPitch(timeBuf, ctxRef.current.sampleRate)
        const noteInfo = freq ? frequencyToNote(freq) : null
        const cents = noteInfo ? noteInfo.cents : null

        const resonanceData = freq
          ? analyzeResonance(freqBuf, freq, ctxRef.current.sampleRate, FFT_SIZE)
          : null

        const detectedRegister: VoiceRegister = freq ? detectVoiceRegister(resonanceData) : 'none'
        const richness = harmonicRichnessScore(resonanceData)

        if (detectedRegister !== 'none' && detectedRegister === regRunRef.current.reg) {
          regRunRef.current.count++
        } else {
          regRunRef.current = { reg: detectedRegister, count: detectedRegister !== 'none' ? 1 : 0 }
        }
        const stableRegister: VoiceRegister =
          regRunRef.current.count >= 3 ? detectedRegister : 'none'
        stableRegRef.current = stableRegister

        setState(prev => ({
          ...prev,
          active: true,
          detectedRegister,
          stableRegister,
          harmonicRichness: richness,
          brightnessScore: resonanceData?.brightnessScore ?? 0,
          totalHarmonics: resonanceData?.totalHarmonics ?? 0,
          freq,
          cents,
          volume,
          error: null,
        }))
      }, INTERVAL_MS)

      setState(prev => ({ ...prev, active: true, error: null }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'マイクへのアクセスが拒否されました',
      }))
    }
  }, [])

  const stop = useCallback(() => {
    stopRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    if (ctxRef.current) ctxRef.current.close()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    analyserRef.current = null
    ctxRef.current = null
    regRunRef.current = { reg: 'none', count: 0 }
    stableRegRef.current = 'none'
    setState(prev => ({
      ...prev,
      active: false,
      detectedRegister: 'none',
      stableRegister: 'none',
      harmonicRichness: 0,
      brightnessScore: 0,
      totalHarmonics: 0,
      freq: null,
      cents: null,
      volume: 0,
      practiceStep: 'idle',
      practiceResults: [],
      error: null,
    }))
  }, [])

  const startPractice = useCallback(async (targetRegister: 'chest' | 'mix' | 'falsetto') => {
    if (!ctxRef.current) return
    stopRef.current = false

    const notes = REGISTER_INFO[targetRegister].midiNotes

    setState(prev => ({
      ...prev,
      targetRegister,
      practiceResults: [],
      practiceNoteIdx: 0,
      practiceStep: 'idle',
    }))

    await sleep(200)

    for (let i = 0; i < notes.length; i++) {
      if (stopRef.current || !ctxRef.current) break
      const note = notes[i]

      setState(prev => ({ ...prev, practiceNote: note, practiceNoteIdx: i, practiceStep: 'beep' }))
      playBeep(ctxRef.current, note, 0.5)
      await sleep(700)
      if (stopRef.current) break

      setState(prev => ({ ...prev, practiceStep: 'sing' }))
      const singStart = Date.now()
      let lastDetected: VoiceRegister = 'none'

      while (Date.now() - singStart < 2500) {
        if (stopRef.current) break
        await sleep(INTERVAL_MS)
        const cur = stableRegRef.current
        if (cur !== 'none') lastDetected = cur
      }
      if (stopRef.current) break

      const hit = lastDetected === targetRegister
      setState(prev => ({
        ...prev,
        practiceStep: 'result',
        practiceResults: [
          ...prev.practiceResults,
          { note, targetRegister, detectedRegister: lastDetected, hit },
        ],
      }))
      await sleep(900)
    }

    if (!stopRef.current) {
      setState(prev => ({ ...prev, practiceStep: 'idle' }))
    }
  }, [])

  const stopPractice = useCallback(() => {
    stopRef.current = true
    setState(prev => ({ ...prev, practiceStep: 'idle' }))
  }, [])

  useEffect(() => () => stop(), [stop])

  return { state, start, stop, startPractice, stopPractice }
}

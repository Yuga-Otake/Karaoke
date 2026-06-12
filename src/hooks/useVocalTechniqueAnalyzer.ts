import { useState, useRef, useCallback, useEffect } from 'react'
import { detectPitch } from '../utils/pitchDetection'

export type VocalTechnique = 'none' | 'vibrato' | 'kobushi' | 'shakuri' | 'fall'

export interface PitchPoint {
  t: number            // performance.now() ms
  freq: number | null
  midi: number | null  // continuous MIDI (e.g. 60.5)
  technique: VocalTechnique
}

export interface TechniqueMetrics {
  detected: VocalTechnique
  confidence: number  // 0-100
  rate: number        // Hz  (vibrato/kobushi)
  depth: number       // ¢   (vibrato/kobushi)
  delta: number       // ¢   (shakuri/fall total change)
}

export interface VTAState {
  active: boolean
  recording: boolean
  freq: number | null
  volume: number
  metrics: TechniqueMetrics
  stableDetected: VocalTechnique  // hysteresis-filtered for badge display
  liveHistory: PitchPoint[]       // rolling last 4 s
  savedRecording: {
    history: PitchPoint[]
    url: string | null
    blob: Blob | null
    duration: number
  } | null
  error: string | null
}

// ─── constants ──────────────────────────────────────────────────────────────

const INTERVAL_MS  = 50
const LIVE_WINDOW  = 4000                         // ms
const MAX_LIVE     = LIVE_WINDOW / INTERVAL_MS    // 80 pts

const EMPTY_METRICS: TechniqueMetrics = {
  detected: 'none', confidence: 0, rate: 0, depth: 0, delta: 0,
}

const INITIAL: VTAState = {
  active: false, recording: false,
  freq: null, volume: 0,
  metrics: EMPTY_METRICS,
  stableDetected: 'none',
  liveHistory: [],
  savedRecording: null,
  error: null,
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hzToMidi(hz: number): number {
  return 12 * Math.log2(hz / 440) + 69
}

function detectOscillation(midiWindow: number[]): {
  type: 'vibrato' | 'kobushi' | 'none'
  rate: number
  depth: number     // cents
  confidence: number
} {
  const n = midiWindow.length
  if (n < 16) return { type: 'none', rate: 0, depth: 0, confidence: 0 }

  const mean  = midiWindow.reduce((a, b) => a + b, 0) / n
  const detrended = midiWindow.map(s => s - mean)

  // zero-crossing count → rate
  let zc = 0
  for (let i = 1; i < n; i++) {
    if (detrended[i - 1] * detrended[i] < 0) zc++
  }
  const durationSec = (n * INTERVAL_MS) / 1000
  const rate = (zc / 2) / durationSec

  // peak deviation → depth in cents
  const depthST    = Math.max(...detrended.map(Math.abs))
  const depthCents = depthST * 100

  if (depthCents < 8 || rate < 3 || rate > 20) {
    return { type: 'none', rate, depth: depthCents, confidence: 0 }
  }

  const type: 'vibrato' | 'kobushi' = rate >= 7 ? 'kobushi' : 'vibrato'
  const idealRate  = type === 'vibrato' ? 6 : 10
  const rateScore  = Math.max(0, 100 - Math.abs(rate - idealRate) * 18)
  const depthScore = Math.min(100, (depthCents / 50) * 80)
  const lenScore   = Math.min(20, (n / MAX_LIVE) * 20)
  const confidence = Math.round(rateScore * 0.5 + depthScore * 0.3 + lenScore * 0.2)

  return { type, rate: Math.round(rate * 10) / 10, depth: Math.round(depthCents), confidence }
}

function detectSlide(midiWindow: number[]): {
  type: 'shakuri' | 'fall' | 'none'
  delta: number    // cents signed
  confidence: number
} {
  const n = midiWindow.length
  if (n < 5) return { type: 'none', delta: 0, confidence: 0 }

  const delta = (midiWindow[n - 1] - midiWindow[0]) * 100   // cents

  let upSteps = 0, downSteps = 0
  for (let i = 1; i < n; i++) {
    const d = midiWindow[i] - midiWindow[i - 1]
    if (d > 0.05) upSteps++
    if (d < -0.05) downSteps++
  }
  const consistency = Math.max(upSteps, downSteps) / (n - 1)

  if (delta > 70 && upSteps >= downSteps && consistency > 0.45) {
    const conf = Math.min(100, Math.round((Math.abs(delta) / 250) * 60 + consistency * 40))
    return { type: 'shakuri', delta: Math.round(delta), confidence: conf }
  }
  if (delta < -80 && downSteps >= upSteps && consistency > 0.45) {
    const conf = Math.min(100, Math.round((Math.abs(delta) / 250) * 60 + consistency * 40))
    return { type: 'fall', delta: Math.round(delta), confidence: conf }
  }
  return { type: 'none', delta: Math.round(delta), confidence: 0 }
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useVocalTechniqueAnalyzer() {
  const [state, setState] = useState<VTAState>(INITIAL)

  const ctxRef       = useRef<AudioContext | null>(null)
  const analyserRef  = useRef<AnalyserNode | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecRef  = useRef<MediaRecorder | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const recHistRef   = useRef<PitchPoint[]>([])
  const liveHistRef  = useRef<PitchPoint[]>([])
  const recStartRef  = useRef<number>(0)
  const techRunRef   = useRef<{ tech: VocalTechnique; count: number }>({ tech: 'none', count: 0 })

  const cleanup = useCallback(() => {
    timerRef.current && clearInterval(timerRef.current)
    ctxRef.current?.close().catch(() => {})
    streamRef.current?.getTracks().forEach(t => t.stop())
    ctxRef.current = null; analyserRef.current = null
    streamRef.current = null; timerRef.current = null
  }, [])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.4
      ctx.createMediaStreamSource(stream).connect(analyser)
      analyserRef.current = analyser
    } catch {
      setState(prev => ({ ...prev, error: 'マイクにアクセスできません' }))
      return
    }

    liveHistRef.current = []
    const timeBuf = new Float32Array(4096)

    timerRef.current = setInterval(() => {
      const ctx = ctxRef.current
      const analyser = analyserRef.current
      if (!ctx || !analyser) return

      analyser.getFloatTimeDomainData(timeBuf)
      const freq = detectPitch(timeBuf, ctx.sampleRate)
      const midi = freq ? hzToMidi(freq) : null

      let rms = 0
      for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i]
      const volume = Math.sqrt(rms / timeBuf.length)

      const now = performance.now()
      const validHist = liveHistRef.current.filter(p => p.midi !== null && now - p.t < 2000)
      const midiWindow = validHist.map(p => p.midi!)

      let technique: VocalTechnique = 'none'
      let metrics: TechniqueMetrics = { ...EMPTY_METRICS }

      if (midi !== null) {
        const osc = detectOscillation(midiWindow)
        if (osc.confidence > 40) {
          technique = osc.type
          metrics = { detected: technique, confidence: osc.confidence, rate: osc.rate, depth: osc.depth, delta: 0 }
        } else {
          const shortWindow = validHist.filter(p => now - p.t < 600).map(p => p.midi!)
          const slide = detectSlide([...shortWindow, midi])
          if (slide.confidence > 35) {
            technique = slide.type
            metrics = { detected: technique, confidence: slide.confidence, rate: 0, depth: 0, delta: slide.delta }
          }
        }
      }

      if (technique !== 'none' && technique === techRunRef.current.tech) {
        techRunRef.current.count++
      } else {
        techRunRef.current = { tech: technique, count: technique !== 'none' ? 1 : 0 }
      }
      const stableDetected: VocalTechnique = techRunRef.current.count >= 3 ? technique : 'none'

      const pt: PitchPoint = { t: now, freq, midi, technique }
      liveHistRef.current = [...liveHistRef.current, pt].slice(-MAX_LIVE)
      if (mediaRecRef.current?.state === 'recording') recHistRef.current.push(pt)

      setState(prev => ({
        ...prev,
        active: true,
        freq,
        volume,
        metrics,
        stableDetected,
        liveHistory: [...liveHistRef.current],
      }))
    }, INTERVAL_MS)

    setState(prev => ({ ...prev, active: true, error: null }))
  }, [])

  const stop = useCallback(() => {
    if (mediaRecRef.current?.state === 'recording') mediaRecRef.current.stop()
    cleanup()
    liveHistRef.current = []
    techRunRef.current = { tech: 'none', count: 0 }
    setState(INITIAL)
  }, [cleanup])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    recChunksRef.current = []
    recHistRef.current   = []
    recStartRef.current  = performance.now()

    const mr = new MediaRecorder(stream)
    mr.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data) }
    mr.onstop = () => {
      const blob     = new Blob(recChunksRef.current, { type: 'audio/webm' })
      const url      = URL.createObjectURL(blob)
      const duration = (performance.now() - recStartRef.current) / 1000
      setState(prev => ({
        ...prev, recording: false,
        savedRecording: { history: [...recHistRef.current], url, blob, duration },
      }))
    }
    mr.start()
    mediaRecRef.current = mr
    setState(prev => ({ ...prev, recording: true }))
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecRef.current?.stop()
    mediaRecRef.current = null
  }, [])

  const clearRecording = useCallback(() => {
    setState(prev => ({ ...prev, savedRecording: null }))
  }, [])

  useEffect(() => () => { cleanup() }, [cleanup])

  return { state, start, stop, startRecording, stopRecording, clearRecording }
}

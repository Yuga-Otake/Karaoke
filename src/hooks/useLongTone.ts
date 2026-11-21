import { useState, useRef, useCallback, useEffect } from 'react'
import { detectPitch, computeRMS } from '../utils/pitchDetection'
import { openMic, scheduleTone } from '../utils/audioUtils'
import { foldCents, appendLog } from '../utils/vocalExercises'

export type LongTonePhase = 'idle' | 'listen' | 'ready' | 'sing' | 'complete'

export interface LongToneFrame { t: number; cents: number | null; db: number }

export interface LongToneResult {
  duration: number        // s of sustained voice
  avgCents: number        // signed mean offset
  pitchSd: number         // ¢ stdev of smoothed pitch (vibrato removed)
  volumeSd: number        // dB stdev
  scores: { duration: number; pitch: number; stability: number; volume: number }
  total: number
}

export interface LongToneState {
  phase: LongTonePhase
  result: LongToneResult | null
  error: string | null
}

export interface LongToneLive {
  frames: LongToneFrame[]
  singStart: number | null   // ctx time of first voiced frame
  ctx: AudioContext | null
  targetSec: number
}

const SAMPLE_MS = 25
const MAX_SEC = 40
const SILENCE_END = 0.7      // s of silence that ends the tone
const WAIT_LIMIT = 8         // s to wait for the first sound
const SMOOTH_SEC = 0.2       // moving-average window that removes vibrato

const INITIAL: LongToneState = { phase: 'idle', result: null, error: null }

function mean(a: number[]) { return a.reduce((s, x) => s + x, 0) / (a.length || 1) }
function sd(a: number[]) { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) }

export function analyzeLongTone(frames: LongToneFrame[], targetSec: number): LongToneResult {
  const voiced = frames.filter(f => f.cents !== null) as Array<LongToneFrame & { cents: number }>
  const first = voiced[0]?.t ?? 0
  const last = voiced[voiced.length - 1]?.t ?? 0
  const duration = Math.max(0, last - first)

  // Skip the onset (first 0.3s) when judging steadiness
  const body = voiced.filter(f => f.t >= first + 0.3 && Math.abs(f.cents) < 300)
  const cents = body.map(f => f.cents)
  const smoothed = body.map(f => {
    const w = body.filter(g => Math.abs(g.t - f.t) <= SMOOTH_SEC / 2)
    return mean(w.map(g => g.cents))
  })
  const avgCents = cents.length ? mean(cents) : 0
  const pitchSd = smoothed.length > 3 ? sd(smoothed) : 0
  const volumeSd = body.length > 3 ? sd(body.map(f => f.db)) : 0

  const scores = {
    duration: Math.round(Math.min(100, (duration / targetSec) * 100)),
    pitch: Math.round(Math.max(0, 100 - Math.max(0, Math.abs(avgCents) - 5) * 1.6)),
    stability: Math.round(Math.max(0, 100 - Math.max(0, pitchSd - 4) * 4)),
    volume: Math.round(Math.max(0, 100 - Math.max(0, volumeSd - 1.5) * 10)),
  }
  const total = body.length < 4 ? 0 : Math.round(
    scores.duration * 0.3 + scores.pitch * 0.25 + scores.stability * 0.3 + scores.volume * 0.15,
  )
  return {
    duration: Math.round(duration * 10) / 10,
    avgCents: Math.round(avgCents),
    pitchSd: Math.round(pitchSd * 10) / 10,
    volumeSd: Math.round(volumeSd * 10) / 10,
    scores,
    total,
  }
}

export function useLongTone() {
  const [state, setState] = useState<LongToneState>(INITIAL)
  const liveRef = useRef<LongToneLive>({ frames: [], singStart: null, ctx: null, targetSec: 10 })
  const stopRef = useRef(false)
  const finishRef = useRef(false)
  const closeRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    closeRef.current?.()
    closeRef.current = null
    liveRef.current.ctx = null
  }, [])

  const stop = useCallback(() => {
    stopRef.current = true
    cleanup()
    setState(INITIAL)
  }, [cleanup])

  /** End the tone now and score what was sung so far. */
  const finish = useCallback(() => { finishRef.current = true }, [])

  const start = useCallback(async (midi: number, targetSec: number) => {
    stopRef.current = false
    finishRef.current = false
    setState({ ...INITIAL, phase: 'listen' })

    let mic: Awaited<ReturnType<typeof openMic>>
    try {
      mic = await openMic(2048)
    } catch {
      setState({ ...INITIAL, error: 'マイクにアクセスできません。ブラウザの権限を確認してください。' })
      return
    }
    closeRef.current = mic.close
    const { ctx, analyser } = mic
    liveRef.current = { frames: [], singStart: null, ctx, targetSec }

    // Reference tone
    scheduleTone(ctx, midi, ctx.currentTime + 0.1, 1.4, 0.5)
    await new Promise(r => setTimeout(r, 1700))
    if (stopRef.current) return
    setState(prev => ({ ...prev, phase: 'ready' }))

    const buf = new Float32Array(analyser.fftSize)
    const target = 440 * Math.pow(2, (midi - 69) / 12)
    const waitStart = ctx.currentTime
    let lastVoiced = 0

    while (!stopRef.current && !finishRef.current) {
      const now = ctx.currentTime
      analyser.getFloatTimeDomainData(buf)
      const rms = computeRMS(buf)
      const f = rms > 0.008 ? detectPitch(buf, ctx.sampleRate) : null
      const live = liveRef.current

      if (f) {
        if (live.singStart === null) {
          live.singStart = now
          setState(prev => ({ ...prev, phase: 'sing' }))
        }
        lastVoiced = now
      }
      if (live.singStart !== null) {
        live.frames.push({
          t: now - live.singStart,
          cents: f ? foldCents(Math.log2(f / target) * 1200) : null,
          db: 20 * Math.log10(Math.max(rms, 1e-5)),
        })
        if (now - lastVoiced > SILENCE_END || now - live.singStart > MAX_SEC) break
      } else if (now - waitStart > WAIT_LIMIT) {
        setState({ ...INITIAL, error: '声が検出されませんでした。マイクの位置と音量を確認してください。' })
        cleanup()
        return
      }
      await new Promise(r => setTimeout(r, SAMPLE_MS))
    }
    if (stopRef.current) return

    const result = analyzeLongTone(liveRef.current.frames, targetSec)
    if (result.duration > 0.5) {
      appendLog({
        date: new Date().toISOString(),
        kind: 'longtone',
        exercise: 'longtone',
        score: result.total,
        seconds: Math.round(result.duration + 2),
        detail: { midi, duration: result.duration, pitchSd: result.pitchSd, targetSec },
      })
    }
    setState({ phase: 'complete', result, error: null })
    cleanup()
  }, [cleanup])

  useEffect(() => () => { stopRef.current = true; cleanup() }, [cleanup])

  return { state, liveRef, start, stop, finish }
}

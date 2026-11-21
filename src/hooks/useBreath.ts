import { useState, useRef, useCallback, useEffect } from 'react'
import { computeRMS } from '../utils/pitchDetection'
import { openMic } from '../utils/audioUtils'
import { appendLog } from '../utils/vocalExercises'

export type BreathPhase = 'idle' | 'calibrate' | 'inhale' | 'exhale' | 'complete'

export interface BreathResult {
  duration: number     // s of continuous exhale
  volumeSd: number     // dB stdev (lower = steadier)
  scores: { duration: number; steadiness: number }
  total: number
}

export interface BreathState {
  phase: BreathPhase
  countdown: number
  result: BreathResult | null
  error: string | null
}

export interface BreathLive {
  frames: { t: number; db: number }[]
  thresholdDb: number
  start: number | null      // ctx time when exhale began
  ctx: AudioContext | null
  targetSec: number
}

const SAMPLE_MS = 30
const SILENCE_END = 0.8
const WAIT_LIMIT = 8
const MAX_SEC = 90
const INHALE_SEC = 4

const INITIAL: BreathState = { phase: 'idle', countdown: 0, result: null, error: null }

function mean(a: number[]) { return a.reduce((s, x) => s + x, 0) / (a.length || 1) }

export function useBreath() {
  const [state, setState] = useState<BreathState>(INITIAL)
  const liveRef = useRef<BreathLive>({ frames: [], thresholdDb: -50, start: null, ctx: null, targetSec: 20 })
  const stopRef = useRef(false)
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

  const start = useCallback(async (targetSec: number) => {
    stopRef.current = false
    setState({ ...INITIAL, phase: 'calibrate' })

    let mic: Awaited<ReturnType<typeof openMic>>
    try {
      mic = await openMic(2048)
    } catch {
      setState({ ...INITIAL, error: 'マイクにアクセスできません。ブラウザの権限を確認してください。' })
      return
    }
    closeRef.current = mic.close
    const { ctx, analyser } = mic
    const buf = new Float32Array(analyser.fftSize)
    const dbNow = () => {
      analyser.getFloatTimeDomainData(buf)
      return 20 * Math.log10(Math.max(computeRMS(buf), 1e-5))
    }
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // ── Measure room noise ─────────────────────────────────────────
    const noise: number[] = []
    const c0 = Date.now()
    while (Date.now() - c0 < 1500 && !stopRef.current) { noise.push(dbNow()); await sleep(SAMPLE_MS) }
    if (stopRef.current) return
    noise.sort((a, b) => a - b)
    const floor = noise[Math.floor(noise.length * 0.8)] ?? -60
    const thresholdDb = Math.max(floor + 8, -52)
    liveRef.current = { frames: [], thresholdDb, start: null, ctx, targetSec }

    // ── Guided inhale ──────────────────────────────────────────────
    for (let c = INHALE_SEC; c >= 1; c--) {
      if (stopRef.current) return
      setState(prev => ({ ...prev, phase: 'inhale', countdown: c }))
      await sleep(1000)
    }
    if (stopRef.current) return
    setState(prev => ({ ...prev, phase: 'exhale', countdown: 0 }))

    // ── Exhale ─────────────────────────────────────────────────────
    const waitStart = ctx.currentTime
    let lastLoud = 0
    while (!stopRef.current) {
      const now = ctx.currentTime
      const db = dbNow()
      const live = liveRef.current
      const loud = db > thresholdDb
      if (loud) {
        if (live.start === null) live.start = now
        lastLoud = now
      }
      if (live.start !== null) {
        live.frames.push({ t: now - live.start, db })
        if (now - lastLoud > SILENCE_END || now - live.start > MAX_SEC) break
      } else if (now - waitStart > WAIT_LIMIT) {
        setState({ ...INITIAL, error: '息の音が検出されませんでした。マイクに向かって「スー」と吐いてください。' })
        cleanup()
        return
      }
      await sleep(SAMPLE_MS)
    }
    if (stopRef.current) return

    // ── Score ──────────────────────────────────────────────────────
    const frames = liveRef.current.frames
    const loudFrames = frames.filter(f => f.db > thresholdDb)
    const duration = loudFrames.length ? loudFrames[loudFrames.length - 1].t : 0
    // steadiness: ignore the first/last 10% (onset and running out of air)
    const body = loudFrames.filter(f => f.t > duration * 0.1 && f.t < duration * 0.9).map(f => f.db)
    const m = mean(body)
    const volumeSd = body.length > 3 ? Math.sqrt(mean(body.map(x => (x - m) ** 2))) : 0
    const scores = {
      duration: Math.round(Math.min(100, (duration / targetSec) * 100)),
      steadiness: Math.round(Math.max(0, 100 - Math.max(0, volumeSd - 1.5) * 9)),
    }
    const total = duration < 1 ? 0 : Math.round(scores.duration * 0.6 + scores.steadiness * 0.4)
    const result: BreathResult = {
      duration: Math.round(duration * 10) / 10,
      volumeSd: Math.round(volumeSd * 10) / 10,
      scores,
      total,
    }
    if (duration >= 1) {
      appendLog({
        date: new Date().toISOString(), kind: 'breath', exercise: 'breath',
        score: total, seconds: Math.round(duration + INHALE_SEC + 2),
        detail: { duration: result.duration, targetSec },
      })
    }
    setState({ phase: 'complete', countdown: 0, result, error: null })
    cleanup()
  }, [cleanup])

  useEffect(() => () => { stopRef.current = true; cleanup() }, [cleanup])

  return { state, liveRef, start, stop }
}

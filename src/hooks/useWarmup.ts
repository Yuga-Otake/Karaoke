import { useState, useRef, useCallback, useEffect } from 'react'
import { detectPitch, computeRMS } from '../utils/pitchDetection'
import { openMic, scheduleTone } from '../utils/audioUtils'
import {
  ExercisePattern, patternLengths, foldCents, appendLog,
} from '../utils/vocalExercises'

export type WarmupPhase = 'idle' | 'cue' | 'listen' | 'sing' | 'complete'
export type WarmupMode = 'call' | 'together'

export interface TargetNote {
  midi: number
  step: number       // semitones above root
  start: number      // seconds on the rep clock
  end: number
  sing: boolean      // true = user sings this, false = listen only
}

export interface PitchFrame { t: number; midi: number | null }

export interface NoteResult { midi: number; step: number; score: number; cents: number | null }

export interface RepResult {
  root: number
  score: number
  notes: NoteResult[]
  avgCents: number | null
}

export interface WarmupState {
  phase: WarmupPhase
  repIdx: number
  totalReps: number
  root: number | null
  reps: RepResult[]
  sessionScore: number
  error: string | null
}

/** Mutable data read every animation frame by the canvas (kept out of React state). */
export interface WarmupLive {
  targets: TargetNote[]
  frames: PitchFrame[]
  origin: number          // ctx.currentTime at rep clock 0
  repLength: number
  ctx: AudioContext | null
}

const INITIAL: WarmupState = {
  phase: 'idle', repIdx: 0, totalReps: 0, root: null, reps: [], sessionScore: 0, error: null,
}

const SAMPLE_MS = 25
const ATTACK_GRACE = 0.12   // s ignored at the start of each note

function scoreFrame(midi: number | null, target: number): { score: number; cents: number | null } {
  if (midi === null) return { score: 0, cents: null }
  const c = foldCents((midi - target) * 100)
  return { score: Math.max(0, 100 - Math.max(0, Math.abs(c) - 15) * 1.4), cents: c }
}

function scoreRep(root: number, targets: TargetNote[], frames: PitchFrame[]): RepResult {
  const notes: NoteResult[] = targets.filter(t => t.sing).map(t => {
    const s = t.start + Math.min(ATTACK_GRACE, (t.end - t.start) * 0.3)
    const e = t.end - 0.03
    const fs = frames.filter(f => f.t >= s && f.t <= e)
    if (fs.length === 0) return { midi: t.midi, step: t.step, score: 0, cents: null }
    const scored = fs.map(f => scoreFrame(f.midi, t.midi))
    const voiced = scored.filter(x => x.cents !== null && Math.abs(x.cents) < 250)
    return {
      midi: t.midi,
      step: t.step,
      score: Math.round(scored.reduce((a, x) => a + x.score, 0) / scored.length),
      cents: voiced.length >= 2
        ? Math.round(voiced.reduce((a, x) => a + (x.cents as number), 0) / voiced.length)
        : null,
    }
  })
  const withCents = notes.filter(n => n.cents !== null)
  return {
    root,
    score: Math.round(notes.reduce((a, n) => a + n.score, 0) / (notes.length || 1)),
    notes,
    avgCents: withCents.length
      ? Math.round(withCents.reduce((a, n) => a + (n.cents as number), 0) / withCents.length)
      : null,
  }
}

export function useWarmup() {
  const [state, setState] = useState<WarmupState>(INITIAL)
  const liveRef = useRef<WarmupLive>({ targets: [], frames: [], origin: 0, repLength: 1, ctx: null })
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

  const start = useCallback(async (
    pattern: ExercisePattern, roots: number[], bpm: number, mode: WarmupMode,
  ) => {
    stopRef.current = false
    setState({ ...INITIAL, totalReps: roots.length })

    let mic: Awaited<ReturnType<typeof openMic>>
    try {
      mic = await openMic(2048)
    } catch {
      setState(prev => ({ ...prev, error: 'マイクにアクセスできません。ブラウザの権限を確認してください。' }))
      return
    }
    closeRef.current = mic.close
    const { ctx, analyser } = mic
    liveRef.current.ctx = ctx

    const beat = 60 / bpm
    const lengths = patternLengths(pattern)
    const buf = new Float32Array(analyser.fftSize)
    const reps: RepResult[] = []
    const t0 = Date.now()

    for (let r = 0; r < roots.length; r++) {
      if (stopRef.current) return
      const root = roots[r]

      // ── Build the rep timeline ──────────────────────────────────
      const targets: TargetNote[] = []
      const cueLen = 2 * beat
      let t = cueLen
      if (mode === 'call') {
        pattern.steps.forEach((s, i) => {
          const d = lengths[i] * beat
          targets.push({ midi: root + s, step: s, start: t, end: t + d, sing: false })
          t += d
        })
        t += beat   // breath
      }
      pattern.steps.forEach((s, i) => {
        const d = lengths[i] * beat
        targets.push({ midi: root + s, step: s, start: t, end: t + d, sing: true })
        t += d
      })
      const repLength = t + 0.35

      // ── Schedule audio ──────────────────────────────────────────
      const origin = ctx.currentTime + 0.15
      for (const m of [root - 12, root, root + 4, root + 7]) {
        scheduleTone(ctx, m, origin, cueLen * 0.9, 0.16)
      }
      for (const tg of targets) {
        // call & response: user's turn is silent; together: softer guide under the voice
        if (tg.sing && mode === 'call') continue
        scheduleTone(ctx, tg.midi, origin + tg.start, (tg.end - tg.start) * 0.95, tg.sing ? 0.22 : 0.5)
      }

      liveRef.current = { targets, frames: [], origin, repLength, ctx }
      setState(prev => ({ ...prev, phase: 'cue', repIdx: r, root }))

      const singStart = targets.find(x => x.sing)!.start
      const listenStart = mode === 'call' ? cueLen : Infinity

      // ── Sample pitch until the rep ends ─────────────────────────
      let lastPhase: WarmupPhase = 'cue'
      while (!stopRef.current) {
        const now = ctx.currentTime - origin
        if (now >= repLength) break
        const ph: WarmupPhase = now >= singStart ? 'sing' : now >= listenStart ? 'listen' : 'cue'
        if (ph !== lastPhase) { lastPhase = ph; setState(prev => ({ ...prev, phase: ph })) }

        if (now >= singStart - 0.2) {
          analyser.getFloatTimeDomainData(buf)
          const f = computeRMS(buf) > 0.006 ? detectPitch(buf, ctx.sampleRate) : null
          liveRef.current.frames.push({ t: now, midi: f ? 69 + 12 * Math.log2(f / 440) : null })
        }
        await new Promise(res => setTimeout(res, SAMPLE_MS))
      }
      if (stopRef.current) return

      reps.push(scoreRep(root, targets, liveRef.current.frames))
      setState(prev => ({ ...prev, reps: [...reps] }))
    }

    const sessionScore = Math.round(reps.reduce((a, x) => a + x.score, 0) / (reps.length || 1))
    appendLog({
      date: new Date().toISOString(),
      kind: 'warmup',
      exercise: pattern.id,
      score: sessionScore,
      seconds: Math.round((Date.now() - t0) / 1000),
      detail: { lo: Math.min(...roots), hi: Math.max(...roots) + Math.max(...pattern.steps), bpm },
    })
    setState(prev => ({ ...prev, phase: 'complete', sessionScore }))
    cleanup()
  }, [cleanup])

  useEffect(() => () => { stopRef.current = true; cleanup() }, [cleanup])

  return { state, liveRef, start, stop }
}

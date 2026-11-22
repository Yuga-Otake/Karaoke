import { useState, useRef, useCallback, useEffect } from 'react'
import { PitchTracker } from '../utils/pitchTracker'
import { openMic, scheduleTone } from '../utils/audioUtils'
import {
  ExercisePattern, patternLengths, foldCents, appendLog, stepLabel,
} from '../utils/vocalExercises'

export type WarmupPhase = 'idle' | 'cue' | 'listen' | 'sing' | 'complete'
export type WarmupMode = 'call' | 'together'

export interface TargetNote {
  midi: number       // pitch at start
  endMidi: number    // pitch at end (differs only for glides)
  step: number       // semitones above root (at start)
  label: string
  start: number      // seconds on the rep clock
  end: number
  sing: boolean      // true = user sings this, false = listen only
}

export interface PitchFrame { t: number; midi: number | null }

export interface NoteResult { midi: number; step: number; label: string; score: number; cents: number | null }

export interface RepResult {
  root: number
  score: number
  notes: NoteResult[]
  avgCents: number | null
  detach?: number     // staccato: 0-100, how cleanly notes were separated
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
  meter: Meter
}

export interface Meter {
  db: number        // current input level
  gateDb: number    // level the voice must exceed to count
  quiet: number     // 0-1: share of recent frames where a voice seemed present but too quiet
}

export const EMPTY_METER: Meter = { db: -100, gateDb: -50, quiet: 0 }

const INITIAL: WarmupState = {
  phase: 'idle', repIdx: 0, totalReps: 0, root: null, reps: [], sessionScore: 0, error: null,
}

const SAMPLE_MS = 25
const ATTACK_GRACE = 0.12   // s ignored at the start of each note
const STACCATO_SOUND = 0.5  // fraction of the beat that sounds
const INPUT_LAG = 0.06      // s: analysis window + smoothing delay

export function targetAt(tg: TargetNote, t: number): number {
  if (tg.endMidi === tg.midi) return tg.midi
  const k = Math.max(0, Math.min(1, (t - tg.start) / (tg.end - tg.start)))
  return tg.midi + (tg.endMidi - tg.midi) * k
}

/** Lay out one pass of the pattern starting at time t0. */
function layout(p: ExercisePattern, root: number, beat: number, t0: number, sing: boolean) {
  const lengths = patternLengths(p)
  const out: TargetNote[] = []
  let t = t0
  if (p.glide) {
    for (let i = 0; i < p.steps.length - 1; i++) {
      const a = p.steps[i], b = p.steps[i + 1]
      const d = lengths[i] * beat
      out.push({
        midi: root + a, endMidi: root + b, step: a,
        label: `${stepLabel(a)}${b > a ? '↗' : '↘'}`,
        start: t, end: t + d, sing,
      })
      t += d
    }
  } else {
    p.steps.forEach((s, i) => {
      const d = lengths[i] * beat
      const len = p.staccato ? Math.min(d * STACCATO_SOUND, 0.4) : d
      out.push({ midi: root + s, endMidi: root + s, step: s, label: stepLabel(s), start: t, end: t + len, sing })
      t += d
    })
  }
  return { notes: out, end: t }
}

function scheduleNotes(ctx: AudioContext, p: ExercisePattern, notes: TargetNote[], origin: number, vol: number) {
  if (notes.length === 0) return
  if (p.glide) {
    const first = notes[0], last = notes[notes.length - 1]
    scheduleTone(ctx, first.midi, origin + first.start, last.end - first.start, vol,
      notes.map(n => ({ t: origin + n.end, midi: n.endMidi })))
    return
  }
  for (const n of notes) scheduleTone(ctx, n.midi, origin + n.start, (n.end - n.start) * 0.95, vol)
}

function scoreRep(root: number, targets: TargetNote[], frames: PitchFrame[], p: ExercisePattern): RepResult {
  const sung = targets.filter(t => t.sing)
  const notes: NoteResult[] = sung.map(tg => {
    const grace = p.glide ? 0.05 : Math.min(ATTACK_GRACE, (tg.end - tg.start) * 0.3)
    // the analysis window lags the voice slightly, so shift the judging window with it
    const fs = frames.filter(f => f.t >= tg.start + grace + INPUT_LAG && f.t <= tg.end - 0.03 + INPUT_LAG)
    const base = { midi: tg.midi, step: tg.step, label: tg.label }
    if (fs.length === 0) return { ...base, score: 0, cents: null }
    let sum = 0
    const cs: number[] = []
    for (const f of fs) {
      if (f.midi === null) continue
      const c = foldCents((f.midi - targetAt(tg, f.t - INPUT_LAG)) * 100)
      // glides are judged a little more loosely
      const free = p.glide ? 35 : 15
      sum += Math.max(0, 100 - Math.max(0, Math.abs(c) - free) * 1.4)
      if (Math.abs(c) < 250) cs.push(c)
    }
    return {
      ...base,
      score: Math.round(sum / fs.length),
      cents: cs.length >= 2 ? Math.round(cs.reduce((a, c) => a + c, 0) / cs.length) : null,
    }
  })

  const withCents = notes.filter(n => n.cents !== null)
  let score = Math.round(notes.reduce((a, n) => a + n.score, 0) / (notes.length || 1))

  let detach: number | undefined
  if (p.staccato) {
    // In the gaps between notes the voice should stop
    let gapFrames = 0, voicedInGap = 0
    for (let i = 0; i < sung.length - 1; i++) {
      const s = sung[i].end + 0.06 + INPUT_LAG, e = sung[i + 1].start - 0.02 + INPUT_LAG
      for (const f of frames) {
        if (f.t >= s && f.t <= e) { gapFrames++; if (f.midi !== null) voicedInGap++ }
      }
    }
    detach = gapFrames ? Math.round(100 * (1 - voicedInGap / gapFrames)) : 0
    score = Math.round(score * 0.75 + detach * 0.25)
  }

  return {
    root,
    score,
    notes,
    avgCents: withCents.length
      ? Math.round(withCents.reduce((a, n) => a + (n.cents as number), 0) / withCents.length)
      : null,
    detach,
  }
}

export function useWarmup() {
  const [state, setState] = useState<WarmupState>(INITIAL)
  const liveRef = useRef<WarmupLive>({ targets: [], frames: [], origin: 0, repLength: 1, ctx: null, meter: EMPTY_METER })
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
    const buf = new Float32Array(analyser.fftSize)
    const tracker = new PitchTracker(ctx.sampleRate)
    let meter: Meter = EMPTY_METER
    // Learn the room's noise floor for a moment before anything plays
    const n0 = Date.now()
    while (Date.now() - n0 < 350 && !stopRef.current) {
      analyser.getFloatTimeDomainData(buf); tracker.calibrate(buf)
      await new Promise(res => setTimeout(res, SAMPLE_MS))
    }
    const reps: RepResult[] = []
    const t0 = Date.now()

    for (let r = 0; r < roots.length; r++) {
      if (stopRef.current) return
      const root = roots[r]

      // ── Build the rep timeline ──────────────────────────────────
      const cueLen = 2 * beat
      let listen: TargetNote[] = []
      let t = cueLen
      if (mode === 'call') {
        const l = layout(pattern, root, beat, t, false)
        listen = l.notes
        t = l.end + beat   // breath
      }
      const s = layout(pattern, root, beat, t, true)
      const targets = [...listen, ...s.notes]
      const repLength = Math.max(s.end, s.notes[s.notes.length - 1].end) + 0.35

      // ── Schedule audio ──────────────────────────────────────────
      const origin = ctx.currentTime + 0.15
      for (const m of [root - 12, root, root + 4, root + 7]) {
        scheduleTone(ctx, m, origin, cueLen * 0.9, 0.16)
      }
      // call & response: user's turn is silent; together: softer guide under the voice
      scheduleNotes(ctx, pattern, listen, origin, 0.5)
      if (mode === 'together') scheduleNotes(ctx, pattern, s.notes, origin, 0.22)

      liveRef.current = { targets, frames: [], origin, repLength, ctx, meter }
      setState(prev => ({ ...prev, phase: 'cue', repIdx: r, root }))

      const singStart = s.notes[0].start
      const listenStart = mode === 'call' ? cueLen : Infinity

      // ── Sample pitch until the rep ends ─────────────────────────
      let lastPhase: WarmupPhase = 'cue'
      while (!stopRef.current) {
        const now = ctx.currentTime - origin
        if (now >= repLength) break
        const ph: WarmupPhase = now >= singStart ? 'sing' : now >= listenStart ? 'listen' : 'cue'
        if (ph !== lastPhase) { lastPhase = ph; setState(prev => ({ ...prev, phase: ph })) }

        // Track every frame so the noise floor is learned before singing starts
        analyser.getFloatTimeDomainData(buf)
        const fr = tracker.process(buf)
        meter = {
          db: fr.db,
          gateDb: 20 * Math.log10(fr.gate),
          quiet: now >= singStart ? meter.quiet * 0.95 + (fr.tooQuiet ? 0.05 : 0) : 0,
        }
        liveRef.current.meter = meter
        if (now >= singStart - 0.2) liveRef.current.frames.push({ t: now, midi: fr.midi })
        await new Promise(res => setTimeout(res, SAMPLE_MS))
      }
      if (stopRef.current) return

      reps.push(scoreRep(root, targets, liveRef.current.frames, pattern))
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

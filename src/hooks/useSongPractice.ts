import { useState, useRef, useCallback, useEffect } from 'react'
import { PitchTracker } from '../utils/pitchTracker'
import { openMic, scheduleTone, scheduleClick } from '../utils/audioUtils'
import { foldCents, appendLog } from '../utils/vocalExercises'
import { Meter, EMPTY_METER } from './useWarmup'

export type SongPhase = 'idle' | 'countin' | 'sing' | 'listen' | 'complete'

export interface TimedNote {
  idx: number        // index in the full song
  midi: number
  start: number      // seconds on the take clock
  end: number
  lyric?: string
  bar: number        // bar number in the full song (0-based)
}

export interface NoteScore {
  idx: number
  score: number
  cents: number | null
  attackMs: number | null   // how late the voice landed on the note
}

export interface SongResult {
  score: number
  notes: NoteScore[]
  bars: { bar: number; score: number }[]
  avgCents: number | null
  highCents: number | null   // average offset on the highest notes
  avgAttackMs: number | null
}

export interface SongLive {
  notes: TimedNote[]
  frames: { t: number; midi: number | null }[]
  origin: number
  length: number
  ctx: AudioContext | null
  meter: Meter
  scores: Map<number, number>   // idx → score, filled after the take
}

const SAMPLE_MS = 25
const INPUT_LAG = 0.06

function scoreTake(notes: TimedNote[], frames: SongLive['frames']): SongResult {
  const res: NoteScore[] = notes.map(n => {
    const dur = n.end - n.start
    const grace = Math.min(0.1, dur * 0.25)
    const fs = frames.filter(f => f.t >= n.start + grace + INPUT_LAG && f.t <= n.end - 0.02 + INPUT_LAG)
    let sum = 0
    const cs: number[] = []
    for (const f of fs) {
      if (f.midi === null) continue
      const c = foldCents((f.midi - n.midi) * 100)
      sum += Math.max(0, 100 - Math.max(0, Math.abs(c) - 20) * 1.3)
      if (Math.abs(c) < 250) cs.push(c)
    }
    // Attack: first frame within ±60¢ after the note begins
    const hit = frames.find(f => f.t >= n.start + INPUT_LAG - 0.05 && f.t <= n.end + INPUT_LAG &&
      f.midi !== null && Math.abs(foldCents((f.midi - n.midi) * 100)) <= 60)
    return {
      idx: n.idx,
      score: fs.length ? Math.round(sum / fs.length) : 0,
      cents: cs.length >= 2 ? Math.round(cs.reduce((a, c) => a + c, 0) / cs.length) : null,
      attackMs: hit ? Math.max(0, Math.round((hit.t - INPUT_LAG - n.start) * 1000)) : null,
    }
  })

  const weight = (i: number) => Math.min(2, notes[i].end - notes[i].start)
  const wsum = res.reduce((a, _, i) => a + weight(i), 0) || 1
  const score = Math.round(res.reduce((a, r, i) => a + r.score * weight(i), 0) / wsum)

  const byBar = new Map<number, { s: number; w: number }>()
  res.forEach((r, i) => {
    const b = notes[i].bar
    const e = byBar.get(b) ?? { s: 0, w: 0 }
    e.s += r.score * weight(i); e.w += weight(i)
    byBar.set(b, e)
  })
  const bars = [...byBar.entries()].map(([bar, e]) => ({ bar, score: Math.round(e.s / (e.w || 1)) }))

  const withC = res.filter(r => r.cents !== null)
  const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null
  const sortedMidi = [...notes].map(n => n.midi).sort((a, b) => a - b)
  const highCut = sortedMidi[Math.floor(sortedMidi.length * 0.8)] ?? Infinity
  const attacks = res.filter((r, i) => r.attackMs !== null && notes[i].end - notes[i].start >= 0.25).map(r => r.attackMs as number)
  return {
    score, notes: res, bars,
    avgCents: avg(withC.map(r => r.cents as number)),
    highCents: avg(res.filter((r, i) => r.cents !== null && notes[i].midi >= highCut).map(r => r.cents as number)),
    avgAttackMs: avg(attacks),
  }
}

export function useSongPractice() {
  const [phase, setPhase] = useState<SongPhase>('idle')
  const [result, setResult] = useState<SongResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const liveRef = useRef<SongLive>({ notes: [], frames: [], origin: 0, length: 1, ctx: null, meter: EMPTY_METER, scores: new Map() })
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
    setPhase('idle')
  }, [cleanup])

  /**
   * notes: the section to sing, timed in seconds from 0 (first bar start).
   * listenOnly: just play the melody, no microphone.
   */
  const start = useCallback(async (opts: {
    notes: TimedNote[]; beatSec: number; beatsPerBar: number; guide: boolean; listenOnly?: boolean
  }) => {
    stopRef.current = false
    setResult(null)
    setError(null)
    const { notes, beatSec, beatsPerBar, guide, listenOnly } = opts
    if (!notes.length) return

    let ctx: AudioContext
    let analyser: AnalyserNode | null = null
    if (listenOnly) {
      ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume()
      closeRef.current = () => { ctx.close().catch(() => {}) }
    } else {
      try {
        const mic = await openMic(2048)
        ctx = mic.ctx; analyser = mic.analyser; closeRef.current = mic.close
      } catch {
        setError('マイクにアクセスできません。ブラウザの権限を確認してください。')
        return
      }
    }

    const tracker = new PitchTracker(ctx.sampleRate)
    const buf = new Float32Array(2048)
    if (analyser) {
      const n0 = Date.now()
      while (Date.now() - n0 < 350 && !stopRef.current) {
        analyser.getFloatTimeDomainData(buf); tracker.calibrate(buf)
        await new Promise(r => setTimeout(r, SAMPLE_MS))
      }
    }
    if (stopRef.current) return

    // Count-in: one bar of clicks; the first note sounds softly so you know the key
    const countIn = beatsPerBar * beatSec
    const origin = ctx.currentTime + 0.2
    for (let b = 0; b < beatsPerBar; b++) scheduleClick(ctx, origin + b * beatSec, b === 0)
    if (!guide && !listenOnly) {
      scheduleTone(ctx, notes[0].midi, origin + countIn - 2 * beatSec, Math.min(1.5 * beatSec, 1), 0.3)
    }
    const timed = notes.map(n => ({ ...n, start: n.start + countIn, end: n.end + countIn }))
    if (guide || listenOnly) {
      for (const n of timed) scheduleTone(ctx, n.midi, origin + n.start, Math.max(0.08, (n.end - n.start) * 0.92), listenOnly ? 0.45 : 0.22)
    }
    const length = timed[timed.length - 1].end + 0.6
    liveRef.current = { notes: timed, frames: [], origin, length, ctx, meter: EMPTY_METER, scores: new Map() }
    setPhase('countin')

    const t0 = Date.now()
    let current: SongPhase = 'countin'
    let meter = EMPTY_METER
    while (!stopRef.current) {
      const now = ctx.currentTime - origin
      if (now >= length) break
      const ph: SongPhase = now >= countIn - 0.05 ? (listenOnly ? 'listen' : 'sing') : 'countin'
      if (ph !== current) { current = ph; setPhase(ph) }
      if (analyser) {
        analyser.getFloatTimeDomainData(buf)
        const fr = tracker.process(buf)
        meter = { db: fr.db, gateDb: 20 * Math.log10(fr.gate), quiet: now >= countIn ? meter.quiet * 0.95 + (fr.tooQuiet ? 0.05 : 0) : 0 }
        liveRef.current.meter = meter
        if (now >= countIn - 0.2) liveRef.current.frames.push({ t: now, midi: fr.midi })
      }
      await new Promise(r => setTimeout(r, SAMPLE_MS))
    }
    if (stopRef.current) return

    if (!listenOnly) {
      const r = scoreTake(timed, liveRef.current.frames)
      r.notes.forEach(n => liveRef.current.scores.set(n.idx, n.score))
      setResult(r)
      appendLog({
        date: new Date().toISOString(), kind: 'song', exercise: 'song',
        score: r.score, seconds: Math.round((Date.now() - t0) / 1000),
      })
    }
    setPhase(listenOnly ? 'idle' : 'complete')
    cleanup()
  }, [cleanup])

  useEffect(() => () => { stopRef.current = true; cleanup() }, [cleanup])

  return { phase, result, error, liveRef, start, stop }
}

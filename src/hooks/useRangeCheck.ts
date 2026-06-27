import { useState, useRef, useCallback, useEffect } from 'react'
import { detectPitch } from '../utils/pitchDetection'
import { midiToFrequency, NOTE_NAMES_EN } from '../utils/musicTheory'
import { playBeep } from '../utils/audioUtils'

export type RangePhase = 'idle' | 'beep' | 'sing' | 'complete'

export interface RangeCheckState {
  phase: RangePhase
  currentMidi: number
  results: Map<number, boolean>   // midi → success/fail
  direction: 'up' | 'down'
  consecutiveFails: number
  liveFreq: number | null
  liveCents: number | null
  error: string | null
}

const BEEP_MS     = 500
const SING_MS     = 2500
const SAMPLE_MS   = 50
const WINDOW      = 10   // last N samples
const MIN_HITS    = 3    // hits in window to count as success
const CENTS_RANGE = 50   // ±¢ tolerance
const MAX_FAILS   = 3
const MIDI_LOW    = 36   // C2
const MIDI_HIGH   = 88   // E6

const INITIAL: RangeCheckState = {
  phase: 'idle',
  currentMidi: 48,
  results: new Map(),
  direction: 'up',
  consecutiveFails: 0,
  liveFreq: null,
  liveCents: null,
  error: null,
}

export function useRangeCheck() {
  const [state, setState] = useState<RangeCheckState>(INITIAL)

  const stopRef     = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)

  const cleanup = useCallback(() => {
    audioCtxRef.current?.close().catch(() => {})
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current = null
    analyserRef.current = null
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    stopRef.current = true
    cleanup()
    setState(INITIAL)
  }, [cleanup])

  const start = useCallback(async (startMidi: number) => {
    stopRef.current = false
    setState({ ...INITIAL, currentMidi: startMidi })

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.5
      ctx.createMediaStreamSource(stream).connect(analyser)
      analyserRef.current = analyser
    } catch {
      setState(prev => ({ ...prev, error: 'マイクにアクセスできません。ブラウザの権限を確認してください。' }))
      return
    }

    const results = new Map<number, boolean>()
    const timeBuf = new Float32Array(4096)

    for (const direction of ['up', 'down'] as const) {
      if (stopRef.current) break
      let consecutiveFails = 0
      let currentMidi = direction === 'up' ? startMidi : startMidi - 1

      while (!stopRef.current && currentMidi >= MIDI_LOW && currentMidi <= MIDI_HIGH) {
        // ── Beep phase ──────────────────────────────────────
        setState(prev => ({ ...prev, phase: 'beep', currentMidi, direction, consecutiveFails }))
        if (audioCtxRef.current) playBeep(audioCtxRef.current, currentMidi, BEEP_MS / 1000)
        await new Promise(r => setTimeout(r, BEEP_MS))
        if (stopRef.current) break

        // ── Sing phase ──────────────────────────────────────
        setState(prev => ({ ...prev, phase: 'sing', liveFreq: null, liveCents: null }))
        const targetFreq = midiToFrequency(currentMidi)
        const recentHits: boolean[] = []
        let success = false
        const t0 = Date.now()

        while (Date.now() - t0 < SING_MS && !stopRef.current) {
          const ctx      = audioCtxRef.current
          const analyser = analyserRef.current
          if (ctx && analyser) {
            analyser.getFloatTimeDomainData(timeBuf)
            const freq = detectPitch(timeBuf, ctx.sampleRate)
            let cents: number | null = null
            let hit = false

            if (freq) {
              cents = Math.log2(freq / targetFreq) * 1200
              hit   = Math.abs(cents) <= CENTS_RANGE
            }

            recentHits.push(hit)
            if (recentHits.length > WINDOW) recentHits.shift()

            if (recentHits.length === WINDOW) {
              const hitCount = recentHits.filter(Boolean).length
              if (hitCount >= MIN_HITS) { success = true; break }
            }

            setState(prev => ({ ...prev, liveFreq: freq ?? null, liveCents: cents }))
          }
          await new Promise(r => setTimeout(r, SAMPLE_MS))
        }
        if (stopRef.current) break

        // ── Record result ────────────────────────────────────
        results.set(currentMidi, success)
        consecutiveFails = success ? 0 : consecutiveFails + 1

        setState(prev => ({
          ...prev,
          results: new Map(results),
          consecutiveFails,
        }))

        if (consecutiveFails >= MAX_FAILS) break

        currentMidi = direction === 'up' ? currentMidi + 1 : currentMidi - 1
      }
    }

    if (!stopRef.current) {
      setState(prev => ({ ...prev, phase: 'complete', results: new Map(results) }))
    }
    cleanup()
  }, [cleanup])

  useEffect(() => () => { stopRef.current = true; cleanup() }, [cleanup])

  const successMidis = [...state.results.entries()].filter(([, ok]) => ok).map(([m]) => m)
  const minMidi = successMidis.length > 0 ? Math.min(...successMidis) : null
  const maxMidi = successMidis.length > 0 ? Math.max(...successMidis) : null

  // Human-readable note name helper
  const midiToName = (midi: number) =>
    `${NOTE_NAMES_EN[midi % 12]}${Math.floor(midi / 12) - 1}`

  return { state, start, stop, minMidi, maxMidi, midiToName }
}

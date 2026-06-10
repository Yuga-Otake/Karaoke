import { useState, useRef, useCallback, useEffect } from 'react'
import { detectPitch } from '../utils/pitchDetection'
import { frequencyToNote, midiToFrequency, NOTE_NAMES_EN, NOTE_NAMES_JP, SCALES } from '../utils/musicTheory'
import { analyzeResonance } from '../utils/resonanceAnalysis'

export interface KaraokeNote {
  midiNumber: number
  noteIndex: number
  octave: number
  solfege: string
  noteName: string
  noteNameJP: string
}

export interface NoteScore {
  note: KaraokeNote
  pitchAccuracy: number  // 0-100
  resonance: number      // 0-100
  totalScore: number     // 0-100
  grade: string
  centsAvg: number       // average absolute cents off target
}

export type KaraokePhase = 'idle' | 'countdown' | 'beep' | 'sing' | 'complete'

export interface KaraokeState {
  phase: KaraokePhase
  countdown: number
  currentNoteIdx: number
  noteScores: NoteScore[]
  totalScore: number
  // live data during 'sing'
  liveAccuracy: number
  liveResonance: number
  liveCents: number       // signed cents from target
  liveDetected: boolean
  error: string | null
}

const INITIAL: KaraokeState = {
  phase: 'idle', countdown: 3, currentNoteIdx: 0,
  noteScores: [], totalScore: 0,
  liveAccuracy: 0, liveResonance: 0, liveCents: 0, liveDetected: false,
  error: null,
}

function gradeOf(score: number): string {
  if (score >= 95) return 'S'
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

function playBeep(ctx: AudioContext, midi: number, durationSec = 0.45) {
  const freq = midiToFrequency(midi)
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  // Piano-like envelope
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + durationSec * 0.6)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durationSec + 0.05)
}

export function buildSequence(
  scaleKey: string,
  rootNote: number,   // 0-11
  octave: number,
  direction: 'up' | 'down' | 'updown',
): KaraokeNote[] {
  const scale = SCALES[scaleKey]
  if (!scale) return []

  // Intervals including the octave note at top
  const intervals = [...scale.intervals, 12]
  const degrees   = [...scale.degrees, scale.degrees[0]]  // repeat first degree for octave

  const makeNote = (interval: number, degIdx: number): KaraokeNote => {
    const totalSemitones = rootNote + interval
    const noteIdx = ((totalSemitones % 12) + 12) % 12
    const noteOctave = octave + Math.floor(totalSemitones / 12)
    return {
      midiNumber: (noteOctave + 1) * 12 + noteIdx,
      noteIndex: noteIdx,
      octave: noteOctave,
      solfege: degrees[degIdx] ?? degrees[0],
      noteName: NOTE_NAMES_EN[noteIdx],
      noteNameJP: NOTE_NAMES_JP[noteIdx],
    }
  }

  const up = intervals.map((iv, i) => makeNote(iv, i))

  if (direction === 'up')     return up
  if (direction === 'down')   return [...up].reverse()
  // updown: up + down without repeating the top note
  return [...up, ...[...up].reverse().slice(1)]
}

export function useKaraoke() {
  const [state, setState] = useState<KaraokeState>(INITIAL)

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

  const start = useCallback(async (notes: KaraokeNote[], noteDurationMs: number) => {
    stopRef.current = false
    setState({ ...INITIAL })

    // ── Mic setup ───────────────────────────────────────────────────
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

    // ── Countdown ───────────────────────────────────────────────────
    for (let c = 3; c >= 1; c--) {
      if (stopRef.current) return
      setState(prev => ({ ...prev, phase: 'countdown', countdown: c }))
      await new Promise(r => setTimeout(r, 900))
    }

    const noteScores: NoteScore[] = []

    // ── Note loop ───────────────────────────────────────────────────
    for (let i = 0; i < notes.length; i++) {
      if (stopRef.current) break
      const note = notes[i]

      // Beep: play reference tone
      setState(prev => ({ ...prev, phase: 'beep', currentNoteIdx: i }))
      if (audioCtxRef.current) playBeep(audioCtxRef.current, note.midiNumber)
      await new Promise(r => setTimeout(r, 520))
      if (stopRef.current) break

      // Sing window: collect pitch + resonance samples
      setState(prev => ({ ...prev, phase: 'sing', currentNoteIdx: i, liveDetected: false }))

      const singWindowMs = noteDurationMs - 520
      const targetFreq   = midiToFrequency(note.midiNumber)
      const timeBuf      = new Float32Array(4096)
      const freqBuf      = new Float32Array(2048)
      const sampleData: Array<{ pitch: number; res: number; cents: number; detected: boolean }> = []
      const t0           = Date.now()

      while (Date.now() - t0 < singWindowMs && !stopRef.current) {
        const ctx      = audioCtxRef.current
        const analyser = analyserRef.current
        if (ctx && analyser) {
          analyser.getFloatTimeDomainData(timeBuf)
          analyser.getFloatFrequencyData(freqBuf)

          const freq = detectPitch(timeBuf, ctx.sampleRate)
          let cents = 0, pitchScore = 0, resonance = 0

          if (freq) {
            cents      = Math.log2(freq / targetFreq) * 1200  // signed, relative to target
            pitchScore = Math.max(0, 100 - Math.abs(cents) * 1.5)
            resonance  = analyzeResonance(freqBuf, freq, ctx.sampleRate, 4096).resonanceScore
          }

          sampleData.push({ pitch: pitchScore, res: resonance, cents, detected: !!freq })

          setState(prev => ({
            ...prev,
            liveAccuracy: Math.round(pitchScore),
            liveResonance: Math.round(resonance),
            liveCents: Math.round(cents),
            liveDetected: !!freq,
          }))
        }
        await new Promise(r => setTimeout(r, 50))
      }

      if (stopRef.current) break

      // ── Score the note ─────────────────────────────────────────
      const detected    = sampleData.filter(s => s.detected)
      const voicedRatio = detected.length / (sampleData.length || 1)
      const avgPitch    = voicedRatio < 0.25
        ? voicedRatio * 200            // heavy penalty for not singing
        : detected.reduce((s, d) => s + d.pitch, 0) / detected.length
      const avgRes      = detected.length > 0
        ? detected.reduce((s, d) => s + d.res, 0) / detected.length
        : 0
      const avgCentsAbs = detected.length > 0
        ? detected.reduce((s, d) => s + Math.abs(d.cents), 0) / detected.length
        : 999

      const total = Math.round(avgPitch * 0.65 + avgRes * 0.35)

      noteScores.push({
        note,
        pitchAccuracy: Math.round(Math.min(100, avgPitch)),
        resonance: Math.round(avgRes),
        totalScore: Math.min(100, total),
        grade: gradeOf(Math.min(100, total)),
        centsAvg: Math.round(avgCentsAbs),
      })

      setState(prev => ({ ...prev, noteScores: [...noteScores] }))
    }

    if (!stopRef.current) {
      const totalScore = Math.round(
        noteScores.reduce((s, n) => s + n.totalScore, 0) / (noteScores.length || 1)
      )
      setState(prev => ({ ...prev, phase: 'complete', totalScore }))
    }
    cleanup()
  }, [cleanup])

  useEffect(() => () => { stopRef.current = true; cleanup() }, [cleanup])

  return { state, start, stop }
}

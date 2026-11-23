import { computeRMS, yinPitch } from './pitchDetection'

// ─── Robust live pitch tracking for the training exercises ───────────────────
//  • Adaptive noise gate: learns the room's noise floor, so quiet voices on a
//    quiet phone mic still count, and background noise in a loud room doesn't.
//  • Clarity check: frames that are not clearly pitched (breath, noise, clicks)
//    are rejected instead of producing random notes.
//  • Spike removal: a median over the last 3 pitched frames drops one-frame
//    glitches (octave jumps, consonants).
//  • Gap bridging: a single dropped frame inside a sung note is filled in.

export type Sensitivity = 'high' | 'normal' | 'low'

export const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  high: '高（小さい声・ハミング向け）',
  normal: '標準',
  low: '低（周りがうるさい時）',
}

const SETTINGS: Record<Sensitivity, { minGate: number; gateMul: number; maxAp: number }> = {
  high:   { minGate: 0.0012, gateMul: 2.0, maxAp: 0.45 },
  normal: { minGate: 0.0025, gateMul: 2.8, maxAp: 0.38 },
  low:    { minGate: 0.006,  gateMul: 4.0, maxAp: 0.25 },
}

const KEY = 'vtSensitivity'

export function loadSensitivity(): Sensitivity {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'high' || v === 'normal' || v === 'low') return v
  } catch { /* ignore */ }
  return 'normal'
}

export function saveSensitivity(s: Sensitivity) {
  try { localStorage.setItem(KEY, s) } catch { /* ignore */ }
}

export interface TrackedFrame {
  midi: number | null    // smoothed pitch (fractional MIDI) or null = no voice
  rms: number
  db: number
  gate: number           // current loudness gate (RMS)
  tooQuiet: boolean      // something is there, but under the gate
}

export class PitchTracker {
  private cfg: { minGate: number; gateMul: number; maxAp: number }
  private noise = -1
  private recent: number[] = []
  private lastMidi: number | null = null
  private missed = 0

  constructor(private sampleRate: number, sensitivity: Sensitivity = loadSensitivity()) {
    this.cfg = SETTINGS[sensitivity]
  }

  /** Feed frames recorded while nobody is singing, to learn the room's noise floor. */
  calibrate(buf: Float32Array) {
    const rms = computeRMS(buf)
    this.noise = this.noise < 0 ? rms : this.noise * 0.8 + rms * 0.2
  }

  get gate(): number {
    return Math.max(this.cfg.minGate, (this.noise < 0 ? 0 : this.noise) * this.cfg.gateMul)
  }

  process(buf: Float32Array): TrackedFrame {
    const rms = computeRMS(buf)
    const db = 20 * Math.log10(Math.max(rms, 1e-5))
    if (this.noise < 0) this.noise = rms

    const gate = this.gate
    let raw: number | null = null
    if (rms >= gate) {
      const r = yinPitch(buf, this.sampleRate, this.cfg.maxAp)
      if (r) raw = 69 + 12 * Math.log2(r.frequency / 440)
    }

    if (raw === null) {
      // Learn the noise floor only from unpitched frames: fall fast, rise slowly
      // (loud unpitched sounds like breaths or lip-roll buzz don't raise it)
      if (rms < this.noise) this.noise += (rms - this.noise) * 0.3
      else if (rms < gate * 1.2) this.noise += (rms - this.noise) * 0.02
      this.missed++
      if (this.lastMidi !== null && this.missed === 1 && rms >= gate * 0.5) {
        // bridge a single dropped frame inside a note
        return { midi: this.lastMidi, rms, db, gate, tooQuiet: false }
      }
      if (this.missed > 1) { this.recent = []; this.lastMidi = null }
      return { midi: null, rms, db, gate, tooQuiet: rms > gate * 0.4 && rms < gate }
    }

    this.missed = 0
    this.recent.push(raw)
    if (this.recent.length > 3) this.recent.shift()
    const midi = this.recent.length === 3 ? [...this.recent].sort((a, b) => a - b)[1] : raw
    this.lastMidi = midi
    return { midi, rms, db, gate, tooQuiet: false }
  }
}

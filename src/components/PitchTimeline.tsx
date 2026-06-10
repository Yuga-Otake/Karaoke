import { useEffect, useRef } from 'react'
import { PitchSample } from '../hooks/useRecorder'
import { NOTE_NAMES_EN, NOTE_COLORS } from '../utils/musicTheory'

interface Props {
  samples: PitchSample[]
  duration: number
  playbackTime: number
}

// Y-axis: log-frequency from MIDI 36 (C2) to MIDI 84 (C6)
const MIN_MIDI = 36
const MAX_MIDI = 84
const LABEL_W  = 38   // px reserved for note labels

function midiToFreq(m: number) { return 440 * Math.pow(2, (m - 69) / 12) }
const MIN_FREQ = midiToFreq(MIN_MIDI)
const MAX_FREQ = midiToFreq(MAX_MIDI)

function freqToNormY(freq: number) {
  return 1 - (Math.log2(freq / MIN_FREQ) / Math.log2(MAX_FREQ / MIN_FREQ))
}

export function PitchTimeline({ samples, duration, playbackTime }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ptRef     = useRef(playbackTime)
  ptRef.current   = playbackTime

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Match canvas resolution to CSS display size
    const W = canvas.offsetWidth  || 700
    const H = canvas.offsetHeight || 200
    canvas.width  = W
    canvas.height = H

    const drawW = W - LABEL_W   // width of the timeline area

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#080b14'
    ctx.fillRect(0, 0, W, H)

    // ── Guide lines: one per semitone, label every C ──────────────────
    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const freq = midiToFreq(midi)
      const y = freqToNormY(freq) * H
      const noteIdx = ((midi % 12) + 12) % 12
      const isC     = noteIdx === 0
      const isWhite = ![1, 3, 6, 8, 10].includes(noteIdx)

      ctx.strokeStyle = isC ? '#1e3a5f' : isWhite ? '#0f172a' : 'transparent'
      if (!isC && !isWhite) continue
      ctx.lineWidth = isC ? 1 : 0.5
      ctx.beginPath(); ctx.moveTo(LABEL_W, y); ctx.lineTo(W, y); ctx.stroke()

      if (isC) {
        const octave = Math.floor(midi / 12) - 1
        ctx.fillStyle = '#334155'
        ctx.font = '9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`C${octave}`, LABEL_W - 3, y + 3)
      }
    }

    // ── Time grid ─────────────────────────────────────────────────────
    const step = duration <= 10 ? 1 : duration <= 30 ? 5 : 10
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 0.5
    ctx.fillStyle = '#334155'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    for (let t = 0; t <= duration; t += step) {
      const x = LABEL_W + (t / duration) * drawW
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 12); ctx.stroke()
      ctx.fillText(`${t}s`, x, H - 2)
    }

    // ── Pitch line ────────────────────────────────────────────────────
    let prevX: number | null = null
    let prevY: number | null = null

    for (const s of samples) {
      const freq = s.frequency
      if (!freq || freq < MIN_FREQ || freq > MAX_FREQ) {
        prevX = null; prevY = null; continue
      }
      const x = LABEL_W + (s.time / duration) * drawW
      const y = freqToNormY(freq) * H
      const color = NOTE_COLORS[s.noteInfo?.noteIndex ?? 0]

      if (prevX !== null && prevY !== null) {
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.shadowBlur = 5
        ctx.shadowColor = color
        ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(x, y); ctx.stroke()
        ctx.shadowBlur = 0
      }
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill()
      prevX = x; prevY = y
    }

    // ── Playback cursor ───────────────────────────────────────────────
    if (playbackTime > 0 && playbackTime <= duration) {
      const x = LABEL_W + (playbackTime / duration) * drawW
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 12); ctx.stroke()
      ctx.setLineDash([])
    }
  }, [samples, duration, playbackTime])

  return (
    <canvas
      ref={canvasRef}
      className="pitch-timeline-canvas"
    />
  )
}

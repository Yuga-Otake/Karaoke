import { useEffect, useRef } from 'react'
import { PitchSample } from '../hooks/useRecorder'
import { NOTE_NAMES_EN, NOTE_COLORS } from '../utils/musicTheory'

interface Props {
  samples: PitchSample[]
  duration: number
  playbackTime: number
  lyricsChars?: Array<{ char: string; time: number }>  // time in seconds
  bpm?: number | null
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

const SOLFEGE: Array<[number, string]> = [[0,'ド'],[2,'レ'],[4,'ミ'],[7,'ソ'],[9,'ラ']]

export function PitchTimeline({ samples, duration, playbackTime, lyricsChars, bpm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ptRef     = useRef(playbackTime)
  ptRef.current   = playbackTime

  useEffect(() => {  // eslint-disable-line react-hooks/exhaustive-deps
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

    // ── Guide lines: one per semitone, solfège labels for ド/レ/ミ/ソ/ラ ──
    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const freq = midiToFreq(midi)
      const y = freqToNormY(freq) * H
      const noteIdx = ((midi % 12) + 12) % 12
      const isC     = noteIdx === 0
      const isWhite = ![1, 3, 6, 8, 10].includes(noteIdx)

      if (!isC && !isWhite) continue
      ctx.strokeStyle = isC ? '#1e3a5f' : '#0f172a'
      ctx.lineWidth = isC ? 1 : 0.5
      ctx.beginPath(); ctx.moveTo(LABEL_W, y); ctx.lineTo(W, y); ctx.stroke()

      const sf = SOLFEGE.find(([idx]) => idx === noteIdx)
      if (sf) {
        const octave = Math.floor(midi / 12) - 1
        const label = isC ? `ド${octave}` : sf[1]
        ctx.fillStyle = isC ? '#4a7fa5' : '#2d4a6a'
        ctx.font = '9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(label, LABEL_W - 3, y + 3)
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

    // ── BPM beat grid ─────────────────────────────────────────────────
    if (bpm && duration > 0) {
      const beatSec = 60 / bpm
      let beat = 0
      for (let t = 0; t <= duration; t += beatSec, beat++) {
        const x = LABEL_W + (t / duration) * drawW
        const isMeasure = beat % 4 === 0
        ctx.strokeStyle = isMeasure ? 'rgba(251,146,60,0.5)' : 'rgba(251,146,60,0.18)'
        ctx.lineWidth = isMeasure ? 1 : 0.5
        ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 12); ctx.stroke()
        if (isMeasure) {
          ctx.fillStyle = 'rgba(251,146,60,0.6)'
          ctx.font = '8px monospace'
          ctx.textAlign = 'left'
          ctx.fillText(`${Math.floor(beat / 4) + 1}`, x + 2, 9)
        }
      }
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

    // ── Lyrics overlay ───────────────────────────────────────────────
    if (lyricsChars && lyricsChars.length > 0 && duration > 0) {
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      for (const { char, time } of lyricsChars) {
        const x = LABEL_W + (time / duration) * drawW
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(char, x, 14)
      }
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
  }, [samples, duration, playbackTime, lyricsChars, bpm])

  return (
    <canvas
      ref={canvasRef}
      className="pitch-timeline-canvas"
    />
  )
}

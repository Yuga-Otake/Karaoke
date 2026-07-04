import { useRef, useEffect, useState } from 'react'
import {
  useVocalTechniqueAnalyzer,
  VocalTechnique,
  PitchPoint,
} from '../hooks/useVocalTechniqueAnalyzer'

// ─── constants ──────────────────────────────────────────────────────────────

export const TECH_COLORS: Record<VocalTechnique, string> = {
  none:    '#00e5ff',
  vibrato: '#4ade80',
  kobushi: '#facc15',
  shakuri: '#60a5fa',
  fall:    '#fb923c',
}

const TECH_BG: Record<VocalTechnique, string> = {
  none:    'rgba(0,229,255,.1)',
  vibrato: 'rgba(74,222,128,.12)',
  kobushi: 'rgba(250,204,21,.12)',
  shakuri: 'rgba(96,165,250,.12)',
  fall:    'rgba(251,146,60,.12)',
}

const GUIDE: Record<VocalTechnique, { jp: string; title: string; desc: string; target: string }> = {
  none:    { jp: '',       title: '',           desc: '', target: '' },
  vibrato: { jp: 'ビブラート', title: 'Vibrato',  desc: '音を伸ばしながら、腹式呼吸を使って音程を周期的に揺らします。腹や喉を使って自然に波打つイメージで。', target: '目標: 速さ 5〜7 Hz　深さ ±30〜60¢' },
  kobushi: { jp: 'こぶし',   title: 'Kobushi',   desc: '演歌・民謡の表現技法。ビブラートより速く細かく揺らします。喉を使って素早く動かします。',               target: '目標: 速さ 8〜15 Hz　深さ ±10〜40¢' },
  shakuri: { jp: 'しゃくり',  title: 'Shakuri',  desc: '目標音より低い音から素早く滑り上がって音を当てます。音の頭を下から「くぃっ」と上げる感覚。',            target: '目標: 100〜300¢ 上昇　0.2〜0.5秒' },
  fall:    { jp: 'フォール',  title: 'Fall',     desc: '音をしっかり出した後、そのまま音程を下に流します。「ん〜」と音を伸ばしながら自然に下げていく。',           target: '目標: 100〜400¢ 下降　0.3〜0.8秒' },
}

const ORDERED: VocalTechnique[] = ['vibrato', 'kobushi', 'shakuri', 'fall']

// ─── PitchContourCanvas ──────────────────────────────────────────────────────

function PitchContourCanvas({
  history,
  windowMs = 4000,
}: {
  history: PitchPoint[]
  windowMs?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#060a14'
    ctx.fillRect(0, 0, W, H)

    const MIDI_MIN = 36   // C2
    const MIDI_MAX = 84   // C6
    const MIDI_RANGE = MIDI_MAX - MIDI_MIN
    const midiToY = (m: number) => H - ((m - MIDI_MIN) / MIDI_RANGE) * H

    const nowT = history.length > 0 ? history[history.length - 1].t : performance.now()
    const timeToX = (t: number) => W - ((nowT - t) / windowMs) * W

    // Piano-key background (black keys darker)
    const BLACK_KEYS = new Set([1, 3, 6, 8, 10])
    for (let m = MIDI_MIN; m < MIDI_MAX; m++) {
      if (BLACK_KEYS.has(m % 12)) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        const y1 = midiToY(m + 1)
        const y2 = midiToY(m)
        ctx.fillRect(0, y1, W, y2 - y1)
      }
    }

    // Grid lines with solfège labels
    const SOLFEGE_VT: Array<[number, string]> = [[0,'ド'],[2,'レ'],[4,'ミ'],[7,'ソ'],[9,'ラ']]
    for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
      const y = midiToY(m)
      const noteIdx = ((m % 12) + 12) % 12
      const isC = noteIdx === 0
      ctx.strokeStyle = isC ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'
      ctx.lineWidth = isC ? 0.8 : 0.5
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      const sf = SOLFEGE_VT.find(([idx]) => idx === noteIdx)
      if (sf) {
        const oct = Math.floor(m / 12) - 1
        const label = isC ? `ド${oct}` : sf[1]
        ctx.fillStyle = isC ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)'
        ctx.font = '10px monospace'
        ctx.fillText(label, 4, y - 2)
      }
    }

    // Time grid
    const secSteps = Math.ceil(windowMs / 1000)
    for (let s = 0; s <= secSteps; s++) {
      const x = W * (1 - (s * 1000) / windowMs)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      if (s > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.font = '9px monospace'
        ctx.fillText(`-${s}s`, x + 2, H - 4)
      }
    }

    // Pitch curve
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    let prev: { x: number; y: number } | null = null

    for (const pt of history) {
      if (!pt.midi) { prev = null; continue }
      const x = timeToX(pt.t)
      if (x < 0 || x > W + 10) { prev = null; continue }
      const y = midiToY(pt.midi)
      const color = TECH_COLORS[pt.technique]

      if (prev) {
        ctx.strokeStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur = 5
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
      prev = { x, y }
    }
    ctx.shadowBlur = 0

    // "Now" dashed marker at right edge
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 5])
    ctx.beginPath(); ctx.moveTo(W - 1, 0); ctx.lineTo(W - 1, H); ctx.stroke()
    ctx.setLineDash([])
  }, [history, windowMs])

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={180}
      className="vt-canvas"
    />
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="vt-legend">
      {ORDERED.map(t => (
        <span key={t} style={{ color: TECH_COLORS[t] }} className="vt-legend-dot">
          ● {GUIDE[t].jp}
        </span>
      ))}
      <span style={{ color: TECH_COLORS.none }} className="vt-legend-dot">● 通常</span>
    </div>
  )
}

// ─── RecordingResult ─────────────────────────────────────────────────────────

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function RecordingResult({
  recording,
  onClear,
  onSave,
}: {
  recording: { history: PitchPoint[]; url: string | null; blob?: Blob | null; duration: number }
  onClear: () => void
  onSave?: () => void
}) {
  const windowMs = Math.max(4000, recording.duration * 1000 * 1.05)

  // Count technique occurrences
  const techCounts: Record<VocalTechnique, number> = {
    none: 0, vibrato: 0, kobushi: 0, shakuri: 0, fall: 0,
  }
  for (const pt of recording.history) techCounts[pt.technique]++
  const total = recording.history.length || 1

  return (
    <div className="vt-recording-result">
      <div className="vt-rec-result-header">
        <span className="vt-rec-result-title">録音結果 — {fmt(recording.duration)}</span>
        <button className="vt-btn-small" onClick={onClear}>✕ 消去</button>
      </div>

      <div className="vt-rec-controls">
        {recording.url && (
          <audio controls src={recording.url} className="vt-audio-player" />
        )}
        {recording.url && (
          <a className="vt-btn-small download" href={recording.url} download="vocal-practice.webm">
            ⬇ 保存
          </a>
        )}
        {onSave && (
          <button className="vt-btn-small save-to-rec" onClick={onSave}>
            🎵 録音タブに保存
          </button>
        )}
      </div>

      <Legend />
      <PitchContourCanvas history={recording.history} windowMs={windowMs} />

      <div className="vt-rec-breakdown">
        {ORDERED.map(t => {
          const pct = Math.round((techCounts[t] / total) * 100)
          if (pct === 0) return null
          return (
            <div key={t} className="vt-rec-row">
              <span className="vt-rec-row-label" style={{ color: TECH_COLORS[t] }}>
                {GUIDE[t].jp}
              </span>
              <div className="vt-rec-bar-wrap">
                <div className="vt-rec-bar-fill" style={{ width: `${pct}%`, background: TECH_COLORS[t] }} />
              </div>
              <span className="vt-rec-pct">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  onSaveToRecording?: (url: string, blob: Blob, history: PitchPoint[], duration: number) => void
}

export function VocalTechniqueTrainer({ onSaveToRecording }: Props) {
  const { state, start, stop, startRecording, stopRecording, clearRecording } =
    useVocalTechniqueAnalyzer()

  const [focus, setFocus] = useState<VocalTechnique>('vibrato')
  const { active, recording, metrics, stableDetected, liveHistory, savedRecording, error, volume } = state
  const { confidence, rate, depth, delta } = metrics

  const focusDetected = stableDetected === focus
  const guide = GUIDE[focus]

  return (
    <div className="vt-trainer">

      {/* Technique selector */}
      <div className="vt-tech-selector">
        {ORDERED.map(t => (
          <button
            key={t}
            className={`vt-tech-btn ${focus === t ? 'focus' : ''} ${stableDetected === t && active ? 'live-detected' : ''}`}
            style={focus === t ? { borderColor: TECH_COLORS[t], color: TECH_COLORS[t] } : {}}
            onClick={() => setFocus(t)}
          >
            <span className="vt-tech-jp">{GUIDE[t].jp}</span>
            <span className="vt-tech-en">{GUIDE[t].title}</span>
          </button>
        ))}
      </div>

      {/* Guide card */}
      <div className="vt-guide" style={{ borderLeftColor: TECH_COLORS[focus] }}>
        <div className="vt-guide-desc">{guide.desc}</div>
        <div className="vt-guide-target" style={{ color: TECH_COLORS[focus] }}>{guide.target}</div>
      </div>

      {/* Controls */}
      <div className="vt-controls">
        {!active ? (
          <button className="vt-btn start" onClick={start}>▶ 分析開始</button>
        ) : (
          <button className="vt-btn stop-btn" onClick={stop}>■ 停止</button>
        )}
        {active && !recording && (
          <button className="vt-btn record" onClick={startRecording}>● 録音</button>
        )}
        {recording && (
          <>
            <button className="vt-btn rec-stop" onClick={stopRecording}>■ 録音停止</button>
            <div className="vt-rec-indicator">
              <span className="vt-rec-dot" />
              REC
            </div>
          </>
        )}
      </div>

      {error && <div className="vt-error">⚠ {error}</div>}

      {/* Live canvas */}
      {active && (
        <div className="vt-canvas-section">
          <Legend />
          <PitchContourCanvas history={liveHistory} windowMs={4000} />
        </div>
      )}

      {/* Volume indicator */}
      {active && (
        <div className="vt-vol-row">
          <span className="vt-vol-label">音量</span>
          <div className="vt-vol-track">
            <div className="vt-vol-fill" style={{ width: `${Math.min(100, Math.round(volume * 300))}%` }} />
          </div>
        </div>
      )}

      {/* Live metrics */}
      {active && (
        <div className={`vt-metrics ${focusDetected ? 'focus-detected' : ''}`}>
          {stableDetected !== 'none' ? (
            <>
              <div
                className="vt-badge"
                style={{
                  background: TECH_BG[stableDetected],
                  borderColor: TECH_COLORS[stableDetected],
                  color: TECH_COLORS[stableDetected],
                }}
              >
                ✓ {GUIDE[stableDetected].jp}検出！
                <span className="vt-badge-conf">{confidence}%</span>
              </div>

              {(stableDetected === 'vibrato' || stableDetected === 'kobushi') && (
                <div className="vt-metric-row">
                  <div className="vt-metric">
                    <span className="vt-metric-label">速さ</span>
                    <span className="vt-metric-val" style={{ color: TECH_COLORS[stableDetected] }}>
                      {rate.toFixed(1)} Hz
                    </span>
                    <span className="vt-metric-hint">
                      目標: {stableDetected === 'vibrato' ? '5〜7' : '8〜15'} Hz
                    </span>
                  </div>
                  <div className="vt-metric">
                    <span className="vt-metric-label">深さ</span>
                    <span className="vt-metric-val" style={{ color: TECH_COLORS[stableDetected] }}>
                      ±{depth}¢
                    </span>
                    <span className="vt-metric-hint">目標: ±30〜60¢</span>
                  </div>
                </div>
              )}

              {(stableDetected === 'shakuri' || stableDetected === 'fall') && (
                <div className="vt-metric-row">
                  <div className="vt-metric">
                    <span className="vt-metric-label">音程変化</span>
                    <span className="vt-metric-val" style={{ color: TECH_COLORS[stableDetected] }}>
                      {delta > 0 ? '+' : ''}{delta}¢
                    </span>
                    <span className="vt-metric-hint">
                      {stableDetected === 'shakuri' ? '↑ 上昇' : '↓ 下降'}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {(focus === 'vibrato' || focus === 'kobushi') && rate > 0 && (
                <div className="vt-partial-detect">
                  <span style={{ opacity: 0.4 }}>{rate.toFixed(1)} Hz&nbsp;/&nbsp;±{depth}¢</span>
                  <span className="vt-hint-label"> 検出中…</span>
                </div>
              )}
              <div className="vt-hint-msg">
                {state.freq
                  ? `${Math.round(state.freq)} Hz — ${focus === 'vibrato' || focus === 'kobushi' ? '音を伸ばしながら揺らしてみましょう' : focus === 'shakuri' ? '音の頭を下から滑り込ませてみましょう' : '音を出してから下に流してみましょう'}`
                  : '声を出してください…'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Saved recording */}
      {savedRecording && (
        <RecordingResult
          recording={savedRecording}
          onClear={clearRecording}
          onSave={onSaveToRecording && savedRecording.blob && savedRecording.url
            ? () => onSaveToRecording(
                savedRecording.url as string,
                savedRecording.blob as Blob,
                savedRecording.history,
                savedRecording.duration
              )
            : undefined
          }
        />
      )}
    </div>
  )
}

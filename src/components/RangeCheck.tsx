import { useState, useEffect } from 'react'
import { useRangeCheck } from '../hooks/useRangeCheck'
import { NOTE_NAMES_EN, midiToFrequency } from '../utils/musicTheory'

const DISPLAY_MIN = 36   // C2
const DISPLAY_MAX = 84   // C6
const MAX_FAILS   = 3

const START_OPTIONS = [
  { label: 'C2（低）', midi: 36 },
  { label: 'C3（中低）', midi: 48 },
  { label: 'C4（中）', midi: 60 },
]

function midiName(midi: number) {
  return `${NOTE_NAMES_EN[midi % 12]}${Math.floor(midi / 12) - 1}`
}

// ─── Live view during beep/sing ──────────────────────────────────────────────

function LiveRangeView({ state }: { state: ReturnType<typeof useRangeCheck>['state'] }) {
  const { currentMidi, direction, consecutiveFails, liveCents, liveFreq, phase } = state
  const targetFreq = midiToFrequency(currentMidi)
  const cents      = liveCents ?? 0
  const clamp      = Math.max(-100, Math.min(100, cents))
  const pct        = 50 + (clamp / 100) * 48
  const inTune     = liveFreq !== null && Math.abs(cents) <= 50
  const dotColor   = !liveFreq         ? '#475569'
    : Math.abs(cents) <= 50 ? '#4ade80'
    : Math.abs(cents) <= 100 ? '#facc15' : '#f87171'

  return (
    <div className="rc-live">
      <div className="rc-live-header">
        <span className="rc-direction">{direction === 'up' ? '↑ 上行中' : '↓ 下行中'}</span>
        <span className="rc-note-big">{midiName(currentMidi)}</span>
        <span className="rc-freq">{targetFreq.toFixed(1)} Hz</span>
      </div>

      <div className="rc-fail-dots">
        {Array.from({ length: MAX_FAILS }, (_, i) => (
          <span key={i} className={`fail-dot ${i < consecutiveFails ? 'filled' : ''}`}>●</span>
        ))}
      </div>

      {phase === 'beep' && (
        <div className="rc-beep-msg">♩ 音を聴いてください…</div>
      )}

      {phase === 'sing' && (
        <>
          {!liveFreq && (
            <div className="rc-no-voice">⚠ 声が検出されていません</div>
          )}
          <div className="lp-gauge-wrap">
            <span className="lp-gauge-lbl low">低い</span>
            <div className="lp-gauge">
              <div className="lp-gauge-zone" />
              <div className="lp-gauge-center" />
              <div
                className="lp-gauge-dot"
                style={{ left: `${pct}%`, background: dotColor, boxShadow: `0 0 8px ${dotColor}` }}
              />
            </div>
            <span className="lp-gauge-lbl high">高い</span>
          </div>
          <div className="lp-cents-val" style={{ color: dotColor }}>
            {!liveFreq  ? '---'
              : inTune  ? '✓ 範囲内！'
              : `${cents > 0 ? '+' : ''}${Math.round(cents)}¢`}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Results ─────────────────────────────────────────────────────────────────

function RangeResult({
  results,
  minMidi,
  maxMidi,
  startMidi,
}: {
  results: Map<number, boolean>
  minMidi: number | null
  maxMidi: number | null
  startMidi: number
}) {
  const range = minMidi !== null && maxMidi !== null ? maxMidi - minMidi : 0

  // Save to localStorage
  useEffect(() => {
    if (minMidi !== null && maxMidi !== null) {
      try {
        const history: Array<{ date: string; minMidi: number; maxMidi: number }> =
          JSON.parse(localStorage.getItem('rangeHistory') ?? '[]')
        history.unshift({ date: new Date().toISOString(), minMidi, maxMidi })
        localStorage.setItem('rangeHistory', JSON.stringify(history.slice(0, 10)))
      } catch {/* ignore */}
    }
  }, [minMidi, maxMidi])

  return (
    <div className="rc-result">
      <div className="rc-result-header">
        {minMidi !== null && maxMidi !== null ? (
          <>
            <span className="rc-range-label">{midiName(minMidi)} 〜 {midiName(maxMidi)}</span>
            <span className="rc-semitone-count">（{range} 半音）</span>
          </>
        ) : (
          <span className="rc-no-range">音域が検出できませんでした</span>
        )}
      </div>

      {/* Horizontal piano-roll bar */}
      <div className="rc-piano-bar-wrap">
        <div className="rc-piano-bar">
          {Array.from({ length: DISPLAY_MAX - DISPLAY_MIN + 1 }, (_, idx) => {
            const midi   = DISPLAY_MIN + idx
            const ok     = results.get(midi)
            const isEdge = midi === minMidi || midi === maxMidi
            return (
              <div
                key={midi}
                className={`rc-pb-cell ${ok === true ? 'success' : ok === false ? 'fail' : 'untested'}`}
                title={midiName(midi)}
              >
                {isEdge && (
                  <div className="rc-pb-label">{midiName(midi)}</div>
                )}
              </div>
            )
          })}
        </div>
        {/* Octave markers */}
        <div className="rc-octave-markers">
          {[2, 3, 4, 5, 6].map(oct => {
            const midi = (oct + 1) * 12
            if (midi < DISPLAY_MIN || midi > DISPLAY_MAX) return null
            const pct = ((midi - DISPLAY_MIN) / (DISPLAY_MAX - DISPLAY_MIN)) * 100
            return (
              <div key={oct} className="rc-octave-mark" style={{ left: `${pct}%` }}>
                C{oct}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Instructions ─────────────────────────────────────────────────────────────

function RangeInstructions() {
  return (
    <div className="rc-instructions">
      <p>① ▶ 開始 を押すと、低い音から順に基準音を再生します</p>
      <p>② 音が鳴ったら、その音を口で歌ってください（2.5 秒以内）</p>
      <p>③ 3回連続で出せなかった音で終了し、音域を表示します</p>
      <p>✱ イヤフォン推奨。静かな環境で行うと精度が上がります</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RangeCheck() {
  const { state, start, stop, minMidi, maxMidi } = useRangeCheck()
  const [startMidi, setStartMidi] = useState(48)

  const isRunning  = state.phase !== 'idle' && state.phase !== 'complete'
  const isComplete = state.phase === 'complete'

  return (
    <div className="range-check">

      {/* Settings */}
      <div className="rc-settings">
        <label className="rc-label">
          <span>開始音</span>
          <select
            value={startMidi}
            onChange={e => setStartMidi(Number(e.target.value))}
            disabled={isRunning}
          >
            {START_OPTIONS.map(o => (
              <option key={o.midi} value={o.midi}>{o.label}</option>
            ))}
          </select>
        </label>

        {!isRunning && !isComplete && (
          <button className="rc-start-btn" onClick={() => start(startMidi)}>▶ 開始</button>
        )}
        {isRunning && (
          <button className="rc-stop-btn" onClick={stop}>■ 停止</button>
        )}
        {isComplete && (
          <button className="rc-start-btn retry" onClick={() => start(startMidi)}>↺ もう一度</button>
        )}
      </div>

      {state.error && <div className="rc-error">⚠ {state.error}</div>}

      {/* Live feedback */}
      {(state.phase === 'beep' || state.phase === 'sing') && (
        <LiveRangeView state={state} />
      )}

      {/* Results */}
      {isComplete && (
        <RangeResult
          results={state.results}
          minMidi={minMidi}
          maxMidi={maxMidi}
          startMidi={startMidi}
        />
      )}

      {/* Instructions */}
      {state.phase === 'idle' && <RangeInstructions />}
    </div>
  )
}

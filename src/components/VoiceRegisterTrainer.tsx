import { useState, useEffect } from 'react'
import { useVoiceRegisterTrainer, PracticeResult } from '../hooks/useVoiceRegisterTrainer'
import { REGISTER_INFO, VoiceRegister } from '../utils/voiceRegister'
import { NOTE_NAMES_EN } from '../utils/musicTheory'

function midiName(midi: number) {
  return `${NOTE_NAMES_EN[midi % 12]}${Math.floor(midi / 12) - 1}`
}

const REGISTERS: Array<'chest' | 'mix' | 'falsetto'> = ['chest', 'mix', 'falsetto']

function regInfo(r: VoiceRegister) {
  return r !== 'none' ? REGISTER_INFO[r] : null
}

function RegisterMeter({
  stableRegister,
  harmonicRichness,
  freq,
  active,
}: {
  stableRegister: VoiceRegister
  harmonicRichness: number
  freq: number | null
  active: boolean
}) {
  return (
    <div className="vr-register-meter">
      <div className="vr-reg-cards">
        {REGISTERS.map(reg => {
          const info = REGISTER_INFO[reg]
          const isActive = stableRegister === reg
          return (
            <div
              key={reg}
              className={`vr-reg-card ${isActive ? 'active' : ''}`}
              style={{ '--vr-color': info.color } as React.CSSProperties}
            >
              <div className="vr-reg-jp">{info.jp}</div>
              <div className="vr-reg-en">{info.en}</div>
            </div>
          )
        })}
      </div>
      <div className="vr-richness-row">
        <span className="vr-richness-label">倍音の豊かさ</span>
        <div className="vr-richness-track">
          <div className="vr-richness-bar" style={{ width: `${active ? harmonicRichness : 0}%` }} />
          <div className="vr-richness-zone vr-zone-falsetto" />
          <div className="vr-richness-zone vr-zone-mix" />
          <div className="vr-richness-zone vr-zone-chest" />
        </div>
        <span className="vr-richness-val">{active ? `${harmonicRichness}%` : '--'}</span>
      </div>
      {active && freq && (
        <div className="vr-live-info">
          {freq.toFixed(1)} Hz
          {stableRegister !== 'none' && (
            <span style={{ color: REGISTER_INFO[stableRegister].color, marginLeft: '0.5rem' }}>
              ▸ {REGISTER_INFO[stableRegister].jp}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function CentsGauge({ cents }: { cents: number | null }) {
  const dotLeft = cents !== null ? Math.max(5, Math.min(95, 50 + (cents / 100) * 40)) : 50
  return (
    <div className="lp-gauge-wrap">
      <span className="lp-gauge-lbl">低</span>
      <div className="lp-gauge">
        <div className="lp-gauge-zone" />
        <div className="lp-gauge-center" />
        <div className="lp-gauge-dot" style={{ left: `${dotLeft}%` }} />
      </div>
      <span className="lp-gauge-lbl">高</span>
      <span className="lp-cents-val">
        {cents !== null ? `${cents > 0 ? '+' : ''}${Math.round(cents)}¢` : '--'}
      </span>
    </div>
  )
}

function PracticePanel({
  practiceStep,
  practiceNote,
  practiceNoteIdx,
  targetRegister,
  stableRegister,
  cents,
  practiceResults,
  onStop,
}: {
  practiceStep: string
  practiceNote: number
  practiceNoteIdx: number
  targetRegister: 'chest' | 'mix' | 'falsetto'
  stableRegister: VoiceRegister
  cents: number | null
  practiceResults: PracticeResult[]
  onStop: () => void
}) {
  const info = REGISTER_INFO[targetRegister]
  const totalNotes = REGISTER_INFO[targetRegister].midiNotes.length
  const lastResult = practiceResults[practiceResults.length - 1]
  const detectedInfo = stableRegister !== 'none' ? REGISTER_INFO[stableRegister] : null

  return (
    <div className="vr-practice-panel">
      <div className="vr-practice-header">
        <span className="vr-practice-target" style={{ color: info.color }}>
          目標: {info.jp}
        </span>
        <span className="vr-practice-progress">{practiceNoteIdx + 1} / {totalNotes}</span>
        <button className="vr-btn vr-stop-practice" onClick={onStop}>中断</button>
      </div>

      {practiceStep === 'beep' && (
        <div className="vr-practice-step">
          <div className="vr-practice-note" style={{ color: info.color }}>{midiName(practiceNote)}</div>
          <div className="vr-step-msg vr-muted">♪ 音を聴いてください...</div>
        </div>
      )}

      {practiceStep === 'sing' && (
        <div className="vr-practice-step">
          <div className="vr-practice-note" style={{ color: info.color }}>{midiName(practiceNote)}</div>
          <div className="vr-step-msg">{info.jp}で歌ってください</div>
          <CentsGauge cents={cents} />
          {detectedInfo ? (
            <div className="vr-detected-badge" style={{ color: detectedInfo.color }}>
              {stableRegister === targetRegister ? '✓ ' : '→ '}
              {detectedInfo.jp}
            </div>
          ) : (
            <div className="vr-no-voice">声を出してください...</div>
          )}
        </div>
      )}

      {practiceStep === 'result' && lastResult && (
        <div className={`vr-practice-step vr-result-step ${lastResult.hit ? 'vr-hit' : 'vr-miss'}`}>
          <div className="vr-result-icon">{lastResult.hit ? '○' : '×'}</div>
          <div className="vr-result-label">
            {lastResult.hit
              ? `${info.jp}で歌えました!`
              : lastResult.detectedRegister === 'none'
                ? '声が検出されませんでした'
                : `${regInfo(lastResult.detectedRegister)?.jp ?? ''}になっていました`}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultSummary({
  results,
  targetRegister,
  onRetry,
}: {
  results: PracticeResult[]
  targetRegister: 'chest' | 'mix' | 'falsetto'
  onRetry: () => void
}) {
  const hits = results.filter(r => r.hit).length
  const pct = Math.round((hits / (results.length || 1)) * 100)
  const info = REGISTER_INFO[targetRegister]
  const scoreColor = pct >= 70 ? '#4ade80' : pct >= 40 ? '#facc15' : '#f87171'

  return (
    <div className="vr-results">
      <div className="vr-results-header">練習結果 — {info.jp}</div>
      <div className="vr-score-big" style={{ color: scoreColor }}>
        {hits} / {results.length}
        <span className="vr-score-pct"> ({pct}%)</span>
      </div>
      <div className="vr-result-rows">
        {results.map((r, i) => {
          const dInfo = regInfo(r.detectedRegister)
          return (
            <div key={i} className="vr-result-row">
              <span className="vr-rr-note">{midiName(r.note)}</span>
              <span className="vr-rr-target" style={{ color: info.color }}>{info.jp}</span>
              <span className="vr-rr-arrow">→</span>
              <span className="vr-rr-detected" style={{ color: dInfo?.color ?? '#6b7280' }}>
                {dInfo?.jp ?? '声なし'}
              </span>
              <span className={r.hit ? 'vr-rr-hit' : 'vr-rr-miss'}>{r.hit ? '○' : '×'}</span>
            </div>
          )
        })}
      </div>
      <button className="vr-btn vr-retry-btn" onClick={onRetry}>もう一度</button>
    </div>
  )
}

export function VoiceRegisterTrainer() {
  const { state, start, stop, startPractice, stopPractice } = useVoiceRegisterTrainer()
  const [mode, setMode] = useState<'free' | 'practice'>('free')
  const [selectedTarget, setSelectedTarget] = useState<'chest' | 'mix' | 'falsetto'>('chest')
  const [showResults, setShowResults] = useState(false)
  const [savedResults, setSavedResults] = useState<PracticeResult[]>([])
  const [savedTarget, setSavedTarget] = useState<'chest' | 'mix' | 'falsetto'>('chest')

  const isPracticing = state.practiceStep !== 'idle'

  // Show results when practice loop completes
  useEffect(() => {
    if (state.practiceStep === 'idle' && state.practiceResults.length > 0) {
      setSavedResults([...state.practiceResults])
      setSavedTarget(state.targetRegister)
      setShowResults(true)
    }
  }, [state.practiceStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartPractice = () => {
    setShowResults(false)
    startPractice(selectedTarget)
  }

  const handleRetry = () => {
    setShowResults(false)
  }

  const stableInfo = state.stableRegister !== 'none' ? REGISTER_INFO[state.stableRegister] : null

  return (
    <div className="vr-trainer">
      {/* Register Meter — always visible */}
      <RegisterMeter
        stableRegister={state.stableRegister}
        harmonicRichness={state.harmonicRichness}
        freq={state.freq}
        active={state.active}
      />

      {/* Mode toggle */}
      <div className="vr-mode-tabs">
        <button
          className={`vr-mode-btn ${mode === 'free' ? 'active' : ''}`}
          onClick={() => { setMode('free'); setShowResults(false) }}
        >フリー</button>
        <button
          className={`vr-mode-btn ${mode === 'practice' ? 'active' : ''}`}
          onClick={() => { setMode('practice'); setShowResults(false) }}
        >練習</button>
      </div>

      {/* Mic controls */}
      <div className="vr-controls">
        {!state.active ? (
          <button className="vr-btn vr-start" onClick={start}>🎤 マイク開始</button>
        ) : (
          <button className="vr-btn vr-stop" onClick={stop}>⏹ 停止</button>
        )}
      </div>

      {state.error && <div className="vr-error">⚠ {state.error}</div>}

      {/* Free mode */}
      {mode === 'free' && (
        <>
          {state.active ? (
            <div className="vr-guide" style={{ borderLeftColor: stableInfo?.color ?? 'var(--border)' }}>
              {stableInfo ? (
                <>
                  <div className="vr-guide-name" style={{ color: stableInfo.color }}>
                    {stableInfo.jp} — {stableInfo.en}
                  </div>
                  <div className="vr-guide-desc">{stableInfo.desc}</div>
                  <div className="vr-guide-tips">💡 {stableInfo.tips}</div>
                </>
              ) : (
                <div className="vr-guide-desc vr-muted">歌い始めると声区を自動判定します</div>
              )}
            </div>
          ) : (
            <div className="vr-free-guides">
              {REGISTERS.map(reg => {
                const info = REGISTER_INFO[reg]
                return (
                  <div key={reg} className="vr-guide" style={{ borderLeftColor: info.color }}>
                    <div className="vr-guide-name" style={{ color: info.color }}>
                      {info.jp} — {info.en}
                    </div>
                    <div className="vr-guide-desc">{info.desc}</div>
                    <div className="vr-guide-tips">💡 {info.tips}</div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Practice mode */}
      {mode === 'practice' && !isPracticing && !showResults && (
        <>
          <div className="vr-target-select">
            {REGISTERS.map(reg => {
              const info = REGISTER_INFO[reg]
              const isSel = selectedTarget === reg
              return (
                <button
                  key={reg}
                  className={`vr-target-btn ${isSel ? 'selected' : ''}`}
                  style={isSel ? { borderColor: info.color, color: info.color } : {}}
                  onClick={() => setSelectedTarget(reg)}
                >
                  <span className="vr-target-jp">{info.jp}</span>
                  <span className="vr-target-en">{info.en}</span>
                </button>
              )
            })}
          </div>
          <div className="vr-guide" style={{ borderLeftColor: REGISTER_INFO[selectedTarget].color }}>
            <div className="vr-guide-name" style={{ color: REGISTER_INFO[selectedTarget].color }}>
              {REGISTER_INFO[selectedTarget].jp}の練習
            </div>
            <div className="vr-guide-desc">{REGISTER_INFO[selectedTarget].desc}</div>
            <div className="vr-guide-tips">💡 {REGISTER_INFO[selectedTarget].tips}</div>
          </div>
          {state.active ? (
            <button
              className="vr-btn vr-start-practice"
              style={{ borderColor: REGISTER_INFO[selectedTarget].color }}
              onClick={handleStartPractice}
            >
              練習開始 — {REGISTER_INFO[selectedTarget].jp}
            </button>
          ) : (
            <div className="vr-muted vr-start-hint">マイクを開始してから練習を始めてください</div>
          )}
        </>
      )}

      {mode === 'practice' && isPracticing && (
        <PracticePanel
          practiceStep={state.practiceStep}
          practiceNote={state.practiceNote}
          practiceNoteIdx={state.practiceNoteIdx}
          targetRegister={state.targetRegister}
          stableRegister={state.stableRegister}
          cents={state.cents}
          practiceResults={state.practiceResults}
          onStop={stopPractice}
        />
      )}

      {mode === 'practice' && showResults && !isPracticing && (
        <ResultSummary
          results={savedResults}
          targetRegister={savedTarget}
          onRetry={handleRetry}
        />
      )}
    </div>
  )
}

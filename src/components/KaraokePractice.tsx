import { useState, useMemo, useRef, useEffect } from 'react'
import {
  useKaraoke,
  buildSequence,
  KaraokeNote,
  NoteScore,
  KaraokePhase,
} from '../hooks/useKaraoke'
import { NOTE_NAMES_EN, midiToFrequency } from '../utils/musicTheory'
import { gradeOf } from '../utils/scoring'

// ─── Settings ────────────────────────────────────────────────────────────────

const SEQUENCE_OPTIONS = [
  { id: 'up',     label: 'ドレミファソラシド ↑',  direction: 'up'     as const, scaleKey: 'major' },
  { id: 'down',   label: 'ドシラソファミレド ↓',  direction: 'down'   as const, scaleKey: 'major' },
  { id: 'updown', label: '上行・下行',             direction: 'updown' as const, scaleKey: 'major' },
  { id: 'penta',  label: '五音音階 ↑',            direction: 'up'     as const, scaleKey: 'pentatonicMajor' },
  { id: 'minor',  label: '自然短調 ↑',            direction: 'up'     as const, scaleKey: 'naturalMinor' },
]

const TEMPO_OPTIONS = [
  { id: 'slow',   label: 'ゆっくり', ms: 3000 },
  { id: 'normal', label: '普通',     ms: 2200 },
  { id: 'fast',   label: '速い',     ms: 1600 },
]

const KEY_ROOTS = NOTE_NAMES_EN.map((n, i) => ({ label: n, value: i }))

// ─── Grade colours ───────────────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  S: '#fbbf24', A: '#4ade80', B: '#00e5ff', C: '#facc15', D: '#f97316', F: '#f87171',
}
const GRADE_BG: Record<string, string> = {
  S: 'rgba(251,191,36,.15)', A: 'rgba(74,222,128,.15)', B: 'rgba(0,229,255,.1)',
  C: 'rgba(250,204,21,.1)',  D: 'rgba(249,115,22,.1)',  F: 'rgba(248,113,113,.1)',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function NoteRoll({
  notes,
  currentIdx,
  scores,
  phase,
}: {
  notes: KaraokeNote[]
  currentIdx: number
  scores: NoteScore[]
  phase: KaraokePhase
}) {
  return (
    <div className="note-roll-wrap">
      {currentIdx >= 0 && notes.length > 0 && (
        <div className="kp-progress">{currentIdx + 1} / {notes.length}</div>
      )}
      <div className="note-roll">
        {notes.map((n, i) => {
          const score  = scores[i]
          const isDone = !!score
          const isCurr = i === currentIdx && (phase === 'beep' || phase === 'sing')
          const grade  = score?.grade

          return (
            <div
              key={i}
              className={`nr-note ${isCurr ? 'current' : ''} ${isDone ? 'done' : ''}`}
              style={isDone ? {
                background: GRADE_BG[grade!],
                borderColor: GRADE_COLOR[grade!],
              } : {}}
            >
              {isDone && (
                <div className="nr-grade" style={{ color: GRADE_COLOR[grade!] }}>{grade}</div>
              )}
              {isCurr && <div className="nr-arrow">▼</div>}
              <div className="nr-solfege">{n.solfege}</div>
              <div className="nr-name">{n.noteName}{n.octave}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LivePanel({
  note,
  phase,
  liveCents,
  liveAccuracy,
  liveResonance,
  liveDetected,
}: {
  note: KaraokeNote
  phase: KaraokePhase
  liveCents: number
  liveAccuracy: number
  liveResonance: number
  liveDetected: boolean
}) {
  const targetFreq = midiToFrequency(note.midiNumber)
  const clampedCents = Math.max(-100, Math.min(100, liveCents))
  const pct   = 50 + (clampedCents / 100) * 48
  const inTune = Math.abs(liveCents) <= 20
  const dotColor = !liveDetected ? '#475569'
    : inTune ? '#4ade80'
    : Math.abs(liveCents) <= 50 ? '#facc15' : '#f87171'

  return (
    <div className="live-panel">
      {/* Target note */}
      <div className="lp-target">
        <span className="lp-target-solfege">{note.solfege}</span>
        <div className="lp-target-detail">
          <span>{note.noteName}{note.octave}</span>
          <span className="lp-freq">{targetFreq.toFixed(1)} Hz</span>
        </div>
      </div>

      {phase === 'beep' && (
        <div className="lp-beep-msg">♩ この音を聴いてください…</div>
      )}

      {phase === 'sing' && (
        <>
          {!liveDetected && (
            <div className="lp-no-voice-warn">⚠ 声が検出されていません 🎤</div>
          )}
          {/* Deviation gauge */}
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
            {!liveDetected ? '---'
              : inTune ? '✓ ピッタリ！'
              : `${liveCents > 0 ? '+' : ''}${liveCents}¢`}
          </div>

          {/* Score bars */}
          <div className="lp-bars">
            <div className="lp-bar-row">
              <span className="lp-bar-label">音程精度</span>
              <div className="lp-bar-track">
                <div className="lp-bar-fill" style={{ width: `${liveAccuracy}%`, background: dotColor }} />
              </div>
              <span className="lp-bar-val">{liveAccuracy}</span>
            </div>
            <div className="lp-bar-row">
              <span className="lp-bar-label">響き</span>
              <div className="lp-bar-track">
                <div className="lp-bar-fill" style={{
                  width: `${liveResonance}%`,
                  background: liveResonance > 70 ? '#a855f7' : '#6366f1'
                }} />
              </div>
              <span className="lp-bar-val">{liveResonance}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ResultsPanel({ scores, totalScore }: { scores: NoteScore[]; totalScore: number }) {
  const avgPitch = Math.round(scores.reduce((s, n) => s + n.pitchAccuracy, 0) / (scores.length || 1))
  const avgRes   = Math.round(scores.reduce((s, n) => s + n.resonance,     0) / (scores.length || 1))
  const stars    = totalScore >= 95 ? 5 : totalScore >= 80 ? 4 : totalScore >= 65 ? 3 : totalScore >= 45 ? 2 : 1
  const color    = GRADE_COLOR[scores.length > 0
    ? scores.reduce((best, s) => s.totalScore > best.totalScore ? s : best).grade
    : 'C']

  return (
    <div className="results-panel">
      <div className="rp-header">
        <div className="rp-score" style={{ color }}>
          {totalScore}
          <span className="rp-score-unit">点</span>
        </div>
        <div className="rp-stars">
          {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
        </div>
        <div className="rp-overall-grade" style={{ color, background: GRADE_BG[gradeOf(totalScore)], borderColor: color }}>
          {gradeOf(totalScore)}
        </div>
      </div>

      <div className="rp-summary">
        <div className="rp-summary-row">
          <span>音程精度</span>
          <div className="rp-sum-bar">
            <div style={{ width: `${avgPitch}%`, background: '#4ade80' }} />
          </div>
          <span>{avgPitch}%</span>
        </div>
        <div className="rp-summary-row">
          <span>響きの美しさ</span>
          <div className="rp-sum-bar">
            <div style={{ width: `${avgRes}%`, background: '#a855f7' }} />
          </div>
          <span>{avgRes}%</span>
        </div>
      </div>

      <div className="rp-note-breakdown">
        {scores.map((s, i) => (
          <div key={i} className="rp-note-row">
            <span className="rpn-solfege">{s.note.solfege}</span>
            <span className="rpn-name">{s.note.noteName}{s.note.octave}</span>
            <div className="rpn-bar-wrap">
              <div
                className="rpn-bar"
                style={{ width: `${s.totalScore}%`, background: GRADE_COLOR[s.grade] }}
              />
            </div>
            <span className="rpn-cents">{s.centsAvg < 999 ? `±${s.centsAvg}¢` : '---'}</span>
            <span className="rpn-grade" style={{ color: GRADE_COLOR[s.grade] }}>{s.grade}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KaraokePractice({ suggestedRoot }: { suggestedRoot?: number }) {
  const { state, start, stop } = useKaraoke()

  const [seqId,     setSeqId]     = useState('up')
  const [rootNote,  setRootNote]  = useState(0)   // C
  const [octave,    setOctave]    = useState(4)
  const [tempoId,   setTempoId]   = useState('normal')
  const [singFlash, setSingFlash] = useState(false)

  const seqOpt   = SEQUENCE_OPTIONS.find(s => s.id === seqId)!
  const tempoOpt = TEMPO_OPTIONS.find(t => t.id === tempoId)!

  const notes = useMemo(() =>
    buildSequence(seqOpt.scaleKey, rootNote, octave, seqOpt.direction),
    [seqOpt, rootNote, octave]
  )

  const handleStart = () => start(notes, tempoOpt.ms)

  const { phase, countdown, currentNoteIdx, noteScores, totalScore,
          liveAccuracy, liveResonance, liveCents, liveDetected, error } = state

  const isRunning = phase !== 'idle' && phase !== 'complete'
  const currentNote = notes[currentNoteIdx]

  const prevPhaseRef = useRef<KaraokePhase | null>(null)
  useEffect(() => {
    if (prevPhaseRef.current === 'beep' && phase === 'sing') {
      setSingFlash(true)
      const t = setTimeout(() => setSingFlash(false), 600)
      return () => clearTimeout(t)
    }
    prevPhaseRef.current = phase
  }, [phase])

  return (
    <div className="karaoke-practice">

      {/* Settings row */}
      <div className="kp-settings">
        <label className="kp-setting">
          <span>スケール</span>
          <select value={seqId} onChange={e => setSeqId(e.target.value)} disabled={isRunning}>
            {SEQUENCE_OPTIONS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        <label className="kp-setting">
          <span>キー</span>
          <select value={rootNote} onChange={e => setRootNote(Number(e.target.value))} disabled={isRunning}>
            {KEY_ROOTS.map(k => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        {suggestedRoot !== undefined && suggestedRoot !== rootNote && !isRunning && (
          <button className="kp-suggested-hint" onClick={() => setRootNote(suggestedRoot)}>
            検出キー: {NOTE_NAMES_EN[suggestedRoot]} — 適用する
          </button>
        )}

        <label className="kp-setting">
          <span>オクターブ</span>
          <select value={octave} onChange={e => setOctave(Number(e.target.value))} disabled={isRunning}>
            {[3, 4, 5].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>

        <label className="kp-setting">
          <span>テンポ</span>
          <select value={tempoId} onChange={e => setTempoId(e.target.value)} disabled={isRunning}>
            {TEMPO_OPTIONS.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>

        {!isRunning && phase !== 'complete' && (
          <button className="kp-start-btn" onClick={handleStart}>▶ 開始</button>
        )}
        {isRunning && (
          <button className="kp-stop-btn" onClick={stop}>■ 停止</button>
        )}
        {phase === 'complete' && (
          <button className="kp-start-btn retry" onClick={handleStart}>↺ もう一度</button>
        )}
      </div>

      {error && <div className="kp-error">⚠ {error}</div>}

      {/* Countdown overlay */}
      {phase === 'countdown' && (
        <div className="kp-countdown">
          <div className="kp-countdown-num">{countdown}</div>
        </div>
      )}

      {/* Note roll — always visible once started */}
      {phase !== 'idle' && (
        <NoteRoll
          notes={notes}
          currentIdx={currentNoteIdx}
          scores={noteScores}
          phase={phase}
        />
      )}

      {/* Idle: preview of notes */}
      {phase === 'idle' && (
        <div className="kp-preview">
          <div className="kp-preview-label">練習する音階</div>
          <NoteRoll notes={notes} currentIdx={-1} scores={[]} phase="idle" />
          <div className="kp-instructions">
            <p>① ▶ 開始 で録音を開始します</p>
            <p>② ♩ が鳴ったら、その音を口で歌ってください</p>
            <p>③ 音程の正確さと響きの美しさを採点します</p>
            <p>✱ イヤフォン使用を推奨します</p>
          </div>
        </div>
      )}

      {singFlash && (
        <div className="kp-sing-flash">↑ 歌って！</div>
      )}

      {/* Live panel */}
      {(phase === 'beep' || phase === 'sing') && currentNote && (
        <LivePanel
          note={currentNote}
          phase={phase}
          liveCents={liveCents}
          liveAccuracy={liveAccuracy}
          liveResonance={liveResonance}
          liveDetected={liveDetected}
        />
      )}

      {/* Results */}
      {phase === 'complete' && noteScores.length > 0 && (
        <ResultsPanel scores={noteScores} totalScore={totalScore} />
      )}
    </div>
  )
}

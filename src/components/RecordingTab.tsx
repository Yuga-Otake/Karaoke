import { useState, useRef, useEffect } from 'react'
import { useRecorder, Recording } from '../hooks/useRecorder'
import { PitchTimeline } from './PitchTimeline'
import { NoteHistogram } from './NoteHistogram'
import { NOTE_NAMES_EN, NOTE_NAMES_JP } from '../utils/musicTheory'

interface Props {
  recordings: Recording[]
  onAddRecording: (rec: Recording) => void
  onDeleteRecording: (id: string) => void
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function analyzeRecording(rec: Recording) {
  const pitched = rec.samples.filter(s => s.noteInfo !== null)
  if (pitched.length === 0) return null

  const counts = new Array(12).fill(0)
  for (const s of pitched) counts[s.noteInfo!.noteIndex]++
  const mostCommonIdx = counts.indexOf(Math.max(...counts))

  const midis       = pitched.map(s => s.noteInfo!.midiNumber)
  const highestMidi = Math.max(...midis)
  const lowestMidi  = Math.min(...midis)

  const avgDeviation = pitched.reduce((sum, s) => sum + Math.abs(s.noteInfo!.cents), 0) / pitched.length
  const stability    = Math.max(0, Math.round(100 - (avgDeviation / 50) * 100))

  return {
    mostCommonIdx,
    highestMidi,
    lowestMidi,
    rangeInSemitones: highestMidi - lowestMidi,
    stability,
    pitchedRatio: Math.round((pitched.length / rec.samples.length) * 100),
  }
}

export function RecordingTab({ recordings, onAddRecording, onDeleteRecording }: Props) {
  const { state, startRecording, stopRecording } = useRecorder(onAddRecording)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isPlaying, setIsPlaying]       = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Auto-select newest recording
  useEffect(() => {
    if (recordings.length > 0 && !selectedId) {
      setSelectedId(recordings[0].id)
    }
  }, [recordings])

  const selected = recordings.find(r => r.id === selectedId) ?? null
  const stats    = selected ? analyzeRecording(selected) : null

  const playRecording = (rec: Recording) => {
    audioRef.current?.pause()
    const audio = new Audio(rec.url)
    audioRef.current = audio
    setPlaybackTime(0)
    setIsPlaying(true)
    audio.ontimeupdate = () => setPlaybackTime(audio.currentTime)
    audio.onended      = () => { setPlaybackTime(0); setIsPlaying(false) }
    audio.play()
  }

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio || !selected) return
    if (isPlaying) { audio.pause(); setIsPlaying(false) }
    else           { audio.play();  setIsPlaying(true)  }
  }

  const elapsedSec = state.elapsed / 1000

  return (
    <div className="recording-tab">

      {/* ── Controls ───────────────────────────────────── */}
      <div className="rec-controls">
        {state.isRecording ? (
          <>
            <button className="rec-btn stop" onClick={stopRecording}>■ 停止</button>
            <div className="rec-live-indicator">
              <span className="rec-dot" />
              REC&nbsp; {fmt(elapsedSec)}
            </div>
          </>
        ) : (
          <button className="rec-btn start" onClick={startRecording}>● 録音開始</button>
        )}
        {state.error && <span className="rec-error">⚠ {state.error}</span>}
      </div>

      {/* ── Recording list ─────────────────────────────── */}
      {recordings.length > 0 && (
        <div className="rec-list">
          {recordings.map((rec, i) => {
            const rStats = analyzeRecording(rec)
            return (
              <div
                key={rec.id}
                className={`rec-item ${selectedId === rec.id ? 'selected' : ''}`}
                onClick={() => { setSelectedId(rec.id); setPlaybackTime(0); setIsPlaying(false) }}
              >
                <span className="ri-num">#{recordings.length - i}</span>
                {rec.source === 'expression' && (
                  <span className="ri-source-badge">🎵</span>
                )}
                <span className="ri-dur">{fmt(rec.duration)}</span>
                {rStats && (
                  <span className="ri-info">
                    {NOTE_NAMES_EN[rStats.mostCommonIdx]}&nbsp;多
                    &nbsp;|&nbsp;安定 {rStats.stability}%
                  </span>
                )}
                <button
                  className="ri-play"
                  title="再生"
                  onClick={e => { e.stopPropagation(); setSelectedId(rec.id); playRecording(rec) }}
                >▶</button>
                <button
                  className="ri-del"
                  title="削除"
                  onClick={e => {
                    e.stopPropagation()
                    if (selectedId === rec.id) setSelectedId(null)
                    onDeleteRecording(rec.id)
                  }}
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Analysis ───────────────────────────────────── */}
      {selected && (
        <div className="rec-analysis">
          <div className="rec-playback-bar">
            <button className="rpb-btn" onClick={() => playRecording(selected)}>▶ 再生</button>
            {audioRef.current && (
              <button className="rpb-btn" onClick={togglePlayback}>
                {isPlaying ? '⏸' : '▶'}
              </button>
            )}
            <div className="rpb-time">
              {fmt(playbackTime)} / {fmt(selected.duration)}
            </div>
            <a
              className="rpb-btn download"
              href={selected.url}
              download={`recording-${selected.id}.webm`}
            >⬇ 保存</a>
          </div>

          <div className="ra-section">
            <div className="ra-title">ピッチタイムライン Pitch Timeline</div>
            <PitchTimeline
              samples={selected.samples}
              duration={selected.duration}
              playbackTime={playbackTime}
            />
          </div>

          <div className="ra-row">
            <div className="ra-col">
              <div className="ra-title">音符分布 Note Distribution</div>
              <NoteHistogram samples={selected.samples} />
            </div>
            {stats && (
              <div className="ra-col ra-stats-col">
                <div className="ra-title">統計 Statistics</div>
                <div className="rec-stats">
                  {[
                    ['最多音', `${NOTE_NAMES_EN[stats.mostCommonIdx]} / ${NOTE_NAMES_JP[stats.mostCommonIdx]}`, 'var(--cyan)'],
                    ['最高音', `${NOTE_NAMES_EN[(stats.highestMidi % 12 + 12) % 12]}${Math.floor(stats.highestMidi / 12) - 1}`, ''],
                    ['最低音', `${NOTE_NAMES_EN[(stats.lowestMidi  % 12 + 12) % 12]}${Math.floor(stats.lowestMidi  / 12) - 1}`, ''],
                    ['音域', `${stats.rangeInSemitones} 半音`, ''],
                    ['音程安定度', `${stats.stability}%`,
                      stats.stability > 70 ? 'var(--green)' : stats.stability > 40 ? 'var(--yellow)' : 'var(--red)'],
                    ['有音割合', `${stats.pitchedRatio}%`, ''],
                  ].map(([label, val, color]) => (
                    <div key={label} className="rs-row">
                      <span className="rs-label">{label}</span>
                      <span className="rs-val" style={color ? { color: color as string } : {}}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {recordings.length === 0 && !state.isRecording && (
        <div className="rec-hint">
          <div className="rh-icon">🎙</div>
          <p>● 録音開始ボタンで録音を開始します</p>
          <p>停止後、ピッチタイムライン・音符分布・統計を分析します</p>
          <p className="rec-hint-sub">🎵 表現タブの録音もここに保存できます</p>
        </div>
      )}
    </div>
  )
}

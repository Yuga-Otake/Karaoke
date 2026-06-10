import { useState, useRef, useCallback } from 'react'
import { NoteInfo, INTERVALS, NOTE_NAMES_EN, NOTE_NAMES_JP, midiToFrequency, getInterval } from '../utils/musicTheory'
import { PianoKeyboard } from './PianoKeyboard'

interface Props {
  currentNote: NoteInfo | null
}

function playTone(ctx: AudioContext, frequency: number, duration = 1.2) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()

  osc.type = 'sine'
  osc2.type = 'sine'
  osc.frequency.value = frequency
  osc2.frequency.value = frequency * 2  // add octave harmonic for warmth

  gain.gain.setValueAtTime(0.35, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  gain2.gain.setValueAtTime(0.12, ctx.currentTime)
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

  osc.connect(gain); gain.connect(ctx.destination)
  osc2.connect(gain2); gain2.connect(ctx.destination)
  osc.start(); osc2.start()
  osc.stop(ctx.currentTime + duration)
  osc2.stop(ctx.currentTime + duration)
}

export function IntervalTrainer({ currentNote }: Props) {
  const [referenceMidi, setReferenceMidi] = useState<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  const handleNoteClick = useCallback((noteIdx: number, octave: number) => {
    const midi = (octave + 1) * 12 + noteIdx
    const ctx = getCtx()
    playTone(ctx, midiToFrequency(midi))
    setReferenceMidi(midi)
  }, [getCtx])

  const replayReference = useCallback(() => {
    if (referenceMidi === null) return
    const ctx = getCtx()
    playTone(ctx, midiToFrequency(referenceMidi))
  }, [referenceMidi, getCtx])

  // Interval between reference and current note
  const intervalInfo = (() => {
    if (referenceMidi === null || !currentNote) return null
    const semitones = currentNote.midiNumber - referenceMidi
    const absSemitones = Math.abs(semitones)
    const info = getInterval(absSemitones)
    return { info, semitones, absSemitones, direction: semitones >= 0 ? '↑' : '↓' }
  })()

  const refNoteIndex = referenceMidi !== null ? ((referenceMidi % 12) + 12) % 12 : null
  const refOctave = referenceMidi !== null ? Math.floor(referenceMidi / 12) - 1 : 3

  const consonanceColor = {
    perfect: '#4ade80',
    consonant: '#00e5ff',
    dissonant: '#f87171',
  }

  // Common intervals for quick reference
  const quickIntervals = INTERVALS.filter(i => i.semitones >= 0 && i.semitones <= 12)

  return (
    <div className="interval-trainer">
      {/* Keyboard for selecting reference */}
      <div className="it-section">
        <div className="it-label">基準音を選択 (クリックで再生)</div>
        <PianoKeyboard
          activeNoteIndex={refNoteIndex}
          recentNoteIndices={[]}
          startOctave={3}
          numOctaves={2}
          onNoteClick={handleNoteClick}
        />
        {referenceMidi !== null && (
          <div className="ref-note-row">
            <span>基準音: </span>
            <strong style={{ color: '#00e5ff' }}>
              {NOTE_NAMES_EN[refNoteIndex!]}{refOctave} / {NOTE_NAMES_JP[refNoteIndex!]}
            </strong>
            <span> ({midiToFrequency(referenceMidi).toFixed(1)} Hz)</span>
            <button className="replay-btn" onClick={replayReference}>▶ 再生</button>
          </div>
        )}
      </div>

      {/* Interval result */}
      {intervalInfo ? (
        <div className="interval-result" style={{
          borderColor: consonanceColor[intervalInfo.info.consonance],
          boxShadow: `0 0 20px ${consonanceColor[intervalInfo.info.consonance]}22`,
        }}>
          <div className="ir-direction" style={{ color: intervalInfo.direction === '↑' ? '#4ade80' : '#f87171' }}>
            {intervalInfo.direction}
          </div>
          <div className="ir-semitones">{intervalInfo.absSemitones} 半音</div>
          <div className="ir-name-en">{intervalInfo.info.name}</div>
          <div className="ir-name-jp" style={{ color: consonanceColor[intervalInfo.info.consonance] }}>
            {intervalInfo.info.nameJP}
          </div>
          <div className="ir-abbr">{intervalInfo.info.abbreviation}</div>
          <div className="ir-consonance" style={{ color: consonanceColor[intervalInfo.info.consonance] }}>
            {intervalInfo.info.consonance === 'perfect' ? '完全協和音' :
             intervalInfo.info.consonance === 'consonant' ? '協和音' : '不協和音'}
          </div>
          <div className="ir-notes">
            {referenceMidi !== null && (
              <span className="ir-note ref">
                {NOTE_NAMES_EN[((referenceMidi % 12) + 12) % 12]}{Math.floor(referenceMidi / 12) - 1}
              </span>
            )}
            <span className="ir-arrow">→</span>
            <span className="ir-note current">{currentNote?.note}{currentNote?.octave}</span>
          </div>
        </div>
      ) : (
        <div className="it-hint">
          {referenceMidi === null
            ? '① 上の鍵盤で基準音を選んでください'
            : '② マイクで音を出してください'}
        </div>
      )}

      {/* Interval reference table */}
      <div className="it-section">
        <div className="it-label">音程一覧</div>
        <div className="interval-table">
          {quickIntervals.map(iv => (
            <div
              key={iv.semitones}
              className={`interval-row ${(intervalInfo?.absSemitones ?? -1) % 12 === iv.semitones % 12 ? 'active' : ''}`}
            >
              <span className="iv-abbr">{iv.abbreviation}</span>
              <span className="iv-semi">{iv.semitones}半音</span>
              <span className="iv-en">{iv.name}</span>
              <span className="iv-jp" style={{ color: consonanceColor[iv.consonance] }}>{iv.nameJP}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { NoteInfo, SCALES, NOTE_NAMES_EN, matchScales, getScaleDegreeLabel } from '../utils/musicTheory'
import { PianoKeyboard } from './PianoKeyboard'

interface Props {
  noteInfo: NoteInfo | null
  recentNoteIndices: number[]
}

export function ScaleAnalyzer({ noteInfo, recentNoteIndices }: Props) {
  const matches = matchScales(recentNoteIndices)
  const topMatch = matches[0] ?? null

  const scaleNoteIndices = topMatch
    ? SCALES[topMatch.scaleKey].intervals.map(i => ((topMatch.root + i) % 12))
    : []

  const currentDegree = noteInfo && topMatch
    ? getScaleDegreeLabel(noteInfo.noteIndex, topMatch.root, topMatch.scaleKey)
    : null

  return (
    <div className="scale-analyzer">
      {/* Piano keyboard */}
      <PianoKeyboard
        activeNoteIndex={noteInfo?.noteIndex ?? null}
        recentNoteIndices={recentNoteIndices}
        scaleNoteIndices={scaleNoteIndices}
      />

      {/* Current note info */}
      {noteInfo && (
        <div className="note-info-row">
          <div className="ni-item">
            <span className="ni-label">音名</span>
            <span className="ni-val">{noteInfo.note}{noteInfo.octave}</span>
          </div>
          <div className="ni-item">
            <span className="ni-label">日本語</span>
            <span className="ni-val accent-cyan">{noteInfo.noteJP}</span>
          </div>
          <div className="ni-item">
            <span className="ni-label">周波数</span>
            <span className="ni-val">{noteInfo.frequency.toFixed(1)} Hz</span>
          </div>
          <div className="ni-item">
            <span className="ni-label">MIDI</span>
            <span className="ni-val">{noteInfo.midiNumber}</span>
          </div>
          {currentDegree && (
            <div className="ni-item">
              <span className="ni-label">階名</span>
              <span className="ni-val accent-purple">{currentDegree}</span>
            </div>
          )}
        </div>
      )}

      {/* Scale matches */}
      {matches.length > 0 && (
        <div className="scale-matches">
          <div className="scale-match-title">推定スケール (直近の音から)</div>
          <div className="scale-match-list">
            {matches.map((m, i) => {
              const scale = SCALES[m.scaleKey]
              const noteIndices = scale.intervals.map(iv => ((m.root + iv) % 12))
              return (
                <div key={i} className={`scale-match-item ${i === 0 ? 'top' : ''}`}>
                  <div className="sm-name">
                    <span className="sm-label">{m.label}</span>
                    <span className="sm-name-jp">{scale.nameJP}</span>
                  </div>
                  <div className="sm-notes">
                    {noteIndices.map(ni => (
                      <span key={ni} className="sm-note">{NOTE_NAMES_EN[ni]}</span>
                    ))}
                  </div>
                  <div className="sm-solfege">
                    {scale.degrees.map((d, di) => (
                      <span key={di} className="sm-degree">{d}</span>
                    ))}
                  </div>
                  <div className="sm-score-bar">
                    <div
                      className="sm-score-fill"
                      style={{ width: `${m.score * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {recentNoteIndices.length === 0 && (
        <div className="scale-hint">音を出すとスケール（音階）を推定します。<br />ピアノで複数の音を弾くと精度が上がります。</div>
      )}
    </div>
  )
}

import { PitchSample } from '../hooks/useRecorder'
import { NOTE_NAMES_EN, NOTE_NAMES_JP, NOTE_COLORS } from '../utils/musicTheory'

interface Props {
  samples: PitchSample[]
}

export function NoteHistogram({ samples }: Props) {
  const counts = new Array(12).fill(0)
  let total = 0
  for (const s of samples) {
    if (s.noteInfo !== null) {
      counts[s.noteInfo.noteIndex]++
      total++
    }
  }

  const max = Math.max(...counts, 1)

  return (
    <div className="note-histogram">
      {counts.map((count, i) => {
        const barH   = (count / max) * 100
        const pct    = total > 0 ? Math.round((count / total) * 100) : 0
        const color  = NOTE_COLORS[i]
        const isMost = count === max && count > 0
        return (
          <div key={i} className={`nh-col ${isMost ? 'most' : ''}`}>
            {isMost && <div className="nh-crown">★</div>}
            <div className="nh-bar-wrap">
              <div
                className="nh-bar"
                style={{
                  height: `${barH}%`,
                  background: color,
                  boxShadow: count > 0 ? `0 0 6px ${color}` : 'none',
                }}
              />
            </div>
            <div className="nh-note-en" style={{ color: count > 0 ? color : undefined }}>{NOTE_NAMES_EN[i]}</div>
            <div className="nh-note-jp">{NOTE_NAMES_JP[i]}</div>
            {pct > 0 && <div className="nh-pct">{pct}%</div>}
          </div>
        )
      })}
    </div>
  )
}

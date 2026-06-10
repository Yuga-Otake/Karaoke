import { NoteInfo } from '../utils/musicTheory'

interface Props {
  noteInfo: NoteInfo | null
  frequency: number | null
  volume: number
}

function CentsMeter({ cents }: { cents: number }) {
  const clamp = Math.max(-50, Math.min(50, cents))
  const pct = 50 + (clamp / 50) * 48  // keep indicator inside bounds
  const color = Math.abs(cents) <= 5 ? '#4ade80' : Math.abs(cents) <= 20 ? '#facc15' : '#f87171'
  return (
    <div className="cents-meter">
      <div className="cents-track">
        <div className="cents-zone perfect" />
        <div className="cents-center" />
        <div
          className="cents-dot"
          style={{ left: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>
      <div className="cents-labels">
        <span>-50¢</span>
        <span style={{ color }}>
          {cents > 0 ? '+' : ''}{cents}¢
        </span>
        <span>+50¢</span>
      </div>
    </div>
  )
}

function VolumeMeter({ volume }: { volume: number }) {
  const filled = Math.round(Math.min(1, volume * 25) * 12)
  return (
    <div className="volume-meter">
      {Array.from({ length: 12 }, (_, i) => {
        const on = i < filled
        const color = i < 8 ? '#4ade80' : i < 10 ? '#facc15' : '#f87171'
        return (
          <div
            key={i}
            className="vol-bar"
            style={{ background: on ? color : '#1e293b', boxShadow: on ? `0 0 4px ${color}` : 'none' }}
          />
        )
      })}
    </div>
  )
}

export function PitchDisplay({ noteInfo, frequency, volume }: Props) {
  return (
    <div className="pitch-display">
      <VolumeMeter volume={volume} />

      <div className="note-block">
        {noteInfo ? (
          <>
            <div className="note-jp">{noteInfo.noteJP}</div>
            <div className="note-en">
              {noteInfo.note}
              <sup className="note-octave">{noteInfo.octave}</sup>
            </div>
            <div className="note-freq">{frequency?.toFixed(1)} Hz</div>
          </>
        ) : (
          <div className="note-silent">---</div>
        )}
      </div>

      {noteInfo ? (
        <CentsMeter cents={noteInfo.cents} />
      ) : (
        <div className="cents-placeholder" />
      )}
    </div>
  )
}

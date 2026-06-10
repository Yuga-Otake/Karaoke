import { SCALES, NOTE_NAMES_EN, ScaleMatch } from '../utils/musicTheory'

interface Props {
  currentNoteIndex: number | null   // 0–11, or null if silent
  scaleMatch: ScaleMatch | null     // from matchScales(); null = default C major
}

export function SolfegeRuler({ currentNoteIndex, scaleMatch }: Props) {
  const root     = scaleMatch?.root     ?? 0
  const scaleKey = scaleMatch?.scaleKey ?? 'major'
  const scale    = SCALES[scaleKey]

  // Map each scale degree → { noteIndex, solfège label, note name }
  const degrees = scale.intervals.map((interval, i) => ({
    noteIndex: (root + interval) % 12,
    solfege: scale.degrees[i],
    noteName: NOTE_NAMES_EN[(root + interval) % 12],
  }))

  const activeDegreeIdx = currentNoteIndex !== null
    ? degrees.findIndex(d => d.noteIndex === currentNoteIndex)
    : -1

  // Is the current note outside the scale?
  const isChromatic = currentNoteIndex !== null && activeDegreeIdx === -1

  const keyLabel = scaleMatch
    ? `${NOTE_NAMES_EN[root]} ${scale.name} (自動検出)`
    : 'C Major (デフォルト)'

  return (
    <div className="solfege-ruler">
      <div className="sr-header">
        <span className="sr-key-label">{keyLabel}</span>
        {isChromatic && (
          <span className="sr-chromatic-badge">♯ スケール外</span>
        )}
      </div>

      <div className="sr-degrees">
        {degrees.map((deg, i) => {
          const isActive = i === activeDegreeIdx
          return (
            <div key={i} className={`sr-deg ${isActive ? 'active' : ''}`}>
              <div className="sr-solfege">{deg.solfege}</div>
              <div className="sr-notename">{deg.noteName}</div>
              {isActive && <div className="sr-glow" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

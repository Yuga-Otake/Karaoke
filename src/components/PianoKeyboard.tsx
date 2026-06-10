import { NOTE_NAMES_JP, NOTE_NAMES_EN } from '../utils/musicTheory'

interface Props {
  activeNoteIndex: number | null    // 0-11
  recentNoteIndices: number[]       // 0-11
  scaleNoteIndices?: number[]       // 0-11 — notes highlighted as scale members
  onNoteClick?: (noteIndex: number, octave: number) => void
  startOctave?: number
  numOctaves?: number
}

// White key order within an octave and their semitone index
const WHITE_KEYS = [
  { idx: 0 },  // C
  { idx: 2 },  // D
  { idx: 4 },  // E
  { idx: 5 },  // F
  { idx: 7 },  // G
  { idx: 9 },  // A
  { idx: 11 }, // B
]

// Black key semitone index and its position relative to white-key cell (0-indexed white key to its left)
const BLACK_KEYS = [
  { idx: 1,  leftWhite: 0 }, // C#
  { idx: 3,  leftWhite: 1 }, // D#
  { idx: 6,  leftWhite: 3 }, // F#
  { idx: 8,  leftWhite: 4 }, // G#
  { idx: 10, leftWhite: 5 }, // A#
]

const WW = 32 // white key width px
const BW = 20 // black key width px
const WH = 90 // white key height px
const BH = 56 // black key height px

export function PianoKeyboard({
  activeNoteIndex,
  recentNoteIndices,
  scaleNoteIndices = [],
  onNoteClick,
  startOctave = 3,
  numOctaves = 2,
}: Props) {
  const totalWhite = numOctaves * 7
  const svgWidth = totalWhite * WW + 2
  const svgHeight = WH + 20

  const keys: JSX.Element[] = []

  for (let o = 0; o < numOctaves; o++) {
    const octave = startOctave + o
    const octaveOffsetX = o * 7 * WW + 1

    // White keys (drawn first, below)
    WHITE_KEYS.forEach(({ idx }, wi) => {
      const x = octaveOffsetX + wi * WW
      const isActive = activeNoteIndex === idx
      const isRecent = recentNoteIndices.includes(idx) && !isActive
      const isScale = scaleNoteIndices.includes(idx) && !isActive && !isRecent

      let fill = '#e8eaf0'
      if (isActive) fill = '#00e5ff'
      else if (isRecent) fill = '#a5f3fc'
      else if (isScale) fill = '#c4b5fd'

      keys.push(
        <g key={`w-${o}-${idx}`} onClick={() => onNoteClick?.(idx, octave)} style={{ cursor: 'pointer' }}>
          <rect
            x={x} y={1} width={WW - 1} height={WH}
            rx={3} ry={3}
            fill={fill}
            stroke={isActive ? '#00e5ff' : '#334155'}
            strokeWidth={isActive ? 2 : 0.5}
            style={{ filter: isActive ? 'drop-shadow(0 0 6px #00e5ff)' : 'none' }}
          />
          <text
            x={x + WW / 2} y={WH - 8}
            textAnchor="middle"
            fontSize={9}
            fill={isActive ? '#0a0a1a' : '#64748b'}
            fontFamily="Noto Sans JP, sans-serif"
          >
            {NOTE_NAMES_JP[idx]}
          </text>
        </g>
      )
    })

    // Black keys (drawn on top)
    BLACK_KEYS.forEach(({ idx, leftWhite }) => {
      const x = octaveOffsetX + leftWhite * WW + (WW - BW / 2) - BW / 2 + WW * 0.5
      const isActive = activeNoteIndex === idx
      const isRecent = recentNoteIndices.includes(idx) && !isActive
      const isScale = scaleNoteIndices.includes(idx) && !isActive && !isRecent

      let fill = '#1e293b'
      if (isActive) fill = '#00e5ff'
      else if (isRecent) fill = '#0e7490'
      else if (isScale) fill = '#7c3aed'

      keys.push(
        <g key={`b-${o}-${idx}`} onClick={() => onNoteClick?.(idx, octave)} style={{ cursor: 'pointer' }}>
          <rect
            x={x} y={1} width={BW} height={BH}
            rx={2} ry={2}
            fill={fill}
            stroke={isActive ? '#00e5ff' : '#0f172a'}
            strokeWidth={isActive ? 1.5 : 0.5}
            style={{ filter: isActive ? 'drop-shadow(0 0 6px #00e5ff)' : 'none' }}
          />
          <text
            x={x + BW / 2} y={BH - 6}
            textAnchor="middle"
            fontSize={7}
            fill={isActive ? '#0a0a1a' : '#475569'}
            fontFamily="sans-serif"
          >
            {NOTE_NAMES_EN[idx]}
          </text>
        </g>
      )
    })

    // Octave label
    keys.push(
      <text
        key={`oct-${o}`}
        x={octaveOffsetX + 3}
        y={WH + 14}
        fontSize={9}
        fill="#475569"
        fontFamily="monospace"
      >
        Oct {octave}
      </text>
    )
  }

  return (
    <div className="piano-wrap">
      <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
        {keys}
      </svg>
    </div>
  )
}

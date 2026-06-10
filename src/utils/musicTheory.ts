export const NOTE_NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const NOTE_NAMES_JP = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ']
export const NOTE_NAMES_FLAT_EN = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// One distinct color per chromatic note (C..B)
export const NOTE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
]

export interface NoteInfo {
  note: string
  noteJP: string
  octave: number
  cents: number
  midiNumber: number
  noteIndex: number
  frequency: number
}

// A4 = 440 Hz = MIDI 69
export function frequencyToNote(frequency: number): NoteInfo {
  const midiFloat = 69 + 12 * Math.log2(frequency / 440)
  const midiNumber = Math.round(midiFloat)
  const cents = Math.round((midiFloat - midiNumber) * 100)
  const noteIndex = ((midiNumber % 12) + 12) % 12
  const octave = Math.floor(midiNumber / 12) - 1
  return {
    note: NOTE_NAMES_EN[noteIndex],
    noteJP: NOTE_NAMES_JP[noteIndex],
    octave,
    cents,
    midiNumber,
    noteIndex,
    frequency,
  }
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function noteToFrequency(noteIndex: number, octave: number): number {
  const midi = (octave + 1) * 12 + noteIndex
  return midiToFrequency(midi)
}

export interface ScaleInfo {
  name: string
  nameJP: string
  intervals: number[]
  degrees: string[]  // Solfege / degree names
}

export const SCALES: Record<string, ScaleInfo> = {
  major: {
    name: 'Major',
    nameJP: '長調 (メジャー)',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ'],
  },
  naturalMinor: {
    name: 'Natural Minor',
    nameJP: '自然短調 (マイナー)',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['ラ', 'シ', 'ド', 'レ', 'ミ', 'ファ', 'ソ'],
  },
  pentatonicMajor: {
    name: 'Major Pentatonic',
    nameJP: '五音音階 (メジャー)',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['ド', 'レ', 'ミ', 'ソ', 'ラ'],
  },
  pentatonicMinor: {
    name: 'Minor Pentatonic',
    nameJP: '五音音階 (マイナー)',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['ラ', 'ド', 'レ', 'ミ', 'ソ'],
  },
  blues: {
    name: 'Blues',
    nameJP: 'ブルーススケール',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['ラ', 'ド', 'レ', 'ミ♭', 'ミ', 'ソ'],
  },
  dorian: {
    name: 'Dorian',
    nameJP: 'ドリアン',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ', 'ド'],
  },
  mixolydian: {
    name: 'Mixolydian',
    nameJP: 'ミクソリディアン',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['ソ', 'ラ', 'シ', 'ド', 'レ', 'ミ', 'ファ'],
  },
}

export interface IntervalInfo {
  semitones: number
  name: string
  nameJP: string
  abbreviation: string
  consonance: 'perfect' | 'consonant' | 'dissonant'
}

export const INTERVALS: IntervalInfo[] = [
  { semitones: 0,  name: 'Unison',     nameJP: 'ユニゾン (同音)',   abbreviation: 'P1',  consonance: 'perfect'    },
  { semitones: 1,  name: 'Minor 2nd',  nameJP: '短2度',             abbreviation: 'm2',  consonance: 'dissonant'  },
  { semitones: 2,  name: 'Major 2nd',  nameJP: '長2度',             abbreviation: 'M2',  consonance: 'dissonant'  },
  { semitones: 3,  name: 'Minor 3rd',  nameJP: '短3度',             abbreviation: 'm3',  consonance: 'consonant'  },
  { semitones: 4,  name: 'Major 3rd',  nameJP: '長3度',             abbreviation: 'M3',  consonance: 'consonant'  },
  { semitones: 5,  name: 'Perfect 4th',nameJP: '完全4度',           abbreviation: 'P4',  consonance: 'perfect'    },
  { semitones: 6,  name: 'Tritone',    nameJP: '増4度 / 減5度',     abbreviation: 'TT',  consonance: 'dissonant'  },
  { semitones: 7,  name: 'Perfect 5th',nameJP: '完全5度',           abbreviation: 'P5',  consonance: 'perfect'    },
  { semitones: 8,  name: 'Minor 6th',  nameJP: '短6度',             abbreviation: 'm6',  consonance: 'consonant'  },
  { semitones: 9,  name: 'Major 6th',  nameJP: '長6度',             abbreviation: 'M6',  consonance: 'consonant'  },
  { semitones: 10, name: 'Minor 7th',  nameJP: '短7度',             abbreviation: 'm7',  consonance: 'dissonant'  },
  { semitones: 11, name: 'Major 7th',  nameJP: '長7度',             abbreviation: 'M7',  consonance: 'dissonant'  },
  { semitones: 12, name: 'Octave',     nameJP: 'オクターブ',         abbreviation: 'P8',  consonance: 'perfect'    },
]

export function getInterval(semitones: number): IntervalInfo {
  const normalized = ((semitones % 12) + 12) % 12
  return INTERVALS[normalized]
}

export interface ScaleMatch {
  scaleKey: string
  root: number
  score: number
  label: string
}

export function matchScales(noteIndices: number[]): ScaleMatch[] {
  if (noteIndices.length === 0) return []
  const uniqueNotes = [...new Set(noteIndices)]
  const results: ScaleMatch[] = []

  for (const [scaleKey, scale] of Object.entries(SCALES)) {
    for (let root = 0; root < 12; root++) {
      let matches = 0
      for (const note of uniqueNotes) {
        const interval = ((note - root) + 12) % 12
        if (scale.intervals.includes(interval)) matches++
      }
      const score = matches / uniqueNotes.length
      if (score > 0.6) {
        results.push({
          scaleKey,
          root,
          score,
          label: `${NOTE_NAMES_EN[root]} ${scale.name}`,
        })
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 4)
}

export function getScaleDegreeLabel(noteIndex: number, root: number, scaleKey: string): string | null {
  const scale = SCALES[scaleKey]
  if (!scale) return null
  const interval = ((noteIndex - root) + 12) % 12
  const degreeIdx = scale.intervals.indexOf(interval)
  if (degreeIdx === -1) return null
  return scale.degrees[degreeIdx]
}

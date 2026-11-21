import { NOTE_NAMES_EN } from './musicTheory'

// ─── Exercise patterns ───────────────────────────────────────────────────────

export interface ExercisePattern {
  id: string
  name: string
  solfa: string          // human-readable pattern
  steps: number[]        // semitones above the root
  lengths?: number[]     // beats per note (default 1, last note 2); for glides: beats per segment
  hint: string
  defaultBpm: number
  staccato?: boolean     // short, detached notes
  glide?: boolean        // slide continuously between steps (siren)
}

export const PATTERNS: ExercisePattern[] = [
  {
    id: 'three', name: '3トーン', solfa: 'ド レ ミ レ ド',
    steps: [0, 2, 4, 2, 0],
    hint: 'まずはハミングやリップロールで、軽く小さめの声から。',
    defaultBpm: 96,
  },
  {
    id: 'five', name: '5トーン', solfa: 'ド レ ミ ファ ソ ファ ミ レ ド',
    steps: [0, 2, 4, 5, 7, 5, 4, 2, 0],
    hint: 'ボイトレの定番。リップロール →「マ」「ネイ」の順で。',
    defaultBpm: 108,
  },
  {
    id: 'arpeggio', name: 'アルペジオ', solfa: 'ド ミ ソ ド ソ ミ ド',
    steps: [0, 4, 7, 12, 7, 4, 0],
    hint: '上のドは「上から乗せる」イメージで。喉を押し上げない。',
    defaultBpm: 100,
  },
  {
    id: 'octave', name: 'オクターブ跳躍', solfa: 'ド ↑ド ↓ド',
    steps: [0, 12, 0],
    lengths: [1, 2, 2],
    hint: '換声点の練習。高い音で喉が上がらないよう、息の量を保つ。',
    defaultBpm: 84,
  },
  {
    id: 'fifth', name: '5度跳躍', solfa: 'ド ソ ド ソ ド',
    steps: [0, 7, 0, 7, 0],
    hint: '音程の跳躍を正確に。ソを「狙って」当てる感覚を身につける。',
    defaultBpm: 92,
  },
  {
    id: 'staccato', name: 'スタッカート', solfa: 'ド・ミ・ソ・ド・ソ・ミ・ド',
    steps: [0, 4, 7, 12, 7, 4, 0],
    lengths: [1, 1, 1, 1, 1, 1, 1],
    staccato: true,
    hint: '「ハッ」「ホッ」とお腹（横隔膜）で短く切る。喉で止めないこと。',
    defaultBpm: 100,
  },
  {
    id: 'siren', name: 'サイレン', solfa: 'ド ↗ 上のド ↘ ド（なめらかに）',
    steps: [0, 12, 0],
    lengths: [4, 4],
    glide: true,
    hint: '「ウー」やリップロールで、段差なく滑らかに上下。換声点で声がひっくり返らないように。',
    defaultBpm: 90,
  },
  {
    id: 'nine', name: '9トーン', solfa: 'ド〜レ(9度)〜ド',
    steps: [0, 2, 4, 5, 7, 9, 11, 12, 14, 12, 11, 9, 7, 5, 4, 2, 0],
    hint: '上級。1オクターブ以上を一息で。息配分を意識して。',
    defaultBpm: 132,
  },
]

export function patternLengths(p: ExercisePattern): number[] {
  if (p.lengths) return p.lengths
  if (p.glide) return p.steps.slice(1).map(() => 2)
  return p.steps.map((_, i) => (i === p.steps.length - 1 ? 2 : 1))
}

export function patternSpan(p: ExercisePattern): number {
  return Math.max(...p.steps)
}

// Movable-do labels for semitone offsets (major-scale context)
const MOVABLE_DO: Record<number, string> = {
  0: 'ド', 2: 'レ', 4: 'ミ', 5: 'ファ', 7: 'ソ', 9: 'ラ', 11: 'シ', 12: 'ド', 14: 'レ',
}
export function stepLabel(semi: number): string {
  return MOVABLE_DO[semi] ?? '・'
}

// ─── Notes / range ───────────────────────────────────────────────────────────

export function midiName(midi: number): string {
  return `${NOTE_NAMES_EN[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

export interface VoiceRange { lo: number; hi: number }

export const RANGE_PRESETS: { id: string; label: string; range: VoiceRange }[] = [
  { id: 'male-low',    label: '男性・低め',  range: { lo: 43, hi: 64 } },  // G2–E4
  { id: 'male',        label: '男性',        range: { lo: 48, hi: 67 } },  // C3–G4
  { id: 'female-low',  label: '女性・低め',  range: { lo: 53, hi: 74 } },  // F3–D5
  { id: 'female',      label: '女性',        range: { lo: 57, hi: 79 } },  // A3–G5
]

const RANGE_KEY = 'vtRange'

export function loadRangeCheckResult(): VoiceRange | null {
  try {
    const h = JSON.parse(localStorage.getItem('rangeHistory') ?? '[]')
    if (Array.isArray(h) && h[0] && typeof h[0].minMidi === 'number') {
      // Stay slightly inside the extremes: practise comfortably, not at the limit
      const lo = h[0].minMidi + 2
      const hi = h[0].maxMidi - 1
      if (hi - lo >= 7) return { lo, hi }
    }
  } catch { /* ignore */ }
  return null
}

export function loadRange(): VoiceRange {
  try {
    const r = JSON.parse(localStorage.getItem(RANGE_KEY) ?? 'null')
    if (r && typeof r.lo === 'number' && typeof r.hi === 'number') return r
  } catch { /* ignore */ }
  return loadRangeCheckResult() ?? RANGE_PRESETS[1].range
}

export function saveRange(r: VoiceRange) {
  try { localStorage.setItem(RANGE_KEY, JSON.stringify(r)) } catch { /* ignore */ }
}

/** Roots for a session: ascend by semitone so the whole pattern fits in range, optionally come back down. */
export function buildRoots(range: VoiceRange, span: number, direction: 'up' | 'updown'): number[] {
  const top = range.hi - span
  const up: number[] = []
  for (let r = range.lo; r <= top; r++) up.push(r)
  if (up.length === 0) up.push(range.lo)
  if (direction === 'up') return up
  return [...up, ...up.slice(0, -1).reverse()]
}

/** Fold cents to the nearest octave of the target, range [-600, 600). */
export function foldCents(cents: number): number {
  return ((cents % 1200) + 1800) % 1200 - 600
}

// ─── Practice log (localStorage) ─────────────────────────────────────────────

export interface PracticeEntry {
  date: string            // ISO timestamp
  kind: 'warmup' | 'longtone' | 'breath' | 'routine'
  exercise: string        // pattern id, 'longtone' or 'breath'
  score: number
  seconds: number         // time spent
  detail?: Record<string, number | string>
}

const LOG_KEY = 'voiceTrainingLog'

export function loadLog(): PracticeEntry[] {
  try {
    const l = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]')
    return Array.isArray(l) ? l : []
  } catch { return [] }
}

export function appendLog(e: PracticeEntry) {
  try {
    const l = loadLog()
    l.unshift(e)
    localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(0, 1000)))
  } catch { /* ignore */ }
}

export function clearLog() {
  try { localStorage.removeItem(LOG_KEY) } catch { /* ignore */ }
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Consecutive practice days ending today (or yesterday, if not yet practised today). */
export function streakDays(log: PracticeEntry[]): number {
  const days = new Set(log.map(e => dayKey(new Date(e.date))))
  const d = new Date()
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

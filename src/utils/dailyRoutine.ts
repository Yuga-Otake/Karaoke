import {
  PATTERNS, ExercisePattern, patternLengths, patternSpan, VoiceRange, PracticeEntry,
} from './vocalExercises'
import type { WarmupMode } from '../hooks/useWarmup'

// ─── The daily 10-minute routine ─────────────────────────────────────────────
// Order follows a standard lesson: breath → gentle onset → sustain → range work
// → agility → pitch → cool-down. Each scale stage gets a time budget, and the
// number of keys is derived from it so the whole routine stays near 10 minutes.

export type Direction = 'up' | 'updown' | 'down'

export interface Stage {
  id: string
  kind: 'breath' | 'longtone' | 'warmup'
  title: string
  why: string
  how: string
  patternId?: string
  bpm?: number
  direction?: Direction
  budgetSec?: number
  pitchOffset?: number   // long tone: semitones above the comfortable middle
}

export const DAILY_STAGES: Stage[] = [
  {
    id: 'breath', kind: 'breath', title: 'ロングブレス',
    why: '声の燃料は息。吐く息を細く長くコントロールする力をつけます。',
    how: '肩を上げずに鼻から4秒吸って、歯の隙間から「スー」と一定に吐き続ける。',
  },
  {
    id: 'hum', kind: 'warmup', patternId: 'three', bpm: 120, direction: 'updown', budgetSec: 45,
    title: 'ハミング（3トーン）',
    why: '声帯をやさしく起こすウォーミングアップ。いきなり大きな声を出さないために。',
    how: '口を閉じて「ンー」。鼻や唇のあたりがビリビリ響けばOK。小さめの声で。',
  },
  {
    id: 'longtone1', kind: 'longtone', pitchOffset: 0,
    title: 'ロングトーン',
    why: '一定の息で一定の声を出す、すべての発声の基本。',
    how: '「アー」で、基準音と同じ高さ・同じ大きさのまま、まっすぐ伸ばす。',
  },
  {
    id: 'lip', kind: 'warmup', patternId: 'five', bpm: 116, direction: 'updown', budgetSec: 90,
    title: '5トーン（リップロール）',
    why: '喉に負担をかけずに、息と声のバランスを整えます。',
    how: '唇をプルプル震わせながら音階を。難しければ「ブー」や「ルー」でもOK。',
  },
  {
    id: 'siren', kind: 'warmup', patternId: 'siren', bpm: 92, direction: 'up', budgetSec: 50,
    title: 'サイレン',
    why: '地声と裏声をつなぎ、換声点（声がひっくり返る所）をなめらかにします。',
    how: '「ウー」で、段差なく滑らかに上下。ひっくり返っても気にせず軽く。',
  },
  {
    id: 'staccato', kind: 'warmup', patternId: 'staccato', bpm: 104, direction: 'up', budgetSec: 40,
    title: 'スタッカート',
    why: '横隔膜を使った息の瞬発力と、声の立ち上がりを鍛えます。',
    how: '「ハッ」「ハッ」とお腹で短く切る。喉で息を止めないこと。',
  },
  {
    id: 'arpeggio', kind: 'warmup', patternId: 'arpeggio', bpm: 100, direction: 'updown', budgetSec: 75,
    title: 'アルペジオ（マ）',
    why: '音程の跳躍を正確に、響きの位置を低い音と高い音でそろえます。',
    how: '「マ」で。上のドは下から押し上げず、上から乗せるイメージで。',
  },
  {
    id: 'octave', kind: 'warmup', patternId: 'octave', bpm: 84, direction: 'up', budgetSec: 40,
    title: 'オクターブ跳躍',
    why: '高音を、喉を上げずに出す感覚をつかみます。',
    how: '「ネイ」や「ヤー」で。高い音ほど息の量を保って、あごを上げない。',
  },
  {
    id: 'longtone2', kind: 'longtone', pitchOffset: 4,
    title: 'ロングトーン（高め）',
    why: '少し高い音でも、安定した声を保つ練習。',
    how: '最初のロングトーンより少し高い音で。力まず、息の流れを一定に。',
  },
  {
    id: 'cooldown', kind: 'warmup', patternId: 'three', bpm: 112, direction: 'down', budgetSec: 35,
    title: 'クールダウン（ハミング）',
    why: '使った声帯をほぐして終わります。毎回の締めくくりに。',
    how: '高い方から下がっていく音階を、口を閉じて小さく「ンー」。',
  },
]

export function stagePattern(s: Stage): ExercisePattern {
  return PATTERNS.find(p => p.id === s.patternId) ?? PATTERNS[0]
}

/** Seconds one rep of a pattern takes (matches the timeline in useWarmup). */
export function repSeconds(p: ExercisePattern, bpm: number, mode: WarmupMode): number {
  const beat = 60 / bpm
  const beats = patternLengths(p).reduce((a, b) => a + b, 0)
  return beat * (2 + beats + (mode === 'call' ? beats + 1 : 0)) + 0.6
}

/** Spread up to `maxReps` keys over the range so the session still climbs to the top. */
export function pickRoots(range: VoiceRange, span: number, direction: Direction, maxReps: number): number[] {
  const all: number[] = []
  for (let r = range.lo; r <= range.hi - span; r++) all.push(r)
  if (all.length === 0) all.push(range.lo)
  const n = direction === 'updown'
    ? Math.max(2, Math.floor((maxReps + 1) / 2))
    : Math.max(2, maxReps)
  let up = all
  if (all.length > n) {
    up = Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / (n - 1))])
    up = up.filter((v, i) => up.indexOf(v) === i)
  }
  if (direction === 'up') return up
  if (direction === 'down') return [...up].reverse()
  return [...up, ...up.slice(0, -1).reverse()]
}

export function planWarmup(s: Stage, range: VoiceRange, mode: WarmupMode) {
  const pattern = stagePattern(s)
  const bpm = s.bpm ?? pattern.defaultBpm
  const maxReps = Math.max(3, Math.floor((s.budgetSec ?? 40) / repSeconds(pattern, bpm, mode)))
  const roots = pickRoots(range, patternSpan(pattern), s.direction ?? 'up', maxReps)
  return { pattern, bpm, roots }
}

export function longToneMidi(s: Stage, range: VoiceRange): number {
  const mid = Math.round((range.lo + range.hi) / 2) - 2
  return Math.min(range.hi - 2, mid + (s.pitchOffset ?? 0))
}

/** Targets grow a little beyond your best, so daily practice keeps stretching you. */
export function adaptiveTargets(log: PracticeEntry[]) {
  const best = (kind: string) => Math.max(0, ...log.filter(e => e.kind === kind).map(e => Number(e.detail?.duration ?? 0)))
  const b = best('breath'), l = best('longtone')
  const breath = b > 0 ? Math.min(60, Math.max(15, Math.round((b * 1.1) / 5) * 5)) : 20
  const longtone = l > 0 ? Math.min(20, Math.max(8, Math.round(l * 1.1))) : 10
  return { breath, longtone, longtoneHigh: Math.max(6, longtone - 3) }
}

/** Rough total in minutes, including short transitions between stages. */
export function estimateMinutes(range: VoiceRange, mode: WarmupMode, log: PracticeEntry[]): number {
  const t = adaptiveTargets(log)
  let sec = 0
  for (const s of DAILY_STAGES) {
    if (s.kind === 'breath') sec += 8 + t.breath
    else if (s.kind === 'longtone') sec += 4 + (s.pitchOffset ? t.longtoneHigh : t.longtone)
    else {
      const { pattern, bpm, roots } = planWarmup(s, range, mode)
      sec += roots.length * repSeconds(pattern, bpm, mode)
    }
    sec += 15   // reading the tip + tapping next
  }
  return Math.round(sec / 60)
}

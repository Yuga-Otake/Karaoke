import { VoiceRange } from './vocalExercises'

// ─── Song model ──────────────────────────────────────────────────────────────

export interface SongNote {
  midi: number
  start: number    // beats from the song start
  len: number      // beats
  lyric?: string
}

export interface Song {
  id: string
  title: string
  bpm: number
  beatsPerBar: number
  text: string             // melody in ドレミ notation (source of truth for editing)
  lyrics: string
  sample?: boolean
  history?: { date: string; score: number; from: number; to: number }[]
}

// ─── ドレミ notation ─────────────────────────────────────────────────────────
//   ド レ ミ ファ ソ ラ シ  (or C D E F G A B / do re mi …)
//   #/♯ = sharp, b/♭ = flat       ↑ / ↓ = one octave up / down (ド = C4)
//   number = beats (default 1):  ド2  ド0.5  ド1.5      ー = +1 beat:  ドー
//   休 / R = rest (same length rules)    | = bar line (ignored)

const NAME_TO_PC: Record<string, number> = {
  'ド': 0, 'レ': 2, 'ミ': 4, 'ファ': 5, 'ソ': 7, 'ラ': 9, 'シ': 11,
  do: 0, re: 2, mi: 4, fa: 5, so: 7, sol: 7, la: 9, si: 11, ti: 11,
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
}
const PC_TO_NAME = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ']

const TOKEN = /^([↑↓^]*)(ファ|ド|レ|ミ|ソ|ラ|シ|sol|do|re|mi|fa|so|la|si|ti|[a-g]|休|r)([#♯b♭]?)([↑↓^]*)(\d+(?:\.\d+)?)?(ー*)$/i

export interface ParseResult { notes: SongNote[]; errors: string[]; totalBeats: number }

export function parseMelody(text: string, lyrics = ''): ParseResult {
  const notes: SongNote[] = []
  const errors: string[] = []
  let t = 0
  const tokens = text.replace(/[|｜]/g, ' ').replace(/　/g, ' ').split(/\s+/).filter(Boolean)
  for (const tok of tokens) {
    const m = TOKEN.exec(tok)
    if (!m) { errors.push(tok); continue }
    const [, pre, name, acc, post, num, bars] = m
    const len = (num ? parseFloat(num) : 1) + bars.length
    if (!(len > 0)) { errors.push(tok); continue }
    const lname = name.toLowerCase()
    if (lname === '休' || lname === 'r') { t += len; continue }
    const marks = pre + post
    const oct = (marks.match(/[↑^]/g)?.length ?? 0) - (marks.match(/↓/g)?.length ?? 0)
    let pc = NAME_TO_PC[name] ?? NAME_TO_PC[lname]
    if (acc === '#' || acc === '♯') pc += 1
    if (acc === 'b' || acc === '♭') pc -= 1
    notes.push({ midi: 60 + pc + oct * 12, start: t, len })
    t += len
  }
  const syl = splitLyrics(lyrics)
  notes.forEach((n, i) => { if (syl[i]) n.lyric = syl[i] })
  return { notes, errors, totalBeats: t }
}

const SMALL_KANA = /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/

/** Space-separated syllables, or (no spaces) one kana mora per note. */
export function splitLyrics(lyrics: string): string[] {
  const s = lyrics.trim()
  if (!s) return []
  if (/\s/.test(s)) return s.split(/\s+/)
  const out: string[] = []
  for (const ch of s) {
    if (SMALL_KANA.test(ch) && out.length) out[out.length - 1] += ch
    else out.push(ch)
  }
  return out
}

function fmtLen(len: number): string {
  const r = Math.round(len * 4) / 4
  return r === 1 ? '' : String(r)
}

/** Notes → ドレミ notation, with rests and bar lines. */
export function toMelodyText(notes: SongNote[], beatsPerBar: number): string {
  const out: string[] = []
  let t = 0
  let bar = 0
  const barCheck = (at: number) => {
    const b = Math.floor(at / beatsPerBar + 1e-6)
    if (b > bar && out.length) { out.push('|'); bar = b } else bar = Math.max(bar, b)
  }
  for (const n of [...notes].sort((a, b) => a.start - b.start)) {
    if (n.start - t >= 0.25) { barCheck(t); out.push('休' + fmtLen(n.start - t)) }
    barCheck(n.start)
    const oct = Math.floor(n.midi / 12) - 5
    const mark = oct > 0 ? '↑'.repeat(oct) : '↓'.repeat(-oct)
    out.push(mark + PC_TO_NAME[((n.midi % 12) + 12) % 12] + fmtLen(n.len))
    t = n.start + n.len
  }
  return out.join(' ')
}

// ─── Key fitting ─────────────────────────────────────────────────────────────

/** Transpose (semitones) that puts the song's range in the middle of the singer's. */
export function autoTranspose(notes: SongNote[], range: VoiceRange): number {
  if (!notes.length) return 0
  const lo = Math.min(...notes.map(n => n.midi)), hi = Math.max(...notes.map(n => n.midi))
  const t = Math.round((range.lo + range.hi) / 2 - (lo + hi) / 2)
  return Math.max(-24, Math.min(24, t))
}

// ─── Standard MIDI file import ───────────────────────────────────────────────

export interface MidiTrackCandidate {
  name: string
  notes: SongNote[]        // already reduced to a single melody line
  avgMidi: number
}

export interface MidiImport {
  bpm: number
  beatsPerBar: number
  tracks: MidiTrackCandidate[]
  guess: number            // index of the track that most likely holds the melody
}

export function parseMidi(buf: ArrayBuffer): MidiImport {
  const v = new DataView(buf)
  let p = 0
  const str = (n: number) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(p + i)); return s }
  if (str(4) !== 'MThd') throw new Error('MIDIファイルではありません')
  const hdrLen = v.getUint32(4)
  const ntrks = v.getUint16(10)
  const division = v.getUint16(12)
  if (division & 0x8000) throw new Error('この形式のMIDI（SMPTE）には対応していません')
  const ppq = division
  p = 8 + hdrLen

  let tempo = 500000
  let tempoSet = false
  let beatsPerBar = 4
  type Raw = { midi: number; on: number; off: number }
  const groups = new Map<string, { name: string; notes: Raw[] }>()

  for (let tr = 0; tr < ntrks && p < v.byteLength; tr++) {
    if (str(4) !== 'MTrk') break
    const len = v.getUint32(p + 4)
    p += 8
    const end = p + len
    let tick = 0
    let status = 0
    let trackName = `トラック ${tr + 1}`
    const open = new Map<number, { tick: number; ch: number }[]>()
    const readVar = () => { let x = 0, b; do { b = v.getUint8(p++); x = (x << 7) | (b & 0x7f) } while (b & 0x80); return x }

    while (p < end) {
      tick += readVar()
      let b = v.getUint8(p)
      if (b & 0x80) { status = b; p++ } else b = status
      const type = status & 0xf0
      const ch = status & 0x0f
      if (status === 0xff) {
        const meta = v.getUint8(p++)
        const l = readVar()
        if (meta === 0x51 && !tempoSet) { tempo = (v.getUint8(p) << 16) | (v.getUint8(p + 1) << 8) | v.getUint8(p + 2); tempoSet = true }
        if (meta === 0x58) beatsPerBar = v.getUint8(p) || 4
        if (meta === 0x03 && l > 0) {
          const bytes = new Uint8Array(buf, p, l)
          try { trackName = new TextDecoder('shift_jis').decode(bytes).trim() || trackName } catch { /* keep default */ }
        }
        p += l
      } else if (status === 0xf0 || status === 0xf7) {
        p += readVar()
      } else if (type === 0x90 || type === 0x80) {
        const note = v.getUint8(p++), vel = v.getUint8(p++)
        const key = ch * 128 + note
        if (type === 0x90 && vel > 0) {
          if (!open.has(key)) open.set(key, [])
          open.get(key)!.push({ tick, ch })
        } else {
          const st = open.get(key)?.shift()
          if (st && ch !== 9) {
            const gk = `${tr}:${ch}`
            if (!groups.has(gk)) groups.set(gk, { name: trackName, notes: [] })
            const g = groups.get(gk)!
            g.name = trackName
            g.notes.push({ midi: note, on: st.tick, off: tick })
          }
        }
      } else if (type === 0xc0 || type === 0xd0) {
        p += 1
      } else {
        p += 2
      }
    }
    p = end
  }

  const tracks: MidiTrackCandidate[] = []
  for (const [, g] of groups) {
    if (g.notes.length < 4) continue
    // Skyline: keep the highest note at each onset, cut notes when the next one starts
    const sorted = g.notes.sort((a, b) => a.on - b.on || b.midi - a.midi)
    const mono: Raw[] = []
    for (const n of sorted) {
      const last = mono[mono.length - 1]
      if (last && n.on === last.on) continue
      if (last && last.off > n.on) last.off = n.on
      mono.push({ ...n })
    }
    const notes = mono
      .map(n => ({ midi: n.midi, start: n.on / ppq, len: (n.off - n.on) / ppq }))
      .filter(n => n.len >= 1 / 16)
    if (notes.length < 4) continue
    // Keep bar alignment but drop leading empty bars
    const shift = Math.floor(notes[0].start / beatsPerBar) * beatsPerBar
    notes.forEach(n => { n.start = Math.round((n.start - shift) * 16) / 16; n.len = Math.round(n.len * 16) / 16 || 1 / 16 })
    const sameName = tracks.filter(t => t.name.startsWith(g.name)).length
    tracks.push({
      name: sameName ? `${g.name} (${sameName + 1})` : g.name,
      notes,
      avgMidi: notes.reduce((a, n) => a + n.midi, 0) / notes.length,
    })
  }
  if (!tracks.length) throw new Error('メロディが見つかりませんでした')

  // Melody guess: a busy track in the singing range, preferring higher lines
  const score = (t: MidiTrackCandidate) =>
    Math.min(t.notes.length, 200) * (t.avgMidi >= 55 && t.avgMidi <= 84 ? 1 : 0.3) + t.avgMidi
  const guess = tracks.reduce((best, t, i) => score(t) > score(tracks[best]) ? i : best, 0)
  return { bpm: Math.round(60000000 / tempo), beatsPerBar, tracks, guess }
}

// ─── Library (localStorage) ──────────────────────────────────────────────────

export const SAMPLE_SONGS: Song[] = [
  {
    id: 'sample-twinkle', sample: true, title: 'きらきら星（フランス民謡）', bpm: 96, beatsPerBar: 4,
    text: 'ド ド ソ ソ | ラ ラ ソ2 | ファ ファ ミ ミ | レ レ ド2 | ソ ソ ファ ファ | ミ ミ レ2 | ソ ソ ファ ファ | ミ ミ レ2 | ド ド ソ ソ | ラ ラ ソ2 | ファ ファ ミ ミ | レ レ ド2',
    lyrics: '',
  },
  {
    id: 'sample-frog', sample: true, title: 'かえるの合唱（ドイツ民謡）', bpm: 100, beatsPerBar: 4,
    text: 'ド レ ミ ファ | ミ レ ド2 | ミ ファ ソ ラ | ソ ファ ミ2 | ド2 ド2 | ド2 ド2 | ド0.5 ド0.5 レ0.5 レ0.5 ミ0.5 ミ0.5 ファ0.5 ファ0.5 | ミ レ ド2',
    lyrics: '',
  },
  {
    id: 'sample-joy', sample: true, title: '歓喜の歌（ベートーヴェン）', bpm: 104, beatsPerBar: 4,
    text: 'ミ ミ ファ ソ | ソ ファ ミ レ | ド ド レ ミ | ミ1.5 レ0.5 レ2 | ミ ミ ファ ソ | ソ ファ ミ レ | ド ド レ ミ | レ1.5 ド0.5 ド2',
    lyrics: '',
  },
]

const LIB_KEY = 'vtSongs'

export function loadSongs(): Song[] {
  let mine: Song[] = []
  try {
    const l = JSON.parse(localStorage.getItem(LIB_KEY) ?? '[]')
    if (Array.isArray(l)) mine = l
  } catch { /* ignore */ }
  // Samples keep their play history in the same store
  const samples = SAMPLE_SONGS.map(s => ({ ...s, history: mine.find(m => m.id === s.id)?.history }))
  return [...mine.filter(m => !m.sample), ...samples]
}

function persist(all: Song[]) {
  // samples are stored only for their history
  const data = all.map(s => s.sample ? { id: s.id, sample: true, history: s.history } : s)
  try { localStorage.setItem(LIB_KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

export function saveSong(song: Song) {
  const all = loadSongs()
  const i = all.findIndex(s => s.id === song.id)
  if (i >= 0) all[i] = song; else all.unshift(song)
  persist(all)
}

export function deleteSong(id: string) {
  persist(loadSongs().filter(s => s.id !== id))
}

export function recordSongScore(id: string, score: number, from: number, to: number) {
  const all = loadSongs()
  const s = all.find(x => x.id === id)
  if (!s) return
  s.history = [{ date: new Date().toISOString(), score, from, to }, ...(s.history ?? [])].slice(0, 30)
  persist(all)
}

export function newSongId() {
  return 'song-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

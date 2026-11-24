import { useState, useMemo, useRef, useEffect, MutableRefObject } from 'react'
import {
  Song, SongNote, parseMelody, toMelodyText, autoTranspose, parseMidi, MidiImport,
  loadSongs, saveSong, deleteSong, recordSongScore, newSongId,
} from '../utils/song'
import { useSongPractice, SongLive, TimedNote, SongResult } from '../hooks/useSongPractice'
import { VoiceRange, midiName } from '../utils/vocalExercises'
import { gradeOf } from '../utils/scoring'
import { scoreColor, useAnimatedCanvas, drawMeter } from './vtShared'

const PC_JP = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ']
const noteLabel = (midi: number) => PC_JP[((midi % 12) + 12) % 12]

// ─── Main ────────────────────────────────────────────────────────────────────

export function SongPractice({ range }: { range: VoiceRange }) {
  const [songs, setSongs] = useState<Song[]>(() => loadSongs())
  const [view, setView] = useState<'library' | 'edit' | 'practice'>('library')
  const [current, setCurrent] = useState<Song | null>(null)
  const refresh = () => setSongs(loadSongs())

  if (view === 'edit' && current) {
    return <SongEditor initial={current} onCancel={() => setView('library')}
      onSave={s => { saveSong(s); refresh(); setCurrent(s); setView('practice') }} />
  }
  if (view === 'practice' && current) {
    return <PracticeView song={current} range={range}
      onBack={() => { refresh(); setView('library') }}
      onEdit={() => setView('edit')} />
  }
  return <Library songs={songs}
    onPlay={s => { setCurrent(s); setView('practice') }}
    onEdit={s => { setCurrent(s); setView('edit') }}
    onDelete={s => { if (confirm(`「${s.title}」を削除しますか？`)) { deleteSong(s.id); refresh() } }}
    onNew={s => { setCurrent(s); setView('edit') }} />
}

// ─── Library ─────────────────────────────────────────────────────────────────

function Library({ songs, onPlay, onEdit, onDelete, onNew }: {
  songs: Song[]
  onPlay: (s: Song) => void; onEdit: (s: Song) => void; onDelete: (s: Song) => void; onNew: (s: Song) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [midi, setMidi] = useState<{ data: MidiImport; name: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const blank = (): Song => ({ id: newSongId(), title: '', bpm: 90, beatsPerBar: 4, text: '', lyrics: '' })

  const onFile = async (f: File) => {
    setErr(null)
    try {
      const data = parseMidi(await f.arrayBuffer())
      if (data.tracks.length === 1) importTrack(data, 0, f.name)
      else setMidi({ data, name: f.name })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '読み込めませんでした')
    }
  }
  const importTrack = (data: MidiImport, i: number, fileName: string) => {
    const t = data.tracks[i]
    setMidi(null)
    onNew({
      ...blank(),
      title: fileName.replace(/\.midi?$/i, ''),
      bpm: Math.max(40, Math.min(220, data.bpm)),
      beatsPerBar: data.beatsPerBar,
      text: toMelodyText(t.notes, data.beatsPerBar),
    })
  }

  return (
    <div className="vt-panel">
      <div className="vt-hint">
        💬 好きな曲のメロディを入れて、その曲で音程を練習できます。苦手な小節だけを繰り返したり、自分の音域にキーを合わせたりできます。
      </div>
      <div className="sp-actions">
        <button className="kp-start-btn" onClick={() => onNew(blank())}>＋ ドレミで入力</button>
        <button className="kp-start-btn retry" onClick={() => fileRef.current?.click()}>📂 MIDIファイルを読み込む</button>
        <input ref={fileRef} type="file" accept=".mid,.midi,audio/midi,audio/x-midi" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      </div>
      {err && <div className="kp-error">⚠ {err}</div>}

      {midi && (
        <div className="vt-results">
          <div className="vt-sub-title">どのパートがメロディ（歌）ですか？</div>
          {midi.data.tracks.map((t, i) => (
            <button key={i} className={`vt-menu-item ${i === midi.data.guess ? 'done' : ''}`}
              onClick={() => importTrack(midi.data, i, midi.name)}>
              <span className="vt-menu-text">
                <span className="vt-menu-label">{t.name}{i === midi.data.guess ? '（おすすめ）' : ''}</span>
                <span className="vt-menu-desc">
                  {t.notes.length}音 ・ {midiName(Math.min(...t.notes.map(n => n.midi)))}〜{midiName(Math.max(...t.notes.map(n => n.midi)))}
                  ・ 出だし: {t.notes.slice(0, 6).map(n => noteLabel(n.midi)).join(' ')}
                </span>
              </span>
              <span className="vt-menu-go">▶</span>
            </button>
          ))}
          <button className="clear-btn" onClick={() => setMidi(null)}>キャンセル</button>
        </div>
      )}

      <div className="vt-sub-title">曲リスト</div>
      <div className="vt-menu">
        {songs.map(s => {
          const best = s.history?.length ? Math.max(...s.history.map(h => h.score)) : null
          const last = s.history?.[0]?.score
          return (
            <div key={s.id} className="sp-song">
              <button className="sp-song-main" onClick={() => onPlay(s)}>
                <span className="vt-menu-label">{s.title || '（無題）'}</span>
                <span className="vt-menu-desc">
                  {s.sample ? 'サンプル ・ ' : ''}{s.bpm} BPM
                  {best !== null && <> ・ ベスト <b style={{ color: scoreColor(best) }}>{best}</b> ・ 前回 {last}</>}
                </span>
              </button>
              {!s.sample && <button className="sp-icon" title="編集" onClick={() => onEdit(s)}>✏️</button>}
              {!s.sample && <button className="sp-icon" title="削除" onClick={() => onDelete(s)}>🗑</button>}
              <button className="sp-icon go" onClick={() => onPlay(s)}>▶</button>
            </div>
          )
        })}
      </div>
      <div className="vt-legend">
        ✱ MIDIファイルは「曲名 MIDI」で検索すると見つかることがあります。読み込んだ曲はこの端末にだけ保存されます。
      </div>
    </div>
  )
}

// ─── Editor ──────────────────────────────────────────────────────────────────

const LENGTHS = [
  { v: 0.5, label: '♪ ½' }, { v: 1, label: '♩ 1' }, { v: 1.5, label: '♩. 1½' }, { v: 2, label: '𝅗𝅥 2' }, { v: 3, label: '3' }, { v: 4, label: '𝅝 4' },
]
const KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const BLACK = new Set([1, 3, 6, 8, 10])

function SongEditor({ initial, onSave, onCancel }: {
  initial: Song; onSave: (s: Song) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [bpm, setBpm] = useState(initial.bpm)
  const [bpb, setBpb] = useState(initial.beatsPerBar)
  const [text, setText] = useState(initial.text)
  const [lyrics, setLyrics] = useState(initial.lyrics)
  const [oct, setOct] = useState(0)
  const [len, setLen] = useState(1)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const parsed = useMemo(() => parseMelody(text, lyrics), [text, lyrics])
  const sp = useSongPractice()

  const insert = (tok: string) => {
    const ta = taRef.current
    // insert at the cursor if the user is editing the text, otherwise append
    const pos = ta && document.activeElement === ta ? ta.selectionEnd : text.length
    const before = text.slice(0, pos), after = text.slice(pos)
    const sep = before && !/\s$/.test(before) ? ' ' : ''
    const next = before + sep + tok + (after && !/^\s/.test(after) ? ' ' : '') + after
    setText(next)
    requestAnimationFrame(() => {
      if (!ta) return
      const p = (before + sep + tok).length
      ta.setSelectionRange(p, p)
      ta.scrollTop = ta.scrollHeight
    })
  }
  const lenSuffix = len === 1 ? '' : String(len)
  const octMark = oct > 0 ? '↑'.repeat(oct) : '↓'.repeat(-oct)
  const backspace = () => setText(t => t.replace(/\s*\S+\s*$/, ''))

  const lo = parsed.notes.length ? Math.min(...parsed.notes.map(n => n.midi)) : null
  const hi = parsed.notes.length ? Math.max(...parsed.notes.map(n => n.midi)) : null
  const syl = lyrics.trim() ? parsed.notes.filter(n => n.lyric).length : 0

  return (
    <div className="vt-panel">
      <div className="sp-form">
        <label className="kp-setting sp-grow"><span>曲名</span>
          <input className="sp-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：〇〇のサビ" />
        </label>
        <label className="kp-setting"><span>テンポ (BPM)</span>
          <input className="sp-input sp-num" type="number" min={40} max={220} value={bpm} onChange={e => setBpm(Number(e.target.value) || 90)} />
        </label>
        <label className="kp-setting"><span>拍子</span>
          <select value={bpb} onChange={e => setBpb(Number(e.target.value))}>
            {[2, 3, 4, 6].map(b => <option key={b} value={b}>{b}拍子</option>)}
          </select>
        </label>
      </div>

      <div className="vt-sub-title">メロディ（ドレミ）</div>
      <textarea ref={taRef} className="sp-textarea" rows={5} value={text} onChange={e => setText(e.target.value)}
        placeholder="例：ド レ ミ ファ | ソ2 ミ2 | ↑ド ラ ソ ミ | レ4" />
      <div className="vt-legend">
        書き方：音名のあとの数字＝拍数（なし＝1拍, ド2, ド0.5）・「ー」で1拍のばす（ドー）・↑↓＝1オクターブ上/下・#/b＝半音・休＝休符・| は小節線（なくてもOK）
      </div>

      <div className="sp-kbd-wrap">
        <div className="sp-kbd-row">
          <span className="sp-kbd-lbl">長さ</span>
          {LENGTHS.map(l => (
            <button key={l.v} className={`vt-chip ${len === l.v ? 'selected' : ''}`} onClick={() => setLen(l.v)}>{l.label}</button>
          ))}
        </div>
        <div className="sp-kbd-row">
          <button className="vt-chip" onClick={() => setOct(o => Math.max(-2, o - 1))}>オクターブ ↓</button>
          <span className="sp-kbd-lbl">{midiName(60 + oct * 12).replace(/\d/, '')}{4 + oct}〜</span>
          <button className="vt-chip" onClick={() => setOct(o => Math.min(2, o + 1))}>オクターブ ↑</button>
          <button className="vt-chip" onClick={() => insert('休' + lenSuffix)}>休符</button>
          <button className="vt-chip" onClick={() => insert('|')}>小節線</button>
          <button className="vt-chip" onClick={backspace}>⌫ 1つ消す</button>
        </div>
        <div className="sp-kbd">
          {KEYS.map(k => (
            <button key={k} className={`sp-key ${BLACK.has(k) ? 'black' : 'white'}`}
              onClick={() => insert(octMark + PC_JP[k] + lenSuffix)}>
              {PC_JP[k]}
            </button>
          ))}
          <button className="sp-key white" onClick={() => insert('↑'.repeat(Math.max(0, oct + 1)) + '↓'.repeat(Math.max(0, -(oct + 1))) + 'ド' + lenSuffix)}>ド↑</button>
        </div>
      </div>

      <div className="vt-sub-title">歌詞（任意）</div>
      <textarea className="sp-textarea" rows={2} value={lyrics} onChange={e => setLyrics(e.target.value)}
        placeholder="ひらがなで入力すると1文字＝1音で割り当てます（スペース区切りなら1区切り＝1音）" />

      <div className={`sp-parse ${parsed.errors.length ? 'bad' : ''}`}>
        {parsed.notes.length}音 ・ {Math.ceil(parsed.totalBeats / bpb)}小節
        {lo !== null && hi !== null && <> ・ 音域 {midiName(lo)}〜{midiName(hi)}</>}
        {lyrics.trim() && <> ・ 歌詞 {syl}/{parsed.notes.length}音</>}
        {parsed.errors.length > 0 && <> ・ ⚠ 読めない記号: {parsed.errors.slice(0, 5).join(' ')}</>}
      </div>

      <div className="vt-routine-nav">
        <button className="kp-start-btn" disabled={!parsed.notes.length}
          onClick={() => onSave({ ...initial, title: title.trim() || '無題の曲', bpm, beatsPerBar: bpb, text, lyrics })}>
          保存して練習 ▶
        </button>
        {sp.phase === 'idle'
          ? <button className="kp-stop-btn vt-ghost" disabled={!parsed.notes.length}
              onClick={() => sp.start({ notes: timeNotes(parsed.notes, 60 / bpm, bpb, 0, 9999), beatSec: 60 / bpm, beatsPerBar: bpb, guide: true, listenOnly: true })}>
              🔊 試しに聴く
            </button>
          : <button className="kp-stop-btn" onClick={sp.stop}>■ 停止</button>}
        <button className="vt-routine-quit" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  )
}

// ─── Timing ──────────────────────────────────────────────────────────────────

/** Notes in bars [fromBar, toBar) → seconds from the section start. */
function timeNotes(notes: SongNote[], beatSec: number, bpb: number, fromBar: number, toBar: number, transpose = 0): TimedNote[] {
  const b0 = fromBar * bpb, b1 = toBar * bpb
  return notes
    .map((n, idx) => ({ n, idx }))
    .filter(({ n }) => n.start >= b0 - 1e-6 && n.start < b1 - 1e-6)
    .map(({ n, idx }) => ({
      idx,
      midi: n.midi + transpose,
      start: (n.start - b0) * beatSec,
      end: (Math.min(n.start + n.len, b1) - b0) * beatSec,
      lyric: n.lyric,
      bar: Math.floor(n.start / bpb + 1e-6),
    }))
}

// ─── Practice ────────────────────────────────────────────────────────────────

const SPEEDS = [0.5, 0.75, 0.9, 1]

function PracticeView({ song, range, onBack, onEdit }: {
  song: Song; range: VoiceRange; onBack: () => void; onEdit: () => void
}) {
  const parsed = useMemo(() => parseMelody(song.text, song.lyrics), [song])
  const notes = parsed.notes
  const bars = Math.max(1, Math.ceil(parsed.totalBeats / song.beatsPerBar))
  const [fromBar, setFromBar] = useState(0)
  const [toBar, setToBar] = useState(bars)
  const [speed, setSpeed] = useState(1)
  const [transpose, setTranspose] = useState(() => {
    const t = autoTranspose(notes, range)
    // keep the original key when it already fits
    const lo = Math.min(...notes.map(n => n.midi)), hi = Math.max(...notes.map(n => n.midi))
    return lo >= range.lo && hi <= range.hi ? 0 : t
  })
  const [guide, setGuide] = useState(() => {
    try { return localStorage.getItem('vtEarphones') === '1' } catch { return false }
  })
  const sp = useSongPractice()
  const running = sp.phase === 'countin' || sp.phase === 'sing' || sp.phase === 'listen'
  const beatSec = 60 / (song.bpm * speed)
  const section = useMemo(() => timeNotes(notes, beatSec, song.beatsPerBar, fromBar, toBar, transpose),
    [notes, beatSec, song.beatsPerBar, fromBar, toBar, transpose])
  const autoT = autoTranspose(notes, range)

  const sing = () => sp.start({ notes: section, beatSec, beatsPerBar: song.beatsPerBar, guide })
  const listen = () => sp.start({ notes: section, beatSec, beatsPerBar: song.beatsPerBar, guide: true, listenOnly: true })

  // Record the score once per finished take (remembering the previous score for this section)
  const [prevScore, setPrevScore] = useState<number | null>(null)
  const recorded = useRef<SongResult | null>(null)
  useEffect(() => {
    if (!sp.result || recorded.current === sp.result) return
    recorded.current = sp.result
    const prev = loadSongs().find(x => x.id === song.id)?.history?.find(h => h.from === fromBar && h.to === toBar)
    setPrevScore(prev ? prev.score : null)
    recordSongScore(song.id, sp.result.score, fromBar, toBar)
  }, [sp.result, song.id, fromBar, toBar])

  const secLo = section.length ? Math.min(...section.map(n => n.midi)) : 0
  const secHi = section.length ? Math.max(...section.map(n => n.midi)) : 0
  const barOpts = Array.from({ length: bars }, (_, i) => i)

  return (
    <div className="vt-panel">
      <div className="sp-head">
        <button className="vt-routine-quit" onClick={onBack} disabled={running}>← 曲リスト</button>
        <span className="sp-title">{song.title}</span>
        {!song.sample && <button className="vt-chip" onClick={onEdit} disabled={running}>✏️ 編集</button>}
      </div>

      <div className="kp-settings">
        <label className="kp-setting"><span>区間（小節）</span>
          <span className="sp-range">
            <select value={fromBar} disabled={running} onChange={e => { const v = Number(e.target.value); setFromBar(v); if (toBar <= v) setToBar(v + 1) }}>
              {barOpts.map(b => <option key={b} value={b}>{b + 1}</option>)}
            </select>
            〜
            <select value={toBar - 1} disabled={running} onChange={e => { const v = Number(e.target.value) + 1; setToBar(v); if (fromBar >= v) setFromBar(v - 1) }}>
              {barOpts.map(b => <option key={b} value={b}>{b + 1}</option>)}
            </select>
          </span>
        </label>
        <label className="kp-setting"><span>テンポ</span>
          <select value={speed} disabled={running} onChange={e => setSpeed(Number(e.target.value))}>
            {SPEEDS.map(s => <option key={s} value={s}>{s === 1 ? '原曲' : `${Math.round(s * 100)}%`}（{Math.round(song.bpm * s)}）</option>)}
          </select>
        </label>
        <label className="kp-setting"><span>キー {transpose > 0 ? `+${transpose}` : transpose}</span>
          <span className="sp-range">
            <button className="vt-chip" disabled={running} onClick={() => setTranspose(t => t - 1)}>♭</button>
            <button className="vt-chip" disabled={running} onClick={() => setTranspose(t => t + 1)}>♯</button>
            <button className={`vt-chip ${transpose === autoT ? 'selected' : ''}`} disabled={running} onClick={() => setTranspose(autoT)}>音域に合わせる</button>
            <button className={`vt-chip ${transpose === 0 ? 'selected' : ''}`} disabled={running} onClick={() => setTranspose(0)}>原曲キー</button>
          </span>
        </label>
        <label className="kp-setting"><span>ガイドメロディ</span>
          <select value={guide ? '1' : '0'} disabled={running} onChange={e => setGuide(e.target.value === '1')}>
            <option value="0">なし（最初の音だけ）</option>
            <option value="1">あり（イヤホン推奨）</option>
          </select>
        </label>
      </div>
      <div className="vt-legend">
        この区間の音域 {section.length ? `${midiName(secLo)}〜${midiName(secHi)}` : '-'} ／ あなたの音域 {midiName(range.lo)}〜{midiName(range.hi)}
        {section.length > 0 && (secHi > range.hi ? ' ・ ⚠ 高すぎる音があります' : secLo < range.lo ? ' ・ ⚠ 低すぎる音があります' : ' ・ ✓ 音域内')}
        　※ オクターブ違いで歌っても正解になります
      </div>

      <div className="vt-routine-nav">
        {!running ? (
          <>
            <button className="kp-start-btn" disabled={!section.length} onClick={sing}>
              🎤 {sp.phase === 'complete' ? 'もう一度歌う' : '歌う'}
            </button>
            <button className="kp-stop-btn vt-ghost" disabled={!section.length} onClick={listen}>🔊 お手本を聴く</button>
          </>
        ) : (
          <button className="kp-stop-btn" onClick={sp.stop}>■ 停止</button>
        )}
      </div>
      {sp.error && <div className="kp-error">⚠ {sp.error}</div>}
      {running && (
        <div className="vt-status">
          <span className="vt-status-phase">
            {sp.phase === 'countin' ? '♩ カウント…（最初の音を聴いて）' : sp.phase === 'listen' ? '🔊 お手本' : '🎤 歌って！'}
          </span>
          <span className="vt-status-key">{fromBar + 1}〜{toBar}小節</span>
        </div>
      )}

      <ScrollCanvas liveRef={sp.liveRef} active={running} placeholder={section} />

      {sp.result && sp.phase === 'complete' && (
        <SongResults result={sp.result} section={section} prevScore={prevScore}
          onPractice={(a, b) => { setFromBar(a); setToBar(b) }} />
      )}
    </div>
  )
}

// ─── Scrolling piano roll ────────────────────────────────────────────────────

const WINDOW_SEC = 6
const PLAYHEAD = 0.28

function ScrollCanvas({ liveRef, active, placeholder }: {
  liveRef: MutableRefObject<SongLive>; active: boolean; placeholder: TimedNote[]
}) {
  const ref = useAnimatedCanvas((g, w, h) => {
    const live = liveRef.current
    const hasTake = live.notes.length > 0
    const notes = hasTake ? live.notes : placeholder
    if (!notes.length) return
    const now = active && live.ctx ? live.ctx.currentTime - live.origin
      : hasTake ? Math.min(live.length, notes[0].start) : notes[0].start - 0.5
    const lo = Math.min(...notes.map(n => n.midi)) - 2
    const hi = Math.max(...notes.map(n => n.midi)) + 2
    const lyricH = 18
    const y = (m: number) => (h - lyricH - 6) - ((m - lo) / (hi - lo)) * (h - lyricH - 14)
    const pxs = w / WINDOW_SEC
    const x = (t: number) => w * PLAYHEAD + (t - now) * pxs

    // grid
    for (let m = Math.ceil(lo); m <= hi; m++) {
      const isC = ((m % 12) + 12) % 12 === 0
      g.strokeStyle = isC ? '#334155' : '#151d2e'
      g.beginPath(); g.moveTo(0, y(m)); g.lineTo(w, y(m)); g.stroke()
      if (isC) { g.fillStyle = '#475569'; g.font = '9px sans-serif'; g.textAlign = 'left'; g.fillText(midiName(m), 2, y(m) - 2) }
    }

    // notes
    const bh = Math.max(6, Math.abs(y(0) - y(1)))
    const t0 = now - PLAYHEAD * WINDOW_SEC - 0.5, t1 = now + (1 - PLAYHEAD) * WINDOW_SEC + 0.5
    for (const n of notes) {
      if (n.end < t0 || n.start > t1) continue
      const sc = live.scores.get(n.idx)
      const playing = now >= n.start && now < n.end
      g.fillStyle = sc !== undefined ? scoreColor(sc) + 'aa' : playing ? 'rgba(0,229,255,.7)' : 'rgba(0,229,255,.28)'
      g.beginPath(); g.roundRect(x(n.start) + 1, y(n.midi) - bh / 2, Math.max(3, x(n.end) - x(n.start) - 2), bh, 3); g.fill()
      g.fillStyle = playing ? '#ffffff' : '#94a3b8'
      g.font = playing ? 'bold 13px sans-serif' : '12px sans-serif'; g.textAlign = 'left'
      g.fillText(n.lyric ?? noteLabel(n.midi), x(n.start) + 2, h - 6)
    }

    // voice trace (folded to the octave of the nearest note)
    const near = (t: number) => notes.find(n => t >= n.start && t < n.end) ??
      notes.reduce((a, b) => Math.abs(b.start - t) < Math.abs(a.start - t) ? b : a)
    g.lineWidth = 2.5; g.lineCap = 'round'
    let prev: [number, number] | null = null
    for (const f of live.frames) {
      if (f.t < t0 || f.t > now + 0.1) { if (f.t > now + 0.1) break; continue }
      if (f.midi === null) { prev = null; continue }
      const tg = near(f.t - 0.06).midi
      let m = f.midi
      while (m - tg > 6) m -= 12
      while (tg - m > 6) m += 12
      const dev = Math.abs(m - tg) * 100
      const p: [number, number] = [x(f.t), y(m)]
      g.strokeStyle = dev <= 30 ? '#4ade80' : dev <= 60 ? '#facc15' : '#f87171'
      if (prev && p[0] - prev[0] < 14) { g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke() }
      prev = p
    }

    // playhead
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1
    g.beginPath(); g.moveTo(w * PLAYHEAD, 0); g.lineTo(w * PLAYHEAD, h - lyricH); g.stroke()
    if (active) drawMeter(g, w, live.meter)
  }, 240)
  return <canvas ref={ref} className="vt-canvas" style={{ height: 240 }} />
}

// ─── Results ─────────────────────────────────────────────────────────────────

function SongResults({ result, section, prevScore, onPractice }: {
  result: SongResult; section: TimedNote[]; prevScore: number | null
  onPractice: (fromBar: number, toBar: number) => void
}) {
  const weak = [...result.bars].filter(b => b.score < 85).sort((a, b) => a.score - b.score).slice(0, 3)
  const tips: string[] = []
  if (result.avgCents !== null && result.avgCents < -15) tips.push(`全体的に ${result.avgCents}¢ 低め（フラット）です。音を下からずり上げず、上から当てるイメージで。`)
  if (result.avgCents !== null && result.avgCents > 15) tips.push(`全体的に +${result.avgCents}¢ 高め（シャープ）です。力みすぎに注意。`)
  if (result.highCents !== null && result.highCents < -25 && result.highCents - (result.avgCents ?? 0) < -15) tips.push(`高い音が平均 ${result.highCents}¢ 届いていません。高音の手前で息をしっかり準備し、喉を上げないように。キーを下げて練習するのも有効です。`)
  if (result.avgAttackMs !== null && result.avgAttackMs > 160) tips.push(`音の出だしが平均 ${result.avgAttackMs}ms 遅れています。リズムに対して「置きにいく」感じで、拍の頭で声を出しましょう。テンポを落として練習するのもおすすめ。`)
  const missed = result.notes.filter(n => n.score < 15).length
  if (missed > result.notes.length * 0.25) tips.push('声が拾えていない音が多めです。マイクに近づくか、感度を「高」にしてください。')
  if (!tips.length) tips.push('音程もリズムも安定しています！区間を広げたり、テンポを原曲に近づけたりしてみましょう。')


  return (
    <div className="vt-results">
      <div className="vt-score-head">
        <span className="vt-score-big" style={{ color: scoreColor(result.score) }}>{result.score}</span>
        <span className="vt-score-unit">点</span>
        <span className="vt-grade" style={{ color: scoreColor(result.score), borderColor: scoreColor(result.score) }}>{gradeOf(result.score)}</span>
        {prevScore !== null && (
          <span className="vt-routine-diff" style={{ color: result.score >= prevScore ? '#4ade80' : '#f87171' }}>
            前回 {prevScore} → {result.score >= prevScore ? '+' : ''}{result.score - prevScore}
          </span>
        )}
      </div>

      <div className="vt-sub-title">小節ごとの点数（タップでその小節を練習）</div>
      <div className="vt-keybars">
        {result.bars.map(b => (
          <button key={b.bar} className="vt-keybar sp-barbtn" onClick={() => onPractice(b.bar, b.bar + 1)}>
            <div className="vt-keybar-track"><div className="vt-keybar-fill" style={{ height: `${Math.max(3, b.score)}%`, background: scoreColor(b.score) }} /></div>
            <span className="vt-keybar-val">{b.score}</span>
            <span className="vt-keybar-lbl">{b.bar + 1}</span>
          </button>
        ))}
      </div>

      {weak.length > 0 && (
        <>
          <div className="vt-sub-title">苦手なところ</div>
          <div className="sp-weak">
            {weak.map(b => {
              const ns = section.filter(n => n.bar === b.bar)
              const words = ns.map(n => n.lyric ?? noteLabel(n.midi)).join(ns.some(n => n.lyric) ? '' : ' ')
              return (
                <div key={b.bar} className="sp-weak-item">
                  <span className="sp-weak-bar">{b.bar + 1}小節目</span>
                  <span className="sp-weak-words">{words}</span>
                  <span style={{ color: scoreColor(b.score), fontWeight: 700 }}>{b.score}点</span>
                  <button className="vt-chip selected" onClick={() => onPractice(Math.max(0, b.bar), b.bar + 1)}>ここを練習</button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <ul className="vt-tips">{tips.map((t, i) => <li key={i}>💡 {t}</li>)}</ul>
    </div>
  )
}

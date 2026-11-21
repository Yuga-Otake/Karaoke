import { useState, useEffect, useRef, useMemo, MutableRefObject } from 'react'
import { useWarmup, WarmupLive, WarmupMode, RepResult, WarmupState } from '../hooks/useWarmup'
import { useLongTone, LongToneLive, LongToneResult } from '../hooks/useLongTone'
import {
  PATTERNS, ExercisePattern, patternSpan, stepLabel, midiName,
  VoiceRange, RANGE_PRESETS, loadRange, saveRange, loadRangeCheckResult, buildRoots,
  loadLog, clearLog, PracticeEntry, dayKey, streakDays,
} from '../utils/vocalExercises'
import { gradeOf } from '../utils/scoring'

type Sub = 'menu' | 'warmup' | 'longtone'

const GRADE_COLOR: Record<string, string> = {
  S: '#fbbf24', A: '#4ade80', B: '#00e5ff', C: '#facc15', D: '#f97316', F: '#f87171',
}
const scoreColor = (s: number) => GRADE_COLOR[gradeOf(s)]

// ─── Canvas helper ───────────────────────────────────────────────────────────

function useAnimatedCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, height: number) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const c = ref.current
      if (c) {
        const dpr = window.devicePixelRatio || 1
        const w = c.clientWidth
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(height * dpr)) {
          c.width = Math.round(w * dpr)
          c.height = Math.round(height * dpr)
        }
        const g = c.getContext('2d')
        if (g) {
          g.setTransform(dpr, 0, 0, dpr, 0, 0)
          g.clearRect(0, 0, w, height)
          drawRef.current(g, w, height)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [height])
  return ref
}

// ─── Range settings ──────────────────────────────────────────────────────────

const MIDI_OPTIONS = Array.from({ length: 49 }, (_, i) => 36 + i)  // C2–C6

function RangeSettings({ range, onChange, disabled }: {
  range: VoiceRange; onChange: (r: VoiceRange) => void; disabled?: boolean
}) {
  const fromCheck = loadRangeCheckResult()
  return (
    <div className="vt-range">
      <span className="vt-range-title">練習する音域</span>
      <select value={range.lo} disabled={disabled}
        onChange={e => onChange({ lo: Number(e.target.value), hi: Math.max(range.hi, Number(e.target.value) + 5) })}>
        {MIDI_OPTIONS.map(m => <option key={m} value={m}>{midiName(m)}</option>)}
      </select>
      <span className="vt-range-sep">〜</span>
      <select value={range.hi} disabled={disabled}
        onChange={e => onChange({ hi: Number(e.target.value), lo: Math.min(range.lo, Number(e.target.value) - 5) })}>
        {MIDI_OPTIONS.map(m => <option key={m} value={m}>{midiName(m)}</option>)}
      </select>
      <div className="vt-range-presets">
        {RANGE_PRESETS.map(p => (
          <button key={p.id} className="vt-chip" disabled={disabled} onClick={() => onChange(p.range)}>{p.label}</button>
        ))}
        {fromCheck && (
          <button className="vt-chip accent" disabled={disabled} onClick={() => onChange(fromCheck)}>
            🎵 音域チェック結果
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Warm-up (scale drill) ───────────────────────────────────────────────────

function WarmupCanvas({ liveRef, active }: { liveRef: MutableRefObject<WarmupLive>; active: boolean }) {
  const ref = useAnimatedCanvas((g, w, h) => {
    const { targets, frames, origin, repLength, ctx } = liveRef.current
    if (targets.length === 0) {
      g.fillStyle = '#475569'; g.font = '13px sans-serif'; g.textAlign = 'center'
      g.fillText('▶ スタートを押すと、ここにお手本と自分の声が表示されます', w / 2, h / 2)
      return
    }
    const mids = targets.map(t => t.midi)
    const lo = Math.min(...mids) - 3, hi = Math.max(...mids) + 3
    const padL = 34
    const x = (t: number) => padL + (t / repLength) * (w - padL - 6)
    const y = (m: number) => h - 8 - ((m - lo) / (hi - lo)) * (h - 16)

    // Semitone grid
    for (let m = Math.ceil(lo); m <= hi; m++) {
      const isC = ((m % 12) + 12) % 12 === 0
      g.strokeStyle = isC ? '#334155' : '#1a2234'
      g.lineWidth = 1
      g.beginPath(); g.moveTo(padL, y(m)); g.lineTo(w, y(m)); g.stroke()
      if (mids.includes(m) || isC) {
        g.fillStyle = '#64748b'; g.font = '10px sans-serif'; g.textAlign = 'right'
        g.fillText(midiName(m), padL - 4, y(m) + 3)
      }
    }

    const now = ctx && active ? ctx.currentTime - origin : repLength

    // Target bars (±50¢ tall)
    const bh = Math.abs(y(0) - y(1))
    for (const t of targets) {
      const playing = now >= t.start && now < t.end
      g.fillStyle = t.sing
        ? (playing ? 'rgba(0,229,255,.55)' : 'rgba(0,229,255,.22)')
        : (playing ? 'rgba(168,85,247,.55)' : 'rgba(168,85,247,.18)')
      g.beginPath()
      g.roundRect(x(t.start) + 1, y(t.midi) - bh / 2, x(t.end) - x(t.start) - 2, bh, 4)
      g.fill()
      g.fillStyle = t.sing ? '#cffafe' : '#e9d5ff'
      g.font = 'bold 11px sans-serif'; g.textAlign = 'left'
      g.fillText(stepLabel(t.step), x(t.start) + 4, y(t.midi) - bh / 2 - 3)
    }

    // Voice trace — folded to the octave of the target for readability
    const singTargets = targets.filter(t => t.sing)
    const nearest = (t: number) =>
      singTargets.find(s => t >= s.start && t < s.end) ??
      singTargets.reduce((a, b) => Math.abs(b.start - t) < Math.abs(a.start - t) ? b : a)
    g.lineWidth = 2.5
    g.lineCap = 'round'
    let prev: { px: number; py: number } | null = null
    for (const f of frames) {
      if (f.midi === null) { prev = null; continue }
      const tg = nearest(f.t)
      let m = f.midi
      while (m - tg.midi > 6) m -= 12
      while (tg.midi - m > 6) m += 12
      const dev = Math.abs(m - tg.midi) * 100
      const px = x(f.t), py = y(m)
      g.strokeStyle = dev <= 30 ? '#4ade80' : dev <= 60 ? '#facc15' : '#f87171'
      if (prev && px - prev.px < 12) {
        g.beginPath(); g.moveTo(prev.px, prev.py); g.lineTo(px, py); g.stroke()
      } else {
        g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(px, py, 1.5, 0, Math.PI * 2); g.fill()
      }
      prev = { px, py }
    }

    // Playhead
    if (active && now < repLength) {
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1
      g.beginPath(); g.moveTo(x(now), 0); g.lineTo(x(now), h); g.stroke()
    }
  }, 220)
  return <canvas ref={ref} className="vt-canvas" style={{ height: 220 }} />
}

const PHASE_LABEL: Record<string, string> = {
  cue: '♪ キーを確認…',
  listen: '👂 お手本を聴いて',
  sing: '🎤 歌って！',
}

function warmupTips(reps: RepResult[], pattern: ExercisePattern): string[] {
  const tips: string[] = []
  if (reps.length === 0) return tips
  const all = reps.flatMap(r => r.notes).filter(n => n.cents !== null)
  const avg = all.length ? all.reduce((a, n) => a + (n.cents as number), 0) / all.length : 0
  if (avg < -15) tips.push('全体的にフラット（低め）の傾向です。息の支えを保ち、音を「上から捉える」イメージで。')
  else if (avg > 15) tips.push('全体的にシャープ（高め）の傾向です。力みすぎていないか、肩・首をリラックス。')
  else tips.push('音程の偏りは少なめです。この調子！')

  // Where does accuracy drop?
  const sorted = [...reps].sort((a, b) => a.root - b.root)
  const best = Math.max(...sorted.map(r => r.score))
  const weak = sorted.find(r => r.root > sorted[0].root && r.score < best - 20)
  if (weak && best >= 50) {
    tips.push(`キー ${midiName(weak.root)}（最高音 ${midiName(weak.root + patternSpan(pattern))}）あたりから精度が下がります。換声点の可能性があるので、そこを重点的に、小さめの声で繰り返しましょう。`)
  }

  // Top-note tendency
  const span = patternSpan(pattern)
  const tops = reps.flatMap(r => r.notes.filter(n => n.step === span && n.cents !== null))
  if (tops.length >= 2) {
    const tAvg = tops.reduce((a, n) => a + (n.cents as number), 0) / tops.length
    if (tAvg < -20) tips.push(`いちばん上の音（${stepLabel(span)}）が平均 ${Math.round(tAvg)}¢ 届いていません。跳躍の前に息を準備し、喉を上げずに頭の後ろへ響かせて。`)
  }

  const missed = reps.flatMap(r => r.notes).filter(n => n.score < 20).length
  if (missed > reps.length) tips.push('声が検出されない音が多めです。マイクに近づくか、もう少し声量を。')
  return tips
}

function WarmupResults({ state, pattern }: { state: WarmupState; pattern: ExercisePattern }) {
  const { reps } = state
  const done = state.phase === 'complete'
  const steps = pattern.steps

  // Average signed cents per position in the pattern
  const perStep = steps.map((s, i) => {
    const cs = reps.map(r => r.notes[i]?.cents).filter((c): c is number => c !== null && c !== undefined)
    return { step: s, cents: cs.length ? Math.round(cs.reduce((a, c) => a + c, 0) / cs.length) : null }
  })

  return (
    <div className="vt-results">
      {done && (
        <div className="vt-score-head">
          <span className="vt-score-big" style={{ color: scoreColor(state.sessionScore) }}>{state.sessionScore}</span>
          <span className="vt-score-unit">点</span>
          <span className="vt-grade" style={{ color: scoreColor(state.sessionScore), borderColor: scoreColor(state.sessionScore) }}>
            {gradeOf(state.sessionScore)}
          </span>
        </div>
      )}

      <div className="vt-sub-title">キーごとの精度</div>
      <div className="vt-keybars">
        {reps.map((r, i) => (
          <div key={i} className="vt-keybar" title={`${midiName(r.root)}: ${r.score}点 / ${r.avgCents ?? '-'}¢`}>
            <div className="vt-keybar-track">
              <div className="vt-keybar-fill" style={{ height: `${Math.max(3, r.score)}%`, background: scoreColor(r.score) }} />
            </div>
            <span className="vt-keybar-val">{r.score}</span>
            <span className="vt-keybar-lbl">{midiName(r.root)}</span>
          </div>
        ))}
      </div>

      {reps.length > 0 && (
        <>
          <div className="vt-sub-title">音ごとのクセ（平均のずれ）</div>
          <div className="vt-steps">
            {perStep.map((p, i) => {
              const c = p.cents
              const color = c === null ? '#475569' : Math.abs(c) <= 15 ? '#4ade80' : Math.abs(c) <= 35 ? '#facc15' : '#f87171'
              const off = c === null ? 0 : Math.max(-50, Math.min(50, c))
              return (
                <div key={i} className="vt-step">
                  <div className="vt-step-track">
                    <div className="vt-step-mid" />
                    <div className="vt-step-dot" style={{ bottom: `calc(${50 + off}% - 5px)`, background: color }} />
                  </div>
                  <span className="vt-step-val" style={{ color }}>{c === null ? '–' : `${c > 0 ? '+' : ''}${c}`}</span>
                  <span className="vt-step-lbl">{stepLabel(p.step)}</span>
                </div>
              )
            })}
          </div>
          <div className="vt-legend">上 = 高すぎ / 下 = 低すぎ（単位: セント, ±50¢ = 半音の半分）</div>
        </>
      )}

      {done && (
        <ul className="vt-tips">
          {warmupTips(reps, pattern).map((t, i) => <li key={i}>💡 {t}</li>)}
        </ul>
      )}
    </div>
  )
}

function WarmupPanel({ range, setRange, initialPattern }: {
  range: VoiceRange; setRange: (r: VoiceRange) => void; initialPattern: string
}) {
  const { state, liveRef, start, stop } = useWarmup()
  const [patternId, setPatternId] = useState(initialPattern)
  const pattern = PATTERNS.find(p => p.id === patternId) ?? PATTERNS[1]
  const [bpm, setBpm] = useState(pattern.defaultBpm)
  const [mode, setMode] = useState<WarmupMode>('call')
  const [direction, setDirection] = useState<'up' | 'updown'>('updown')

  useEffect(() => setPatternId(initialPattern), [initialPattern])
  useEffect(() => setBpm(pattern.defaultBpm), [pattern.id])

  const roots = useMemo(() => buildRoots(range, patternSpan(pattern), direction), [range, pattern, direction])
  const running = state.phase !== 'idle' && state.phase !== 'complete'
  const tooNarrow = range.hi - range.lo < patternSpan(pattern)

  return (
    <div className="vt-panel">
      <div className="vt-patterns">
        {PATTERNS.map(p => (
          <button key={p.id} disabled={running}
            className={`vt-pattern ${p.id === pattern.id ? 'active' : ''}`}
            onClick={() => setPatternId(p.id)}>
            <span className="vt-pattern-name">{p.name}</span>
            <span className="vt-pattern-solfa">{p.solfa}</span>
          </button>
        ))}
      </div>
      <div className="vt-hint">💬 {pattern.hint}</div>

      <RangeSettings range={range} onChange={setRange} disabled={running} />

      <div className="kp-settings">
        <label className="kp-setting">
          <span>進め方</span>
          <select value={mode} disabled={running} onChange={e => setMode(e.target.value as WarmupMode)}>
            <option value="call">聴いてから歌う</option>
            <option value="together">一緒に歌う（イヤホン推奨）</option>
          </select>
        </label>
        <label className="kp-setting">
          <span>移調</span>
          <select value={direction} disabled={running} onChange={e => setDirection(e.target.value as 'up' | 'updown')}>
            <option value="updown">上がって戻る</option>
            <option value="up">上がるだけ</option>
          </select>
        </label>
        <label className="kp-setting">
          <span>テンポ {bpm} BPM</span>
          <input type="range" min={60} max={160} step={4} value={bpm} disabled={running}
            onChange={e => setBpm(Number(e.target.value))} />
        </label>
        <div className="vt-plan">
          {midiName(roots[0])} → {midiName(Math.max(...roots))} キー / {roots.length} 回
        </div>
        {!running
          ? <button className="kp-start-btn" disabled={tooNarrow} onClick={() => start(pattern, roots, bpm, mode)}>
              {state.phase === 'complete' ? '↺ もう一度' : '▶ スタート'}
            </button>
          : <button className="kp-stop-btn" onClick={stop}>■ 停止</button>}
      </div>
      {tooNarrow && <div className="kp-error">音域がこのパターンには狭すぎます。音域を広げてください。</div>}
      {state.error && <div className="kp-error">⚠ {state.error}</div>}

      {running && (
        <div className="vt-status">
          <span className="vt-status-phase">{PHASE_LABEL[state.phase] ?? ''}</span>
          <span className="vt-status-key">キー {state.root !== null ? midiName(state.root) : ''}</span>
          <span className="vt-status-count">{state.repIdx + 1} / {state.totalReps}</span>
        </div>
      )}
      <WarmupCanvas liveRef={liveRef} active={running} />
      <div className="vt-legend">
        <span style={{ color: '#c084fc' }}>■</span> お手本 &nbsp;
        <span style={{ color: '#00e5ff' }}>■</span> 歌うところ &nbsp;
        <span style={{ color: '#4ade80' }}>━</span> あなたの声（緑=ぴったり / 黄=少しずれ / 赤=ずれ）
      </div>

      {(state.reps.length > 0) && <WarmupResults state={state} pattern={pattern} />}
    </div>
  )
}

// ─── Long tone ───────────────────────────────────────────────────────────────

function LongToneCanvas({ liveRef, active }: { liveRef: MutableRefObject<LongToneLive>; active: boolean }) {
  const ref = useAnimatedCanvas((g, w, h) => {
    const { frames, singStart, ctx, targetSec } = liveRef.current
    const padL = 34
    const elapsed = active && ctx && singStart !== null ? ctx.currentTime - singStart
      : frames.length ? frames[frames.length - 1].t : 0
    const span = Math.max(targetSec, elapsed + 0.5)
    const x = (t: number) => padL + (t / span) * (w - padL - 6)
    const pitchH = h * 0.68
    const yc = (c: number) => pitchH / 2 - (Math.max(-100, Math.min(100, c)) / 100) * (pitchH / 2 - 6)
    const volTop = pitchH + 8
    const yd = (db: number) => h - 4 - ((Math.max(-60, Math.min(0, db)) + 60) / 60) * (h - volTop - 4)

    // Bands
    g.fillStyle = 'rgba(74,222,128,.08)'; g.fillRect(padL, yc(25), w - padL, yc(-25) - yc(25))
    g.fillStyle = 'rgba(74,222,128,.14)'; g.fillRect(padL, yc(10), w - padL, yc(-10) - yc(10))
    g.strokeStyle = '#334155'; g.lineWidth = 1
    g.beginPath(); g.moveTo(padL, yc(0)); g.lineTo(w, yc(0)); g.stroke()
    g.fillStyle = '#64748b'; g.font = '10px sans-serif'; g.textAlign = 'right'
    for (const c of [50, 0, -50]) g.fillText(`${c > 0 ? '+' : ''}${c}¢`, padL - 4, yc(c) + 3)
    g.fillText('音量', padL - 4, volTop + 12)
    g.strokeStyle = '#1e293b'; g.beginPath(); g.moveTo(padL, volTop); g.lineTo(w, volTop); g.stroke()

    // Target line
    g.strokeStyle = 'rgba(250,204,21,.6)'; g.setLineDash([4, 4])
    g.beginPath(); g.moveTo(x(targetSec), 0); g.lineTo(x(targetSec), h); g.stroke()
    g.setLineDash([])
    g.fillStyle = '#facc15'; g.textAlign = 'left'
    g.fillText(`目標 ${targetSec}秒`, Math.min(x(targetSec) + 3, w - 56), 12)

    // Volume
    g.strokeStyle = 'rgba(168,85,247,.8)'; g.lineWidth = 1.5
    g.beginPath()
    frames.forEach((f, i) => i === 0 ? g.moveTo(x(f.t), yd(f.db)) : g.lineTo(x(f.t), yd(f.db)))
    g.stroke()

    // Pitch
    g.lineWidth = 2.5; g.lineCap = 'round'
    let prev: [number, number] | null = null
    for (const f of frames) {
      if (f.cents === null) { prev = null; continue }
      const p: [number, number] = [x(f.t), yc(f.cents)]
      const a = Math.abs(f.cents)
      g.strokeStyle = a <= 10 ? '#4ade80' : a <= 25 ? '#a3e635' : a <= 50 ? '#facc15' : '#f87171'
      if (prev) { g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke() }
      prev = p
    }

    if (!frames.length) {
      g.fillStyle = '#475569'; g.font = '13px sans-serif'; g.textAlign = 'center'
      g.fillText(active ? '基準音と同じ高さで、まっすぐ伸ばしてください' : '▶ スタートで基準音が鳴ります', w / 2, pitchH / 2 - 14)
    }
  }, 200)
  return <canvas ref={ref} className="vt-canvas" style={{ height: 200 }} />
}

function longToneTips(r: LongToneResult, targetSec: number): string[] {
  const tips: string[] = []
  if (r.duration < targetSec * 0.6) tips.push('息が早く尽きています。吸う量より「吐く量をコントロールする」ことを意識。お腹まわりで少しずつ吐きましょう。')
  if (r.avgCents < -15) tips.push(`平均 ${r.avgCents}¢ 低めです。音の出だしで下からずり上げていないか確認を。`)
  if (r.avgCents > 15) tips.push(`平均 +${r.avgCents}¢ 高めです。喉や舌に力が入っていないかチェック。`)
  if (r.pitchSd > 12) tips.push('音程が揺れています。息の流れを一定に保ち、口の形を変えないように。')
  if (r.volumeSd > 4) tips.push('音量が波打っています。クレッシェンドしないよう、同じ強さで吐き続ける練習を。')
  if (tips.length === 0) tips.push('とても安定したロングトーンです！目標秒数を伸ばしてみましょう。')
  return tips
}

function LongTonePanel({ range, setRange }: { range: VoiceRange; setRange: (r: VoiceRange) => void }) {
  const { state, liveRef, start, stop, finish } = useLongTone()
  const [midi, setMidi] = useState(() => Math.round((range.lo + range.hi) / 2) - 2)
  const [targetSec, setTargetSec] = useState(10)
  const running = state.phase !== 'idle' && state.phase !== 'complete'
  const r = state.result

  const best = useMemo(() => {
    const l = loadLog().filter(e => e.kind === 'longtone')
    return l.length ? Math.max(...l.map(e => Number(e.detail?.duration ?? 0))) : 0
  }, [state.phase])

  const notes = Array.from({ length: range.hi - range.lo + 1 }, (_, i) => range.lo + i)

  return (
    <div className="vt-panel">
      <div className="vt-hint">
        💬 腹式呼吸で、同じ高さ・同じ大きさのまま声をまっすぐ伸ばす練習です。
        「ア」や「ウ」で、喉の力を抜いて。ビブラートは揺れとして数えません。
      </div>
      <RangeSettings range={range} onChange={r2 => { setRange(r2); setMidi(Math.round((r2.lo + r2.hi) / 2) - 2) }} disabled={running} />
      <div className="kp-settings">
        <label className="kp-setting">
          <span>音の高さ</span>
          <select value={midi} disabled={running} onChange={e => setMidi(Number(e.target.value))}>
            {notes.map(m => <option key={m} value={m}>{midiName(m)}</option>)}
          </select>
        </label>
        <label className="kp-setting">
          <span>目標</span>
          <select value={targetSec} disabled={running} onChange={e => setTargetSec(Number(e.target.value))}>
            {[5, 10, 15, 20, 30].map(s => <option key={s} value={s}>{s} 秒</option>)}
          </select>
        </label>
        {best > 0 && <div className="vt-plan">自己ベスト {best} 秒</div>}
        {!running
          ? <button className="kp-start-btn" onClick={() => start(midi, targetSec)}>
              {state.phase === 'complete' ? '↺ もう一度' : '▶ スタート'}
            </button>
          : <>
              {state.phase === 'sing' && <button className="kp-start-btn retry" onClick={finish}>✓ 終了して採点</button>}
              <button className="kp-stop-btn" onClick={stop}>■ 中止</button>
            </>}
      </div>
      {state.error && <div className="kp-error">⚠ {state.error}</div>}
      {running && (
        <div className="vt-status">
          <span className="vt-status-phase">
            {state.phase === 'listen' ? '👂 基準音を聴いて…' : state.phase === 'ready' ? '🎤 どうぞ！' : '🎤 伸ばして…（声を止めると終了）'}
          </span>
          <span className="vt-status-key">{midiName(midi)}</span>
        </div>
      )}
      <LongToneCanvas liveRef={liveRef} active={running} />
      <div className="vt-legend">
        <span style={{ color: '#4ade80' }}>━</span> 音程のずれ（緑の帯 = ±10¢ / ±25¢） &nbsp;
        <span style={{ color: '#c084fc' }}>━</span> 音量
      </div>

      {r && (
        <div className="vt-results">
          <div className="vt-score-head">
            <span className="vt-score-big" style={{ color: scoreColor(r.total) }}>{r.total}</span>
            <span className="vt-score-unit">点</span>
            <span className="vt-grade" style={{ color: scoreColor(r.total), borderColor: scoreColor(r.total) }}>{gradeOf(r.total)}</span>
            {r.duration >= best && r.duration > 0 && <span className="vt-best">🏆 自己ベスト！</span>}
          </div>
          <div className="vt-metrics">
            {[
              { k: '持続時間', v: `${r.duration} 秒`, s: r.scores.duration },
              { k: '音程の正確さ', v: `${r.avgCents > 0 ? '+' : ''}${r.avgCents}¢`, s: r.scores.pitch },
              { k: '音程の安定', v: `揺れ ${r.pitchSd}¢`, s: r.scores.stability },
              { k: '音量の安定', v: `揺れ ${r.volumeSd}dB`, s: r.scores.volume },
            ].map(m => (
              <div key={m.k} className="vt-metric">
                <span className="vt-metric-k">{m.k}</span>
                <div className="lp-bar-track"><div className="lp-bar-fill" style={{ width: `${m.s}%`, background: scoreColor(m.s) }} /></div>
                <span className="vt-metric-v">{m.v}</span>
              </div>
            ))}
          </div>
          <ul className="vt-tips">
            {longToneTips(r, targetSec).map((t, i) => <li key={i}>💡 {t}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Menu & progress ─────────────────────────────────────────────────────────

const DAILY_MENU: { id: string; sub: Sub; pattern?: string; label: string; desc: string }[] = [
  { id: 'longtone', sub: 'longtone', label: 'ロングトーン', desc: '息の支えを作る（1〜2回）' },
  { id: 'three',    sub: 'warmup', pattern: 'three',    label: '3トーン',    desc: 'ハミングで軽く声を起こす' },
  { id: 'five',     sub: 'warmup', pattern: 'five',     label: '5トーン',    desc: 'リップロール →「マ」で' },
  { id: 'arpeggio', sub: 'warmup', pattern: 'arpeggio', label: 'アルペジオ', desc: '音の跳躍と響きの位置' },
  { id: 'octave',   sub: 'warmup', pattern: 'octave',   label: 'オクターブ跳躍', desc: '換声点をなめらかに' },
]

const EXERCISE_NAME: Record<string, string> = {
  longtone: 'ロングトーン',
  ...Object.fromEntries(PATTERNS.map(p => [p.id, p.name])),
}

function MenuPanel({ onGo }: { onGo: (sub: Sub, pattern?: string) => void }) {
  const [log, setLog] = useState<PracticeEntry[]>(() => loadLog())
  const today = dayKey(new Date())
  const todays = log.filter(e => dayKey(new Date(e.date)) === today)
  const doneToday = new Set(todays.map(e => e.exercise))
  const streak = streakDays(log)
  const todayMin = Math.ceil(todays.reduce((a, e) => a + e.seconds, 0) / 60)

  // Last 14 days of practice time
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i))
    const k = dayKey(d)
    const es = log.filter(e => dayKey(new Date(e.date)) === k)
    return { k, d, min: es.reduce((a, e) => a + e.seconds, 0) / 60, n: es.length }
  })
  const maxMin = Math.max(5, ...days.map(d => d.min))

  // Score trend per exercise: last 10 sessions
  const trends = Object.keys(EXERCISE_NAME).map(id => {
    const es = log.filter(e => e.exercise === id).slice(0, 10).reverse()
    return { id, es }
  }).filter(t => t.es.length > 0)

  return (
    <div className="vt-panel">
      <div className="vt-stats">
        <div className="vt-stat"><span className="vt-stat-v">🔥 {streak}</span><span className="vt-stat-k">連続日数</span></div>
        <div className="vt-stat"><span className="vt-stat-v">{todayMin}<small>分</small></span><span className="vt-stat-k">今日の練習</span></div>
        <div className="vt-stat"><span className="vt-stat-v">{doneToday.size}<small>/{DAILY_MENU.length}</small></span><span className="vt-stat-k">メニュー達成</span></div>
      </div>

      <div className="vt-sub-title">今日のメニュー（約10分）</div>
      <div className="vt-menu">
        {DAILY_MENU.map((m, i) => (
          <button key={m.id} className={`vt-menu-item ${doneToday.has(m.id) ? 'done' : ''}`} onClick={() => onGo(m.sub, m.pattern)}>
            <span className="vt-menu-num">{doneToday.has(m.id) ? '✓' : i + 1}</span>
            <span className="vt-menu-text">
              <span className="vt-menu-label">{m.label}</span>
              <span className="vt-menu-desc">{m.desc}</span>
            </span>
            <span className="vt-menu-go">▶</span>
          </button>
        ))}
      </div>

      <div className="vt-sub-title">直近14日の練習時間</div>
      <div className="vt-days">
        {days.map(d => (
          <div key={d.k} className="vt-day" title={`${d.k}: ${Math.round(d.min)}分 / ${d.n}回`}>
            <div className="vt-day-track">
              <div className="vt-day-fill" style={{ height: `${d.min > 0 ? Math.max(6, (d.min / maxMin) * 100) : 0}%` }} />
            </div>
            <span className={`vt-day-lbl ${d.k === today ? 'today' : ''}`}>{d.d.getDate()}</span>
          </div>
        ))}
      </div>

      {trends.length > 0 && (
        <>
          <div className="vt-sub-title">スコアの推移（直近10回）</div>
          <div className="vt-trends">
            {trends.map(t => (
              <div key={t.id} className="vt-trend">
                <span className="vt-trend-name">{EXERCISE_NAME[t.id]}</span>
                <div className="vt-trend-dots">
                  {t.es.map((e, i) => (
                    <span key={i} className="vt-trend-dot" title={`${new Date(e.date).toLocaleString()} : ${e.score}点`}
                      style={{ height: `${Math.max(8, e.score)}%`, background: scoreColor(e.score) }} />
                  ))}
                </div>
                <span className="vt-trend-last" style={{ color: scoreColor(t.es[t.es.length - 1].score) }}>
                  {t.es[t.es.length - 1].score}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {log.length === 0 && (
        <div className="vt-hint">まだ記録がありません。上のメニューを 1 から順にやってみましょう。結果はこのブラウザに保存されます。</div>
      )}
      {log.length > 0 && (
        <button className="clear-btn" onClick={() => {
          if (confirm('練習記録をすべて削除しますか？')) { clearLog(); setLog([]) }
        }}>記録をリセット</button>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function VoiceTraining() {
  const [sub, setSub] = useState<Sub>('menu')
  const [pattern, setPattern] = useState('five')
  const [range, setRangeState] = useState<VoiceRange>(() => loadRange())
  const setRange = (r: VoiceRange) => { setRangeState(r); saveRange(r) }

  return (
    <div className="voice-training">
      <div className="vt-subnav">
        {([['menu', '📋 メニュー・記録'], ['warmup', '🎼 スケール練習'], ['longtone', '〰 ロングトーン']] as const).map(([id, label]) => (
          <button key={id} className={`vt-subtab ${sub === id ? 'active' : ''}`} onClick={() => setSub(id)}>{label}</button>
        ))}
      </div>
      {sub === 'menu' && <MenuPanel onGo={(s, p) => { if (p) setPattern(p); setSub(s) }} />}
      {sub === 'warmup' && <WarmupPanel range={range} setRange={setRange} initialPattern={pattern} />}
      {sub === 'longtone' && <LongTonePanel range={range} setRange={setRange} />}
      <div className="vt-footnote">✱ 声がかすれる・喉が痛いときは無理をせず休みましょう。イヤホンを使うと検出精度が上がります。</div>
    </div>
  )
}

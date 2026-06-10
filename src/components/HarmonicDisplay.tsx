import { useRef } from 'react'
import { ResonanceData } from '../utils/resonanceAnalysis'

interface Props {
  resonanceData: ResonanceData | null
  frequency: number | null
}

const SCORE_ITEMS = [
  { key: 'resonanceScore',  label: '共鳴',   color: '#4ade80' },
  { key: 'clarityScore',    label: '明瞭度',  color: '#00e5ff' },
  { key: 'harmoniScore',    label: '倍音',   color: '#a855f7' },
  { key: 'brightnessScore', label: '輝き',   color: '#facc15' },
] as const

export function HarmonicDisplay({ resonanceData, frequency }: Props) {
  const lastRef = useRef<{ data: ResonanceData; freq: number } | null>(null)

  const isLive = !!(resonanceData && frequency && resonanceData.harmonics.length > 0)
  if (isLive) lastRef.current = { data: resonanceData!, freq: frequency! }

  const snapshot = lastRef.current

  if (!snapshot) {
    return (
      <div className="hd-empty">
        マイクに向かって声を出すと倍音・共鳴を分析します
      </div>
    )
  }

  const { data: rd } = snapshot
  const { harmonics, resonanceScore, harmoniScore, brightnessScore, clarityScore, spectralCentroid, totalHarmonics } = rd

  const noiseFloor = -80
  const maxDb = Math.max(...harmonics.map(h => h.db), noiseFloor + 1)

  const qualityLabel =
    resonanceScore >= 75 ? '★ 美しい共鳴' :
    resonanceScore >= 50 ? '◎ 良い響き' :
    resonanceScore >= 30 ? '△ もう少し' : '○ 練習中'

  const scoreColor =
    resonanceScore > 70 ? '#4ade80' :
    resonanceScore > 45 ? '#facc15' : '#f87171'

  const scores: Record<string, number> = {
    resonanceScore, clarityScore, harmoniScore, brightnessScore,
  }

  return (
    <div className="harmonic-display" style={!isLive ? { opacity: 0.55 } : {}}>

      {/* ── Harmonic bars ── */}
      <div className="hd-bars">
        {harmonics.slice(0, 10).map(h => {
          const norm   = Math.max(0, (h.db - noiseFloor) / (maxDb - noiseFloor))
          const isWeak = h.db < noiseFloor + 15
          const hue    = 240 - (h.number - 1) * 18
          const color  = isWeak ? '#1e293b' : `hsl(${hue}, 70%, 55%)`
          return (
            <div key={h.number} className="hd-bar-col">
              <div className="hd-bar-track">
                <div
                  className="hd-bar-fill"
                  style={{
                    height: `${Math.max(3, norm * 100)}%`,
                    background: color,
                    boxShadow: isWeak ? 'none' : `0 0 6px ${color}44`,
                  }}
                />
              </div>
              <div className="hd-bar-label">H{h.number}</div>
              <div className="hd-bar-hz">
                {h.frequency < 1000
                  ? `${Math.round(h.frequency)}`
                  : `${(h.frequency / 1000).toFixed(1)}k`}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Score bars ── */}
      <div className="hd-scores">
        {SCORE_ITEMS.map(({ key, label, color }) => {
          const val = Math.round(scores[key])
          return (
            <div key={key} className="hd-score-row">
              <span className="hd-score-label">{label}</span>
              <div className="hd-score-track">
                <div
                  className="hd-score-fill"
                  style={{ width: `${val}%`, background: color, boxShadow: `0 0 8px ${color}66` }}
                />
              </div>
              <span className="hd-score-num" style={{ color }}>{val}</span>
            </div>
          )
        })}
      </div>

      {/* ── Summary bar ── */}
      <div className="hd-summary">
        <div className="hd-summary-label">
          響きの美しさ
          <span style={{ color: scoreColor }}>&ensp;{qualityLabel}</span>
          {!isLive && <span style={{ color: 'var(--dim)', fontSize: '0.7rem', marginLeft: '0.5rem' }}>（無音）</span>}
        </div>
        <div className="hd-summary-track">
          <div
            className="hd-summary-fill"
            style={{
              width: `${resonanceScore}%`,
              background: `linear-gradient(to right, #7c3aed, ${scoreColor})`,
              boxShadow: `0 0 10px ${scoreColor}`,
            }}
          />
        </div>
        <div className="hd-summary-detail">
          倍音数: {totalHarmonics}&ensp;|&ensp;スペクトル重心: {Math.round(spectralCentroid)} Hz
        </div>
      </div>
    </div>
  )
}

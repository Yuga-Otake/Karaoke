import { ResonanceData } from '../utils/resonanceAnalysis'

interface Props {
  resonanceData: ResonanceData | null
  frequency: number | null
}

function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  // SVG arc gauge
  const r = 38
  const cx = 50
  const cy = 50
  const circumference = Math.PI * r  // half circle
  const arc = (value / 100) * circumference

  // Arc path: left semicircle = 180deg sweep
  const startX = cx - r
  const startY = cy
  const endX = cx + r
  const endY = cy

  return (
    <div className="score-gauge">
      <svg width="100" height="60" viewBox="0 0 100 60">
        {/* Background arc */}
        <path
          d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Value arc — dasharray trick for partial fill */}
        <path
          d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        <text x="50" y="48" textAnchor="middle" fill={color} fontSize="16" fontWeight="bold" fontFamily="monospace">
          {value}
        </text>
      </svg>
      <div className="gauge-label" style={{ color: '#94a3b8' }}>{label}</div>
    </div>
  )
}

export function HarmonicDisplay({ resonanceData, frequency }: Props) {
  if (!resonanceData || !frequency || resonanceData.harmonics.length === 0) {
    return (
      <div className="harmonic-display empty">
        <div className="empty-hint">マイクに向かって声を出すと倍音・共鳴を分析します</div>
      </div>
    )
  }

  const { harmonics, resonanceScore, harmoniScore, brightnessScore, clarityScore } = resonanceData

  // Normalize bar heights relative to max
  const maxDb = Math.max(...harmonics.map(h => h.db), -30)
  const noiseFloor = -80

  const scoreColor = resonanceScore > 70 ? '#4ade80' : resonanceScore > 45 ? '#facc15' : '#f87171'

  return (
    <div className="harmonic-display">
      {/* Harmonic bars */}
      <div className="harmonic-bars">
        {harmonics.slice(0, 10).map((h) => {
          const norm = Math.max(0, (h.db - noiseFloor) / (maxDb - noiseFloor))
          const isWeak = h.db < noiseFloor + 15
          const hue = 240 - (h.number - 1) * 18
          const barColor = isWeak ? '#1e293b' : `hsl(${hue}, 70%, 55%)`
          return (
            <div key={h.number} className="harmonic-col">
              <div className="harmonic-bar-wrap">
                <div
                  className="harmonic-bar"
                  style={{
                    height: `${Math.max(2, norm * 100)}%`,
                    background: barColor,
                    boxShadow: isWeak ? 'none' : `0 0 6px ${barColor}`,
                  }}
                />
              </div>
              <div className="harmonic-num">H{h.number}</div>
              <div className="harmonic-hz">{h.frequency < 1000
                ? `${Math.round(h.frequency)}`
                : `${(h.frequency / 1000).toFixed(1)}k`}
              </div>
            </div>
          )
        })}
      </div>

      {/* Score gauges */}
      <div className="score-gauges">
        <ScoreGauge value={resonanceScore} label="共鳴" color={scoreColor} />
        <ScoreGauge value={clarityScore} label="明瞭度" color="#00e5ff" />
        <ScoreGauge value={harmoniScore} label="倍音" color="#a855f7" />
        <ScoreGauge value={brightnessScore} label="輝き" color="#facc15" />
      </div>

      {/* Resonance quality bar */}
      <div className="resonance-bar-section">
        <div className="resonance-quality-label">
          響きの美しさ
          <span style={{ color: scoreColor, fontWeight: 700, marginLeft: 8 }}>
            {resonanceScore >= 75 ? '★ 美しい共鳴' : resonanceScore >= 50 ? '◎ 良い響き' : resonanceScore >= 30 ? '△ もう少し' : '○ 練習中'}
          </span>
        </div>
        <div className="resonance-quality-bar">
          <div
            className="resonance-quality-fill"
            style={{
              width: `${resonanceScore}%`,
              background: `linear-gradient(to right, #7c3aed, ${scoreColor})`,
              boxShadow: `0 0 10px ${scoreColor}`,
            }}
          />
        </div>
        <div className="resonance-detail">
          倍音数: {resonanceData.totalHarmonics} &nbsp;|&nbsp;
          スペクトル重心: {Math.round(resonanceData.spectralCentroid)} Hz
        </div>
      </div>
    </div>
  )
}

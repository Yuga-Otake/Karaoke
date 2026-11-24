import { useEffect, useRef } from 'react'
import { gradeOf } from '../utils/scoring'
import { Meter } from '../hooks/useWarmup'

export const GRADE_COLOR: Record<string, string> = {
  S: '#fbbf24', A: '#4ade80', B: '#00e5ff', C: '#facc15', D: '#f97316', F: '#f87171',
}
export const scoreColor = (s: number) => GRADE_COLOR[gradeOf(s)]

// ─── Canvas helper ───────────────────────────────────────────────────────────

export function useAnimatedCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, height: number) {
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

/** Input level bar (top-right) + a warning when the voice is too quiet to track. */
export function drawMeter(g: CanvasRenderingContext2D, w: number, m: Meter) {
  const bw = 90, bh = 6, x0 = w - bw - 10, y0 = 8
  const pos = (db: number) => x0 + Math.max(0, Math.min(1, (db + 70) / 60)) * bw
  g.fillStyle = '#1e293b'; g.fillRect(x0, y0, bw, bh)
  g.fillStyle = m.db >= m.gateDb ? '#4ade80' : '#64748b'
  g.fillRect(x0, y0, pos(m.db) - x0, bh)
  g.fillStyle = '#facc15'; g.fillRect(pos(m.gateDb) - 1, y0 - 2, 2, bh + 4)
  g.fillStyle = '#64748b'; g.font = '9px sans-serif'; g.textAlign = 'right'
  g.fillText('マイク入力', x0 - 4, y0 + 6)
  if (m.quiet > 0.3) {
    g.fillStyle = 'rgba(250,204,21,.95)'; g.font = 'bold 12px sans-serif'; g.textAlign = 'right'
    g.fillText(w > 480 ? '🔈 声が小さくて拾えていません：マイクに近づくか感度を「高」に' : '🔈 声が小さい：近づくか感度を「高」に', w - 10, y0 + 38)
  }
}


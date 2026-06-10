import { useEffect, useRef } from 'react'

interface Props {
  analyserNode: AnalyserNode | null
  frequency: number | null
}

function drawWaveform(canvas: HTMLCanvasElement, buffer: Float32Array) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#080b14'
  ctx.fillRect(0, 0, width, height)

  // Grid lines
  ctx.strokeStyle = '#0f1a2e'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * height
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }

  // Waveform
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, '#7c3aed')
  gradient.addColorStop(0.5, '#00e5ff')
  gradient.addColorStop(1, '#7c3aed')
  ctx.strokeStyle = gradient
  ctx.lineWidth = 1.5
  ctx.shadowBlur = 6
  ctx.shadowColor = '#00e5ff'
  ctx.beginPath()
  const step = width / buffer.length
  for (let i = 0; i < buffer.length; i++) {
    const x = i * step
    const y = ((1 - buffer[i]) / 2) * height
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function drawSpectrum(
  canvas: HTMLCanvasElement,
  spectrum: Float32Array,
  fundamental: number | null,
  sampleRate: number,
  fftSize: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = '#080b14'
  ctx.fillRect(0, 0, width, height)

  const nyquist = sampleRate / 2
  const displayMaxFreq = Math.min(nyquist, 5000)
  const maxBin = Math.floor((displayMaxFreq / nyquist) * spectrum.length)

  // Determine harmonic bins for highlighting
  const harmonicBins = new Set<number>()
  if (fundamental) {
    for (let h = 1; h <= 12; h++) {
      const freq = fundamental * h
      if (freq > displayMaxFreq) break
      const bin = Math.round((freq / nyquist) * spectrum.length)
      for (let d = -2; d <= 2; d++) harmonicBins.add(bin + d)
    }
  }

  const barWidth = width / maxBin

  for (let i = 0; i < maxBin; i++) {
    const db = spectrum[i]
    const norm = Math.max(0, (db + 90) / 80) // map -90..0 dB to 0..1
    const barH = norm * height

    const isHarmonic = harmonicBins.has(i)
    if (isHarmonic) {
      ctx.fillStyle = `hsl(${180 - (i / maxBin) * 60}, 80%, 60%)`
    } else {
      ctx.fillStyle = `rgba(30, 58, 95, ${0.4 + norm * 0.6})`
    }

    ctx.fillRect(i * barWidth, height - barH, Math.max(1, barWidth - 0.5), barH)
  }

  // Frequency labels
  ctx.fillStyle = '#475569'
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  for (const freq of [500, 1000, 2000, 3000, 5000]) {
    if (freq > displayMaxFreq) break
    const x = (freq / displayMaxFreq) * width
    ctx.fillText(`${freq >= 1000 ? freq / 1000 + 'k' : freq}`, x, height - 2)
  }
}

export function AudioVisualizer({ analyserNode, frequency }: Props) {
  const waveCanvasRef = useRef<HTMLCanvasElement>(null)
  const specCanvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const freqRef = useRef(frequency)
  freqRef.current = frequency

  useEffect(() => {
    if (!analyserNode) {
      cancelAnimationFrame(rafRef.current)
      const wc = waveCanvasRef.current
      const sc = specCanvasRef.current
      if (wc) { const c = wc.getContext('2d'); c?.clearRect(0, 0, wc.width, wc.height) }
      if (sc) { const c = sc.getContext('2d'); c?.clearRect(0, 0, sc.width, sc.height) }
      return
    }

    const timeBuf = new Float32Array(analyserNode.fftSize)
    const freqBuf = new Float32Array(analyserNode.frequencyBinCount)
    const sampleRate = (analyserNode.context as AudioContext).sampleRate
    const fftSize = analyserNode.fftSize

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      analyserNode.getFloatTimeDomainData(timeBuf)
      analyserNode.getFloatFrequencyData(freqBuf)
      if (waveCanvasRef.current) drawWaveform(waveCanvasRef.current, timeBuf)
      if (specCanvasRef.current) drawSpectrum(specCanvasRef.current, freqBuf, freqRef.current, sampleRate, fftSize)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyserNode])

  return (
    <div className="visualizer-wrap">
      <div className="viz-section">
        <div className="viz-label">波形 Waveform</div>
        <canvas ref={waveCanvasRef} className="viz-canvas" width={600} height={80} />
      </div>
      <div className="viz-section">
        <div className="viz-label">スペクトル Spectrum (倍音 highlighted)</div>
        <canvas ref={specCanvasRef} className="viz-canvas" width={600} height={100} />
      </div>
    </div>
  )
}

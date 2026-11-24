import { midiToFrequency } from './musicTheory'

export function playBeep(ctx: AudioContext, midi: number, durationSec = 0.45) {
  const freq = midiToFrequency(midi)
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + durationSec * 0.6)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durationSec + 0.05)
}

/** Soft piano-like guide tone scheduled at an exact AudioContext time. */
export function scheduleTone(
  ctx: AudioContext, midi: number, when: number, durationSec: number, volume = 0.5,
  glidePath?: { t: number; midi: number }[],   // absolute ctx times: slide the pitch through these points
) {
  const freq = midiToFrequency(midi)
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, when)
  out.gain.linearRampToValueAtTime(volume, when + 0.015)
  out.gain.exponentialRampToValueAtTime(volume * 0.45, when + Math.min(0.4, durationSec * 0.5))
  out.gain.setValueAtTime(volume * 0.45, when + Math.max(0.02, durationSec - 0.08))
  out.gain.linearRampToValueAtTime(0, when + durationSec)
  out.connect(ctx.destination)

  const partials: [OscillatorType, number, number][] = [
    ['triangle', 1, 1],
    ['sine', 2, 0.25],
    ['sine', 3, 0.08],
  ]
  for (const [type, mult, g] of partials) {
    const osc = ctx.createOscillator()
    const og = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq * mult, when)
    for (const pt of glidePath ?? []) {
      osc.frequency.exponentialRampToValueAtTime(midiToFrequency(pt.midi) * mult, pt.t)
    }
    og.gain.value = g
    osc.connect(og)
    og.connect(out)
    osc.start(when)
    osc.stop(when + durationSec + 0.05)
  }
}

/** Open the microphone with raw (unprocessed) audio and an analyser. */
export async function openMic(fftSize = 2048) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = fftSize
  analyser.smoothingTimeConstant = 0
  ctx.createMediaStreamSource(stream).connect(analyser)
  const close = () => {
    ctx.close().catch(() => {})
    stream.getTracks().forEach(t => t.stop())
  }
  return { ctx, analyser, close, stream }
}

/** A recording format this browser supports (iPhone Safari records mp4, Chrome webm). */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus']) {
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch { /* ignore */ }
  }
  return undefined
}

export function createRecorder(stream: MediaStream): MediaRecorder | null {
  if (typeof MediaRecorder === 'undefined') return null
  const mimeType = pickRecorderMime()
  try { return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream) } catch {
    try { return new MediaRecorder(stream) } catch { return null }
  }
}

/** Short metronome tick. */
export function scheduleClick(ctx: AudioContext, when: number, accent = false) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = accent ? 1600 : 1100
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(accent ? 0.18 : 0.1, when + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(when); osc.stop(when + 0.06)
}

import { midiToFrequency } from './musicTheory'

export function playBeep(ctx: AudioContext, midi: number, durationSec = 0.45) {
  const freq = midiToFrequency(midi)
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + durationSec * 0.6)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durationSec + 0.05)
}

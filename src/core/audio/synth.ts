/** Small building blocks shared by the effects, the radio and the crowd. */

import type { Mixer } from './mixer'

/** MIDI note number to frequency. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Multiply by a random factor within ±amount, so repeated sounds never match exactly. */
export const vary = (value: number, amount: number) => value * (1 + (Math.random() * 2 - 1) * amount)

/** Exponential ramps can't reach zero; this is silent enough. */
export const SILENT = 0.0001

export function amp(ctx: BaseAudioContext, value = 0): GainNode {
  const g = ctx.createGain()
  g.gain.value = value
  return g
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = Math.SQRT1_2): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = q
  // Recompute the filter once per 128-sample block rather than every sample
  // while it sweeps. Just as smooth to the ear, and about a third of the CPU,
  // which matters with a whole room of voices moving their mouths at once.
  for (const param of [f.frequency, f.Q, f.gain, f.detune]) param.automationRate = 'k-rate'
  return f
}

export function panner(ctx: BaseAudioContext, pan: number): StereoPannerNode {
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  return p
}

export function osc(ctx: BaseAudioContext, type: OscillatorType, frequency: number, t: number, duration: number): OscillatorNode {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(frequency, t)
  o.start(t)
  o.stop(t + duration)
  return o
}

/** Where noise comes from: a context to play it in, and the mixer's shared buffers. */
export type NoiseSource = Pick<Mixer, 'ctx' | 'white' | 'pink'>

/** A slice of shared noise from a random offset, so no two hisses are the same. */
export function noise(m: NoiseSource, t: number, duration: number, color: 'white' | 'pink' = 'white'): AudioBufferSourceNode {
  const src = m.ctx.createBufferSource()
  src.buffer = color === 'pink' ? m.pink : m.white
  const length = Math.min(duration + 0.05, src.buffer.duration)
  src.start(t, Math.random() * (src.buffer.duration - length), length)
  return src
}

/** A looping noise source, for sounds that last as long as they're needed. */
export function noiseLoop(m: NoiseSource, t: number, color: 'white' | 'pink' = 'white'): AudioBufferSourceNode {
  const src = m.ctx.createBufferSource()
  src.buffer = color === 'pink' ? m.pink : m.white
  src.loop = true
  src.start(t, Math.random() * src.buffer.duration)
  return src
}

/** Struck: a fast rise to `peak`, then an exponential fall over `decay` seconds. */
export function strike(param: AudioParam, t: number, peak: number, decay: number, attack = 0.004) {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(Math.max(peak, SILENT), t + attack)
  param.exponentialRampToValueAtTime(SILENT, t + attack + decay)
}

/** Air moving past: grows faster the closer it gets, then trails away. */
export function swell(param: AudioParam, t: number, peak: number, rise: number, fall: number) {
  param.setValueAtTime(SILENT, t)
  param.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + rise)
  param.exponentialRampToValueAtTime(SILENT, t + rise + fall)
}

/** Held: ease in, hold, ease out. For notes with a known length. */
export function hold(param: AudioParam, t: number, level: number, length: number, attack = 0.02, release = 0.08) {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(level, t + attack)
  param.setValueAtTime(level, t + Math.max(attack, length))
  param.linearRampToValueAtTime(0, t + Math.max(attack, length) + release)
}

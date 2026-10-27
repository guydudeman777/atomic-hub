/**
 * Tiny synthesized sound effects (Web Audio). No audio files to ship or license.
 */

import { useSave } from '../store/save'

export type Sfx = 'tick' | 'select' | 'card' | 'remove' | 'win' | 'lose' | 'error' | 'coin'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur)
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain, start + 0.005)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

function noise(ac: AudioContext, start: number, dur: number, gain: number) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  const amp = ac.createGain()
  src.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = 2400
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(ac.destination)
  src.start(start)
}

export function playSfx(name: Sfx) {
  const { sound, volume } = useSave.getState().settings
  if (!sound || volume <= 0) return
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime
  const v = 0.18 * volume
  switch (name) {
    case 'tick':
      tone(ac, 1800, t, 0.025, 'square', v * 0.35)
      break
    case 'select':
      tone(ac, 660, t, 0.06, 'square', v * 0.5)
      tone(ac, 990, t + 0.05, 0.08, 'square', v * 0.4)
      break
    case 'card':
      noise(ac, t, 0.07, v * 1.6)
      break
    case 'remove':
      noise(ac, t, 0.12, v * 1.4)
      tone(ac, 300, t, 0.18, 'sawtooth', v * 0.4, 90)
      break
    case 'coin':
      tone(ac, 1320, t, 0.07, 'square', v * 0.4)
      tone(ac, 1760, t + 0.06, 0.12, 'square', v * 0.4)
      break
    case 'win':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(ac, f, t + i * 0.09, 0.18, 'square', v * 0.45))
      break
    case 'lose':
      ;[392, 330, 262].forEach((f, i) => tone(ac, f, t + i * 0.14, 0.24, 'triangle', v * 0.6))
      break
    case 'error':
      tone(ac, 140, t, 0.16, 'square', v * 0.5)
      break
  }
}

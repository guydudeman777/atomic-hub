/**
 * Sound effects. Cards get warm, airy whooshes and soft landings on felt;
 * bottle caps clink; dice skitter and crack off the table's wall; board
 * game discs clack onto wood; the terminal keeps its electronic blips. Every effect
 * varies a little each time, so a long game never repeats itself exactly.
 */

import { useSave } from '../../store/save'
import { liveMixer } from './live'
import type { Mixer } from './mixer'
import { SILENT, amp, filter, hz, noise, osc, panner, strike, swell, vary } from './synth'

export type Sfx =
  // Terminal
  | 'tick'
  | 'select'
  | 'error'
  | 'power-off'
  | 'power-on'
  // Cards
  | 'card'
  | 'deal'
  | 'pick'
  | 'draw'
  | 'discard'
  | 'remove'
  | 'disband'
  | 'shuffle'
  | 'flip'
  // Chips
  | 'chip'
  | 'chips'
  | 'slam'
  // Dice and boards
  | 'dice'
  | 'disc'
  | 'disc-flip'
  // Results
  | 'coin'
  | 'win'
  | 'lose'

export interface SfxOptions {
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number
  /** Seconds from now, timed on the audio clock so sequences stay tight. */
  delay?: number
}

export function playSfx(name: Sfx, { pan = 0, delay = 0 }: SfxOptions = {}) {
  const { sound, volume } = useSave.getState().settings
  if (!sound || volume <= 0) return
  const m = liveMixer()
  if (!m) return
  renderSfx(m, name, m.ctx.currentTime + 0.01 + delay, pan)
}

/** Schedule an effect on any mixer, live or offline. */
export function renderSfx(m: Mixer, name: Sfx, t: number, pan = 0) {
  const out = pan ? connect(panner(m.ctx, pan), m.sfx) : m.sfx
  EFFECTS[name](m, out, t)
}

function connect<T extends AudioNode>(node: T, to: AudioNode): T {
  node.connect(to)
  return node
}

type Effect = (m: Mixer, out: AudioNode, t: number) => void

// ---------------------------------------------------------------------------
// Building blocks

interface Whoosh {
  length: number
  /** Where the band starts and ends, in Hz. */
  low: number
  /** Where it peaks as the card passes. */
  high: number
  level: number
  q?: number
}

/**
 * A card cutting the air: pink noise through a band that sweeps up as it
 * passes and back down, over a soft low push of air. Kept below 3 kHz so it
 * reads as warm rather than hissy.
 */
function whoosh(m: Mixer, out: AudioNode, t: number, w: Whoosh) {
  const { ctx } = m
  const length = vary(w.length, 0.12)
  const high = vary(w.high, 0.15)
  const level = vary(w.level, 0.12)
  const passAt = t + length * 0.6
  const band = filter(ctx, 'bandpass', w.low, w.q ?? 1.1)
  band.frequency.setValueAtTime(w.low, t)
  band.frequency.exponentialRampToValueAtTime(high, passAt)
  band.frequency.exponentialRampToValueAtTime(w.low * 1.4, t + length)
  const env = amp(ctx)
  swell(env.gain, t, level, length * 0.6, length * 0.4)
  noise(m, t, length, 'pink').connect(band).connect(filter(ctx, 'lowpass', 2800)).connect(env).connect(out)

  const push = amp(ctx)
  swell(push.gain, t, level * 0.35, length * 0.65, length * 0.45)
  noise(m, t, length * 1.1, 'pink').connect(filter(ctx, 'lowpass', 450)).connect(push).connect(out)
}

/** A card landing on felt over wood: a soft tap with a little body under it. */
function land(m: Mixer, out: AudioNode, t: number, level: number, body = 0.45) {
  const { ctx } = m
  const tap = amp(ctx)
  strike(tap.gain, t, level, 0.04, 0.002)
  noise(m, t, 0.06, 'pink').connect(filter(ctx, 'bandpass', vary(900, 0.15), 1.3)).connect(tap).connect(out)

  const knock = amp(ctx)
  strike(knock.gain, t, level * body, 0.09, 0.003)
  const thump = osc(ctx, 'sine', vary(150, 0.1), t, 0.14)
  thump.frequency.exponentialRampToValueAtTime(80, t + 0.09)
  thump.connect(knock).connect(out)
}

/** Paper sliding on paper: a short, rising or falling hiss. */
function slide(m: Mixer, out: AudioNode, t: number, length: number, from: number, to: number, level: number) {
  const { ctx } = m
  const band = filter(ctx, 'bandpass', from, 0.9)
  band.frequency.setValueAtTime(from, t)
  band.frequency.exponentialRampToValueAtTime(to, t + length)
  const env = amp(ctx)
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(level, t + length * 0.3)
  env.gain.exponentialRampToValueAtTime(SILENT, t + length)
  noise(m, t, length).connect(band).connect(filter(ctx, 'lowpass', 4500)).connect(env).connect(out)
}

/** A terminal blip: a square wave with its harsh edge filed off. */
function blip(m: Mixer, out: AudioNode, t: number, freq: number, length: number, level: number) {
  const { ctx } = m
  const env = amp(ctx)
  strike(env.gain, t, level, length, 0.003)
  osc(ctx, 'square', freq, t, length + 0.02)
    .connect(filter(ctx, 'lowpass', Math.min(freq * 3, 6000)))
    .connect(env)
    .connect(out)
}

/** A struck bit of metal: a few inharmonic partials that die away at different rates. */
function metal(m: Mixer, out: AudioNode, t: number, freq: number, level: number, ratios: number[], decay: number) {
  const { ctx } = m
  ratios.forEach((ratio, i) => {
    const env = amp(ctx)
    strike(env.gain, t, level / (i + 1), decay / (1 + i * 0.6), 0.001)
    osc(ctx, 'sine', freq * ratio, t, decay + 0.05).connect(env).connect(out)
  })
}

/** A warm, mellow note: sine with a soft octave and a bell-like attack. */
function vibe(m: Mixer, out: AudioNode, t: number, midi: number, length: number, level: number) {
  const { ctx } = m
  const f = hz(midi)
  const env = amp(ctx)
  strike(env.gain, t, level, length, 0.006)
  const tine = amp(ctx)
  strike(tine.gain, t, level * 0.25, 0.25, 0.002)
  osc(ctx, 'triangle', f, t, length + 0.05).connect(env).connect(out)
  osc(ctx, 'sine', f * 2, t, length + 0.05).connect(amp(ctx, 0.3)).connect(env)
  osc(ctx, 'sine', f * 4, t, 0.3).connect(tine).connect(out)
}

/** Partials of a clay casino chip: lower and deader than a bottle cap. */
const CLAY = [1, 1.58, 2.31]

/** Partials of a casino die: hard acetate, brighter than clay and quicker to die away. */
const ACETATE = [1, 1.72, 2.67, 3.4]

/** Partials of a board game disc: a thick wooden counter, low and dry. */
const COUNTER = [1, 2.03, 3.1]

/** One die striking the table: a click on the felt with a little thump under it. */
function knock(m: Mixer, out: AudioNode, t: number, level: number, pitch: number) {
  metal(m, out, t, vary(pitch, 0.1), level * 0.45, ACETATE, 0.025)
  land(m, out, t, level, 0.18)
}

// ---------------------------------------------------------------------------
// The effects

const EFFECTS: Record<Sfx, Effect> = {
  tick: (m, out, t) => blip(m, out, t, vary(1500, 0.03), 0.03, 0.06),

  select: (m, out, t) => {
    blip(m, out, t, 660, 0.07, 0.16)
    blip(m, out, t + 0.06, 990, 0.1, 0.13)
  },

  error: (m, out, t) => {
    const { ctx } = m
    const env = amp(ctx)
    strike(env.gain, t, 0.2, 0.2, 0.005)
    const low = filter(ctx, 'lowpass', 900)
    osc(ctx, 'square', 140, t, 0.22).connect(low)
    osc(ctx, 'square', 147, t, 0.22).connect(low)
    low.connect(env).connect(out)
  },

  'power-off': (m, out, t) => {
    // The tube collapsing: a falling whine, a thump and a little static.
    const { ctx } = m
    const whine = amp(ctx)
    strike(whine.gain, t, 0.12, 0.45, 0.005)
    const saw = osc(ctx, 'sawtooth', 1400, t, 0.5)
    saw.frequency.exponentialRampToValueAtTime(70, t + 0.42)
    const tone = filter(ctx, 'lowpass', 3000)
    tone.frequency.exponentialRampToValueAtTime(300, t + 0.42)
    saw.connect(tone).connect(whine).connect(out)
    const thump = amp(ctx)
    strike(thump.gain, t + 0.3, 0.5, 0.2)
    const sine = osc(ctx, 'sine', 90, t + 0.3, 0.25)
    sine.frequency.exponentialRampToValueAtTime(40, t + 0.5)
    sine.connect(thump).connect(out)
    slide(m, out, t + 0.32, 0.25, 3000, 900, 0.12)
  },

  'power-on': (m, out, t) => {
    // Degauss: a thunk and a hum, then the rising whine of the tube warming up.
    const { ctx } = m
    const thunk = amp(ctx)
    strike(thunk.gain, t, 0.6, 0.18)
    const sine = osc(ctx, 'sine', 75, t, 0.2)
    sine.frequency.exponentialRampToValueAtTime(45, t + 0.18)
    sine.connect(thunk).connect(out)
    const hum = amp(ctx)
    strike(hum.gain, t, 0.12, 0.5, 0.02)
    osc(ctx, 'sawtooth', 60, t, 0.55).connect(filter(ctx, 'lowpass', 400)).connect(hum).connect(out)
    const whine = amp(ctx)
    strike(whine.gain, t + 0.05, 0.1, 0.45, 0.05)
    const tri = osc(ctx, 'triangle', 180, t + 0.05, 0.5)
    tri.frequency.exponentialRampToValueAtTime(1800, t + 0.5)
    tri.connect(whine).connect(out)
  },

  card: (m, out, t) => {
    whoosh(m, out, t, { length: 0.22, low: 350, high: 1300, level: 3.4 })
    land(m, out, t + 0.16, vary(0.55, 0.15))
  },

  deal: (m, out, t) => {
    whoosh(m, out, t, { length: 0.14, low: 500, high: 1800, level: 2.4, q: 1.3 })
    land(m, out, t + 0.11, vary(0.3, 0.2), 0.15)
  },

  pick: (m, out, t) => slide(m, out, t, 0.08, 1200, 2400, 0.25),

  draw: (m, out, t) => {
    slide(m, out, t, 0.14, 2000, 900, 0.22)
    land(m, out, t + 0.12, 0.18, 0.2)
  },

  discard: (m, out, t) => {
    whoosh(m, out, t, { length: 0.28, low: 300, high: 1100, level: 3 })
    land(m, out, t + 0.22, 0.35)
    slide(m, out, t + 0.23, 0.12, 1800, 700, 0.08)
  },

  remove: (m, out, t) => {
    // Swept off the table: a long falling whoosh and a scatter of cards.
    whoosh(m, out, t, { length: 0.42, low: 260, high: 1200, level: 3.4, q: 0.9 })
    for (let i = 0; i < 3; i++) slide(m, out, t + 0.22 + i * vary(0.06, 0.3), 0.09, 2600, 900, vary(0.09, 0.3))
    land(m, out, t + 0.3, 0.3)
  },

  disband: (m, out, t) => {
    whoosh(m, out, t, { length: 0.55, low: 220, high: 1100, level: 3.8, q: 0.8 })
    for (let i = 0; i < 5; i++) slide(m, out, t + 0.25 + i * vary(0.055, 0.3), 0.1, 2800, 800, vary(0.1, 0.3))
    land(m, out, t + 0.4, 0.4)
  },

  shuffle: (m, out, t) => {
    // A riffle: card edges flicking past a thumb, faster and then slower,
    // then the deck squared up with two taps.
    const { ctx } = m
    const length = 0.34
    const steps = 340
    const curve = new Float32Array(steps)
    let at = 0
    while (at < length) {
      const i = Math.floor((at / length) * steps)
      for (let k = 0; k < 3 && i + k < steps; k++) curve[i + k] = (1 - k / 3) * vary(0.8, 0.2)
      at += 0.007 + 0.012 * Math.abs(at / length - 0.4)
    }
    curve[steps - 1] = 0
    const env = amp(ctx)
    env.gain.setValueCurveAtTime(curve, t, length)
    noise(m, t, length)
      .connect(filter(ctx, 'bandpass', 2400, 0.9))
      .connect(filter(ctx, 'lowpass', 4000))
      .connect(env)
      .connect(out)
    whoosh(m, out, t + 0.05, { length: 0.28, low: 600, high: 1500, level: 1.2 })
    land(m, out, t + 0.37, 0.4, 0.3)
    land(m, out, t + 0.43, 0.3, 0.3)
  },

  flip: (m, out, t) => {
    // A card turned over on the felt: a flick of air, then a soft slap.
    slide(m, out, t, 0.07, 900, 2200, 0.14)
    land(m, out, t + 0.06, vary(0.42, 0.12), 0.3)
  },

  chip: (m, out, t) => {
    // Clay chips knocking together: a bright, short clack with a little body.
    metal(m, out, t, vary(2300, 0.1), 0.2, CLAY, 0.05)
    land(m, out, t, 0.22, 0.25)
    if (Math.random() < 0.6) metal(m, out, t + vary(0.035, 0.3), vary(2500, 0.1), 0.1, CLAY, 0.04)
  },

  chips: (m, out, t) => {
    // A stack pushed across the felt and cut into a pile: a run of clacks.
    slide(m, out, t, 0.18, 700, 1400, 0.12)
    land(m, out, t + 0.14, 0.22, 0.2)
    for (let i = 0; i < 6; i++) {
      metal(m, out, t + 0.12 + i * vary(0.045, 0.35), vary(2400, 0.12), 0.15 * (1 - i / 8), CLAY, 0.045)
    }
  },

  slam: (m, out, t) => {
    // A fist on a padded table: a deep thump through the wood, then every
    // stack on the felt jumps and clatters back down.
    const { ctx } = m
    const thump = amp(ctx)
    strike(thump.gain, t, 0.9, 0.28, 0.003)
    const body = osc(ctx, 'sine', vary(95, 0.08), t, 0.32)
    body.frequency.exponentialRampToValueAtTime(42, t + 0.22)
    body.connect(thump).connect(out)
    const pad = amp(ctx)
    strike(pad.gain, t, 0.5, 0.12, 0.002)
    noise(m, t, 0.14, 'pink').connect(filter(ctx, 'lowpass', 500)).connect(pad).connect(out)
    land(m, out, t + 0.01, 0.6, 0.6)
    for (let i = 0; i < 9; i++) {
      const at = t + 0.06 + i * vary(0.03, 0.45) + (i > 4 ? 0.08 : 0)
      metal(m, out, at, vary(2300, 0.15), 0.12 * (1 - i / 12), CLAY, 0.04)
    }
    slide(m, out, t + 0.05, 0.12, 2400, 900, 0.08)
  },

  dice: (m, out, t) => {
    // A pair thrown the length of the table: each die skips over the felt,
    // cracks off the rubber wall at the far end, and tumbles to a stop.
    const { ctx } = m
    const wallAt = t + vary(0.42, 0.08)
    for (let die = 0; die < 2; die++) {
      let at = t + die * vary(0.035, 0.5)
      let gap = vary(0.13, 0.15)
      for (let i = 0; i < 3 && at < wallAt - 0.03; i++) {
        knock(m, out, at, vary(0.28, 0.2) * (1 - i * 0.15), 3100)
        at += gap
        gap *= 0.85
      }
      const hit = wallAt + die * vary(0.025, 0.6)
      knock(m, out, hit, vary(0.5, 0.15), 2500)
      at = hit + vary(0.09, 0.2)
      gap = vary(0.08, 0.2)
      let level = 0.3
      for (let i = 0; i < 4; i++) {
        knock(m, out, at, vary(level, 0.2), 3300)
        at += gap
        gap *= 0.72
        level *= 0.62
      }
    }
    // The wall itself: rubber over wood, a dull thud under the cracks.
    const thud = amp(ctx)
    strike(thud.gain, wallAt, 0.35, 0.12, 0.003)
    noise(m, wallAt, 0.14, 'pink').connect(filter(ctx, 'lowpass', 420)).connect(thud).connect(out)
  },

  disc: (m, out, t) => {
    // A disc set down on the board: a dry wooden clack with a little body.
    metal(m, out, t, vary(1250, 0.08), 0.18, COUNTER, 0.035)
    land(m, out, t, vary(0.5, 0.12), 0.55)
  },

  'disc-flip': (m, out, t) => {
    // A disc turned over where it lies: a flick of air and a light tick.
    slide(m, out, t, 0.05, 1300, 2600, 0.07)
    metal(m, out, t + 0.05, vary(1700, 0.12), 0.09, COUNTER, 0.025)
    land(m, out, t + 0.05, vary(0.18, 0.2), 0.3)
  },

  coin: (m, out, t) => {
    // Bottle caps: thin, crimped tin that clinks and rattles.
    const ratios = [1, 1.47, 2.09, 2.76]
    metal(m, out, t, vary(2900, 0.08), 0.22, ratios, 0.22)
    metal(m, out, t + 0.07, vary(3300, 0.08), 0.15, ratios, 0.18)
    metal(m, out, t + 0.15, vary(2600, 0.08), 0.08, ratios, 0.14)
    land(m, out, t + 0.02, 0.15)
  },

  win: (m, out, t) => {
    ;[65, 69, 72, 77].forEach((n, i) => vibe(m, out, t + i * 0.1, n, 0.9, 0.16))
    ;[77, 81, 84].forEach((n) => vibe(m, out, t + 0.42, n, 1.4, 0.09))
  },

  lose: (m, out, t) => {
    // A muted horn going wah, wah, wah, waaah.
    const { ctx } = m
    ;[67, 66, 65, 64].forEach((n, i) => {
      const start = t + i * 0.3
      const last = i === 3
      const length = last ? 0.9 : 0.26
      const env = amp(ctx)
      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(0.18, start + 0.04)
      env.gain.setValueAtTime(0.18, start + length - 0.08)
      env.gain.linearRampToValueAtTime(0, start + length)
      const horn = osc(ctx, 'sawtooth', hz(n), start, length + 0.05)
      if (last) {
        const wobble = osc(ctx, 'sine', 5.5, start, length)
        const depth = amp(ctx, hz(n) * 0.015)
        wobble.connect(depth).connect(horn.frequency)
      }
      const mute = filter(ctx, 'lowpass', 500, 4)
      mute.frequency.setValueAtTime(500, start)
      mute.frequency.linearRampToValueAtTime(1500, start + 0.12)
      mute.frequency.linearRampToValueAtTime(600, start + length)
      horn.connect(mute).connect(env).connect(out)
    })
  },
}

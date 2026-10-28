/**
 * The saloon radio: a small band synthesized live. Upright bass, a mellow
 * electric piano, brushes on a snare and a lead (vibraphone, a twangy
 * guitar or a whistle) play the songs in score.ts, a few choruses each,
 * with a turn of the tuning dial in between. It all goes through an old
 * speaker: band-limited, slightly saturated, with a little vinyl crackle.
 *
 * Nothing runs on its own clock. The caller asks for everything up to a
 * point in time with scheduleUntil(), which also lets it render offline.
 * If it asks late, the band picks up on the next bar instead of rushing to
 * play everything it missed.
 */

import type { Rng } from '../rng'
import { type Render, SampleBank } from './bank'
import type { Mixer } from './mixer'
import {
  type Chart,
  type Lead,
  type Note,
  type Tune,
  SONGS,
  bassLine,
  chartOf,
  chorusMelody,
  comping,
  makeTune,
  swingOf,
} from './score'
import { SILENT, amp, filter, hz, noise, osc, strike } from './synth'

const TUNING_SECONDS = 1.6
/** The least notice a bar needs to start on time, in seconds. */
const NOTICE = 0.05

export class Radio {
  private readonly m: Mixer
  private readonly rng: Rng
  private readonly ctx: BaseAudioContext
  /** The volume knob: the radio's whole output, so switching it off fades everything at once. */
  private readonly out: GainNode
  /** The speaker: everything the band plays goes in here. */
  private readonly speaker: GainNode
  private readonly keys: GainNode
  private readonly persistent: AudioScheduledSourceNode[] = []
  private readonly strings = new Map<number, AudioBuffer>()
  private readonly bank: SampleBank

  private song: number
  private chart: Chart
  private tune: Tune
  private solo: Tune
  private chorus = 0
  private bar = 0
  private barAt: number
  private bass = 41
  private chords: number[] | null = null
  private melody: Note[][] = []
  private lead: Lead | null = null

  /** Pass the same bank to the next radio to keep its recordings: every song plays the same instruments. */
  constructor(m: Mixer, rng: Rng, startAt: number, bank = new SampleBank()) {
    this.m = m
    this.rng = rng
    this.ctx = m.ctx
    this.bank = bank
    const ctx = this.ctx
    this.out = amp(ctx, 1)
    this.out.connect(m.music)

    // The old speaker: no deep lows, no sparkling highs, a bit of warm grit.
    // The shaper only takes ±1, so the band goes in at half level into a
    // curve twice as wide: the loudest chords saturate instead of clipping.
    this.speaker = amp(ctx, 1)
    const shaper = ctx.createWaveShaper()
    shaper.curve = saturation(1.6, HEADROOM)
    this.speaker
      .connect(filter(ctx, 'highpass', 75))
      .connect(filter(ctx, 'lowpass', 7000))
      .connect(amp(ctx, 1 / HEADROOM))
      .connect(shaper)
      .connect(this.out)

    // Electric piano through a slow tremolo.
    this.keys = amp(ctx, 0.85)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 4.6
    lfo.start(startAt)
    lfo.connect(amp(ctx, 0.15)).connect(this.keys.gain)
    this.keys.connect(this.speaker)
    this.persistent.push(lfo)

    // Vinyl crackle, underneath it all.
    const crackle = ctx.createBufferSource()
    const surface = crackleBuffer(ctx)
    crackle.buffer = surface
    crackle.loop = true
    crackle.connect(amp(ctx, 0.5)).connect(this.out)
    crackle.start(startAt, Math.random() * surface.duration)
    this.persistent.push(crackle)

    this.song = Math.floor(rng() * SONGS.length)
    this.chart = chartOf(SONGS[this.song])
    this.tune = makeTune(this.chart, rng)
    this.solo = makeTune(this.chart, rng)
    this.tuning(startAt, 0.9)
    this.barAt = startAt + 0.9
    this.startChorus()
  }

  /**
   * Schedule every bar that starts before `time`. If the next bar should
   * have started by `now` (the page was too busy to ask in time), it starts
   * now instead: a pause in the music, not a pile-up of every note it missed.
   */
  scheduleUntil(time: number, now: number) {
    if (this.barAt < now + NOTICE) this.barAt = now + NOTICE
    while (this.barAt < time) this.playBar()
  }

  /** Turn the radio off: fade it all out from `at`, notes already scheduled included. */
  stop(at: number) {
    this.out.gain.setTargetAtTime(0, at, 0.1)
    for (const node of this.persistent) node.stop(at + 1)
  }

  private get beat(): number {
    return 60 / this.chart.song.bpm
  }

  private startChorus() {
    const { song } = this.chart
    const last = this.chorus === song.choruses - 1
    const head = this.chorus === 0 || last
    // The tune at the start and end; in between, a solo, or a chorus for the rhythm section.
    if (head) this.lead = song.leads[0]
    else this.lead = this.rng() < 0.75 ? song.leads[1] : null
    if (!head) this.solo = makeTune(this.chart, this.rng)
    this.melody = this.lead ? chorusMelody(this.chart, head ? this.tune : this.solo) : []
  }

  private playBar() {
    const { chart, bar, barAt } = this
    const { song } = chart
    const ending = this.chorus === song.choruses - 1 && bar === chart.bars.length - 1

    if (ending) {
      // Final chord, left to ring.
      const chord = chart.bars[bar][0]
      this.bassNote(barAt, this.bass - ((this.bass - chord.root) % 12), this.beat * 3, 0.9)
      const comp = comping(chart, bar, this.chords, this.rng)[0]
      for (const p of comp.pitches) this.piano(barAt + this.rng() * 0.03, p, this.beat * 4, 0.6)
      for (const n of this.melody[bar] ?? []) if (n.at === 0) this.playLead(barAt, n.pitch, this.beat * 4, n.velocity)
      const ring = Math.round(this.beat * 200) / 100
      this.play(`brush:${ring}`, ring, brush(this.m, ring), barAt, 0.5)
      this.nextSong(barAt + this.beat * chart.beats + 0.4)
      return
    }

    const at = (pos: number) => barAt + this.swing(pos) * this.beat + (this.rng() - 0.5) * 0.012

    for (const n of bassLine(chart, bar, this.bass, this.rng)) {
      this.bassNote(at(n.at), n.pitch, n.length * this.beat, n.velocity)
      this.bass = n.pitch
    }
    for (const hit of comping(chart, bar, this.chords, this.rng)) {
      // A slight roll, lowest note first, like fingers that aren't machines.
      hit.pitches.forEach((p, i) => this.piano(at(hit.at) + i * 0.012, p, hit.length * this.beat, hit.velocity))
      this.chords = hit.pitches
    }
    for (const n of this.melody[bar] ?? []) this.playLead(at(n.at), n.pitch, n.length * this.beat, n.velocity)
    this.drums()

    this.barAt += chart.beats * this.beat
    this.bar++
    if (this.bar === chart.bars.length) {
      this.bar = 0
      this.chorus++
      this.startChorus()
    }
  }

  private swing(pos: number): number {
    const whole = Math.floor(pos)
    const frac = pos - whole
    const ratio = swingOf(this.chart.song)
    return whole + (frac <= 0.5 ? (frac / 0.5) * ratio : ratio + ((frac - 0.5) / 0.5) * (1 - ratio))
  }

  private nextSong(at: number) {
    this.tuning(at, TUNING_SECONDS)
    // The recordings stay: the next song plays the same instruments over
    // much the same notes.
    this.song = (this.song + 1) % SONGS.length
    this.chart = chartOf(SONGS[this.song])
    this.tune = makeTune(this.chart, this.rng)
    this.chorus = 0
    this.bar = 0
    this.chords = null
    this.barAt = at + TUNING_SECONDS
    this.startChorus()
  }

  // -------------------------------------------------------------------------
  // The band. Each instrument is a natural, full-length note recorded once
  // into the sample bank, then shaped per performance by a gain: velocity
  // sets its level, and the note's length sets when it's let go.

  /** Play a recorded sound at `t`, cut off from `releaseAt` if given. */
  private play(key: string, seconds: number, render: Render, t: number, level: number, releaseAt?: number, release = 0.08, out = this.speaker) {
    const g = amp(this.ctx, level)
    if (releaseAt !== undefined) g.gain.setTargetAtTime(0, releaseAt, release)
    g.connect(out)
    this.bank.play(key, seconds, render, this.ctx, g, t)
  }

  private bassNote(t: number, midi: number, length: number, velocity: number) {
    this.play(`bass:${midi}`, 1.5, bass(hz(midi)), t, velocity, t + length + 0.05, 0.05)
  }

  private piano(t: number, midi: number, length: number, velocity: number) {
    this.play(`piano:${midi}`, 2.5, piano(hz(midi)), t, velocity, t + Math.max(0.3, length), 0.12, this.keys)
  }

  private playLead(t: number, midi: number, length: number, velocity: number) {
    const f = hz(midi)
    if (this.lead === 'guitar') this.guitar(t, midi, length, velocity)
    else if (this.lead === 'whistle') this.play(`whistle:${midi}`, 3, whistle(this.m, f), t, velocity, t + length, 0.05)
    else this.play(`vibes:${midi}`, 2.6, vibes(f), t, velocity, t + Math.max(1.2, length * 1.5), 0.25)
  }

  private guitar(t: number, midi: number, length: number, velocity: number) {
    // A plucked string (Karplus–Strong), sometimes slid into from below.
    const { ctx } = this
    const src = ctx.createBufferSource()
    src.buffer = this.string(midi)
    if (this.rng() < 0.2) {
      src.playbackRate.setValueAtTime(2 ** (-1 / 12), t)
      src.playbackRate.linearRampToValueAtTime(1, t + 0.07)
    }
    const env = amp(ctx, 0.9 * velocity)
    env.gain.setTargetAtTime(0, t + length + 0.05, 0.1)
    src.connect(env).connect(this.speaker)
    src.start(t)
    // A note held longer than the string rings plays out its fade (see pluckBuffer).
    src.stop(t + Math.min(length + 0.6, src.buffer.duration))
  }

  private string(midi: number): AudioBuffer {
    let buffer = this.strings.get(midi)
    if (!buffer) {
      buffer = pluckBuffer(this.ctx, hz(midi))
      this.strings.set(midi, buffer)
    }
    return buffer
  }

  private drums() {
    const { song, beats } = this.chart
    const at = (pos: number) => this.barAt + this.swing(pos) * this.beat + (this.rng() - 0.5) * 0.01
    // A few recordings of each hit, picked at random, so the kit never sounds looped.
    const take = () => Math.floor(this.rng() * 3)
    const brushLength = Math.round(this.beat * 0.88 * 100) / 100
    const sweep = (t: number, level: number) => this.play(`brush:${brushLength}:${take()}`, brushLength, brush(this.m, brushLength), t, level)
    const slapAt = (t: number, level: number) => this.play(`slap:${take()}`, 0.3, slap(this.m), t, level)
    const kickAt = (t: number, level: number) => this.play('kick', 0.25, kick, t, level)
    if (song.feel === 'waltz') {
      sweep(at(0), 0.9)
      slapAt(at(1), 0.35)
      slapAt(at(2), 0.35)
      kickAt(at(0), 0.6)
      return
    }
    for (let b = 0; b < beats; b++) {
      sweep(at(b), b % 2 ? 0.6 : 0.8)
      if (b % 2) slapAt(at(b), 0.55)
      kickAt(at(b), b % 2 ? 0.25 : 0.4)
    }
    // Ride: ding, ding-a, ding, ding-a.
    for (const pos of [0, 1, 1.5, 2, 3, 3.5]) this.play(`ride:${take()}`, 0.6, ride(this.m), at(pos), pos % 1 ? 0.5 : 0.8)
  }

  /** Turning the dial: static, and a whistle sliding through the stations. */
  private tuning(t: number, length: number) {
    const { ctx } = this
    const band = filter(ctx, 'bandpass', 900, 2.5)
    band.frequency.setValueAtTime(900, t)
    band.frequency.exponentialRampToValueAtTime(3200, t + length * 0.45)
    band.frequency.exponentialRampToValueAtTime(1300, t + length)
    const hiss = amp(ctx)
    hiss.gain.setValueAtTime(0, t)
    hiss.gain.linearRampToValueAtTime(0.16, t + 0.1)
    hiss.gain.setValueAtTime(0.16, t + length - 0.3)
    hiss.gain.linearRampToValueAtTime(0, t + length)
    noise(this.m, t, length).connect(band).connect(hiss).connect(this.speaker)

    const whistle = osc(ctx, 'sine', 2400, t, length)
    whistle.frequency.exponentialRampToValueAtTime(500, t + length * 0.5)
    whistle.frequency.exponentialRampToValueAtTime(1100, t + length)
    const level = amp(ctx)
    level.gain.setValueAtTime(0, t)
    level.gain.linearRampToValueAtTime(0.025, t + 0.2)
    level.gain.linearRampToValueAtTime(0, t + length)
    whistle.connect(level).connect(this.speaker)
  }
}

// ---------------------------------------------------------------------------
// Instruments, as natural notes at full velocity. Each can render into any
// context, live or offline, so the sample bank can record it.

/** Upright bass: a thumb on a fat string, starting a touch sharp and settling. */
const bass =
  (f: number): Render =>
  (ctx, out, t) => {
    const env = amp(ctx)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.5, t + 0.008)
    env.gain.exponentialRampToValueAtTime(0.2, t + 0.15)
    env.gain.exponentialRampToValueAtTime(SILENT, t + 1.45)
    const tone = filter(ctx, 'lowpass', 1100, 1)
    tone.frequency.setValueAtTime(1100, t)
    tone.frequency.exponentialRampToValueAtTime(350, t + 0.25)
    for (const [type, level] of [
      ['triangle', 1],
      ['sine', 0.8],
    ] as const) {
      const o = osc(ctx, type, f * 1.02, t, 1.5)
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04)
      o.connect(amp(ctx, level)).connect(tone)
    }
    tone.connect(env).connect(out)
  }

/** Electric piano: two-operator FM, bright when struck and mellowing as it rings. */
const piano =
  (f: number): Render =>
  (ctx, out, t) => {
    const carrier = osc(ctx, 'sine', f, t, 2.5)
    const modulator = osc(ctx, 'sine', f, t, 2.5)
    const index = amp(ctx)
    index.gain.setValueAtTime(f * 1.4, t)
    index.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.5)
    modulator.connect(index).connect(carrier.frequency)
    const env = amp(ctx)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.07, t + 0.006)
    env.gain.exponentialRampToValueAtTime(0.035, t + 0.3)
    // Rings away, then lets go before the oscillators stop, so a long chord ends without a click.
    env.gain.exponentialRampToValueAtTime(0.0015, t + 2.2)
    env.gain.linearRampToValueAtTime(0, t + 2.45)
    carrier.connect(env).connect(out)
  }

/** Vibraphone: a pure bar with a bell-like strike and the motor's slow wobble. */
const vibes =
  (f: number): Render =>
  (ctx, out, t) => {
    const env = amp(ctx)
    strike(env.gain, t, 0.13, 2.4, 0.004)
    osc(ctx, 'sine', f, t, 2.5).connect(env)
    // The strike's bright overtone dies away on its own, well before its oscillator stops.
    const ring = amp(ctx)
    strike(ring.gain, t, 0.016, 1, 0.004)
    osc(ctx, 'sine', f * 4, t, 1.1).connect(ring)
    const wobble = amp(ctx, 0.85)
    osc(ctx, 'sine', 5.2, t, 2.5).connect(amp(ctx, 0.25)).connect(wobble.gain)
    env.connect(wobble).connect(out)
    ring.connect(wobble)
  }

/** Whistling: a pure tone, a breath of air, and a vibrato that blooms as the note holds. */
const whistle =
  (m: Mixer, f: number): Render =>
  (ctx, out, t) => {
    const tone = osc(ctx, 'sine', f * 0.985, t, 3)
    tone.frequency.exponentialRampToValueAtTime(f, t + 0.05)
    const depth = amp(ctx)
    depth.gain.setValueAtTime(0, t)
    depth.gain.linearRampToValueAtTime(f * 0.012, t + 0.5)
    osc(ctx, 'sine', 5.4, t, 3).connect(depth).connect(tone.frequency)
    const env = amp(ctx)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.045, t + 0.04)
    env.gain.linearRampToValueAtTime(0.04, t + 2.6)
    env.gain.linearRampToValueAtTime(0, t + 2.95)
    tone.connect(env).connect(out)
    const breath = amp(ctx)
    breath.gain.setValueAtTime(0, t)
    breath.gain.linearRampToValueAtTime(0.008, t + 0.03)
    breath.gain.linearRampToValueAtTime(0, t + 2.95)
    noise({ ...m, ctx }, t, 2.95).connect(filter(ctx, 'bandpass', f, 6)).connect(breath).connect(out)
  }

/** A brush swept in a circle on the snare head. */
const brush =
  (m: Mixer, length: number): Render =>
  (ctx, out, t) => {
    const env = amp(ctx)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.05, t + length * 0.35)
    env.gain.linearRampToValueAtTime(0, t + length)
    noise({ ...m, ctx }, t, length).connect(filter(ctx, 'bandpass', 4200, 0.6)).connect(env).connect(out)
  }

/** The brush slapped down on the backbeat. */
const slap =
  (m: Mixer): Render =>
  (ctx, out, t) => {
    const env = amp(ctx)
    strike(env.gain, t, 0.12, 0.13, 0.002)
    noise({ ...m, ctx }, t, 0.16).connect(filter(ctx, 'bandpass', 2600, 0.8)).connect(env).connect(out)
    const body = amp(ctx)
    strike(body.gain, t, 0.05, 0.07)
    osc(ctx, 'triangle', 190, t, 0.1).connect(body).connect(out)
  }

/** A ride cymbal, tapped lightly. */
const ride =
  (m: Mixer): Render =>
  (ctx, out, t) => {
    const env = amp(ctx)
    strike(env.gain, t, 0.02, 0.35, 0.001)
    noise({ ...m, ctx }, t, 0.4).connect(filter(ctx, 'highpass', 6500)).connect(env).connect(out)
    for (const f of [3150, 4720]) {
      const ring = amp(ctx)
      strike(ring.gain, t, 0.004, 0.5, 0.001)
      osc(ctx, 'sine', f, t, 0.55).connect(ring).connect(out)
    }
  }

/** The bass drum, barely touched. */
const kick: Render = (ctx, out, t) => {
  const env = amp(ctx)
  strike(env.gain, t, 0.18, 0.16)
  const o = osc(ctx, 'sine', 70, t, 0.2)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  o.connect(env).connect(out)
}

/** How far past ±1 the speaker's input can go before it clips. */
const HEADROOM = 2

/**
 * A gentle tanh curve: rounds off peaks the way an old valve amp does. It
 * spans ±`headroom`, for an input scaled down by as much to fit the shaper.
 */
function saturation(drive: number, headroom: number): Float32Array<ArrayBuffer> {
  const n = 2049
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * headroom
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive)
  }
  return curve
}

/**
 * A record's surface noise: a faint hiss with a soft tick now and then.
 * Ticks are rounded, not sharp edges, so they sit under the band instead of
 * sounding like the speakers glitching; the loop is long and starts
 * anywhere, so they don't fall into a pattern.
 */
function crackleBuffer(ctx: BaseAudioContext, seconds = 11): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * seconds)
  // A little extra, folded back over the start so the loop has no seam.
  const seam = Math.floor(rate * 0.05)
  const raw = new Float32Array(length + seam)
  let smooth = 0
  for (let i = 0; i < raw.length; i++) {
    smooth += 0.08 * (Math.random() * 2 - 1 - smooth)
    raw[i] = smooth * 0.012
  }
  const ticks = Math.floor(seconds * 4)
  for (let p = 0; p < ticks; p++) {
    const width = 6 + Math.floor(Math.random() * 30)
    const at = Math.floor(Math.random() * (raw.length - width))
    const size = (Math.random() ** 4 * 0.05 + 0.004) * (Math.random() < 0.5 ? -1 : 1)
    for (let k = 0; k < width; k++) raw[at + k] += size * Math.sin((2 * Math.PI * k) / width) * Math.sin((Math.PI * k) / width)
  }
  const buffer = ctx.createBuffer(1, length, rate)
  const data = buffer.getChannelData(0)
  data.set(raw.subarray(0, length))
  for (let i = 0; i < seam; i++) data[i] = raw[i] * (i / seam) + raw[length + i] * (1 - i / seam)
  return buffer
}

/**
 * Karplus–Strong: a burst of noise fed around a short, damped delay line.
 * Low strings are still ringing when the buffer runs out, so its last
 * moments fade to silence rather than stopping dead.
 */
function pluckBuffer(ctx: BaseAudioContext, freq: number, seconds = 2.4): AudioBuffer {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(1, Math.floor(rate * seconds), rate)
  const y = buffer.getChannelData(0)
  // Averaging two samples adds half a sample of delay, so take it off the loop.
  const loop = rate / freq - 0.5
  const start = Math.ceil(loop) + 1
  // A softened pick: smoothed noise has fewer harsh highs.
  let s = 0
  for (let i = 0; i < start; i++) {
    s += 0.5 * (Math.random() * 2 - 1 - s)
    y[i] = s
  }
  for (let i = start; i < y.length; i++) {
    // Read one loop back, between samples, so every note is in tune.
    const d = i - loop
    const i0 = Math.floor(d)
    const fr = d - i0
    const now = y[i0] + (y[i0 + 1] - y[i0]) * fr
    const before = y[i0 - 1] + (y[i0] - y[i0 - 1]) * fr
    y[i] = 0.996 * 0.5 * (now + before)
  }
  const fade = Math.floor(rate * 0.3)
  for (let k = 0; k < fade; k++) y[y.length - 1 - k] *= Math.sin(((k / fade) * Math.PI) / 2) ** 2
  return buffer
}

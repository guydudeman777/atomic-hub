/**
 * Saloon chatter: people at nearby tables talking, laughing and clinking
 * glasses, too far away to make out a word.
 *
 * Each voice is a little formant synthesizer: a buzzing source (the vocal
 * cords) shaped by three resonant filters (the mouth) that hop between vowel
 * shapes a few times a second, with bursts of hiss for consonants. Everyone
 * at a table takes turns, as people do; the tables talk over each other.
 *
 * Like the radio, it's driven by scheduleUntil(), so it can render offline.
 */

import type { Rng } from '../rng'
import { record } from './bank'
import type { Mixer } from './mixer'
import { amp, filter, noise, noiseLoop, osc, panner, strike } from './synth'

/** First three formants of a few vowels, in Hz, for an adult male voice. */
const VOWELS: Record<string, [number, number, number]> = {
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  i: [300, 2200, 2950],
  o: [570, 840, 2410],
  u: [320, 900, 2250],
  uh: [520, 1190, 2390],
  ae: [660, 1720, 2410],
  er: [490, 1350, 1690],
}
const TALK_VOWELS = ['a', 'e', 'i', 'o', 'uh', 'uh', 'ae', 'er', 'e', 'a']

interface Speaker {
  woman: boolean
  /** Speaking pitch, Hz. */
  f0: number
  /** Formant scale: smaller heads, higher formants. */
  size: number
  pan: number
  /** Loudness, which is mostly how far away they sit. */
  level: number
}

interface Table {
  speakers: Speaker[]
  nextAt: number
  last: Speaker | null
}

type Utterance = 'talk' | 'laugh' | 'woo' | 'aww'

const ignore = () => {}

/** Something said once and recorded for reuse, and who said it. */
interface Take {
  kind: Recorded
  woman: boolean
  buffer: AudioBuffer
  /** Seconds until they stop. */
  length: number
}

type Recorded = 'talk' | 'laugh'

/**
 * How many recordings of each voice to make before people start reusing
 * them. In a murmur across a room nobody can tell, and playing a recording
 * costs a fraction of a live voice.
 */
const TAKES: Record<Recorded, number> = { talk: 10, laugh: 3 }

/** A round of applause is a hundred and sixty claps: worth recording a couple and reusing them. */
const APPLAUSE_TAKES = 2
const APPLAUSE_SECONDS = 2.8

/**
 * Everything the crowd has recorded. Pass the same one to the next crowd so
 * that sitting down at another table doesn't mean recording the room again.
 */
export class CrowdTakes {
  readonly voices: Take[] = []
  readonly applause: AudioBuffer[] = []
}

export type CrowdReaction = 'cheer' | 'groan' | 'laugh'

export class Crowd {
  private readonly m: Mixer
  private readonly rng: Rng
  private readonly ctx: BaseAudioContext
  private readonly out: GainNode
  private readonly tables: Table[] = []
  private readonly bed: AudioScheduledSourceNode[] = []
  private readonly takes: CrowdTakes
  private nextClinkAt: number

  constructor(m: Mixer, rng: Rng, startAt: number, takes = new CrowdTakes()) {
    this.m = m
    this.rng = rng
    this.ctx = m.ctx
    this.takes = takes
    const ctx = this.ctx
    // Distance: the room soaks up the highs before anyone's voice reaches you,
    // and the low rumble of voices would only muddy the band's bass.
    this.out = amp(ctx, 1)
    this.out.connect(filter(ctx, 'lowpass', 2600)).connect(filter(ctx, 'highpass', 160)).connect(m.ambience)

    for (let i = 0; i < 4; i++) {
      const pan = (i / 3) * 1.6 - 0.8 + (rng() - 0.5) * 0.2
      const level = 0.5 + rng() * 0.5
      const speakers = Array.from({ length: 2 + Math.floor(rng() * 2) }, () => this.person(pan, level))
      this.tables.push({ speakers, nextAt: startAt + rng() * 2.5, last: null })
    }
    this.nextClinkAt = startAt + 2 + rng() * 6
    // Ready for the first cheer, recorded while nobody's clapping yet.
    if (!takes.applause.length) this.recordApplause()

    // The room itself: a low murmur of everyone further off.
    const fadeIn = amp(ctx)
    fadeIn.gain.setValueAtTime(0, startAt)
    fadeIn.gain.linearRampToValueAtTime(1, startAt + 2)
    fadeIn.connect(this.out)
    for (const [freq, level] of [
      [420, 0.05],
      [1100, 0.02],
    ]) {
      const src = noiseLoop(m, startAt, 'pink')
      const swell = amp(ctx, level)
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.1 + rng() * 0.15
      lfo.connect(amp(ctx, level * 0.4)).connect(swell.gain)
      lfo.start(startAt)
      src.connect(filter(ctx, 'bandpass', freq, 0.8)).connect(swell).connect(fadeIn)
      this.bed.push(src, lfo)
    }
  }

  /**
   * Schedule everyone's talking up to `time`. Anyone who should have spoken
   * before `now` (the page was too busy to ask in time) speaks up now
   * instead, rather than everyone at once.
   */
  scheduleUntil(time: number, now: number) {
    for (const table of this.tables) {
      if (table.nextAt < now) table.nextAt = now + this.rng() * 0.5
      while (table.nextAt < time) {
        const others = table.speakers.filter((s) => s !== table.last)
        const speaker = others[Math.floor(this.rng() * others.length)]
        const end = this.say(speaker, table.nextAt, 'talk')
        table.last = speaker
        // Sometimes somebody laughs at what was said.
        if (this.rng() < 0.12) {
          const listener = table.speakers.find((s) => s !== speaker) ?? speaker
          this.say(listener, end - 0.15, 'laugh')
        }
        // A quick reply, or a lull while they drink.
        table.nextAt = end + (this.rng() < 0.75 ? 0.15 + this.rng() * 0.7 : 2 + this.rng() * 5)
      }
    }
    if (this.nextClinkAt < now) this.nextClinkAt = now + this.rng() * 2
    while (this.nextClinkAt < time) {
      this.clink(this.nextClinkAt)
      this.nextClinkAt += 5 + this.rng() * 14
    }
  }

  /** The room reacts: to the end of a game, or a scene at the next table. */
  react(kind: CrowdReaction, t: number) {
    const everyone = this.tables.flatMap((table) => table.speakers)
    const some = (n: number) => [...everyone].sort(() => this.rng() - 0.5).slice(0, n)
    if (kind === 'cheer') {
      this.applause(t)
      for (const s of some(3)) this.speak(s, t + 0.1 + this.rng() * 0.7, this.rng() < 0.6 ? 'woo' : 'laugh')
    } else if (kind === 'laugh') {
      // Someone at the next table caught that.
      for (const s of some(3)) this.speak(s, t + this.rng() * 0.6, 'laugh')
    } else {
      for (const s of some(4)) this.speak(s, t + this.rng() * 0.2, 'aww')
    }
  }

  /** Everyone fades out from `at`, including what they were about to say. */
  stop(at: number) {
    this.out.gain.setTargetAtTime(0, at, 0.3)
    for (const node of this.bed) node.stop(at + 2)
  }

  private person(pan: number, level: number, woman = this.rng() < 0.45): Speaker {
    return {
      woman,
      f0: woman ? 175 + this.rng() * 60 : 95 + this.rng() * 40,
      size: woman ? 1.14 + this.rng() * 0.06 : 0.97 + this.rng() * 0.06,
      pan: Math.max(-1, Math.min(1, pan + (this.rng() - 0.5) * 0.3)),
      level: level * (0.8 + this.rng() * 0.4),
    }
  }

  /** Someone at a table says something: a recording once there are enough, otherwise live. */
  private say(s: Speaker, t: number, kind: Recorded): number {
    const takes = this.takes.voices.filter((take) => take.kind === kind && take.woman === s.woman)
    if (takes.length >= TAKES[kind]) {
      const take = takes[Math.floor(this.rng() * takes.length)]
      const src = this.ctx.createBufferSource()
      src.buffer = take.buffer
      src.connect(amp(this.ctx, s.level)).connect(panner(this.ctx, s.pan)).connect(this.out)
      src.start(t)
      return t + take.length
    }
    this.recordTake(kind, s.woman)
    return this.speak(s, t, kind)
  }

  private recordTake(kind: Recorded, woman: boolean) {
    const voice = this.person(0, 1, woman)
    let length = 0
    const rate = this.ctx.sampleRate
    const recording = record(4, rate, (ctx, out, t) => {
      length = this.utter(ctx, out, voice, t, kind)
    })
    recording?.then((full) => {
      // Keep only what was said and its tail, not the silence after.
      const frames = Math.min(full.length, Math.ceil((length + 0.35) * rate))
      const buffer = this.ctx.createBuffer(1, frames, rate)
      buffer.copyToChannel(full.getChannelData(0).subarray(0, frames), 0)
      this.takes.voices.push({ kind, woman, buffer, length })
    }, ignore)
  }

  /** Someone says something live, from where they sit. */
  private speak(s: Speaker, t: number, kind: Utterance): number {
    const pan = panner(this.ctx, s.pan)
    pan.connect(this.out)
    return this.utter(this.ctx, pan, s, t, kind)
  }

  /** One person saying one thing, into any context. Returns when they stop. */
  private utter(ctx: BaseAudioContext, out: AudioNode, s: Speaker, t: number, kind: Utterance): number {
    const { rng } = this
    const voice = ctx.createOscillator()
    voice.type = 'sawtooth'
    voice.frequency.setValueAtTime(s.f0, t)
    voice.start(t)
    const air = noiseLoop({ ...this.m, ctx }, t)
    const breath = amp(ctx, 0.04)
    air.connect(breath)

    const mouth = amp(ctx, 0)
    mouth.connect(out)
    const formants = [
      [1, 5],
      [0.55, 7],
      [0.28, 9],
    ].map(([gain, q]) => {
      const f = filter(ctx, 'bandpass', 500, q)
      voice.connect(f)
      breath.connect(f)
      f.connect(amp(ctx, gain)).connect(mouth)
      return f
    })
    const hiss = amp(ctx, 0)
    air.connect(filter(ctx, 'bandpass', 4200 + rng() * 1500, 1.4)).connect(hiss).connect(out)

    const shape = (vowel: string, at: number, glide = 0.02) =>
      VOWELS[vowel].forEach((f, k) => formants[k].frequency.setTargetAtTime(f * s.size, at, glide))

    let at = t
    const level = s.level
    mouth.gain.setValueAtTime(0, t)

    if (kind === 'talk') {
      const syllables = 3 + Math.floor(rng() * 11)
      const question = rng() < 0.2
      for (let i = 0; i < syllables; i++) {
        const length = 0.1 + rng() * 0.14
        shape(TALK_VOWELS[Math.floor(rng() * TALK_VOWELS.length)], at)
        // Pitch drifts down over a sentence, with stressed syllables and the odd question.
        const rising = question && i >= syllables - 2 ? 1.18 + (i - syllables + 2) * 0.1 : 1
        const stress = rng() < 0.25 ? 1.12 : 1
        voice.frequency.setTargetAtTime(s.f0 * (1.1 - 0.22 * (i / syllables)) * stress * rising * (0.97 + rng() * 0.06), at, 0.03)
        const loud = level * (0.6 + rng() * 0.4) * (stress > 1 ? 1.15 : 1)
        mouth.gain.setTargetAtTime(loud, at + 0.005, 0.015)
        mouth.gain.setTargetAtTime(loud * 0.12, at + length * 0.72, 0.018)
        if (rng() < 0.45) {
          const c = at + length * 0.8
          hiss.gain.setValueAtTime(0, c)
          hiss.gain.linearRampToValueAtTime(loud * 0.05, c + 0.012)
          hiss.gain.linearRampToValueAtTime(0, c + 0.04 + rng() * 0.04)
        }
        at += length
        if (i < syllables - 1 && rng() < 0.12) {
          mouth.gain.setTargetAtTime(0, at, 0.02)
          at += 0.06 + rng() * 0.15
        }
      }
    } else if (kind === 'laugh') {
      const ha = 4 + Math.floor(rng() * 4)
      shape('a', t, 0.005)
      for (let i = 0; i < ha; i++) {
        const loud = level * (1 - i / (ha + 2))
        voice.frequency.setTargetAtTime(s.f0 * 1.5 * (1 - i * 0.04), at, 0.01)
        // h: a puff of breath before every vowel.
        breath.gain.setTargetAtTime(0.5, at, 0.005)
        breath.gain.setTargetAtTime(0.06, at + 0.035, 0.01)
        mouth.gain.setTargetAtTime(loud, at + 0.02, 0.012)
        mouth.gain.setTargetAtTime(loud * 0.05, at + 0.1, 0.015)
        at += 0.13 + rng() * 0.04
      }
    } else {
      // A whoop going up, or a sympathetic "aww" coming down.
      const woo = kind === 'woo'
      const length = woo ? 0.7 : 0.95
      shape(woo ? 'u' : 'a', t, 0.01)
      shape('o', t + length * 0.5, 0.15)
      voice.frequency.setValueAtTime(s.f0 * (woo ? 1.4 : 1.35), t)
      voice.frequency.exponentialRampToValueAtTime(s.f0 * (woo ? 2.1 : 0.95), t + length * (woo ? 0.55 : 0.9))
      mouth.gain.setTargetAtTime(level * (woo ? 1.1 : 0.8), t, 0.04)
      mouth.gain.setTargetAtTime(level * (woo ? 0.8 : 0.55), t + length * 0.5, 0.1)
      at = t + length
    }

    mouth.gain.setTargetAtTime(0, at, 0.03)
    voice.stop(at + 0.3)
    air.stop(at + 0.3)
    return at
  }

  /** A round of applause: from a recording once there is one, otherwise live. */
  private applause(t: number) {
    const { applause } = this.takes
    if (applause.length < APPLAUSE_TAKES) this.recordApplause()
    if (!applause.length) {
      this.clapping(this.ctx, this.out, t)
      return
    }
    const src = this.ctx.createBufferSource()
    src.buffer = applause[Math.floor(this.rng() * applause.length)]
    src.connect(this.out)
    src.start(t)
  }

  private recordApplause() {
    const recording = record(APPLAUSE_SECONDS + 0.3, this.ctx.sampleRate, (ctx, out, t) => this.clapping(ctx, out, t), 2)
    recording?.then((buffer) => this.takes.applause.push(buffer), ignore)
  }

  /** Hands clapping all over the room, quickly building and slowly thinning out. */
  private clapping(ctx: BaseAudioContext, out: AudioNode, t: number) {
    const { rng } = this
    const length = APPLAUSE_SECONDS
    for (let i = 0; i < 160; i++) {
      const at = t + 0.05 + length * rng() ** 1.7
      const fade = 1 - (at - t) / (length + 0.3)
      const env = amp(ctx)
      strike(env.gain, at, (0.25 + rng() * 0.35) * fade, 0.03 + rng() * 0.03, 0.001)
      noise({ ...this.m, ctx }, at, 0.07)
        .connect(filter(ctx, 'bandpass', 700 + rng() * 1500, 1.2 + rng()))
        .connect(env)
        .connect(panner(ctx, rng() * 1.8 - 0.9))
        .connect(out)
    }
  }

  /** Two glasses touching somewhere across the room. */
  private clink(t: number) {
    const { ctx, rng } = this
    const pan = panner(ctx, rng() * 1.6 - 0.8)
    pan.connect(this.out)
    const toasts = rng() < 0.4 ? 2 : 1
    for (let n = 0; n < toasts; n++) {
      const at = t + n * (0.09 + rng() * 0.08)
      const f = 1900 + rng() * 900
      ;[1, 2.71, 5.15].forEach((ratio, k) => {
        const env = amp(ctx)
        strike(env.gain, at, (0.05 / (k + 1)) * (n ? 0.7 : 1), 0.5 / (1 + k), 0.001)
        osc(ctx, 'sine', f * ratio, at, 0.6).connect(env).connect(pan)
      })
    }
  }
}

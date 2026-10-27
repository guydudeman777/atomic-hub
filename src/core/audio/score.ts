/**
 * What the saloon radio plays, as plain data and pure functions: songs as
 * chord charts, and the rules that turn a chart into a walking bass line,
 * piano voicings and a melody. music.ts turns these notes into sound.
 *
 * Pitches are MIDI note numbers (60 is middle C). Positions and lengths are
 * in beats from the start of the bar; swing is applied when the notes are
 * played, not here.
 */

import type { Rng } from '../rng'

export interface Chord {
  symbol: string
  /** Pitch class, 0–11. */
  root: number
  /** Pitch classes, root first. */
  tones: number[]
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
}

export function parseChord(symbol: string): Chord {
  const match = /^([A-G])([b#]?)(.*)$/.exec(symbol)
  if (!match || !(match[3] in QUALITIES)) throw new Error(`Unknown chord: ${symbol}`)
  const root = (LETTERS[match[1]] + (match[2] === 'b' ? 11 : match[2] === '#' ? 1 : 0)) % 12
  return { symbol, root, tones: QUALITIES[match[3]].map((i) => (root + i) % 12) }
}

export type Feel = 'swing' | 'waltz' | 'shuffle'
export type Lead = 'vibes' | 'guitar' | 'whistle'

export interface Song {
  title: string
  bpm: number
  feel: Feel
  /** Bars, one chord symbol each; a bar with two chords splits evenly. */
  chart: string[]
  /** Pitch classes the melody steps through between chord tones. */
  scale: number[]
  /** Instruments for the tune and for the choruses in between. */
  leads: [head: Lead, solo: Lead]
  choruses: number
}

export const SONGS: readonly Song[] = [
  {
    title: 'Lamplight Swing',
    bpm: 92,
    feel: 'swing',
    chart: [
      'Fmaj7', 'Dm7', 'Gm7', 'C7', 'Am7', 'D7', 'Gm7 C7', 'Fmaj7',
      'Fmaj7', 'F7', 'Bbmaj7', 'Bbm6', 'Am7', 'D7', 'Gm7 C7', 'F6',
    ],
    scale: [5, 7, 9, 10, 0, 2, 4],
    leads: ['vibes', 'guitar'],
    choruses: 3,
  },
  {
    title: 'Dust Road Waltz',
    bpm: 104,
    feel: 'waltz',
    chart: [
      'Dm', 'Dm', 'Gm', 'Dm', 'A7', 'A7', 'Dm', 'Dm',
      'Bb', 'F', 'Gm', 'A7', 'Dm', 'Gm', 'A7', 'Dm',
    ],
    // Harmonic minor: the raised seventh gives it that desert-road lilt.
    scale: [2, 4, 5, 7, 9, 10, 1],
    leads: ['whistle', 'guitar'],
    choruses: 4,
  },
  {
    title: 'Slow Burn Blues',
    bpm: 76,
    feel: 'shuffle',
    chart: ['Bb7', 'Eb7', 'Bb7', 'Bb7', 'Eb7', 'Eb7', 'Bb7', 'G7', 'Cm7', 'F7', 'Bb7', 'F7'],
    // Mixolydian with the blue minor third.
    scale: [10, 0, 1, 2, 3, 5, 7, 8],
    leads: ['guitar', 'vibes'],
    choruses: 3,
  },
]

export const beatsPerBar = (song: Song) => (song.feel === 'waltz' ? 3 : 4)

/** Swing ratio: where the off-beat eighth lands, as a fraction of the beat. */
export const swingOf = (song: Song) => (song.feel === 'swing' ? 0.62 : song.feel === 'shuffle' ? 0.67 : 0.5)

export interface Chart {
  song: Song
  beats: number
  /** The chord on every beat of every bar. */
  bars: Chord[][]
}

export function chartOf(song: Song): Chart {
  const beats = beatsPerBar(song)
  const bars = song.chart.map((bar) => {
    const chords = bar.split(' ').map(parseChord)
    return Array.from({ length: beats }, (_, b) => chords[Math.floor((b * chords.length) / beats)])
  })
  return { song, beats, bars }
}

/** The chord at a bar and beat, wrapping around the chart. */
export function chordAt(chart: Chart, bar: number, beat = 0): Chord {
  const n = chart.bars.length
  const b = Math.floor(beat / chart.beats)
  return chart.bars[(((bar + b) % n) + n) % n][beat % chart.beats]
}

export interface Note {
  /** Beats from the start of the bar. */
  at: number
  pitch: number
  /** In beats. */
  length: number
  /** 0–1. */
  velocity: number
}

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]

/** The note with pitch class `pc` closest to `near`. */
export function nearest(pc: number, near: number): number {
  const base = near - ((((near - pc) % 12) + 12) % 12)
  return near - base <= 6 ? base : base + 12
}

function clampOctave(pitch: number, low: number, high: number): number {
  let p = pitch
  while (p < low) p += 12
  while (p > high) p -= 12
  return p
}

// ---------------------------------------------------------------------------
// Bass

export const BASS_RANGE = [28, 50] as const

/**
 * One bar of upright bass. Swing walks in quarter notes: the root when the
 * chord changes, chord tones in between, and a step into the next chord's
 * root on the last beat before it. The waltz goes oom-pah-pah, alternating
 * root and fifth; the blues shuffle climbs and falls a boogie pattern.
 */
export function bassLine(chart: Chart, bar: number, prev: number, rng: Rng): Note[] {
  const [low, high] = BASS_RANGE
  const fit = (pc: number, near: number) => clampOctave(nearest(pc, near), low, high)
  const chords = chart.bars[bar % chart.bars.length]
  const feel = chart.song.feel

  if (feel === 'waltz') {
    const repeat = chordAt(chart, bar - 1).symbol === chords[0].symbol && bar % 2 === 1
    const first = fit(repeat ? chords[0].tones[2] : chords[0].root, prev)
    const notes: Note[] = [{ at: 0, pitch: first, length: 1.6, velocity: 0.9 }]
    const next = chordAt(chart, bar + 1)
    if (next.symbol !== chords[0].symbol && rng() < 0.5) {
      const target = fit(next.root, first)
      notes.push({ at: 2, pitch: clampOctave(target + (rng() < 0.5 ? -1 : 2), low, high), length: 0.9, velocity: 0.6 })
    }
    return notes
  }

  if (feel === 'shuffle') {
    const chord = chords[0]
    const third = (chord.tones[1] - chord.root + 12) % 12
    const changed = chordAt(chart, bar - 1).symbol !== chord.symbol
    const steps = changed || bar % 2 === 0 ? [0, third, 7, 9] : [10, 9, 7, third]
    const root = fit(chord.root, prev)
    return steps.map((s, i) => ({
      at: i,
      pitch: clampOctave(root + ((s + 12) % 12), low, high),
      length: 0.9,
      velocity: i % 2 === 0 ? 0.75 : 0.62,
    }))
  }

  const notes: Note[] = []
  let last = prev
  for (let beat = 0; beat < chart.beats; beat++) {
    const chord = chords[beat]
    const following = chordAt(chart, bar, beat + 1)
    const starts = beat === 0 || chords[beat - 1] !== chord
    let pitch: number
    if (starts) {
      pitch = fit(chord.root, last)
    } else if (following !== chord || beat === chart.beats - 1) {
      // Approach the next root from a half step or a whole step away.
      const target = fit(following.root, last)
      const offset = pick([-1, 1, -2, 2, -1, 1], rng)
      pitch = clampOctave(target + offset, low, high)
      if (pitch === last) pitch = clampOctave(target - offset, low, high)
    } else {
      const options = chord.tones.slice(1).map((pc) => fit(pc, last)).filter((p) => p !== last)
      pitch = pick(options, rng)
    }
    notes.push({ at: beat, pitch, length: 0.92, velocity: beat % 2 === 0 ? 0.9 : 0.78 })
    last = pitch
  }
  return notes
}

// ---------------------------------------------------------------------------
// Piano comping

export const VOICING_RANGE = [52, 74] as const

/**
 * A close-position voicing of the chord in the middle register, choosing the
 * inversion that moves least from the previous voicing.
 */
export function voicing(chord: Chord, prev: readonly number[] | null): number[] {
  const [low, high] = VOICING_RANGE
  const pcs = chord.tones.length > 3 ? chord.tones.slice(1).concat(chord.tones[0]) : chord.tones
  const candidates: number[][] = []
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv))
    for (let start = low; start < low + 12; start++) {
      if (start % 12 !== order[0]) continue
      const notes: number[] = [start]
      for (const pc of order.slice(1)) {
        const top = notes[notes.length - 1]
        notes.push(top + ((((pc - top) % 12) + 12) % 12 || 12))
      }
      if (notes[notes.length - 1] <= high) candidates.push(notes)
    }
  }
  const centre = prev && prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 62
  const cost = (notes: number[]) => Math.abs(notes.reduce((a, b) => a + b, 0) / notes.length - centre)
  return candidates.reduce((best, c) => (cost(c) < cost(best) ? c : best))
}

const COMPING: Record<Feel, { at: number; length: number }[][]> = {
  swing: [
    [{ at: 0, length: 1.2 }, { at: 1.5, length: 1 }],
    [{ at: 1, length: 0.7 }, { at: 3, length: 0.7 }],
    [{ at: 0, length: 2.4 }, { at: 2.5, length: 1.2 }],
    [{ at: 1.5, length: 0.5 }, { at: 2.5, length: 1.3 }],
    [{ at: 0, length: 3.5 }],
  ],
  waltz: [
    [{ at: 1, length: 0.7 }, { at: 2, length: 0.7 }],
    [{ at: 1, length: 0.7 }, { at: 2, length: 0.7 }],
    [{ at: 1, length: 1.7 }],
  ],
  shuffle: [
    [{ at: 1, length: 0.5 }, { at: 3, length: 0.5 }],
    [{ at: 0, length: 1.4 }, { at: 1.5, length: 0.5 }, { at: 3, length: 0.8 }],
    [{ at: 1.5, length: 1.3 }, { at: 3.5, length: 0.4 }],
  ],
}

export interface Comp {
  at: number
  length: number
  velocity: number
  pitches: number[]
}

/** Chord hits for one bar. A bar with two chords always gets a hit on each. */
export function comping(chart: Chart, bar: number, prev: readonly number[] | null, rng: Rng): Comp[] {
  const chords = chart.bars[bar % chart.bars.length]
  const split = chords.findIndex((c) => c !== chords[0])
  const rhythm =
    split > 0
      ? [
          { at: 0, length: split - 0.2 },
          { at: split, length: chart.beats - split - 0.2 },
        ]
      : pick(COMPING[chart.song.feel], rng)
  let last = prev
  return rhythm.map((hit) => {
    const pitches = voicing(chords[Math.floor(hit.at)], last)
    last = pitches
    const accent = hit.at === 0 || hit.at === split ? 0.85 : 0.7
    return { ...hit, velocity: accent + rng() * 0.15, pitches }
  })
}

// ---------------------------------------------------------------------------
// Melody

export const MELODY_RANGE = [62, 81] as const

/**
 * A two-bar idea: a rhythm and a contour (scale steps between notes). A
 * chorus repeats a few motifs over different chords, which is what makes it
 * sound like a tune instead of random notes.
 */
export interface Motif {
  rhythm: { at: number; length: number }[]
  steps: number[]
}

const RHYTHMS: Record<3 | 4, { at: number; length: number }[][]> = {
  4: [
    [{ at: 0, length: 1.5 }, { at: 1.5, length: 0.5 }, { at: 2, length: 1 }, { at: 3, length: 1 }, { at: 4, length: 3 }],
    [{ at: 0.5, length: 0.5 }, { at: 1, length: 0.5 }, { at: 1.5, length: 1.5 }, { at: 3, length: 1 }, { at: 4, length: 2.5 }],
    [{ at: 0, length: 1 }, { at: 1, length: 1 }, { at: 2, length: 2 }, { at: 4.5, length: 0.5 }, { at: 5, length: 0.5 }, { at: 5.5, length: 2 }],
    [{ at: 1, length: 0.5 }, { at: 1.5, length: 0.5 }, { at: 2, length: 0.5 }, { at: 2.5, length: 1.5 }, { at: 4, length: 0.5 }, { at: 4.5, length: 0.5 }, { at: 5, length: 2 }],
    [{ at: 2, length: 0.5 }, { at: 2.5, length: 0.5 }, { at: 3, length: 0.5 }, { at: 3.5, length: 2.5 }, { at: 6.5, length: 0.5 }, { at: 7, length: 1 }],
    [{ at: 0, length: 2 }, { at: 2, length: 1 }, { at: 3, length: 1 }, { at: 4, length: 3.5 }],
  ],
  3: [
    [{ at: 0, length: 2 }, { at: 2, length: 1 }, { at: 3, length: 3 }],
    [{ at: 0, length: 1 }, { at: 1, length: 1 }, { at: 2, length: 1 }, { at: 3, length: 2 }, { at: 5, length: 1 }],
    [{ at: 1, length: 1 }, { at: 2, length: 1 }, { at: 3, length: 1.5 }, { at: 4.5, length: 0.5 }, { at: 5, length: 1 }],
    [{ at: 0, length: 1.5 }, { at: 1.5, length: 0.5 }, { at: 2, length: 1 }, { at: 3, length: 3 }],
  ],
}

const STEPS = [-2, -1, -1, -1, 0, 1, 1, 1, 2, 2, -3, 3]

export function makeMotif(beats: number, rng: Rng): Motif {
  const rhythm = pick(RHYTHMS[beats === 3 ? 3 : 4], rng)
  return { rhythm, steps: rhythm.map((_, i) => (i === 0 ? 0 : pick(STEPS, rng))) }
}

/** Move `steps` notes along the scale from `pitch`. */
export function scaleStep(pitch: number, steps: number, scale: readonly number[]): number {
  let p = pitch
  const dir = Math.sign(steps)
  for (let i = 0; i < Math.abs(steps); i++) {
    do p += dir
    while (!scale.includes(((p % 12) + 12) % 12))
  }
  return p
}

function nearestChordTone(chord: Chord, pitch: number): number {
  return chord.tones.map((pc) => nearest(pc, pitch)).reduce((best, p) => (Math.abs(p - pitch) < Math.abs(best - pitch) ? p : best))
}

export type Slot = 'A' | 'B' | 'end' | 'rest'

/** How a chorus is laid out in two-bar phrases. */
export function formOf(chart: Chart): Slot[] {
  if (chart.bars.length === 12) return ['A', 'rest', 'A', 'rest', 'B', 'end']
  return ['A', 'A', 'B', 'end', 'A', 'A', 'B', 'end']
}

export interface Tune {
  A: Motif
  B: Motif
}

export function makeTune(chart: Chart, rng: Rng): Tune {
  return { A: makeMotif(chart.beats, rng), B: makeMotif(chart.beats, rng) }
}

/**
 * The melody for a whole chorus, as notes per bar. Strong beats land on
 * chord tones; everything stays inside the singing range.
 */
export function chorusMelody(chart: Chart, tune: Tune): Note[][] {
  const [low, high] = MELODY_RANGE
  const bars: Note[][] = chart.bars.map(() => [])
  let pitch = nearestChordTone(chordAt(chart, 0), 69)
  formOf(chart).forEach((slot, phrase) => {
    const start = phrase * 2
    if (slot === 'rest') return
    if (slot === 'end') {
      // Settle onto the chord: a held chord tone, a step, then a long chord tone.
      const target = clampOctave(nearestChordTone(chordAt(chart, start + 1), pitch), low, high)
      const held = clampOctave(nearestChordTone(chordAt(chart, start), scaleStep(target, 2, chart.song.scale)), low, high)
      bars[start].push({ at: 0, pitch: held, length: chart.beats - 1, velocity: 0.8 })
      const step = clampOctave(scaleStep(target, held > target ? 1 : -1, chart.song.scale), low, high)
      bars[start].push({ at: chart.beats - 1, pitch: step, length: 1, velocity: 0.75 })
      bars[start + 1].push({ at: 0, pitch: target, length: chart.beats + 0.5, velocity: 0.85 })
      pitch = target
      return
    }
    const motif = tune[slot]
    // Each statement starts near where the last one began, so repeats sound like repeats.
    let p = clampOctave(nearestChordTone(chordAt(chart, start), slot === 'A' ? 69 : 72), low, high)
    motif.rhythm.forEach((r, i) => {
      if (i > 0) p = scaleStep(p, motif.steps[i], chart.song.scale)
      const barOffset = Math.floor(r.at / chart.beats)
      const beat = r.at - barOffset * chart.beats
      const chord = chordAt(chart, start + barOffset, Math.floor(beat))
      const strong = beat % 1 === 0 && (beat === 0 || r.length >= 1)
      if (strong) p = nearestChordTone(chord, p)
      p = clampOctave(p, low, high)
      bars[start + barOffset].push({ at: beat, pitch: p, length: r.length, velocity: strong ? 0.85 : 0.7 })
    })
    pitch = p
  })
  return bars
}

import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import {
  BASS_RANGE,
  MELODY_RANGE,
  SONGS,
  VOICING_RANGE,
  bassLine,
  chartOf,
  chordAt,
  chorusMelody,
  comping,
  makeTune,
  nearest,
  parseChord,
  scaleStep,
} from './score'

const pc = (midi: number) => ((midi % 12) + 12) % 12

describe('chords', () => {
  it('reads roots, accidentals and qualities', () => {
    expect(parseChord('Bbm6')).toEqual({ symbol: 'Bbm6', root: 10, tones: [10, 1, 5, 7] })
    expect(parseChord('F#7').tones).toEqual([6, 10, 1, 4])
    expect(parseChord('Cmaj7').tones).toEqual([0, 4, 7, 11])
    expect(parseChord('A').tones).toEqual([9, 1, 4])
  })

  it('rejects chords it does not know', () => {
    expect(() => parseChord('H7')).toThrow()
    expect(() => parseChord('Csus4')).toThrow()
  })

  it('finds the nearest note with a given pitch class', () => {
    expect(nearest(0, 62)).toBe(60)
    expect(nearest(5, 62)).toBe(65)
    expect(nearest(2, 62)).toBe(62)
  })

  it('steps along a scale', () => {
    const fMajor = SONGS[0].scale
    expect(scaleStep(65, 1, fMajor)).toBe(67)
    expect(scaleStep(69, 1, fMajor)).toBe(70)
    expect(scaleStep(65, -2, fMajor)).toBe(62)
    expect(scaleStep(65, 0, fMajor)).toBe(65)
  })
})

describe.each(SONGS.map((song) => [song.title, song] as const))('%s', (_, song) => {
  const chart = chartOf(song)

  it('has a chord on every beat', () => {
    for (const bar of chart.bars) {
      expect(bar).toHaveLength(chart.beats)
      for (const chord of bar) expect(chord.tones.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('walks the bass in range, landing on the root or fifth when the chord changes', () => {
    const rng = createRng(1)
    let prev = 41
    for (let pass = 0; pass < 4; pass++) {
      chart.bars.forEach((bar, b) => {
        const notes = bassLine(chart, b, prev, rng)
        expect(notes.length).toBeGreaterThan(0)
        for (const n of notes) {
          expect(n.pitch).toBeGreaterThanOrEqual(BASS_RANGE[0])
          expect(n.pitch).toBeLessThanOrEqual(BASS_RANGE[1])
          expect(Math.abs(n.pitch - prev)).toBeLessThanOrEqual(12)
          prev = n.pitch
        }
        const first = pc(notes[0].pitch)
        const chord = bar[0]
        if (chordAt(chart, b - 1).symbol !== chord.symbol) expect(first).toBe(chord.root)
        else expect([chord.root, chord.tones[2], chord.tones[3]]).toContain(first)
      })
    }
  })

  it('voices chords in the middle register with smooth voice leading', () => {
    const rng = createRng(2)
    let prev: number[] | null = null
    chart.bars.forEach((bar, b) => {
      for (const hit of comping(chart, b, prev, rng)) {
        const chord = bar[Math.floor(hit.at)]
        expect(hit.pitches.map(pc).sort()).toEqual([...chord.tones].sort())
        for (const p of hit.pitches) {
          expect(p).toBeGreaterThanOrEqual(VOICING_RANGE[0])
          expect(p).toBeLessThanOrEqual(VOICING_RANGE[1])
        }
        if (prev) expect(Math.abs(hit.pitches[0] - prev[0])).toBeLessThanOrEqual(7)
        prev = hit.pitches
      }
    })
  })

  it('writes a singable melody that lands on chord tones', () => {
    const rng = createRng(3)
    for (let i = 0; i < 20; i++) {
      const melody = chorusMelody(chart, makeTune(chart, rng))
      expect(melody).toHaveLength(chart.bars.length)
      melody.forEach((notes, b) => {
        for (const n of notes) {
          expect(n.pitch).toBeGreaterThanOrEqual(MELODY_RANGE[0])
          expect(n.pitch).toBeLessThanOrEqual(MELODY_RANGE[1])
          expect(n.at).toBeLessThan(chart.beats)
          if (n.at === 0) expect(chart.bars[b][0].tones).toContain(pc(n.pitch))
        }
      })
    }
  })

  it('plays the same tune the same way every time', () => {
    const tune = makeTune(chart, createRng(4))
    expect(chorusMelody(chart, tune)).toEqual(chorusMelody(chart, tune))
  })
})

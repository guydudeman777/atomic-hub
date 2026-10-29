import { describe, expect, it } from 'vitest'
import { evaluate, lineOf, spin } from '../engine'
import { MACHINES, MACHINE_IDS } from '../machines'
import { REEL_MS, STEP, idleStops, litReels, restAngle, turnAngles } from './reels'
import { REEL_STOP_MS, SETTLE_MS } from './session'

describe('the reels’ turn', () => {
  it('always turns backwards, so the symbols come down the window, through its turns and less than one more', () => {
    for (let reel = 0; reel < 3; reel++) {
      for (const [from, to] of [
        [0, 0],
        [0, 21],
        [21, 0],
        [7, 3],
        [3, 7],
      ]) {
        const turn = turnAngles(from, to, reel)
        expect(turn.from).toBe(restAngle(from))
        const travel = turn.from - turn.to
        expect(travel).toBeGreaterThanOrEqual(360 * (2 + reel))
        expect(travel).toBeLessThan(360 * (3 + reel))
        // It ends where the stop rests, give or take whole turns.
        expect((((turn.to - restAngle(to)) % 360) + 360) % 360).toBeCloseTo(0, 9)
      }
    }
  })

  it('lets the later reels turn longer, and every reel finish before the win is paid', () => {
    expect(STEP * 22).toBeCloseTo(360)
    expect(REEL_MS[0]).toBeLessThan(REEL_MS[1])
    expect(REEL_MS[1]).toBeLessThan(REEL_MS[2])
    expect(Math.max(...REEL_MS)).toBeLessThan(SETTLE_MS)
    REEL_MS.forEach((ms, i) => expect(ms * 0.9).toBeCloseTo(REEL_STOP_MS[i], -1))
  })
})

describe('a machine at rest', () => {
  it('shows symbols on the line, and nothing that pays', () => {
    for (const id of MACHINE_IDS) {
      for (let seed = 1; seed < 40; seed++) {
        const stops = idleStops(MACHINES[id], seed)
        // Bottle Caps pays any three symbols, so it rests with a blank in the middle.
        expect(stops.filter((s) => s % 2 === 0).length).toBe(id === 'caps' ? 2 : 3)
        expect(evaluate(MACHINES[id], lineOf(MACHINES[id], stops), 1)).toBeNull()
      }
      expect(idleStops(MACHINES[id], 5)).toEqual(idleStops(MACHINES[id], 5))
    }
  })
})

describe('a win on the glass', () => {
  it('lights all three reels for a line, and only the counted symbols for an "any"', () => {
    const { caps, sevens } = MACHINES
    expect(litReels(caps, spin(caps, [0, 0, 0], 1))).toEqual([true, true, true])
    // Cherry, blank, blank: the cherry on reel 1 is at stop 2.
    const cherry = spin(caps, [2, 1, 1], 1)
    expect(cherry.line).toEqual(['cherry', 'blank', 'blank'])
    expect(litReels(caps, cherry)).toEqual([true, false, false])
    expect(litReels(sevens, spin(sevens, [1, 1, 1], 1))).toEqual([false, false, false])
  })
})

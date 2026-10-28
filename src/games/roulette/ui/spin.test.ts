import { describe, expect, it } from 'vitest'
import { DOUBLE_ZERO, WHEEL_ORDER } from '../engine'
import { BALL_EASE, ROTOR_MS, bezier, frameFor, pocketAngle, rotorAt } from './spin'

const mod = (a: number) => ((a % 360) + 360) % 360

describe('a spin’s movement', () => {
  it('times like CSS’s cubic-bezier', () => {
    expect(bezier([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 4)
    expect(bezier(BALL_EASE, 0)).toBe(0)
    expect(bezier(BALL_EASE, 1)).toBe(1)
    let last = 0
    for (let x = 0.05; x <= 1; x += 0.05) {
      const y = bezier(BALL_EASE, x)
      expect(y).toBeGreaterThanOrEqual(last)
      last = y
    }
    // An ease-out: well ahead halfway through.
    expect(bezier(BALL_EASE, 0.5)).toBeGreaterThan(0.8)
  })

  it('brings the ball to rest in its own pocket, after six or seven turns', () => {
    for (const wheel of ['european', 'american'] as const) {
      for (const pocket of WHEEL_ORDER[wheel]) {
        const f = frameFor(wheel, pocket + 3, pocket, null, 0)
        expect(mod(f.ballTo - pocketAngle(wheel, pocket))).toBeCloseTo(0, 6)
        const turns = (f.ballFrom - f.ballTo) / 360
        expect(turns).toBeGreaterThanOrEqual(6)
        expect(turns).toBeLessThan(7)
      }
    }
  })

  it('starts each spin where the rotor is, even before the last one has stopped', () => {
    const first = frameFor('european', 1, 17, null, 0)
    expect(rotorAt(first, ROTOR_MS)).toBe(first.rotorTo)
    const midway = rotorAt(first, ROTOR_MS / 2)
    const next = frameFor('european', 2, 0, first, ROTOR_MS / 2)
    expect(next.rotorFrom).toBeCloseTo(midway % 360, 6)
    expect(next.rotorTo).toBeGreaterThan(next.rotorFrom)
  })

  it('puts the American wheel’s double zero across from its zero', () => {
    expect(pocketAngle('american', DOUBLE_ZERO)).toBe(180)
  })
})

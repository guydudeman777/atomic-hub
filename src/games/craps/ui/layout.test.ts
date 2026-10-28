import { describe, expect, it } from 'vitest'
import { type BetSpot, POINTS } from '../engine'
import { type Layout, type Rect, TALL_MAX, TALL_MIN, WIDE_LAYOUT, ZONE_SPOTS, tallLayout } from './layout'

const layouts: [string, Layout][] = [['wide', WIDE_LAYOUT]]
for (let h = TALL_MIN; h <= TALL_MAX; h += 50) layouts.push([`tall ${h}`, tallLayout(h)])

const inside = (r: Rect, outer: Rect) => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('the craps layout', () => {
  for (const [name, layout] of layouts) {
    it(`keeps every bet on the felt, apart from the others (${name})`, () => {
      const { shape, zoneOf } = layout
      const zones = ZONE_SPOTS.map((spot) => [spot, zoneOf(spot)!] as const)
      for (const [spot, r] of zones) {
        expect(inside(r, shape.felt), spot).toBe(true)
        expect(r.y, `${spot} below the landing`).toBeGreaterThanOrEqual(shape.landing.y + shape.landing.h)
      }
      for (let i = 0; i < zones.length; i++) {
        for (let j = i + 1; j < zones.length; j++) expect(overlap(zones[i][1], zones[j][1]), `${zones[i][0]} and ${zones[j][0]}`).toBe(false)
      }
    })

    it(`puts chips in their own box (${name})`, () => {
      const { zoneOf, chipsAt } = layout
      const spots: BetSpot[] = [...ZONE_SPOTS, ...POINTS.flatMap((n) => [`come-${n}`, `dont-come-${n}`] as BetSpot[])]
      for (const spot of spots) {
        const box = zoneOf(spot) ?? zoneOf(`place-${spot.split('-').at(-1)}` as BetSpot)!
        const p = chipsAt(spot)
        expect(p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h, spot).toBe(true)
      }
    })
  }

  it('fits the tall layout to the phone: deeper on longer screens, within its range', () => {
    expect(tallLayout(1000).shape.h).toBe(TALL_MIN)
    expect(tallLayout(1620).shape.h).toBe(1600)
    expect(tallLayout(5000).shape.h).toBe(TALL_MAX)
    expect(tallLayout(1500).shape.numbers[4].h).toBeGreaterThan(tallLayout(TALL_MIN).shape.numbers[4].h)
  })
})

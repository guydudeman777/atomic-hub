import { describe, expect, it } from 'vitest'
import { type Axes, type Layout, FELT_W, SPOT_INDEXES, TALL_MAX, TALL_MIN, WIDE_LAYOUT, tallLayout } from './layout'

/** How far out a point sits on an ellipse around the dealer: under 1 is inside. */
const reach = (x: number, y: number, { rx, ry }: Axes) => ((x - FELT_W / 2) / rx) ** 2 + (y / ry) ** 2

const layouts: [string, Layout][] = [
  ['wide', WIDE_LAYOUT],
  ...[TALL_MIN, 1300, TALL_MAX].map((h): [string, Layout] => [`tall ${h}`, tallLayout(h)]),
]

describe.each(layouts)('the %s table', (_, layout) => {
  const { shape } = layout

  it('keeps every betting circle on the felt', () => {
    const inside = { rx: shape.felt.rx - shape.circleR, ry: shape.felt.ry - shape.circleR }
    for (const spot of SPOT_INDEXES) {
      const c = layout.circleOf(spot)
      expect(reach(c.x, c.y, inside), `spot ${spot}`).toBeLessThan(1)
    }
  })

  it('puts the name plates on the rail', () => {
    for (const spot of SPOT_INDEXES) {
      const p = layout.plateOf(spot)
      expect(reach(p.x, p.y, shape.felt)).toBeGreaterThan(1)
      expect(reach(p.x, p.y, shape.rail)).toBeLessThan(1)
    }
  })

  it('leaves a card’s width between neighbouring spots’ first cards', () => {
    for (const spot of SPOT_INDEXES.slice(1)) {
      const a = layout.cardInHand(spot - 1, 0, 1, 0)
      const b = layout.cardInHand(spot, 0, 1, 0)
      expect(Math.hypot(a.x - b.x, a.y - b.y), `spots ${spot - 1} and ${spot}`).toBeGreaterThan(shape.cardW * 1.4)
    }
  })

  it('keeps a long dealer hand clear of the shoe', () => {
    const last = layout.dealerCard(5, 6)
    expect(last.x + shape.cardW / 2).toBeLessThan(shape.shoe.x - 40)
  })
})

describe('the tall table’s depth', () => {
  it('fits the phone, within its range, in steps', () => {
    expect(tallLayout(900).shape.h).toBe(TALL_MIN)
    expect(tallLayout(5000).shape.h).toBe(TALL_MAX)
    expect(tallLayout(1320).shape.h).toBe(1300)
    // The same depth is the same layout, so nothing re-renders for a pixel's resize.
    expect(tallLayout(1310)).toBe(tallLayout(1290))
  })
})

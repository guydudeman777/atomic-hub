import { describe, expect, it } from 'vitest'
import { DOUBLE_ZERO, type WheelKind, pocketName, spotInfo, spotsOf } from '../engine'
import { type Rect, geometry, insideBetsOn } from './layout'

const WHEELS: WheelKind[] = ['european', 'american']
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const touches = (r: Rect, p: { x: number; y: number }) => p.x >= r.x - 1e-9 && p.x <= r.x + r.w + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.h + 1e-9

describe('the layout', () => {
  for (const wheel of WHEELS) {
    for (const orientation of ['wide', 'tall'] as const) {
      const geo = geometry(wheel, orientation)

      it(`has a place for every bet on the ${wheel} layout (${orientation})`, () => {
        const placed = new Set([...geo.cells.map((c) => `straight-${pocketName(c.pocket)}`), ...geo.boxes.map((b) => b.spot), ...geo.zones.map((z) => z.spot)])
        expect([...placed].sort()).toEqual([...spotsOf(wheel)].sort())
      })

      it(`keeps the line bets apart, each on the lines its numbers share (${wheel}, ${orientation})`, () => {
        for (let i = 0; i < geo.zones.length; i++) {
          for (let j = i + 1; j < geo.zones.length; j++) {
            expect(overlap(geo.zones[i].rect, geo.zones[j].rect), `${geo.zones[i].spot} and ${geo.zones[j].spot}`).toBe(false)
          }
          const { spot, at } = geo.zones[i]
          const { kind, numbers } = spotInfo(wheel, spot)!
          // Streets, six lines and the first four or top line sit on the outer edge, by the 1, 4, 7 row and the zero.
          const edge = kind === 'street' || kind === 'line' || kind === 'first-four' || kind === 'top-line'
          for (const n of edge ? numbers.filter((x) => x === 0 || (x !== DOUBLE_ZERO && x % 3 === 1)) : numbers) {
            const cell = geo.cells.find((c) => c.pocket === n)!
            expect(touches(cell.rect, at), `${spot} touches ${n}`).toBe(true)
          }
        }
      })

      it(`fits everything inside the layout (${wheel}, ${orientation})`, () => {
        for (const r of [...geo.cells.map((c) => c.rect), ...geo.boxes.map((b) => b.rect), ...geo.zones.map((z) => z.rect)]) {
          expect(r.x).toBeGreaterThanOrEqual(0)
          expect(r.y).toBeGreaterThanOrEqual(0)
          expect(r.x + r.w).toBeLessThanOrEqual(geo.w + 1e-9)
          expect(r.y + r.h).toBeLessThanOrEqual(geo.h + 1e-9)
        }
      })
    }
  }

  it('reads 3, 6, 9 along the top of the wide layout, and 1 2 3 across the top of the tall one', () => {
    const cell = (wheel: WheelKind, o: 'wide' | 'tall', n: number) => geometry(wheel, o).cells.find((c) => c.pocket === n)!.rect
    expect(cell('european', 'wide', 3).y).toBeLessThan(cell('european', 'wide', 2).y)
    expect(cell('european', 'wide', 1).x).toBeLessThan(cell('european', 'wide', 4).x)
    expect(cell('european', 'tall', 1).x).toBeLessThan(cell('european', 'tall', 2).x)
    expect(cell('european', 'tall', 1).y).toBeLessThan(cell('european', 'tall', 4).y)
    expect(cell('european', 'tall', 0).y).toBeLessThan(cell('european', 'tall', 1).y)
    // On the American layout, 0 sits by the 1 and 00 by the 3.
    expect(cell('american', 'wide', DOUBLE_ZERO).y).toBeLessThan(cell('american', 'wide', 0).y)
  })

  it('is the same layout either way up, turned a quarter', () => {
    const wide = geometry('american', 'wide')
    const tall = geometry('american', 'tall')
    expect([tall.w, tall.h]).toEqual([wide.h, wide.w])
    for (const z of wide.zones) {
      const t = tall.zones.find((x) => x.spot === z.spot)!
      expect([t.rect.w, t.rect.h]).toEqual([z.rect.h, z.rect.w])
    }
  })

  it('offers every inside bet on a number, straight up first', () => {
    expect(insideBetsOn('european', 17)).toEqual([
      'straight-17', 'split-14-17', 'split-16-17', 'split-17-18', 'split-17-20', 'street-16',
      'corner-13-14-16-17', 'corner-14-15-17-18', 'corner-16-17-19-20', 'corner-17-18-20-21', 'line-13', 'line-16',
    ])
    expect(insideBetsOn('american', DOUBLE_ZERO)).toEqual(['straight-00', 'split-0-00', 'split-2-00', 'split-3-00', 'trio-0-2-00', 'trio-2-3-00', 'top-line'])
  })
})

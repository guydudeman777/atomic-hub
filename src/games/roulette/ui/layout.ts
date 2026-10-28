/**
 * Where everything sits on the roulette layout, in layout units: a number's
 * box is one unit square.
 *
 * Positions are worked out once, along the table and across it: `u` runs
 * from the zero end (−1) to the column bets (12 to 13), `v` across the
 * three rows from the 1, 4, 7 side (0) to the 3, 6, 9 side (3), with the
 * dozens and the even chances beyond the 1 side. Then they're laid out one
 * of two ways:
 *
 * - wide: the usual view across the table, zero on the left and 3, 6, 9 on
 *   top, the outside bets below the numbers
 * - tall: the same layout turned a quarter turn, for a phone held upright:
 *   zero at the top, rows of 1 2 3 down the screen, the outside bets down
 *   its left side
 *
 * Inside bets that aren't straight up sit on the lines: a split on the line
 * between its two numbers, a corner on the point where four meet, a street
 * on the outer edge of its row, a six line on that edge where two rows meet.
 */

import { DOUBLE_ZERO, type Pocket, type Spot, type WheelKind, hasDoubleZero, pocketName, spotInfo, spotsOf } from '../engine'

export type Orientation = 'wide' | 'tall'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A number, or a zero. */
export interface Cell {
  pocket: Pocket
  rect: Rect
}

/** An outside bet's box. */
export interface Box {
  spot: Spot
  rect: Rect
}

/** Somewhere on the lines to put an inside bet: what it is, where it can be clicked, and where its chips go. */
export interface Zone {
  spot: Spot
  rect: Rect
  at: Point
}

export interface Geometry {
  orientation: Orientation
  /** The layout's size. */
  w: number
  h: number
  cells: Cell[]
  boxes: Box[]
  zones: Zone[]
  /** Where a spot's chips sit. */
  chipAt: (spot: Spot) => Point
  /** Where the croupier pays from and sweeps to: the wheel's end of the table. */
  house: Point
  /** Where your chips come from: your seat. */
  seat: Point
  /** The corner past the column bets and the even chances, where the house puts its mark. */
  emblem: Rect
}

const U_MIN = -1
const U_MAX = 13
const V_MIN = -1.6
const V_MAX = 3
/** Felt around the edge of the printed layout. */
const MARGIN = 0.14
/** Across a line bet's strip, and a corner's square. */
const LINE = 0.26
const POINT = 0.34
/** The dozens' strip, then the even chances'. */
const DOZENS = -0.8

/** A rect along the table and across it, in the layout's units. */
interface Span {
  u0: number
  u1: number
  v0: number
  v1: number
}

function mapper(orientation: Orientation) {
  const rect = ({ u0, u1, v0, v1 }: Span): Rect =>
    orientation === 'wide'
      ? { x: u0 - U_MIN + MARGIN, y: V_MAX - v1 + MARGIN, w: u1 - u0, h: v1 - v0 }
      : { x: v0 - V_MIN + MARGIN, y: u0 - U_MIN + MARGIN, w: v1 - v0, h: u1 - u0 }
  const point = (u: number, v: number): Point =>
    orientation === 'wide' ? { x: u - U_MIN + MARGIN, y: V_MAX - v + MARGIN } : { x: v - V_MIN + MARGIN, y: u - U_MIN + MARGIN }
  return { rect, point }
}

const along = (n: number) => Math.floor((n - 1) / 3)
const across = (n: number) => (n - 1) % 3

/** A strip across the point (u, v), long in u. */
const strip = (u: number, v: number, length = 0.56): Span => ({ u0: u - length / 2, u1: u + length / 2, v0: v - LINE / 2, v1: v + LINE / 2 })
/** A strip across the point (u, v), long in v. */
const stripAcross = (u: number, v: number, length = 0.56): Span => ({ u0: u - LINE / 2, u1: u + LINE / 2, v0: v - length / 2, v1: v + length / 2 })
const square = (u: number, v: number, size = POINT): Span => ({ u0: u - size / 2, u1: u + size / 2, v0: v - size / 2, v1: v + size / 2 })

/** The zero boxes: one across all three rows, or 0 by the 1 and 00 by the 3. */
function zeroSpan(wheel: WheelKind, pocket: Pocket): Span {
  if (!hasDoubleZero(wheel)) return { u0: -1, u1: 0, v0: 0, v1: 3 }
  return pocket === DOUBLE_ZERO ? { u0: -1, u1: 0, v0: 1.5, v1: 3 } : { u0: -1, u1: 0, v0: 0, v1: 1.5 }
}

/** Where a bet around the zeros goes, on a single- or double-zero layout. */
function zeroZone(spot: Spot): Span | null {
  switch (spot) {
    // Single zero: along the zero's edge, by each row, and where the rows meet.
    case 'split-0-1':
      return stripAcross(0, 0.5)
    case 'split-0-2':
      return stripAcross(0, 1.5)
    case 'split-0-3':
      return stripAcross(0, 2.5)
    case 'trio-0-1-2':
      return square(0, 1)
    case 'trio-0-2-3':
      return square(0, 2)
    case 'first-four':
    case 'top-line':
      return square(0, 0)
    default:
      return null
  }
}

/** The double-zero layout's own: the 2 touches both zeros, and the zeros touch each other. */
function doubleZeroZone(spot: Spot): Span | null {
  switch (spot) {
    case 'split-0-1':
      return stripAcross(0, 0.5, 0.5)
    case 'split-0-2':
      return stripAcross(0, 1.25, 0.24)
    case 'split-2-00':
      return stripAcross(0, 1.75, 0.24)
    case 'split-3-00':
      return stripAcross(0, 2.5, 0.5)
    case 'split-0-00':
      return strip(-0.5, 1.5, 0.5)
    case 'trio-0-1-2':
      return square(0, 1, 0.24)
    case 'trio-0-2-00':
      return square(0, 1.5, 0.24)
    case 'trio-2-3-00':
      return square(0, 2, 0.24)
    case 'top-line':
      return square(0, 0)
    default:
      return null
  }
}

/** Where an inside bet goes on the lines, along and across the table. Null for a straight-up bet, which goes in its box. */
function lineZone(wheel: WheelKind, spot: Spot): Span | null {
  const info = spotInfo(wheel, spot)
  if (!info || !info.inside || info.kind === 'straight') return null
  const { kind, numbers } = info
  if (numbers[0] === 0 || numbers.includes(DOUBLE_ZERO)) return hasDoubleZero(wheel) ? doubleZeroZone(spot) : zeroZone(spot)
  const n = numbers[0]
  const c = along(n)
  const k = across(n)
  switch (kind) {
    case 'split':
      // Across a row (n and n + 1) the line runs along the table; between rows (n and n + 3), across it.
      return numbers[1] === n + 1 ? strip(c + 0.5, k + 1) : stripAcross(c + 1, k + 0.5)
    case 'corner':
      return square(c + 1, k + 1)
    case 'street':
      return strip(c + 0.5, 0)
    case 'line':
      return square(c + 1, 0)
    default:
      return null
  }
}

const OUTSIDE: Record<string, Span> = {
  'dozen-1': { u0: 0, u1: 4, v0: DOZENS, v1: 0 },
  'dozen-2': { u0: 4, u1: 8, v0: DOZENS, v1: 0 },
  'dozen-3': { u0: 8, u1: 12, v0: DOZENS, v1: 0 },
  'column-1': { u0: 12, u1: 13, v0: 0, v1: 1 },
  'column-2': { u0: 12, u1: 13, v0: 1, v1: 2 },
  'column-3': { u0: 12, u1: 13, v0: 2, v1: 3 },
  low: { u0: 0, u1: 2, v0: V_MIN, v1: DOZENS },
  even: { u0: 2, u1: 4, v0: V_MIN, v1: DOZENS },
  red: { u0: 4, u1: 6, v0: V_MIN, v1: DOZENS },
  black: { u0: 6, u1: 8, v0: V_MIN, v1: DOZENS },
  odd: { u0: 8, u1: 10, v0: V_MIN, v1: DOZENS },
  high: { u0: 10, u1: 12, v0: V_MIN, v1: DOZENS },
}

export const OUTSIDE_SPOTS = Object.keys(OUTSIDE)

const centerOf = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

const cache = new Map<string, Geometry>()

export function geometry(wheel: WheelKind, orientation: Orientation): Geometry {
  const key = `${wheel}:${orientation}`
  const known = cache.get(key)
  if (known) return known
  const { rect, point } = mapper(orientation)
  const zeros = hasDoubleZero(wheel) ? [0, DOUBLE_ZERO] : [0]
  const cells: Cell[] = [
    ...zeros.map((pocket) => ({ pocket, rect: rect(zeroSpan(wheel, pocket)) })),
    ...Array.from({ length: 36 }, (_, i) => {
      const n = i + 1
      return { pocket: n, rect: rect({ u0: along(n), u1: along(n) + 1, v0: across(n), v1: across(n) + 1 }) }
    }),
  ]
  const boxes: Box[] = OUTSIDE_SPOTS.map((spot) => ({ spot, rect: rect(OUTSIDE[spot]) }))
  const zones: Zone[] = spotsOf(wheel).flatMap((spot) => {
    const span = lineZone(wheel, spot)
    if (!span) return []
    const r = rect(span)
    return [{ spot, rect: r, at: centerOf(r) }]
  })
  const places = new Map<Spot, Point>()
  for (const c of cells) places.set(`straight-${pocketName(c.pocket)}`, centerOf(c.rect))
  // In an outside box, chips sit along from the middle, clear of its label.
  for (const b of boxes) {
    const c = centerOf(b.rect)
    places.set(b.spot, b.rect.w > b.rect.h ? { x: c.x + b.rect.w * 0.3, y: c.y } : b.rect.h > b.rect.w ? { x: c.x, y: c.y + b.rect.h * 0.3 } : c)
  }
  for (const z of zones) places.set(z.spot, z.at)
  const geo: Geometry = {
    orientation,
    w: U_MAX - U_MIN + MARGIN * 2,
    h: V_MAX - V_MIN + MARGIN * 2,
    cells,
    boxes,
    zones,
    chipAt: (spot) => places.get(spot) ?? { x: 0, y: 0 },
    house: point(-1.2, 1.5),
    seat: point(6, V_MIN - 1.2),
    emblem: rect({ u0: 12, u1: 13, v0: V_MIN, v1: 0 }),
  }
  if (orientation === 'tall') [geo.w, geo.h] = [geo.h, geo.w]
  cache.set(key, geo)
  return geo
}

/** The inside bets you can make on a number, for picking one by tap: straight up first, then the bets on its lines. */
export function insideBetsOn(wheel: WheelKind, pocket: Pocket): Spot[] {
  const order = ['straight', 'split', 'street', 'trio', 'corner', 'first-four', 'top-line', 'line']
  return spotsOf(wheel)
    .filter((spot) => {
      const info = spotInfo(wheel, spot)!
      return info.inside && info.numbers.includes(pocket)
    })
    .sort((a, b) => order.indexOf(spotInfo(wheel, a)!.kind) - order.indexOf(spotInfo(wheel, b)!.kind))
}

/**
 * Where everything sits on the layout.
 *
 * The felt is drawn 1000 units wide, seen from your place at the rail: the
 * rubber-pyramid wall is the far edge, and the dice are thrown from your
 * side toward it. On most screens it's the classic one-end layout, 1000 ×
 * 620 (WIDE): the number boxes across the top, Come, the Field, Don't Pass
 * and the Pass Line stepping down toward you, and the proposition bets in
 * a panel on the right.
 *
 * Held upright, a phone gets the same bets stacked into a column (tallShape),
 * 1150 to 1800 units deep to fit the phone: the numbers in two rows of three,
 * and the propositions in rows along the bottom. Its bets are about twice
 * the size, so they're big enough to tap.
 *
 * Every bet area is a rectangle; chips, the puck and the dice get points in
 * felt units, so animations can travel in the felt's own frame.
 */

import { type BetSpot, HARD_NUMBERS, type HardNumber, POINTS, type PointNumber, spotInfo } from '../engine'

export const FELT_W = 1000

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

export type PropSpot = 'any-seven' | 'any-craps' | 'yo' | 'aces' | 'boxcars'

export interface Shape {
  name: 'wide' | 'tall'
  /** The table's height in units. */
  h: number
  /** Inside the rail. */
  felt: Rect
  /** The rubber pyramids along the far wall. */
  wall: Rect
  /** Open felt where the dice come to rest. */
  landing: Rect
  numbers: Record<PointNumber, Rect>
  dontComeBar: Rect
  come: Rect
  field: Rect
  dontPass: Rect
  layOdds: Rect
  passLine: Rect
  passOdds: Rect
  hard: Record<HardNumber, Rect>
  props: Record<PropSpot, Rect>
  /** A chip's diameter. */
  chipD: number
  /** A die's side. */
  dieD: number
  /** Where the dice are thrown from: your end of the table, just off the felt. */
  launch: Point
  /** The bank behind the wall: lost chips go there and winnings come from there. */
  house: Point
  /** Your place at the rail: winnings and bets that come down go back there. */
  rail: Point
  /** Name plates on the rail: yours, and the regulars' beside you. */
  you: Point
  seats: readonly Point[]
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/** `n` rectangles side by side across `area`, `gap` apart. */
function across(area: Rect, n: number, gap: number): Rect[] {
  const w = (area.w - gap * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => rect(area.x + i * (w + gap), area.y, w, area.h))
}

function wideShape(): Shape {
  const h = 620
  const boxes = across(rect(144, 150, 550, 140), 6, 2)
  const props = rect(714, 150, 242, 430)
  const [hard6, hard10] = across(rect(props.x, 216, props.w, 84), 2, 4)
  const [hard8, hard4] = across(rect(props.x, 304, props.w, 84), 2, 4)
  const [aces, yo, boxcars] = across(rect(props.x, 392, props.w, 118), 3, 4)
  return {
    name: 'wide',
    h,
    felt: rect(24, 24, 952, 572),
    wall: rect(24, 24, 952, 30),
    landing: rect(150, 70, 520, 66),
    numbers: Object.fromEntries(POINTS.map((n, i) => [n, boxes[i]])) as Record<PointNumber, Rect>,
    dontComeBar: rect(44, 150, 96, 230),
    come: rect(144, 294, 550, 86),
    field: rect(44, 384, 650, 88),
    dontPass: rect(44, 476, 556, 44),
    layOdds: rect(604, 476, 90, 44),
    passLine: rect(44, 524, 556, 56),
    passOdds: rect(604, 524, 90, 56),
    hard: { 4: hard4, 6: hard6, 8: hard8, 10: hard10 },
    props: { 'any-seven': rect(props.x, 150, props.w, 62), aces, yo, boxcars, 'any-craps': rect(props.x, 514, props.w, 66) },
    chipD: 34,
    dieD: 38,
    launch: { x: 470, y: 680 },
    house: { x: 500, y: -30 },
    rail: { x: 470, y: 660 },
    you: { x: 470, y: h - 12 },
    seats: [130, 300, 820].map((x) => ({ x, y: h - 12 })),
  }
}

export const WIDE = wideShape()

// [base height, share of any extra depth, gap after] for each row of the tall layout, top to bottom.
const TALL_ROWS = {
  wall: [36, 0, 0],
  landing: [124, 0.34, 6],
  numbersA: [150, 0.14, 8],
  numbersB: [150, 0.14, 10],
  come: [128, 0.08, 8],
  field: [132, 0.08, 8],
  dontPass: [92, 0.04, 8],
  pass: [112, 0.06, 16],
  sevens: [96, 0.04, 8],
  hard: [110, 0.04, 8],
  one: [110, 0.04, 0],
} as const

/** The rows start inside the rail and end a little short of it. */
const TALL_TOP = 24
const TALL_FOOT = 40
const TALL_GAPS = Object.values(TALL_ROWS).reduce((n, [, , gap]) => n + gap, 0)
const TALL_ROWS_H = Object.values(TALL_ROWS).reduce((n, [base]) => n + base, 0)

/**
 * How deep the tall layout can get, in units. Below the rows' natural depth
 * (about 1400) they squeeze, for the shortest phones.
 */
export const TALL_MIN = 1150
export const TALL_MAX = 1800

/**
 * Upright, `h` units deep. Rows, top to bottom: the wall, the landing, the
 * numbers in two rows, Don't Come and Come, the Field, Don't Pass and its
 * odds, the Pass Line and its odds, then the propositions. Extra depth goes
 * mostly to the landing and the numbers; less, and every row gives some up.
 */
export function tallShape(h: number): Shape {
  const room = h - TALL_TOP - TALL_FOOT - TALL_GAPS
  const extra = Math.max(0, room - TALL_ROWS_H)
  const squeeze = Math.min(1, room / TALL_ROWS_H)
  const x = 44
  const w = 912
  let y = TALL_TOP
  const at: Record<string, Rect> = {}
  for (const [name, [base, share, gap]] of Object.entries(TALL_ROWS)) {
    const rowH = Math.floor(base * squeeze + extra * share)
    at[name] = rect(x, y, w, rowH)
    y += rowH + gap
  }
  const [n4, n5, n6] = across(at.numbersA, 3, 8)
  const [n8, n9, n10] = across(at.numbersB, 3, 8)
  const [anySeven, anyCraps] = across(at.sevens, 2, 8)
  const [hard4, hard6, hard8, hard10] = across(at.hard, 4, 8)
  const [aces, yo, boxcars] = across(at.one, 3, 8)
  const sideW = 224
  const { come, field, dontPass, pass, landing } = at
  return {
    name: 'tall',
    h,
    felt: rect(24, 24, 952, h - 48),
    wall: rect(24, 24, 952, at.wall.h),
    landing: rect(140, landing.y + 10, 720, landing.h - 20),
    numbers: { 4: n4, 5: n5, 6: n6, 8: n8, 9: n9, 10: n10 },
    dontComeBar: rect(x, come.y, 220, come.h),
    come: rect(x + 228, come.y, w - 228, come.h),
    field,
    dontPass: rect(x, dontPass.y, w - sideW - 8, dontPass.h),
    layOdds: rect(x + w - sideW, dontPass.y, sideW, dontPass.h),
    passLine: rect(x, pass.y, w - sideW - 8, pass.h),
    passOdds: rect(x + w - sideW, pass.y, sideW, pass.h),
    hard: { 4: hard4, 6: hard6, 8: hard8, 10: hard10 },
    props: { 'any-seven': anySeven, 'any-craps': anyCraps, aces, yo, boxcars },
    chipD: 58,
    dieD: 66,
    launch: { x: 500, y: h + 80 },
    house: { x: 500, y: -40 },
    rail: { x: 500, y: h + 60 },
    you: { x: 500, y: h - 12 },
    seats: [140, 310, 860].map((x) => ({ x, y: h - 12 })),
  }
}

export interface Layout {
  shape: Shape
  /** How much bigger this shape's chips, dice and printing are than the wide one's. */
  scale: number
  /** The area you tap to bet on a spot, for spots you bet on directly. */
  zoneOf: (spot: BetSpot) => Rect | null
  /** Where a spot's chips sit. */
  chipsAt: (spot: BetSpot) => Point
  /** The puck: in the Don't Come bar when it's off, on the point's box when it's on. */
  puckAt: (point: PointNumber | null) => Point
}

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

export function layoutFor(shape: Shape): Layout {
  const scale = shape.chipD / WIDE.chipD
  const d = shape.chipD

  const zoneOf = (spot: BetSpot): Rect | null => {
    const { kind, number } = spotInfo(spot)
    switch (kind) {
      case 'pass':
        return shape.passLine
      case 'pass-odds':
        return shape.passOdds
      case 'dont-pass':
        return shape.dontPass
      case 'dont-pass-odds':
        return shape.layOdds
      case 'come':
        return shape.come
      case 'dont-come':
        return shape.dontComeBar
      case 'field':
        return shape.field
      case 'place':
        return shape.numbers[number!]
      case 'hard':
        return shape.hard[number as HardNumber]
      case 'any-seven':
      case 'any-craps':
      case 'yo':
      case 'aces':
      case 'boxcars':
        return shape.props[kind]
      default:
        // Travelled come bets and their odds are tapped where their chips sit.
        return null
    }
  }

  const chipsAt = (spot: BetSpot): Point => {
    const { kind, number } = spotInfo(spot)
    if (number !== null && kind !== 'hard') {
      const box = shape.numbers[number]
      const c = center(box)
      const side = Math.min(box.w * 0.24, d * 0.85)
      switch (kind) {
        case 'place':
          return { x: c.x + side, y: box.y + box.h * 0.78 }
        case 'come-point':
          return { x: c.x - side, y: box.y + box.h * 0.78 }
        case 'come-odds':
          return { x: c.x - side + d * 0.42, y: box.y + box.h * 0.78 - d * 0.3 }
        case 'dont-come-point':
          return { x: c.x - side, y: box.y + box.h * 0.17 }
        case 'dont-come-odds':
          return { x: c.x - side + d * 0.42, y: box.y + box.h * 0.17 + d * 0.12 }
      }
    }
    const zone = zoneOf(spot)!
    const c = center(zone)
    switch (kind) {
      case 'pass':
      case 'dont-pass':
        return { x: zone.x + zone.w * 0.72, y: c.y }
      case 'come':
        return { x: zone.x + zone.w * 0.78, y: c.y }
      case 'dont-come':
        // Tall, the bar is short and wide: the bet goes beside the puck, under the printing.
        return shape.name === 'tall' ? { x: zone.x + zone.w * 0.73, y: zone.y + zone.h * 0.74 } : { x: c.x, y: zone.y + zone.h * 0.74 }
      case 'field':
        return { x: zone.x + zone.w - d * 0.9, y: zone.y + zone.h * 0.7 }
      case 'any-seven':
      case 'any-craps':
        // At the end of the box, clear of the printing.
        return { x: zone.x + zone.w - d * 0.9, y: c.y }
      case 'hard':
      case 'aces':
      case 'yo':
      case 'boxcars':
        // On the dice that win it, so the name and the payout still show.
        return { x: c.x, y: zone.y + zone.h * 0.3 }
      default:
        // Odds: low in their box, under the printing.
        return { x: c.x, y: zone.y + zone.h - Math.min(zone.h * 0.32, d * 0.75) }
    }
  }

  const puckAt = (point: PointNumber | null): Point => {
    if (point === null) {
      const bar = shape.dontComeBar
      if (shape.name === 'tall') return { x: bar.x + bar.w * 0.27, y: bar.y + bar.h * 0.74 }
      return { x: bar.x + bar.w / 2, y: bar.y + Math.min(bar.h * 0.2, d * 1.1) }
    }
    const box = shape.numbers[point]
    return { x: box.x + box.w / 2 + Math.min(box.w * 0.24, d * 0.85), y: box.y + box.h * 0.17 }
  }

  return { shape, scale, zoneOf, chipsAt, puckAt }
}

export const WIDE_LAYOUT = layoutFor(WIDE)

const tallLayouts = new Map<number, Layout>()

/** The tall layout at depth `h`, clamped to the range and kept from one call to the next. */
export function tallLayout(h: number): Layout {
  const depth = Math.max(TALL_MIN, Math.min(TALL_MAX, Math.round(h / 50) * 50))
  let layout = tallLayouts.get(depth)
  if (!layout) tallLayouts.set(depth, (layout = layoutFor(tallShape(depth))))
  return layout
}

/** Every spot you can tap on the layout, in the order a keyboard reaches them. */
export const ZONE_SPOTS: readonly BetSpot[] = [
  ...POINTS.map((n) => `place-${n}` as BetSpot),
  'dont-come',
  'come',
  'field',
  'dont-pass',
  'dont-pass-odds',
  'pass',
  'pass-odds',
  'any-seven',
  ...HARD_NUMBERS.map((n) => `hard-${n}` as BetSpot),
  'aces',
  'yo',
  'boxcars',
  'any-craps',
]

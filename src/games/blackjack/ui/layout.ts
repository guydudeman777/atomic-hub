/**
 * Where everything sits on the felt.
 *
 * The table is drawn 1000 units wide, with the dealer along the straight
 * top edge and the players around the curve below. On most screens it's a
 * half circle, 1000 × 500 (WIDE). On a phone held upright it's a deep half
 * ellipse, 1100 to 1600 units deep to fit the phone (tallShape): the spots
 * run down its sides, so the cards can be far bigger, and the table fills
 * the screen instead of a strip of it.
 *
 * Spots sit on an ellipse around the dealer, first base on your right. Each
 * spot's things (cards, chips, totals) are laid out in that spot's own
 * frame, turned partway toward the dealer the way the felt is printed, then
 * placed on the felt. Everything gets an absolute position, so animations
 * can travel in the felt's own frame (from the shoe, to the chip tray).
 */

import { SPOTS } from '../content'

export const FELT_W = 1000

export interface Point {
  x: number
  y: number
}

export interface Place extends Point {
  /** Degrees, clockwise. */
  rot: number
}

/** Half-axes of an ellipse centred on the middle of the dealer's edge. */
export interface Axes {
  rx: number
  ry: number
}

/** Part of one of those ellipses, `half` degrees either side of straight down, for text to follow. */
export interface Arc extends Axes {
  half: number
}

export interface Shape {
  name: 'wide' | 'tall'
  /** The table's height in units. */
  h: number
  /** From the outside in: the leather rail, its stitching, the wooden racetrack, the felt. */
  rail: Axes
  stitch: Axes
  wood: Axes
  felt: Axes
  /** Name plates, on the rail. */
  plate: Axes
  /** Where each spot's first card sits. */
  cards: Axes
  /** Spot angles from straight down, in degrees: positive is to your right. */
  spotAngles: readonly number[]
  /** How far each spot's frame turns toward the dealer, as a share of its angle. */
  turn: number
  /** A card's width; the rest of a spot's layout scales with it. */
  cardW: number
  /** The betting circle: how far below the first card, in the spot's frame, and its size. */
  circleY: number
  circleR: number
  shoe: Point
  discard: Point
  tray: Point
  /** The dealer's row of cards, and the furthest right a long hand may reach. */
  dealerY: number
  dealerMaxX: number
  print: { pays: Arc; dealer: Arc; insurance: Arc; bandIn: Arc; bandOut: Arc }
  /** Where the regulars' remarks go, when there's no room for them beside their plates. */
  talk: Point | null
}

const round = (r: number): Axes => ({ rx: r, ry: r })
const arc = (axes: Axes, half: number): Arc => ({ ...axes, half })

export const WIDE: Shape = {
  name: 'wide',
  h: 500,
  rail: round(500),
  stitch: round(492),
  wood: round(470),
  felt: round(455),
  plate: round(481),
  cards: round(308),
  spotAngles: [56, 28, 0, -28, -56],
  turn: 0.6,
  cardW: 66,
  circleY: 76,
  circleR: 34,
  shoe: { x: 894, y: 56 },
  discard: { x: 112, y: 62 },
  tray: { x: 500, y: 24 },
  dealerY: 112,
  dealerMaxX: 760,
  print: {
    pays: arc(round(196), 70),
    dealer: arc(round(232), 60),
    insurance: arc(round(282), 52),
    bandIn: arc(round(262), 54),
    bandOut: arc(round(296), 50),
  },
  talk: null,
}

/** How deep the tall table can get, in units. Phones in between get a depth to fit, in steps. */
export const TALL_MIN = 1100
export const TALL_MAX = 1600

/**
 * Upright, `h` units deep: the outer spots sit high on the sides and the
 * inner ones lower, so neighbours are staggered and big cards don't collide.
 * The dealer's end stays the same at any depth; the spots spread with it.
 * The remarks go in the open felt between the printing and your hand.
 */
export const tallShape = (h: number): Shape => ({
  name: 'tall',
  h,
  rail: { rx: 500, ry: h },
  stitch: { rx: 492, ry: h - 8 },
  wood: { rx: 470, ry: h - 30 },
  felt: { rx: 455, ry: h - 45 },
  plate: { rx: 481, ry: h - 19 },
  cards: { rx: 310, ry: Math.round(h * 0.723) },
  spotAngles: [62, 33, 0, -33, -62],
  turn: 0.45,
  cardW: 112,
  circleY: 150,
  circleR: 48,
  shoe: { x: 900, y: 64 },
  discard: { x: 100, y: 72 },
  tray: { x: 500, y: 24 },
  dealerY: 150,
  dealerMaxX: 720,
  print: {
    pays: arc({ rx: 250, ry: 310 }, 72),
    dealer: arc({ rx: 285, ry: 350 }, 60),
    insurance: arc({ rx: 338, ry: 418 }, 54),
    bandIn: arc({ rx: 318, ry: 392 }, 56),
    bandOut: arc({ rx: 352, ry: 440 }, 52),
  },
  talk: { x: 500, y: Math.round(h * 0.43) },
})

export interface Layout {
  shape: Shape
  /** How much bigger this shape's cards are than the wide table's. */
  scale: number
  /** A point in a spot's frame (origin at its first card, +y toward you), on the felt. */
  inSpot: (spot: number, lx: number, ly: number) => Place
  /** The betting circle: chips for the first hand go here. */
  circleOf: (spot: number) => Place
  /** A name plate on the rail, square to the curve. */
  plateOf: (spot: number) => Place
  /** Split hands shrink once there are more than two, so they fit a spot. */
  handScale: (hands: number) => number
  /** The middle of hand `h` of `n`, across the spot's frame: far enough apart that a hand's cascade clears the next. */
  handX: (h: number, n: number) => number
  /** Card `k` of a hand: each one up and to the right of the last, so every index shows. */
  cardInHand: (spot: number, h: number, n: number, k: number) => Place
  /**
   * The dealer's cards, in a row facing you: the up card and hole card in
   * the middle, draws to the right. A long hand closes up rather than run
   * into the shoe.
   */
  dealerCard: (k: number, n: number) => Place
}

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function layoutFor(shape: Shape): Layout {
  const scale = shape.cardW / WIDE.cardW
  const angle = (spot: number) => rad(shape.spotAngles[spot])
  const on = ({ rx, ry }: Axes, spot: number): Point => ({
    x: FELT_W / 2 + rx * Math.sin(angle(spot)),
    y: ry * Math.cos(angle(spot)),
  })

  const inSpot = (spot: number, lx: number, ly: number): Place => {
    const origin = on(shape.cards, spot)
    const rot = -shape.spotAngles[spot] * shape.turn
    const a = rad(rot)
    return {
      x: origin.x + lx * Math.cos(a) - ly * Math.sin(a),
      y: origin.y + lx * Math.sin(a) + ly * Math.cos(a),
      rot,
    }
  }

  const handScale = (hands: number) => (hands > 2 ? 0.78 : 1)
  const handX = (h: number, n: number) => (h - (n - 1) / 2) * (n > 2 ? 84 : 100) * scale * handScale(n)

  return {
    shape,
    scale,
    inSpot,
    circleOf: (spot) => inSpot(spot, 0, shape.circleY),
    plateOf: (spot) => {
      const p = on(shape.plate, spot)
      // Along the rail: the ellipse's tangent at that point.
      const a = angle(spot)
      return { ...p, rot: deg(Math.atan2(-shape.plate.ry * Math.sin(a), shape.plate.rx * Math.cos(a))) }
    },
    handScale,
    handX,
    cardInHand: (spot, h, n, k) => {
      const s = handScale(n) * scale
      return inSpot(spot, handX(h, n) + k * 18 * s, -k * 22 * s)
    },
    dealerCard: (k, n) => {
      const gap = shape.cardW + 6 * scale
      const first = FELT_W / 2 - gap / 2
      const step = n > 2 ? Math.min(gap, (shape.dealerMaxX - first) / (n - 1)) : gap
      return { x: first + k * step, y: shape.dealerY, rot: 0 }
    },
  }
}

export const WIDE_LAYOUT = layoutFor(WIDE)

const tallLayouts = new Map<number, Layout>()

/** The tall table's layout at depth `h`, clamped to the range and kept from one call to the next. */
export function tallLayout(h: number): Layout {
  const depth = Math.max(TALL_MIN, Math.min(TALL_MAX, Math.round(h / 50) * 50))
  let layout = tallLayouts.get(depth)
  if (!layout) tallLayouts.set(depth, (layout = layoutFor(tallShape(depth))))
  return layout
}

export const SPOT_INDEXES = Array.from({ length: SPOTS }, (_, i) => i)

/**
 * Where everything sits on the felt.
 *
 * The table is an oval drawn 1000 units wide, with you at the bottom and
 * the regulars spread round the rest of it, clockwise: the next seat is on
 * your left, the way the deal goes. They keep clear of the foot of the
 * table, which is all yours: your cards are the big ones. On most screens it's
 * 1000 × 560 (WIDE). On a phone held upright it's a tall oval, 1300 to 1800
 * units deep to fit the phone (tallShape): the regulars sit down its sides
 * and your hand is far bigger along the bottom.
 *
 * Everything gets an absolute position in felt units, so animations can
 * travel in the felt's own frame: cards from the deck, bets to the pot, the
 * pot to its winner.
 */

export const FELT_W = 1000

export interface Point {
  x: number
  y: number
}

/** Half-axes of an ellipse centred on the table. */
export interface Axes {
  rx: number
  ry: number
}

export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface Shape {
  name: 'wide' | 'tall'
  /** The table's height in units. */
  h: number
  /** From the outside in: the padded rail, its stitching, the wooden edge, the baize. */
  rail: Axes
  stitch: Axes
  wood: Axes
  felt: Axes
  /** Where the regulars' name plates sit. */
  plate: Axes
  /** The middle of each regular's hand, on an ellipse round `handsY`. */
  hands: Axes
  handsY: number
  /** Each player's bets, out in front of them. */
  bets: Axes
  /** Card widths: the regulars', and yours. */
  cardW: number
  yourCardW: number
  /** Your hand's middle, your bets and your plate. */
  you: { hand: Point; bet: Point; plate: Point }
  pot: Point
  deck: Point
  muck: Point
  /** The printing on the baize follows this ellipse, over the pot. */
  print: Axes
  /** Where the regulars' remarks go, when there's no room beside their plates. */
  talk: Point | null
}

export const WIDE: Shape = {
  name: 'wide',
  h: 560,
  rail: { rx: 500, ry: 280 },
  stitch: { rx: 491, ry: 271 },
  wood: { rx: 469, ry: 249 },
  felt: { rx: 452, ry: 232 },
  plate: { rx: 405, ry: 262 },
  hands: { rx: 335, ry: 150 },
  handsY: 280,
  bets: { rx: 215, ry: 96 },
  cardW: 54,
  yourCardW: 86,
  you: { hand: { x: 500, y: 446 }, bet: { x: 500, y: 350 }, plate: { x: 500, y: 548 } },
  pot: { x: 500, y: 262 },
  deck: { x: 392, y: 258 },
  muck: { x: 608, y: 258 },
  print: { rx: 150, ry: 70 },
  talk: null,
}

/** How deep the tall table can get, in units. Phones in between get a depth to fit, in steps. */
export const TALL_MIN = 1300
export const TALL_MAX = 1800

export const tallShape = (h: number): Shape => ({
  name: 'tall',
  h,
  rail: { rx: 500, ry: h / 2 },
  stitch: { rx: 491, ry: h / 2 - 9 },
  wood: { rx: 469, ry: h / 2 - 31 },
  felt: { rx: 452, ry: h / 2 - 48 },
  plate: { rx: 300, ry: h / 2 - 150 },
  // Up the table a little, out of the way of your hand.
  hands: { rx: 300, ry: h / 2 - 330 },
  handsY: h / 2 - 80,
  bets: { rx: 125, ry: h / 2 - 520 },
  cardW: 104,
  yourCardW: 172,
  you: { hand: { x: 500, y: h - 250 }, bet: { x: 500, y: h - 470 }, plate: { x: 500, y: h - 22 } },
  pot: { x: 500, y: h / 2 - 10 },
  deck: { x: 500, y: h / 2 - 170 },
  muck: { x: 500, y: h / 2 + 150 },
  print: { rx: 190, ry: 150 },
  talk: { x: 500, y: h / 2 + 70 },
})

export interface Place extends Point {
  /** Degrees, clockwise. */
  rot: number
}

/**
 * A label pinned to a point, then moved by `dx`, `dy`. The offsets are in
 * card widths' worth of units, so they grow with the cards when a small
 * screen makes them bigger (--card-scale in draw.css).
 */
export interface Pin extends Point {
  dx: number
  dy: number
  /** Which way the label hangs from its point. */
  hang: 'center' | 'below' | 'above'
}

export interface Layout {
  shape: Shape
  /** How much bigger this shape's things are than the wide table's. */
  scale: number
  /** Which way a seat faces the middle, for its speech bubble. */
  sideOf: (seat: number, n: number) => Side
  /** A name plate: on the rail at the head and foot of the table, under the cards down its sides. */
  plateOf: (seat: number, n: number) => Pin
  /** What a regular's hand is, across the foot of their cards, where it can't run into a neighbor. */
  handNameOf: (seat: number, n: number) => Pin
  /** How many cards they drew, by the top corner of their hand. */
  drewOf: (seat: number, n: number) => Pin
  handOf: (seat: number, n: number) => Point
  betOf: (seat: number, n: number) => Point
  /** The dealer button, beside the seat's bets. */
  buttonOf: (seat: number, n: number) => Point
  /** Card `k` of a hand of five. Your cards spread out to tap; the regulars' overlap. */
  cardOf: (seat: number, n: number, k: number) => Place
  cardW: (seat: number) => number
}

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * A seat's angle round the table, clockwise from yours at the bottom: the
 * regulars spread evenly over the far side, wider apart the fewer they are.
 */
export function seatAngle(seat: number, n: number): number {
  if (seat === 0) return 0
  const others = n - 1
  if (others === 1) return 180
  const first = others >= 4 ? 68 : others === 3 ? 80 : 120
  return first + ((seat - 1) * (360 - 2 * first)) / (others - 1)
}

export function layoutFor(shape: Shape): Layout {
  const scale = shape.cardW / WIDE.cardW
  const cx = FELT_W / 2
  const cy = shape.h / 2
  const angle = seatAngle
  const on = ({ rx, ry }: Axes, a: number, y = cy): Point => ({ x: cx - rx * Math.sin(rad(a)), y: y + ry * Math.cos(rad(a)) })
  const cardW = (seat: number) => (seat === 0 ? shape.yourCardW : shape.cardW)

  const handOf = (seat: number, n: number) => (seat === 0 ? shape.you.hand : on(shape.hands, angle(seat, n), shape.handsY))
  const betOf = (seat: number, n: number) => (seat === 0 ? shape.you.bet : on(shape.bets, angle(seat, n), shape.handsY))
  const sideOf = (seat: number, n: number): Side => {
    const a = angle(seat, n)
    if (seat === 0) return 'bottom'
    if (a > 150 && a < 210) return 'top'
    return a < 180 ? 'left' : 'right'
  }
  const pin = (p: Point, dx: number, dy: number, hang: Pin['hang']): Pin => ({ x: p.x, y: p.y, dx, dy, hang })
  /** Half a card's height, plus a little. */
  const below = (seat: number, gap: number) => cardW(seat) * 0.7 + gap * scale

  return {
    shape,
    scale,
    sideOf,
    plateOf: (seat, n) => {
      if (seat === 0) return pin(shape.you.plate, 0, 0, 'center')
      const side = sideOf(seat, n)
      return side === 'top' ? pin(on(shape.plate, angle(seat, n)), 0, 0, 'center') : pin(handOf(seat, n), 0, below(seat, 10), 'below')
    },
    handNameOf: (seat, n) => pin(handOf(seat, n), 0, cardW(seat) * 0.42, 'center'),
    drewOf: (seat, n) => pin(handOf(seat, n), cardW(seat) * 1.34 + 6 * scale, -cardW(seat) * 0.62, 'center'),
    handOf,
    betOf,
    buttonOf: (seat, n) => {
      const bet = betOf(seat, n)
      const hand = handOf(seat, n)
      // Off to the side of the line from the hand to the bets.
      const dx = bet.x - hand.x
      const dy = bet.y - hand.y
      const len = Math.hypot(dx, dy) || 1
      const off = 52 * scale
      return { x: bet.x + (-dy / len) * off, y: bet.y + (dx / len) * off }
    },
    cardOf: (seat, n, k) => {
      const w = cardW(seat)
      const step = seat === 0 ? w * 0.86 : w * 0.42
      const middle = handOf(seat, n)
      return { x: middle.x + (k - 2) * step, y: middle.y, rot: seat === 0 ? 0 : (k - 2) * 2 }
    },
    cardW,
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

/**
 * The table as seen from chair `me` of `n`: every chair moved round so
 * yours is at the foot, and the others keep their order clockwise from it.
 * The layout's functions take the chair's real number.
 */
export function seenFrom(layout: Layout, me: number, n: number): Layout {
  if (me === 0) return layout
  const v = (seat: number) => (seat - me + n) % n
  return {
    ...layout,
    sideOf: (seat, n) => layout.sideOf(v(seat), n),
    plateOf: (seat, n) => layout.plateOf(v(seat), n),
    handNameOf: (seat, n) => layout.handNameOf(v(seat), n),
    drewOf: (seat, n) => layout.drewOf(v(seat), n),
    handOf: (seat, n) => layout.handOf(v(seat), n),
    betOf: (seat, n) => layout.betOf(v(seat), n),
    buttonOf: (seat, n) => layout.buttonOf(v(seat), n),
    cardOf: (seat, n, k) => layout.cardOf(v(seat), n, k),
    cardW: (seat) => layout.cardW(v(seat)),
  }
}

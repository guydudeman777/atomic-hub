/**
 * Where everything sits on the felt.
 *
 * The table is a half circle, 1000 × 500 units, with the dealer along the
 * straight top edge and the players around the curve. Spots sit on an arc
 * around the dealer, first base on your right. Each spot's things (cards,
 * chips, totals) are laid out in that spot's own frame, turned partway
 * toward the dealer the way the felt is printed, then placed on the felt.
 * Everything gets an absolute position, so animations can travel in the
 * felt's own frame (from the shoe, to the chip tray).
 */

import { SPOTS } from '../content'

export const FELT_W = 1000
export const FELT_H = 500

/** Spot angles from straight down, in degrees: positive is to your right. */
const SPOT_ANGLES = [56, 28, 0, -28, -56]
/** How far each spot's frame turns toward the dealer, as a share of its angle. */
const TURN = 0.6

export const RADIUS = {
  /** Where a hand's first card sits. */
  cards: 308,
  /** The betting circles. */
  circle: 384,
  /** The edge of the felt, where the rail starts. */
  felt: 455,
  /** Name plates, on the rail. */
  plate: 481,
}

/** The card size on the felt, before shrinking for split hands. */
export const CARD_W = 66
export const CARD_H = CARD_W * 1.4

export const SHOE = { x: 894, y: 56 }
export const DISCARD = { x: 112, y: 62 }
export const TRAY = { x: 500, y: 24 }

export interface Place {
  x: number
  y: number
  /** Degrees, clockwise. */
  rot: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

function onArc(spot: number, r: number): { x: number; y: number } {
  const a = rad(SPOT_ANGLES[spot])
  return { x: FELT_W / 2 + r * Math.sin(a), y: r * Math.cos(a) }
}

/** The turn of a spot's frame. */
export const spotTurn = (spot: number): number => -SPOT_ANGLES[spot] * TURN

/** A point in a spot's frame (origin at its first card, +y toward you), on the felt. */
export function inSpot(spot: number, lx: number, ly: number): Place {
  const origin = onArc(spot, RADIUS.cards)
  const rot = spotTurn(spot)
  const a = rad(rot)
  return {
    x: origin.x + lx * Math.cos(a) - ly * Math.sin(a),
    y: origin.y + lx * Math.sin(a) + ly * Math.cos(a),
    rot,
  }
}

/** The betting circle, in the spot's frame: chips for the first hand go here. */
export const CIRCLE_Y = RADIUS.circle - RADIUS.cards

export const circleOf = (spot: number): Place => inSpot(spot, 0, CIRCLE_Y)

/** A name plate on the rail, square to the curve. */
export function plateOf(spot: number): Place {
  const p = onArc(spot, RADIUS.plate)
  return { ...p, rot: -SPOT_ANGLES[spot] }
}

/** Split hands shrink once there are more than two, so they fit a spot. */
export const handScale = (hands: number): number => (hands > 2 ? 0.78 : 1)

/** The middle of hand `h` of `n`, across the spot's frame: far enough apart that a hand's cascade clears the next. */
export const handX = (h: number, n: number): number => (h - (n - 1) / 2) * (n > 2 ? 84 : 100) * handScale(n)

/** Card `k` of a hand: each one up and to the right of the last, so every index shows. */
export function cardInHand(spot: number, h: number, n: number, k: number): Place {
  const s = handScale(n)
  return inSpot(spot, handX(h, n) + k * 18 * s, -k * 22 * s)
}

/**
 * The dealer's cards, in a row facing you: the up card and hole card in the
 * middle, draws to the right. A long hand closes up rather than run into the shoe.
 */
export function dealerCard(k: number, n: number): Place {
  const first = FELT_W / 2 - (CARD_W + 6) / 2
  const step = n <= 4 ? CARD_W + 6 : (760 - first) / (n - 1)
  return { x: first + k * step, y: 112, rot: 0 }
}

export const SPOT_INDEXES = Array.from({ length: SPOTS }, (_, i) => i)

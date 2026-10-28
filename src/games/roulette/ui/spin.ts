/**
 * How a spin moves: the rotor turning clockwise and slowing, and the ball
 * going round the other way on the track until it drops and comes to rest
 * in its pocket. roulette.css plays these angles as CSS animations, with
 * the same easings as here.
 *
 * The ball is drawn on the rotor, so its angle is measured on the rotor:
 * it starts far behind its pocket and winds forward to it, slowing to the
 * rotor's own speed as it settles. Seen from above, that's a ball racing
 * the other way round the bowl that's picked up by the wheel at the end.
 */

import { createRng } from '../../../core/rng'
import { type Pocket, type WheelKind, WHEEL_ORDER } from '../engine'
import { SPIN_MS } from './session'

/** The rotor keeps turning after the ball settles. */
export const ROTOR_MS = SPIN_MS + 2600

/** CSS easings, as [x1, y1, x2, y2]. Keep in step with roulette.css. */
export const ROTOR_EASE = [0.25, 0.55, 0.4, 1] as const
export const BALL_EASE = [0.18, 0.62, 0.32, 1] as const

/** A CSS cubic-bezier timing function: progress at time `x`, both from 0 to 1. */
export function bezier([x1, y1, x2, y2]: readonly [number, number, number, number], x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  // Find the curve's t for this x by bisection: plenty fast for one call a spin.
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (at(x1, x2, mid) < x) lo = mid
    else hi = mid
  }
  return at(y1, y2, (lo + hi) / 2)
}

/** Where a pocket sits on the rotor, clockwise from the zero at the top, in degrees. */
export const pocketAngle = (wheel: WheelKind, pocket: Pocket) => {
  const order = WHEEL_ORDER[wheel]
  return (order.indexOf(pocket) * 360) / order.length
}

export interface Frame {
  /** The spin it shows. */
  id: number
  /** The rotor's angle at the launch, and where it comes to rest. */
  rotorFrom: number
  rotorTo: number
  /** The ball's angle on the rotor at the launch, and in its pocket. */
  ballFrom: number
  ballTo: number
  /** performance.now() at the launch. */
  start: number
  /** Shown at rest, without moving: a spin that had already landed. */
  still: boolean
}

/** Where the croupier sends the ball from, as seen from above: low on the right of the bowl. */
const LAUNCH = 120

/** The rotor's angle at time `now`, in the middle of a frame or after it. */
export function rotorAt(frame: Frame | null, now: number): number {
  if (!frame) return 0
  if (frame.still) return frame.rotorTo
  return frame.rotorFrom + (frame.rotorTo - frame.rotorFrom) * bezier(ROTOR_EASE, (now - frame.start) / ROTOR_MS)
}

/** The next spin's movement, from wherever the last one left the rotor. Decided by the spin's number, so every redraw agrees. */
export function frameFor(wheel: WheelKind, id: number, pocket: Pocket, last: Frame | null, now: number, still = false): Frame {
  const r = createRng(Math.imul(id + 7, 2654435761))
  const rotorFrom = rotorAt(last, now) % 360
  const rotorTo = rotorFrom + 360 + r() * 140
  const ballFrom = LAUNCH + (r() - 0.5) * 30 - rotorFrom
  const target = pocketAngle(wheel, pocket)
  // Six to seven turns backwards round the rotor, to the pocket.
  const behind = Math.floor((ballFrom - target - 6 * 360) / 360)
  return { id, rotorFrom, rotorTo, ballFrom, ballTo: target + behind * 360, start: now, still }
}

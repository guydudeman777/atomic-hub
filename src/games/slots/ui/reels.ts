/**
 * How the reels move. Each reel is a drum of 22 faces; slots.css turns it
 * by these angles. A face's place on the drum is its stop times STEP, and
 * the drum at angle `stop * STEP` has that stop on the pay line, the stop
 * before it above and the one after below. A pull turns the drum backwards,
 * so the symbols come down past the window, through a few whole turns, onto
 * its stop: it overshoots a little as it's braked and settles back.
 */

import { createRng } from '../../../core/rng'
import { type Rules, type Spin, type Stops, STRIP_LENGTH, evaluate, lineOf } from '../engine'
import { type Pull, REEL_STOP_MS } from './session'

/** Degrees between one stop and the next. */
export const STEP = 360 / STRIP_LENGTH

/** How long each reel's turn lasts: it reaches its stop 90% of the way through, with the clunk, then settles. In step with slots.css. */
export const REEL_MS = REEL_STOP_MS.map((ms) => Math.round(ms / 0.9))

/** Whole turns before each reel stops, at least: the later reels spin longer. */
const TURNS = [2, 3, 4]

/** The drum's angle with `stop` on the line. */
export const restAngle = (stop: number) => stop * STEP

/** A reel's turn, from the stop it was resting on to its new one: always backwards, through its turns. */
export function turnAngles(from: number, to: number, reel: number): { from: number; to: number } {
  const start = restAngle(from)
  const end = restAngle(to)
  const turns = TURNS[reel] + Math.ceil((end - start) / 360)
  return { from: start, to: end - 360 * turns }
}

/**
 * Where a machine's reels sit before anyone has pulled: symbols on the line
 * (blanks are the odd stops), but for a blank on the middle reel where
 * three symbols would always pay, and nothing that pays. Picked by `seed`,
 * so a machine looks the same every time it's drawn.
 */
export function idleStops(rules: Rules, seed: number): Stops {
  const rng = createRng(seed)
  const symbolStop = () => 2 + 2 * Math.floor(rng() * (STRIP_LENGTH / 2 - 1))
  for (let tries = 0; tries < 400; tries++) {
    const stops: Stops = [symbolStop(), tries < 100 ? symbolStop() : symbolStop() + 1, symbolStop()]
    if (!evaluate(rules, lineOf(rules, stops), 1)) return stops
  }
  return [1, 1, 1]
}

/** Which reels a win lights up: all three for a line of symbols, or the ones holding the symbol a pay counts. */
export function litReels(rules: Rules, spin: Spin): boolean[] {
  if (!spin.win) return [false, false, false]
  const match = rules.pays[spin.win.pay].match
  if (match.kind === 'line') return [true, true, true]
  return spin.line.map((s) => s === match.symbol)
}

/** A pull on the row that's about to show the jackpot: the marquee holds the meter where it was until its reels stop. */
export const jackpotPending = (pull: Pull | null): Spin | null => (pull && !pull.settled && pull.spin.win?.meter ? pull.spin : null)

/**
 * Table talk: the AI opponent's remarks about the game as it goes.
 *
 * After each move, `momentOf` names the most notable thing about it (a
 * corner taken, a player left without a move, a big sweep of discs).
 * `TableTalk` then decides whether the opponent says anything. Corners and
 * passes usually get a line and ordinary moves rarely do, nobody talks two
 * moves running, and lines don't repeat until each one has been used.
 *
 * Pure apart from the rng, so it's testable without the UI. Each opponent's
 * lines live with the rest of their personality in content.ts.
 */

import { type Rng, pick } from '../../core/rng'
import { type GameEvent, type GameState, type Player, squareName } from './engine'

/**
 * Something worth a remark, from the speaker's side: "you" is the human,
 * "I" the opponent. Listed from most to least notable.
 */
export const MOMENTS = [
  'hello',
  'youTookCorner',
  'iTookCorner',
  /** The opponent's move left you without one: you pass and they go again. */
  'youPassed',
  /** The opponent has no move and passes. */
  'iPassed',
  /** Six or more discs turned in one move. */
  'youSwept',
  'iSwept',
  'youPlayed',
  'iPlayed',
] as const

export type Moment = (typeof MOMENTS)[number]

export interface Banter {
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /** A few lines for each moment. "{square}" is filled with the corner taken, in youTookCorner and iTookCorner. */
  lines: Record<Moment, readonly string[]>
}

/** Discs turned in one move that make it a sweep. */
export const SWEEP = 6

const CORNER_SQUARES = new Set([0, 7, 56, 63])

/** Chance of a remark, before chattiness. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  youTookCorner: 0.6,
  iTookCorner: 0.5,
  youPassed: 0.7,
  iPassed: 0.6,
  youSwept: 0.45,
  iSwept: 0.35,
  youPlayed: 0.04,
  iPlayed: 0.04,
}

/** Moves that must pass after a remark before the next one. Big moments wait less. */
const QUIET_AFTER_BIG = 2
const QUIET_AFTER_SMALL = 3
const BIG = new Set<Moment>(['youTookCorner', 'iTookCorner', 'youPassed', 'iPassed'])

export interface Found {
  moment: Moment
  square?: number
}

/** The most notable thing about a move, as seen by the opponent in seat `ai`. Null once the game is over. */
export function momentOf(before: GameState, events: readonly GameEvent[], after: GameState, ai: Player): Found | null {
  if (after.over) return null
  const mine = before.current === ai
  const placed = events.find((e) => e.type === 'placed')
  if (placed?.type === 'placed' && CORNER_SQUARES.has(placed.square)) {
    return { moment: mine ? 'iTookCorner' : 'youTookCorner', square: placed.square }
  }
  const passed = events.find((e) => e.type === 'passed')
  if (passed?.type === 'passed') return { moment: passed.player === ai ? 'iPassed' : 'youPassed' }
  const flipped = events.find((e) => e.type === 'flipped')
  if (flipped?.type === 'flipped' && flipped.squares.length >= SWEEP) return { moment: mine ? 'iSwept' : 'youSwept' }
  return placed ? { moment: mine ? 'iPlayed' : 'youPlayed' } : null
}

/** One opponent's side of the conversation for one game. */
export class TableTalk {
  private readonly banter: Banter
  private readonly rng: Rng
  /** The color the opponent plays. */
  private readonly seat: Player
  private lastTurn = -Infinity
  private readonly used = new Set<string>()

  constructor(banter: Banter, rng: Rng, seat: Player) {
    this.banter = banter
    this.rng = rng
    this.seat = seat
  }

  /** What they say as you sit down. The first move passes quietly after it. */
  hello(): string {
    this.lastTurn = -1
    return this.say({ moment: 'hello' })
  }

  /** A remark about the move that took `before` to `after`, or null to stay quiet. */
  react(before: GameState, events: readonly GameEvent[], after: GameState): string | null {
    const found = momentOf(before, events, after, this.seat)
    if (!found) return null
    const quiet = BIG.has(found.moment) ? QUIET_AFTER_BIG : QUIET_AFTER_SMALL
    if (before.turn - this.lastTurn < quiet) return null
    if (this.rng() >= CHANCE[found.moment] * this.banter.chattiness) return null
    this.lastTurn = before.turn
    return this.say(found)
  }

  private say({ moment, square }: Found): string {
    const lines = this.banter.lines[moment]
    let fresh = lines.filter((l) => !this.used.has(l))
    if (fresh.length === 0) {
      for (const l of lines) this.used.delete(l)
      fresh = lines.slice()
    }
    const line = pick(fresh, this.rng)
    this.used.add(line)
    return line.replace('{square}', square === undefined ? 'that corner' : squareName(square))
  }
}

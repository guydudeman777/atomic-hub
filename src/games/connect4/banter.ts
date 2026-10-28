/**
 * Table talk: the AI opponent's remarks about the game as it goes.
 *
 * After each drop, `momentOf` names the most notable thing about it (a win
 * blocked, a new threat, the middle of the bottom row taken). `TableTalk`
 * then decides whether the opponent says anything. Blocks usually get a
 * line and ordinary drops rarely do, nobody talks two moves running, and
 * lines don't repeat until each one has been used.
 *
 * Pure apart from the rng, so it's testable without the UI. Each opponent's
 * lines live with the rest of their personality in content.ts.
 */

import { type Rng, pick } from '../../core/rng'
import { type GameEvent, type GameState, type Player, colOf, other, squareOf, winningSquares } from './engine'

/**
 * Something worth a remark, from the speaker's side: "you" is the human,
 * "I" the opponent. Listed from most to least notable.
 */
export const MOMENTS = [
  'hello',
  /** You dropped into the hole the opponent was about to win with. */
  'youBlocked',
  'iBlocked',
  /** A new hole where the one who dropped would make four. */
  'youThreat',
  'iThreat',
  /** The middle of the bottom row, the best start there is. */
  'youCenter',
  'iCenter',
  'youPlayed',
  'iPlayed',
] as const

export type Moment = (typeof MOMENTS)[number]

export interface Banter {
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /** A few lines for each moment. "{column}" is filled with the column it's about: the drop, or the new threat. */
  lines: Record<Moment, readonly string[]>
}

/** The bottom of the middle column. */
const CENTER = squareOf(3, 0)

/** Chance of a remark, before chattiness. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  youBlocked: 0.7,
  iBlocked: 0.55,
  youThreat: 0.45,
  iThreat: 0.4,
  youCenter: 0.5,
  iCenter: 0.35,
  youPlayed: 0.04,
  iPlayed: 0.04,
}

/** Moves that must pass after a remark before the next one. Big moments wait less. */
const QUIET_AFTER_BIG = 2
const QUIET_AFTER_SMALL = 3
const BIG = new Set<Moment>(['youBlocked', 'iBlocked', 'youThreat', 'iThreat'])

export interface Found {
  moment: Moment
  /** The column it's about, from 0. */
  col?: number
}

/** The most notable thing about a drop, as seen by the opponent in seat `ai`. Null once the game is over. */
export function momentOf(before: GameState, events: readonly GameEvent[], after: GameState, ai: Player): Found | null {
  if (after.over) return null
  const dropped = events.find((e) => e.type === 'dropped')
  if (dropped?.type !== 'dropped') return null
  const mover = dropped.player
  const mine = mover === ai
  const square = squareOf(dropped.col, dropped.row)
  if (winningSquares(before, other(mover)).includes(square)) return { moment: mine ? 'iBlocked' : 'youBlocked', col: dropped.col }
  const had = new Set(winningSquares(before, mover))
  const fresh = winningSquares(after, mover).find((sq) => !had.has(sq))
  if (fresh !== undefined) return { moment: mine ? 'iThreat' : 'youThreat', col: colOf(fresh) }
  if (square === CENTER) return { moment: mine ? 'iCenter' : 'youCenter', col: dropped.col }
  return { moment: mine ? 'iPlayed' : 'youPlayed', col: dropped.col }
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

  /** A remark about the drop that took `before` to `after`, or null to stay quiet. */
  react(before: GameState, events: readonly GameEvent[], after: GameState): string | null {
    const found = momentOf(before, events, after, this.seat)
    if (!found) return null
    const quiet = BIG.has(found.moment) ? QUIET_AFTER_BIG : QUIET_AFTER_SMALL
    if (before.turn - this.lastTurn < quiet) return null
    if (this.rng() >= CHANCE[found.moment] * this.banter.chattiness) return null
    this.lastTurn = before.turn
    return this.say(found)
  }

  private say({ moment, col }: Found): string {
    const lines = this.banter.lines[moment]
    let fresh = lines.filter((l) => !this.used.has(l))
    if (fresh.length === 0) {
      for (const l of lines) this.used.delete(l)
      fresh = lines.slice()
    }
    const line = pick(fresh, this.rng)
    this.used.add(line)
    return line.replace('{column}', col === undefined ? 'that one' : String(col + 1))
  }
}

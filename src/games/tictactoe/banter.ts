/**
 * Table talk: the AI opponent's remarks about the game as it goes.
 *
 * After each move, `momentOf` names the most notable thing about it (a
 * fork, a block, a small grid won, a player sent off to play anywhere).
 * `TableTalk` then decides whether the opponent says anything. Forks and
 * blocks usually get a line and ordinary moves rarely do, nobody talks two
 * moves running, and lines don't repeat until each one has been used.
 *
 * Pure apart from the rng, so it's testable without the UI. Each
 * opponent's lines live with the rest of their personality in content.ts.
 */

import { type Rng, pick } from '../../core/rng'
import { type GameEvent, type GameState, type Player, other, placeName, threats } from './engine'

/**
 * Something worth a remark, from the speaker's side: "you" is the human,
 * "I" the opponent. Listed from most to least notable.
 */
export const MOMENTS = [
  'hello',
  /** Two lines one mark from three at once: one of them can't be stopped. */
  'youForked',
  'iForked',
  /** A line one mark from three, stopped. */
  'youBlocked',
  'iBlocked',
  /** Ultimate: a small grid won. */
  'youTookGrid',
  'iTookGrid',
  /** A line one mark from three: two squares in Classic, two grids in Ultimate. */
  'youThreatened',
  'iThreatened',
  /** Ultimate: the opponent's move sent you to a closed grid, so you play anywhere. */
  'youGotFree',
  /** Ultimate: your move sent the opponent anywhere. */
  'iGotFree',
  'youPlayed',
  'iPlayed',
] as const

export type Moment = (typeof MOMENTS)[number]

export interface Banter {
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /** A few lines for each moment. "{grid}" is filled with the grid taken, in youTookGrid and iTookGrid: "the center". */
  lines: Record<Moment, readonly string[]>
}

/** Chance of a remark, before chattiness. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  youForked: 0.85,
  iForked: 0.8,
  youBlocked: 0.45,
  iBlocked: 0.45,
  youTookGrid: 0.45,
  iTookGrid: 0.4,
  youThreatened: 0.25,
  iThreatened: 0.3,
  youGotFree: 0.5,
  iGotFree: 0.45,
  youPlayed: 0.05,
  iPlayed: 0.05,
}

/** Moves that must pass after a remark before the next one. Big moments wait less. */
const QUIET_AFTER_BIG = 2
const QUIET_AFTER_SMALL = 3
const BIG = new Set<Moment>(['youForked', 'iForked', 'youBlocked', 'iBlocked', 'youTookGrid', 'iTookGrid', 'youGotFree', 'iGotFree'])

export interface Found {
  moment: Moment
  grid?: number
}

/** The most notable thing about a move, as seen by the opponent playing `ai`. Null once the game is over. */
export function momentOf(before: GameState, events: readonly GameEvent[], after: GameState, ai: Player): Found | null {
  if (after.over) return null
  const mover = before.current
  const mine = mover === ai
  const said = (you: Moment, me: Moment, grid?: number): Found => ({ moment: mine ? me : you, ...(grid === undefined ? {} : { grid }) })
  const ownBefore = threats(before, mover).length
  const ownAfter = threats(after, mover).length
  if (ownAfter >= 2 && ownBefore < 2) return said('youForked', 'iForked')
  if (threats(after, other(mover)).length < threats(before, other(mover)).length) return said('youBlocked', 'iBlocked')
  const won = events.find((e) => e.type === 'grid-won')
  if (won?.type === 'grid-won') return said('youTookGrid', 'iTookGrid', won.grid)
  if (ownAfter > ownBefore) return said('youThreatened', 'iThreatened')
  const sent = events.find((e) => e.type === 'sent')
  if (sent?.type === 'sent' && sent.grid === null) return { moment: sent.player === ai ? 'iGotFree' : 'youGotFree' }
  return said('youPlayed', 'iPlayed')
}

/** One opponent's side of the conversation for one game. */
export class TableTalk {
  private readonly banter: Banter
  private readonly rng: Rng
  /** The mark the opponent plays. */
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

  private say({ moment, grid }: Found): string {
    const lines = this.banter.lines[moment]
    let fresh = lines.filter((l) => !this.used.has(l))
    if (fresh.length === 0) {
      for (const l of lines) this.used.delete(l)
      fresh = lines.slice()
    }
    const line = pick(fresh, this.rng)
    this.used.add(line)
    const name = grid === undefined ? 'that one' : placeName(grid)
    // At the start of a line, "The center".
    return line.replace(/^\{grid\}/, name[0].toUpperCase() + name.slice(1)).replace('{grid}', name)
  }
}

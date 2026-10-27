/**
 * Table talk: the AI opponent's remarks about your plays and their own.
 *
 * After each move, `momentOf` names the most notable thing that just
 * happened (a Jack on someone's caravan, a caravan sold, a lane pushed over
 * 26...). `TableTalk` then decides whether the opponent says anything about
 * it. Big moments usually get a line and small ones rarely do, nobody talks
 * on two turns in a row, and lines don't repeat until each one has been used.
 *
 * Pure apart from the rng, so it's testable without the UI. Each opponent's
 * lines live with the rest of their personality in content.ts.
 */

import { type Card, cardName } from '../../core/cards'
import { type Rng, pick } from '../../core/rng'
import {
  type GameEvent,
  type GameState,
  type PlayerId,
  LANES,
  SOLD_MAX,
  caravanValue,
  isSold,
  laneOutcome,
  other,
} from './engine'

/**
 * Something worth a remark, from the speaker's side: "you" is the human,
 * "I" the opponent. Listed from most to least notable.
 */
export const MOMENTS = [
  'hello',
  /** A Jack or Joker took cards off the other player's caravans. */
  'youTookMine',
  'iTookYours',
  /** A King pushed the other player's caravan over 26. */
  'youBustedMine',
  'iBustedYours',
  /** The mover now holds two lanes, one short of winning. */
  'youNearWin',
  'iNearWin',
  /** The human pushed their own caravan over 26. */
  'youBusted',
  'youSold',
  'iSold',
  'youDisbanded',
  'iDisbanded',
  'youDiscarded',
  'iDiscarded',
  'youPlayed',
  'iPlayed',
] as const

export type Moment = (typeof MOMENTS)[number]

export interface Banter {
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /**
   * A few lines for each moment. "{card}" is filled with the card taken in
   * youTookMine and iTookYours, and "{value}" with the caravan's value in
   * youSold and iSold.
   */
  lines: Record<Moment, readonly string[]>
}

export interface Found {
  moment: Moment
  card?: Card
  value?: number
}

/** Which placeholder each moment can fill. */
export const PLACEHOLDERS: Partial<Record<Moment, '{card}' | '{value}'>> = {
  youTookMine: '{card}',
  iTookYours: '{card}',
  youSold: '{value}',
  iSold: '{value}',
}

/** Chance of a remark, before chattiness. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  youTookMine: 0.7,
  iTookYours: 0.55,
  youBustedMine: 0.65,
  iBustedYours: 0.5,
  youNearWin: 0.5,
  iNearWin: 0.45,
  youBusted: 0.5,
  youSold: 0.3,
  iSold: 0.3,
  youDisbanded: 0.45,
  iDisbanded: 0.4,
  youDiscarded: 0.1,
  iDiscarded: 0.08,
  youPlayed: 0.05,
  iPlayed: 0.05,
}

/** Turns that must pass after a remark before the next one. Big moments wait less. */
const QUIET_AFTER_BIG = 2
const QUIET_AFTER_SMALL = 3
const BIG = new Set<Moment>(['youTookMine', 'iTookYours', 'youBustedMine', 'iBustedYours', 'youNearWin', 'iNearWin'])

const lanesHeld = (state: GameState, player: PlayerId) => LANES.filter((l) => laneOutcome(state, l) === player).length

/** The most notable thing about a move, as seen by the opponent in seat `ai`. Null once the game is over. */
export function momentOf(before: GameState, events: readonly GameEvent[], after: GameState, ai: PlayerId): Found | null {
  if (after.winner !== null) return null
  const mover = before.current
  const victim = other(mover)
  const mine = mover === ai

  const taken = events.find((e) => e.type === 'removed' && e.owner === victim)
  if (taken?.type === 'removed') return { moment: mine ? 'iTookYours' : 'youTookMine', card: taken.cards[0] }

  for (const lane of LANES) {
    const was = caravanValue(before.players[victim].caravans[lane])
    if (was <= SOLD_MAX && caravanValue(after.players[victim].caravans[lane]) > SOLD_MAX) {
      return { moment: mine ? 'iBustedYours' : 'youBustedMine' }
    }
  }

  if (lanesHeld(after, mover) >= 2 && lanesHeld(before, mover) < 2) return { moment: mine ? 'iNearWin' : 'youNearWin' }

  let sold: number | null = null
  for (const lane of LANES) {
    const was = caravanValue(before.players[mover].caravans[lane])
    const now = caravanValue(after.players[mover].caravans[lane])
    // The AI only goes over on purpose, to set something up, so it doesn't remark on it.
    if (!mine && was <= SOLD_MAX && now > SOLD_MAX) return { moment: 'youBusted' }
    if (!isSold(was) && isSold(now)) sold = now
  }
  if (sold !== null) return { moment: mine ? 'iSold' : 'youSold', value: sold }

  const first = events[0]
  if (first?.type === 'disbanded') return { moment: mine ? 'iDisbanded' : 'youDisbanded' }
  if (first?.type === 'discarded') return { moment: mine ? 'iDiscarded' : 'youDiscarded' }
  if (first?.type === 'played') return { moment: mine ? 'iPlayed' : 'youPlayed' }
  return null
}

/** One opponent's side of the conversation for one game. */
export class TableTalk {
  private readonly banter: Banter
  private readonly rng: Rng
  /** The seat the opponent sits in. */
  private readonly seat: PlayerId
  private lastTurn = -Infinity
  private readonly used = new Set<string>()

  constructor(banter: Banter, rng: Rng, seat: PlayerId = 1) {
    this.banter = banter
    this.rng = rng
    this.seat = seat
  }

  /** What they say as the cards are dealt. The first turn passes quietly after it. */
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

  private say({ moment, card, value }: Found): string {
    const lines = this.banter.lines[moment]
    let fresh = lines.filter((l) => !this.used.has(l))
    if (fresh.length === 0) {
      for (const l of lines) this.used.delete(l)
      fresh = lines.slice()
    }
    const line = pick(fresh, this.rng)
    this.used.add(line)
    return line.replace('{card}', card ? cardName(card) : 'that card').replace('{value}', String(value ?? ''))
  }
}

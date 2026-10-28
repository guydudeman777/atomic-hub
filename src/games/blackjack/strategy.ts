/**
 * Basic strategy, the Hi-Lo count, and the plays a counter changes with it.
 *
 * The chart is the standard one for this table's rules: six decks, dealer
 * stands on soft 17, double after split, no surrender. It's the best play
 * for each hand when you know nothing about the cards left in the shoe.
 * The coach uses it, the Strategy page draws it, and most bots follow it
 * (some on purpose less than others).
 */

import type { Card } from '../../core/cards'
import { type PlayerAction, type TableState, cardValue, cardsLeft, handTotal, isPair } from './engine'

/**
 * One cell of the chart:
 * H hit, S stand, P split,
 * D double (hit if you can't), Ds double (stand if you can't).
 */
export type Play = 'H' | 'S' | 'P' | 'D' | 'Ds'

/** Dealer up cards in chart order: 2–10, then Ace. */
export const UP_CARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
export type UpCard = (typeof UP_CARDS)[number]

/** Each row as a string, one letter per up card. Lower case d is Ds. */
const row = (cells: string): Play[] => cells.split('').map((c) => (c === 'd' ? 'Ds' : (c as Play)))

/** Hard totals, 8 or less through 17 or more. */
export const HARD: Record<number, Play[]> = {
  8: row('HHHHHHHHHH'),
  9: row('HDDDDHHHHH'),
  10: row('DDDDDDDDHH'),
  11: row('DDDDDDDDDH'),
  12: row('HHSSSHHHHH'),
  13: row('SSSSSHHHHH'),
  14: row('SSSSSHHHHH'),
  15: row('SSSSSHHHHH'),
  16: row('SSSSSHHHHH'),
  17: row('SSSSSSSSSS'),
}

/** Soft totals: an Ace counted as 11 with 2 through 9 (soft 13 to soft 20). */
export const SOFT: Record<number, Play[]> = {
  13: row('HHHDDHHHHH'),
  14: row('HHHDDHHHHH'),
  15: row('HHDDDHHHHH'),
  16: row('HHDDDHHHHH'),
  17: row('HDDDDHHHHH'),
  18: row('SddddSSHHH'),
  19: row('SSSSSSSSSS'),
  20: row('SSSSSSSSSS'),
}

/** Pairs, by the value of one card (11 is Aces). An H or S here means don't split; play the total. */
export const PAIRS: Record<number, Play[]> = {
  11: row('PPPPPPPPPP'),
  10: row('SSSSSSSSSS'),
  9: row('PPPPPSPPSS'),
  8: row('PPPPPPPPPP'),
  7: row('PPPPPPHHHH'),
  6: row('PPPPPHHHHH'),
  5: row('DDDDDDDDHH'),
  4: row('HHHPPHHHHH'),
  3: row('PPPPPPHHHH'),
  2: row('PPPPPPHHHH'),
}

export const upValue = (card: Card): UpCard => (card.rank === 'A' ? 11 : (cardValue(card) as UpCard))

const column = (up: Card) => UP_CARDS.indexOf(upValue(up))

export interface Options {
  canDouble: boolean
  canSplit: boolean
}

/** What a chart cell means for a hand that may not be able to double or split. */
function resolve(play: Play, { canDouble }: Options): PlayerAction {
  if (play === 'D') return canDouble ? 'double' : 'hit'
  if (play === 'Ds') return canDouble ? 'double' : 'stand'
  return play === 'S' ? 'stand' : 'hit'
}

/** The chart's cell for a hand, before considering what the hand is allowed to do. */
export function chartPlay(cards: readonly Card[], up: Card, options: Options): Play {
  const col = column(up)
  if (isPair(cards) && options.canSplit) {
    const play = PAIRS[pairValue(cards[0])][col]
    if (play === 'P') return 'P'
  }
  const { total, soft } = handTotal(cards)
  if (soft && total <= 12) return 'H'
  if (soft && total < 21) return SOFT[total][col]
  if (total >= 17) return 'S'
  return HARD[Math.max(8, total)][col]
}

export function basicStrategy(cards: readonly Card[], up: Card, options: Options): PlayerAction {
  const allowed = playable(cards, options)
  const play = chartPlay(cards, up, allowed)
  return play === 'P' ? 'split' : resolve(play, allowed)
}

/** Doubling and splitting only ever happen on a first two cards. */
const playable = (cards: readonly Card[], { canDouble, canSplit }: Options): Options => ({
  canDouble: canDouble && cards.length === 2,
  canSplit: canSplit && isPair(cards),
})

/** Basic strategy never takes insurance. It only pays when a third of the cards left are tens. */
export const BASIC_INSURANCE = false

// ---- Counting ----------------------------------------------------------------

/** Hi-Lo: low cards leaving the shoe are good for the player, tens and Aces leaving are bad. */
export function hiLo(card: Card): number {
  const value = cardValue(card)
  if (value >= 2 && value <= 6) return 1
  if (value === 10 || value === 1) return -1
  return 0
}

/** The running count of every card seen in this shoe. The hole card counts once it's turned over. */
export function runningCount(state: TableState): number {
  let count = 0
  for (let i = 0; i < state.dealt; i++) count += hiLo(state.shoe[i])
  if (state.dealer.length >= 2 && !state.holeRevealed) count -= hiLo(state.dealer[1])
  return count
}

/** The running count per deck left in the shoe, which is what moves the odds. */
export function trueCount(state: TableState): number {
  return runningCount(state) / Math.max(0.5, cardsLeft(state) / 52)
}

interface Deviation {
  /** A hard total, or a pair by the value of one card. */
  total?: number
  pair?: number
  up: UpCard
  /** Make the play once the true count reaches `index` (or, with `below`, drops under it). */
  index: number
  below?: boolean
  play: Play
}

/**
 * The Illustrious 18: the plays most worth changing with the count, from
 * Don Schlesinger's list for these rules. (Insurance, the first of them, is
 * COUNTER_INSURANCE_INDEX.)
 */
const DEVIATIONS: Deviation[] = [
  { total: 16, up: 10, index: 0, play: 'S' },
  { total: 15, up: 10, index: 4, play: 'S' },
  { pair: 10, up: 5, index: 5, play: 'P' },
  { pair: 10, up: 6, index: 4, play: 'P' },
  { total: 10, up: 10, index: 4, play: 'D' },
  { total: 12, up: 3, index: 2, play: 'S' },
  { total: 12, up: 2, index: 3, play: 'S' },
  { total: 11, up: 11, index: 1, play: 'D' },
  { total: 9, up: 2, index: 1, play: 'D' },
  { total: 10, up: 11, index: 4, play: 'D' },
  { total: 9, up: 7, index: 3, play: 'D' },
  { total: 16, up: 9, index: 5, play: 'S' },
  { total: 13, up: 2, index: -1, below: true, play: 'H' },
  { total: 12, up: 4, index: 0, below: true, play: 'H' },
  { total: 12, up: 5, index: -2, below: true, play: 'H' },
  { total: 12, up: 6, index: -1, below: true, play: 'H' },
  { total: 13, up: 3, index: -2, below: true, play: 'H' },
]

/** A counter takes insurance once the true count reaches +3. */
export const COUNTER_INSURANCE_INDEX = 3

const pairValue = (card: Card) => (card.rank === 'A' ? 11 : cardValue(card))

/** Basic strategy, adjusted for the true count. Pairs the chart splits are always split. */
export function countedStrategy(cards: readonly Card[], up: Card, options: Options, count: number): PlayerAction {
  const basic = basicStrategy(cards, up, options)
  if (basic === 'split') return basic
  const u = upValue(up)
  const { total, soft } = handTotal(cards)
  const pair = isPair(cards) && options.canSplit ? pairValue(cards[0]) : null
  for (const d of DEVIATIONS) {
    if (d.up !== u) continue
    const matches = d.pair !== undefined ? d.pair === pair : !soft && d.total === total
    if (!matches || (d.below ? count >= d.index : count < d.index)) continue
    return d.play === 'P' ? 'split' : resolve(d.play, playable(cards, options))
  }
  return basic
}

// ---- Words -------------------------------------------------------------------

export const ACTION_LABEL: Record<PlayerAction, string> = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split' }

/** "hard 16", "soft 18", "a pair of 8s" */
export function describeHand(cards: readonly Card[]): string {
  if (isPair(cards)) {
    const value = cardValue(cards[0])
    if (cards[0].rank === 'A') return 'a pair of Aces'
    return value === 10 ? 'two tens' : `a pair of ${value}s`
  }
  const { total, soft } = handTotal(cards)
  return `${soft ? 'soft' : 'hard'} ${total}`
}

/** "a 6", "an Ace", "a ten" */
export function describeUp(up: Card): string {
  const u = upValue(up)
  if (u === 11) return 'an Ace'
  if (u === 10) return 'a ten'
  return u === 8 ? 'an 8' : `a ${u}`
}

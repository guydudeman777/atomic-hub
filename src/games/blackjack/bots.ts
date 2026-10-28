/**
 * How the regulars play: each bot's way of playing a hand and sizing a bet.
 * Some follow the book, one counts cards, and the rest play the way people
 * at real tables do. Pure, so self-play can measure them.
 */

import type { Card } from '../../core/cards'
import { type Action, type PlayerAction, type TableState, currentHand, handTotal, isBlackjack, isPair, legalActions, needsShuffle, upCard } from './engine'
import { COUNTER_INSURANCE_INDEX, type Options, basicStrategy, countedStrategy, trueCount, upValue } from './strategy'

/**
 * - book: perfect basic strategy
 * - counter: basic strategy changed with the count (the Illustrious 18)
 * - never-bust: stands on any hard 12 or more
 * - mimic: plays like the dealer, drawing to 17, never doubling or splitting
 * - wild: doubles and splits far more than it should
 * - timid: basic strategy without the doubles, splitting only Aces and 8s
 */
export type PlayStyle = 'book' | 'counter' | 'never-bust' | 'mimic' | 'wild' | 'timid'

/**
 * - flat: the same bet every hand
 * - spread: a counter's bets, bigger as the true count climbs
 * - parlay: lets a win ride, up to eight times the base bet
 * - martingale: doubles up after every loss
 */
export type BetStyle = 'flat' | 'spread' | 'parlay' | 'martingale'

export type InsuranceStyle = 'never' | 'always' | 'count' | 'even-money'

export interface BotStyle {
  play: PlayStyle
  betting: BetStyle
  insurance: InsuranceStyle
  /** The base bet, in table minimums. */
  unit: number
}

/** What a bot remembers between rounds, for its betting. */
export interface BetMemory {
  lastBet: number
  /** The last round's result: positive won, negative lost. */
  lastNet: number
}

export const freshMemory = (): BetMemory => ({ lastBet: 0, lastNet: 0 })

export const remember = (bet: number, net: number): BetMemory => ({ lastBet: bet, lastNet: net })

/** A parlay rides until the bet reaches this many base bets, then starts over. */
const PARLAY_CAP = 8

/** Counters raise their bet one step per true count above +1. */
const SPREAD = [1, 1, 2, 4, 6, 8]

/** The bot's bet for the next round, or 0 if it can't cover the table minimum. */
export function botBet(style: BotStyle, memory: BetMemory, state: TableState, stack: number): number {
  const { min, max } = state.limits
  const base = min * style.unit
  let bet = base
  if (style.betting === 'spread') {
    // A new shoe starts the count over.
    const count = needsShuffle(state) ? 0 : Math.floor(trueCount(state))
    bet = base * SPREAD[Math.max(0, Math.min(SPREAD.length - 1, count))]
  } else if (style.betting === 'parlay' && memory.lastNet > 0 && memory.lastBet < base * PARLAY_CAP) {
    bet = memory.lastBet * 2
  } else if (style.betting === 'martingale' && memory.lastNet < 0) {
    bet = memory.lastBet * 2
  }
  bet = Math.min(Math.round(bet), max, stack)
  return bet >= min ? bet : 0
}

const isPairOf = (cards: readonly Card[], ...ranks: string[]) =>
  cards.length === 2 && cards[0].rank === cards[1].rank && ranks.includes(cards[0].rank)

/** The bot's decision, for whichever spot is up. `available` is what's left of its stack. */
export function botAction(style: BotStyle, state: TableState, available: number): Action {
  const legal = legalActions(state, available)
  if (state.phase === 'insurance') {
    const hand = state.spots[state.turn!.spot].hands[0]
    const wants =
      style.insurance === 'always' ||
      (style.insurance === 'count' && trueCount(state) >= COUNTER_INSURANCE_INDEX) ||
      (style.insurance === 'even-money' && isBlackjack(hand))
    const canTake = legal.some((a) => a.type === 'insurance' && a.take)
    return { type: 'insurance', take: wants && canTake }
  }
  if (state.phase !== 'playing') return legal[0]

  const cards = currentHand(state)!.cards
  const up = upCard(state)!
  const allowed = new Set(legal.map((a) => a.type))
  const options = { canDouble: allowed.has('double'), canSplit: allowed.has('split') }
  const choice = PLAYS[style.play](cards, up, options, state)
  return { type: allowed.has(choice) ? choice : 'hit' }
}

type Player = (cards: readonly Card[], up: Card, options: Options, state: TableState) => PlayerAction

const PLAYS: Record<PlayStyle, Player> = {
  book: basicStrategy,

  counter: (cards, up, options, state) => countedStrategy(cards, up, options, trueCount(state)),

  'never-bust': (cards, up, options) => {
    const { total, soft } = handTotal(cards)
    if (options.canSplit && isPairOf(cards, 'A', '8')) return 'split'
    if (options.canDouble && !soft && (total === 10 || total === 11) && upValue(up) <= 9) return 'double'
    if (soft) return total >= 18 ? 'stand' : 'hit'
    return total >= 12 ? 'stand' : 'hit'
  },

  mimic: (cards) => (handTotal(cards).total < 17 ? 'hit' : 'stand'),

  wild: (cards, up, options) => {
    const { total, soft } = handTotal(cards)
    const u = upValue(up)
    if (options.canSplit && isPair(cards) && !isPairOf(cards, '5')) {
      // Even tens, against a weak dealer.
      const tens = total === 20
      if (!tens || (u >= 4 && u <= 6)) return 'split'
    }
    if (options.canDouble && !soft && total >= 9 && total <= 11) return 'double'
    if (options.canDouble && soft && total >= 13 && total <= 18 && u <= 6) return 'double'
    return basicStrategy(cards, up, options)
  },

  timid: (cards, up, options) => {
    if (options.canSplit && isPairOf(cards, 'A', '8')) return 'split'
    return basicStrategy(cards, up, { canDouble: false, canSplit: false })
  },
}

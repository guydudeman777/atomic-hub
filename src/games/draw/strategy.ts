/**
 * The book draw: which cards to keep, for the hints and as every regular's
 * starting point. In order, the first that fits:
 *
 * 1. A straight or better: stand pat.
 * 2. Four of a kind: keep them and draw one, which hides what you have.
 * 3. Three of a kind: draw two. Two pair: draw one.
 * 4. Four to a straight flush: draw one.
 * 5. A pair of Jacks or better: draw three.
 * 6. Four to a flush: draw one. It comes in about one time in five, and a
 *    flush usually wins; a small pair rarely does against a full table.
 * 7. A small pair: draw three.
 * 8. Four to an open-ended straight: draw one.
 * 9. An Ace: keep it and draw four.
 * 10. Nothing: keep the two highest and draw three.
 *
 * Inside straights and three-card draws aren't worth chasing.
 */

import { type Card, SUIT_NAME, type Suit } from '../../core/cards'
import { CATEGORY_NAME, RANK_VALUE, evaluate, rankName, rankPlural } from '../../core/poker'

export type Keep =
  | 'pat'
  | 'quads'
  | 'trips'
  | 'two-pair'
  | 'straight-flush-draw'
  | 'high-pair'
  | 'flush-draw'
  | 'low-pair'
  | 'straight-draw'
  | 'ace'
  | 'high-cards'

export interface DrawPlan {
  kind: Keep
  /** In the hand's own order. */
  keep: Card[]
  discard: Card[]
  /** Why, in a sentence: “Keep the pair of Jacks and draw three.” */
  reason: string
}

export const rankOf = (card: Card): number => RANK_VALUE[card.rank as keyof typeof RANK_VALUE]

const COUNT = ['none', 'one', 'two', 'three', 'four']

/** Keep `keep` from `cards`, with the reason that goes with it. */
function plan(cards: readonly Card[], kind: Keep, keep: readonly Card[], reason: (draw: string) => string): DrawPlan {
  const kept = cards.filter((c) => keep.includes(c))
  const discard = cards.filter((c) => !keep.includes(c))
  return { kind, keep: kept, discard, reason: reason(COUNT[discard.length]) }
}

/** Cards grouped by rank, the biggest group first, then the highest rank. */
export function rankGroups(cards: readonly Card[]): Card[][] {
  const byRank = new Map<number, Card[]>()
  for (const c of cards) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c])
  return [...byRank.values()].sort((a, b) => b.length - a.length || rankOf(b[0]) - rankOf(a[0]))
}

/** Four cards of one suit, if there are exactly four. */
export function flushDraw(cards: readonly Card[]): Card[] | null {
  for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
    const same = cards.filter((c) => c.suit === suit)
    if (same.length === 4) return same
  }
  return null
}

/**
 * Four cards of different ranks that one more card could make a straight.
 * Open-ended: four in a row with room at both ends (not A-2-3-4 or J-Q-K-A).
 * Otherwise any four within a five-rank window, the Ace high or low.
 */
export function straightDraw(cards: readonly Card[], openOnly: boolean): Card[] | null {
  // Every window of five ranks, highest first; 1 is the Ace played low.
  for (let top = 14; top >= 5; top--) {
    const low = top - 4
    const inWindow: Card[] = []
    for (let r = top; r >= low; r--) {
      const card = cards.find((c) => rankOf(c) === r || (r === 1 && c.rank === 'A'))
      if (card && !inWindow.includes(card)) inWindow.push(card)
    }
    if (inWindow.length !== 4) continue
    const ranks = inWindow.map((c) => (low === 1 && c.rank === 'A' ? 1 : rankOf(c)))
    const run = Math.max(...ranks) - Math.min(...ranks) === 3
    const open = run && Math.min(...ranks) > 1 && Math.max(...ranks) < 14
    if (!openOnly || open) return inWindow
  }
  return null
}

const suitWord = (suit: Suit | null) => (suit ? SUIT_NAME[suit] : '')

/** The book's draw for a five-card hand. */
export function bookDraw(cards: readonly Card[]): DrawPlan {
  const value = evaluate(cards)
  const groups = rankGroups(cards)
  const top = groups[0]

  if (['straight', 'flush', 'full-house', 'straight-flush', 'royal-flush'].includes(value.category)) {
    return plan(cards, 'pat', cards, () => `Stand pat with your ${CATEGORY_NAME[value.category].toLowerCase()}.`)
  }
  if (top.length === 4) return plan(cards, 'quads', top, (n) => `Keep the four ${rankPlural(rankOf(top[0]))} and draw ${n}. It hides what you have.`)
  if (top.length === 3) return plan(cards, 'trips', top, (n) => `Keep the three ${rankPlural(rankOf(top[0]))} and draw ${n}.`)
  if (top.length === 2 && groups[1].length === 2) {
    return plan(cards, 'two-pair', [...top, ...groups[1]], (n) => `Keep both pairs and draw ${n}, for a full house.`)
  }

  const flush = flushDraw(cards)
  const sfDraw = flush && straightDraw(flush, false)
  if (sfDraw) return plan(cards, 'straight-flush-draw', sfDraw, (n) => `Keep the four to a straight flush and draw ${n}.`)

  const pair = top.length === 2 ? top : null
  const pairName = pair && `pair of ${rankPlural(rankOf(pair[0]))}`
  if (pair && rankOf(pair[0]) >= 11) return plan(cards, 'high-pair', pair, (n) => `Keep the ${pairName} and draw ${n}.`)
  if (flush) return plan(cards, 'flush-draw', flush, (n) => `Keep the four ${suitWord(flush[0].suit)} and draw ${n}, for the flush.`)
  if (pair) return plan(cards, 'low-pair', pair, (n) => `Keep the ${pairName} and draw ${n}.`)

  const open = straightDraw(cards, true)
  if (open) {
    const ranks = open.map(rankOf)
    const from = rankName(Math.min(...ranks))
    const to = rankName(Math.max(...ranks))
    return plan(cards, 'straight-draw', open, (n) => `Keep the ${from} to ${to} and draw ${n}, for a straight at either end.`)
  }

  const ace = cards.find((c) => c.rank === 'A')
  if (ace) return plan(cards, 'ace', [ace], (n) => `Nothing made: keep the Ace and draw ${n}.`)
  const high = [...cards].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 2)
  return plan(
    cards,
    'high-cards',
    high,
    (n) => `Nothing worth keeping: hold the ${rankName(rankOf(high[0]))} and ${rankName(rankOf(high[1]))} and draw ${n}.`,
  )
}

/**
 * Poker hand values, shared by every poker game in the hub.
 *
 * `evaluate` turns five cards into a HandValue: its category (a pair, a
 * flush...) and a single score that orders hands, so comparing two hands is
 * comparing two numbers. Aces play high, or low in the wheel (A-2-3-4-5),
 * which is the lowest straight. Suits never break ties. Jokers aren't
 * supported.
 *
 * A score is the category's index in the top bits, then up to five ranks
 * (2–14) that decide ties, most important first, four bits each: the pair
 * before the kickers, the trips before the pair in a full house.
 */

import type { Card, Rank } from './cards'

/** Lowest to highest. A royal flush is the Ace-high straight flush, named on its own for paytables. */
export const CATEGORIES = [
  'high-card',
  'pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
  'royal-flush',
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_NAME: Record<Category, string> = {
  'high-card': 'High card',
  pair: 'Pair',
  'two-pair': 'Two pair',
  'three-of-a-kind': 'Three of a kind',
  straight: 'Straight',
  flush: 'Flush',
  'full-house': 'Full house',
  'four-of-a-kind': 'Four of a kind',
  'straight-flush': 'Straight flush',
  'royal-flush': 'Royal flush',
}

export interface HandValue {
  category: Category
  /** Higher beats lower; equal scores tie. */
  score: number
  /** The ranks that decide ties, most important first, 2–14. A wheel is Five high. */
  ranks: number[]
}

export const RANK_VALUE: Record<Exclude<Rank, 'JK'>, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
}

const SUIT_INDEX = { S: 0, H: 1, D: 2, C: 3 } as const

/** A card as one small number: its rank (2–14) times four, plus its suit. */
export function cardCode(card: Card): number {
  if (card.rank === 'JK' || !card.suit) throw new Error('Poker hands have no Jokers')
  return RANK_VALUE[card.rank] * 4 + SUIT_INDEX[card.suit]
}

// Scratch space for scoring: one hand at a time, without allocating.
const r = [0, 0, 0, 0, 0]
const groupRank = [0, 0, 0, 0, 0]
const groupSize = [0, 0, 0, 0, 0]

const pack = (category: number, a: number, b = 0, c = 0, d = 0, e = 0) =>
  (category << 20) | (a << 16) | (b << 12) | (c << 8) | (d << 4) | e

/** The score of five card codes. The hot path: no allocation. */
export function scoreCodes(c0: number, c1: number, c2: number, c3: number, c4: number): number {
  r[0] = c0 >> 2
  r[1] = c1 >> 2
  r[2] = c2 >> 2
  r[3] = c3 >> 2
  r[4] = c4 >> 2
  // Highest first.
  for (let i = 1; i < 5; i++) {
    const v = r[i]
    let j = i - 1
    while (j >= 0 && r[j] < v) {
      r[j + 1] = r[j]
      j--
    }
    r[j + 1] = v
  }
  const suit = c0 & 3
  const flush = (c1 & 3) === suit && (c2 & 3) === suit && (c3 & 3) === suit && (c4 & 3) === suit

  // Runs of equal ranks, then the biggest group first (ties stay highest first).
  let groups = 0
  for (let i = 0; i < 5; i++) {
    if (i > 0 && r[i] === r[i - 1]) groupSize[groups - 1]++
    else {
      groupRank[groups] = r[i]
      groupSize[groups] = 1
      groups++
    }
  }

  if (groups === 5) {
    const wheel = r[0] === 14 && r[1] === 5
    const straight = r[0] - r[4] === 4 || wheel
    const high = wheel ? 5 : r[0]
    if (straight && flush) return high === 14 ? pack(9, 14) : pack(8, high)
    if (flush) return pack(5, r[0], r[1], r[2], r[3], r[4])
    if (straight) return pack(4, high)
    return pack(0, r[0], r[1], r[2], r[3], r[4])
  }

  for (let i = 1; i < groups; i++) {
    const size = groupSize[i]
    const rank = groupRank[i]
    let j = i - 1
    while (j >= 0 && groupSize[j] < size) {
      groupSize[j + 1] = groupSize[j]
      groupRank[j + 1] = groupRank[j]
      j--
    }
    groupSize[j + 1] = size
    groupRank[j + 1] = rank
  }

  if (groups === 2) {
    return groupSize[0] === 4 ? pack(7, groupRank[0], groupRank[1]) : pack(6, groupRank[0], groupRank[1])
  }
  if (groups === 3) {
    return groupSize[0] === 3
      ? pack(3, groupRank[0], groupRank[1], groupRank[2])
      : pack(2, groupRank[0], groupRank[1], groupRank[2])
  }
  return pack(1, groupRank[0], groupRank[1], groupRank[2], groupRank[3])
}

/** How many tie-breaking ranks each category carries. */
const RANKS_USED = [5, 4, 3, 3, 1, 5, 2, 2, 1, 1]

export const categoryOf = (score: number): Category => CATEGORIES[score >> 20]

/** The HandValue behind a score. */
export function valueOf(score: number): HandValue {
  const index = score >> 20
  const ranks: number[] = []
  for (let i = 0; i < RANKS_USED[index]; i++) ranks.push((score >> (16 - i * 4)) & 15)
  return { category: CATEGORIES[index], score, ranks }
}

export function scoreOf(cards: readonly Card[]): number {
  if (cards.length !== 5) throw new Error(`A poker hand is five cards, not ${cards.length}`)
  return scoreCodes(cardCode(cards[0]), cardCode(cards[1]), cardCode(cards[2]), cardCode(cards[3]), cardCode(cards[4]))
}

/** The value of exactly five cards. */
export const evaluate = (cards: readonly Card[]): HandValue => valueOf(scoreOf(cards))

/** Positive if `a` beats `b`, negative if it loses, zero for a tie. */
export const compareHands = (a: readonly Card[], b: readonly Card[]): number => scoreOf(a) - scoreOf(b)

/** The best five of five to seven cards, for games with shared or extra cards. */
export function bestFive(cards: readonly Card[]): { cards: Card[]; value: HandValue } {
  if (cards.length < 5 || cards.length > 7) throw new Error(`Best five of ${cards.length} cards?`)
  const codes = cards.map(cardCode)
  const n = cards.length
  let best = -1
  let pick: number[] = []
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const score = scoreCodes(codes[a], codes[b], codes[c], codes[d], codes[e])
            if (score > best) {
              best = score
              pick = [a, b, c, d, e]
            }
          }
  return { cards: pick.map((i) => cards[i]), value: valueOf(best) }
}

const ONE: Record<number, string> = {
  1: 'Ace', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
}
const MANY: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
}

export const rankName = (rank: number): string => ONE[rank]
export const rankPlural = (rank: number): string => MANY[rank]

/** In words: "Two pair, Kings and Sevens", "Flush, Ace high", "Pair of Jacks". */
export function describeValue({ category, ranks }: HandValue): string {
  const [a, b] = ranks
  switch (category) {
    case 'royal-flush':
      return 'Royal flush'
    case 'straight-flush':
      return `Straight flush, ${ONE[a]} high`
    case 'four-of-a-kind':
      return `Four of a kind, ${MANY[a]}`
    case 'full-house':
      return `Full house, ${MANY[a]} over ${MANY[b]}`
    case 'flush':
      return `Flush, ${ONE[a]} high`
    case 'straight':
      return `Straight, ${ONE[a]} high`
    case 'three-of-a-kind':
      return `Three of a kind, ${MANY[a]}`
    case 'two-pair':
      return `Two pair, ${MANY[a]} and ${MANY[b]}`
    case 'pair':
      return `Pair of ${MANY[a]}`
    case 'high-card':
      return `${ONE[a]} high`
  }
}

export const describeHand = (cards: readonly Card[]): string => describeValue(evaluate(cards))

/**
 * Shared playing-card model.
 *
 * A card belongs to a *set* (a themed deck with its own back design). Card ids
 * are stable strings like `standard:10H` or `neon:JK1`, which is what save
 * files and deck lists store.
 */

export type Suit = 'S' | 'H' | 'D' | 'C'
export type NumberRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
export type FaceRank = 'J' | 'Q' | 'K'
export type Rank = NumberRank | FaceRank | 'JK'

export interface Card {
  readonly id: string
  readonly set: string
  readonly rank: Rank
  /** Jokers have no suit. */
  readonly suit: Suit | null
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']
export const NUMBER_RANKS: readonly NumberRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']
export const FACE_RANKS: readonly FaceRank[] = ['J', 'Q', 'K']

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const SUIT_NAME: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }

export function isRed(suit: Suit | null): boolean {
  return suit === 'H' || suit === 'D'
}

export function isNumberRank(rank: Rank): rank is NumberRank {
  return rank !== 'J' && rank !== 'Q' && rank !== 'K' && rank !== 'JK'
}

/** Pip value of a number card: Ace = 1, 2–10 face value. */
export function pipValue(rank: NumberRank): number {
  return rank === 'A' ? 1 : Number(rank)
}

export function makeCard(set: string, rank: Rank, suit: Suit | null, jokerIndex = 1): Card {
  const id = rank === 'JK' ? `${set}:JK${jokerIndex}` : `${set}:${rank}${suit}`
  return { id, set, rank, suit }
}

/** A full 54-card deck for one set: 52 cards plus two Jokers. */
export function fullSet(set: string): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of [...NUMBER_RANKS, ...FACE_RANKS]) cards.push(makeCard(set, rank, suit))
  }
  cards.push(makeCard(set, 'JK', null, 1), makeCard(set, 'JK', null, 2))
  return cards
}

/** Parse an id produced by makeCard back into a Card. */
export function parseCardId(id: string): Card {
  const [set, code] = id.split(':')
  if (!set || !code) throw new Error(`Bad card id: ${id}`)
  if (code.startsWith('JK')) return makeCard(set, 'JK', null, Number(code.slice(2)) || 1)
  const suit = code.slice(-1) as Suit
  const rank = code.slice(0, -1) as Rank
  if (!SUITS.includes(suit)) throw new Error(`Bad card id: ${id}`)
  return makeCard(set, rank, suit)
}

const RANK_NAME: Record<Rank, string> = {
  A: 'Ace', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  J: 'Jack', Q: 'Queen', K: 'King', JK: 'Joker',
}

/** Short label like "10♥" or "Joker". */
export function cardLabel(card: Card): string {
  if (card.rank === 'JK') return 'Joker'
  return `${card.rank}${SUIT_SYMBOL[card.suit as Suit]}`
}

/** Spoken label like "10 of hearts", for screen readers and logs. */
export function cardName(card: Card): string {
  if (card.rank === 'JK') return 'Joker'
  return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit as Suit]}`
}

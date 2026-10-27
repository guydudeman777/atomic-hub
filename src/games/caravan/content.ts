/**
 * Caravan content: collectible card sets, the opponent ladder and rewards.
 */

import { type Card, fullSet, isNumberRank, parseCardId } from '../../core/cards'
import { type Rng, shuffle } from '../../core/rng'
import type { AiProfile } from './ai'

export interface CardSetInfo {
  id: string
  name: string
  blurb: string
}

export const CARD_SETS: readonly CardSetInfo[] = [
  { id: 'standard', name: 'Wasteland Standard', blurb: 'Olive-drab backs. Every caravaneer starts with one.' },
  { id: 'rust', name: 'Rust Belt', blurb: 'Riveted scrap-metal backs from the salvage yards.' },
  { id: 'bloom', name: 'Desert Bloom', blurb: 'Sage-green backs with a cactus flower.' },
  { id: 'neon', name: 'Neon Strip', blurb: 'Hot pink and cyan, straight off a casino floor.' },
  { id: 'atomic', name: 'Atomic Age', blurb: 'Teal backs with orbiting electrons.' },
  { id: 'gold', name: "Prospector's Gold", blurb: 'Gold filigree. Rarely seen, never sold cheap.' },
]

export const setInfo = (id: string): CardSetInfo => CARD_SETS.find((s) => s.id === id) ?? CARD_SETS[0]

export const STARTER_SET = 'standard'

export interface Opponent {
  id: string
  name: string
  blurb: string
  difficulty: AiProfile['difficulty']
  profile: AiProfile
  set: string
  /** Most caps they'll put on the table. */
  maxWager: number
  /** New cards from their set you earn for a win. */
  rewardCards: number
  deck: () => Card[]
  lines: { win: string; lose: string }
}

export const OPPONENTS: readonly Opponent[] = [
  {
    id: 'dusty',
    name: 'Dusty Pete',
    blurb: 'Hauls scrap between outposts. Plays slow and builds his own caravans.',
    difficulty: 'easy',
    profile: { difficulty: 'easy', aggression: 0.1 },
    set: 'rust',
    maxWager: 50,
    rewardCards: 3,
    deck: () => fullSet('rust').filter((c) => c.rank !== 'JK' && c.rank !== 'K'),
    lines: { win: "Well, I'll be. Beginner's luck runs out eventually.", lose: 'Good game, partner. Take these, they rattle less in your pack.' },
  },
  {
    id: 'mari',
    name: 'Mari Vance',
    blurb: 'Runs water to the outlying farms. Careful, patient, hard to rattle.',
    difficulty: 'normal',
    profile: { difficulty: 'normal', aggression: 0.7 },
    set: 'bloom',
    maxWager: 100,
    rewardCards: 4,
    deck: () => fullSet('bloom').filter((c) => c.rank !== 'JK'),
    lines: { win: 'Slow and steady fills the canteen.', lose: 'Fair and square. These are yours.' },
  },
  {
    id: 'sully',
    name: 'Slick Sully',
    blurb: 'A card sharp from the casino strip who never met a Jack he didn’t like.',
    difficulty: 'normal',
    profile: { difficulty: 'normal', aggression: 1.3 },
    set: 'neon',
    maxWager: 200,
    rewardCards: 4,
    deck: () => fullSet('neon'),
    lines: { win: 'House always wins, friend.', lose: 'Huh. Nobody walks out of my game with my cards. Until now.' },
  },
  {
    id: 'atwood',
    name: 'Professor Atwood',
    blurb: 'Counts every card that hits the table and rarely miscounts.',
    difficulty: 'hard',
    profile: { difficulty: 'hard', aggression: 1 },
    set: 'atomic',
    maxWager: 300,
    rewardCards: 5,
    deck: () => fullSet('atomic'),
    lines: { win: 'The probabilities were always in my favor.', lose: 'Remarkable. I shall have to revise my models.' },
  },
  {
    id: 'prospector',
    name: 'The Prospector',
    blurb: 'Sits at the far table and has never lost there. Bring a good deck.',
    difficulty: 'hard',
    profile: { difficulty: 'hard', aggression: 1.15 },
    set: 'gold',
    maxWager: 500,
    rewardCards: 6,
    deck: () => fullSet('gold'),
    lines: { win: 'Plenty more fools where you came from.', lose: 'Forty years at this table. Take the gold, you earned it.' },
  },
]

export const opponentById = (id: string): Opponent | undefined => OPPONENTS.find((o) => o.id === id)

/** An opponent unlocks once you've beaten the one before them. */
export function isUnlocked(index: number, beaten: Record<string, number>): boolean {
  return index === 0 || (beaten[OPPONENTS[index - 1].id] ?? 0) > 0
}

/** Up to `count` random cards from `set` the player doesn't own yet. */
export function drawUnowned(set: string, owned: ReadonlySet<string>, count: number, rng: Rng): Card[] {
  return shuffle(
    fullSet(set).filter((c) => !owned.has(c.id)),
    rng,
  ).slice(0, count)
}

/** Caps paid instead of each reward card when the set is already complete. */
export const DUPLICATE_BONUS_CAPS = 25

export const PACK_SIZE = 5
export const PACK_PRICE = 150

/** Sets the Trader sells packs for: those whose owner you've beaten. */
export function traderSets(beaten: Record<string, number>): CardSetInfo[] {
  const sets = OPPONENTS.filter((o) => (beaten[o.id] ?? 0) > 0).map((o) => o.set)
  return CARD_SETS.filter((s) => sets.includes(s.id))
}

export interface SavedDeck {
  id: string
  name: string
  cards: string[]
}

export const STARTER_DECK: SavedDeck = {
  id: 'starter',
  name: 'Starter deck',
  cards: fullSet(STARTER_SET).map((c) => c.id),
}

export const deckCards = (deck: SavedDeck): Card[] => deck.cards.map(parseCardId)

/** Sort order for showing cards: by set, suit, then rank. */
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JK']
const SUIT_ORDER = ['S', 'H', 'D', 'C', null]
export function compareCards(a: Card, b: Card): number {
  const setOrder = CARD_SETS.findIndex((s) => s.id === a.set) - CARD_SETS.findIndex((s) => s.id === b.set)
  if (setOrder !== 0) return setOrder
  const suit = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)
  if (suit !== 0) return suit
  return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank) || a.id.localeCompare(b.id)
}

export const isFace = (c: Card) => !isNumberRank(c.rank)

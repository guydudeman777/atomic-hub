/**
 * Blackjack rules engine: a six-deck shoe game on Las Vegas Strip rules.
 *
 * Pure and framework-free, like Caravan's: the UI, the bots and the tests
 * drive a round through `legalActions` and `apply`. State is immutable.
 * Caps live outside the engine. It tracks what's staked on each hand and
 * what each hand pays back; callers move the money, using the `staked` and
 * `settled` events.
 *
 * Rules
 * - Six decks. The cut card sits a deck and a half from the back; once it
 *   comes out, the shoe is reshuffled before the next round.
 * - Every spot with a bet gets two cards face up, one at a time from first
 *   base (the dealer's left). The dealer takes one card up and one down.
 * - When the dealer shows an Ace, each spot may insure for half its bet;
 *   insurance pays 2 to 1. (Insuring a blackjack is taking even money.)
 * - When the dealer shows an Ace or a ten, the dealer checks the hole card
 *   before anyone plays. A dealer blackjack beats everything except a player
 *   blackjack, which pushes, so you never lose a double or a split to one.
 * - Blackjack pays 3 to 2, rounded down to whole caps.
 * - Hit, stand, double down on any first two cards (for exactly one more
 *   card), or split a pair. Any two ten-value cards count as a pair. Split
 *   up to four hands, and double after splitting. Split Aces get one card
 *   each and can't be split again. 21 on a split hand isn't a blackjack.
 * - The dealer draws to 17 and stands on all 17s, soft ones included.
 * - No surrender.
 */

import { type Card, FACE_RANKS, NUMBER_RANKS, SUITS, makeCard } from '../../core/cards'
import { createRng, shuffle } from '../../core/rng'

export const DECKS = 6
export const SHOE_SIZE = DECKS * 52
/** Cards behind the cut card. About three quarters of the shoe is dealt. */
export const CUT_CARD_DEPTH = 78
export const MAX_HANDS = 4
/** The card set the shoe is built from (it picks the card backs). */
export const SHOE_SET = 'vegas'

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust'
export type PlayerAction = 'hit' | 'stand' | 'double' | 'split'

/**
 * - betting: waiting for bets (before the first round)
 * - dealing: the opening two cards each, one `next` per card
 * - insurance: each spot decides, in order, while the dealer shows an Ace
 * - peek: the dealer is about to check for blackjack
 * - playing: each hand in turn, first base first
 * - dealer: the hole card turns over, then the dealer draws, one `next` each
 * - settled: every hand is paid; the next `deal` starts a new round
 */
export type Phase = 'betting' | 'dealing' | 'insurance' | 'peek' | 'playing' | 'dealer' | 'settled'

export interface Limits {
  readonly min: number
  readonly max: number
}

export interface Hand {
  readonly cards: readonly Card[]
  /** Caps riding on the hand, the double included. */
  readonly bet: number
  readonly doubled: boolean
  /** Made by splitting a pair. */
  readonly split: boolean
  /** No more decisions: stood, busted, doubled, made 21, or a split Ace. */
  readonly done: boolean
  readonly outcome: Outcome | null
  /** What the hand pays back once settled, stake included. */
  readonly payout: number
}

export interface Spot {
  /** Empty when nobody bet on this spot this round. */
  readonly hands: readonly Hand[]
  /** Insurance staked: null until decided (or never offered), 0 if declined. */
  readonly insurance: number | null
}

export interface Turn {
  readonly spot: number
  readonly hand: number
}

export interface TableState {
  readonly limits: Limits
  readonly seed: number
  /** Shoes shuffled so far. Each one is shuffled from the seed and its number. */
  readonly shoes: number
  /** Index 0 is the first card out. */
  readonly shoe: readonly Card[]
  /** Cards taken from the shoe so far. */
  readonly dealt: number
  /** Where the cut card sits: once `dealt` reaches it, the next round starts a new shoe. */
  readonly cutCard: number
  /** First base is spot 0. */
  readonly spots: readonly Spot[]
  /** The up card, then the hole card, then anything the dealer draws. */
  readonly dealer: readonly Card[]
  readonly holeRevealed: boolean
  readonly phase: Phase
  /** Whose decision it is, in the insurance and playing phases. */
  readonly turn: Turn | null
  readonly round: number
}

export type Action =
  | { readonly type: 'deal'; readonly bets: readonly number[] }
  /** The dealer's next step: a card, the peek, the hole card, a draw or the payout. */
  | { readonly type: 'next' }
  | { readonly type: 'insurance'; readonly take: boolean }
  | { readonly type: PlayerAction }

export interface SpotResult {
  spot: number
  /** Everything put on the table this round, insurance included. */
  staked: number
  /** Everything paid back, stakes included. */
  returned: number
}

export type TableEvent =
  | { type: 'shuffled' }
  | { type: 'dealt'; to: number | 'dealer'; hand: number; card: Card; faceDown: boolean }
  | { type: 'insured'; spot: number; amount: number }
  | { type: 'peeked'; blackjack: boolean }
  | { type: 'revealed'; card: Card }
  | { type: 'acted'; spot: number; hand: number; action: PlayerAction }
  /** More caps on the table: a double, a split or insurance. */
  | { type: 'staked'; spot: number; amount: number }
  | { type: 'busted'; spot: number; hand: number }
  | { type: 'dealer-done'; total: number; busted: boolean }
  | { type: 'settled'; results: SpotResult[] }

export interface ApplyResult {
  state: TableState
  events: TableEvent[]
}

// ---- Cards and totals --------------------------------------------------------

/** Ace counts 1 here; `handTotal` decides when it's worth 11. */
export function cardValue(card: Card): number {
  if (card.rank === 'A') return 1
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === '10') return 10
  return Number(card.rank)
}

export interface Total {
  total: number
  /** An Ace is counting as 11. */
  soft: boolean
}

export function handTotal(cards: readonly Card[]): Total {
  let total = 0
  let aces = false
  for (const card of cards) {
    total += cardValue(card)
    if (card.rank === 'A') aces = true
  }
  if (aces && total + 10 <= 21) return { total: total + 10, soft: true }
  return { total, soft: false }
}

/** Two cards worth 21, not from a split. */
export function isBlackjack(hand: Pick<Hand, 'cards' | 'split'>): boolean {
  return !hand.split && hand.cards.length === 2 && handTotal(hand.cards).total === 21
}

export function dealerHasBlackjack(state: TableState): boolean {
  return state.dealer.length === 2 && handTotal(state.dealer).total === 21
}

export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1])
}

export const upCard = (state: TableState): Card | undefined => state.dealer[0]

/** The dealer's total as the table sees it: just the up card until the hole card turns over. */
export function dealerShowing(state: TableState): Total {
  return handTotal(state.holeRevealed ? state.dealer : state.dealer.slice(0, 1))
}

/** Six fresh decks in order. Ids carry the shoe and deck number, so every card in play is unique. */
export function freshShoe(shoeNumber: number): Card[] {
  const cards: Card[] = []
  for (let deck = 0; deck < DECKS; deck++) {
    for (const suit of SUITS) {
      for (const rank of [...NUMBER_RANKS, ...FACE_RANKS]) {
        const card = makeCard(SHOE_SET, rank, suit)
        cards.push({ ...card, id: `${card.id}#${shoeNumber}.${deck}` })
      }
    }
  }
  return cards
}

function shuffledShoe(seed: number, shoeNumber: number): Card[] {
  return shuffle(freshShoe(shoeNumber), createRng((seed + Math.imul(shoeNumber, 0x9e3779b1)) >>> 0))
}

export const cardsLeft = (state: TableState): number => state.shoe.length - state.dealt

/** Cards in the discard tray: dealt from this shoe and no longer on the table. */
export function discards(state: TableState): number {
  const onTable = state.dealer.length + state.spots.reduce((n, s) => n + s.hands.reduce((m, h) => m + h.cards.length, 0), 0)
  return Math.max(0, state.dealt - onTable)
}

// ---- Setting up --------------------------------------------------------------

export interface NewTableOptions {
  spots: number
  limits: Limits
  seed: number
  /** A specific first shoe, for tests. */
  shoe?: readonly Card[]
}

export function createTable({ spots, limits, seed, shoe }: NewTableOptions): TableState {
  const first = shoe ?? shuffledShoe(seed, 1)
  return {
    limits,
    seed,
    shoes: 1,
    shoe: first,
    dealt: 0,
    cutCard: first.length - CUT_CARD_DEPTH,
    spots: Array.from({ length: spots }, () => ({ hands: [], insurance: null })),
    dealer: [],
    holeRevealed: false,
    phase: 'betting',
    turn: null,
    round: 0,
  }
}

const newHand = (bet: number): Hand => ({ cards: [], bet, doubled: false, split: false, done: false, outcome: null, payout: 0 })

/** A shoe needs reshuffling once the cut card is out. */
export const needsShuffle = (state: TableState): boolean => state.dealt >= state.cutCard

// ---- Whose move ----------------------------------------------------------------

/** Who acts next: the dealer, a spot, or nobody (waiting for bets). */
export function actor(state: TableState): 'dealer' | number | null {
  switch (state.phase) {
    case 'dealing':
    case 'peek':
    case 'dealer':
      return 'dealer'
    case 'insurance':
    case 'playing':
      return state.turn?.spot ?? null
    default:
      return null
  }
}

export function currentHand(state: TableState): Hand | null {
  if (state.phase !== 'playing' || !state.turn) return null
  return state.spots[state.turn.spot].hands[state.turn.hand] ?? null
}

export const insuranceCost = (bet: number): number => Math.floor(bet / 2)

/**
 * What the spot to act may do. `available` is what they have left to put on
 * the table, which decides whether they can afford to double, split or insure.
 */
export function legalActions(state: TableState, available = Infinity): Action[] {
  switch (state.phase) {
    case 'dealing':
    case 'peek':
    case 'dealer':
      return [{ type: 'next' }]
    case 'insurance': {
      const bet = state.turn ? state.spots[state.turn.spot].hands[0].bet : 0
      const cost = insuranceCost(bet)
      const decline: Action = { type: 'insurance', take: false }
      return cost > 0 && available >= cost ? [{ type: 'insurance', take: true }, decline] : [decline]
    }
    case 'playing': {
      const hand = currentHand(state)
      if (!hand || hand.done) return []
      const spot = state.spots[state.turn!.spot]
      const actions: Action[] = [{ type: 'hit' }, { type: 'stand' }]
      const firstTwo = hand.cards.length === 2
      if (firstTwo && available >= hand.bet) actions.push({ type: 'double' })
      const splitAces = hand.split && hand.cards[0].rank === 'A'
      if (isPair(hand.cards) && !splitAces && spot.hands.length < MAX_HANDS && available >= hand.bet) {
        actions.push({ type: 'split' })
      }
      return actions
    }
    default:
      return []
  }
}

export function isValidBets(state: TableState, bets: readonly number[]): boolean {
  const { min, max } = state.limits
  return (
    bets.length === state.spots.length &&
    bets.some((b) => b > 0) &&
    bets.every((b) => b === 0 || (Number.isInteger(b) && b >= min && b <= max))
  )
}

export function isLegal(state: TableState, action: Action, available = Infinity): boolean {
  if (action.type === 'deal') return (state.phase === 'betting' || state.phase === 'settled') && isValidBets(state, action.bets)
  return legalActions(state, available).some((a) => a.type === action.type && (a.type !== 'insurance' || a.take === (action as { take: boolean }).take))
}

// ---- Playing it out --------------------------------------------------------------

/** A mutable working copy for one `apply`. */
interface Draft {
  readonly seed: number
  shoe: readonly Card[]
  shoes: number
  dealt: number
  cutCard: number
  spots: { hands: Hand[]; insurance: number | null }[]
  dealer: Card[]
  holeRevealed: boolean
  phase: Phase
  turn: Turn | null
  round: number
  events: TableEvent[]
}

function draft(state: TableState): Draft {
  return {
    seed: state.seed,
    shoe: state.shoe,
    shoes: state.shoes,
    dealt: state.dealt,
    cutCard: state.cutCard,
    spots: state.spots.map((s) => ({ hands: s.hands.slice(), insurance: s.insurance })),
    dealer: state.dealer.slice(),
    holeRevealed: state.holeRevealed,
    phase: state.phase,
    turn: state.turn,
    round: state.round,
    events: [],
  }
}

/**
 * The next card out of the shoe. A full table can't get through the cards
 * behind the cut card in one round, but if it ever did, a fresh shoe is
 * shuffled in behind it. The cut card is long gone by then, so the next
 * round starts a new shoe anyway.
 */
function draw(d: Draft): Card {
  if (d.dealt >= d.shoe.length) {
    d.shoes += 1
    d.shoe = [...d.shoe, ...shuffledShoe(d.seed, d.shoes)]
    d.events.push({ type: 'shuffled' })
  }
  return d.shoe[d.dealt++]
}

const betSpots = (d: Pick<Draft, 'spots'>) => d.spots.flatMap((s, i) => (s.hands.length > 0 ? [i] : []))

/** Give a hand a card and close it if that ends its decisions. */
function giveCard(d: Draft, spot: number, index: number) {
  const hand = d.spots[spot].hands[index]
  const card = draw(d)
  const cards = [...hand.cards, card]
  d.events.push({ type: 'dealt', to: spot, hand: index, card, faceDown: false })
  const { total } = handTotal(cards)
  const splitAce = hand.split && cards[0].rank === 'A' && cards.length === 2
  let next: Hand = { ...hand, cards }
  if (total > 21) {
    next = { ...next, done: true, outcome: 'bust', payout: 0 }
    d.events.push({ type: 'busted', spot, hand: index })
  } else if (total === 21 || splitAce || hand.doubled) {
    next = { ...next, done: true }
  }
  d.spots[spot].hands[index] = next
}

/**
 * Move the turn to the next hand that needs a decision, starting from
 * `from`. A split hand waiting for its second card gets it on the way.
 */
function advance(d: Draft, from: Turn) {
  for (let spot = from.spot; spot < d.spots.length; spot++) {
    const hands = d.spots[spot].hands
    for (let index = spot === from.spot ? from.hand : 0; index < hands.length; index++) {
      if (hands[index].cards.length === 1) giveCard(d, spot, index)
      if (!hands[index].done) {
        d.turn = { spot, hand: index }
        return
      }
    }
  }
  d.turn = null
  d.phase = 'dealer'
}

/** Live hands still waiting on the dealer: not busted, and not a blackjack (already beaten or paid). */
function liveHands(d: Draft): boolean {
  return d.spots.some((s) => s.hands.some((h) => h.outcome !== 'bust' && !isBlackjack(h)))
}

function settle(d: Draft) {
  const dealer = handTotal(d.dealer).total
  const dealerBlackjack = d.dealer.length === 2 && dealer === 21
  const results: SpotResult[] = []
  d.spots.forEach((spot, i) => {
    if (spot.hands.length === 0) return
    spot.hands = spot.hands.map((hand) => {
      if (hand.outcome === 'bust') return hand
      const total = handTotal(hand.cards).total
      let outcome: Outcome
      if (isBlackjack(hand)) outcome = dealerBlackjack ? 'push' : 'blackjack'
      else if (dealerBlackjack) outcome = 'lose'
      else if (dealer > 21 || total > dealer) outcome = 'win'
      else outcome = total === dealer ? 'push' : 'lose'
      const payout = { blackjack: hand.bet + Math.floor(hand.bet * 1.5), win: hand.bet * 2, push: hand.bet, lose: 0, bust: 0 }[outcome]
      return { ...hand, done: true, outcome, payout }
    })
    const insurance = spot.insurance ?? 0
    const staked = spot.hands.reduce((n, h) => n + h.bet, 0) + insurance
    const returned = spot.hands.reduce((n, h) => n + h.payout, 0) + (dealerBlackjack ? insurance * 3 : 0)
    results.push({ spot: i, staked, returned })
  })
  d.phase = 'settled'
  d.turn = null
  d.events.push({ type: 'settled', results })
}

/** After the dealer's look at the hole card comes up empty, play begins. */
function startPlay(d: Draft) {
  d.phase = 'playing'
  const first = betSpots(d)[0]
  advance(d, { spot: first, hand: 0 })
}

function finish(state: TableState, d: Draft): ApplyResult {
  const { events, spots, seed: _, ...rest } = d
  return { state: { ...state, ...rest, spots: spots.map((s) => ({ hands: s.hands, insurance: s.insurance })) }, events }
}

export function apply(state: TableState, action: Action, available = Infinity): ApplyResult {
  if (!isLegal(state, action, available)) throw new Error(`Illegal action in ${state.phase}: ${JSON.stringify(action)}`)
  const d = draft(state)

  switch (action.type) {
    case 'deal': {
      if (needsShuffle(state)) {
        d.shoes += 1
        d.shoe = shuffledShoe(d.seed, d.shoes)
        d.dealt = 0
        d.cutCard = SHOE_SIZE - CUT_CARD_DEPTH
        d.events.push({ type: 'shuffled' })
      }
      d.spots = action.bets.map((bet) => ({ hands: bet > 0 ? [newHand(bet)] : [], insurance: null }))
      d.dealer = []
      d.holeRevealed = false
      d.phase = 'dealing'
      d.turn = null
      d.round += 1
      break
    }

    case 'next': {
      if (d.phase === 'dealing') nextDealt(d)
      else if (d.phase === 'peek') peek(d)
      else dealerStep(d)
      break
    }

    case 'insurance': {
      const turn = d.turn!
      const spot = d.spots[turn.spot]
      const amount = action.take ? insuranceCost(spot.hands[0].bet) : 0
      spot.insurance = amount
      d.events.push({ type: 'insured', spot: turn.spot, amount })
      if (amount > 0) d.events.push({ type: 'staked', spot: turn.spot, amount })
      const next = betSpots(d).find((i) => i > turn.spot)
      if (next === undefined) {
        d.phase = 'peek'
        d.turn = null
      } else {
        d.turn = { spot: next, hand: 0 }
      }
      break
    }

    default: {
      const turn = d.turn!
      const spot = d.spots[turn.spot]
      const hand = spot.hands[turn.hand]
      d.events.push({ type: 'acted', spot: turn.spot, hand: turn.hand, action: action.type })
      if (action.type === 'hit') {
        giveCard(d, turn.spot, turn.hand)
      } else if (action.type === 'stand') {
        spot.hands[turn.hand] = { ...hand, done: true }
      } else if (action.type === 'double') {
        d.events.push({ type: 'staked', spot: turn.spot, amount: hand.bet })
        spot.hands[turn.hand] = { ...hand, bet: hand.bet * 2, doubled: true }
        giveCard(d, turn.spot, turn.hand)
      } else {
        d.events.push({ type: 'staked', spot: turn.spot, amount: hand.bet })
        const [a, b] = hand.cards
        spot.hands.splice(turn.hand, 1, { ...hand, cards: [a], split: true }, { ...newHand(hand.bet), cards: [b], split: true })
        giveCard(d, turn.spot, turn.hand)
      }
      advance(d, turn)
      break
    }
  }

  return finish(state, d)
}

/** One card of the opening deal: each spot, the dealer's up card, each spot again, the hole card. */
function nextDealt(d: Draft) {
  const order = betSpots(d)
  const targets: (number | 'dealer')[] = [...order, 'dealer', ...order, 'dealer']
  const onTable = d.dealer.length + order.reduce((n, i) => n + d.spots[i].hands[0].cards.length, 0)
  const to = targets[onTable]
  const card = draw(d)
  if (to === 'dealer') {
    d.dealer.push(card)
    d.events.push({ type: 'dealt', to, hand: 0, card, faceDown: d.dealer.length === 2 })
  } else {
    const hand = d.spots[to].hands[0]
    const cards = [...hand.cards, card]
    // A blackjack has nothing left to decide.
    d.spots[to].hands[0] = { ...hand, cards, done: isBlackjack({ cards, split: false }) }
    d.events.push({ type: 'dealt', to, hand: 0, card, faceDown: false })
  }
  if (onTable + 1 < targets.length) return

  const up = d.dealer[0]
  if (up.rank === 'A') {
    d.phase = 'insurance'
    d.turn = { spot: order[0], hand: 0 }
  } else if (cardValue(up) === 10) {
    d.phase = 'peek'
  } else {
    startPlay(d)
  }
}

function peek(d: Draft) {
  const blackjack = handTotal(d.dealer).total === 21
  d.events.push({ type: 'peeked', blackjack })
  if (blackjack) {
    d.holeRevealed = true
    d.events.push({ type: 'revealed', card: d.dealer[1] })
    settle(d)
  } else {
    startPlay(d)
  }
}

/** Turn over the hole card, then draw to 17, then pay. One step per call. */
function dealerStep(d: Draft) {
  if (!d.holeRevealed) {
    d.holeRevealed = true
    d.events.push({ type: 'revealed', card: d.dealer[1] })
    return
  }
  const { total } = handTotal(d.dealer)
  if (liveHands(d) && total < 17) {
    const card = draw(d)
    d.dealer.push(card)
    d.events.push({ type: 'dealt', to: 'dealer', hand: 0, card, faceDown: false })
    return
  }
  d.events.push({ type: 'dealer-done', total, busted: total > 21 })
  settle(d)
}

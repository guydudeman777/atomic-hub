/**
 * Five-card draw rules engine: a saloon game at fixed limits.
 *
 * Pure and framework-free, like the Blackjack and Caravan engines: the UI,
 * the bots and the tests drive a hand through `legalActions` and `apply`.
 * State is immutable. Stacks live in the engine, because all-ins and side
 * pots depend on them; callers mirror the caps that move, using the
 * `anted`, `acted` and `won` events.
 *
 * Seats are numbered clockwise, so the next seat is the one on your left.
 *
 * Rules
 * - One 52-card deck, shuffled fresh for every hand.
 * - Everyone with caps antes. The button moves one seat to the left each
 *   hand, and the deal starts on its left: five cards each, face down, one
 *   at a time.
 * - First betting round at the small bet, starting left of the button. No
 *   openers: anyone may bet on anything, and if everyone checks, the hand
 *   goes to the draw anyway.
 * - Fixed limit: a bet and three raises a round, each the size of the
 *   round's bet. Check, bet, call, raise or fold. You can't fold when you
 *   could check.
 * - The draw, starting left of the button: each player still in throws away
 *   up to three cards and is dealt as many new ones, or four when the card
 *   they keep is an Ace. Standing pat is drawing none. (With six players at
 *   most, the deck always covers the draw: the 22 cards left after the deal
 *   are exactly four each for four Ace-keepers and three for the other two.)
 * - Second betting round at the big bet, twice the small, again from the
 *   button's left.
 * - Showdown: every hand still in turns face up, and the best five-card hand
 *   wins (core/poker.ts). Split pots are shared evenly; an odd cap goes to
 *   the first winner left of the button.
 * - If everyone else folds, the last player in takes the pot without
 *   showing.
 * - All in: a player who can't cover a call or a bet puts in what they
 *   have. A raise always takes the bet to the next full level, so a short
 *   all-in doesn't count as a raise: it doesn't reopen the betting for
 *   anyone who has acted since the last full bet, who may only call it or
 *   fold. What an all-in player can't match goes into a side pot they can't
 *   win.
 */

import { type Card, FACE_RANKS, NUMBER_RANKS, SUITS, makeCard } from '../../core/cards'
import { scoreOf } from '../../core/poker'
import { createRng, shuffle } from '../../core/rng'

export const HAND_SIZE = 5
/** A bet and three raises. */
export const MAX_BETS = 4
export const MAX_SEATS = 6
/** Discards allowed, and how many with an Ace kept. */
export const MAX_DRAW = 3
export const MAX_DRAW_WITH_ACE = 4
/** The card set the deck is built from (it picks the card backs). */
export const DECK_SET = 'saloon'

export interface Stakes {
  readonly ante: number
  /** The bet before the draw. */
  readonly small: number
  /** The bet after the draw, twice the small. */
  readonly big: number
}

/**
 * - waiting: before the first hand, with nobody dealt in
 * - dealing: the opening five cards each, one `next` per card
 * - betting: a betting round, `round` 1 before the draw and 2 after
 * - drawing: each player still in draws, in turn
 * - showdown: the hands still in are about to turn over
 * - complete: the pot is paid; the next `deal` starts a new hand
 */
export type Phase = 'waiting' | 'dealing' | 'betting' | 'drawing' | 'showdown' | 'complete'

export interface Seat {
  /** Caps behind, not yet in the pot. */
  readonly stack: number
  /** Dealt into this hand. */
  readonly inHand: boolean
  readonly folded: boolean
  readonly cards: readonly Card[]
  /** Put in the pot this hand, the ante included. */
  readonly committed: number
  /** Put in during this betting round. */
  readonly roundBet: number
  /** Has acted since the last full bet or raise, so can't raise until someone else does. */
  readonly acted: boolean
  /** Cards drawn, once they've drawn: 0 is standing pat. */
  readonly drew: number | null
  /** Turned face up at the showdown. */
  readonly shown: boolean
  /** Bets and raises made before the draw and after it, as the table saw them. */
  readonly raised: readonly [number, number]
  /** Calls made before the draw and after it. */
  readonly called: readonly [number, number]
}

export type BetAction = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export type Action =
  | { readonly type: 'deal' }
  /** The dealer's next step: a card in the opening deal, or the showdown. */
  | { readonly type: 'next' }
  | { readonly type: BetAction }
  /** Ids of the cards thrown away; none is standing pat. */
  | { readonly type: 'draw'; readonly discards: readonly string[] }

export interface Pot {
  readonly amount: number
  /** The seats that can win it: still in, and in for at least its level. */
  readonly eligible: readonly number[]
}

export interface Payout {
  readonly seat: number
  readonly amount: number
  /** Which pot: 0 is the main pot, then the side pots. */
  readonly pot: number
}

export interface SeatResult {
  seat: number
  /** Everything put in the pot this hand. */
  committed: number
  /** Everything taken back out of it. */
  won: number
}

export type DrawEvent =
  | { type: 'button'; seat: number }
  | { type: 'anted'; seat: number; amount: number }
  | { type: 'dealt'; seat: number; card: Card }
  /** `amount` is what went in with the action; `to` is their total for the round. */
  | { type: 'acted'; seat: number; action: BetAction; amount: number; to: number; allIn: boolean }
  /** A betting round is over and its bets are gathered into the pot. */
  | { type: 'round-over'; round: 1 | 2 }
  | { type: 'drew'; seat: number; discarded: readonly Card[]; drawn: readonly Card[] }
  | { type: 'showdown'; hands: { seat: number; score: number }[] }
  | { type: 'won'; seat: number; amount: number; pot: number; shown: boolean }
  | { type: 'hand-over'; results: SeatResult[] }

export interface DrawState {
  readonly stakes: Stakes
  readonly seed: number
  /** Hands dealt so far. Each deck is shuffled from the seed and its hand number. */
  readonly hand: number
  /** -1 before the first hand. */
  readonly button: number
  /** Null is an empty chair. */
  readonly seats: readonly (Seat | null)[]
  /** The deck, next card first. */
  readonly stock: readonly Card[]
  readonly discards: readonly Card[]
  readonly phase: Phase
  readonly round: 1 | 2
  /** Who acts, while betting or drawing. */
  readonly turn: number | null
  /** The most anyone has put in this betting round. */
  readonly toCall: number
  /** Full bets and raises this round, the opening bet included. */
  readonly bets: number
  /** Cards dealt so far in the opening deal. */
  readonly dealtCount: number
  /** Who won what, once the hand is over. */
  readonly payouts: readonly Payout[] | null
  /** Decks to deal from, one per hand in order, for tests. */
  readonly decks?: readonly (readonly Card[])[]
}

export interface ApplyResult {
  state: DrawState
  events: DrawEvent[]
}

// ---- The deck ------------------------------------------------------------------

/** A fresh deck in order. Ids carry the hand number, so cards from different hands never share one. */
export function freshDeck(hand: number): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of [...NUMBER_RANKS, ...FACE_RANKS]) {
      const card = makeCard(DECK_SET, rank, suit)
      cards.push({ ...card, id: `${card.id}#${hand}` })
    }
  }
  return cards
}

const mix = (seed: number, hand: number) => (seed + Math.imul(hand, 0x9e3779b1)) >>> 0

// ---- Setting up ------------------------------------------------------------------

export interface NewTableOptions {
  stakes: Stakes
  /** Each chair's stack, or null for an empty one. */
  stacks: readonly (number | null)[]
  seed: number
  /** The seat before the first button: the first hand's button is the next seat in. */
  button?: number
  /** Decks to deal from, one per hand in order, for tests. */
  decks?: readonly (readonly Card[])[]
}

const emptySeat = (stack: number): Seat => ({
  stack,
  inHand: false,
  folded: false,
  cards: [],
  committed: 0,
  roundBet: 0,
  acted: false,
  drew: null,
  shown: false,
  raised: [0, 0],
  called: [0, 0],
})

export function createTable({ stakes, stacks, seed, button = -1, decks }: NewTableOptions): DrawState {
  if (stacks.length < 2 || stacks.length > MAX_SEATS) throw new Error(`A table seats 2 to ${MAX_SEATS}`)
  return {
    stakes,
    seed,
    hand: 0,
    button,
    seats: stacks.map((s) => (s === null ? null : emptySeat(s))),
    stock: [],
    discards: [],
    phase: 'waiting',
    round: 1,
    turn: null,
    toCall: 0,
    bets: 0,
    dealtCount: 0,
    payouts: null,
    ...(decks ? { decks } : {}),
  }
}

export const betweenHands = (state: DrawState): boolean => state.phase === 'waiting' || state.phase === 'complete'

/** Someone sits down with `stack`, or tops up; null empties the chair. Only between hands. */
export function seatAt(state: DrawState, seat: number, stack: number | null): DrawState {
  if (!betweenHands(state)) throw new Error('Seats change between hands')
  const seats = state.seats.slice()
  seats[seat] = stack === null ? null : { ...(seats[seat] ?? emptySeat(stack)), stack }
  return { ...state, seats }
}

// ---- Who's who -----------------------------------------------------------------

/** Still in the hand: dealt in and not folded. */
export const isLive = <S extends Seat>(seat: S | null): seat is S => !!seat && seat.inHand && !seat.folded

/** Still in, with caps to bet. */
const canBet = <S extends Seat>(seat: S | null): seat is S => isLive(seat) && seat.stack > 0

export const isAllIn = (seat: Seat | null): boolean => isLive(seat) && seat.stack === 0

/** The next seat after `from`, clockwise, that passes `test`; null if none does. */
function nextSeat(seats: readonly (Seat | null)[], from: number, test: (seat: Seat | null, i: number) => boolean): number | null {
  const n = seats.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n
    if (test(seats[i], i)) return i
  }
  return null
}

/** Live seats in order from the button's left, the button last. */
export function fromTheButton(state: Pick<DrawState, 'seats' | 'button'>, test: (seat: Seat | null) => boolean = isLive): number[] {
  const n = state.seats.length
  const order: number[] = []
  for (let k = 1; k <= n; k++) {
    const i = (((state.button + k) % n) + n) % n
    if (test(state.seats[i])) order.push(i)
  }
  return order
}

/** Who acts next: the dealer, a seat, or nobody (between hands). */
export function actor(state: DrawState): 'dealer' | number | null {
  switch (state.phase) {
    case 'dealing':
    case 'showdown':
      return 'dealer'
    case 'betting':
    case 'drawing':
      return state.turn
    default:
      return null
  }
}

export const betSize = (state: Pick<DrawState, 'round' | 'stakes'>): number => (state.round === 1 ? state.stakes.small : state.stakes.big)

/** Everything in the middle, this round's bets included. */
export const potTotal = (state: DrawState): number => state.seats.reduce((n, s) => n + (s?.inHand ? s.committed : 0), 0)

/** What `seat` must put in to stay in. */
export function owed(state: DrawState, seat: number): number {
  const s = state.seats[seat]
  return s ? Math.min(s.stack, Math.max(0, state.toCall - s.roundBet)) : 0
}

/**
 * The main pot and side pots, from what everyone has committed. Each level
 * an all-in player stopped at closes a pot; folded players' caps stay in the
 * pots they reached, but they can't win them.
 */
export function pots(state: Pick<DrawState, 'seats'>): Pot[] {
  const seats = state.seats
  const levels = [...new Set(seats.flatMap((s) => (isLive(s) ? [s.committed] : [])))].sort((a, b) => a - b)
  const out: Pot[] = []
  let prev = 0
  for (const level of levels) {
    let amount = 0
    for (const s of seats) if (s?.inHand) amount += Math.min(s.committed, level) - Math.min(s.committed, prev)
    const eligible = seats.flatMap((s, i) => (isLive(s) && s.committed >= level ? [i] : []))
    if (amount > 0) {
      const last = out[out.length - 1]
      // Two levels with the same contenders are one pot.
      if (last && last.eligible.length === eligible.length && last.eligible.every((e, k) => e === eligible[k])) {
        out[out.length - 1] = { ...last, amount: last.amount + amount }
      } else out.push({ amount, eligible })
    }
    prev = level
  }
  // Caps above every live player's level can't be matched by anyone; the top contender keeps them.
  const above = seats.reduce((n, s) => n + (s?.inHand ? Math.max(0, s.committed - prev) : 0), 0)
  if (above > 0 && out.length) out[out.length - 1] = { ...out[out.length - 1], amount: out[out.length - 1].amount + above }
  return out
}

// ---- What may be done ------------------------------------------------------------

/** How many cards a hand may throw away, given which ones it keeps. */
export function isValidDraw(cards: readonly Card[], discards: readonly string[]): boolean {
  if (new Set(discards).size !== discards.length) return false
  if (!discards.every((id) => cards.some((c) => c.id === id))) return false
  if (discards.length <= MAX_DRAW) return true
  if (discards.length > MAX_DRAW_WITH_ACE) return false
  const kept = cards.filter((c) => !discards.includes(c.id))
  return kept.length === 1 && kept[0].rank === 'A'
}

/** The most this hand may throw away: four when it holds an Ace to keep. */
export const maxDiscards = (cards: readonly Card[]): number => (cards.some((c) => c.rank === 'A') ? MAX_DRAW_WITH_ACE : MAX_DRAW)

/** Whether `seat` may still raise: they haven't acted since the last full raise, there's room under the cap, and someone could call. */
function mayRaise(state: DrawState, seat: number): boolean {
  const s = state.seats[seat]
  if (!s || s.acted || state.bets >= MAX_BETS) return false
  if (s.stack <= Math.max(0, state.toCall - s.roundBet)) return false
  return state.seats.some((o, i) => i !== seat && canBet(o))
}

/**
 * What the seat to act may do. The draw is listed once, standing pat; any
 * valid set of discards is allowed (`isValidDraw`).
 */
export function legalActions(state: DrawState): Action[] {
  switch (state.phase) {
    case 'dealing':
    case 'showdown':
      return [{ type: 'next' }]
    case 'waiting':
    case 'complete':
      return state.seats.filter((s) => s && s.stack > 0).length >= 2 ? [{ type: 'deal' }] : []
    case 'drawing':
      return state.turn === null ? [] : [{ type: 'draw', discards: [] }]
    case 'betting': {
      if (state.turn === null) return []
      const owe = owed(state, state.turn)
      const actions: Action[] = owe > 0 ? [{ type: 'fold' }, { type: 'call' }] : [{ type: 'check' }]
      if (mayRaise(state, state.turn)) actions.push({ type: state.toCall === 0 ? 'bet' : 'raise' })
      return actions
    }
  }
}

export function isLegal(state: DrawState, action: Action): boolean {
  if (action.type === 'draw') {
    if (state.phase !== 'drawing' || state.turn === null) return false
    return isValidDraw(state.seats[state.turn]!.cards, action.discards)
  }
  return legalActions(state).some((a) => a.type === action.type)
}

// ---- Playing it out --------------------------------------------------------------

type DraftSeat = Omit<{ -readonly [K in keyof Seat]: Seat[K] }, 'cards'> & { cards: Card[] }

/** A mutable working copy for one `apply`. */
interface Draft {
  readonly stakes: Stakes
  readonly seed: number
  readonly decks?: readonly (readonly Card[])[]
  hand: number
  button: number
  seats: (DraftSeat | null)[]
  stock: Card[]
  discards: Card[]
  phase: Phase
  round: 1 | 2
  turn: number | null
  toCall: number
  bets: number
  dealtCount: number
  payouts: Payout[] | null
  events: DrawEvent[]
}

function draft(state: DrawState): Draft {
  return {
    ...state,
    seats: state.seats.map((s) => (s ? { ...s, cards: s.cards.slice() } : null)),
    stock: state.stock.slice(),
    discards: state.discards.slice(),
    payouts: state.payouts ? state.payouts.slice() : null,
    events: [],
  }
}

function freeze(d: Draft): ApplyResult {
  const { events, ...state } = d
  return { state, events }
}

export function apply(state: DrawState, action: Action): ApplyResult {
  if (!isLegal(state, action)) throw new Error(`Illegal action ${action.type} in ${state.phase}`)
  const d = draft(state)
  switch (action.type) {
    case 'deal':
      startHand(d)
      break
    case 'next':
      if (d.phase === 'dealing') dealOne(d)
      else showdown(d)
      break
    case 'draw':
      draw(d, action.discards)
      break
    default:
      bet(d, action.type)
  }
  return freeze(d)
}

function startHand(d: Draft) {
  d.hand++
  const deck = d.decks?.[d.hand - 1]
  d.stock = deck ? deck.slice() : shuffle(freshDeck(d.hand), createRng(mix(d.seed, d.hand)))
  d.discards = []
  d.button = nextSeat(d.seats, d.button, (s) => !!s && s.stack > 0)!
  d.events.push({ type: 'button', seat: d.button })
  d.seats = d.seats.map((s) =>
    s
      ? { ...s, inHand: s.stack > 0, folded: false, cards: [], committed: 0, roundBet: 0, acted: false, drew: null, shown: false, raised: [0, 0], called: [0, 0] }
      : null,
  )
  for (const i of fromTheButton(d)) {
    const s = d.seats[i]!
    const amount = Math.min(d.stakes.ante, s.stack)
    if (amount <= 0) continue
    s.stack -= amount
    s.committed += amount
    d.events.push({ type: 'anted', seat: i, amount })
  }
  d.phase = 'dealing'
  d.round = 1
  d.turn = null
  d.toCall = 0
  d.bets = 0
  d.dealtCount = 0
  d.payouts = null
}

function dealOne(d: Draft) {
  const order = fromTheButton(d)
  const seat = order[d.dealtCount % order.length]
  const card = d.stock.shift()!
  d.seats[seat]!.cards.push(card)
  d.dealtCount++
  d.events.push({ type: 'dealt', seat, card })
  if (d.dealtCount === order.length * HAND_SIZE) startRound(d, 1)
}

/** A betting round begins; it's skipped when fewer than two players can still bet. */
function startRound(d: Draft, round: 1 | 2) {
  d.phase = 'betting'
  d.round = round
  d.toCall = 0
  d.bets = 0
  for (const s of d.seats) {
    if (!s) continue
    s.roundBet = 0
    s.acted = false
  }
  d.turn = null
  if (d.seats.filter(canBet).length < 2) {
    endRound(d)
    return
  }
  d.turn = nextSeat(d.seats, d.button, canBet)
}

function bet(d: Draft, action: BetAction) {
  const seat = d.turn!
  const s = d.seats[seat]!
  const size = d.round === 1 ? d.stakes.small : d.stakes.big
  let amount = 0
  if (action === 'fold') {
    s.folded = true
  } else if (action === 'call') {
    amount = Math.min(s.stack, d.toCall - s.roundBet)
    s.called = tally(s.called, d.round)
  } else if (action === 'bet' || action === 'raise') {
    s.raised = tally(s.raised, d.round)
    // To the next full level, or all in short of it.
    const target = d.bets * size + size
    amount = Math.min(s.stack, target - s.roundBet)
    if (s.roundBet + amount === target) {
      d.bets++
      for (const o of d.seats) if (o && o !== s) o.acted = false
    }
  }
  s.stack -= amount
  s.roundBet += amount
  s.committed += amount
  s.acted = true
  d.toCall = Math.max(d.toCall, s.roundBet)
  d.events.push({ type: 'acted', seat, action, amount, to: s.roundBet, allIn: s.stack === 0 && action !== 'fold' && action !== 'check' })

  const live = d.seats.filter(isLive)
  if (live.length === 1) {
    uncontested(d, d.seats.indexOf(live[0]))
    return
  }
  if (roundOver(d)) {
    endRound(d)
    return
  }
  d.turn = nextSeat(d.seats, seat, (o) => canBet(o) && (!o.acted || o.roundBet < d.toCall))
}

const tally = ([first, second]: readonly [number, number], round: 1 | 2): [number, number] => (round === 1 ? [first + 1, second] : [first, second + 1])

/** Everyone who can still bet has acted and matched the bet, or nobody's left to bet against. */
function roundOver(d: Draft): boolean {
  const bettors = d.seats.filter(canBet)
  if (bettors.every((s) => s.acted && s.roundBet === d.toCall)) return true
  return bettors.length === 1 && bettors[0].roundBet >= d.toCall
}

function endRound(d: Draft) {
  d.events.push({ type: 'round-over', round: d.round })
  for (const s of d.seats) {
    if (!s) continue
    s.roundBet = 0
    s.acted = false
  }
  d.toCall = 0
  d.bets = 0
  if (d.round === 1) {
    d.phase = 'drawing'
    d.turn = nextSeat(d.seats, d.button, isLive)
  } else {
    d.phase = 'showdown'
    d.turn = null
  }
}

function draw(d: Draft, discardIds: readonly string[]) {
  const seat = d.turn!
  const s = d.seats[seat]!
  const discarded = s.cards.filter((c) => discardIds.includes(c.id))
  const drawn = d.stock.splice(0, discarded.length)
  // New cards take the places of the ones thrown away.
  let k = 0
  s.cards = s.cards.map((c) => (discardIds.includes(c.id) ? drawn[k++] : c))
  s.drew = discarded.length
  d.discards.push(...discarded)
  d.events.push({ type: 'drew', seat, discarded, drawn })
  const next = nextSeat(d.seats, seat, (o) => isLive(o) && o.drew === null)
  if (next === null) startRound(d, 2)
  else d.turn = next
}

/** Share each pot among its best hands, odd caps to the first winners left of the button. */
function showdown(d: Draft) {
  const live = fromTheButton(d)
  const scores = new Map(live.map((i) => [i, scoreOf(d.seats[i]!.cards)]))
  for (const i of live) d.seats[i]!.shown = true
  d.events.push({ type: 'showdown', hands: live.map((seat) => ({ seat, score: scores.get(seat)! })) })
  const payouts: Payout[] = []
  pots(d).forEach((pot, index) => {
    const best = Math.max(...pot.eligible.map((i) => scores.get(i)!))
    const winners = live.filter((i) => pot.eligible.includes(i) && scores.get(i) === best)
    const share = Math.floor(pot.amount / winners.length)
    let odd = pot.amount - share * winners.length
    for (const seat of winners) {
      const amount = share + (odd > 0 ? 1 : 0)
      odd--
      payouts.push({ seat, amount, pot: index })
    }
  })
  pay(d, payouts, true)
}

function uncontested(d: Draft, seat: number) {
  // Whatever's in the middle; the winner's own unmatched bet comes back with it.
  const amount = d.seats.reduce((n, s) => n + (s?.inHand ? s.committed : 0), 0)
  for (const s of d.seats) if (s) s.roundBet = 0
  d.events.push({ type: 'round-over', round: d.round })
  pay(d, [{ seat, amount, pot: 0 }], false)
}

function pay(d: Draft, payouts: Payout[], shown: boolean) {
  for (const p of payouts) {
    d.seats[p.seat]!.stack += p.amount
    d.events.push({ type: 'won', seat: p.seat, amount: p.amount, pot: p.pot, shown })
  }
  const results: SeatResult[] = d.seats.flatMap((s, seat) =>
    s?.inHand ? [{ seat, committed: s.committed, won: payouts.filter((p) => p.seat === seat).reduce((n, p) => n + p.amount, 0) }] : [],
  )
  d.events.push({ type: 'hand-over', results })
  d.payouts = payouts
  d.phase = 'complete'
  d.turn = null
  d.toCall = 0
  d.bets = 0
}

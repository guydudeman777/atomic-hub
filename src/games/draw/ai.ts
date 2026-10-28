/**
 * The regulars' play: how strong a hand is, what to draw, and what to bet.
 *
 * Strength is a chance of winning at the showdown against everyone still
 * in. The regulars never see a hidden card. Instead they know how hands
 * usually end up: `finalPools` deals tens of thousands of hands, draws them
 * by the book, and sorts the finished hands by how many cards they drew. A
 * player who drew three probably kept a pair; one who stood pat has a
 * straight or better, or is bluffing. Everyone who bets or raises is read as
 * that much stronger, as the best of several hands from their pool.
 *
 * Before the draw, a regular deals out their own draw a hundred-odd times
 * and averages how each finished hand would fare. After it, their hand is
 * what it is.
 *
 * Then style decides. Tight players need more to play, aggressive ones bet
 * and raise where others call, bluffers bet on nothing, and sandbaggers
 * check a monster to raise later. The draw has habits too: some keep a
 * kicker with a pair, some chase inside straights, and a bluffer who bet
 * before the draw may stand pat on nothing to keep the story going. Nobody
 * breaks a straight or better.
 */

import type { Card } from '../../core/cards'
import { cardCode, scoreCodes, scoreOf } from '../../core/poker'
import { type Rng, createRng } from '../../core/rng'
import { type Action, type DrawState, type Seat, freshDeck, isLive, legalActions, owed, potTotal } from './engine'
import { type DrawPlan, bookDraw, flushDraw, rankGroups, rankOf, straightDraw } from './strategy'

export interface Style {
  /** 0 plays almost anything, 1 only good cards. */
  tight: number
  /** How often a good hand bets or raises, rather than checks or calls. */
  aggression: number
  /** How often they bet or raise on nothing. */
  bluff: number
  /** How often a monster checks or calls before the draw, to trap. */
  slowplay: number
  /** By the book, keeping a kicker with a pair, or chasing long shots. */
  draw: 'book' | 'kicker' | 'longshot'
  /** How often, having bet before the draw on nothing much, they stand pat to sell it. */
  patBluff: number
}

/** A sound, steady player: the yardstick for self-play. */
export const SOLID: Style = { tight: 0.6, aggression: 0.75, bluff: 0.06, slowplay: 0.1, draw: 'book', patBluff: 0.1 }

// ---- What finished hands look like -------------------------------------------------

export interface Pools {
  /** Every finished hand's score, lowest first. */
  any: Int32Array
  /** The same, by how many cards were drawn (0 is standing pat). */
  byDraw: Int32Array[]
}

const POOL_HANDS = 30_000
/** Hands dealt at a time while warming up: a few milliseconds' work. */
const WARM_CHUNK = 1_500

let pools: Pools | null = null
/** The pools part-dealt, while they warm up. */
let dealing: { rng: Rng; deck: Card[]; byDraw: number[][]; any: number[]; dealt: number } | null = null

/** Deal up to `count` more finished hands into the pools. */
function dealPools(count: number) {
  dealing ??= { rng: createRng(0x5a1007), deck: freshDeck(0), byDraw: [[], [], [], [], []], any: [], dealt: 0 }
  const d = dealing
  const end = Math.min(POOL_HANDS, d.dealt + count)
  for (; d.dealt < end; d.dealt++) {
    // Nine cards off a partly shuffled deck: the hand, then up to four to draw.
    for (let i = 0; i < 9; i++) {
      const j = i + Math.floor(d.rng() * (d.deck.length - i))
      ;[d.deck[i], d.deck[j]] = [d.deck[j], d.deck[i]]
    }
    const hand = d.deck.slice(0, 5)
    const { discard } = bookDraw(hand)
    let k = 5
    const score = scoreOf(hand.map((c) => (discard.includes(c) ? d.deck[k++] : c)))
    d.byDraw[discard.length].push(score)
    d.any.push(score)
  }
}

/** Finished hands from book play, dealt once from a fixed seed. */
export function finalPools(): Pools {
  if (pools) return pools
  dealPools(POOL_HANDS)
  const sorted = (scores: number[]) => Int32Array.from(scores).sort()
  pools = { any: sorted(dealing!.any), byDraw: dealing!.byDraw.map(sorted) }
  dealing = null
  return pools
}

let warming = false

/**
 * Deal the pools a little at a time while nothing else is going on (the
 * lobby, the shuffle), so the first regular to bet doesn't stall the table.
 * Asking for them early just finishes the job on the spot.
 */
export function warmPools() {
  if (pools || warming) return
  warming = true
  const step = () => {
    if (pools) return
    dealPools(WARM_CHUNK)
    if (dealing!.dealt >= POOL_HANDS) finalPools()
    else setTimeout(step, 0)
  }
  setTimeout(step, 0)
}

/** The chance a hand from `pool` scores below `score`, ties counting half. */
export function beats(pool: Int32Array, score: number): number {
  if (pool.length === 0) return 0.5
  const lower = (target: number) => {
    let lo = 0
    let hi = pool.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pool[mid] < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const below = lower(score)
  const equal = lower(score + 1) - below
  return (below + equal / 2) / pool.length
}

// ---- Reading the table --------------------------------------------------------------

/** How often a pat hand is a bluff, as far as anyone at the table can tell. */
const PAT_BLUFFS = 0.12

/** How much stronger each bet or raise makes a player look, and each call. */
const RAISE_WEIGHT = 0.6
const CALL_WEIGHT = 0.15

/**
 * One opponent, as a function from a finished score to the chance it beats
 * them. The best of `w` hands from a pool beats `score` with chance p^w.
 */
function opponent(seat: Seat, round: 1 | 2): (score: number) => number {
  const { any, byDraw } = finalPools()
  const raises = round === 1 ? seat.raised[0] : seat.raised[1] + seat.raised[0] / 2
  const calls = round === 1 ? seat.called[0] : seat.called[1]
  const weight = 1 + RAISE_WEIGHT * Math.min(3, raises) + CALL_WEIGHT * Math.min(2, calls)
  if (round === 1 || seat.drew === null) return (score) => beats(any, score) ** weight
  const pool = byDraw[seat.drew]
  if (seat.drew === 0) return (score) => ((1 - PAT_BLUFFS) * beats(pool, score) + PAT_BLUFFS * beats(any, score)) ** weight
  return (score) => beats(pool, score) ** weight
}

/** Draws simulated for a hand's strength before the draw. */
const DRAW_TRIALS = 120

/**
 * The chance `seat` wins at the showdown, against everyone else still in.
 * Before the draw, `keep` is the draw they mean to make.
 */
export function equity(state: DrawState, seat: number, keep: readonly Card[], rng: Rng): number {
  const me = state.seats[seat]!
  const others = state.seats.flatMap((s, i) => (i !== seat && isLive(s) ? [opponent(s, state.round)] : []))
  const against = (score: number) => others.reduce((p, beat) => p * beat(score), 1)
  if (me.drew !== null || keep.length === 5) return against(scoreOf(me.cards))

  // Deal the draw from the cards they can't see, again and again.
  const kept = keep.map(cardCode)
  const mine = new Set(me.cards.map(cardCode))
  const unseen: number[] = []
  for (let rank = 2; rank <= 14; rank++) for (let suit = 0; suit < 4; suit++) if (!mine.has(rank * 4 + suit)) unseen.push(rank * 4 + suit)
  const need = 5 - kept.length
  const codes = [0, 0, 0, 0, 0]
  let total = 0
  for (let t = 0; t < DRAW_TRIALS; t++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (unseen.length - i))
      ;[unseen[i], unseen[j]] = [unseen[j], unseen[i]]
    }
    for (let i = 0; i < 5; i++) codes[i] = i < kept.length ? kept[i] : unseen[i - kept.length]
    total += against(scoreCodes(codes[0], codes[1], codes[2], codes[3], codes[4]))
  }
  return total / DRAW_TRIALS
}

// ---- The draw --------------------------------------------------------------------------

/** What a regular throws away, with their habits on top of the book. */
export function chooseDraw(cards: readonly Card[], style: Style, raisedBefore: boolean, rng: Rng): DrawPlan {
  const book = bookDraw(cards)
  if (book.kind === 'pat') return book
  // Having bet on nothing, stand pat and keep the story going.
  const weak = book.kind === 'ace' || book.kind === 'high-cards' || book.kind === 'low-pair'
  if (weak && raisedBefore && rng() < style.patBluff) {
    return { kind: 'pat', keep: cards.slice(), discard: [], reason: 'Standing pat on nothing, to sell the bet.' }
  }
  if (style.draw === 'kicker' && (book.kind === 'high-pair' || book.kind === 'low-pair')) {
    // Keep the best card left beside the pair, if it's an Ace or a King.
    const kicker = rankGroups(cards).find((g) => g.length === 1 && rankOf(g[0]) >= 13)?.[0]
    if (kicker) {
      const keep = [...book.keep, kicker]
      return { ...book, keep: cards.filter((c) => keep.includes(c)), discard: cards.filter((c) => !keep.includes(c)), reason: 'A pair and a kicker.' }
    }
  }
  if (style.draw === 'longshot' && (book.kind === 'low-pair' || book.kind === 'ace' || book.kind === 'high-cards')) {
    // Any four to a straight, even an inside one, or three to a flush.
    const inside = straightDraw(cards, false)
    if (inside) return { kind: 'straight-draw', keep: cards.filter((c) => inside.includes(c)), discard: cards.filter((c) => !inside.includes(c)), reason: 'Chasing the straight.' }
    if (book.kind !== 'low-pair') {
      const suited = (['S', 'H', 'D', 'C'] as const).map((s) => cards.filter((c) => c.suit === s)).find((g) => g.length === 3)
      if (suited) return { kind: 'flush-draw', keep: cards.filter((c) => suited.includes(c)), discard: cards.filter((c) => !suited.includes(c)), reason: 'Chasing the flush.' }
    }
  }
  return book
}

// ---- Betting ---------------------------------------------------------------------------

/** A monster: ahead of nearly anything one opponent could hold. */
const MONSTER = 0.9

/**
 * A regular's move: a bet, a call, a fold, or their draw. Only the seat to
 * act may ask.
 */
export function botAction(state: DrawState, seat: number, style: Style, rng: Rng): Action {
  const me = state.seats[seat]!
  if (state.phase === 'drawing') {
    const plan = chooseDraw(me.cards, style, me.raised[0] > 0, rng)
    return { type: 'draw', discards: plan.discard.map((c) => c.id) }
  }
  const legal = new Set(legalActions(state).map((a) => a.type))
  const before = state.round === 1
  // Before the draw, strength counts the draw they'd make (without the pat bluff).
  const keep = before ? chooseDraw(me.cards, { ...style, patBluff: 0 }, false, rng).keep : me.cards
  const e = equity(state, seat, keep, rng)
  const rivals = state.seats.filter((s, i) => i !== seat && isLive(s)).length
  // Per opponent: how often they'd beat one of them. Comparable at any table size.
  const p = e ** (1 / Math.max(1, rivals))

  const owe = owed(state, seat)
  const pot = potTotal(state)
  const raise = legal.has('raise') ? 'raise' : legal.has('bet') ? 'bet' : null
  const value = 0.56 + 0.14 * style.tight - 0.06 * style.aggression
  const trap = before && p >= MONSTER && rng() < style.slowplay

  // A draw worth betting on its own: four to a flush or an open straight, before the draw.
  const drawing = before && (flushDraw(me.cards) !== null || straightDraw(me.cards, true) !== null) && keep.length === 4
  const bluffOdds = style.bluff * (before ? 0.5 : me.drew !== null && me.drew <= 1 ? 1.5 : 1) / Math.max(1, rivals - 0.5)

  if (owe === 0) {
    if (raise && !trap) {
      if (p >= value && rng() < 0.35 + 0.65 * style.aggression) return { type: raise }
      if (drawing && rng() < style.aggression * 0.4) return { type: raise }
      // Checked to, last to act, after the draw: a cheap steal.
      const lastToAct = !before && state.seats.every((s, i) => i === seat || !isLive(s) || s.acted || s.stack === 0)
      if (rng() < bluffOdds * (lastToAct ? 1.6 : 1)) return { type: raise }
    }
    return { type: 'check' }
  }

  // Facing a bet: the price, against the chance of taking it all.
  const price = owe / (pot + owe)
  // A sound player calls when the price is right; a loose one pays well over it, a tight one wants a discount.
  const loose = 1.6 - style.tight
  if (raise && !trap && p >= value + 0.1 && rng() < 0.2 + 0.7 * style.aggression) return { type: raise }
  if (raise && rivals <= 2 && rng() < bluffOdds * 0.35) return { type: raise }
  // A monster trapping still calls; so does anyone getting the right price.
  if (trap || e * loose >= price) return { type: 'call' }
  // The last small call before the draw, with a draw: the odds are there once the pot grows.
  if (before && drawing && e * loose * 1.3 >= price) return { type: 'call' }
  return { type: 'fold' }
}

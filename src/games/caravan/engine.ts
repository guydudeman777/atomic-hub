/**
 * Caravan rules engine (Fallout: New Vegas rules).
 *
 * Pure and framework-free: the UI and the AI both drive games through
 * `legalMoves` and `applyMove`. State is treated as immutable.
 *
 * Rules summary
 * - Each player has three caravans facing the opponent's three (three lanes).
 * - Opening: on each of your first three turns you must play a number card
 *   (Ace–10) onto one of your empty caravans. No discards or face cards yet.
 * - After the opening, a turn is exactly one of: play a card, discard a card,
 *   or disband one of your caravans. Playing or discarding draws a card.
 * - Number cards go on your own caravans. The second card sets the direction
 *   (ascending or descending); later cards must continue it unless they match
 *   the caravan's current suit. A card may never repeat the previous value.
 * - Face cards attach to any number card on the table, either side:
 *   Jack removes that card (and everything attached to it).
 *   Queen (on the last card only) reverses direction and changes the suit.
 *   King doubles that card's value; Kings stack (x2, x4, x8...).
 *   Joker on an Ace removes every other number card of that suit from the
 *   table; on a 2–10 it removes every other card of that value.
 * - A caravan is sold at 21–26. A lane goes to whoever has the higher sold
 *   caravan in it (or the only sold one). Ties leave the lane open.
 * - The game ends when all three lanes are decided; the player holding the
 *   majority wins. A player who starts their turn with no cards left loses.
 */

import { type Card, type NumberRank, type Suit, isNumberRank, pipValue } from '../../core/cards'
import { type Rng, shuffle } from '../../core/rng'

export type PlayerId = 0 | 1
export type Lane = 0 | 1 | 2
export type Direction = 'asc' | 'desc'

export const LANES: readonly Lane[] = [0, 1, 2]
export const OPENING_HAND_SIZE = 8
export const OPENING_TURNS = 3
export const SOLD_MIN = 21
export const SOLD_MAX = 26
export const MIN_DECK_SIZE = 30
export const MIN_NUMBER_CARDS = 12

/** A number card on a caravan plus the face cards attached to it. */
export interface Placed {
  readonly card: Card
  readonly attached: readonly Card[]
}

export type Caravan = readonly Placed[]

export interface PlayerState {
  /** Draw pile; index 0 is the top. */
  readonly deck: readonly Card[]
  readonly hand: readonly Card[]
  readonly caravans: readonly [Caravan, Caravan, Caravan]
  readonly turnsTaken: number
}

export type EndReason = 'lanes' | 'out-of-cards'

export interface GameState {
  readonly players: readonly [PlayerState, PlayerState]
  readonly current: PlayerId
  readonly winner: PlayerId | null
  readonly endReason: EndReason | null
  /** Total turns taken by both players. */
  readonly turn: number
}

export type Move =
  /** Play a card. Number cards target `lane` of the mover; face cards target `owner`'s caravan card `index`. */
  | { readonly type: 'play'; readonly cardId: string; readonly owner: PlayerId; readonly lane: Lane; readonly index?: number }
  | { readonly type: 'discard'; readonly cardId: string }
  | { readonly type: 'disband'; readonly lane: Lane }

export type GameEvent =
  | { type: 'played'; player: PlayerId; card: Card; owner: PlayerId; lane: Lane; target?: Card }
  | { type: 'removed'; owner: PlayerId; lane: Lane; cards: Card[] }
  | { type: 'discarded'; player: PlayerId; card: Card }
  | { type: 'disbanded'; player: PlayerId; lane: Lane; cards: Card[] }
  | { type: 'game-over'; winner: PlayerId; reason: EndReason }

export interface MoveResult {
  readonly state: GameState
  readonly events: GameEvent[]
}

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0)

// ---------------------------------------------------------------------------
// Caravan arithmetic
// ---------------------------------------------------------------------------

export function isNumberCard(card: Card): boolean {
  return isNumberRank(card.rank)
}

function baseValue(card: Card): number {
  return pipValue(card.rank as NumberRank)
}

/** Value of one placed number card including King multipliers. */
export function placedValue(placed: Placed): number {
  let kings = 0
  for (const a of placed.attached) if (a.rank === 'K') kings++
  return baseValue(placed.card) * 2 ** kings
}

export function caravanValue(caravan: Caravan): number {
  let total = 0
  for (const p of caravan) total += placedValue(p)
  return total
}

export function isSold(value: number): boolean {
  return value >= SOLD_MIN && value <= SOLD_MAX
}

/**
 * Direction and suit of a caravan. Direction comes from the last two number
 * cards; each Queen on a card flips the direction set so far and takes over
 * the suit. With a single card there is no direction yet.
 */
export function caravanHeading(caravan: Caravan): { direction: Direction | null; suit: Suit | null } {
  let direction: Direction | null = null
  let suit: Suit | null = null
  for (let i = 0; i < caravan.length; i++) {
    const placed = caravan[i]
    if (i > 0) direction = baseValue(placed.card) > baseValue(caravan[i - 1].card) ? 'asc' : 'desc'
    suit = placed.card.suit
    for (const a of placed.attached) {
      if (a.rank !== 'Q') continue
      if (direction) direction = direction === 'asc' ? 'desc' : 'asc'
      suit = a.suit
    }
  }
  return { direction, suit }
}

/** Lane winner from the two caravan values, or null while undecided. */
export function laneWinner(value0: number, value1: number): PlayerId | null {
  const sold0 = isSold(value0)
  const sold1 = isSold(value1)
  if (sold0 && sold1) return value0 > value1 ? 0 : value1 > value0 ? 1 : null
  if (sold0) return 0
  if (sold1) return 1
  return null
}

export function laneOutcome(state: GameState, lane: Lane): PlayerId | null {
  return laneWinner(
    caravanValue(state.players[0].caravans[lane]),
    caravanValue(state.players[1].caravans[lane]),
  )
}

export function isOpening(state: GameState, player: PlayerId): boolean {
  return state.players[player].turnsTaken < OPENING_TURNS
}

// ---------------------------------------------------------------------------
// Legality
// ---------------------------------------------------------------------------

/** Can `card` (a number card) extend this caravan? Ignores whose turn it is. */
export function canExtend(caravan: Caravan, card: Card): boolean {
  if (!isNumberCard(card)) return false
  if (caravan.length === 0) return true
  const last = caravan[caravan.length - 1].card
  const value = baseValue(card)
  const lastValue = baseValue(last)
  if (value === lastValue) return false
  const { direction, suit } = caravanHeading(caravan)
  if (direction === null) return true
  if (card.suit === suit) return true
  return direction === 'asc' ? value > lastValue : value < lastValue
}

function canAttach(caravan: Caravan, index: number, card: Card): boolean {
  if (index < 0 || index >= caravan.length) return false
  if (card.rank === 'Q') return index === caravan.length - 1
  return card.rank === 'J' || card.rank === 'K' || card.rank === 'JK'
}

/** Whether the current player may make this move right now. */
export function isLegal(state: GameState, move: Move): boolean {
  if (state.winner !== null) return false
  const me = state.current
  const player = state.players[me]
  const opening = isOpening(state, me)

  if (move.type === 'disband') {
    return !opening && player.caravans[move.lane].length > 0
  }

  const card = player.hand.find((c) => c.id === move.cardId)
  if (!card) return false

  if (move.type === 'discard') {
    return !opening || !player.hand.some(isNumberCard)
  }

  if (isNumberCard(card)) {
    if (move.owner !== me || move.index !== undefined) return false
    const caravan = player.caravans[move.lane]
    if (opening && caravan.length > 0) return false
    return canExtend(caravan, card)
  }

  if (opening || move.index === undefined) return false
  return canAttach(state.players[move.owner].caravans[move.lane], move.index, card)
}

/** Every legal move for the current player. */
export function legalMoves(state: GameState): Move[] {
  if (state.winner !== null) return []
  const me = state.current
  const player = state.players[me]
  const opening = isOpening(state, me)
  const moves: Move[] = []

  for (const card of player.hand) {
    if (isNumberCard(card)) {
      for (const lane of LANES) {
        const caravan = player.caravans[lane]
        if (opening && caravan.length > 0) continue
        if (canExtend(caravan, card)) moves.push({ type: 'play', cardId: card.id, owner: me, lane })
      }
    } else if (!opening) {
      for (const owner of [0, 1] as const) {
        for (const lane of LANES) {
          const caravan = state.players[owner].caravans[lane]
          for (let index = 0; index < caravan.length; index++) {
            if (canAttach(caravan, index, card)) moves.push({ type: 'play', cardId: card.id, owner, lane, index })
          }
        }
      }
    }
  }

  // Discarding is normally only allowed after the opening. If an opening hand
  // somehow has no number cards, discarding is the escape hatch.
  if (!opening || !player.hand.some(isNumberCard)) {
    for (const card of player.hand) moves.push({ type: 'discard', cardId: card.id })
  }
  if (!opening) {
    for (const lane of LANES) {
      if (player.caravans[lane].length > 0) moves.push({ type: 'disband', lane })
    }
  }
  return moves
}

// ---------------------------------------------------------------------------
// Applying moves
// ---------------------------------------------------------------------------

interface MutablePlayer {
  deck: Card[]
  hand: Card[]
  caravans: [Placed[], Placed[], Placed[]]
  turnsTaken: number
}

function clonePlayer(p: PlayerState): MutablePlayer {
  return {
    deck: p.deck.slice(),
    hand: p.hand.slice(),
    caravans: [p.caravans[0].slice(), p.caravans[1].slice(), p.caravans[2].slice()],
    turnsTaken: p.turnsTaken,
  }
}

export interface ApplyOptions {
  /** Skip the draw after playing/discarding (used by the AI to avoid peeking). */
  draw?: boolean
}

/** Apply a legal move. Throws on an illegal move so bugs surface loudly. */
export function applyMove(state: GameState, move: Move, options: ApplyOptions = {}): MoveResult {
  if (!isLegal(state, move)) throw new Error(`Illegal move: ${JSON.stringify(move)}`)
  const draw = options.draw ?? true
  const me = state.current
  const players: [MutablePlayer, MutablePlayer] = [clonePlayer(state.players[0]), clonePlayer(state.players[1])]
  const mine = players[me]
  const events: GameEvent[] = []
  const opening = isOpening(state, me)

  const takeFromHand = (cardId: string): Card => {
    const i = mine.hand.findIndex((c) => c.id === cardId)
    return mine.hand.splice(i, 1)[0]
  }

  if (move.type === 'disband') {
    const cards = mine.caravans[move.lane].flatMap((p) => [p.card, ...p.attached])
    mine.caravans[move.lane] = []
    events.push({ type: 'disbanded', player: me, lane: move.lane, cards })
  } else if (move.type === 'discard') {
    const card = takeFromHand(move.cardId)
    events.push({ type: 'discarded', player: me, card })
  } else {
    const card = takeFromHand(move.cardId)
    if (isNumberCard(card)) {
      mine.caravans[move.lane].push({ card, attached: [] })
      events.push({ type: 'played', player: me, card, owner: me, lane: move.lane })
    } else {
      playFaceCard(players, me, card, move.owner, move.lane, move.index as number, events)
    }
  }

  const drawsThisTurn = move.type !== 'disband' && !opening
  if (draw && drawsThisTurn && mine.deck.length > 0) mine.hand.push(mine.deck.shift() as Card)
  mine.turnsTaken += 1

  return { state: finishTurn(players, me, state.turn + 1, events), events }
}

function playFaceCard(
  players: [MutablePlayer, MutablePlayer],
  me: PlayerId,
  card: Card,
  owner: PlayerId,
  lane: Lane,
  index: number,
  events: GameEvent[],
) {
  const caravan = players[owner].caravans[lane]
  const target = caravan[index]
  events.push({ type: 'played', player: me, card, owner, lane, target: target.card })

  if (card.rank === 'J') {
    caravan.splice(index, 1)
    events.push({ type: 'removed', owner, lane, cards: [target.card, ...target.attached] })
    return
  }

  caravan[index] = { card: target.card, attached: [...target.attached, card] }
  if (card.rank !== 'JK') return

  // Joker: clear matching number cards everywhere except the target itself.
  const matches =
    target.card.rank === 'A'
      ? (c: Card) => c.suit === target.card.suit
      : (c: Card) => c.rank === target.card.rank
  for (const p of [0, 1] as const) {
    for (const l of LANES) {
      const removed: Card[] = []
      players[p].caravans[l] = players[p].caravans[l].filter((placed) => {
        if (placed.card.id === target.card.id || !matches(placed.card)) return true
        removed.push(placed.card, ...placed.attached)
        return false
      })
      if (removed.length > 0) events.push({ type: 'removed', owner: p, lane: l, cards: removed })
    }
  }
}

function finishTurn(players: [MutablePlayer, MutablePlayer], me: PlayerId, turn: number, events: GameEvent[]): GameState {
  const base = { players, turn }
  const outcomes = LANES.map((lane) =>
    laneWinner(caravanValue(players[0].caravans[lane]), caravanValue(players[1].caravans[lane])),
  )

  if (outcomes.every((o) => o !== null)) {
    const p0Lanes = outcomes.filter((o) => o === 0).length
    const winner: PlayerId = p0Lanes >= 2 ? 0 : 1
    events.push({ type: 'game-over', winner, reason: 'lanes' })
    return { ...base, current: me, winner, endReason: 'lanes' }
  }

  const next = other(me)
  if (players[next].hand.length === 0) {
    events.push({ type: 'game-over', winner: me, reason: 'out-of-cards' })
    return { ...base, current: next, winner: me, endReason: 'out-of-cards' }
  }

  return { ...base, current: next, winner: null, endReason: null }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface DeckCheck {
  ok: boolean
  problems: string[]
  numberCards: number
  faceCards: number
}

export function checkDeck(cards: readonly Card[]): DeckCheck {
  const problems: string[] = []
  const numberCards = cards.filter(isNumberCard).length
  const ids = new Set(cards.map((c) => c.id))
  if (cards.length < MIN_DECK_SIZE) problems.push(`Add ${MIN_DECK_SIZE - cards.length} more cards (minimum ${MIN_DECK_SIZE}).`)
  if (numberCards < MIN_NUMBER_CARDS) {
    problems.push(`Add ${MIN_NUMBER_CARDS - numberCards} more number cards (minimum ${MIN_NUMBER_CARDS}).`)
  }
  if (ids.size !== cards.length) problems.push('A deck can hold only one copy of each card.')
  return { ok: problems.length === 0, problems, numberCards, faceCards: cards.length - numberCards }
}

/** Shuffle so the opening hand holds at least three number cards. */
export function shuffleForOpening(cards: readonly Card[], rng: Rng): Card[] {
  let deck = shuffle(cards, rng)
  for (let tries = 0; tries < 100; tries++) {
    if (deck.slice(0, OPENING_HAND_SIZE).filter(isNumberCard).length >= OPENING_TURNS) return deck
    deck = shuffle(cards, rng)
  }
  // Practically unreachable for a valid deck: pull number cards to the top.
  const numbers = deck.filter(isNumberCard)
  const head = numbers.slice(0, OPENING_TURNS)
  return [...head, ...deck.filter((c) => !head.includes(c))]
}

export interface NewGameOptions {
  decks: readonly [readonly Card[], readonly Card[]]
  rng: Rng
  firstPlayer?: PlayerId
}

export function createGame({ decks, rng, firstPlayer = 0 }: NewGameOptions): GameState {
  const makePlayer = (cards: readonly Card[]): PlayerState => {
    const deck = shuffleForOpening(cards, rng)
    return {
      hand: deck.slice(0, OPENING_HAND_SIZE),
      deck: deck.slice(OPENING_HAND_SIZE),
      caravans: [[], [], []],
      turnsTaken: 0,
    }
  }
  return {
    players: [makePlayer(decks[0]), makePlayer(decks[1])],
    current: firstPlayer,
    winner: null,
    endReason: null,
    turn: 0,
  }
}

/**
 * Caravan AI.
 *
 * The AI never looks at hidden information. Before deciding, it builds a few
 * "determinized" copies of the game where the opponent's hand and both draw
 * piles are re-shuffled from what it can't see, then scores each candidate
 * move across those copies:
 *
 * - easy:   one sample, one ply, lots of noise and the odd careless move
 * - normal: a few samples, one ply
 * - hard:   more samples, two ply (assumes the opponent answers with their best reply)
 */

import { type Card, type NumberRank, pipValue } from '../../core/cards'
import { type Rng, pick, shuffle } from '../../core/rng'
import {
  type Caravan,
  type GameState,
  type Move,
  type PlayerId,
  LANES,
  SOLD_MAX,
  SOLD_MIN,
  applyMove,
  canExtend,
  caravanHeading,
  caravanValue,
  isNumberCard,
  laneWinner,
  legalMoves,
  other,
} from './engine'

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface AiProfile {
  difficulty: Difficulty
  /** How much the AI cares about wrecking your caravans versus building its own (1 = even). */
  aggression: number
}

const WIN_SCORE = 100_000

/** Evaluation weights. Self-play showed results are flat around these values. */
const W = {
  lane: 45,
  twoLanes: 30,
  oppHand: 0.5,
  soldBase: 70,
  soldStep: 3,
  shortStep: 3.2,
  bustBase: 30,
  bustStep: 6,
  flexibility: 0.6,
}

export interface Search {
  samples: number
  plies: 1 | 2
  /** Moves kept for the expensive second ply. */
  shortlist: number
  noise: number
  /** Chance of making a lazy, mostly random move. */
  blunder: number
}

/**
 * Tuned by paired-seed self-play (each deal played from both seats): normal
 * beats easy (aggression 0.1) ~80% and hard beats normal ~63%. Caravan is
 * luck-heavy, so that's a real edge. A random player loses every game to all three.
 */
export const SEARCH: Record<Difficulty, Search> = {
  easy: { samples: 1, plies: 1, shortlist: 0, noise: 30, blunder: 0.35 },
  normal: { samples: 3, plies: 1, shortlist: 0, noise: 3, blunder: 0 },
  hard: { samples: 24, plies: 2, shortlist: 6, noise: 0, blunder: 0 },
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** How good a single caravan is for its owner, ignoring the opponent. */
function caravanScore(caravan: Caravan): number {
  if (caravan.length === 0) return 0
  const value = caravanValue(caravan)
  let score: number
  if (value >= SOLD_MIN && value <= SOLD_MAX) score = W.soldBase + (value - SOLD_MIN) * W.soldStep
  else if (value < SOLD_MIN) score = W.soldBase - (SOLD_MIN - value) * W.shortStep
  else score = W.bustBase - (value - SOLD_MAX) * W.bustStep

  // Room to keep building matters while the caravan is still short.
  if (value < SOLD_MIN) {
    const last = pipValue(caravan[caravan.length - 1].card.rank as NumberRank)
    const { direction } = caravanHeading(caravan)
    const options = direction === null ? 9 : direction === 'asc' ? 10 - last : last - 1
    score += options * W.flexibility
  }
  return score
}

const HOLD_VALUE: Record<string, number> = { J: 7, JK: 9, K: 5, Q: 3 }

function handScore(state: GameState, me: PlayerId): number {
  const player = state.players[me]
  let score = 0
  for (const card of player.hand) {
    if (!isNumberCard(card)) {
      score += HOLD_VALUE[card.rank]
    } else {
      score += player.caravans.some((cv) => canExtend(cv, card)) ? 2 : 0.5
    }
  }
  // Running dry loses the game, so hoard a little once the deck is gone.
  if (player.deck.length === 0) score += player.hand.length * 4
  return score
}

/** Score `state` from `me`'s point of view. Higher is better. */
export function evaluate(state: GameState, me: PlayerId, aggression = 1): number {
  if (state.winner !== null) return state.winner === me ? WIN_SCORE - state.turn : -WIN_SCORE + state.turn
  const opp = other(me)
  let score = 0
  let lanesMine = 0
  let lanesTheirs = 0
  for (const lane of LANES) {
    const mine = state.players[me].caravans[lane]
    const theirs = state.players[opp].caravans[lane]
    score += caravanScore(mine) - aggression * caravanScore(theirs)
    const values: [number, number] = [0, 0]
    values[me] = caravanValue(mine)
    values[opp] = caravanValue(theirs)
    const winner = laneWinner(values[0], values[1])
    if (winner === me) lanesMine++
    else if (winner === opp) lanesTheirs++
  }
  score += lanesMine * W.lane - lanesTheirs * W.lane * aggression
  if (lanesMine >= 2) score += W.twoLanes
  if (lanesTheirs >= 2) score -= W.twoLanes * aggression
  return score + handScore(state, me) - W.oppHand * handScore(state, opp)
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Re-deal everything `me` can't see: the opponent's hand and both draw piles. */
export function determinize(state: GameState, me: PlayerId, rng: Rng): GameState {
  const opp = other(me)
  const o = state.players[opp]
  const pool: Card[] = shuffle([...o.hand, ...o.deck], rng)
  const players = [...state.players] as [GameState['players'][0], GameState['players'][1]]
  players[opp] = { ...o, hand: pool.slice(0, o.hand.length), deck: pool.slice(o.hand.length) }
  players[me] = { ...state.players[me], deck: shuffle(state.players[me].deck, rng) }
  return { ...state, players }
}

function bestReplyScore(state: GameState, me: PlayerId, aggression: number): number {
  const opp = other(me)
  let best: GameState | null = null
  let bestForOpp = -Infinity
  for (const reply of legalMoves(state)) {
    const after = applyMove(state, reply).state
    const forOpp = evaluate(after, opp, 1)
    if (forOpp > bestForOpp) {
      bestForOpp = forOpp
      best = after
    }
  }
  return best ? evaluate(best, me, aggression) : evaluate(state, me, aggression)
}

/** Lazy play for the easy AI: any number card that doesn't overshoot, else anything. */
function carelessMove(state: GameState, moves: Move[], rng: Rng): Move {
  const me = state.current
  const safe = moves.filter((m) => {
    if (m.type !== 'play' || m.owner !== me || m.index !== undefined) return false
    const after = applyMove(state, m, { draw: false }).state
    return caravanValue(after.players[me].caravans[m.lane]) <= SOLD_MAX
  })
  return pick(safe.length > 0 ? safe : moves.filter((m) => m.type !== 'disband'), rng)
}

/** Pick a move for the current player. */
export function chooseMove(state: GameState, profile: AiProfile, rng: Rng): Move {
  const moves = legalMoves(state)
  if (moves.length === 0) throw new Error('No legal moves')
  if (moves.length === 1) return moves[0]

  const me = state.current
  const search = SEARCH[profile.difficulty]
  if (search.blunder > 0 && rng() < search.blunder) return carelessMove(state, moves, rng)

  const samples = Array.from({ length: search.samples }, () => determinize(state, me, rng))

  // First ply: average immediate score across samples.
  const scored = moves.map((move) => {
    let total = 0
    for (const sample of samples) total += evaluate(applyMove(sample, move).state, me, profile.aggression)
    return { move, score: total / samples.length + (rng() - 0.5) * 2 * search.noise }
  })
  scored.sort((a, b) => b.score - a.score)
  if (search.plies === 1) return scored[0].move

  // Second ply on the shortlist: assume the opponent answers with their best move.
  let best = scored[0]
  let bestScore = -Infinity
  for (const candidate of scored.slice(0, search.shortlist)) {
    let total = 0
    for (const sample of samples) {
      const after = applyMove(sample, candidate.move).state
      total += after.winner !== null ? evaluate(after, me) : bestReplyScore(after, me, profile.aggression)
    }
    const score = total / samples.length
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best.move
}

/**
 * Reversi AI.
 *
 * Negamax with alpha-beta pruning, straight on the bitboards (bits.ts) so
 * nothing is allocated per position. It deepens one ply at a time until its
 * depth or its time runs out, playing the best move of the deepest search
 * it finished. Near the end it stops guessing and solves the game exactly.
 *
 * What a position is worth depends on who's judging (`AiProfile.judge`):
 *
 * - greedy:     discs on the board, the beginner's mistake
 * - positional: a table of what each square is worth, corners high and the
 *               squares that give corners away low
 * - full:       corners, discs that can no longer be turned, the number of
 *               moves each side has (mobility), discs facing empty squares
 *               (frontier), and X- and C-squares next to an empty corner
 *
 * Weaker opponents add noise to their scores and now and then play a move
 * without looking.
 */

import type { Rng } from '../../core/rng'
import { bordering, count, flips, lowest, moves, out, popcount } from './bits'
import { type GameState, legalMoves } from './engine'

export interface AiProfile {
  judge: 'greedy' | 'positional' | 'full'
  /** The deepest middle-game search, in plies. */
  depth: number
  /** Time for the whole move, in ms. Searches stop where they are when it runs out. */
  timeMs: number
  /** Solve the game exactly once this many squares or fewer are empty. 0 never does. */
  endgame: number
  /** Random spread added to each move's score: higher is sloppier. */
  noise: number
  /** Chance of a careless move: any legal square, at random. */
  blunder: number
  /** The full judge's weights, if not the usual ones. For tuning. */
  weights?: Partial<Weights>
}

// ---- Squares ----------------------------------------------------------------

/** A set of squares, as the two halves bits.ts works with. */
type Mask = readonly [number, number]

const maskOf = (squares: readonly number[]): Mask => {
  let lo = 0
  let hi = 0
  for (const sq of squares) {
    if (sq < 32) lo |= 1 << sq
    else hi |= 1 << (sq - 32)
  }
  return [lo, hi]
}

const at = (file: number, row: number) => row * 8 + file

const CORNERS = [at(0, 0), at(7, 0), at(0, 7), at(7, 7)]
const CORNER_MASK = maskOf(CORNERS)
/** Diagonally next to each corner, in CORNERS order. */
const X_SQUARES = [at(1, 1), at(6, 1), at(1, 6), at(6, 6)]
/** Beside each corner on the edges, in CORNERS order. */
const C_SQUARES = [
  [at(1, 0), at(0, 1)],
  [at(6, 0), at(7, 1)],
  [at(0, 6), at(1, 7)],
  [at(7, 6), at(6, 7)],
]

/**
 * The classic table of square values: corners best, the squares that give
 * them away worst. The positional judge uses it as is.
 */
const TABLE = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
]

/** The table as one mask per value, so a position adds up in a few popcounts. */
const TABLE_GROUPS: readonly { weight: number; lo: number; hi: number }[] = [...new Set(TABLE)].map((weight) => {
  const [lo, hi] = maskOf(TABLE.flatMap((w, sq) => (w === weight ? [sq] : [])))
  return { weight, lo, hi }
})

/**
 * The order to try moves in when nothing better is known: corners, then the
 * edges and the middle, with X- and C-squares last. Lower goes first.
 */
const SQUARE_ORDER = TABLE.map((w) => -w)

/** Runs from each corner along its two edges, for counting discs that can't be turned. */
const EDGE_RUNS: readonly (readonly number[])[] = CORNERS.flatMap((corner) => {
  const f = corner & 7
  const r = corner >> 3
  const df = f === 0 ? 1 : -1
  const dr = r === 0 ? 1 : -1
  return [
    Array.from({ length: 8 }, (_, i) => at(f + df * i, r)),
    Array.from({ length: 8 }, (_, i) => at(f, r + dr * i)),
  ]
})

const owns = (lo: number, hi: number, sq: number) => (sq < 32 ? (lo >>> sq) & 1 : (hi >>> (sq - 32)) & 1) === 1

// ---- Judging a position -------------------------------------------------------

/**
 * Weights for the full judge, in the same units as the table: a corner is
 * worth six moves' freedom. Tuned by self-play; each change here won at
 * least 60% of paired games against the weights before it.
 */
const WEIGHTS = { corner: 30, stable: 6, mobility: 5, frontier: 4, xSquare: 30, cSquare: 12, parity: 2 }
export type Weights = typeof WEIGHTS
let W: Weights = WEIGHTS

/** Each side's discs along an edge, from a corner they hold, as far as they run unbroken. */
function stableEdges(lo: number, hi: number): number {
  let sLo = 0
  let sHi = 0
  for (const run of EDGE_RUNS) {
    for (const sq of run) {
      if (!owns(lo, hi, sq)) break
      if (sq < 32) sLo |= 1 << sq
      else sHi |= 1 << (sq - 32)
    }
  }
  return count(sLo, sHi)
}

/** X- and C-squares a side holds next to a corner nobody has taken yet. */
function cornerRisk(lo: number, hi: number, emptyLo: number, emptyHi: number, xWeight: number, cWeight: number): number {
  let risk = 0
  for (let i = 0; i < 4; i++) {
    if (!owns(emptyLo, emptyHi, CORNERS[i])) continue
    if (owns(lo, hi, X_SQUARES[i])) risk += xWeight
    for (const c of C_SQUARES[i]) if (owns(lo, hi, c)) risk += cWeight
  }
  return risk
}

function tableScore(pLo: number, pHi: number, oLo: number, oHi: number): number {
  let score = 0
  for (const g of TABLE_GROUPS) score += g.weight * (popcount(pLo & g.lo) + popcount(pHi & g.hi) - popcount(oLo & g.lo) - popcount(oHi & g.hi))
  return score
}

/** What the position is worth to `p`, the side to move. */
function judge(kind: AiProfile['judge'], pLo: number, pHi: number, oLo: number, oHi: number): number {
  const discs = count(pLo, pHi) - count(oLo, oHi)
  if (kind === 'greedy') return discs
  if (kind === 'positional') return tableScore(pLo, pHi, oLo, oHi)

  const emptyLo = ~(pLo | oLo)
  const emptyHi = ~(pHi | oHi)
  const empties = count(emptyLo, emptyHi)
  moves(pLo, pHi, oLo, oHi)
  const myMoves = count(out.lo, out.hi)
  moves(oLo, oHi, pLo, pHi)
  const theirMoves = count(out.lo, out.hi)
  bordering(emptyLo, emptyHi)
  const edgeLo = out.lo
  const edgeHi = out.hi
  const frontier = count(oLo & edgeLo, oHi & edgeHi) - count(pLo & edgeLo, pHi & edgeHi)
  const corners = popcount(pLo & CORNER_MASK[0]) + popcount(pHi & CORNER_MASK[1]) - popcount(oLo & CORNER_MASK[0]) - popcount(oHi & CORNER_MASK[1])
  const risk =
    cornerRisk(oLo, oHi, emptyLo, emptyHi, W.xSquare, W.cSquare) - cornerRisk(pLo, pHi, emptyLo, emptyHi, W.xSquare, W.cSquare)
  const stable = stableEdges(pLo, pHi) - stableEdges(oLo, oHi)
  // Discs only start to count as the board fills up.
  const late = Math.max(0, 20 - empties) * W.parity * 0.1
  return W.corner * corners + W.stable * stable + W.mobility * (myMoves - theirMoves) + W.frontier * frontier + risk + late * discs
}

// ---- Searching ------------------------------------------------------------------

/** Above anything the judges can say, so a won game always beats a good position. */
const WIN = 100_000
const INF = 1_000_000

/** The exact result, from `p`'s side: the disc margin, empties to the winner, as a win or loss. */
function finalValue(pLo: number, pHi: number, oLo: number, oHi: number): number {
  const mine = count(pLo, pHi)
  const theirs = count(oLo, oHi)
  const empty = 64 - mine - theirs
  if (mine > theirs) return WIN + mine - theirs + empty
  if (theirs > mine) return -WIN + mine - theirs - empty
  return 0
}

/** Per-ply scratch space for move lists, so searching allocates nothing. */
const MAX_PLY = 64
const moveBuf = Array.from({ length: MAX_PLY }, () => new Int32Array(32))
const keyBuf = Array.from({ length: MAX_PLY }, () => new Int32Array(32))

let deadline = Infinity
let aborted = false
let nodes = 0
let judgeKind: AiProfile['judge'] = 'full'

const tick = () => {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) aborted = true
}

/**
 * Fill this ply's move list and return how many there are, sorted so the
 * likeliest best moves come first. Deep enough in the tree, that means the
 * moves that leave the opponent the fewest replies.
 */
function orderedMoves(pLo: number, pHi: number, oLo: number, oHi: number, ply: number, byMobility: boolean): number {
  moves(pLo, pHi, oLo, oHi)
  let lo = out.lo
  let hi = out.hi
  const list = moveBuf[ply]
  const keys = keyBuf[ply]
  let n = 0
  while (lo !== 0 || hi !== 0) {
    const sq = lowest(lo, hi)
    if (sq < 32) lo &= ~(1 << sq)
    else hi &= ~(1 << (sq - 32))
    let key = SQUARE_ORDER[sq]
    if (byMobility) {
      flips(pLo, pHi, oLo, oHi, sq)
      const fLo = out.lo
      const fHi = out.hi
      const bit = sq < 32 ? 1 << sq : 0
      const bitHi = sq < 32 ? 0 : 1 << (sq - 32)
      moves(oLo & ~fLo, oHi & ~fHi, pLo | fLo | bit, pHi | fHi | bitHi)
      key += count(out.lo, out.hi) * 40
    }
    // Insertion sort: the lists are short.
    let i = n++
    while (i > 0 && keys[i - 1] > key) {
      keys[i] = keys[i - 1]
      list[i] = list[i - 1]
      i--
    }
    keys[i] = key
    list[i] = sq
  }
  return n
}

function negamax(pLo: number, pHi: number, oLo: number, oHi: number, depth: number, alpha: number, beta: number, passed: boolean, ply: number): number {
  tick()
  if (aborted) return 0
  if (depth <= 0) return judge(judgeKind, pLo, pHi, oLo, oHi)
  const n = orderedMoves(pLo, pHi, oLo, oHi, ply, depth >= 3)
  if (n === 0) {
    if (passed) return finalValue(pLo, pHi, oLo, oHi)
    return -negamax(oLo, oHi, pLo, pHi, depth, -beta, -alpha, true, ply + 1)
  }
  const list = moveBuf[ply]
  let best = -INF
  for (let i = 0; i < n; i++) {
    const sq = list[i]
    flips(pLo, pHi, oLo, oHi, sq)
    const fLo = out.lo
    const fHi = out.hi
    const bit = sq < 32 ? 1 << sq : 0
    const bitHi = sq < 32 ? 0 : 1 << (sq - 32)
    const value = -negamax(oLo & ~fLo, oHi & ~fHi, pLo | fLo | bit, pHi | fHi | bitHi, depth - 1, -beta, -alpha, false, ply + 1)
    if (aborted) return 0
    if (value > best) best = value
    if (value > alpha) alpha = value
    if (alpha >= beta) break
  }
  return best
}

/** The exact final margin for `p`, empties to the winner, playing perfectly from here. */
function solve(pLo: number, pHi: number, oLo: number, oHi: number, alpha: number, beta: number, passed: boolean, ply: number): number {
  tick()
  if (aborted) return 0
  const empties = 64 - count(pLo, pHi) - count(oLo, oHi)
  const n = orderedMoves(pLo, pHi, oLo, oHi, ply, empties > 6)
  if (n === 0) {
    if (passed) {
      const margin = count(pLo, pHi) - count(oLo, oHi)
      return margin > 0 ? margin + empties : margin < 0 ? margin - empties : 0
    }
    return -solve(oLo, oHi, pLo, pHi, -beta, -alpha, true, ply + 1)
  }
  const list = moveBuf[ply]
  let best = -INF
  for (let i = 0; i < n; i++) {
    const sq = list[i]
    flips(pLo, pHi, oLo, oHi, sq)
    const fLo = out.lo
    const fHi = out.hi
    const bit = sq < 32 ? 1 << sq : 0
    const bitHi = sq < 32 ? 0 : 1 << (sq - 32)
    const value = -solve(oLo & ~fLo, oHi & ~fHi, pLo | fLo | bit, pHi | fHi | bitHi, -beta, -alpha, false, ply + 1)
    if (aborted) return 0
    if (value > best) best = value
    if (value > alpha) alpha = value
    if (alpha >= beta) break
  }
  return best
}

interface Child {
  square: number
  pLo: number
  pHi: number
  oLo: number
  oHi: number
  score: number
}

/** Every move from the root, with the position it leads to (from the opponent's side). */
function children(state: GameState): Child[] {
  const p = state.discs[state.current]
  const o = state.discs[state.current === 0 ? 1 : 0]
  return legalMoves(state).map((square) => {
    flips(p.lo, p.hi, o.lo, o.hi, square)
    const bit = square < 32 ? 1 << square : 0
    const bitHi = square < 32 ? 0 : 1 << (square - 32)
    return { square, pLo: o.lo & ~out.lo, pHi: o.hi & ~out.hi, oLo: p.lo | out.lo | bit, oHi: p.hi | out.hi | bitHi, score: 0 }
  })
}

/**
 * Score every root move to `depth`. With `exact` each gets its true score,
 * for adding noise to; otherwise only the best is exact and the rest are
 * bounds, which is quicker. False if time ran out first.
 */
function searchRoot(kids: Child[], depth: number, exact: boolean): boolean {
  let alpha = -INF
  for (const kid of kids) {
    const value = -negamax(kid.pLo, kid.pHi, kid.oLo, kid.oHi, depth - 1, -INF, exact ? INF : -alpha, false, 1)
    if (aborted) return false
    kid.score = value
    if (value > alpha) alpha = value
  }
  return true
}

function solveRoot(kids: Child[], exact: boolean): boolean {
  let alpha = -INF
  for (const kid of kids) {
    const value = -solve(kid.pLo, kid.pHi, kid.oLo, kid.oHi, -INF, exact ? INF : -alpha, false, 1)
    if (aborted) return false
    kid.score = value
    if (value > alpha) alpha = value
  }
  return true
}

const bestFirst = (a: Child, b: Child) => b.score - a.score

/** The square to play. The game must not be over. */
export function chooseMove(state: GameState, profile: AiProfile, rng: Rng): number {
  const kids = children(state)
  if (kids.length === 0) throw new Error('No move to choose: the game is over')
  if (kids.length === 1) return kids[0].square
  if (rng() < profile.blunder) return kids[Math.floor(rng() * kids.length)].square

  const start = performance.now()
  const empties = 60 - state.turn
  const solving = empties <= profile.endgame
  // When it's time to solve, a quick look first puts the likeliest moves first.
  deadline = start + (solving ? profile.timeMs * 0.15 : profile.timeMs)
  aborted = false
  nodes = 0
  judgeKind = profile.judge
  W = profile.weights ? { ...WEIGHTS, ...profile.weights } : WEIGHTS
  // Noise needs every move's true score; otherwise bounds will do.
  const exact = profile.noise > 0

  // Corners and edges first, until a search says otherwise.
  kids.sort((a, b) => SQUARE_ORDER[a.square] - SQUARE_ORDER[b.square])
  let scored: Child[] | null = null
  for (let depth = 1; depth <= profile.depth && depth <= empties; depth++) {
    if (!searchRoot(kids, depth, exact)) break
    scored = kids.map((k) => ({ ...k }))
    kids.sort(bestFirst)
  }

  if (solving) {
    deadline = start + profile.timeMs
    aborted = false
    // Margins in discs, scaled so no amount of noise can talk it out of a better result.
    if (solveRoot(kids, exact)) scored = kids.map((k) => ({ ...k, score: k.score * 1000 }))
  }

  // Out of time before even one ply: the first move in order.
  if (!scored) return kids[0].square
  let best = scored[0]
  let bestScore = -Infinity
  for (const kid of scored) {
    const score = kid.score + (profile.noise > 0 ? (rng() * 2 - 1) * profile.noise : 0)
    if (score > bestScore) {
      bestScore = score
      best = kid
    }
  }
  return best.square
}

/** The exact result with perfect play from here, as the side to move's final disc margin. For tests. */
export function solveExactly(state: GameState): number {
  const p = state.discs[state.current]
  const o = state.discs[state.current === 0 ? 1 : 0]
  deadline = Infinity
  aborted = false
  return solve(p.lo, p.hi, o.lo, o.hi, -INF, INF, false, 0)
}

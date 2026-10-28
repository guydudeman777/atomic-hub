/**
 * Connect Four AI.
 *
 * Negamax with alpha-beta pruning, on bitboards so nothing is allocated per
 * position. It deepens one ply at a time until its depth or its time runs
 * out, playing the best move of the deepest search it finished. A search
 * deep enough to reach a full rack is exact, so near the end the strongest
 * opponents simply solve the game.
 *
 * The board, as Pascal Pons's solver lays it out: each column is 7 bits,
 * the bottom hole first, with the 7th left empty so lines can't run from
 * one column into the next. Hole (col, row) is bit col * 7 + row. That's 49
 * bits, more than a JavaScript bitwise operation holds, so every set is two
 * halves: bits 0–31 in `lo`, 32–48 in `hi`. A position is the side to
 * move's checkers and the mask of every checker.
 *
 * At every node, before searching anything:
 * - a move that wins at once is played;
 * - if the opponent could win at once in two places, the game is lost;
 * - if in one, that's the only move;
 * - and a move just under the opponent's winning hole is never made, as it
 *   would hand them the hole.
 *
 * What a position is worth, once the search stops: each side's threats
 * (empty holes that would make four), counting those on the rows that
 * player wants for the endgame double (Red does best with threats on odd
 * rows counted from the bottom, Yellow on even ones), and a little for
 * checkers near the middle, which take part in the most lines.
 *
 * Weaker opponents search less deeply, add noise to their scores, and now
 * and then drop a checker without looking.
 */

import type { Rng } from '../../core/rng'
import { CELLS, COLS, type GameState, ROWS, legalMoves } from './engine'

export interface AiProfile {
  /** The deepest search, in plies. */
  depth: number
  /** Time for the whole move, in ms. Searches stop where they are when it runs out. */
  timeMs: number
  /** With this many holes empty or fewer, search to the end, with four times the time. 0 never does. */
  endgame: number
  /** Random spread added to each move's score: higher is sloppier. */
  noise: number
  /** Chance of a careless move: any column, at random. */
  blunder: number
}

// ---- Sets of holes ------------------------------------------------------------------

const H1 = ROWS + 1

const bitOf = (col: number, row: number) => col * H1 + row

function maskOf(bits: readonly number[]): [number, number] {
  let lo = 0
  let hi = 0
  for (const b of bits) {
    if (b < 32) lo |= 1 << b
    else hi |= 1 << (b - 32)
  }
  return [lo, hi]
}

const ALL_HOLES = Array.from({ length: COLS * ROWS }, (_, i) => bitOf(Math.floor(i / ROWS), i % ROWS))
const [BOARD_LO, BOARD_HI] = maskOf(ALL_HOLES)
const [BOTTOM_LO, BOTTOM_HI] = maskOf(Array.from({ length: COLS }, (_, c) => bitOf(c, 0)))
/** Each column's holes. */
const COLUMN = Array.from({ length: COLS }, (_, c) => maskOf(Array.from({ length: ROWS }, (_, r) => bitOf(c, r))))
/** Rows 1, 3 and 5 from the bottom (indexes 0, 2, 4), and 2, 4 and 6. */
const ODD_ROWS = maskOf(ALL_HOLES.filter((b) => (b % H1) % 2 === 0))
const EVEN_ROWS = maskOf(ALL_HOLES.filter((b) => (b % H1) % 2 === 1))
/** Columns by how near the middle they are, with what a checker in them is worth. */
const CENTER: readonly { lo: number; hi: number; weight: number }[] = [
  { cols: [3], weight: 4 },
  { cols: [2, 4], weight: 2 },
  { cols: [1, 5], weight: 1 },
].map(({ cols, weight }) => {
  const [lo, hi] = maskOf(cols.flatMap((c) => Array.from({ length: ROWS }, (_, r) => bitOf(c, r))))
  return { lo, hi, weight }
})
/** The middle first, then outward: where good moves usually are. */
const ORDER = [3, 2, 4, 1, 5, 0, 6]

function pop(x: number): number {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}

// Results of the helpers below, so they allocate nothing.
let outLo = 0
let outHi = 0

/** The holes a checker can drop into: the lowest empty one in each column (mask + bottom row, carried up each column). */
function playable(mLo: number, mHi: number) {
  const sum = (mLo >>> 0) + (BOTTOM_LO >>> 0)
  const carry = sum >= 4294967296 ? 1 : 0
  outLo = sum & BOARD_LO
  outHi = (mHi + BOTTOM_HI + carry) & BOARD_HI
}

/** Diagonals and across: a step of 6, 7 or 8 bits. Up a column is a step of 1. */
const STEPS = [H1, H1 - 1, H1 + 1]

/**
 * Of the holes in `e`, those where a checker of `p` would make four: three
 * of p's in a line with it, on either side. Pons's winning_position, on
 * halves.
 */
function winning(pLo: number, pHi: number, eLo: number, eHi: number) {
  // Three below it in the column.
  let rLo = (pLo << 1) & (pLo << 2) & (pLo << 3)
  let rHi = ((pHi << 1) | (pLo >>> 31)) & ((pHi << 2) | (pLo >>> 30)) & ((pHi << 3) | (pLo >>> 29))
  for (let k = 0; k < 3; k++) {
    const s = STEPS[k]
    const s2 = s * 2
    const s3 = s * 3
    const l1Lo = pLo << s
    const l1Hi = (pHi << s) | (pLo >>> (32 - s))
    const l2Lo = pLo << s2
    const l2Hi = (pHi << s2) | (pLo >>> (32 - s2))
    const l3Lo = pLo << s3
    const l3Hi = (pHi << s3) | (pLo >>> (32 - s3))
    const r1Lo = (pLo >>> s) | (pHi << (32 - s))
    const r1Hi = pHi >>> s
    const r2Lo = (pLo >>> s2) | (pHi << (32 - s2))
    const r2Hi = pHi >>> s2
    const r3Lo = (pLo >>> s3) | (pHi << (32 - s3))
    const r3Hi = pHi >>> s3
    // Two on one side and a third beyond them, or one more on the other side.
    rLo |= l1Lo & l2Lo & (l3Lo | r1Lo)
    rHi |= l1Hi & l2Hi & (l3Hi | r1Hi)
    rLo |= r1Lo & r2Lo & (l1Lo | r3Lo)
    rHi |= r1Hi & r2Hi & (l1Hi | r3Hi)
  }
  outLo = rLo & eLo
  outHi = rHi & eHi
}

/** Whether `p` has four in a row. For checking the bitboards against the engine. */
export function hasFour(pLo: number, pHi: number): boolean {
  for (const s of [1, ...STEPS]) {
    const mLo = pLo & ((pLo >>> s) | (pHi << (32 - s)))
    const mHi = pHi & (pHi >>> s)
    const s2 = 2 * s
    if (((mLo & ((mLo >>> s2) | (mHi << (32 - s2)))) | (mHi & (mHi >>> s2))) !== 0) return true
  }
  return false
}

/** A game's checkers as bitboards: Red's, Yellow's, and the mask of both. */
export function bitboards(state: GameState): { red: [number, number]; yellow: [number, number]; mask: [number, number] } {
  const red: number[] = []
  const yellow: number[] = []
  state.board.forEach((owner, sq) => {
    if (owner === null) return
    const b = bitOf(sq % COLS, Math.floor(sq / COLS))
    if (owner === 0) red.push(b)
    else yellow.push(b)
  })
  const r = maskOf(red)
  const y = maskOf(yellow)
  return { red: r, yellow: y, mask: [r[0] | y[0], r[1] | y[1]] }
}

/** The holes where `player` would make four, as engine squares, worked out on the bitboards. For checking against the engine. */
export function threatsOnBits(state: GameState, player: 0 | 1): number[] {
  const { red, yellow, mask } = bitboards(state)
  const p = player === 0 ? red : yellow
  winning(p[0], p[1], BOARD_LO & ~mask[0], BOARD_HI & ~mask[1])
  const lo = outLo
  const hi = outHi
  const squares: number[] = []
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const b = bitOf(col, row)
      if ((b < 32 ? (lo >>> b) & 1 : (hi >>> (b - 32)) & 1) === 1) squares.push(row * COLS + col)
    }
  }
  return squares.sort((a, b) => a - b)
}

// ---- Judging a position -------------------------------------------------------------

/** Above anything the judge can say. A win is worth WIN less the checkers on the rack when it lands, so sooner is better. */
const WIN = 100_000
const INF = 1_000_000
const isDecided = (score: number) => Math.abs(score) > WIN - 100

const THREAT = 16
const GOOD_THREAT = 32

/** What the position is worth to the side to move, `p`, whose threats are `w` and the opponent's `v`. */
function judge(pLo: number, pHi: number, oLo: number, oHi: number, wLo: number, wHi: number, vLo: number, vHi: number, moves: number): number {
  // Red moves when the count is even; Red wants odd rows, so Yellow wants the others.
  const good = moves % 2 === 0 ? ODD_ROWS : EVEN_ROWS
  const theirs = moves % 2 === 0 ? EVEN_ROWS : ODD_ROWS
  let score =
    THREAT * (pop(wLo) + pop(wHi) - pop(vLo) - pop(vHi)) +
    (GOOD_THREAT - THREAT) * (pop(wLo & good[0]) + pop(wHi & good[1]) - pop(vLo & theirs[0]) - pop(vHi & theirs[1]))
  for (const c of CENTER) score += c.weight * (pop(pLo & c.lo) + pop(pHi & c.hi) - pop(oLo & c.lo) - pop(oHi & c.hi))
  return score
}

// ---- The transposition table ------------------------------------------------------------

/**
 * Positions already searched, keyed by mask + side to move's checkers,
 * which is different for every position (Pons again). Scores are the same
 * whatever the root, since a win's score counts the checkers on the rack,
 * so the table is kept from move to move.
 */
const TT_SIZE = 1 << 18
const ttKey = new Float64Array(TT_SIZE)
const ttValue = new Int32Array(TT_SIZE)
const ttDepth = new Int8Array(TT_SIZE)
const ttFlag = new Int8Array(TT_SIZE)
const ttMove = new Int8Array(TT_SIZE)
const EXACT = 1
const LOWER = 2
const UPPER = 3

/** Plus one, so no position's key is the empty slot's 0. */
const keyOf = (pLo: number, pHi: number, mLo: number, mHi: number) => (pHi + mHi) * 4294967296 + (pLo >>> 0) + (mLo >>> 0) + 1

/** Forget everything, for tests that time the search from scratch. */
export function clearMemory() {
  ttKey.fill(0)
}

// ---- Searching ------------------------------------------------------------------------

let deadline = Infinity
let aborted = false
let nodes = 0

const tick = () => {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) aborted = true
}

/** Per-ply scratch space for move lists. */
const moveBuf = Array.from({ length: CELLS + 2 }, () => new Int8Array(COLS))
const keyBuf = Array.from({ length: CELLS + 2 }, () => new Int32Array(COLS))

function negamax(pLo: number, pHi: number, mLo: number, mHi: number, moves: number, depth: number, alpha: number, beta: number, ply: number): number {
  tick()
  if (aborted) return 0
  if (moves >= CELLS) return 0
  const eLo = BOARD_LO & ~mLo
  const eHi = BOARD_HI & ~mHi
  playable(mLo, mHi)
  const posLo = outLo
  const posHi = outHi
  winning(pLo, pHi, eLo, eHi)
  const wLo = outLo
  const wHi = outHi
  if ((wLo & posLo) !== 0 || (wHi & posHi) !== 0) return WIN - (moves + 1)

  const oLo = pLo ^ mLo
  const oHi = pHi ^ mHi
  winning(oLo, oHi, eLo, eHi)
  const vLo = outLo
  const vHi = outHi
  let candLo = posLo
  let candHi = posHi
  const forcedLo = posLo & vLo
  const forcedHi = posHi & vHi
  if (forcedLo !== 0 || forcedHi !== 0) {
    if (pop(forcedLo) + pop(forcedHi) > 1) return -(WIN - (moves + 2))
    candLo = forcedLo
    candHi = forcedHi
  }
  // Never just under one of their winning holes.
  candLo &= ~((vLo >>> 1) | (vHi << 31))
  candHi &= ~(vHi >>> 1)
  if (candLo === 0 && candHi === 0) return -(WIN - (moves + 2))
  if (moves + 1 >= CELLS) return 0
  if (depth <= 0) return judge(pLo, pHi, oLo, oHi, wLo, wHi, vLo, vHi, moves)

  const key = keyOf(pLo, pHi, mLo, mHi)
  const slot = key % TT_SIZE
  let hashMove = -1
  if (ttKey[slot] === key) {
    hashMove = ttMove[slot]
    if (ttDepth[slot] >= depth) {
      const v = ttValue[slot]
      const flag = ttFlag[slot]
      if (flag === EXACT) return v
      if (flag === LOWER && v >= beta) return v
      if (flag === UPPER && v <= alpha) return v
    }
  }

  // Order the moves: the table's best first, then those that make the most threats, the middle breaking ties.
  const list = moveBuf[ply]
  const keys = keyBuf[ply]
  let n = 0
  for (let k = 0; k < COLS; k++) {
    const col = ORDER[k]
    const bLo = candLo & COLUMN[col][0]
    const bHi = candHi & COLUMN[col][1]
    if (bLo === 0 && bHi === 0) continue
    let rank = k
    if (col === hashMove) rank -= 1000
    else if (depth >= 2) {
      winning(pLo | bLo, pHi | bHi, eLo & ~bLo, eHi & ~bHi)
      rank -= (pop(outLo) + pop(outHi)) * 10
    }
    let i = n++
    while (i > 0 && keys[i - 1] > rank) {
      keys[i] = keys[i - 1]
      list[i] = list[i - 1]
      i--
    }
    keys[i] = rank
    list[i] = col
  }

  const alpha0 = alpha
  let best = -INF
  let bestMove = list[0]
  for (let i = 0; i < n; i++) {
    const col = list[i]
    const bLo = candLo & COLUMN[col][0]
    const bHi = candHi & COLUMN[col][1]
    const value = -negamax(oLo, oHi, mLo | bLo, mHi | bHi, moves + 1, depth - 1, -beta, -alpha, ply + 1)
    if (aborted) return 0
    if (value > best) {
      best = value
      bestMove = col
    }
    if (value > alpha) alpha = value
    if (alpha >= beta) break
  }
  ttKey[slot] = key
  ttValue[slot] = best
  ttDepth[slot] = depth
  ttFlag[slot] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT
  ttMove[slot] = bestMove
  return best
}

interface Child {
  col: number
  /** The position after the move, from the opponent's side. */
  pLo: number
  pHi: number
  mLo: number
  mHi: number
  score: number
}

/** Every move from the root, with the position it leads to. */
function children(state: GameState): { kids: Child[]; moves: number } {
  const { red, yellow, mask } = bitboards(state)
  const them = state.current === 0 ? yellow : red
  const kids = legalMoves(state).map((col) => {
    const [bLo, bHi] = maskOf([bitOf(col, state.heights[col])])
    return { col, pLo: them[0], pHi: them[1], mLo: mask[0] | bLo, mHi: mask[1] | bHi, score: 0 }
  })
  return { kids, moves: state.turn }
}

/** Whether dropping in this child's column wins at once for the side that made it. */
function winsAtOnce(kid: Child): boolean {
  // The mover's checkers are the mask less the opponent's.
  return hasFour(kid.pLo ^ kid.mLo, kid.pHi ^ kid.mHi)
}

/**
 * Score every root move to `depth`. With `exact` each gets its true score,
 * for adding noise to; otherwise only the best is exact and the rest are
 * bounds, which is quicker. False if time ran out first.
 */
function searchRoot(kids: Child[], moves: number, depth: number, exact: boolean): boolean {
  let alpha = -INF
  for (const kid of kids) {
    const value = winsAtOnce(kid) ? WIN - (moves + 1) : -negamax(kid.pLo, kid.pHi, kid.mLo, kid.mHi, moves + 1, depth - 1, -INF, exact ? INF : -alpha, 1)
    if (aborted) return false
    kid.score = value
    if (value > alpha) alpha = value
  }
  return true
}

const bestFirst = (a: Child, b: Child) => b.score - a.score

/** How the last move's search went: the deepest search it finished, positions looked at, and the time it took. For tuning. */
export const lastSearch = { depth: 0, nodes: 0, ms: 0 }

/** The column to drop in. The game must not be over. */
export function chooseMove(state: GameState, profile: AiProfile, rng: Rng): number {
  const { kids, moves } = children(state)
  if (kids.length === 0) throw new Error('No move to choose: the game is over')
  if (kids.length === 1) return kids[0].col
  if (rng() < profile.blunder) return kids[Math.floor(rng() * kids.length)].col

  const empties = CELLS - moves
  const solving = empties <= profile.endgame
  const start = performance.now()
  deadline = start + profile.timeMs * (solving ? 4 : 1)
  aborted = false
  nodes = 0
  // Noise needs every move's true score; otherwise bounds will do.
  const exact = profile.noise > 0
  const maxDepth = solving ? empties : Math.min(profile.depth, empties)

  kids.sort((a, b) => ORDER.indexOf(a.col) - ORDER.indexOf(b.col))
  let scored: Child[] | null = null
  lastSearch.depth = 0
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (!searchRoot(kids, moves, depth, exact)) break
    scored = kids.map((k) => ({ ...k }))
    lastSearch.depth = depth
    kids.sort(bestFirst)
    // A forced win or loss found: deeper won't change it.
    if (!exact && isDecided(kids[0].score)) break
  }
  lastSearch.nodes = nodes
  lastSearch.ms = performance.now() - start

  // Out of time before even one ply: the first move in order.
  if (!scored) return kids[0].col
  let best = scored[0]
  let bestScore = -Infinity
  for (const kid of scored) {
    // Noise can't talk anyone into a loss they've seen, or out of a win.
    const score = kid.score + (profile.noise > 0 && !isDecided(kid.score) ? (rng() * 2 - 1) * profile.noise : 0)
    if (score > bestScore) {
      bestScore = score
      best = kid
    }
  }
  return best.col
}

/**
 * The result with perfect play from here, for the side to move: 1 for a
 * win, 0 for a draw, -1 for a loss. For tests.
 */
export function solveExactly(state: GameState): number {
  if (state.over) throw new Error('The game is over')
  const { kids, moves } = children(state)
  deadline = Infinity
  aborted = false
  searchRoot(kids, moves, CELLS - moves, false)
  const best = Math.max(...kids.map((k) => k.score))
  return best > 0 ? 1 : best < 0 ? -1 : 0
}

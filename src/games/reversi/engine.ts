/**
 * Reversi rules engine.
 *
 * Pure and framework-free, like the card games' engines: the UI, the AI and
 * the tests drive a game through `legalMoves` and `apply`. State is
 * immutable. Discs are bitboards (bits.ts); `cells` gives the board as a
 * plain array for drawing.
 *
 * Rules
 * - An 8×8 board. Columns are a to h from the left, rows 1 to 8 from the
 *   top. Play starts from four discs in the middle: white on d4 and e5,
 *   black on d5 and e4.
 * - Black moves first, then the players take turns.
 * - A move puts a disc of your color on an empty square so that it flanks
 *   at least one straight line of the other color's discs (across, down or
 *   diagonal) with one of your own at the far end. Every flanked line turns
 *   over, in all eight directions at once. Discs turned over don't turn
 *   others in their turn.
 * - If you have no move, you pass, and your opponent moves again. You can't
 *   pass while you have a move.
 * - The game ends when neither player can move: usually a full board, but it
 *   can end early, with empty squares left or one color wiped out.
 * - Most discs wins. Empty squares left at the end go to the winner (the
 *   tournament rule), so a 40–20 finish with four empties scores 44–20.
 *   Equal counts are a draw, 32–32.
 */

import { count, flips, has, lowest, moves, out } from './bits'

export type Player = 0 | 1
export const BLACK: Player = 0
export const WHITE: Player = 1
export const COLOR_NAME: Record<Player, string> = { 0: 'Black', 1: 'White' }

export const other = (p: Player): Player => (p === 0 ? 1 : 0)

/** A set of squares as two 32-bit halves: squares 0–31 in `lo`, 32–63 in `hi`. */
export interface Bits {
  readonly lo: number
  readonly hi: number
}

export interface GameState {
  /** Black's discs, then White's. */
  readonly discs: readonly [Bits, Bits]
  readonly current: Player
  /** Neither player can move. */
  readonly over: boolean
  /** Set when the game is over; null for a draw. */
  readonly winner: Player | null
  /** Discs placed so far. */
  readonly turn: number
  /** Where the last disc went. */
  readonly last: number | null
}

export type GameEvent =
  | { readonly type: 'placed'; readonly player: Player; readonly square: number }
  /** Turned to `player`'s color, nearest the new disc first. */
  | { readonly type: 'flipped'; readonly player: Player; readonly squares: readonly number[] }
  /** `player` has no move, and the turn goes back to the other player. */
  | { readonly type: 'passed'; readonly player: Player }
  /** Final score, empty squares counted for the winner. */
  | { readonly type: 'ended'; readonly winner: Player | null; readonly score: readonly [number, number] }

export const FILES = 'abcdefgh'

export const rowOf = (sq: number) => sq >> 3
export const colOf = (sq: number) => sq & 7

/** "d3", for a square index. */
export const squareName = (sq: number) => `${FILES[colOf(sq)]}${rowOf(sq) + 1}`

/** The square for a name like "d3", or null. */
export function parseSquare(name: string): number | null {
  const m = /^([a-h])([1-8])$/.exec(name.trim().toLowerCase())
  if (!m) return null
  return (Number(m[2]) - 1) * 8 + FILES.indexOf(m[1])
}

const bitsOf = (squares: readonly number[]): Bits => {
  let lo = 0
  let hi = 0
  for (const sq of squares) {
    if (sq < 32) lo |= 1 << sq
    else hi |= 1 << (sq - 32)
  }
  return { lo, hi }
}

/** The squares in a set, lowest first. */
export function squaresOf({ lo, hi }: Bits): number[] {
  const squares: number[] = []
  while (lo !== 0 || hi !== 0) {
    const sq = lowest(lo, hi)
    squares.push(sq)
    if (sq < 32) lo &= ~(1 << sq)
    else hi &= ~(1 << (sq - 32))
  }
  return squares
}

const D4 = 27
const E4 = 28
const D5 = 35
const E5 = 36

export function createGame(): GameState {
  return {
    discs: [bitsOf([D5, E4]), bitsOf([D4, E5])],
    current: BLACK,
    over: false,
    winner: null,
    turn: 0,
    last: null,
  }
}

/**
 * A position from a picture of the board, for tests and puzzles: eight
 * rows of eight, top row first, `x` for black, `o` for white, `.` for
 * empty. Whitespace is ignored. The game is over if neither side can move.
 */
export function fromDiagram(diagram: string, current: Player = BLACK): GameState {
  const cells = diagram.replace(/\s+/g, '')
  if (cells.length !== 64) throw new Error(`A board has 64 squares, not ${cells.length}`)
  const black: number[] = []
  const white: number[] = []
  for (let sq = 0; sq < 64; sq++) {
    if (cells[sq] === 'x') black.push(sq)
    else if (cells[sq] === 'o') white.push(sq)
  }
  const discs: [Bits, Bits] = [bitsOf(black), bitsOf(white)]
  const base: GameState = { discs, current, over: false, winner: null, turn: black.length + white.length - 4, last: null }
  if (hasMove(base, current)) return base
  if (hasMove(base, other(current))) return { ...base, current: other(current) }
  return finish(base)
}

/** Black's and White's discs on the board. */
export function discCount(state: GameState): [number, number] {
  const [b, w] = state.discs
  return [count(b.lo, b.hi), count(w.lo, w.hi)]
}

/** Who's on each square, a1 first. */
export function cells(state: GameState): (Player | null)[] {
  const [b, w] = state.discs
  return Array.from({ length: 64 }, (_, sq) => (has(b.lo, b.hi, sq) ? BLACK : has(w.lo, w.hi, sq) ? WHITE : null))
}

function movesFor(state: GameState, player: Player): Bits {
  const p = state.discs[player]
  const o = state.discs[other(player)]
  moves(p.lo, p.hi, o.lo, o.hi)
  return { lo: out.lo, hi: out.hi }
}

function hasMove(state: GameState, player: Player): boolean {
  const m = movesFor(state, player)
  return m.lo !== 0 || m.hi !== 0
}

/** The squares the player to move can play, lowest first. None once the game is over. */
export function legalMoves(state: GameState): number[] {
  if (state.over) return []
  return squaresOf(movesFor(state, state.current))
}

export function isLegal(state: GameState, square: number): boolean {
  if (state.over || !Number.isInteger(square) || square < 0 || square > 63) return false
  const m = movesFor(state, state.current)
  return has(m.lo, m.hi, square)
}

/** The final score, empty squares to the winner. */
export function finalScore(state: GameState): [number, number] {
  const [black, white] = discCount(state)
  const empty = 64 - black - white
  if (black > white) return [black + empty, white]
  if (white > black) return [black, white + empty]
  return [black, white]
}

function finish(state: GameState): GameState {
  const [black, white] = discCount(state)
  return { ...state, over: true, winner: black > white ? BLACK : white > black ? WHITE : null }
}

/** Steps from the new disc to a flipped one: the ring it's in. */
export const distance = (from: number, to: number) => Math.max(Math.abs(rowOf(from) - rowOf(to)), Math.abs(colOf(from) - colOf(to)))

/** Play a disc on `square` for the player to move. Throws on an illegal move. */
export function apply(state: GameState, square: number): { state: GameState; events: GameEvent[] } {
  if (!isLegal(state, square)) throw new Error(`Illegal move: ${Number.isInteger(square) && square >= 0 && square < 64 ? squareName(square) : square}`)
  const player = state.current
  const p = state.discs[player]
  const o = state.discs[other(player)]
  flips(p.lo, p.hi, o.lo, o.hi, square)
  const fLo = out.lo
  const fHi = out.hi
  const placedLo = square < 32 ? 1 << square : 0
  const placedHi = square < 32 ? 0 : 1 << (square - 32)
  const mine: Bits = { lo: p.lo | fLo | placedLo, hi: p.hi | fHi | placedHi }
  const theirs: Bits = { lo: o.lo & ~fLo, hi: o.hi & ~fHi }
  const discs: [Bits, Bits] = player === BLACK ? [mine, theirs] : [theirs, mine]
  const flipped = squaresOf({ lo: fLo, hi: fHi }).sort((a, b) => distance(square, a) - distance(square, b) || a - b)

  const events: GameEvent[] = [
    { type: 'placed', player, square },
    { type: 'flipped', player, squares: flipped },
  ]
  let next: GameState = { discs, current: other(player), over: false, winner: null, turn: state.turn + 1, last: square }
  if (!hasMove(next, next.current)) {
    if (hasMove(next, player)) {
      events.push({ type: 'passed', player: next.current })
      next = { ...next, current: player }
    } else {
      next = finish(next)
      events.push({ type: 'ended', winner: next.winner, score: finalScore(next) })
    }
  }
  return { state: next, events }
}

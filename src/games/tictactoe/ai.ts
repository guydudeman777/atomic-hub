/**
 * Tic-Tac-Toe AI.
 *
 * Classic is small enough to solve outright. `classicValues` works out
 * every move's result with perfect play from both sides, remembering each
 * position it has seen (there are fewer than 6,000). Wins count for more
 * the sooner they come, so a perfect player finishes a game rather than
 * toying with it. Among the moves that keep the best result, it picks the
 * one that leaves the other side the most ways to go wrong: it can't beat
 * a perfect opponent, but it sets every trap there is.
 *
 * Ultimate is far too big for that, so it runs Monte Carlo tree search
 * (UCT): it plays thousands of quick games out from the position, grows a
 * tree toward the moves that win most often, and plays the move it looked
 * at most. Stronger opponents get more playouts, and better ones: a
 * playout that can win the game in one, or take a small grid, does so.
 * The search runs in short slices between frames (`thinkMove`), so the
 * table keeps moving while it thinks.
 *
 * Weaker opponents miss wins and blocks now and then, and sometimes play
 * without looking.
 */

import { type Rng, pick } from '../../core/rng'
import { FULL, type GameState, LINE_IN, type Player, apply, legalMoves, other, threats } from './engine'

export interface AiProfile {
  classic: {
    /** Chance of seeing a win in one, and of seeing the other side's and blocking it. */
    seesWin: number
    seesBlock: number
    /** Chance on any other move of playing without looking: any open square. */
    lapse: number
  }
  ultimate: {
    /** The most playouts for one move. */
    playouts: number
    /** And the most time, in ms, so a slow phone doesn't keep you waiting. */
    timeMs: number
    /** Playouts take a win in one, and usually a small grid, when there's one to take. */
    smart: boolean
    /** Chance of a careless move: any legal square, at random. */
    blunder: number
  }
}

// ---- Classic: solved ---------------------------------------------------------------

const bit = (i: number) => 1 << i

const popcount = (mask: number) => {
  let n = 0
  for (let m = mask; m; m &= m - 1) n++
  return n
}

/** Each position's value for the player to move, by X's and O's marks. */
const memo = new Map<number, number>()

/** What it's worth to the player to move, with perfect play: 10 − marks for a win, the same negated for a loss, 0 for a draw. */
function negamax(mine: number, theirs: number): number {
  const key = mine | (theirs << 9)
  const known = memo.get(key)
  if (known !== undefined) return known
  const empty = FULL & ~(mine | theirs)
  let best = -Infinity
  for (let c = 0; c < 9; c++) {
    if (!(empty & bit(c))) continue
    best = Math.max(best, moveValue(mine, theirs, c))
  }
  if (best === -Infinity) best = 0
  memo.set(key, best)
  return best
}

function moveValue(mine: number, theirs: number, c: number): number {
  const after = mine | bit(c)
  if (LINE_IN[after] >= 0) return 10 - popcount(after | theirs)
  if ((after | theirs) === FULL) return 0
  return -negamax(theirs, after)
}

/** Every Classic move with its value for the player making it, under perfect play. */
export function classicValues(state: GameState): { square: number; value: number }[] {
  const mine = state.marks[state.current][0]
  const theirs = state.marks[other(state.current)][0]
  return legalMoves(state).map((square) => ({ square, value: moveValue(mine, theirs, square) }))
}

/** How many of the other side's replies would throw away their best result. */
function trapsAfter(state: GameState, square: number): number {
  const next = apply(state, square).state
  if (next.over) return 0
  const replies = classicValues(next)
  const best = Math.max(...replies.map((r) => r.value))
  return replies.filter((r) => r.value < best).length
}

/** A perfect move: the best result, and of those, the most chances for the other side to go wrong. */
function perfectClassic(state: GameState, rng: Rng): number {
  const values = classicValues(state)
  const best = Math.max(...values.map((v) => v.value))
  const keepers = values.filter((v) => v.value === best).map((v) => ({ square: v.square, traps: trapsAfter(state, v.square) }))
  const most = Math.max(...keepers.map((k) => k.traps))
  return pick(keepers.filter((k) => k.traps === most), rng).square
}

function chooseClassic(state: GameState, p: AiProfile['classic'], rng: Rng): number {
  const moves = legalMoves(state)
  const mine = state.marks[state.current][0]
  const win = moves.find((c) => LINE_IN[mine | bit(c)] >= 0)
  if (win !== undefined && rng() < p.seesWin) return win
  const blocks = threats(state, other(state.current)).filter((c) => moves.includes(c))
  if (blocks.length > 0 && win === undefined && rng() < p.seesBlock) return pick(blocks, rng)
  if (rng() < p.lapse) return pick(moves, rng)
  return perfectClassic(state, rng)
}

// ---- Ultimate: Monte Carlo tree search ------------------------------------------------

/** A game of Ultimate in flat, mutable form, for playing out thousands of times a second. */
class Sim {
  readonly marks = [new Int32Array(9), new Int32Array(9)] as const
  /** Grids won by each player, and grids that are won or full. */
  won = [0, 0]
  closed = 0
  player: Player = 0
  /** The grid the player to move is sent to, or -1 for anywhere. */
  forced = -1
  /** -1 while playing, else the winner, or 2 for a draw. */
  result = -1

  load(state: GameState) {
    for (const p of [0, 1] as const) {
      this.marks[p].set(state.marks[p])
      this.won[p] = 0
    }
    this.closed = 0
    state.grids.forEach((owner, g) => {
      if (owner === null) return
      this.closed |= bit(g)
      if (owner !== 'draw') this.won[owner] |= bit(g)
    })
    this.player = state.current
    this.forced = state.forced ?? -1
    this.result = state.over ? (state.winner ?? 2) : -1
  }

  copy(from: Sim) {
    for (const p of [0, 1] as const) {
      this.marks[p].set(from.marks[p])
      this.won[p] = from.won[p]
    }
    this.closed = from.closed
    this.player = from.player
    this.forced = from.forced
    this.result = from.result
  }

  /** Legal moves into `out`; returns how many. */
  moves(out: Int32Array): number {
    let n = 0
    const [xs, os] = this.marks
    if (this.forced >= 0) {
      const g = this.forced
      const empty = FULL & ~(xs[g] | os[g])
      for (let c = 0; c < 9; c++) if (empty & bit(c)) out[n++] = g * 9 + c
      return n
    }
    for (let g = 0; g < 9; g++) {
      if (this.closed & bit(g)) continue
      const empty = FULL & ~(xs[g] | os[g])
      for (let c = 0; c < 9; c++) if (empty & bit(c)) out[n++] = g * 9 + c
    }
    return n
  }

  play(square: number) {
    const g = (square / 9) | 0
    const c = square - g * 9
    const p = this.player
    const mine = this.marks[p]
    mine[g] |= bit(c)
    if (LINE_IN[mine[g]] >= 0) {
      this.closed |= bit(g)
      this.won[p] |= bit(g)
      if (LINE_IN[this.won[p]] >= 0) this.result = p
    } else if ((mine[g] | this.marks[1 - p][g]) === FULL) {
      this.closed |= bit(g)
    }
    if (this.result < 0 && this.closed === FULL) this.result = 2
    this.forced = this.closed & bit(c) ? -1 : c
    this.player = other(p)
  }

  /** Whether `square` would win its grid, and whether that wins the game, for the player to move. */
  takes(square: number): 0 | 1 | 2 {
    const g = (square / 9) | 0
    const p = this.player
    if (LINE_IN[this.marks[p][g] | bit(square - g * 9)] < 0) return 0
    return LINE_IN[this.won[p] | bit(g)] >= 0 ? 2 : 1
  }
}

interface Node {
  move: number
  parent: Node | null
  children: Node[]
  untried: number[]
  visits: number
  /** Playouts won by the player who made `move`, a draw counting half. */
  wins: number
  /** Who made `move`. */
  mover: Player
}

/** How keen the search is to look at moves it knows less about. */
const EXPLORE = 1.1

const buffer = new Int32Array(81)

function untriedOf(sim: Sim): number[] {
  if (sim.result >= 0) return []
  const n = sim.moves(buffer)
  return Array.from(buffer.subarray(0, n))
}

/** One search tree, grown a slice at a time. */
export class Search {
  readonly root: Node
  playouts = 0
  private readonly start = new Sim()
  private readonly sim = new Sim()
  private readonly smart: boolean
  private readonly rng: Rng

  constructor(state: GameState, smart: boolean, rng: Rng) {
    this.start.load(state)
    this.smart = smart
    this.rng = rng
    this.root = { move: -1, parent: null, children: [], untried: untriedOf(this.start), visits: 0, wins: 0, mover: other(state.current) }
  }

  /** Run `count` playouts. */
  run(count: number) {
    const { sim, rng } = this
    for (let i = 0; i < count; i++) {
      sim.copy(this.start)
      let node = this.root
      // Down the tree, by the best balance of results and curiosity.
      while (node.untried.length === 0 && node.children.length > 0) {
        const log = Math.log(node.visits)
        let best = node.children[0]
        let bestScore = -Infinity
        for (const child of node.children) {
          const score = child.wins / child.visits + EXPLORE * Math.sqrt(log / child.visits)
          if (score > bestScore) {
            bestScore = score
            best = child
          }
        }
        node = best
        sim.play(node.move)
      }
      // One new move onto the tree.
      if (node.untried.length > 0) {
        const k = Math.floor(rng() * node.untried.length)
        const move = node.untried[k]
        node.untried[k] = node.untried[node.untried.length - 1]
        node.untried.pop()
        const mover = sim.player
        sim.play(move)
        const child: Node = { move, parent: node, children: [], untried: untriedOf(sim), visits: 0, wins: 0, mover }
        node.children.push(child)
        node = child
      }
      // Then a quick game to the end.
      const result = this.playout()
      for (let n: Node | null = node; n; n = n.parent) {
        n.visits++
        n.wins += result === 2 ? 0.5 : result === n.mover ? 1 : 0
      }
      this.playouts++
    }
  }

  private playout(): number {
    const { sim, rng, smart } = this
    while (sim.result < 0) {
      const n = sim.moves(buffer)
      let move = buffer[Math.floor(rng() * n)]
      if (smart) {
        let grid = -1
        for (let i = 0; i < n; i++) {
          const takes = sim.takes(buffer[i])
          if (takes === 2) {
            grid = buffer[i]
            break
          }
          if (takes === 1 && grid < 0) grid = buffer[i]
        }
        if (grid >= 0 && (sim.takes(grid) === 2 || rng() < 0.6)) move = grid
      }
      sim.play(move)
    }
    return sim.result
  }

  /** The move looked at most. */
  best(): number {
    let best = this.root.children[0]
    for (const child of this.root.children) if (child.visits > best.visits) best = child
    return best?.move ?? this.root.untried[0]
  }
}

/** A move that wins the game outright, if there is one. */
function winningMove(state: GameState): number | undefined {
  const sim = new Sim()
  sim.load(state)
  return legalMoves(state).find((sq) => sim.takes(sq) === 2)
}

/** Whether to skip the search: a blunder, a won game to finish, or only one move. */
function quickUltimate(state: GameState, p: AiProfile['ultimate'], rng: Rng): number | null {
  const moves = legalMoves(state)
  if (moves.length === 1) return moves[0]
  if (rng() < p.blunder) return pick(moves, rng)
  return winningMove(state) ?? null
}

// ---- Choosing ------------------------------------------------------------------------

/** Pick a move, all at once. For tests and self-play; the table uses `thinkMove`. */
export function chooseMove(state: GameState, profile: AiProfile, rng: Rng): number {
  if (state.variant === 'classic') return chooseClassic(state, profile.classic, rng)
  const quick = quickUltimate(state, profile.ultimate, rng)
  if (quick !== null) return quick
  const search = new Search(state, profile.ultimate.smart, rng)
  const deadline = performance.now() + profile.ultimate.timeMs
  while (search.playouts < profile.ultimate.playouts && performance.now() < deadline) search.run(Math.min(200, profile.ultimate.playouts - search.playouts))
  return search.best()
}

/** Each slice of thinking, before the page gets a turn. */
const SLICE_MS = 10

/**
 * Pick a move without holding up the page: the search runs in short
 * slices. `cancelled` is checked between them, for a game left mid-think.
 */
export function thinkMove(state: GameState, profile: AiProfile, rng: Rng, cancelled: () => boolean): Promise<number | null> {
  if (state.variant === 'classic') return Promise.resolve(chooseClassic(state, profile.classic, rng))
  const quick = quickUltimate(state, profile.ultimate, rng)
  if (quick !== null) return Promise.resolve(quick)
  const { playouts, timeMs, smart } = profile.ultimate
  const search = new Search(state, smart, rng)
  const deadline = performance.now() + timeMs
  return new Promise((resolve) => {
    const slice = () => {
      if (cancelled()) {
        resolve(null)
        return
      }
      const until = Math.min(deadline, performance.now() + SLICE_MS)
      while (search.playouts < playouts && performance.now() < until) search.run(50)
      if (search.playouts >= playouts || performance.now() >= deadline) resolve(search.best())
      else setTimeout(slice, 0)
    }
    slice()
  })
}

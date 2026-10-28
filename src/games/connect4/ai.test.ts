import { describe, expect, it } from 'vitest'
import { type Rng, createRng, pick } from '../../core/rng'
import { type AiProfile, bitboards, chooseMove, hasFour, solveExactly, threatsOnBits } from './ai'
import { OPPONENTS } from './content'
import { type GameState, type Player, apply, createGame, fromDiagram, isLegal, legalMoves, winningSquares } from './engine'

const careful = (p: AiProfile): AiProfile => ({ ...p, blunder: 0 })
/** A short clock, so tests stay quick. */
const quick = (p: AiProfile): AiProfile => ({ ...p, timeMs: Math.min(p.timeMs, 40) })

function randomPosition(seed: number, plies: number): GameState {
  const rng = createRng(seed)
  let state = createGame()
  for (let i = 0; i < plies && !state.over; i++) state = apply(state, pick(legalMoves(state), rng)).state
  return state
}

/** The result of a move with perfect play after it, for the side making it: 1, 0 or -1. */
function valueOf(state: GameState, col: number, memo: Map<string, number>): number {
  const next = apply(state, col).state
  return next.over ? (next.winner === null ? 0 : 1) : -minimax(next, memo)
}

/** The result with perfect play for the side to move, the slow way through the engine. */
function minimax(state: GameState, memo = new Map<string, number>()): number {
  const key = state.board.map((c) => (c === null ? '.' : c)).join('')
  const seen = memo.get(key)
  if (seen !== undefined) return seen
  let best = -1
  for (const col of legalMoves(state)) {
    best = Math.max(best, valueOf(state, col, memo))
    if (best === 1) break
  }
  memo.set(key, best)
  return best
}

function playOut(profiles: [AiProfile, AiProfile], start: GameState, rng: Rng): GameState {
  let state = start
  while (!state.over) {
    const move = chooseMove(state, profiles[state.current], rng)
    expect(isLegal(state, move)).toBe(true)
    state = apply(state, move).state
  }
  return state
}

describe('Connect Four bitboards', () => {
  it('agree with the engine on every line of four and every threat, over random games', () => {
    const rng = createRng(5)
    for (let g = 0; g < 200; g++) {
      let state = createGame()
      while (!state.over) {
        state = apply(state, pick(legalMoves(state), rng)).state
        const { red, yellow } = bitboards(state)
        expect(hasFour(red[0], red[1]), `game ${g}, turn ${state.turn}`).toBe(state.winner === 0)
        expect(hasFour(yellow[0], yellow[1])).toBe(state.winner === 1)
        for (const p of [0, 1] as Player[]) expect(threatsOnBits(state, p)).toEqual(winningSquares(state, p))
      }
    }
  })
})

describe('Connect Four AI', () => {
  it('takes a win when it has one', () => {
    // Red to drop: column 4 finishes the bottom row.
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      oo.....
      xxx..o.`)
    for (const o of OPPONENTS) expect(chooseMove(state, quick(careful(o.profile)), createRng(1)), o.name).toBe(3)
  })

  it('blocks the other side’s win', () => {
    // Yellow to drop, and Red wins in column 4 unless it's filled.
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      ......o
      xxx...o`)
    for (const o of OPPONENTS) expect(chooseMove(state, quick(careful(o.profile)), createRng(2)), o.name).toBe(3)
  })

  it('doesn’t drop just under a hole the other side wins with', () => {
    // Yellow would finish row 2 in column 5, so Red leaves column 5 alone.
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      xooo..x
      oxxo..x`)
    expect(state.current).toBe(0)
    for (const o of OPPONENTS) expect(chooseMove(state, quick(careful(o.profile)), createRng(3)), o.name).not.toBe(4)
  })

  it('makes two threats at once, a win the other side can’t stop', () => {
    // Red to drop: column 3 leaves open holes at both ends of the bottom row.
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      ......o
      ...xx.o`)
    for (const o of OPPONENTS) expect(chooseMove(state, quick(careful(o.profile)), createRng(4)), o.name).toBe(2)
  })

  it('solves endings exactly', () => {
    let checked = 0
    for (let seed = 0; checked < 25 && seed < 400; seed++) {
      const state = randomPosition(300 + seed, 27 + (seed % 5))
      if (state.over) continue
      expect(solveExactly(state), `seed ${seed}`).toBe(minimax(state))
      checked++
    }
    expect(checked).toBe(25)
  })

  it('plays the winning line in the ending, when there is one', () => {
    const top = OPPONENTS[OPPONENTS.length - 1]
    let checked = 0
    for (let seed = 0; seed < 400 && checked < 10; seed++) {
      const state = randomPosition(700 + seed, 30)
      const memo = new Map<string, number>()
      if (state.over || minimax(state, memo) !== 1) continue
      // Only positions where some moves throw the win away.
      const values = legalMoves(state).map((col) => valueOf(state, col, memo))
      if (values.every((v) => v === 1)) continue
      const move = chooseMove(state, quick(careful(top.profile)), createRng(seed))
      expect(values[legalMoves(state).indexOf(move)], `seed ${seed}`).toBe(1)
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('every opponent plays only legal moves, whole games through', () => {
    const rng = createRng(3)
    for (const o of OPPONENTS) {
      const state = playOut([quick(o.profile), quick(o.profile)], createGame(), rng)
      expect(state.over).toBe(true)
    }
  })

  // A smoke check with a handful of openings; the README's numbers come from far more games.
  it('each opponent on the ladder beats the one before most of the time', { timeout: 120_000 }, () => {
    const rng = createRng(11)
    for (let i = 1; i < OPPONENTS.length; i++) {
      const strong = quick(OPPONENTS[i].profile)
      const weak = quick(OPPONENTS[i - 1].profile)
      let points = 0
      const games = 8
      for (let g = 0; g < games; g++) {
        const start = apply(createGame(), g % 7).state
        const color = (g % 2) as Player
        const end = playOut(color === 0 ? [strong, weak] : [weak, strong], start, rng)
        points += end.winner === color ? 1 : end.winner === null ? 0.5 : 0
      }
      expect(points, `${OPPONENTS[i].name} against ${OPPONENTS[i - 1].name}`).toBeGreaterThanOrEqual(5)
    }
  })
})

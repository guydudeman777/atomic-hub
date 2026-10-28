import { describe, expect, it } from 'vitest'
import { type Rng, createRng, pick } from '../../core/rng'
import { type AiProfile, chooseMove, solveExactly } from './ai'
import { OPPONENTS } from './content'
import { BLACK, type GameState, type Player, apply, createGame, finalScore, fromDiagram, isLegal, legalMoves, parseSquare } from './engine'

const careful = (p: AiProfile): AiProfile => ({ ...p, blunder: 0 })
/** The strongest profile with a short clock, so tests stay quick. */
const quick = (p: AiProfile): AiProfile => ({ ...p, timeMs: Math.min(p.timeMs, 30) })

function randomPosition(seed: number, plies: number): GameState {
  const rng = createRng(seed)
  let state = createGame()
  for (let i = 0; i < plies && !state.over; i++) state = apply(state, pick(legalMoves(state), rng)).state
  return state
}

/** Black's final margin with perfect play from here, worked out the slow way through the engine. */
function minimax(state: GameState): number {
  if (state.over) {
    const [black, white] = finalScore(state)
    return black - white
  }
  const values = legalMoves(state).map((sq) => minimax(apply(state, sq).state))
  return state.current === BLACK ? Math.max(...values) : Math.min(...values)
}

const blackMargin = (state: GameState, sideToMove: number) => (state.current === BLACK ? sideToMove : -sideToMove)

function playOut(profiles: [AiProfile, AiProfile], start: GameState, rng: Rng): GameState {
  let state = start
  while (!state.over) {
    const move = chooseMove(state, profiles[state.current], rng)
    expect(isLegal(state, move)).toBe(true)
    state = apply(state, move).state
  }
  return state
}

const winner = (state: GameState): Player | null => {
  const [black, white] = finalScore(state)
  return black > white ? 0 : white > black ? 1 : null
}

describe('Reversi AI', () => {
  it('takes a corner before the other side can', () => {
    // Black can take a1 by turning b1. Leave it, and White takes it through b2.
    const state = fromDiagram(`
      .ox.....
      .x......
      ..o.....
      ...ox...
      ...xo...
      ........
      ........
      ........`)
    expect(legalMoves(state).length).toBeGreaterThan(3)
    for (const o of OPPONENTS.slice(1)) {
      expect(chooseMove(state, quick(careful(o.profile)), createRng(1)), o.name).toBe(parseSquare('a1'))
    }
  })

  it('stays off the square next to an empty corner', () => {
    // b2 runs the diagonal into White's f6 and hands over a1; g7 gives up h8.
    const state = fromDiagram(`
      ........
      ........
      ..o.....
      ...oo...
      ...ox...
      ....xo..
      ........
      ........`)
    const traps = ['b2', 'g7'].map((name) => parseSquare(name)!)
    for (const sq of traps) expect(isLegal(state, sq)).toBe(true)
    for (const o of OPPONENTS.slice(2)) {
      expect(traps, o.name).not.toContain(chooseMove(state, quick(careful(o.profile)), createRng(1)))
    }
  })

  it('solves endings exactly', () => {
    for (let seed = 0; seed < 12; seed++) {
      const state = randomPosition(500 + seed, 52)
      if (state.over) continue
      expect(blackMargin(state, solveExactly(state)), `seed ${seed}`).toBe(minimax(state))
    }
  })

  it('plays the best line in the ending', () => {
    let checked = 0
    for (let seed = 0; seed < 40 && checked < 8; seed++) {
      const state = randomPosition(900 + seed, 52)
      if (state.over) continue
      const best = minimax(state)
      const options = legalMoves(state).map((sq) => ({ sq, value: minimax(apply(state, sq).state) }))
      // Only positions where some moves are worse than others.
      if (options.every((o) => o.value === best)) continue
      for (const o of OPPONENTS.slice(2)) {
        const move = chooseMove(state, careful(o.profile), createRng(seed))
        expect(options.find((x) => x.sq === move)?.value, `${o.name}, seed ${seed}`).toBe(best)
      }
      checked++
    }
    expect(checked).toBeGreaterThan(3)
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
      let wins = 0
      const games = 8
      for (let g = 0; g < games; g++) {
        const start = randomPosition(70 + g, 2 + (g % 3))
        const color: Player = (g % 2) as Player
        const end = playOut(color === 0 ? [strong, weak] : [weak, strong], start, rng)
        if (winner(end) === color) wins++
      }
      expect(wins, `${OPPONENTS[i].name} against ${OPPONENTS[i - 1].name}`).toBeGreaterThanOrEqual(5)
    }
  })
})

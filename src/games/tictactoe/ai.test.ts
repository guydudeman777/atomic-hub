import { describe, expect, it } from 'vitest'
import { type Rng, createRng, pick } from '../../core/rng'
import { type AiProfile, chooseMove, classicValues, thinkMove } from './ai'
import { OPPONENTS, opponentById } from './content'
import { type GameState, type Player, type Variant, X, apply, cells, createGame, fromDiagram, isLegal, legalMoves, other } from './engine'

const whitlock = opponentById('whitlock')!.profile
/** Never misses a win or a block, and never plays without looking. */
const careful = (p: AiProfile): AiProfile => ({ classic: { seesWin: 1, seesBlock: 1, lapse: 0 }, ultimate: { ...p.ultimate, blunder: 0 } })
/** Fewer playouts, so tests stay quick. */
const quick = (p: AiProfile, playouts = 400): AiProfile => ({ ...p, ultimate: { ...p.ultimate, playouts: Math.min(p.ultimate.playouts, playouts) } })

const seen = new Map<string, number>()

/** The result for the player to move with perfect play, the slow way through the engine: 1 win, 0 draw, −1 loss. */
function minimax(state: GameState): number {
  if (state.over) return state.winner === null ? 0 : -1
  const key = cells(state).join()
  let value = seen.get(key)
  if (value === undefined) seen.set(key, (value = Math.max(...legalMoves(state).map((sq) => -minimax(apply(state, sq).state)))))
  return value
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

describe('Classic AI', () => {
  it('knows every move’s result with perfect play', () => {
    const rng = createRng(4)
    for (let game = 0; game < 40; game++) {
      let state = createGame()
      while (!state.over) {
        for (const { square, value } of classicValues(state)) {
          const after = apply(state, square).state
          const exact = after.over ? (after.winner === null ? 0 : 1) : -minimax(after)
          expect(Math.sign(value) + 0, `move ${square}`).toBe(exact + 0)
        }
        state = apply(state, pick(legalMoves(state), rng)).state
      }
    }
  })

  it('plays perfectly: never loses, from any position it could reach, against any reply', () => {
    // Every line of play with Whitlock on one side and every possible reply on the other.
    const rng = createRng(9)
    let games = 0
    const explore = (state: GameState, me: Player) => {
      if (state.over) {
        expect(state.winner).not.toBe(other(me))
        games++
        return
      }
      if (state.current === me) {
        // Each of the moves he might pick keeps the best result there is.
        const values = classicValues(state)
        const best = Math.max(...values.map((v) => v.value))
        const move = chooseMove(state, whitlock, rng)
        expect(values.find((v) => v.square === move)?.value).toBe(best)
        explore(apply(state, move).state, me)
      } else {
        for (const sq of legalMoves(state)) explore(apply(state, sq).state, me)
      }
    }
    explore(createGame(), X)
    explore(createGame(), other(X))
    expect(games).toBeGreaterThan(100)
  })

  it('takes a win in one, and blocks one', () => {
    // X to move, with two in the top row.
    const win = fromDiagram(`
      xx.
      .o.
      .o.`)
    // X to move, and O is one from three down the middle.
    const block = fromDiagram(`
      x..
      .o.
      .ox`)
    expect(win.current).toBe(X)
    expect(block.current).toBe(X)
    for (const o of OPPONENTS) {
      expect(chooseMove(win, careful(o.profile), createRng(1)), o.name).toBe(2)
      expect(chooseMove(block, careful(o.profile), createRng(1)), o.name).toBe(1)
    }
  })

  it('sets traps among the moves that draw: the corner opening', () => {
    // From the empty board every move draws; a corner leaves O the most ways to lose.
    const first = chooseMove(createGame(), whitlock, createRng(3))
    expect([0, 2, 6, 8]).toContain(first)
  })

  it('the paperboy loses to perfect play far more than he draws', () => {
    const rng = createRng(5)
    const skip = OPPONENTS[0].profile
    let lost = 0
    for (let g = 0; g < 100; g++) {
      const end = playOut(g % 2 === 0 ? [whitlock, skip] : [skip, whitlock], createGame(), rng)
      if (end.winner === (g % 2 === 0 ? 1 : 0)) throw new Error('Whitlock lost')
      if (end.winner !== null) lost++
    }
    expect(lost).toBeGreaterThan(50)
  })
})

describe('Ultimate AI', () => {
  it('takes three grids in a row when it can', () => {
    const state = fromDiagram(`
      xxx o.. o..
      ... o.. ...
      ... ... o..
      o.. x.. ...
      o.. .x. ...
      ... ..x ...
      ... ... x.o
      ... ... .x.
      ... ... o..`, { forced: 8 })
    for (const o of OPPONENTS) expect(chooseMove(state, quick(careful(o.profile)), createRng(2)), o.name).toBe(80)
  })

  it('every opponent plays only legal moves, whole games through', () => {
    const rng = createRng(6)
    for (const o of OPPONENTS) {
      const state = playOut([quick(o.profile, 200), quick(o.profile, 200)], createGame('ultimate'), rng)
      expect(state.over).toBe(true)
    }
  })

  it('thinks in slices, and stops when the game is left', async () => {
    const state = apply(createGame('ultimate'), 40).state
    const move = await thinkMove(state, quick(whitlock, 2000), createRng(1), () => false)
    expect(isLegal(state, move!)).toBe(true)
    let asked = 0
    const none = await thinkMove(state, whitlock, createRng(1), () => ++asked > 2)
    expect(none).toBeNull()
  })

  // A smoke check; the README's numbers come from far more games, at full strength.
  it('the top of the ladder beats the bottom at Ultimate', { timeout: 60_000 }, () => {
    const rng = createRng(8)
    const strong = quick(whitlock, 3000)
    const weak = OPPONENTS[0].profile
    let wins = 0
    for (let g = 0; g < 6; g++) {
      const strongFirst = g % 2 === 0
      const end = playOut(strongFirst ? [strong, weak] : [weak, strong], createGame('ultimate'), rng)
      if (end.winner === (strongFirst ? 0 : 1)) wins++
    }
    expect(wins).toBeGreaterThanOrEqual(5)
  })
})

it('every opponent has a profile for both games', () => {
  for (const o of OPPONENTS) {
    for (const variant of ['classic', 'ultimate'] as Variant[]) {
      const move = chooseMove(createGame(variant), quick(o.profile, 100), createRng(1))
      expect(isLegal(createGame(variant), move)).toBe(true)
    }
  }
})

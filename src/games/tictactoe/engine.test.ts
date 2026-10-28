import { describe, expect, it } from 'vitest'
import { createRng, pick } from '../../core/rng'
import {
  type GameEvent,
  type GameState,
  type Variant,
  LINES,
  O,
  X,
  apply,
  cells,
  createGame,
  fromDiagram,
  gridsWon,
  isLegal,
  legalMoves,
  lineName,
  playableGrids,
  position,
  squareAt,
  squareName,
  threats,
} from './engine'

/** Play squares in order from a new game (or the given one). */
function play(squares: number[], state: GameState = createGame()): { state: GameState; events: GameEvent[] } {
  let events: GameEvent[] = []
  for (const sq of squares) ({ state, events } = apply(state, sq))
  return { state, events }
}

/** The 9×9 square at a grid and a cell. */
const u = (grid: number, cell: number) => grid * 9 + cell

describe('Classic', () => {
  it('starts empty, with X to move anywhere', () => {
    const state = createGame()
    expect(state.current).toBe(X)
    expect(legalMoves(state)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(cells(state)).toEqual(Array(9).fill(null))
  })

  it('takes turns, and an occupied square is not a move', () => {
    const { state } = play([4])
    expect(state.current).toBe(O)
    expect(cells(state)[4]).toBe(X)
    expect(isLegal(state, 4)).toBe(false)
    expect(() => apply(state, 4)).toThrow()
    expect(() => apply(state, 9)).toThrow()
    expect(legalMoves(state)).not.toContain(4)
  })

  it('three in a row wins, across, down or on a diagonal', () => {
    for (const [moves, line] of [
      [[0, 3, 1, 4, 2], [0, 1, 2]],
      [[1, 0, 4, 2, 7], [1, 4, 7]],
      [[2, 0, 4, 1, 6], [2, 4, 6]],
    ] as const) {
      const { state, events } = play([...moves])
      expect(state.over).toBe(true)
      expect(state.winner).toBe(X)
      expect(state.line).toEqual(line)
      expect(events.at(-1)).toEqual({ type: 'ended', winner: X, line })
      expect(legalMoves(state)).toEqual([])
    }
    const { state } = play([0, 4, 1, 2, 7, 6])
    expect(state.winner).toBe(O)
    expect(state.line).toEqual([2, 4, 6])
  })

  it('a full grid with no line is a cat’s game', () => {
    // X O X / X O O / O X X
    const { state, events } = play([0, 1, 2, 4, 3, 5, 7, 6, 8])
    expect(state.over).toBe(true)
    expect(state.winner).toBeNull()
    expect(state.line).toBeNull()
    expect(events.at(-1)).toEqual({ type: 'ended', winner: null, line: null })
  })

  it('reads a position from a picture', () => {
    const state = fromDiagram(`
      x.o
      .x.
      ...`)
    expect(state.current).toBe(O)
    expect(cells(state)).toEqual([X, null, O, null, X, null, null, null, null])
    expect(threats(state, X)).toEqual([8])
    expect(threats(state, O)).toEqual([])
    expect(fromDiagram('xxx oo. ...').winner).toBe(X)
  })

  it('names squares, and where a line runs', () => {
    expect(squareName('classic', 4)).toBe('the center')
    expect(squareName('classic', 2)).toBe('the top right')
    expect(LINES.map(lineName)).toEqual([
      'across the top',
      'across the middle',
      'across the bottom',
      'down the left',
      'down the middle',
      'down the right',
      'corner to corner',
      'corner to corner',
    ])
  })
})

describe('Ultimate', () => {
  it('opens anywhere on the 81 squares', () => {
    const state = createGame('ultimate')
    expect(legalMoves(state)).toHaveLength(81)
    expect(playableGrids(state)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('sends the next player to the grid matching the square played', () => {
    // X plays the top right of the center grid: O goes to the top right grid.
    const { state, events } = play([u(4, 2)], createGame('ultimate'))
    expect(state.forced).toBe(2)
    expect(events).toContainEqual({ type: 'sent', player: O, grid: 2 })
    expect(legalMoves(state)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => u(2, c)))
    expect(isLegal(state, u(4, 0))).toBe(false)
    expect(squareName('ultimate', u(4, 2))).toBe('the top right of the center grid')
  })

  it('three in a row wins a small grid, and closes it', () => {
    // X has two of grid 0's top row and is sent there.
    const pos = fromDiagram(`
      xx. ... ...
      ... ... ...
      ... ... ...
      ... o.. ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ..o
      ... ... ...`, { forced: 0 })
    expect(pos.current).toBe(X)
    const after = apply(pos, u(0, 2))
    expect(after.events).toContainEqual({ type: 'grid-won', player: X, grid: 0, line: [0, 1, 2] })
    expect(after.state.grids[0]).toBe(X)
    expect(gridsWon(after.state)).toEqual([1, 0])
    // The top right square sends O to grid 2.
    expect(after.state.forced).toBe(2)
    expect(isLegal(after.state, u(0, 3))).toBe(false)
  })

  it('sent to a closed grid, the next player may play in any open grid', () => {
    // Grid 0 is X's. O plays its grid 4's top left, which would send X to grid 0.
    const pos = fromDiagram(`
      xxx ... ...
      o.. ... ...
      o.. ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...`, { forced: 4 })
    expect(pos.current).toBe(O)
    expect(pos.grids[0]).toBe(X)
    const { state, events } = apply(pos, u(4, 0))
    expect(events).toContainEqual({ type: 'sent', player: X, grid: null })
    expect(state.forced).toBeNull()
    expect(playableGrids(state)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(legalMoves(state).some((sq) => Math.floor(sq / 9) === 0)).toBe(false)
    expect(legalMoves(state)).toHaveLength(8 * 9 - 1)
  })

  it('a full small grid counts for nobody', () => {
    // Grid 8 has one square left, and filling it makes no line.
    const pos = fromDiagram(`
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... xox
      ... ... xoo
      ... ... ox.`, { forced: 8 })
    expect(pos.current).toBe(X)
    const { state, events } = apply(pos, u(8, 8))
    expect(events).toContainEqual({ type: 'grid-full', grid: 8 })
    expect(state.grids[8]).toBe('draw')
    // The bottom right square sends O to grid 8, which is full: O plays anywhere.
    expect(state.forced).toBeNull()
  })

  it('three small grids in a row wins the game', () => {
    // X owns grids 0 and 4, and has two of grid 8's diagonal.
    const pos = fromDiagram(`
      xxx o.. o..
      ... o.. ...
      ... ... o..
      o.. x.. ...
      o.. .x. ...
      ... ..x ...
      ... ... x.o
      ... ... .x.
      ... ... o..`, { forced: 8 })
    expect(pos.current).toBe(X)
    expect(pos.grids[0]).toBe(X)
    expect(pos.grids[4]).toBe(X)
    expect(threats(pos, X)).toEqual([8])
    const { state, events } = apply(pos, u(8, 8))
    expect(state.over).toBe(true)
    expect(state.winner).toBe(X)
    expect(state.line).toEqual([0, 4, 8])
    expect(events.map((e) => e.type)).toEqual(['placed', 'grid-won', 'ended'])
  })

  it('a board of closed grids with no line is a draw', () => {
    // Every grid is settled but the last, which has one square left; filling it makes no line anywhere.
    const pos = fromDiagram(`
      xxx ooo xxx
      ... ... ...
      ... ... ...
      xxx ooo ooo
      ... ... ...
      ... ... ...
      ooo xxx xox
      ... ... xoo
      ... ... ox.`, { forced: 8 })
    expect(pos.over).toBe(false)
    expect(pos.grids.slice(0, 8)).toEqual([X, O, X, X, O, O, O, X])
    const { state, events } = apply(pos, u(8, 8))
    expect(state.over).toBe(true)
    expect(state.winner).toBeNull()
    expect(events.at(-1)).toEqual({ type: 'ended', winner: null, line: null })
  })

  it('maps squares to the 9×9 and back', () => {
    for (let sq = 0; sq < 81; sq++) {
      const { row, col } = position('ultimate', sq)
      expect(squareAt('ultimate', row, col)).toBe(sq)
    }
    expect(position('ultimate', u(4, 4))).toEqual({ row: 4, col: 4 })
    expect(position('ultimate', u(2, 0))).toEqual({ row: 0, col: 6 })
    expect(position('ultimate', u(3, 8))).toEqual({ row: 5, col: 2 })
  })
})

describe('random games', () => {
  for (const variant of ['classic', 'ultimate'] as Variant[]) {
    it(`always end, by the rules (${variant})`, () => {
      const rng = createRng(variant === 'classic' ? 1 : 2)
      const size = variant === 'classic' ? 9 : 81
      for (let game = 0; game < 300; game++) {
        let state = createGame(variant)
        while (!state.over) {
          const moves = legalMoves(state)
          // The list matches the square-by-square check, and keeps to the grid you're sent to.
          expect(moves).toEqual(Array.from({ length: size }, (_, sq) => sq).filter((sq) => isLegal(state, sq)))
          if (state.forced !== null) expect(moves.every((sq) => Math.floor(sq / 9) === state.forced)).toBe(true)
          expect(moves.length).toBeGreaterThan(0)
          const before = state
          state = apply(state, pick(moves, rng)).state
          expect(state.turn).toBe(before.turn + 1)
          expect(cells(state).filter((c) => c !== null)).toHaveLength(state.turn)
        }
        expect(state.turn).toBeLessThanOrEqual(size)
        expect(legalMoves(state)).toEqual([])
        if (state.winner !== null) expect(state.line).toHaveLength(3)
      }
    })
  }
})

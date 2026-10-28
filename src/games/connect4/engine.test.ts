import { describe, expect, it } from 'vitest'
import { createRng, pick } from '../../core/rng'
import {
  CELLS,
  COLS,
  RED,
  ROWS,
  YELLOW,
  type GameState,
  apply,
  createGame,
  describeLine,
  fromDiagram,
  isLegal,
  landingRow,
  legalMoves,
  openSquares,
  squareOf,
  winningSquares,
} from './engine'

/** Drop checkers in these columns (1 to 7, as the rack numbers them), in turn. */
function play(...columns: number[]): GameState {
  let state = createGame()
  for (const c of columns) state = apply(state, c - 1).state
  return state
}

describe('Connect Four rules', () => {
  it('starts with an empty rack and Red to drop', () => {
    const state = createGame()
    expect(state.board.every((c) => c === null)).toBe(true)
    expect(state.current).toBe(RED)
    expect(legalMoves(state)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(state.over).toBe(false)
  })

  it('drops each checker to the lowest empty hole, and the turn passes', () => {
    const state = play(4, 4, 4)
    expect(state.board[squareOf(3, 0)]).toBe(RED)
    expect(state.board[squareOf(3, 1)]).toBe(YELLOW)
    expect(state.board[squareOf(3, 2)]).toBe(RED)
    expect(state.heights[3]).toBe(3)
    expect(state.current).toBe(YELLOW)
    expect(state.last).toBe(squareOf(3, 2))
    expect(landingRow(state, 3)).toBe(3)
    expect(state.turn).toBe(3)
  })

  it('reports the drop, and leaves the old state alone', () => {
    const before = play(1)
    const { state, events } = apply(before, 0)
    expect(events).toEqual([{ type: 'dropped', player: YELLOW, col: 0, row: 1 }])
    expect(before.heights[0]).toBe(1)
    expect(state.heights[0]).toBe(2)
  })

  it('wins four across, at the edge of the rack', () => {
    // Red along the bottom from column 4 to the right edge; Yellow stacks on top.
    const { state, events } = apply(play(4, 4, 5, 5, 6, 6), 6)
    expect(state.over).toBe(true)
    expect(state.winner).toBe(RED)
    expect(state.line).toEqual([3, 4, 5, 6])
    expect(events.at(-1)).toEqual({ type: 'ended', winner: RED, line: [3, 4, 5, 6] })
    expect(describeLine(state.line!)).toBe('across the bottom row')
  })

  it('wins four up a column', () => {
    const state = play(1, 2, 1, 2, 1, 2, 1)
    expect(state.winner).toBe(RED)
    expect(state.line).toEqual([0, 7, 14, 21])
    expect(describeLine(state.line!)).toBe('up column 1')
  })

  it('wins on the rising diagonal', () => {
    const state = fromDiagram(`
      .......
      .......
      ...x...
      ..xo...
      .xoo...
      xoox...`)
    expect(state.winner).toBe(RED)
    expect(state.line).toEqual([squareOf(0, 0), squareOf(1, 1), squareOf(2, 2), squareOf(3, 3)])
    expect(describeLine(state.line!)).toBe('on a diagonal')
  })

  it('wins on the falling diagonal, right up in the top corner', () => {
    const before = fromDiagram(`
      .......
      ox.....
      oox....
      xxox...
      xoox...
      ooxo..x`)
    expect(before.over).toBe(false)
    expect(before.current).toBe(RED)
    const { state } = apply(before, 0)
    expect(state.last).toBe(squareOf(0, 5))
    expect(state.winner).toBe(RED)
    expect(state.line).toEqual([squareOf(3, 2), squareOf(2, 3), squareOf(1, 4), squareOf(0, 5)])
    expect(describeLine(state.line!)).toBe('on a diagonal')
  })

  it('doesn’t count lines that wrap from one row onto the next', () => {
    // Three on the right of row 1 and one at the left of row 2 aren't a line.
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      xoo....
      ooxoxxx`)
    expect(state.over).toBe(false)
    expect(winningSquares(state, RED)).not.toContain(squareOf(0, 1))
  })

  it('lights up every checker in a line of five, and both lines made at once', () => {
    // Red fills the gap in the bottom row: five across.
    const five = fromDiagram(`
      .......
      .......
      .......
      .......
      ooo..o.
      xxx.xxo`)
    expect(apply(five, 3).state.line).toEqual([0, 1, 2, 3, 4, 5])
    // A drop that makes four across and four up.
    const cross = fromDiagram(`
      .......
      .......
      xxx....
      ooox...
      oxox..o
      xoxx.oo`)
    const both = apply(cross, 3).state
    expect(both.winner).toBe(RED)
    expect(both.line).toEqual([3, 10, 17, 21, 22, 23, 24])
    expect(describeLine(both.line!)).toBe('two ways at once')
  })

  it('refuses a full column, a column off the rack, and any move once it’s over', () => {
    const state = play(1, 1, 1, 1, 1, 1)
    expect(isLegal(state, 0)).toBe(false)
    expect(legalMoves(state)).not.toContain(0)
    expect(() => apply(state, 0)).toThrow(/column 1 is full/)
    expect(isLegal(state, 7)).toBe(false)
    expect(isLegal(state, -1)).toBe(false)
    expect(isLegal(state, 2.5)).toBe(false)
    expect(() => apply(state, 9)).toThrow(/Illegal/)
    const won = play(1, 2, 1, 2, 1, 2, 1)
    expect(legalMoves(won)).toEqual([])
    expect(() => apply(won, 4)).toThrow()
  })

  it('calls a full rack with no four a draw', () => {
    // Columns fill in pairs, each pair shifted so no line of four can form.
    const order = [1, 2, 1, 2, 1, 2, 2, 1, 2, 1, 2, 1, 3, 4, 3, 4, 3, 4, 4, 3, 4, 3, 4, 3, 5, 6, 5, 6, 5, 6, 6, 5, 6, 5, 6, 5, 7, 7, 7, 7, 7, 7]
    let state = createGame()
    for (const c of order.slice(0, -1)) {
      state = apply(state, c - 1).state
      expect(state.over).toBe(false)
    }
    const { state: end, events } = apply(state, 6)
    expect(end.turn).toBe(CELLS)
    expect(end.over).toBe(true)
    expect(end.winner).toBeNull()
    expect(end.line).toBeNull()
    expect(events.at(-1)).toEqual({ type: 'ended', winner: null, line: null })
  })

  it('reads positions from a diagram, and refuses impossible ones', () => {
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      ...o...
      ...x...`)
    expect(state.current).toBe(RED)
    expect(state.turn).toBe(2)
    expect(() => fromDiagram('.'.repeat(41))).toThrow(/42 holes/)
    expect(() => fromDiagram(`${'.'.repeat(28)}...x...${'.'.repeat(7)}`)).toThrow(/floats/)
    expect(() => fromDiagram(`${'.'.repeat(35)}xx.....`)).toThrow(/Red drops first/)
  })

  it('finds each side’s threats, reachable or not', () => {
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      .xxx...
      .ooox..`)
    // Red can finish row 2 on the right now, or on the left once column 1 has a checker in it.
    expect(winningSquares(state, RED)).toEqual([squareOf(0, 1), squareOf(4, 1)])
    // Yellow's is at the bottom of column 1, under Red's.
    expect(winningSquares(state, YELLOW)).toEqual([squareOf(0, 0)])
    expect(openSquares(state)).toEqual([squareOf(0, 0), squareOf(1, 2), squareOf(2, 2), squareOf(3, 2), squareOf(4, 1), squareOf(5, 0), squareOf(6, 0)])
  })

  it('plays random games to an end, every one legal, with a winner’s line or a full rack', () => {
    const rng = createRng(42)
    for (let g = 0; g < 300; g++) {
      let state = createGame()
      while (!state.over) {
        const moves = legalMoves(state)
        expect(moves.length).toBeGreaterThan(0)
        state = apply(state, pick(moves, rng)).state
      }
      if (state.winner === null) expect(state.turn).toBe(CELLS)
      else {
        expect(state.line!.length).toBeGreaterThanOrEqual(4)
        expect(state.line!.every((sq) => state.board[sq] === state.winner)).toBe(true)
        expect(state.line).toContain(state.last)
      }
      expect(state.heights.reduce((a, b) => a + b, 0)).toBe(state.turn)
      expect(state.heights.every((h) => h <= ROWS)).toBe(true)
    }
    expect(COLS * ROWS).toBe(CELLS)
  })
})

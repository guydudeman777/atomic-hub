import { describe, expect, it } from 'vitest'
import { createRng, pick } from '../../core/rng'
import {
  BLACK,
  type GameEvent,
  type GameState,
  type Player,
  WHITE,
  apply,
  cells,
  createGame,
  discCount,
  finalScore,
  fromDiagram,
  isLegal,
  legalMoves,
  other,
  parseSquare,
  squareName,
} from './engine'

const sq = (name: string) => parseSquare(name) as number
const names = (squares: readonly number[]) => squares.map(squareName)

/** The rules the slow way, square by square, to check the bitboards against. */
function reference(board: (Player | null)[], player: Player, square: number): number[] {
  if (board[square] !== null) return []
  const r = square >> 3
  const c = square & 7
  const turned: number[] = []
  for (const [dr, dc] of [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]) {
    const line: number[] = []
    let rr = r + dr
    let cc = c + dc
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === other(player)) {
      line.push(rr * 8 + cc)
      rr += dr
      cc += dc
    }
    if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === player) turned.push(...line)
  }
  return turned
}

const eventOf = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined

describe('Reversi engine', () => {
  it('starts from the four middle discs with Black to move', () => {
    const state = createGame()
    const board = cells(state)
    expect(board[sq('d4')]).toBe(WHITE)
    expect(board[sq('e5')]).toBe(WHITE)
    expect(board[sq('d5')]).toBe(BLACK)
    expect(board[sq('e4')]).toBe(BLACK)
    expect(discCount(state)).toEqual([2, 2])
    expect(state.current).toBe(BLACK)
    expect(names(legalMoves(state)).sort()).toEqual(['c4', 'd3', 'e6', 'f5'])
  })

  it('names squares from a1 at the top left', () => {
    expect(squareName(0)).toBe('a1')
    expect(squareName(7)).toBe('h1')
    expect(squareName(63)).toBe('h8')
    expect(parseSquare('D3')).toBe(19)
    expect(parseSquare('i9')).toBeNull()
    expect(parseSquare('a')).toBeNull()
  })

  it('turns over the flanked line and hands the move over', () => {
    const { state, events } = apply(createGame(), sq('d3'))
    expect(cells(state)[sq('d4')]).toBe(BLACK)
    expect(discCount(state)).toEqual([4, 1])
    expect(state.current).toBe(WHITE)
    expect(state.last).toBe(sq('d3'))
    expect(events).toEqual([
      { type: 'placed', player: BLACK, square: sq('d3') },
      { type: 'flipped', player: BLACK, squares: [sq('d4')] },
    ])
  })

  it('flips in all eight directions at once, nearest first', () => {
    // Black plays d3, in the middle of a ring of white with black beyond it.
    const state = fromDiagram(`
      .x.x.x..
      ..ooo...
      .xo.ox..
      ..ooo...
      .x.x.x..
      ........
      ........
      ........`)
    const { state: after, events } = apply(state, sq('d3'))
    const flipped = eventOf(events, 'flipped')!.squares
    expect(names(flipped).sort()).toEqual(['c2', 'c3', 'c4', 'd2', 'd4', 'e2', 'e3', 'e4'])
    expect(discCount(after)).toEqual([17, 0])
  })

  it('turns over lines of several discs, ordered outward from the move', () => {
    const state = fromDiagram(`
      xoooo...
      ........
      ........
      ........
      ........
      ........
      ........
      ........`)
    const { events } = apply(state, sq('f1'))
    expect(names(eventOf(events, 'flipped')!.squares)).toEqual(['e1', 'd1', 'c1', 'b1'])
  })

  it('leaves a line alone unless your own disc closes it', () => {
    // a1 runs east into an empty square; only the line down to a4 is closed.
    const state = fromDiagram(`
      .oo.....
      o.......
      o.......
      x.......
      ........
      ........
      ........
      ........`)
    const { events } = apply(state, sq('a1'))
    expect(names(eventOf(events, 'flipped')!.squares)).toEqual(['a2', 'a3'])
  })

  it('doesn’t wrap around the board’s edges', () => {
    // h1 white and a2 black sit next to each other in memory, not on the board.
    const state = fromDiagram(`
      .......o
      x.......
      ........
      ...o....
      ...x....
      ........
      ........
      ........`)
    expect(names(legalMoves(state))).toEqual(['d3'])
    expect(isLegal(state, sq('g1'))).toBe(false)
  })

  it('refuses illegal moves', () => {
    const state = createGame()
    expect(isLegal(state, sq('a1'))).toBe(false)
    expect(isLegal(state, sq('d4'))).toBe(false)
    expect(isLegal(state, -1)).toBe(false)
    expect(isLegal(state, 64)).toBe(false)
    expect(() => apply(state, sq('a1'))).toThrow(/Illegal move: a1/)
  })

  it('passes when the next player has no move', () => {
    // After Black takes a8, White's only disc is gone from reach; Black goes again.
    const state = fromDiagram(`
      xxxxxxxx
      xxxxxxxx
      xxxxxxxx
      xxxxxxxx
      xxxxxxxx
      oooooooo
      .ooooooo
      ........`)
    const black = legalMoves(state)
    expect(black.length).toBeGreaterThan(0)
    // Find a move that leaves White without a reply.
    for (const move of black) {
      const { state: after, events } = apply(state, move)
      if (after.over) continue
      if (eventOf(events, 'passed')) {
        expect(eventOf(events, 'passed')).toEqual({ type: 'passed', player: WHITE })
        expect(after.current).toBe(BLACK)
        return
      }
    }
    throw new Error('No passing line found')
  })

  it('ends the game when a color is wiped out', () => {
    // White plays a3 and turns Black's last disc.
    const state = fromDiagram(
      `
      o.......
      x.......
      ........
      ........
      ........
      ........
      ........
      .......o
      `,
      WHITE,
    )
    const { state: after, events } = apply(state, sq('a3'))
    expect(after.over).toBe(true)
    expect(eventOf(events, 'ended')).toEqual({ type: 'ended', winner: WHITE, score: [0, 64] })
  })

  it('ends early when neither side can move, with the empties going to the winner', () => {
    const state = fromDiagram(`
      xxxxxxxx
      xxxxxxxx
      xxxxxxxx
      xxxxxxx.
      xxxxxx..
      xxxxxx.o
      xxxxxx..
      xxxxxxxx`)
    // White's last disc has no black line to flank, and nothing flanks it.
    expect(state.over).toBe(true)
    expect(state.winner).toBe(BLACK)
    expect(discCount(state)).toEqual([57, 1])
    expect(finalScore(state)).toEqual([63, 1])
    expect(legalMoves(state)).toEqual([])
  })

  it('scores a full board, and calls 32 all a draw', () => {
    const rows = ['xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'oooooooo', 'oooooooo', 'oooooooo', 'oooooooo']
    const state = fromDiagram(rows.join(''))
    expect(state.over).toBe(true)
    expect(state.winner).toBeNull()
    expect(finalScore(state)).toEqual([32, 32])
  })

  it('agrees with the square-by-square rules over thousands of random games', () => {
    const rng = createRng(7)
    for (let game = 0; game < 300; game++) {
      let state: GameState = createGame()
      while (!state.over) {
        const board = cells(state)
        const expected = board.flatMap((_, s) => (reference(board, state.current, s).length ? [s] : []))
        const legal = legalMoves(state)
        expect(legal).toEqual(expected)
        const move = pick(legal, rng)
        const [black, white] = discCount(state)
        const { state: next, events } = apply(state, move)
        const turned = eventOf(events, 'flipped')!.squares
        expect([...turned].sort((a, b) => a - b)).toEqual(reference(board, state.current, move).sort((a, b) => a - b))
        // One new disc, and each flip moves a disc from one side to the other.
        const [black2, white2] = discCount(next)
        expect(black2 + white2).toBe(black + white + 1)
        expect(state.current === BLACK ? black2 - black : white2 - white).toBe(turned.length + 1)
        // Whoever's to move next has a move, unless it's over.
        if (!next.over) expect(legalMoves(next).length).toBeGreaterThan(0)
        state = next
      }
      const ended = finalScore(state)
      expect(ended[0] + ended[1]).toBeLessThanOrEqual(64)
    }
  })
})

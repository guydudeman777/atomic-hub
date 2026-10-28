import { describe, expect, it } from 'vitest'
import { createRng, pick } from '../../core/rng'
import { type Banter, MOMENTS, type Moment, TableTalk, momentOf } from './banter'
import { OPPONENTS, isUnlocked } from './content'
import { BLACK, type GameState, WHITE, apply, createGame, fromDiagram, legalMoves, parseSquare } from './engine'

const sq = (name: string) => parseSquare(name) as number

/** The moment a move makes, with the AI playing White. */
function moment(state: GameState, square: string) {
  const { state: after, events } = apply(state, sq(square))
  return momentOf(state, events, after, WHITE)
}

/** A talker whose every line names its moment, so tests can tell which one fired. */
const labelled: Banter = {
  chattiness: 100,
  lines: Object.fromEntries(MOMENTS.map((m) => [m, [`${m} 1`, `${m} 2`]])) as unknown as Record<Moment, readonly string[]>,
}

describe('Reversi table talk', () => {
  it('notices a corner, whoever takes it', () => {
    const corner = `
      .ox.....
      ........
      ........
      ...ox...
      ...xo...
      ........
      ........
      ........`
    expect(moment(fromDiagram(corner, BLACK), 'a1')).toEqual({ moment: 'youTookCorner', square: sq('a1') })
    const theirs = fromDiagram(corner.replace('.ox', '.xo'), WHITE)
    expect(moment(theirs, 'a1')).toEqual({ moment: 'iTookCorner', square: sq('a1') })
  })

  it('notices a player left without a move', () => {
    // Play random games until a move (off the corners) leaves the other side to pass.
    const rng = createRng(2)
    for (let game = 0; game < 200; game++) {
      let state = createGame()
      while (!state.over) {
        const moves = legalMoves(state)
        const { state: after, events } = apply(state, pick(moves, rng))
        const passed = events.find((e) => e.type === 'passed')
        const placed = events.find((e) => e.type === 'placed')
        if (passed?.type === 'passed' && placed?.type === 'placed' && ![0, 7, 56, 63].includes(placed.square)) {
          // The AI made you pass, or you made the AI pass.
          expect(momentOf(state, events, after, state.current)?.moment).toBe('youPassed')
          expect(momentOf(state, events, after, passed.player)?.moment).toBe('iPassed')
          return
        }
        state = after
      }
    }
    throw new Error('No pass in 200 games')
  })

  it('notices a big sweep', () => {
    const state = fromDiagram(`
      ........
      ........
      xoooooo.
      ...ox...
      ...xo...
      ........
      ........
      ........`)
    expect(moment(state, 'h3')?.moment).toBe('youSwept')
  })

  it('says nothing about the last move of the game', () => {
    const state = fromDiagram(`
      xoooo...
      ........
      ........
      ........
      ........
      ........
      ........
      ........`)
    expect(moment(state, 'f1')).toBeNull()
  })

  it('says hello, then keeps quiet for a move or two after each remark', () => {
    const talk = new TableTalk(labelled, createRng(1), WHITE)
    expect(talk.hello()).toMatch(/^hello/)
    let state = createGame()
    const said: (string | null)[] = []
    for (const square of ['d3', 'c3', 'c4', 'e3', 'f2', 'b4']) {
      const { state: after, events } = apply(state, sq(square))
      said.push(talk.react(state, events, after))
      state = after
    }
    // Ordinary moves: hello covers the first, and a line needs three moves' quiet.
    expect(said[0]).toBeNull()
    for (let i = 1; i < said.length; i++) if (said[i] && said[i - 1]) throw new Error('Spoke twice running')
    expect(said.some((s) => s !== null)).toBe(true)
  })

  it('doesn’t repeat a line until the others are used', () => {
    const talk = new TableTalk(labelled, createRng(4), WHITE)
    const first = talk.hello()
    const second = talk.hello()
    expect(second).not.toBe(first)
  })

  it('every opponent has something to say for every moment', () => {
    for (const o of OPPONENTS) {
      for (const m of MOMENTS) expect(o.banter.lines[m].length, `${o.name}: ${m}`).toBeGreaterThan(0)
      for (const line of [...o.banter.lines.youTookCorner, ...o.banter.lines.iTookCorner]) expect(line).not.toMatch(/\{(?!square\})/)
    }
  })

  it('opens the ladder one opponent at a time', () => {
    expect(isUnlocked(0, {})).toBe(true)
    expect(isUnlocked(1, {})).toBe(false)
    expect(isUnlocked(1, { [OPPONENTS[0].id]: 1 })).toBe(true)
    expect(isUnlocked(2, { [OPPONENTS[0].id]: 1 })).toBe(false)
  })
})

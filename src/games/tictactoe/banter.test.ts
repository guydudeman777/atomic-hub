import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import { type Banter, MOMENTS, type Moment, TableTalk, momentOf } from './banter'
import { OPPONENTS, isUnlocked } from './content'
import { type GameState, O, X, apply, createGame, fromDiagram } from './engine'

/** The moment a move makes, with the AI playing O. */
function moment(state: GameState, square: number) {
  const { state: after, events } = apply(state, square)
  return momentOf(state, events, after, O)
}

/** A talker whose every line names its moment, so tests can tell which one fired. */
const labelled: Banter = {
  chattiness: 100,
  lines: Object.fromEntries(MOMENTS.map((m) => [m, [`${m} 1`, `${m} 2`]])) as unknown as Record<Moment, readonly string[]>,
}

describe('Tic-Tac-Toe table talk', () => {
  it('notices a fork, whoever makes it', () => {
    // X has two corners; the top right makes two lines of two at once.
    const yours = fromDiagram('x.. .o. o.x')
    expect(yours.current).toBe(X)
    expect(moment(yours, 2)).toEqual({ moment: 'youForked' })
    const theirs = fromDiagram('o.. .x. xxo')
    expect(theirs.current).toBe(O)
    expect(moment(theirs, 2)).toEqual({ moment: 'iForked' })
  })

  it('notices a block and a threat', () => {
    // X is one from three along the top; O blocks it.
    const top = fromDiagram('xx. .o. ...')
    expect(moment(top, 2)).toEqual({ moment: 'iBlocked' })
    // X makes two in a row with the third open.
    expect(moment(fromDiagram('x.. .o. ...'), 1)).toEqual({ moment: 'youThreatened' })
    expect(moment(createGame(), 4)).toEqual({ moment: 'youPlayed' })
  })

  it('notices a small grid won in Ultimate, and a player turned loose', () => {
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
    expect(moment(pos, 2)).toEqual({ moment: 'youTookGrid', grid: 0 })
    // O plays the top left of the center grid, which sends X to the closed top left grid.
    const loose = fromDiagram(`
      xxx ... ...
      o.. ... ...
      o.. ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...
      ... ... ...`, { forced: 4 })
    expect(moment(loose, 36)).toEqual({ moment: 'youGotFree' })
  })

  it('says nothing once the game is over', () => {
    expect(moment(fromDiagram('oo. xx. x..'), 2)).toBeNull()
  })

  it('greets you, then keeps quiet for a while after each remark', () => {
    const talk = new TableTalk(labelled, createRng(1), O)
    expect(talk.hello()).toMatch(/^hello/)
    let state = createGame()
    const said: (string | null)[] = []
    for (const sq of [4, 0, 8, 2]) {
      const after = apply(state, sq)
      said.push(talk.react(state, after.events, after.state))
      state = after.state
    }
    // The first two moves pass quietly after the greeting, and the one after a remark too.
    expect(said[0]).toBeNull()
    expect(said[1]).toBeNull()
    expect(said[2]).toMatch(/^youPlayed/)
    expect(said[3]).toBeNull()
  })

  it('doesn’t repeat a line until it’s used them all', () => {
    const talk = new TableTalk(labelled, createRng(2), O)
    const lines = [talk.hello(), talk.hello()]
    expect(new Set(lines).size).toBe(2)
  })

  it('fills in the grid’s name', () => {
    const talk = new TableTalk({ chattiness: 100, lines: { ...labelled.lines, youTookGrid: ['{grid} is yours.'] } }, createRng(1), O)
    const pos = fromDiagram(`
      ... ... ...
      ... ... ...
      ... ... ...
      ... xx. ...
      ... ... ...
      ... ... ...
      o.. ... ...
      ... ... ...
      ... ... ..o`, { forced: 4 })
    const { state, events } = apply(pos, 4 * 9 + 2)
    expect(talk.react(pos, events, state)).toBe('The center is yours.')
  })

  it('every opponent has lines for every moment', () => {
    for (const o of OPPONENTS) {
      for (const m of MOMENTS) expect(o.banter.lines[m].length, `${o.name}: ${m}`).toBeGreaterThanOrEqual(2)
      expect(o.lines.win && o.lines.lose && o.lines.draw).toBeTruthy()
    }
  })

  it('opens the ladder one opponent at a time', () => {
    expect(isUnlocked(0, {})).toBe(true)
    expect(isUnlocked(1, {})).toBe(false)
    expect(isUnlocked(1, { skip: 1 })).toBe(true)
    expect(isUnlocked(3, { skip: 1, bev: 2 })).toBe(false)
  })
})

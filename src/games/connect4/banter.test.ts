import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import { type Banter, MOMENTS, type Moment, TableTalk, momentOf } from './banter'
import { OPPONENTS, isUnlocked } from './content'
import { type GameState, RED, YELLOW, apply, createGame, fromDiagram } from './engine'

/** The moment a drop in `column` (1 to 7) makes, with the AI playing `ai`. */
function moment(state: GameState, column: number, ai = YELLOW) {
  const { state: after, events } = apply(state, column - 1)
  return momentOf(state, events, after, ai)
}

/** A talker whose every line names its moment, so tests can tell which one fired. */
const labelled: Banter = {
  chattiness: 100,
  lines: Object.fromEntries(MOMENTS.map((m) => [m, [`${m} 1`, `${m} 2`]])) as unknown as Record<Moment, readonly string[]>,
}

describe('Connect Four table talk', () => {
  it('notices a win blocked, whoever blocks it', () => {
    // Red to drop, and Yellow would win in column 4 on row 2.
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      ooo.x..
      xxoxx.o`)
    expect(state.current).toBe(RED)
    expect(moment(state, 4)).toEqual({ moment: 'youBlocked', col: 3 })
    expect(moment(state, 4, RED)).toEqual({ moment: 'iBlocked', col: 3 })
  })

  it('notices a new threat, and says which column it’s in', () => {
    // Red's third on the bottom row opens a hole in column 5.
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      .......
      oxx...o`)
    expect(state.current).toBe(RED)
    expect(moment(state, 4)).toEqual({ moment: 'youThreat', col: 4 })
    expect(moment(state, 4, RED)?.moment).toBe('iThreat')
  })

  it('notices the middle of the bottom row, and passes over ordinary drops', () => {
    expect(moment(createGame(), 4)?.moment).toBe('youCenter')
    expect(moment(createGame(), 4, RED)?.moment).toBe('iCenter')
    expect(moment(createGame(), 1)?.moment).toBe('youPlayed')
  })

  it('says nothing about the last drop of the game', () => {
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      ooo....
      xxx....`)
    expect(moment(state, 4)).toBeNull()
  })

  it('says hello, then keeps quiet for a move or two after each remark', () => {
    const talk = new TableTalk(labelled, createRng(1), YELLOW)
    expect(talk.hello()).toMatch(/^hello/)
    let state = createGame()
    const said: (string | null)[] = []
    for (const column of [4, 4, 3, 3, 5, 5, 1, 2]) {
      const { state: after, events } = apply(state, column - 1)
      said.push(talk.react(state, events, after))
      state = after
    }
    // Hello covers the first drop, and nobody talks two drops running.
    expect(said[0]).toBeNull()
    for (let i = 1; i < said.length; i++) if (said[i] && said[i - 1]) throw new Error('Spoke twice running')
    expect(said.some((s) => s !== null)).toBe(true)
  })

  it('doesn’t repeat a line until the others are used', () => {
    const talk = new TableTalk(labelled, createRng(4), YELLOW)
    const first = talk.hello()
    expect(talk.hello()).not.toBe(first)
  })

  it('fills in the column a line is about', () => {
    const talk = new TableTalk({ chattiness: 100, lines: { ...labelled.lines, iThreat: ['Look to column {column}.'] } }, createRng(1), RED)
    const state = fromDiagram(`
      .......
      .......
      .......
      .......
      .......
      oxx...o`)
    talk.hello()
    const { state: after, events } = apply(state, 3)
    expect(talk.react(state, events, after)).toBe('Look to column 5.')
  })

  it('every opponent has something to say for every moment', () => {
    for (const o of OPPONENTS) {
      for (const m of MOMENTS) expect(o.banter.lines[m].length, `${o.name}: ${m}`).toBeGreaterThan(0)
      for (const line of MOMENTS.flatMap((m) => o.banter.lines[m])) expect(line).not.toMatch(/\{(?!column\})/)
    }
  })

  it('opens the ladder one opponent at a time', () => {
    expect(isUnlocked(0, {})).toBe(true)
    expect(isUnlocked(1, {})).toBe(false)
    expect(isUnlocked(1, { [OPPONENTS[0].id]: 1 })).toBe(true)
    expect(isUnlocked(2, { [OPPONENTS[0].id]: 1 })).toBe(false)
  })
})

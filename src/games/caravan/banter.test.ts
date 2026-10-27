import { describe, expect, it } from 'vitest'
import { fullSet, parseCardId } from '../../core/cards'
import { type Rng, createRng } from '../../core/rng'
import { chooseMove } from './ai'
import { type Banter, MOMENTS, type Moment, PLACEHOLDERS, TableTalk, momentOf } from './banter'
import { OPPONENTS } from './content'
import { type Caravan, type GameState, type Move, type PlayerId, applyMove, createGame } from './engine'

// The human sits in seat 0 with "p:" cards, the AI in seat 1 with "q:" cards.
const caravan = (...ids: string[]): Caravan => ids.map((id) => ({ card: parseCardId(id), attached: [] }))
const empty: [Caravan, Caravan, Caravan] = [[], [], []]

function table(opts: {
  current: PlayerId
  human?: [Caravan, Caravan, Caravan]
  ai?: [Caravan, Caravan, Caravan]
  hand: string[]
  turn?: number
}): GameState {
  const seat = (prefix: string, caravans: [Caravan, Caravan, Caravan], hand: string[]) => ({
    deck: [parseCardId(`${prefix}:2C`), parseCardId(`${prefix}:3C`)],
    hand: [...hand, `${prefix}:AC`].map(parseCardId),
    caravans,
    turnsTaken: 6,
  })
  const humanHand = opts.current === 0 ? opts.hand : []
  const aiHand = opts.current === 1 ? opts.hand : []
  return {
    players: [seat('p', opts.human ?? empty, humanHand), seat('q', opts.ai ?? empty, aiHand)],
    current: opts.current,
    winner: null,
    endReason: null,
    turn: opts.turn ?? 12,
  }
}

function moment(state: GameState, move: Move) {
  const { state: after, events } = applyMove(state, move)
  return momentOf(state, events, after, 1)
}

describe('table talk moments', () => {
  it('notices a Jack on either side', () => {
    const ai: [Caravan, Caravan, Caravan] = [caravan('q:7H'), [], []]
    const human: [Caravan, Caravan, Caravan] = [caravan('p:9S'), [], []]
    const yours = table({ current: 0, human, ai, hand: ['p:JS'] })
    expect(moment(yours, { type: 'play', cardId: 'p:JS', owner: 1, lane: 0, index: 0 })).toMatchObject({
      moment: 'youTookMine',
      card: { id: 'q:7H' },
    })
    const theirs = table({ current: 1, human, ai, hand: ['q:JS'] })
    expect(moment(theirs, { type: 'play', cardId: 'q:JS', owner: 0, lane: 0, index: 0 })?.moment).toBe('iTookYours')
  })

  it('jacking your own card is no attack', () => {
    const state = table({ current: 0, human: [caravan('p:9S'), [], []], hand: ['p:JS'] })
    expect(moment(state, { type: 'play', cardId: 'p:JS', owner: 0, lane: 0, index: 0 })?.moment).toBe('youPlayed')
  })

  it('notices a King that pushes a caravan over 26', () => {
    const state = table({ current: 0, ai: [caravan('q:10H', 'q:8H', 'q:6H'), [], []], hand: ['p:KS'] })
    expect(moment(state, { type: 'play', cardId: 'p:KS', owner: 1, lane: 0, index: 0 })?.moment).toBe('youBustedMine')
  })

  it('notices selling a caravan, and two lanes over that', () => {
    const state = table({ current: 0, human: [caravan('p:10H', 'p:8H'), [], []], hand: ['p:4S'] })
    expect(moment(state, { type: 'play', cardId: 'p:4S', owner: 0, lane: 0 })).toEqual({ moment: 'youSold', value: 22 })

    const twoLanes = table({ current: 0, human: [caravan('p:10H', 'p:8H'), caravan('p:10D', 'p:9D', 'p:4D'), []], hand: ['p:4S'] })
    expect(moment(twoLanes, { type: 'play', cardId: 'p:4S', owner: 0, lane: 0 })?.moment).toBe('youNearWin')
  })

  it('notices you going over on your own caravan', () => {
    const state = table({ current: 0, human: [caravan('p:10H', 'p:8H'), [], []], hand: ['p:9H'] })
    expect(moment(state, { type: 'play', cardId: 'p:9H', owner: 0, lane: 0 })?.moment).toBe('youBusted')
  })

  it('names quieter moves too', () => {
    const human: [Caravan, Caravan, Caravan] = [caravan('p:5H'), [], []]
    const ai: [Caravan, Caravan, Caravan] = [caravan('q:5H'), [], []]
    expect(moment(table({ current: 0, human, hand: ['p:9S'] }), { type: 'discard', cardId: 'p:9S' })?.moment).toBe('youDiscarded')
    expect(moment(table({ current: 1, ai, hand: [] }), { type: 'disband', lane: 0 })?.moment).toBe('iDisbanded')
  })

  it('stays quiet once the game is over', () => {
    const human: [Caravan, Caravan, Caravan] = [caravan('p:10H', 'p:8H'), caravan('p:10D', 'p:9D', 'p:4D'), caravan('p:10S', 'p:9S', 'p:3S')]
    const state = table({ current: 0, human, hand: ['p:4S'] })
    expect(moment(state, { type: 'play', cardId: 'p:4S', owner: 0, lane: 0 })).toBeNull()
  })
})

describe('TableTalk', () => {
  const lines = Object.fromEntries(MOMENTS.map((m) => [m, [`${m} one`, `${m} two`]])) as Record<Moment, string[]>
  const banter: Banter = { chattiness: 1, lines: { ...lines, youTookMine: ['Not my {card}!', 'Ow.'] } }
  /** Always passes the chance roll and picks the first fresh line. */
  const always: Rng = () => 0

  const jackAt = (turn: number) => {
    const state = table({ current: 0, ai: [caravan('q:7H'), [], []], hand: ['p:JS'], turn })
    const { state: after, events } = applyMove(state, { type: 'play', cardId: 'p:JS', owner: 1, lane: 0, index: 0 })
    return [state, events, after] as const
  }

  it('says hello, then lets the first turn pass', () => {
    const talk = new TableTalk(banter, always)
    expect(talk.hello()).toBe('hello one')
    expect(talk.react(...jackAt(0))).toBeNull()
    expect(talk.react(...jackAt(1))).toBe('Not my 7 of hearts!')
  })

  it('never speaks on two turns in a row, and waits longer after small talk', () => {
    const talk = new TableTalk(banter, always)
    expect(talk.react(...jackAt(10))).not.toBeNull()
    expect(talk.react(...jackAt(11))).toBeNull()
    expect(talk.react(...jackAt(12))).not.toBeNull()

    const discardAt = (turn: number) => {
      const state = table({ current: 0, hand: ['p:9S'], turn })
      const { state: after, events } = applyMove(state, { type: 'discard', cardId: 'p:9S' })
      return [state, events, after] as const
    }
    expect(talk.react(...discardAt(14))).toBeNull()
    expect(talk.react(...discardAt(15))).toBe('youDiscarded one')
    expect(talk.react(...discardAt(17))).toBeNull()
    expect(talk.react(...discardAt(18))).toBe('youDiscarded two')
  })

  it('uses every line before repeating one', () => {
    const talk = new TableTalk(banter, always)
    const said = [10, 12, 14, 16].map((t) => talk.react(...jackAt(t)))
    expect(said).toEqual(['Not my 7 of hearts!', 'Ow.', 'Not my 7 of hearts!', 'Ow.'])
  })

  it('a quiet opponent stays quiet', () => {
    const talk = new TableTalk({ ...banter, chattiness: 0 }, always)
    expect(talk.react(...jackAt(10))).toBeNull()
  })

  it('talks now and then over a real game, never on consecutive turns', () => {
    let turns = 0
    let remarks = 0
    for (let seed = 0; seed < 6; seed++) {
      const rng = createRng(seed)
      const opponent = OPPONENTS[seed % OPPONENTS.length]
      const talk = new TableTalk(opponent.banter, createRng(seed + 1000))
      talk.hello()
      let state = createGame({ decks: [fullSet('a'), fullSet('b')], rng, firstPlayer: (seed % 2) as PlayerId })
      let lastRemark = -Infinity
      while (state.winner === null && state.turn < 400) {
        const before = state
        const { state: after, events } = applyMove(before, chooseMove(before, { difficulty: 'easy', aggression: 1 }, rng))
        const line = talk.react(before, events, after)
        if (line) {
          expect(before.turn - lastRemark).toBeGreaterThan(1)
          expect(line).not.toMatch(/\{|\}/)
          lastRemark = before.turn
          remarks++
        }
        turns++
        state = after
      }
    }
    expect(remarks / turns).toBeGreaterThan(0.04)
    expect(remarks / turns).toBeLessThan(0.35)
  })
})

describe('opponent lines', () => {
  it('every opponent has something to say for every moment', () => {
    for (const o of OPPONENTS) {
      for (const m of MOMENTS) expect(o.banter.lines[m].length, `${o.id} ${m}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('placeholders only appear where they can be filled', () => {
    for (const o of OPPONENTS) {
      for (const m of MOMENTS) {
        for (const line of o.banter.lines[m]) {
          const used = line.match(/\{\w+\}/g) ?? []
          for (const p of used) expect(p, `${o.id} ${m}: ${line}`).toBe(PLACEHOLDERS[m])
        }
      }
    }
  })
})

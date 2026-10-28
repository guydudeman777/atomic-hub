import { describe, expect, it } from 'vitest'
import type { Card } from '../../core/cards'
import { type Moment, MOMENTS, TableTalk, type Talker, dealerCall, momentsOf } from './banter'
import { REGULARS, regularById } from './content'
import { type Action, type TableEvent, type TableState, actor, apply, createTable, freshShoe } from './engine'

const YOU = 1

/** A shoe whose first cards are `codes`, in order. */
function rigged(codes: string): Card[] {
  const rest = freshShoe(1)
  const top = codes.split(' ').map((code) => rest.splice(rest.findIndex((c) => `${c.rank}${c.suit}` === code), 1)[0])
  return [...top, ...rest]
}

interface Step {
  before: TableState
  events: TableEvent[]
  after: TableState
}

/** Every step of a round, with the dealer's steps run automatically between `actions`. */
function steps(codes: string, bets: number[], ...actions: Action[]): Step[] {
  let state = createTable({ spots: bets.length, limits: { min: 5, max: 500 }, seed: 1, shoe: rigged(codes) })
  const out: Step[] = []
  const step = (action: Action) => {
    const { state: after, events } = apply(state, action)
    out.push({ before: state, events, after })
    state = after
  }
  const auto = () => {
    while (actor(state) === 'dealer') step({ type: 'next' })
  }
  step({ type: 'deal', bets })
  auto()
  for (const action of actions) {
    step(action)
    auto()
  }
  return out
}

const momentsIn = (all: Step[], hits: Card[] = []): Moment[] =>
  all.flatMap(({ before, events, after }) => momentsOf(before, events, after, YOU, hits).map((f) => f.moment))

describe('moments', () => {
  it('notices you splitting tens', () => {
    // Spot 0 (a bot): 9 7. You: K Q. Dealer: 6 10.
    const all = steps('9S KH 6D 7C QS 10C 5S 4S 3S 2S', [10, 10], { type: 'stand' }, { type: 'split' })
    expect(momentsIn(all)).toContain('yourSplitTens')
  })

  it('notices blackjacks, and whose', () => {
    // Spot 0: A K. You: A Q. Dealer: 9 7.
    const found = steps('AS AH 9D KC QS 7C', [10, 10]).flatMap(({ before, events, after }) => momentsOf(before, events, after, YOU))
    expect(found).toContainEqual({ moment: 'myBlackjack', spot: 0 })
    expect(found).toContainEqual({ moment: 'yourBlackjack' })
  })

  it('notices a dealer bust', () => {
    // Spot 0: 10 9. You: 10 8. Dealer: 6 10, draws K.
    const all = steps('10S 10H 6D 9C 8S 10C KD', [10, 10], { type: 'stand' }, { type: 'stand' })
    expect(momentsIn(all)).toContain('dealerBust')
  })

  it('blames you for taking the dealer’s bust card', () => {
    // Spot 0: 10 9. You: 10 2 against a 6, and hit a 9 for 21.
    // Dealer: 6 10 = 16. Your 9 would have busted them; instead they draw a 4 to 20.
    const talk = new TableTalk(() => 0, YOU)
    const all = steps('10S 10H 6D 9C 2S 10C 9D 4H', [10, 10], { type: 'stand' }, { type: 'hit' })
    const quill: Talker = { spot: 0, id: 'quill', banter: regularById('quill')!.banter }
    const said = all.map(({ before, events, after }) => talk.react(before, events, after, [quill]))
    expect(said.at(-1)).toEqual({ spot: 0, text: expect.any(String) })
    expect(regularById('quill')!.banter.lines.yourBustCard).toContain(said.at(-1)!.text)
  })

  it('lets only a counter notice a hot shoe', () => {
    const shoe = freshShoe(1)
    const low = shoe.filter((c) => ['2', '3', '4', '5', '6'].includes(c.rank)).slice(0, 30)
    const base = createTable({ spots: 2, limits: { min: 5, max: 500 }, seed: 1, shoe: [...low, ...shoe.filter((c) => !low.includes(c))] })
    const before: TableState = { ...base, dealt: 30, phase: 'settled' }
    const { state: after, events } = apply(before, { type: 'deal', bets: [10, 10] })
    expect(momentsOf(before, events, after, YOU).map((f) => f.moment)).toEqual(['hotShoe'])
    const talk = new TableTalk(() => 0, YOU)
    const sal: Talker = { spot: 0, id: 'sal', banter: regularById('sal')!.banter }
    const grey: Talker = { spot: 0, id: 'grey', banter: regularById('grey')!.banter }
    expect(talk.react(before, events, after, [sal])).toBeNull()
    expect(talk.react(before, events, after, [grey])?.text).toBeTruthy()
  })
})

describe('table talk', () => {
  const quill: Talker = { spot: 0, id: 'quill', banter: regularById('quill')!.banter }

  it('stays quiet for a few steps after someone speaks', () => {
    const talk = new TableTalk(() => 0, YOU)
    // Two blackjacks in a row on the deal: the second goes unremarked.
    const all = steps('AS AH 9D KC QS 7C', [10, 10])
    const lou: Talker = { spot: 2, id: 'lou', banter: regularById('lou')!.banter }
    const said = all.map(({ before, events, after }) => talk.react(before, events, after, [quill, lou])).filter(Boolean)
    expect(said).toHaveLength(1)
  })

  it('doesn’t repeat a line until it has used them all', () => {
    const talk = new TableTalk(Math.random, YOU)
    const hellos = new Set(Array.from({ length: 3 }, () => talk.say(quill, 'hello')))
    expect(hellos.size).toBe(3)
  })

  it('has the dealer call the table', () => {
    const all = steps('10S 10H 6D 9C 8S 10C KD', [10, 10], { type: 'stand' }, { type: 'stand' })
    const calls = all.map(({ before, events, after }) => dealerCall(before, events, after, YOU)).filter(Boolean)
    expect(calls).toEqual(['Too many. Dealer busts with 26.'])
    const insurance = steps('10S 10H AD 9C 8S 7C', [10, 10])
    expect(insurance.map(({ before, events, after }) => dealerCall(before, events, after, YOU)).filter(Boolean)).toEqual([
      'Insurance? Pays two to one.',
    ])
  })
})

describe('the regulars', () => {
  it('all say hello and goodbye, with short lines for real moments', () => {
    for (const r of REGULARS) {
      expect(r.banter.lines.hello?.length, r.name).toBeGreaterThan(0)
      expect(r.banter.lines.goodbye?.length, r.name).toBeGreaterThan(0)
      for (const [moment, lines] of Object.entries(r.banter.lines)) {
        expect(MOMENTS, `${r.name}: ${moment}`).toContain(moment)
        for (const line of lines ?? []) expect(line.length, line).toBeLessThanOrEqual(80)
      }
    }
  })

  it('have unique ids', () => {
    expect(new Set(REGULARS.map((r) => r.id)).size).toBe(REGULARS.length)
  })
})

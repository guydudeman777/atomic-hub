import { describe, expect, it } from 'vitest'
import { type Card, FACE_RANKS, NUMBER_RANKS, type Rank, SUITS, type Suit, makeCard } from '../../core/cards'
import { createRng } from '../../core/rng'
import { TableTalk, dealerCall, momentsOf, spoken } from './banter'
import { REGULARS } from './content'
import { type Action, type DrawEvent, type DrawState, actor, apply, createTable } from './engine'
import { evaluate } from '../../core/poker'

const hand = (codes: string): Card[] => codes.split(' ').map((code) => makeCard('t', code.slice(0, -1) as Rank, code.slice(-1) as Suit))
const DECK = SUITS.flatMap((suit) => [...NUMBER_RANKS, ...FACE_RANKS].map((rank) => makeCard('t', rank, suit)))
const STAKES = { ante: 5, small: 10, big: 20 }

/** Seat 0 is you, seat 1 a regular; seat 0 acts first. */
function dealt(mine: string, theirs: string, then = ''): DrawState {
  const a = hand(mine)
  const b = hand(theirs)
  const top = [0, 1, 2, 3, 4].flatMap((k) => [a[k], b[k]])
  const next = then ? hand(then) : []
  const used = new Set([...top, ...next].map((c) => c.id))
  let state = createTable({ stakes: STAKES, stacks: [1000, 1000], seed: 1, button: 0, decks: [[...top, ...next, ...DECK.filter((c) => !used.has(c.id))]] })
  state = apply(state, { type: 'deal' }).state
  while (actor(state) === 'dealer') state = apply(state, { type: 'next' }).state
  return state
}

function step(state: DrawState, action: Action) {
  const { state: after, events } = apply(state, action)
  return { before: state, events, after }
}

const discardAll = (state: DrawState, ranks: string[]): Action => ({
  type: 'draw',
  discards: state.seats[state.turn!]!.cards.filter((c) => ranks.includes(c.rank)).map((c) => c.id),
})

describe('table talk', () => {
  it('notices you standing pat and drawing four', () => {
    let state = dealt('AS 9H 7C 4D 2S', 'KS KH 8C 5D 3S')
    state = apply(apply(state, { type: 'check' }).state, { type: 'check' }).state
    const pat = step(state, { type: 'draw', discards: [] })
    expect(momentsOf(pat.before, pat.events, pat.after, 0).map((f) => f.moment)).toEqual(['yourPat'])
    const four = step(state, discardAll(state, ['9', '7', '4', '2']))
    expect(momentsOf(four.before, four.events, four.after, 0).map((f) => f.moment)).toEqual(['yourFour'])
  })

  it('hears a bad beat and a caught bluff at the showdown, from the hand that lost', () => {
    // You hold Aces full; they bet two pair after the draw and lose.
    let state = dealt('AS AH AD 4C 4D', 'KS KH 8C 8D 3S')
    for (const a of [{ type: 'check' }, { type: 'check' }, { type: 'draw', discards: [] }, { type: 'draw', discards: [] }, { type: 'check' }, { type: 'bet' }, { type: 'call' }] as Action[]) {
      state = apply(state, a).state
    }
    const show = step(state, { type: 'next' })
    const found = momentsOf(show.before, show.events, show.after, 0)
    expect(found[0]).toEqual({ moment: 'myBadBeat', seat: 1 })
  })

  it('stays quiet for a while after a remark', () => {
    const talk = new TableTalk(createRng(1), 0)
    const talkers = [{ seat: 1, id: 'dutch', banter: { chattiness: 100, lines: { yourPat: ['Pat!'], yourFour: ['Four!'] } } }]
    let state = dealt('AS 9H 7C 4D 2S', 'KS KH 8C 5D 3S')
    state = apply(apply(state, { type: 'check' }).state, { type: 'check' }).state
    const pat = step(state, { type: 'draw', discards: [] })
    expect(talk.react(pat.before, pat.events, pat.after, talkers)).toEqual({ seat: 1, text: 'Pat!' })
    expect(talk.react(pat.before, pat.events, pat.after, talkers)).toBeNull()
  })

  it('gives every regular a hello and a goodbye', () => {
    for (const r of REGULARS) {
      expect(r.banter.lines.hello?.length, r.name).toBeGreaterThan(0)
      expect(r.banter.lines.goodbye?.length, r.name).toBeGreaterThan(0)
    }
  })
})

describe('the dealer', () => {
  const name = (seat: number) => ['You', 'Dutch Hendry'][seat]

  it('says hands the way a dealer would', () => {
    expect(spoken(evaluate(hand('JC JS 7H 5D 2C')))).toBe('a pair of Jacks')
    expect(spoken(evaluate(hand('KC KS 7H 7D 2C')))).toBe('two pair, Kings and Sevens')
    expect(spoken(evaluate(hand('AC JS 7H 5D 2C')))).toBe('Ace high')
    expect(spoken(evaluate(hand('AH 9H 7H 4H 2H')))).toBe('a flush, Ace high')
  })

  it('calls the draw and the winner', () => {
    let state = dealt('AS AH 9C 6D 2S', 'KS KH 8C 5D 3S')
    let events: DrawEvent[] = []
    for (const a of [{ type: 'check' }, { type: 'check' }] as Action[]) {
      const r = step(state, a)
      events = r.events
      if (r.after.phase === 'drawing') expect(dealerCall(r.before, events, r.after, 0, name)).toBe('Pot’s right. Cards to the draw.')
      state = r.after
    }
    for (const a of [{ type: 'draw', discards: [] }, { type: 'draw', discards: [] }, { type: 'check' }, { type: 'bet' }] as Action[]) state = apply(state, a).state
    const fold = step(state, { type: 'fold' })
    expect(dealerCall(fold.before, fold.events, fold.after, 0, name)).toBe('Pot to Dutch Hendry.')
    const call = step(state, { type: 'call' })
    const show = step(call.after, { type: 'next' })
    expect(dealerCall(show.before, show.events, show.after, 0, name)).toBe('You take it with a pair of Aces.')
  })
})

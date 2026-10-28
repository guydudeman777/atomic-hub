import { describe, expect, it } from 'vitest'
import { type Card, FACE_RANKS, NUMBER_RANKS, type Rank, SUITS, type Suit, makeCard } from '../../core/cards'
import { createRng, pick } from '../../core/rng'
import {
  type Action,
  type DrawEvent,
  type DrawState,
  type Stakes,
  actor,
  apply,
  createTable,
  fromTheButton,
  isLegal,
  isValidDraw,
  legalActions,
  owed,
  potTotal,
  pots,
  seatAt,
} from './engine'

const STAKES: Stakes = { ante: 1, small: 10, big: 20 }

const card = (code: string): Card => makeCard('t', code.slice(0, -1) as Rank, code.slice(-1) as Suit)
const cards = (codes: string) => codes.split(' ').map(card)
const FULL = SUITS.flatMap((suit) => [...NUMBER_RANKS, ...FACE_RANKS].map((rank) => makeCard('t', rank, suit)))

/**
 * A deck that deals each seat the hand given, one card at a time in deal
 * order, then `then` off the top for the draw, then everything else.
 */
function rig(order: number[], hands: Record<number, string>, then = ''): Card[] {
  const dealt = Object.fromEntries(Object.entries(hands).map(([seat, codes]) => [seat, cards(codes)]))
  const deck: Card[] = []
  for (let k = 0; k < 5; k++) for (const seat of order) deck.push(dealt[seat][k])
  if (then) deck.push(...cards(then))
  const used = new Set(deck.map((c) => c.id))
  return [...deck, ...FULL.filter((c) => !used.has(c.id))]
}

interface Played {
  state: DrawState
  events: DrawEvent[]
}

/** Apply actions in order, collecting every event. */
function run(state: DrawState, ...actions: Action[]): Played {
  const events: DrawEvent[] = []
  for (const action of actions) {
    const result = apply(state, action)
    state = result.state
    events.push(...result.events)
  }
  return { state, events }
}

/** Let the dealer work until a player has to act or the hand is over. */
function dealerOn(state: DrawState): Played {
  const events: DrawEvent[] = []
  while (actor(state) === 'dealer') {
    const result = apply(state, { type: 'next' })
    state = result.state
    events.push(...result.events)
  }
  return { state, events }
}

/** A table with the button about to land on `button`, a rigged first hand dealt and the dealer done. */
function dealt(stacks: (number | null)[], button: number, hands: Record<number, string>, then = ''): Played {
  const order = fromTheButton({ seats: stacks.map((s) => (s ? { stack: s } : null)) as never, button }, (s) => !!s)
  let state = createTable({ stakes: STAKES, stacks, seed: 1, button: button - 1, decks: [rig(order, hands, then)] })
  const first = apply(state, { type: 'deal' })
  state = first.state
  const rest = dealerOn(state)
  return { state: rest.state, events: [...first.events, ...rest.events] }
}

const act = (type: 'fold' | 'check' | 'call' | 'bet' | 'raise'): Action => ({ type })
/** Draw for each player in turn: the cards each throws away, by code. */
function drawEach(state: DrawState, ...throws: string[]): DrawState {
  for (const codes of throws) state = apply(state, drawOf(state, codes)).state
  return state
}

const drawOf = (state: DrawState, codes = ''): Action => {
  const seat = state.seats[state.turn!]!
  const ids = codes ? codes.split(' ').map((code) => seat.cards.find((c) => c.id.startsWith(`t:${code}`))!.id) : []
  return { type: 'draw', discards: ids }
}

const totalCaps = (state: DrawState) => state.seats.reduce((n, s) => n + (s ? s.stack + (s.inHand && state.phase !== 'complete' ? s.committed : 0) : 0), 0)

describe('the deal', () => {
  it('takes the antes, then deals five each from the button’s left, one at a time', () => {
    const state = createTable({ stakes: STAKES, stacks: [50, 50, 50], seed: 7 })
    const { state: after, events } = run(state, { type: 'deal' })
    expect(events[0]).toEqual({ type: 'button', seat: 0 })
    expect(events.filter((e) => e.type === 'anted').map((e) => e.type === 'anted' && e.seat)).toEqual([1, 2, 0])
    expect(after.seats.map((s) => s!.stack)).toEqual([49, 49, 49])
    expect(potTotal(after)).toBe(3)

    const { state: ready, events: deal } = dealerOn(after)
    const to = deal.flatMap((e) => (e.type === 'dealt' ? [e.seat] : []))
    expect(to).toEqual([1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0])
    expect(ready.seats.every((s) => s!.cards.length === 5)).toBe(true)
    expect(ready.stock).toHaveLength(52 - 15)
    expect(ready.phase).toBe('betting')
    expect(ready.turn).toBe(1)
  })

  it('moves the button one seat left each hand, past empty chairs', () => {
    let state = createTable({ stakes: STAKES, stacks: [50, null, 50, 50], seed: 3 })
    const buttons: number[] = []
    for (let hand = 0; hand < 4; hand++) {
      const { state: next, events } = run(state, { type: 'deal' })
      buttons.push(next.button)
      expect(events[0]).toEqual({ type: 'button', seat: next.button })
      // Everyone checks it down.
      state = next
      while (state.phase !== 'complete') {
        state = dealerOn(state).state
        if (state.phase === 'complete') break
        state = apply(state, state.phase === 'drawing' ? drawOf(state) : act('check')).state
      }
    }
    expect(buttons).toEqual([0, 2, 3, 0])
  })

  it('deals nobody in without caps, and needs two players to deal', () => {
    const state = createTable({ stakes: STAKES, stacks: [50, 0, 50], seed: 3 })
    const { state: ready } = dealerOn(apply(state, { type: 'deal' }).state)
    expect(ready.seats[1]!.inHand).toBe(false)
    expect(ready.seats[1]!.cards).toEqual([])
    const alone = createTable({ stakes: STAKES, stacks: [50, 0, null], seed: 3 })
    expect(legalActions(alone)).toEqual([])
  })

  it('reproduces a hand from its seed', () => {
    const play = () => dealerOn(apply(createTable({ stakes: STAKES, stacks: [50, 50, 50], seed: 99 }), { type: 'deal' }).state).state
    expect(play().seats.map((s) => s!.cards.map((c) => c.id))).toEqual(play().seats.map((s) => s!.cards.map((c) => c.id)))
  })

  it('gives every hand’s cards their own ids', () => {
    let state = createTable({ stakes: STAKES, stacks: [50, 50], seed: 5 })
    state = dealerOn(apply(state, { type: 'deal' }).state).state
    expect(state.seats[0]!.cards[0].id).toMatch(/^saloon:\w+#1$/)
    state = run(state, act('bet'), act('fold')).state
    state = dealerOn(apply(state, { type: 'deal' }).state).state
    expect(state.seats[0]!.cards[0].id).toMatch(/#2$/)
  })
})

describe('betting', () => {
  const hands = { 0: 'AS AH 7C 4D 2S', 1: 'KS KH 8C 5D 3S', 2: 'QS QH 9C 6D 3H' }

  it('starts left of the button, and checks around go to the draw', () => {
    const { state } = dealt([50, 50, 50], 0, hands)
    expect(state.turn).toBe(1)
    expect(legalActions(state).map((a) => a.type)).toEqual(['check', 'bet'])
    const after = run(state, act('check'), act('check'), act('check'))
    expect(after.events.at(-1)).toEqual({ type: 'round-over', round: 1 })
    expect(after.state.phase).toBe('drawing')
    expect(after.state.turn).toBe(1)
  })

  it('won’t fold when checking is free', () => {
    const { state } = dealt([50, 50, 50], 0, hands)
    expect(isLegal(state, act('fold'))).toBe(false)
    expect(() => apply(state, act('fold'))).toThrow()
  })

  it('bets and raises the small bet before the draw, and caps a round at a bet and three raises', () => {
    const { state } = dealt([500, 500, 500], 0, hands)
    const after = run(state, act('bet'), act('raise'), act('raise'), act('raise'))
    expect(after.state.seats.map((s) => s!.roundBet)).toEqual([30, 40, 20])
    expect(after.state.toCall).toBe(40)
    // Seat 2 bet first; the cap is reached, so it's call or fold.
    expect(after.state.turn).toBe(2)
    expect(legalActions(after.state).map((a) => a.type)).toEqual(['fold', 'call'])
    expect(owed(after.state, 2)).toBe(20)
    const done = run(after.state, act('call'), act('call'))
    expect(done.state.phase).toBe('drawing')
    expect(potTotal(done.state)).toBe(3 + 120)
  })

  it('doubles the bet after the draw', () => {
    const { state } = dealt([500, 500, 500], 0, hands)
    let s = run(state, act('check'), act('check'), act('check')).state
    s = drawEach(s, '8C 5D 3S', '9C 6D 3H', '7C 4D 2S')
    expect(s.phase).toBe('betting')
    expect(s.round).toBe(2)
    const after = run(s, act('bet'), act('raise')).state
    expect(after.seats[1]!.roundBet).toBe(20)
    expect(after.seats[2]!.roundBet).toBe(40)
  })

  it('reopens the betting after a raise, even for players who already acted', () => {
    const { state } = dealt([500, 500, 500], 0, hands)
    const after = run(state, act('check'), act('bet'), act('call'))
    // Seat 1 checked, and now faces a bet: they may raise it.
    expect(after.state.turn).toBe(1)
    expect(legalActions(after.state).map((a) => a.type)).toEqual(['fold', 'call', 'raise'])
    const raised = run(after.state, act('raise'))
    expect(raised.state.turn).toBe(2)
    expect(legalActions(raised.state).map((a) => a.type)).toEqual(['fold', 'call', 'raise'])
  })

  it('ends the hand when everyone else folds, and the winner doesn’t show', () => {
    const { state } = dealt([50, 50, 50], 0, hands)
    const after = run(state, act('bet'), act('fold'), act('fold'))
    expect(after.state.phase).toBe('complete')
    expect(after.events).toContainEqual({ type: 'won', seat: 1, amount: 13, pot: 0, shown: false })
    expect(after.state.seats[1]!.stack).toBe(49 - 10 + 13)
    expect(after.state.seats.every((s) => !s!.shown)).toBe(true)
    const over = after.events.find((e) => e.type === 'hand-over')
    expect(over).toEqual({
      type: 'hand-over',
      results: [
        { seat: 0, committed: 1, won: 0 },
        { seat: 1, committed: 11, won: 13 },
        { seat: 2, committed: 1, won: 0 },
      ],
    })
  })
})

describe('the draw', () => {
  it('allows three cards, or four keeping an Ace', () => {
    const hand = cards('AS 9H 7C 4D 2S')
    const ids = (codes: string) => codes.split(' ').map((code) => hand.find((c) => c.id === card(code).id)!.id)
    expect(isValidDraw(hand, [])).toBe(true)
    expect(isValidDraw(hand, ids('9H 7C 4D'))).toBe(true)
    expect(isValidDraw(hand, ids('9H 7C 4D 2S'))).toBe(true)
    expect(isValidDraw(hand, ids('AS 7C 4D 2S'))).toBe(false)
    expect(isValidDraw(hand, ids('AS 9H 7C 4D 2S'))).toBe(false)
    expect(isValidDraw(hand, [...ids('9H'), ...ids('9H')])).toBe(false)
    expect(isValidDraw(hand, ['t:KH'])).toBe(false)
  })

  it('replaces the discards in place, in turn from the button’s left, and remembers how many each drew', () => {
    const { state } = dealt(
      [50, 50, 50],
      0,
      { 0: 'AS AH 7C 4D 2S', 1: 'KS KH 8C 5D 3S', 2: '9S 9H 9C 6D 3H' },
      'KD 2H 4H JC JD',
    )
    let s = run(state, act('check'), act('check'), act('check')).state
    const before = s.seats[1]!.cards.map((c) => c.id)
    const first = run(s, drawOf(s, '8C 5D 3S'))
    s = first.state
    expect(first.events).toContainEqual(expect.objectContaining({ type: 'drew', seat: 1 }))
    expect(s.seats[1]!.cards.map((c) => c.id)).toEqual([before[0], before[1], 't:KD', 't:2H', 't:4H'])
    expect(s.turn).toBe(2)
    s = run(s, drawOf(s, '6D 3H')).state
    expect(s.seats[2]!.cards.slice(3).map((c) => c.id)).toEqual(['t:JC', 't:JD'])
    s = run(s, drawOf(s)).state
    expect(s.seats.map((x) => x!.drew)).toEqual([0, 3, 2])
    expect(s.phase).toBe('betting')
    expect(s.round).toBe(2)
  })

  it('covers the biggest possible draw at a full table', () => {
    // Six players: four keep an Ace and draw four, two draw three. That's the 22 cards left.
    const ace = ['AS 9H 7C 4D 2S', 'AH 9S 7D 4C 2H', 'AD 9C 7H 4S 2D', 'AC 8H 6C 3D 10S', 'KS 8S 6D 3C 10H', 'KH 8D 6H 3S 10D']
    const { state } = dealt([50, 50, 50, 50, 50, 50], 5, Object.fromEntries(ace.map((h, i) => [i, h])))
    let s = state
    for (let i = 0; i < 6; i++) s = apply(s, act('check')).state
    expect(s.phase).toBe('drawing')
    const events: DrawEvent[] = []
    while (s.phase === 'drawing') {
      const seat = s.seats[s.turn!]!
      const keep = seat.cards.find((c) => c.rank === 'A')
      const discards = keep ? seat.cards.filter((c) => c !== keep).map((c) => c.id) : seat.cards.slice(2).map((c) => c.id)
      const r = apply(s, { type: 'draw', discards })
      s = r.state
      events.push(...r.events)
    }
    expect(events.filter((e) => e.type === 'drew').reduce((n, e) => n + (e.type === 'drew' ? e.drawn.length : 0), 0)).toBe(22)
    expect(s.stock).toHaveLength(0)
    const all = s.seats.flatMap((x) => x!.cards.map((c) => c.id))
    expect(new Set(all).size).toBe(30)
  })
})

describe('the showdown', () => {
  it('turns every hand still in face up and pays the best', () => {
    const { state } = dealt([50, 50, 50], 0, { 0: 'AS AH 7C 4D 2S', 1: 'KS KH 8C 5D 3S', 2: 'QS QH 9C 6D 3H' })
    let s = run(state, act('bet'), act('fold'), act('call')).state
    s = drawEach(s, '', '')
    s = run(s, act('check'), act('check')).state
    expect(s.phase).toBe('showdown')
    const { state: done, events } = run(s, { type: 'next' })
    expect(events[0]).toMatchObject({ type: 'showdown', hands: [{ seat: 1 }, { seat: 0 }] })
    expect(events).toContainEqual({ type: 'won', seat: 0, amount: 23, pot: 0, shown: true })
    expect(done.seats[0]!.shown && done.seats[1]!.shown).toBe(true)
    expect(done.seats[2]!.shown).toBe(false)
    expect(done.payouts).toEqual([{ seat: 0, amount: 23, pot: 0 }])
  })

  it('splits a tie, with the odd cap to the first winner left of the button', () => {
    const { state } = dealt([50, 50, 50], 0, { 0: 'AS KH 9C 6D 3S', 1: 'AH KS 9D 6C 3H', 2: 'QS QH 9H 6H 4S' })
    let s = run(state, act('check'), act('check'), act('check')).state
    s = drawEach(s, '', '', '')
    // Seat 2 folds their Queens to a bet, so the two Ace-highs split the pot.
    s = run(s, act('check'), act('check'), act('bet'), act('call'), act('fold')).state
    const { events } = run(s, { type: 'next' })
    const won = events.filter((e) => e.type === 'won')
    // 3 antes and 20 each from seats 0 and 1, 43 in all: 22 to seat 1, first left of the button.
    expect(won).toEqual([
      { type: 'won', seat: 1, amount: 22, pot: 0, shown: true },
      { type: 'won', seat: 0, amount: 21, pot: 0, shown: true },
    ])
  })

  it('lets a short stack bet all in, and the next player complete the bet', () => {
    // Seat 1 has 5 caps after the ante: a short bet, which isn't a full one.
    const { state } = dealt([100, 6, 100], 0, { 0: 'KS KH 8C 5D 3S', 1: 'AS AH 7C 4D 2S', 2: 'QS QH 9C 6D 3H' })
    let s = run(state, act('bet')).state
    expect(s.seats[1]!.stack).toBe(0)
    expect(s.toCall).toBe(5)
    expect(s.bets).toBe(0)
    expect(legalActions(s).map((a) => a.type)).toEqual(['fold', 'call', 'raise'])
    // Completing it takes the bet to 10, a full bet.
    s = run(s, act('raise')).state
    expect(s.seats[2]!.roundBet).toBe(10)
    expect(s.bets).toBe(1)
    s = run(s, act('call')).state
    expect(s.phase).toBe('drawing')
    expect(pots(s).map((p) => [p.amount, p.eligible])).toEqual([
      [18, [0, 1, 2]],
      [10, [0, 2]],
    ])
  })

  it('pays the main pot and side pot to different hands', () => {
    // Seat 1 goes all in for 15 on a call; seats 0 and 2 build a side pot.
    const { state } = dealt([100, 16, 100], 0, { 0: 'KS KH 8C 5D 3S', 1: 'AS AH 7C 4D 2S', 2: 'QS QH 9C 6D 3H' })
    let s = run(state, act('bet'), act('raise'), act('call')).state
    // Seat 1 bet 10, seat 2 raised to 20, seat 0 called 20; seat 1 has 5 left to call with.
    expect(s.turn).toBe(1)
    s = run(s, act('call')).state
    expect(s.seats[1]!.stack).toBe(0)
    expect(s.phase).toBe('drawing')
    s = run(s, drawOf(s), drawOf(s), drawOf(s)).state
    s = run(s, act('check'), act('bet'), act('call')).state
    expect(pots(s).map((p) => [p.amount, p.eligible])).toEqual([
      [48, [0, 1, 2]],
      [50, [0, 2]],
    ])
    const { events, state: done } = run(s, { type: 'next' })
    // Aces take the main pot; Kings beat Queens for the side pot.
    expect(events.filter((e) => e.type === 'won')).toEqual([
      { type: 'won', seat: 1, amount: 48, pot: 0, shown: true },
      { type: 'won', seat: 0, amount: 50, pot: 1, shown: true },
    ])
    expect(done.seats.map((x) => x!.stack)).toEqual([100 - 41 + 50, 48, 100 - 41])
  })

  it('doesn’t let a short all-in raise reopen the betting', () => {
    // Seat 2 has 15 after the ante: a call of 10 and 5 more, short of a raise.
    const { state } = dealt([100, 100, 16], 0, { 0: 'KS KH 8C 5D 3S', 1: 'AS AH 7C 4D 2S', 2: 'QS QH 9C 6D 3H' })
    let s = run(state, act('bet'), act('raise')).state
    expect(s.seats[2]!.roundBet).toBe(15)
    expect(s.seats[2]!.stack).toBe(0)
    expect(s.bets).toBe(1)
    // Seat 0 hasn't acted: they may raise to the next full level, 20.
    expect(legalActions(s).map((a) => a.type)).toEqual(['fold', 'call', 'raise'])
    s = run(s, act('call')).state
    // Seat 1 bet and has acted since: they owe 5 and may only call or fold.
    expect(s.turn).toBe(1)
    expect(owed(s, 1)).toBe(5)
    expect(legalActions(s).map((a) => a.type)).toEqual(['fold', 'call'])
    s = run(s, act('call')).state
    expect(s.phase).toBe('drawing')
  })

  it('skips the betting when only one player has caps left to bet', () => {
    const { state } = dealt([100, 11, 100], 0, { 0: 'KS KH 8C 5D 3S', 1: 'AS AH 7C 4D 2S', 2: 'QS QH 9C 6D 3H' })
    let s = run(state, act('bet'), act('call'), act('fold')).state
    s = run(s, drawOf(s), drawOf(s)).state
    // Seat 1 is all in and seat 2 folded: nobody to bet against, straight to the showdown.
    expect(s.phase).toBe('showdown')
    const { events } = run(s, { type: 'next' })
    expect(events).toContainEqual({ type: 'won', seat: 1, amount: 23, pot: 0, shown: true })
  })
})

describe('between hands', () => {
  it('seats players and tops up stacks only between hands', () => {
    let state = createTable({ stakes: STAKES, stacks: [50, null, 50], seed: 2 })
    state = seatAt(state, 1, 80)
    expect(state.seats[1]!.stack).toBe(80)
    const dealing = apply(state, { type: 'deal' }).state
    expect(() => seatAt(dealing, 1, null)).toThrow()
  })

  it('never makes or loses a cap, over many random hands', () => {
    const rng = createRng(11)
    let state = createTable({ stakes: STAKES, stacks: [60, 30, 90, 15, 45, 120], seed: 11 })
    const start = totalCaps(state)
    for (let hand = 0; hand < 300 && legalActions(state).length; hand++) {
      state = apply(state, { type: 'deal' }).state
      while (state.phase !== 'complete') {
        expect(totalCaps(state)).toBe(start)
        const who = actor(state)
        if (who === 'dealer') {
          state = apply(state, { type: 'next' }).state
        } else if (state.phase === 'drawing') {
          const hand = state.seats[who!]!.cards
          const n = Math.floor(rng() * 4)
          state = apply(state, { type: 'draw', discards: hand.slice(0, n).map((c) => c.id) }).state
        } else {
          state = apply(state, pick(legalActions(state), rng)).state
        }
      }
      expect(totalCaps(state)).toBe(start)
      expect(state.seats.every((s) => !s || s.stack >= 0)).toBe(true)
    }
  })
})

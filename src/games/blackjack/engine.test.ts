import { describe, expect, it } from 'vitest'
import { type Card, parseCardId } from '../../core/cards'
import { createRng, randInt } from '../../core/rng'
import {
  type Action,
  type TableEvent,
  type TableState,
  CUT_CARD_DEPTH,
  SHOE_SIZE,
  actor,
  apply,
  cardsLeft,
  createTable,
  currentHand,
  dealerShowing,
  discards,
  freshShoe,
  handTotal,
  isLegal,
  legalActions,
} from './engine'

const LIMITS = { min: 5, max: 500 }

/** `cards('AS 10H')` → Ace of spades, 10 of hearts. */
const cards = (codes: string): Card[] => codes.split(' ').map((code) => parseCardId(`x:${code}`))

/** A shoe whose first cards are `codes`, in order; the rest of the six decks follow. */
function rigged(codes: string): Card[] {
  const rest = freshShoe(1)
  const top = codes.split(' ').map((code) => {
    const i = rest.findIndex((c) => `${c.rank}${c.suit}` === code)
    if (i === -1) throw new Error(`No ${code} left in the shoe`)
    return rest.splice(i, 1)[0]
  })
  return [...top, ...rest]
}

function table(codes: string, spots = 1): TableState {
  return createTable({ spots, limits: LIMITS, seed: 7, shoe: rigged(codes) })
}

interface Run {
  state: TableState
  events: TableEvent[]
}

/** Apply actions in order; `'auto'` runs the dealer until somebody else has a decision. */
function run(state: TableState, ...actions: (Action | 'auto')[]): Run {
  const events: TableEvent[] = []
  for (const action of actions) {
    if (action === 'auto') {
      while (actor(state) === 'dealer') {
        const r = apply(state, { type: 'next' })
        state = r.state
        events.push(...r.events)
      }
    } else {
      const r = apply(state, action)
      state = r.state
      events.push(...r.events)
    }
  }
  return { state, events }
}

const deal = (...bets: number[]): Action => ({ type: 'deal', bets })
const hit: Action = { type: 'hit' }
const stand: Action = { type: 'stand' }
const double: Action = { type: 'double' }
const split: Action = { type: 'split' }

const results = (events: TableEvent[]) => events.find((e) => e.type === 'settled')

describe('hand totals', () => {
  it('counts an Ace as 11 when it fits', () => {
    expect(handTotal(cards('AS 6H'))).toEqual({ total: 17, soft: true })
    expect(handTotal(cards('AS 6H 10D'))).toEqual({ total: 17, soft: false })
    expect(handTotal(cards('AS AH'))).toEqual({ total: 12, soft: true })
    expect(handTotal(cards('AS AH 9C'))).toEqual({ total: 21, soft: true })
    expect(handTotal(cards('KS QH'))).toEqual({ total: 20, soft: false })
  })
})

describe('the shoe', () => {
  it('holds six full decks with unique ids', () => {
    const shoe = freshShoe(1)
    expect(shoe).toHaveLength(SHOE_SIZE)
    expect(new Set(shoe.map((c) => c.id)).size).toBe(SHOE_SIZE)
    expect(shoe.filter((c) => c.rank === 'A')).toHaveLength(24)
  })

  it('is the same shoe for the same seed', () => {
    const a = createTable({ spots: 1, limits: LIMITS, seed: 99 })
    const b = createTable({ spots: 1, limits: LIMITS, seed: 99 })
    expect(a.shoe.map((c) => c.id)).toEqual(b.shoe.map((c) => c.id))
    expect(createTable({ spots: 1, limits: LIMITS, seed: 100 }).shoe.map((c) => c.id)).not.toEqual(a.shoe.map((c) => c.id))
  })

  it('reshuffles before the next round once the cut card is out', () => {
    let state = createTable({ spots: 1, limits: LIMITS, seed: 3 })
    state = { ...state, phase: 'settled', dealt: state.cutCard - 1 }
    const kept = run(state, deal(10))
    expect(kept.events.some((e) => e.type === 'shuffled')).toBe(false)
    state = { ...state, dealt: state.cutCard }
    expect(cardsLeft(state)).toBe(CUT_CARD_DEPTH)
    const fresh = run(state, deal(10), 'auto')
    expect(fresh.events[0]).toEqual({ type: 'shuffled' })
    expect(fresh.state.shoes).toBe(2)
    expect(cardsLeft(fresh.state)).toBeGreaterThan(SHOE_SIZE - 10)
  })
})

describe('the deal', () => {
  it('goes around from first base twice, the dealer last, hole card down', () => {
    const { state, events } = run(table('2S 3S 4S 5S 6S 7S', 3), deal(10, 0, 20), 'auto')
    const dealt = events.flatMap((e) => (e.type === 'dealt' ? [[e.to, `${e.card.rank}${e.card.suit}`, e.faceDown]] : []))
    expect(dealt).toEqual([
      [0, '2S', false],
      [2, '3S', false],
      ['dealer', '4S', false],
      [0, '5S', false],
      [2, '6S', false],
      ['dealer', '7S', true],
    ])
    expect(state.spots[1].hands).toEqual([])
    expect(state.phase).toBe('playing')
    expect(state.turn).toEqual({ spot: 0, hand: 0 })
    expect(dealerShowing(state)).toEqual({ total: 4, soft: false })
  })

  it('only takes bets inside the table limits', () => {
    const state = table('2S')
    expect(isLegal(state, deal(4))).toBe(false)
    expect(isLegal(state, deal(501))).toBe(false)
    expect(isLegal(state, deal(0))).toBe(false)
    expect(isLegal(state, deal(7.5))).toBe(false)
    expect(isLegal(state, deal(5))).toBe(true)
    expect(() => apply(state, deal(1))).toThrow(/Illegal/)
  })
})

describe('paying out', () => {
  it('pays blackjack 3 to 2, rounded down, without asking anything', () => {
    // You: A K. Dealer: 9 up, 7 down.
    const { state, events } = run(table('AS 9H KD 7C'), deal(5), 'auto')
    expect(state.phase).toBe('settled')
    expect(state.spots[0].hands[0].outcome).toBe('blackjack')
    expect(results(events)).toEqual({ type: 'settled', results: [{ spot: 0, staked: 5, returned: 12 }] })
  })

  it('pays a win even money and returns a push', () => {
    // You: 10 9 = 19. Dealer: 10 8 = 18.
    const win = run(table('10S 10H 9D 8C'), deal(20), 'auto', stand, 'auto')
    expect(results(win.events)).toMatchObject({ results: [{ staked: 20, returned: 40 }] })
    // You: 10 8. Dealer: 10 8.
    const push = run(table('10S 10H 8D 8C'), deal(20), 'auto', stand, 'auto')
    expect(push.state.spots[0].hands[0].outcome).toBe('push')
    expect(results(push.events)).toMatchObject({ results: [{ staked: 20, returned: 20 }] })
  })

  it('takes a bust at once, and the dealer still wins if they bust later', () => {
    // You: 10 6, hit K. Dealer: 10 6, would draw 10 and bust.
    const { state, events } = run(table('10S 10H 6D 6C KD 10C'), deal(20), 'auto', hit)
    expect(events).toContainEqual({ type: 'busted', spot: 0, hand: 0 })
    expect(state.spots[0].hands[0]).toMatchObject({ outcome: 'bust', done: true })
    const end = run(state, 'auto')
    // Nothing left to play for, so the dealer turns over the hole card and stops.
    expect(end.state.dealer).toHaveLength(2)
    expect(results(end.events)).toMatchObject({ results: [{ staked: 20, returned: 0 }] })
  })
})

describe('the dealer', () => {
  it('stands on soft 17', () => {
    // You: 10 9. Dealer: A 6.
    const { state, events } = run(table('10S AH 9D 6C 5S', 1), deal(10), 'auto', { type: 'insurance', take: false }, 'auto', stand, 'auto')
    expect(state.dealer).toHaveLength(2)
    expect(events).toContainEqual({ type: 'dealer-done', total: 17, busted: false })
    expect(state.spots[0].hands[0].outcome).toBe('win')
  })

  it('draws to 17', () => {
    // You: 10 8. Dealer: 10 2, draws 3 (15), then 4 (19).
    const { state } = run(table('10S 10H 8D 2C 3S 4S'), deal(10), 'auto', stand, 'auto')
    expect(state.dealer.map((c) => c.rank)).toEqual(['10', '2', '3', '4'])
    expect(state.spots[0].hands[0].outcome).toBe('lose')
  })
})

describe('checking for blackjack', () => {
  it('ends the round before anyone plays when the dealer has one', () => {
    // Spot 0: 10 9. Spot 1: A K (blackjack). Dealer: K A.
    const { state, events } = run(table('10S AH KH 9D KD AC', 2), deal(10, 10), 'auto')
    expect(events).toContainEqual({ type: 'peeked', blackjack: true })
    expect(state.phase).toBe('settled')
    expect(state.holeRevealed).toBe(true)
    expect(state.spots[0].hands[0].outcome).toBe('lose')
    expect(state.spots[1].hands[0].outcome).toBe('push')
  })

  it('plays on when the hole card is no blackjack', () => {
    const { state, events } = run(table('10S KH 9D 7C'), deal(10), 'auto')
    expect(events).toContainEqual({ type: 'peeked', blackjack: false })
    expect(state.phase).toBe('playing')
    expect(state.holeRevealed).toBe(false)
  })
})

describe('insurance', () => {
  const take = { type: 'insurance', take: true } as const
  const decline = { type: 'insurance', take: false } as const

  it('is offered to each spot in turn when the dealer shows an Ace', () => {
    const { state } = run(table('10S 9S AH 9D 8D KC', 2), deal(10, 20), 'auto')
    expect(state.phase).toBe('insurance')
    expect(state.turn).toEqual({ spot: 0, hand: 0 })
    const next = run(state, take)
    expect(next.events).toContainEqual({ type: 'staked', spot: 0, amount: 5 })
    expect(next.state.turn).toEqual({ spot: 1, hand: 0 })
  })

  it('pays 2 to 1 when the dealer has blackjack, which saves the bet', () => {
    // You: 10 9. Dealer: A K.
    const { state, events } = run(table('10S AH 9D KC'), deal(20), 'auto', take, 'auto')
    expect(state.phase).toBe('settled')
    expect(results(events)).toMatchObject({ results: [{ staked: 30, returned: 30 }] })
  })

  it('is lost when the dealer has no blackjack, and play goes on', () => {
    // You: 10 9. Dealer: A 7, stands on soft 18.
    const { state, events } = run(table('10S AH 9D 7C'), deal(20), 'auto', take, 'auto')
    expect(state.phase).toBe('playing')
    const end = run(state, stand, 'auto')
    expect(end.state.spots[0].hands[0].outcome).toBe('win')
    expect(results([...events, ...end.events])).toMatchObject({ results: [{ staked: 30, returned: 40 }] })
  })

  it('on a blackjack is even money either way', () => {
    // You: A K. Dealer: A, then a K or a 7 underneath.
    for (const hole of ['KC', '7C']) {
      const { events } = run(table(`AS AH KD ${hole}`), deal(20), 'auto', take, 'auto')
      expect(results(events)).toMatchObject({ results: [{ staked: 30, returned: 50 }] })
    }
  })

  it('can only be declined when you can’t cover it', () => {
    const { state } = run(table('10S AH 9D 7C'), deal(20), 'auto')
    expect(legalActions(state, 9)).toEqual([decline])
    expect(legalActions(state, 10)).toEqual([take, decline])
  })
})

describe('doubling down', () => {
  it('doubles the bet for exactly one card', () => {
    // You: 6 5 = 11, double, draw 10 = 21. Dealer: 10 8.
    const { state, events } = run(table('6S 10H 5D 8C 10C'), deal(25), 'auto', double)
    expect(events).toContainEqual({ type: 'staked', spot: 0, amount: 25 })
    expect(state.spots[0].hands[0]).toMatchObject({ bet: 50, doubled: true, done: true })
    expect(results(run(state, 'auto').events)).toMatchObject({ results: [{ staked: 50, returned: 100 }] })
  })

  it('stands after the one card even on a low total', () => {
    // You: 6 5, double, draw 2 = 13.
    const { state } = run(table('6S 10H 5D 8C 2C'), deal(25), 'auto', double)
    expect(state.spots[0].hands[0].done).toBe(true)
    expect(state.phase).toBe('dealer')
  })

  it('needs the caps to cover it, and only on the first two cards', () => {
    const { state } = run(table('6S 10H 5D 8C 2C'), deal(25), 'auto')
    expect(legalActions(state, 24).map((a) => a.type)).toEqual(['hit', 'stand'])
    expect(legalActions(state, 25).map((a) => a.type)).toEqual(['hit', 'stand', 'double'])
    const after = run(state, hit).state
    expect(legalActions(after).map((a) => a.type)).toEqual(['hit', 'stand'])
  })
})

describe('splitting', () => {
  it('plays each hand in turn, with a second card for each, and allows doubling after', () => {
    // You: 8 8. Dealer: 6 10. Hand 1 gets 3 (11) and doubles onto 9 (20); hand 2 gets 10 (18).
    let r = run(table('8S 6H 8D 10C 3S 9S 10D'), deal(10), 'auto', split)
    expect(r.state.spots[0].hands.map((h) => h.cards.map((c) => c.rank))).toEqual([['8', '3'], ['8']])
    expect(r.state.turn).toEqual({ spot: 0, hand: 0 })
    expect(legalActions(r.state).map((a) => a.type)).toContain('double')
    r = run(r.state, double)
    expect(r.state.turn).toEqual({ spot: 0, hand: 1 })
    expect(r.state.spots[0].hands[1].cards.map((c) => c.rank)).toEqual(['8', '10'])
    r = run(r.state, stand, 'auto')
    // Dealer: 6 10 = 16, draws... whatever comes next; check the stakes add up.
    const settled = results(r.events)
    expect(settled?.type === 'settled' && settled.results[0].staked).toBe(30)
  })

  it('gives split Aces one card each, and a 21 there is not a blackjack', () => {
    // You: A A. Dealer: 9 7, draws 2. Split: K (21) and 5 (16).
    const { state } = run(table('AS 9H AD 7C KS 5S 2C'), deal(10), 'auto', split)
    expect(state.spots[0].hands.map((h) => h.cards.map((c) => c.rank))).toEqual([['A', 'K'], ['A', '5']])
    expect(state.spots[0].hands.every((h) => h.done)).toBe(true)
    const end = run(state, 'auto')
    expect(end.state.spots[0].hands.map((h) => [h.outcome, h.payout])).toEqual([
      ['win', 20],
      ['lose', 0],
    ])
  })

  it('doesn’t split Aces again', () => {
    // You: A A, split, the first Ace catches another Ace.
    const { state } = run(table('AS 9H AD 7C AC 5S'), deal(10), 'auto', split)
    expect(state.spots[0].hands).toHaveLength(2)
    expect(state.phase).toBe('dealer')
  })

  it('treats any two ten-value cards as a pair, up to four hands', () => {
    // You: K Q. Dealer: 6 10. Each split catches another ten.
    let state = run(table('KS 6H QD 10C JS 10S KD QS 5S 4S 3S'), deal(10), 'auto').state
    for (let i = 0; i < 3; i++) {
      expect(legalActions(state).map((a) => a.type)).toContain('split')
      state = run(state, split).state
    }
    expect(state.spots[0].hands).toHaveLength(4)
    expect(legalActions(state).map((a) => a.type)).not.toContain('split')
  })

  it('needs the caps to cover the second hand', () => {
    const { state } = run(table('8S 6H 8D 10C'), deal(10), 'auto')
    expect(legalActions(state, 9).map((a) => a.type)).toEqual(['hit', 'stand'])
  })
})

describe('the round as a whole', () => {
  it('hands the turn from spot to spot and keeps the discards', () => {
    // Spot 0: 10 9, spot 1: 10 7. Dealer: 10 8.
    let r = run(table('10S 10H 10D 9D 7S 8C', 2), deal(10, 10), 'auto')
    expect(currentHand(r.state)?.cards.map((c) => c.rank)).toEqual(['10', '9'])
    r = run(r.state, stand)
    expect(r.state.turn).toEqual({ spot: 1, hand: 0 })
    r = run(r.state, stand, 'auto')
    expect(r.state.spots.map((s) => s.hands[0].outcome)).toEqual(['win', 'lose'])
    const next = run(r.state, deal(10, 0))
    expect(discards(next.state)).toBe(6)
  })

  it('keeps every round legal under random play', () => {
    const rng = createRng(2024)
    let state = createTable({ spots: 5, limits: LIMITS, seed: 11 })
    for (let round = 0; round < 400; round++) {
      const bets = state.spots.map(() => (rng() < 0.7 ? 5 + randInt(rng, 50) : 0))
      if (!bets.some((b) => b > 0)) bets[0] = 5
      state = apply(state, deal(...bets)).state
      let staked = bets.reduce((a, b) => a + b, 0)
      while (state.phase !== 'settled') {
        const actions = legalActions(state)
        const action = actions[randInt(rng, actions.length)]
        const r = apply(state, action)
        for (const e of r.events) {
          if (e.type === 'staked') staked += e.amount
          if (e.type === 'settled') expect(e.results.reduce((n, s) => n + s.staked, 0)).toBe(staked)
        }
        state = r.state
      }
      for (const spot of state.spots) {
        for (const hand of spot.hands) {
          const { total } = handTotal(hand.cards)
          expect(hand.outcome === 'bust').toBe(total > 21)
          expect(hand.done).toBe(true)
        }
      }
      // Unless the dealer had blackjack, anyone left standing made the dealer play to 17.
      const dealer = handTotal(state.dealer).total
      const dealerBlackjack = dealer === 21 && state.dealer.length === 2
      const live = state.spots.some((s) => s.hands.some((h) => h.outcome !== 'bust' && h.outcome !== 'blackjack'))
      if (live && !dealerBlackjack) expect(dealer).toBeGreaterThanOrEqual(17)
    }
  })
})

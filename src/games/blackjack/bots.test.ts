import { describe, expect, it } from 'vitest'
import { type Card, parseCardId } from '../../core/cards'
import { type BotStyle, botAction, botBet, freshMemory, remember } from './bots'
import { REGULARS } from './content'
import { type TableState, actor, apply, createTable, freshShoe } from './engine'

const LIMITS = { min: 10, max: 1000 }

/** Average result per caps bet, playing one spot heads-up for `rounds` rounds. */
function edge(style: BotStyle, rounds: number, seed: number): number {
  let state = createTable({ spots: 1, limits: LIMITS, seed })
  let memory = freshMemory()
  let wagered = 0
  let net = 0
  for (let r = 0; r < rounds; r++) {
    const bet = botBet(style, memory, state, Infinity)
    wagered += bet
    state = apply(state, { type: 'deal', bets: [bet] }).state
    let roundNet = 0
    while (state.phase !== 'settled') {
      const result = apply(state, actor(state) === 'dealer' ? { type: 'next' } : botAction(style, state, Infinity))
      for (const e of result.events) if (e.type === 'settled') roundNet = e.results[0].returned - e.results[0].staked
      state = result.state
    }
    net += roundNet
    memory = remember(bet, roundNet)
  }
  return net / wagered
}

const flat = (play: BotStyle['play']): BotStyle => ({ play, betting: 'flat', insurance: 'never', unit: 1 })

describe('bot play', () => {
  // Two million rounds of basic strategy come to −0.40%, the published house
  // edge for these rules. These shorter runs keep the tests quick.
  it('basic strategy keeps the house edge small; playing like the dealer doesn’t', { timeout: 60_000 }, () => {
    const book = edge(flat('book'), 60_000, 5)
    const mimic = edge(flat('mimic'), 60_000, 5)
    expect(book).toBeGreaterThan(-0.015)
    expect(book).toBeLessThan(0.01)
    expect(mimic).toBeLessThan(-0.03)
  })

  it('only makes legal moves, whatever the style', () => {
    for (const regular of REGULARS) expect(() => edge(regular.style, 300, 9)).not.toThrow()
  })

  it('takes insurance by its own rule', () => {
    const shoe = [...'10S AH 9D 7C'.split(' ').map((c) => parseCardId(`x:${c}`)), ...freshShoe(1)]
    let state: TableState = createTable({ spots: 1, limits: LIMITS, seed: 1, shoe })
    state = apply(state, { type: 'deal', bets: [20] }).state
    while (actor(state) === 'dealer') state = apply(state, { type: 'next' }).state
    expect(state.phase).toBe('insurance')
    const style = (insurance: BotStyle['insurance']): BotStyle => ({ ...flat('book'), insurance })
    expect(botAction(style('always'), state, 100)).toEqual({ type: 'insurance', take: true })
    expect(botAction(style('never'), state, 100)).toEqual({ type: 'insurance', take: false })
    expect(botAction(style('even-money'), state, 100)).toEqual({ type: 'insurance', take: false })
    // It can't take what it can't cover.
    expect(botAction(style('always'), state, 5)).toEqual({ type: 'insurance', take: false })
  })
})

describe('bot betting', () => {
  const state = createTable({ spots: 1, limits: LIMITS, seed: 1 })

  it('doubles up after a loss on the martingale, and starts over after a win', () => {
    const martin: BotStyle = { ...flat('book'), betting: 'martingale' }
    let memory = freshMemory()
    const bets: number[] = []
    for (const net of [-1, -1, -1, 1, -1]) {
      const bet = botBet(martin, memory, state, 10_000)
      bets.push(bet)
      memory = remember(bet, net * bet)
    }
    expect(bets).toEqual([10, 20, 40, 80, 10])
  })

  it('lets wins ride on a parlay, up to eight times the base bet', () => {
    const dixie: BotStyle = { ...flat('book'), betting: 'parlay' }
    let memory = freshMemory()
    const bets: number[] = []
    for (let i = 0; i < 5; i++) {
      const bet = botBet(dixie, memory, state, 10_000)
      bets.push(bet)
      memory = remember(bet, bet)
    }
    expect(bets).toEqual([10, 20, 40, 80, 10])
  })

  it('spreads with the count, and starts low on a new shoe', () => {
    const grey: BotStyle = { ...flat('counter'), betting: 'spread' }
    // Twenty small cards out: a running count of +20 over 292 cards left, a true count of 3.6.
    const shoe = freshShoe(1)
    const low: Card[] = shoe.filter((c) => ['2', '3', '4', '5', '6'].includes(c.rank)).slice(0, 20)
    const hot = { ...state, shoe: [...low, ...shoe.filter((c) => !low.includes(c))], dealt: 20 }
    expect(botBet(grey, freshMemory(), state, 10_000)).toBe(10)
    expect(botBet(grey, freshMemory(), hot, 10_000)).toBe(40)
    expect(botBet(grey, freshMemory(), { ...hot, dealt: hot.cutCard }, 10_000)).toBe(10)
  })

  it('bets what it has left, and nothing below the minimum', () => {
    const sal: BotStyle = { ...flat('mimic'), unit: 4 }
    expect(botBet(sal, freshMemory(), state, 25)).toBe(25)
    expect(botBet(sal, freshMemory(), state, 9)).toBe(0)
  })
})

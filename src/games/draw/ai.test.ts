import { describe, expect, it } from 'vitest'
import { type Card, FACE_RANKS, NUMBER_RANKS, type Rank, SUITS, type Suit, makeCard } from '../../core/cards'
import { categoryOf, scoreOf } from '../../core/poker'
import { createRng, shuffle } from '../../core/rng'
import { SOLID, type Style, beats, botAction, chooseDraw, equity, finalPools } from './ai'
import { REGULARS } from './content'
import { bookDraw } from './strategy'
import { type DrawState, actor, apply, createTable, isLegal, owed, seatAt } from './engine'

const hand = (codes: string): Card[] => codes.split(' ').map((code) => makeCard('t', code.slice(0, -1) as Rank, code.slice(-1) as Suit))
const DECK = SUITS.flatMap((suit) => [...NUMBER_RANKS, ...FACE_RANKS].map((rank) => makeCard('t', rank, suit)))
const STYLES: Style[] = [SOLID, ...REGULARS.map((r) => r.style)]
const STAKES = { ante: 5, small: 10, big: 20 }

/** A rigged two-handed hand: seat 0 holds `mine`, seat 1 `theirs`, dealt with seat 1 on the button. */
function headsUp(mine: string, theirs: string, then = ''): DrawState {
  const a = hand(mine)
  const b = hand(theirs)
  const top = [0, 1, 2, 3, 4].flatMap((k) => [a[k], b[k]])
  const next = then ? hand(then) : []
  const used = new Set([...top, ...next].map((c) => c.id))
  const deck = [...top, ...next, ...DECK.filter((c) => !used.has(c.id))]
  let state = createTable({ stakes: STAKES, stacks: [1000, 1000], seed: 1, button: 0, decks: [deck] })
  state = apply(state, { type: 'deal' }).state
  while (actor(state) === 'dealer') state = apply(state, { type: 'next' }).state
  return state
}

/** Play `hands` hands among `styles`, one per seat, with deep stacks. Returns each seat's net caps. */
function play(styles: Style[], hands: number, seed: number, check?: (state: DrawState, seat: number) => void): number[] {
  let state = createTable({ stakes: STAKES, stacks: styles.map(() => 20_000), seed })
  const rng = createRng(seed ^ 0xabc)
  const net = styles.map(() => 0)
  for (let h = 0; h < hands; h++) {
    for (let i = 0; i < styles.length; i++) state = seatAt(state, i, 20_000)
    state = apply(state, { type: 'deal' }).state
    while (state.phase !== 'complete') {
      const who = actor(state)
      if (who !== 'dealer') check?.(state, who!)
      const result = apply(state, who === 'dealer' ? { type: 'next' } : botAction(state, who!, styles[who!], rng))
      state = result.state
      for (const e of result.events) if (e.type === 'hand-over') for (const r of e.results) net[r.seat] += r.won - r.committed
    }
  }
  return net
}

describe('reading the table', () => {
  it('knows how finished hands come out by how many cards were drawn', () => {
    const { any, byDraw } = finalPools()
    expect(any.length).toBe(byDraw.reduce((n, p) => n + p.length, 0))
    // Standing pat is a straight or better (or four of a kind kept with its kicker drawn).
    expect(categoryOf(byDraw[0][0])).toBe('straight')
    // Most players draw three, usually to a pair, and most of them finish with a pair or better.
    expect(byDraw[3].length / any.length).toBeGreaterThan(0.4)
    expect(categoryOf(byDraw[3][Math.floor(byDraw[3].length / 2)])).toBe('pair')
    // Sorted lowest first.
    expect([...any].every((s, i) => i === 0 || any[i - 1] <= s)).toBe(true)
  })

  it('rates hands against an opponent’s pool', () => {
    const { any } = finalPools()
    expect(beats(any, scoreOf(hand('AS KS QS JS 10S')))).toBeGreaterThan(0.999)
    expect(beats(any, scoreOf(hand('7C 5S 4H 3D 2C')))).toBeLessThan(0.01)
    const aces = beats(any, scoreOf(hand('AS AH 9C 6D 2S')))
    expect(aces).toBeGreaterThan(0.5)
    expect(aces).toBeLessThan(0.85)
  })

  it('makes a pair of Aces a favorite before the draw, and junk an underdog', () => {
    const rng = createRng(3)
    const aces = headsUp('AS AH 9C 6D 2S', '7C 5S KH QD 8C')
    expect(equity(aces, 0, bookDraw(aces.seats[0]!.cards).keep, rng)).toBeGreaterThan(0.6)
    const junk = headsUp('7C 5S 4H 3D 9C', 'AS AH 9H 6D 2S')
    expect(equity(junk, 0, bookDraw(junk.seats[0]!.cards).keep, rng)).toBeLessThan(0.35)
  })
})

describe('the draw', () => {
  it('never breaks a straight or better, whatever the style', () => {
    const rng = createRng(5)
    const made = ['straight', 'flush', 'full-house', 'straight-flush', 'royal-flush']
    let checked = 0
    while (checked < 400) {
      const cards = shuffle(DECK, rng).slice(0, 5)
      if (!made.includes(categoryOf(scoreOf(cards)))) continue
      checked++
      for (const style of STYLES) {
        expect(chooseDraw(cards, { ...style, patBluff: 1 }, true, rng).discard).toEqual([])
      }
    }
  })

  it('keeps a kicker with a pair, for a regular who does', () => {
    const plan = chooseDraw(hand('8C 8S AH 6D 2S'), { ...SOLID, draw: 'kicker' }, false, createRng(1))
    expect(plan.keep.map((c) => c.rank)).toEqual(['8', '8', 'A'])
    expect(chooseDraw(hand('8C 8S AH 6D 2S'), SOLID, false, createRng(1)).keep).toHaveLength(2)
  })

  it('chases an inside straight, for a regular who does', () => {
    const cards = hand('5C 6S 8H 9D KS')
    expect(chooseDraw(cards, SOLID, false, createRng(1)).discard).toHaveLength(3)
    expect(chooseDraw(cards, { ...SOLID, draw: 'longshot' }, false, createRng(1)).keep.map((c) => c.rank)).toEqual(['5', '6', '8', '9'])
  })

  it('stands pat on nothing only to back up a bet', () => {
    const cards = hand('KC 9S 6H 4D 2S')
    const bluffer = { ...SOLID, patBluff: 1 }
    expect(chooseDraw(cards, bluffer, true, createRng(1)).discard).toEqual([])
    expect(chooseDraw(cards, bluffer, false, createRng(1)).discard).toHaveLength(3)
  })
})

describe('betting', () => {
  it('always makes a legal move, and never folds when it could check', () => {
    for (const [i, style] of STYLES.entries()) {
      const others = STYLES.filter((_, j) => j !== i).slice(0, 3)
      play([style, ...others], 60, 20 + i, (state, seat) => {
        const action = botAction(state, seat, i === 0 ? style : others[seat - 1] ?? style, createRng(seat))
        expect(isLegal(state, action)).toBe(true)
        if (owed(state, seat) === 0) expect(action.type).not.toBe('fold')
      })
    }
  })

  it('bets a monster after the draw, and folds nothing to a bet', () => {
    // Seat 0 acts first and stands pat on a royal flush; seat 1 draws three to nothing.
    let state = headsUp('AS KS QS JS 10S', '7C 5S 4H 3D 9C', '2D 8D JH')
    state = apply(state, { type: 'check' }).state
    state = apply(state, { type: 'check' }).state
    state = apply(state, { type: 'draw', discards: [] }).state
    const junk = state.seats[1]!.cards.filter((c) => c.rank === '7' || c.rank === '9' || c.rank === '5')
    state = apply(state, { type: 'draw', discards: junk.map((c) => c.id) }).state
    expect(state.round).toBe(2)
    expect(state.turn).toBe(0)
    const rng = createRng(9)
    const bets = Array.from({ length: 40 }, () => botAction(state, 0, SOLID, rng).type)
    expect(bets.filter((b) => b === 'bet').length).toBeGreaterThan(30)
    const facing = apply(state, { type: 'bet' }).state
    expect(categoryOf(scoreOf(facing.seats[1]!.cards))).toBe('high-card')
    expect(botAction(facing, 1, REGULARS.find((r) => r.id === 'eli')!.style, rng).type).toBe('fold')
  })

  it('beats a player who calls everything and chases long shots', () => {
    const station: Style = { tight: 0, aggression: 0, bluff: 0, slowplay: 0, draw: 'longshot', patBluff: 0 }
    // Each deal from both seats.
    const one = play([SOLID, station], 1500, 4)
    const two = play([station, SOLID], 1500, 4)
    expect(one[0] + two[1]).toBeGreaterThan(0)
  })
})

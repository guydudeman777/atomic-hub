import { describe, expect, it } from 'vitest'
import { type Card, parseCardId } from '../../core/cards'
import { apply, createTable, freshShoe } from './engine'
import { UP_CARDS, basicStrategy, chartPlay, countedStrategy, describeHand, hiLo, runningCount, trueCount } from './strategy'

const cards = (codes: string): Card[] => codes.split(' ').map((code) => parseCardId(`x:${code}`))
const card = (code: string) => cards(code)[0]
const free = { canDouble: true, canSplit: true }
const locked = { canDouble: false, canSplit: false }

const book = (hand: string, up: string, options = free) => basicStrategy(cards(hand), card(up), options)

describe('basic strategy', () => {
  it('stands on stiffs against a weak dealer and hits them against a strong one', () => {
    expect(book('10S 6H', '6D')).toBe('stand')
    expect(book('10S 6H', '10D')).toBe('hit')
    expect(book('10S 2H', '3D')).toBe('hit')
    expect(book('10S 2H', '4D')).toBe('stand')
    expect(book('10S 7H', 'AD')).toBe('stand')
  })

  it('doubles 9 to 11 where it pays, and hits when it can’t', () => {
    expect(book('6S 5H', '10D')).toBe('double')
    expect(book('6S 5H', 'AD')).toBe('hit')
    expect(book('6S 4H', '9D')).toBe('double')
    expect(book('5S 4H', '2D')).toBe('hit')
    expect(book('5S 4H', '3D')).toBe('double')
    expect(book('6S 5H', '6D', locked)).toBe('hit')
  })

  it('plays soft hands from the soft chart', () => {
    expect(book('AS 7H', '2D')).toBe('stand')
    expect(book('AS 7H', '3D')).toBe('double')
    expect(book('AS 7H', '9D')).toBe('hit')
    expect(book('AS 7H', '6D', locked)).toBe('stand')
    expect(book('AS 6H', '2D')).toBe('hit')
    expect(book('AS 2H', '5D')).toBe('double')
    expect(book('AS 8H', '6D')).toBe('stand')
    // A three-card soft 18 can't double.
    expect(book('AS 3H 4C', '4D')).toBe('stand')
  })

  it('splits the right pairs, and plays the total when it can’t', () => {
    expect(book('AS AH', 'AD')).toBe('split')
    expect(book('8S 8H', '10D')).toBe('split')
    expect(book('10S KH', '6D')).toBe('stand')
    expect(book('9S 9H', '7D')).toBe('stand')
    expect(book('9S 9H', '8D')).toBe('split')
    expect(book('5S 5H', '9D')).toBe('double')
    expect(book('4S 4H', '5D')).toBe('split')
    expect(book('4S 4H', '4D')).toBe('hit')
    expect(book('2S 2H', '7D')).toBe('split')
    expect(book('8S 8H', '10D', locked)).toBe('hit')
    expect(book('AS AH', '6D', locked)).toBe('hit')
  })

  it('has an answer for every hand against every up card', () => {
    const ups = ['2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', '10S', 'AS']
    expect(ups).toHaveLength(UP_CARDS.length)
    const hands = [
      ...['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'].map((r) => `${r}H ${r}D`),
      ...['2', '3', '4', '5', '6', '7', '8', '9'].map((r) => `AH ${r}D`),
      ...['2 3', '2 6', '3 7', '4 9', '5 9', '7 9', '9 10', '2 3 4', '10 6 5'].map((h) => h.split(' ').map((r, i) => `${r}${'HDC'[i]}`).join(' ')),
    ]
    for (const hand of hands) {
      for (const up of ups) {
        for (const options of [free, locked]) expect(['H', 'S', 'D', 'Ds', 'P']).toContain(chartPlay(cards(hand), card(up), options))
      }
    }
  })

  it('names hands the way the coach says them', () => {
    expect(describeHand(cards('10S 6H'))).toBe('hard 16')
    expect(describeHand(cards('AS 7H'))).toBe('soft 18')
    expect(describeHand(cards('8S 8H'))).toBe('a pair of 8s')
    expect(describeHand(cards('KS QH'))).toBe('two tens')
  })
})

describe('counting', () => {
  it('balances to zero over a whole shoe', () => {
    expect(freshShoe(1).reduce((n, c) => n + hiLo(c), 0)).toBe(0)
  })

  it('counts the hole card only once it’s turned over', () => {
    // You 5, dealer 6 up, you 4, dealer K down: +1 +1 +1, and the King isn’t seen yet.
    const shoe = [...cards('5S 6H 4D KC'), ...freshShoe(1).slice(4)]
    let state = createTable({ spots: 1, limits: { min: 5, max: 100 }, seed: 1, shoe })
    state = apply(state, { type: 'deal', bets: [5] }).state
    for (let i = 0; i < 4; i++) state = apply(state, { type: 'next' }).state
    expect(runningCount(state)).toBe(3)
    expect(trueCount(state)).toBeCloseTo(3 / (308 / 52))
    state = apply(state, { type: 'stand' }).state
    state = apply(state, { type: 'next' }).state
    expect(state.holeRevealed).toBe(true)
    expect(runningCount(state)).toBe(2)
  })

  it('changes the famous plays with the count', () => {
    const play = (hand: string, up: string, count: number) => countedStrategy(cards(hand), card(up), free, count)
    expect(play('10S 6H', '10D', -1)).toBe('hit')
    expect(play('10S 6H', '10D', 0)).toBe('stand')
    expect(play('10S 2H', '3D', 1)).toBe('hit')
    expect(play('10S 2H', '3D', 2)).toBe('stand')
    expect(play('10S 2H', '4D', -1)).toBe('hit')
    expect(play('10S 2H', '4D', 0)).toBe('stand')
    expect(play('KS QH', '6D', 3)).toBe('stand')
    expect(play('KS QH', '6D', 4)).toBe('split')
    expect(play('6S 5H', 'AD', 1)).toBe('double')
    // Pairs the book splits stay split, whatever the count.
    expect(play('8S 8H', '10D', 5)).toBe('split')
  })
})

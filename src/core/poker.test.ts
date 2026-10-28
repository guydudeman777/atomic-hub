import { describe, expect, it } from 'vitest'
import { type Card, type Rank, type Suit, makeCard } from './cards'
import { CATEGORIES, type Category, bestFive, cardCode, categoryOf, compareHands, describeHand, evaluate, scoreCodes } from './poker'

/** Cards from short codes like "AS KH 10D". */
const hand = (codes: string): Card[] =>
  codes.split(' ').map((code) => makeCard('test', code.slice(0, -1) as Rank, code.slice(-1) as Suit))

describe('poker hand values', () => {
  it('counts every category across all 2,598,960 five-card hands', () => {
    const counts = new Array<number>(CATEGORIES.length).fill(0)
    // Every card as a code: ranks 2–14, four suits.
    const codes: number[] = []
    for (let rank = 2; rank <= 14; rank++) for (let suit = 0; suit < 4; suit++) codes.push(rank * 4 + suit)
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) counts[scoreCodes(codes[a], codes[b], codes[c], codes[d], codes[e]) >> 20]++
    const byName = Object.fromEntries(CATEGORIES.map((c, i) => [c, counts[i]]))
    expect(byName).toEqual({
      'royal-flush': 4,
      'straight-flush': 36,
      'four-of-a-kind': 624,
      'full-house': 3744,
      flush: 5108,
      straight: 10200,
      'three-of-a-kind': 54912,
      'two-pair': 123552,
      pair: 1098240,
      'high-card': 1302540,
    })
  })

  it('names each hand', () => {
    const cases: [string, Category, string][] = [
      ['AS KS QS JS 10S', 'royal-flush', 'Royal flush'],
      ['9H 8H 7H 6H 5H', 'straight-flush', 'Straight flush, Nine high'],
      ['AD 2D 3D 4D 5D', 'straight-flush', 'Straight flush, Five high'],
      ['9C 9S 9H 9D 2C', 'four-of-a-kind', 'Four of a kind, Nines'],
      ['KC KS KH 7D 7C', 'full-house', 'Full house, Kings over Sevens'],
      ['AH 9H 7H 4H 2H', 'flush', 'Flush, Ace high'],
      ['10C 9S 8H 7D 6C', 'straight', 'Straight, Ten high'],
      ['5C 4S 3H 2D AC', 'straight', 'Straight, Five high'],
      ['4C 4S 4H KD 2C', 'three-of-a-kind', 'Three of a kind, Fours'],
      ['KC KS 7H 7D 2C', 'two-pair', 'Two pair, Kings and Sevens'],
      ['JC JS 7H 5D 2C', 'pair', 'Pair of Jacks'],
      ['AC JS 7H 5D 2C', 'high-card', 'Ace high'],
    ]
    for (const [codes, category, name] of cases) {
      expect(evaluate(hand(codes)).category, codes).toBe(category)
      expect(describeHand(hand(codes)), codes).toBe(name)
    }
  })

  it('orders hands by category, then by the cards that decide ties', () => {
    const beats = (a: string, b: string) => expect(compareHands(hand(a), hand(b)), `${a} vs ${b}`).toBeGreaterThan(0)
    beats('2C 2S 3H 4D 5C', 'AC KS QH JD 9C')
    beats('KC KS 7H 7D 2C', 'QC QS JH JD AC')
    beats('KC KS 7H 7D 3C', 'KH KD 7S 7C 2D')
    beats('JC JS AH 5D 2C', 'JH JD KS QC 10D')
    beats('6C 5S 4H 3D 2C', '5C 4S 3H 2D AC')
    beats('AH 9H 7H 4H 3H', 'AS 9S 7S 4S 2S')
    beats('3C 3S 3H 2D 2C', 'AH KH 9H 4H 2H')
    beats('2C 2S 2H 2D 3C', 'AS AH AD KD KC')
    // The trips decide a full house, not the pair.
    beats('3C 3S 3H 2D 2C', '2H 2S 2D AH AC')
  })

  it('ties hands that differ only by suit', () => {
    expect(compareHands(hand('AH KH 9S 4D 2C'), hand('AS KD 9H 4C 2D'))).toBe(0)
    expect(compareHands(hand('5C 4S 3H 2D AC'), hand('5H 4D 3S 2C AD'))).toBe(0)
  })

  it('finds the best five of seven', () => {
    const { cards, value } = bestFive(hand('AH KH 2C QH 7S JH 10H'))
    expect(value.category).toBe('royal-flush')
    expect(cards.map((c) => c.rank).sort()).toEqual(['10', 'A', 'J', 'K', 'Q'])
    expect(bestFive(hand('9C 9S 4H 4D 4C 9H 2S')).value.ranks).toEqual([9, 4])
    expect(categoryOf(bestFive(hand('2C 3S 4H 5D 6C')).value.score)).toBe('straight')
  })

  it('refuses Jokers and the wrong number of cards', () => {
    expect(() => cardCode(makeCard('test', 'JK', null))).toThrow()
    expect(() => evaluate(hand('AH KH QH JH'))).toThrow()
  })
})

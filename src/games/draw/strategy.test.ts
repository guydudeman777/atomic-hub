import { describe, expect, it } from 'vitest'
import { type Card, type Rank, type Suit, makeCard } from '../../core/cards'
import { bookDraw } from './strategy'

const hand = (codes: string): Card[] => codes.split(' ').map((code) => makeCard('t', code.slice(0, -1) as Rank, code.slice(-1) as Suit))
const codes = (cards: Card[]) => cards.map((c) => `${c.rank}${c.suit}`).join(' ')

describe('the book draw', () => {
  const cases: [string, string, string, string][] = [
    // hand, what it is, what the book keeps, the reason
    ['9H 8H 7H 6H 5H', 'pat', '9H 8H 7H 6H 5H', 'Stand pat with your straight flush.'],
    ['10C 9S 8H 7D 6C', 'pat', '10C 9S 8H 7D 6C', 'Stand pat with your straight.'],
    ['KC KS KH 7D 7C', 'pat', 'KC KS KH 7D 7C', 'Stand pat with your full house.'],
    ['9C 9S 9H 9D 2C', 'quads', '9C 9S 9H 9D', 'Keep the four Nines and draw one. It hides what you have.'],
    ['4C 4S 4H KD 2C', 'trips', '4C 4S 4H', 'Keep the three Fours and draw two.'],
    ['KC KS 7H 7D 2C', 'two-pair', 'KC KS 7H 7D', 'Keep both pairs and draw one, for a full house.'],
    ['9H 9S 10H JH QH', 'straight-flush-draw', '9H 10H JH QH', 'Keep the four to a straight flush and draw one.'],
    ['JC JH 10H QH KH', 'straight-flush-draw', 'JH 10H QH KH', 'Keep the four to a straight flush and draw one.'],
    ['JC JS 2H 6H 9H', 'high-pair', 'JC JS', 'Keep the pair of Jacks and draw three.'],
    ['6C 6H 2H 9H KH', 'flush-draw', '6H 2H 9H KH', 'Keep the four hearts and draw one, for the flush.'],
    ['6C 6H 7D 8S 9C', 'low-pair', '6C 6H', 'Keep the pair of Sixes and draw three.'],
    ['7D 8S 9C 10H 2C', 'straight-draw', '7D 8S 9C 10H', 'Keep the Seven to Ten and draw one, for a straight at either end.'],
    ['AD 2S 3C 4H 9C', 'ace', 'AD', 'Nothing made: keep the Ace and draw four.'],
    ['JD QS KC AH 3C', 'ace', 'AH', 'Nothing made: keep the Ace and draw four.'],
    ['7D 8S 10C JH 2C', 'high-cards', '10C JH', 'Nothing worth keeping: hold the Jack and Ten and draw three.'],
  ]
  for (const [cards, kind, keep, reason] of cases) {
    it(`${cards}: ${kind}`, () => {
      const plan = bookDraw(hand(cards))
      expect(plan.kind).toBe(kind)
      expect(codes(plan.keep)).toBe(keep)
      expect(plan.keep.length + plan.discard.length).toBe(5)
      expect(plan.reason).toBe(reason)
    })
  }

  it('never draws more than the rules allow', () => {
    for (const cards of cases.map(([c]) => hand(c))) {
      const { keep, discard } = bookDraw(cards)
      expect(discard.length <= 3 || (discard.length === 4 && keep[0].rank === 'A')).toBe(true)
    }
  })
})

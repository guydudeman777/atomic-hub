import { describe, expect, it } from 'vitest'
import { type Card, fullSet, isNumberRank, makeCard, parseCardId } from '../../core/cards'
import { createRng } from '../../core/rng'
import {
  type Caravan,
  type GameState,
  type Lane,
  type Move,
  type Placed,
  type PlayerId,
  type PlayerState,
  applyMove,
  canExtend,
  caravanHeading,
  caravanValue,
  checkDeck,
  createGame,
  isLegal,
  laneWinner,
  legalMoves,
} from './engine'

/** `c('10H')` → 10 of hearts from the standard set; `c('JK1')` → Joker. */
const c = (code: string, set = 'standard'): Card => parseCardId(`${set}:${code}`)

/** Build a caravan from codes; `['7H', ['KS']]` is a 7♥ with a King attached. */
const caravan = (...items: (string | [string, string[]])[]): Placed[] =>
  items.map((item) =>
    typeof item === 'string' ? { card: c(item), attached: [] } : { card: c(item[0]), attached: item[1].map((a) => c(a)) },
  )

interface Setup {
  hand?: string[]
  deck?: string[]
  caravans?: [Caravan, Caravan, Caravan]
  turnsTaken?: number
}

const player = ({ hand = [], deck = [], caravans = [[], [], []], turnsTaken = 3 }: Setup): PlayerState => ({
  hand: hand.map((h) => c(h)),
  deck: deck.map((d) => c(d, 'deck')),
  caravans,
  turnsTaken,
})

const state = (p0: Setup, p1: Setup, current: PlayerId = 0): GameState => ({
  players: [player(p0), player(p1)],
  current,
  winner: null,
  endReason: null,
  turn: 10,
})

const play = (cardCode: string, owner: PlayerId, lane: Lane, index?: number): Move => ({
  type: 'play',
  cardId: `standard:${cardCode}`,
  owner,
  lane,
  index,
})

describe('caravan values', () => {
  it('sums number cards with Ace as 1', () => {
    expect(caravanValue(caravan('AS', '5H', '10D'))).toBe(16)
  })

  it('doubles a card per King and stacks Kings', () => {
    expect(caravanValue(caravan(['5H', ['KS']], '7C'))).toBe(17)
    expect(caravanValue(caravan(['5H', ['KS', 'KD']]))).toBe(20)
  })

  it('ignores Jacks, Queens and Jokers for value', () => {
    expect(caravanValue(caravan(['5H', ['QS', 'JK1']]))).toBe(5)
  })
})

describe('direction and suit', () => {
  it('has no direction with one card', () => {
    expect(caravanHeading(caravan('5H'))).toEqual({ direction: null, suit: 'H' })
  })

  it('takes direction from the last two cards', () => {
    expect(caravanHeading(caravan('3H', '7C')).direction).toBe('asc')
    expect(caravanHeading(caravan('3H', '7C', '5C')).direction).toBe('desc')
  })

  it('Queen flips direction and sets the suit', () => {
    expect(caravanHeading(caravan('3H', ['7C', ['QD']]))).toEqual({ direction: 'desc', suit: 'D' })
  })

  it('two Queens flip twice', () => {
    expect(caravanHeading(caravan('3H', ['7C', ['QD', 'QS']]))).toEqual({ direction: 'asc', suit: 'S' })
  })

  it('Queen on a single card changes only the suit', () => {
    expect(caravanHeading(caravan(['7C', ['QD']]))).toEqual({ direction: null, suit: 'D' })
  })
})

describe('extending a caravan', () => {
  it('accepts any number card on an empty caravan', () => {
    expect(canExtend([], c('10S'))).toBe(true)
  })

  it('never accepts a repeated value', () => {
    expect(canExtend(caravan('5H'), c('5S'))).toBe(false)
    expect(canExtend(caravan('3H', '5H'), c('5H', 'neon'))).toBe(false)
  })

  it('accepts either direction for the second card', () => {
    expect(canExtend(caravan('5H'), c('2S'))).toBe(true)
    expect(canExtend(caravan('5H'), c('9S'))).toBe(true)
  })

  it('enforces direction for off-suit cards', () => {
    const asc = caravan('3H', '6S')
    expect(canExtend(asc, c('8C'))).toBe(true)
    expect(canExtend(asc, c('4C'))).toBe(false)
  })

  it('lets a matching suit break direction', () => {
    expect(canExtend(caravan('3H', '6S'), c('2S'))).toBe(true)
  })

  it('matches the Queen suit, not the card underneath', () => {
    const cv = caravan('3H', ['6S', ['QD']]) // now descending, suit diamonds
    expect(canExtend(cv, c('9D'))).toBe(true)
    expect(canExtend(cv, c('9S'))).toBe(false)
    expect(canExtend(cv, c('4S'))).toBe(true)
  })

  it('rejects face cards', () => {
    expect(canExtend([], c('KS'))).toBe(false)
  })
})

describe('lanes', () => {
  it('awards the higher sold caravan', () => {
    expect(laneWinner(24, 22)).toBe(0)
    expect(laneWinner(21, 26)).toBe(1)
  })

  it('leaves ties and unsold lanes open', () => {
    expect(laneWinner(23, 23)).toBeNull()
    expect(laneWinner(20, 27)).toBeNull()
  })

  it('awards a sold caravan against an unsold one', () => {
    expect(laneWinner(21, 30)).toBe(0)
    expect(laneWinner(5, 26)).toBe(1)
  })
})

describe('opening', () => {
  const opening = () =>
    state({ hand: ['5H', '7S', 'KD', '9C', '2D', 'JS', 'QH', '3C'], deck: ['4H'], turnsTaken: 0 }, { hand: ['2C'] })

  it('only allows number cards onto empty caravans', () => {
    const moves = legalMoves(opening())
    expect(moves.every((m) => m.type === 'play')).toBe(true)
    expect(moves).toHaveLength(5 * 3)
  })

  it('does not draw during the opening', () => {
    const { state: next } = applyMove(opening(), play('5H', 0, 0))
    expect(next.players[0].hand).toHaveLength(7)
    expect(next.players[0].deck).toHaveLength(1)
  })

  it('forbids a second card on a filled caravan', () => {
    const s = state({ hand: ['7S'], caravans: [caravan('5H'), [], []], turnsTaken: 1 }, { hand: ['2C'] })
    expect(isLegal(s, play('7S', 0, 0))).toBe(false)
    expect(isLegal(s, play('7S', 0, 1))).toBe(true)
  })

  it('forbids discards and disbanding', () => {
    const s = state({ hand: ['7S', '2H'], caravans: [caravan('5H'), [], []], turnsTaken: 1 }, { hand: ['2C'] })
    expect(isLegal(s, { type: 'discard', cardId: 'standard:7S' })).toBe(false)
    expect(isLegal(s, { type: 'disband', lane: 0 })).toBe(false)
  })
})

describe('turns after the opening', () => {
  it('draws after playing a card', () => {
    const s = state({ hand: ['5H', '9S'], deck: ['4H'] }, { hand: ['2C'] })
    const { state: next } = applyMove(s, play('5H', 0, 0))
    expect(next.players[0].hand.map((h) => h.id)).toEqual(['standard:9S', 'deck:4H'])
    expect(next.current).toBe(1)
  })

  it('draws after discarding', () => {
    const s = state({ hand: ['5H'], deck: ['4H'] }, { hand: ['2C'] })
    const { state: next } = applyMove(s, { type: 'discard', cardId: 'standard:5H' })
    expect(next.players[0].hand.map((h) => h.id)).toEqual(['deck:4H'])
  })

  it('disbanding clears a caravan without drawing', () => {
    const s = state({ hand: ['5H'], deck: ['4H'], caravans: [caravan('3C', ['8C', ['KS']]), [], []] }, { hand: ['2C'] })
    const { state: next, events } = applyMove(s, { type: 'disband', lane: 0 })
    expect(next.players[0].caravans[0]).toHaveLength(0)
    expect(next.players[0].hand).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'disbanded', cards: [c('3C'), c('8C'), c('KS')] })
  })

  it('cannot disband an empty caravan', () => {
    const s = state({ hand: ['5H'] }, { hand: ['2C'] })
    expect(isLegal(s, { type: 'disband', lane: 0 })).toBe(false)
  })

  it('rejects number cards on the opponent side', () => {
    const s = state({ hand: ['5H'] }, { hand: ['2C'] })
    expect(isLegal(s, play('5H', 1, 0))).toBe(false)
  })

  it('throws on illegal moves', () => {
    const s = state({ hand: ['5H'] }, { hand: ['2C'] })
    expect(() => applyMove(s, play('9H', 0, 0))).toThrow(/Illegal/)
  })
})

describe('face cards', () => {
  it('Jack removes the target and its attachments', () => {
    const s = state({ hand: ['JS'] }, { hand: ['2C'], caravans: [caravan('4D', ['9D', ['KH']]), [], []] })
    const { state: next, events } = applyMove(s, play('JS', 1, 0, 1))
    expect(next.players[1].caravans[0].map((p) => p.card.id)).toEqual(['standard:4D'])
    expect(events).toContainEqual({ type: 'removed', owner: 1, lane: 0, cards: [c('9D'), c('KH')] })
  })

  it('King doubles the target, on either side', () => {
    const s = state({ hand: ['KS'], caravans: [caravan('4D', '9D'), [], []] }, { hand: ['2C'] })
    const { state: next } = applyMove(s, play('KS', 0, 0, 1))
    expect(caravanValue(next.players[0].caravans[0])).toBe(22)
  })

  it('Queen may only go on the last card', () => {
    const s = state({ hand: ['QS'], caravans: [caravan('4D', '9D'), [], []] }, { hand: ['2C'] })
    expect(isLegal(s, play('QS', 0, 0, 0))).toBe(false)
    expect(isLegal(s, play('QS', 0, 0, 1))).toBe(true)
  })

  it('face cards need a number card to attach to', () => {
    const s = state({ hand: ['KS'] }, { hand: ['2C'] })
    expect(legalMoves(s).filter((m) => m.type === 'play')).toHaveLength(0)
  })

  it('Joker on an Ace clears that suit from the whole table except the Ace', () => {
    const s = state(
      { hand: ['JK1'], caravans: [caravan('AH', '5H', '7C'), caravan('3H'), []] },
      { hand: ['2C'], caravans: [caravan(['9H', ['KS']], '10S'), [], []] },
    )
    const { state: next } = applyMove(s, play('JK1', 0, 0, 0))
    expect(next.players[0].caravans[0].map((p) => p.card.id)).toEqual(['standard:AH', 'standard:7C'])
    expect(next.players[0].caravans[0][0].attached.map((a) => a.id)).toEqual(['standard:JK1'])
    expect(next.players[0].caravans[1]).toHaveLength(0)
    expect(next.players[1].caravans[0].map((p) => p.card.id)).toEqual(['standard:10S'])
  })

  it('Joker on a number clears that value from the whole table except the target', () => {
    const s = state(
      { hand: ['JK2'], caravans: [caravan('2H', '7C'), caravan('7D'), []] },
      { hand: ['2C'], caravans: [caravan('7S', '9S'), [], []] },
    )
    const { state: next } = applyMove(s, play('JK2', 1, 0, 0))
    expect(next.players[0].caravans[0].map((p) => p.card.id)).toEqual(['standard:2H'])
    expect(next.players[0].caravans[1]).toHaveLength(0)
    expect(next.players[1].caravans[0].map((p) => p.card.id)).toEqual(['standard:7S', 'standard:9S'])
  })

  it('face cards are not allowed during the opening', () => {
    const s = state({ hand: ['KS', '5H'], turnsTaken: 1, caravans: [caravan('4D'), [], []] }, { hand: ['2C'] })
    expect(isLegal(s, play('KS', 0, 0, 0))).toBe(false)
  })
})

describe('game end', () => {
  it('ends when all three lanes are decided, majority wins', () => {
    const s = state(
      { hand: ['6H'], caravans: [caravan('10H', '10S'), caravan('10C', '10D', '3S'), caravan('9H', '9S', '4D')] },
      { hand: ['2C'], caravans: [caravan('10H', '10S', '5C'), caravan('2S'), caravan('3D')] },
    )
    // Lane 0: 20 → 26 beats opponent's 25. Lane 1: 23 sold vs 2. Lane 2: 22 sold vs 3.
    const { state: next, events } = applyMove(s, play('6H', 0, 0))
    expect(next.winner).toBe(0)
    expect(next.endReason).toBe('lanes')
    expect(events.at(-1)).toEqual({ type: 'game-over', winner: 0, reason: 'lanes' })
  })

  it('keeps going while a lane is tied', () => {
    const s = state(
      { hand: ['3H', '4C'], caravans: [caravan('10H', '10S'), caravan('10C', '10D', '3S'), caravan('9H', '9S', '4D')] },
      { hand: ['2C'], caravans: [caravan('10H', '10S', '3C'), caravan('2S'), caravan('3D')] },
    )
    const { state: next } = applyMove(s, play('3H', 0, 0))
    expect(next.winner).toBeNull()
  })

  it('a player with no cards at the start of their turn loses', () => {
    const s = state({ hand: ['5H'] }, { hand: [] })
    const { state: next } = applyMove(s, play('5H', 0, 0))
    expect(next.winner).toBe(0)
    expect(next.endReason).toBe('out-of-cards')
  })

  it('no moves once the game is over', () => {
    const s = { ...state({ hand: ['5H'] }, { hand: ['2C'] }), winner: 0 as const }
    expect(legalMoves(s)).toEqual([])
  })
})

describe('setup', () => {
  it('deals 8 cards with at least three number cards', () => {
    const faceHeavy = [
      ...fullSet('a').filter((card) => !isNumberRank(card.rank)),
      ...fullSet('b').filter((card) => !isNumberRank(card.rank)),
      ...fullSet('c').filter((card) => isNumberRank(card.rank)).slice(0, 12),
    ]
    for (let seed = 0; seed < 50; seed++) {
      const game = createGame({ decks: [faceHeavy, faceHeavy], rng: createRng(seed) })
      for (const p of game.players) {
        expect(p.hand).toHaveLength(8)
        expect(p.hand.filter((card) => isNumberRank(card.rank)).length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('is reproducible from a seed', () => {
    const deck = fullSet('standard')
    const a = createGame({ decks: [deck, deck], rng: createRng(42) })
    const b = createGame({ decks: [deck, deck], rng: createRng(42) })
    expect(a).toEqual(b)
  })

  it('validates deck size, number cards and duplicates', () => {
    expect(checkDeck(fullSet('standard')).ok).toBe(true)
    expect(checkDeck(fullSet('standard').slice(0, 20)).problems[0]).toMatch(/10 more cards/)
    const faces = [...fullSet('a'), ...fullSet('b'), ...fullSet('c')].filter((card) => !isNumberRank(card.rank))
    expect(checkDeck(faces).problems.join()).toMatch(/12 more number cards/)
    const card = makeCard('a', '5', 'H')
    expect(checkDeck([...fullSet('b'), card, card]).problems.join()).toMatch(/one copy/)
  })
})

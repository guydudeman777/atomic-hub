import { describe, expect, it } from 'vitest'
import {
  type Action,
  type BetSpot,
  type Bets,
  type Dice,
  type PointNumber,
  type TableEvent,
  type TableState,
  apply,
  betOn,
  canTakeDown,
  createTable,
  fitBet,
  isLegal,
  isWorking,
  maxBet,
  minBet,
  rollFor,
  summarize,
  unitOf,
} from './engine'
import { ALL_ROLLS, houseEdge } from './odds'

const LIMITS = { min: 5, max: 500, propMin: 1 }

function table(point: PointNumber | null = null, bets: Bets = {}): TableState {
  return createTable({ limits: LIMITS, seed: 7, point, bets })
}

interface Run {
  state: TableState
  events: TableEvent[]
}

/** Apply actions in order; a pair of numbers rolls those dice. */
function run(state: TableState, ...actions: (Action | readonly [number, number])[]): Run {
  const events: TableEvent[] = []
  for (const a of actions) {
    const action: Action = Array.isArray(a) ? { type: 'roll', dice: a as unknown as Dice } : (a as Action)
    const r = apply(state, action)
    state = r.state
    events.push(...r.events)
  }
  return { state, events }
}

const bet = (spot: BetSpot, amount: number): Action => ({ type: 'bet', spot, amount })

/** What happened to one bet, in order. */
const fate = (events: TableEvent[], spot: BetSpot) =>
  events.flatMap((e) => {
    if ((e.type === 'won' || e.type === 'lost' || e.type === 'pushed' || e.type === 'returned') && e.spot === spot) {
      return [e.type === 'won' ? `won ${e.paid}${e.stays ? '' : ', back'}` : e.type]
    }
    if (e.type === 'moved' && e.from === spot) return [`to ${e.to}`]
    return []
  })

describe('the come-out and the point', () => {
  it('pays the pass line on a natural and leaves the bet up', () => {
    for (const dice of [[3, 4], [5, 6]] as const) {
      const r = run(table(null, { pass: 10 }), dice)
      expect(fate(r.events, 'pass')).toEqual(['won 10'])
      expect(betOn(r.state, 'pass')).toBe(10)
      expect(r.state.point).toBeNull()
    }
  })

  it('takes the pass line on craps', () => {
    for (const dice of [[1, 1], [1, 2], [6, 6]] as const) {
      const r = run(table(null, { pass: 10 }), dice)
      expect(fate(r.events, 'pass')).toEqual(['lost'])
      expect(betOn(r.state, 'pass')).toBe(0)
    }
  })

  it('sets the point, then pays it when it repeats', () => {
    let r = run(table(null, { pass: 10 }), [2, 4])
    expect(r.state.point).toBe(6)
    expect(r.events.at(-1)).toEqual({ type: 'point-set', point: 6 })
    r = run(r.state, [5, 3], [2, 2], [1, 5])
    expect(fate(r.events, 'pass')).toEqual(['won 10'])
    expect(r.events.at(-1)).toEqual({ type: 'point-made', point: 6 })
    expect(r.state.point).toBeNull()
    expect(r.state.hand).toBe(1)
  })

  it('sevens out, ending the hand', () => {
    const r = run(table(null, { pass: 10 }), [4, 4], [3, 4])
    expect(fate(r.events, 'pass')).toEqual(['lost'])
    expect(r.events.at(-1)).toEqual({ type: 'seven-out', point: 8 })
    expect(r.state).toMatchObject({ point: null, hand: 2, handRolls: 0 })
  })

  it('bars the 12 on don’t pass, and pays the 2, 3 and the seven-out', () => {
    expect(fate(run(table(null, { 'dont-pass': 10 }), [6, 6]).events, 'dont-pass')).toEqual(['pushed'])
    expect(fate(run(table(null, { 'dont-pass': 10 }), [1, 2]).events, 'dont-pass')).toEqual(['won 10'])
    expect(fate(run(table(null, { 'dont-pass': 10 }), [5, 6]).events, 'dont-pass')).toEqual(['lost'])
    const r = run(table(null, { 'dont-pass': 10 }), [4, 5], [3, 4])
    expect(fate(r.events, 'dont-pass')).toEqual(['won 10'])
    expect(fate(run(table(null, { 'dont-pass': 10 }), [4, 5], [6, 3]).events, 'dont-pass')).toEqual(['lost'])
  })

  it('rolls the same dice from the same seed', () => {
    const a = run(table(), { type: 'roll' }, { type: 'roll' }, { type: 'roll' })
    const b = run(table(), { type: 'roll' }, { type: 'roll' }, { type: 'roll' })
    expect(a.state.history).toEqual(b.state.history)
    expect(a.state.history[0]).toEqual(rollFor(7, 2))
  })

  it('rolls every total about as often as it should', () => {
    const counts = new Array(13).fill(0)
    for (let n = 0; n < 36_000; n++) {
      const [a, b] = rollFor(12345, n)
      counts[a + b]++
    }
    const ways = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]
    for (let t = 2; t <= 12; t++) expect(Math.abs(counts[t] - ways[t] * 1000)).toBeLessThan(ways[t] * 1000 * 0.12 + 40)
  })
})

describe('odds', () => {
  it('pay true odds on every point and come down with the decision', () => {
    const cases: [PointNumber, number][] = [[4, 20], [5, 15], [6, 12], [8, 12], [9, 15], [10, 20]]
    for (const [point, paid] of cases) {
      const half = Math.floor(point / 2)
      const r = run(table(point, { pass: 10, 'pass-odds': 10 }), [half, point - half])
      expect(fate(r.events, 'pass-odds'), `odds on ${point}`).toEqual([`won ${paid}, back`])
      expect(betOn(r.state, 'pass-odds')).toBe(0)
    }
  })

  it('lose on the seven-out', () => {
    const r = run(table(6, { pass: 10, 'pass-odds': 50 }), [3, 4])
    expect(fate(r.events, 'pass-odds')).toEqual(['lost'])
  })

  it('go up to 3, 4 and 5 times the flat bet, in units that pay whole caps', () => {
    for (const [point, max, unit] of [[4, 30, 1], [5, 40, 2], [6, 50, 5], [8, 50, 5], [9, 40, 2], [10, 30, 1]] as const) {
      const s = table(point, { pass: 10 })
      expect(maxBet(s, 'pass-odds'), `max on ${point}`).toBe(max)
      expect(unitOf(s, 'pass-odds'), `unit on ${point}`).toBe(unit)
      expect(isLegal(s, bet('pass-odds', max))).toBe(true)
      expect(isLegal(s, bet('pass-odds', max + unit))).toBe(false)
    }
    expect(isLegal(table(5, { pass: 10 }), bet('pass-odds', 15))).toBe(false)
    expect(isLegal(table(6, { pass: 10 }), bet('pass-odds', 12))).toBe(false)
  })

  it('can only be laid behind a don’t bet, up to six times it, and pay 1 to 2, 2 to 3 and 5 to 6', () => {
    for (const [point, unit, paid] of [[4, 2, 30], [5, 3, 40], [6, 6, 50]] as const) {
      const s = table(point, { 'dont-pass': 10 })
      expect(maxBet(s, 'dont-pass-odds')).toBe(60)
      expect(unitOf(s, 'dont-pass-odds')).toBe(unit)
      const r = run(s, bet('dont-pass-odds', 60), [3, 4])
      expect(fate(r.events, 'dont-pass-odds')).toEqual([`won ${paid}, back`])
    }
  })

  it('need a flat bet with a point to go behind', () => {
    expect(isLegal(table(null, { pass: 10 }), bet('pass-odds', 10))).toBe(false)
    expect(isLegal(table(6), bet('pass-odds', 10))).toBe(false)
    expect(isLegal(table(6, { 'dont-pass': 10 }), bet('pass-odds', 10))).toBe(false)
  })

  it('come down with their bet', () => {
    const r = run(table(6, { 'dont-pass': 10, 'dont-pass-odds': 60 }), { type: 'down', spot: 'dont-pass' })
    expect(r.events).toEqual([
      { type: 'down', spot: 'dont-pass-odds', amount: 60 },
      { type: 'down', spot: 'dont-pass', amount: 10 },
    ])
    expect(r.state.bets).toEqual({})
  })
})

describe('come and don’t come', () => {
  it('can only be made with a point', () => {
    expect(isLegal(table(), bet('come', 5))).toBe(false)
    expect(isLegal(table(4), bet('come', 5))).toBe(true)
    expect(isLegal(table(4), bet('pass', 5))).toBe(false)
    expect(isLegal(table(4), bet('dont-pass', 5))).toBe(false)
  })

  it('travel to their number, then win on it and lose to a 7', () => {
    let r = run(table(4, { come: 10 }), [4, 5])
    expect(fate(r.events, 'come')).toEqual(['to come-9'])
    expect(r.state.bets).toEqual({ 'come-9': 10 })
    r = run(r.state, bet('come-odds-9', 20), [6, 3])
    expect(fate(r.events, 'come-9')).toEqual(['won 10, back'])
    expect(fate(r.events, 'come-odds-9')).toEqual(['won 30, back'])
    expect(r.state.bets).toEqual({})

    r = run(table(4, { 'come-9': 10, 'come-odds-9': 20 }), [3, 4])
    expect(fate(r.events, 'come-9')).toEqual(['lost'])
    expect(fate(r.events, 'come-odds-9')).toEqual(['lost'])
  })

  it('win in the box on 7 or 11, and come back when the 7 takes the point away', () => {
    let r = run(table(4, { come: 10 }), [5, 6])
    expect(fate(r.events, 'come')).toEqual(['won 10'])
    expect(r.state.bets).toEqual({ come: 10 })
    r = run(r.state, [3, 4])
    expect(fate(r.events, 'come')).toEqual(['won 10, back'])
    expect(r.state.bets).toEqual({})
  })

  it('pay an old come bet off and move the new one onto its number', () => {
    const r = run(table(4, { come: 10, 'come-6': 15 }), [5, 1])
    expect(fate(r.events, 'come-6')).toEqual(['won 15, back'])
    expect(fate(r.events, 'come')).toEqual(['to come-6'])
    expect(r.state.bets).toEqual({ 'come-6': 10 })
  })

  it('keep working through the come-out, with the odds off', () => {
    let r = run(table(null, { 'come-5': 10, 'come-odds-5': 20 }), [4, 1])
    expect(fate(r.events, 'come-5')).toEqual(['won 10, back'])
    expect(fate(r.events, 'come-odds-5')).toEqual(['returned'])
    r = run(table(null, { 'come-5': 10, 'come-odds-5': 20 }), [4, 3])
    expect(fate(r.events, 'come-5')).toEqual(['lost'])
    expect(fate(r.events, 'come-odds-5')).toEqual(['returned'])
    expect(isWorking(table(), 'come-odds-5')).toBe(false)
  })

  it('can’t be taken down once they travel, but their odds can', () => {
    const s = table(4, { 'come-9': 10, 'come-odds-9': 20 })
    expect(canTakeDown(s, 'come-9')).toBe(false)
    expect(canTakeDown(s, 'come-odds-9')).toBe(true)
    expect(canTakeDown(table(4, { come: 10 }), 'come')).toBe(true)
  })

  it('bar the 12 on don’t come, travel, and win on a 7 with the lay always working', () => {
    expect(fate(run(table(4, { 'dont-come': 10 }), [6, 6]).events, 'dont-come')).toEqual(['pushed'])
    let r = run(table(4, { 'dont-come': 10 }), [5, 5])
    expect(r.state.bets).toEqual({ 'dont-come-10': 10 })
    // The 4 is made, so the next roll is a come-out; the lay on the 10 still works.
    r = run(r.state, bet('dont-come-odds-10', 20), [2, 2], [3, 4])
    expect(fate(r.events, 'dont-come-10')).toEqual(['won 10, back'])
    expect(fate(r.events, 'dont-come-odds-10')).toEqual(['won 10, back'])
    r = run(table(4, { 'dont-come-10': 10, 'dont-come-odds-10': 20 }), [6, 4])
    expect(fate(r.events, 'dont-come-10')).toEqual(['lost'])
    expect(fate(r.events, 'dont-come-odds-10')).toEqual(['lost'])
  })
})

describe('the field, place bets, hardways and one-roll bets', () => {
  it('pays the field double on 2 and triple on 12', () => {
    const field = (dice: readonly [number, number]) => fate(run(table(null, { field: 10 }), dice).events, 'field')
    expect(field([1, 1])).toEqual(['won 20'])
    expect(field([6, 6])).toEqual(['won 30'])
    for (const dice of [[1, 2], [2, 2], [4, 5], [5, 5], [5, 6]] as const) expect(field(dice)).toEqual(['won 10'])
    for (const dice of [[1, 4], [3, 3], [3, 4], [4, 4]] as const) expect(field(dice)).toEqual(['lost'])
  })

  it('pays place bets and leaves them up, and they’re off on the come-out', () => {
    const r = run(table(4, { 'place-4': 5, 'place-5': 5, 'place-6': 6 }), [2, 3], [3, 3], [1, 3])
    expect(fate(r.events, 'place-5')).toEqual(['won 7'])
    expect(fate(r.events, 'place-6')).toEqual(['won 7'])
    expect(fate(r.events, 'place-4')).toEqual(['won 9'])
    // The 4 made the point: a come-out 7 doesn't touch them.
    const comeOut = run(r.state, [3, 4])
    expect(fate(comeOut.events, 'place-6')).toEqual([])
    expect(comeOut.state.bets).toMatchObject({ 'place-4': 5, 'place-5': 5, 'place-6': 6 })
    expect(fate(run(table(4, { 'place-6': 6 }), [3, 4]).events, 'place-6')).toEqual(['lost'])
  })

  it('takes place bets on 6 and 8 in sixes and the rest in fives, from the table minimum', () => {
    const s = table(4)
    expect(minBet(s, 'place-6')).toBe(6)
    expect(minBet(s, 'place-9')).toBe(5)
    expect(isLegal(s, bet('place-6', 5))).toBe(false)
    expect(isLegal(s, bet('place-6', 12))).toBe(true)
    expect(isLegal(s, bet('place-5', 12))).toBe(false)
    const high = createTable({ limits: { min: 25, max: 1000, propMin: 5 }, seed: 1 })
    expect(minBet(high, 'place-8')).toBe(30)
    expect(minBet(high, 'hard-8')).toBe(5)
    expect(maxBet(high, 'place-8')).toBe(996)
  })

  it('pays the hardways only as a pair, and loses them easy', () => {
    expect(fate(run(table(5, { 'hard-6': 2 }), [3, 3]).events, 'hard-6')).toEqual(['won 18'])
    expect(fate(run(table(5, { 'hard-4': 2 }), [2, 2]).events, 'hard-4')).toEqual(['won 14'])
    expect(fate(run(table(5, { 'hard-6': 2 }), [2, 4]).events, 'hard-6')).toEqual(['lost'])
    expect(fate(run(table(5, { 'hard-10': 2 }), [3, 4]).events, 'hard-10')).toEqual(['lost'])
    expect(fate(run(table(null, { 'hard-8': 2 }), [3, 4]).events, 'hard-8')).toEqual([])
  })

  it('settles one-roll bets on the next roll, come-out or not', () => {
    const props = { 'any-seven': 1, 'any-craps': 1, yo: 1, aces: 1, boxcars: 1 } as const
    const after = (dice: readonly [number, number]) => run(table(null, props), dice).events
    expect(fate(after([3, 4]), 'any-seven')).toEqual(['won 4'])
    expect(fate(after([3, 4]), 'yo')).toEqual(['lost'])
    expect(fate(after([5, 6]), 'yo')).toEqual(['won 15'])
    expect(fate(after([1, 1]), 'aces')).toEqual(['won 30'])
    expect(fate(after([1, 1]), 'any-craps')).toEqual(['won 7'])
    expect(fate(after([6, 6]), 'boxcars')).toEqual(['won 30'])
    expect(fate(after([6, 6]), 'aces')).toEqual(['lost'])
  })
})

describe('putting chips down and taking them back', () => {
  it('keeps the pass line up once there’s a point', () => {
    expect(canTakeDown(table(null, { pass: 10 }), 'pass')).toBe(true)
    expect(canTakeDown(table(6, { pass: 10 }), 'pass')).toBe(false)
    expect(canTakeDown(table(6, { 'dont-pass': 10 }), 'dont-pass')).toBe(true)
    expect(() => apply(table(6, { pass: 10 }), { type: 'down', spot: 'pass' })).toThrow()
  })

  it('holds every bet but odds to the table limits', () => {
    expect(isLegal(table(), bet('pass', 4))).toBe(false)
    expect(isLegal(table(), bet('pass', 501))).toBe(false)
    expect(isLegal(table(), bet('yo', 1))).toBe(true)
    expect(isLegal(table(), bet('pass', 10), 9)).toBe(false)
  })

  it('rounds a chip up to what the spot takes, the way a dealer asks for the rest', () => {
    const s = table(4, { 'place-6': 6 })
    expect(fitBet(s, 'place-6', 1)).toBe(12)
    expect(fitBet(s, 'place-6', 25)).toBe(36)
    expect(fitBet(s, 'place-6', 25, 20)).toBe(24)
    expect(fitBet(s, 'place-6', 25, 5)).toBeNull()
    expect(fitBet(table(), 'pass', 1)).toBe(5)
    expect(fitBet(table(), 'pass', 1000)).toBe(500)
    expect(fitBet(table(5, { pass: 10 }), 'pass-odds', 25)).toBe(26)
    expect(fitBet(table(5, { pass: 10, 'pass-odds': 40 }), 'pass-odds', 1)).toBeNull()
  })

  it('totals what a roll pays and what comes back', () => {
    const r = run(table(6, { pass: 10, 'pass-odds': 25, 'place-8': 12, field: 5 }), [3, 3])
    // The pass line stays up; the odds come back with their winnings; the field loses; the 8 sits it out.
    expect(summarize(r.events)).toEqual({ paid: 10 + 30, lost: 5, back: 10 + 30 + 25 })
  })
})

describe('the house edge, worked out exactly', () => {
  const cases: [BetSpot, number][] = [
    ['pass', 7 / 495],
    ['come', 7 / 495],
    ['dont-pass', 3 / 220],
    ['dont-come', 3 / 220],
    ['field', 1 / 36],
    ['place-6', 1 / 66],
    ['place-8', 1 / 66],
    ['place-5', 1 / 25],
    ['place-9', 1 / 25],
    ['place-4', 1 / 15],
    ['place-10', 1 / 15],
    ['hard-6', 1 / 11],
    ['hard-8', 1 / 11],
    ['hard-4', 1 / 9],
    ['hard-10', 1 / 9],
    ['any-seven', 1 / 6],
    ['any-craps', 1 / 9],
    ['yo', 1 / 9],
    ['aces', 5 / 36],
    ['boxcars', 5 / 36],
  ]
  for (const [spot, edge] of cases) {
    it(`${spot}: ${(edge * 100).toFixed(3)}%`, () => {
      expect(houseEdge(spot)).toBeCloseTo(edge, 10)
    })
  }

  it('is nothing on odds, taken or laid, on every point', () => {
    for (const point of [4, 5, 6, 8, 9, 10] as const) {
      expect(houseEdge('pass-odds', point)).toBeCloseTo(0, 10)
      expect(houseEdge('dont-pass-odds', point)).toBeCloseTo(0, 10)
      expect(houseEdge(`come-odds-${point}`)).toBeCloseTo(0, 10)
      expect(houseEdge(`dont-come-odds-${point}`)).toBeCloseTo(0, 10)
    }
  })

  it('covers all 36 rolls', () => {
    expect(new Set(ALL_ROLLS.map((d) => d.join())).size).toBe(36)
  })
})

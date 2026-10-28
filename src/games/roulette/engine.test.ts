import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import {
  DOUBLE_ZERO,
  type Limits,
  type Spot,
  type TableEvent,
  type TableState,
  type WheelKind,
  WHEEL_ORDER,
  activeSpots,
  apply,
  betOn,
  colorOf,
  createTable,
  fitBet,
  isLegal,
  maxBet,
  minBet,
  onLayout,
  pocketName,
  spinPocket,
  spotInfo,
  spotsCovering,
  spotsOf,
  summarize,
  unitOf,
} from './engine'
import { houseEdge } from './odds'

const LIMITS: Limits = { insideMin: 1, outsideMin: 5, straightMax: 25, outsideMax: 250 }

const table = (wheel: WheelKind = 'european', bets: Record<Spot, number> = {}): TableState => createTable({ wheel, limits: LIMITS, bets })

const spin = (state: TableState, pocket: number) => apply(state, { type: 'spin', pocket })

/** What happened to each bet on a spin, by spot. */
const fates = (events: readonly TableEvent[]) =>
  Object.fromEntries(
    events.flatMap((e) => {
      if (e.type === 'won') return [[e.spot, `won ${e.paid}`]]
      if (e.type === 'lost') return [[e.spot, 'lost']]
      if (e.type === 'halved') return [[e.spot, `halved, ${e.back} back`]]
      return []
    }),
  )

describe('the wheels', () => {
  it('has every pocket once: 37 on a single-zero wheel, 38 with the double zero', () => {
    expect([...WHEEL_ORDER.european].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i))
    expect([...WHEEL_ORDER.american].sort((a, b) => a - b)).toEqual(Array.from({ length: 38 }, (_, i) => i))
    expect(WHEEL_ORDER.french).toEqual(WHEEL_ORDER.european)
  })

  it('alternates red and black around each wheel, with the zeros green', () => {
    for (const wheel of ['european', 'american'] as const) {
      const colors = WHEEL_ORDER[wheel].map(colorOf)
      // Neighbours differ, the zeros aside: on the American wheel, red 1 and red 27 sit either side of 00.
      colors.forEach((c, i) => {
        const next = colors[(i + 1) % colors.length]
        if (c !== 'green' && next !== 'green') expect(next).not.toBe(c)
      })
      expect(colors.filter((c) => c === 'red')).toHaveLength(18)
    }
    expect(colorOf(0)).toBe('green')
    expect(colorOf(DOUBLE_ZERO)).toBe('green')
    expect([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].every((n) => colorOf(n) === 'red')).toBe(true)
  })

  it('puts each number across the American wheel from the next one, and 0 across from 00', () => {
    const order = WHEEL_ORDER.american
    const across = (p: number) => order[(order.indexOf(p) + 19) % 38]
    expect(across(0)).toBe(DOUBLE_ZERO)
    for (let n = 1; n <= 35; n += 2) expect(across(n)).toBe(n + 1)
  })

  it('lands anywhere on the wheel, as often as anywhere else', () => {
    const rng = createRng(11)
    const counts = new Map<number, number>()
    for (let i = 0; i < 38_000; i++) {
      const p = spinPocket(rng, 'american')
      counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    expect(counts.size).toBe(38)
    for (const n of counts.values()) expect(Math.abs(n - 1000)).toBeLessThan(130)
  })

  it('names the double zero 00', () => {
    expect(pocketName(DOUBLE_ZERO)).toBe('00')
    expect(pocketName(17)).toBe('17')
  })
})

describe('the layout', () => {
  const count = (wheel: WheelKind, kind: string) => spotsOf(wheel).filter((s) => spotInfo(wheel, s)!.kind === kind).length

  it('has every inside bet of a single-zero layout', () => {
    expect(count('european', 'straight')).toBe(37)
    expect(count('european', 'split')).toBe(60)
    expect(count('european', 'street')).toBe(12)
    expect(count('european', 'trio')).toBe(2)
    expect(count('european', 'corner')).toBe(22)
    expect(count('european', 'first-four')).toBe(1)
    expect(count('european', 'line')).toBe(11)
    expect(spotInfo('european', 'top-line')).toBeNull()
    expect(spotInfo('european', 'straight-00')).toBeNull()
  })

  it('has the American layout’s own bets around the zeros', () => {
    expect(count('american', 'straight')).toBe(38)
    expect(count('american', 'split')).toBe(62)
    expect(count('american', 'trio')).toBe(3)
    expect(spotInfo('american', 'first-four')).toBeNull()
    for (const spot of ['split-0-00', 'split-0-1', 'split-0-2', 'split-2-00', 'split-3-00', 'trio-0-1-2', 'trio-0-2-00', 'trio-2-3-00']) {
      expect(spotInfo('american', spot), spot).not.toBeNull()
    }
    expect(spotInfo('american', 'split-0-3')).toBeNull()
    expect(spotInfo('american', 'top-line')!.numbers).toEqual([0, 1, 2, 3, DOUBLE_ZERO])
  })

  it('covers each number with the bets around it', () => {
    // 17 sits in the middle of the layout: one straight, four splits, a street, four corners and two six lines, and five outside bets.
    expect(spotsCovering('european', 17).sort()).toEqual(
      [
        'straight-17', 'split-14-17', 'split-16-17', 'split-17-18', 'split-17-20', 'street-16',
        'corner-13-14-16-17', 'corner-14-15-17-18', 'corner-16-17-19-20', 'corner-17-18-20-21',
        'line-13', 'line-16', 'dozen-2', 'column-2', 'black', 'odd', 'low',
      ].sort(),
    )
    expect(spotsCovering('european', 0).sort()).toEqual(['first-four', 'split-0-1', 'split-0-2', 'split-0-3', 'straight-0', 'trio-0-1-2', 'trio-0-2-3'].sort())
    expect(spotsCovering('american', DOUBLE_ZERO).sort()).toEqual(['split-0-00', 'split-2-00', 'split-3-00', 'straight-00', 'top-line', 'trio-0-2-00', 'trio-2-3-00'].sort())
  })

  it('sorts the outside bets into dozens, columns and eighteens', () => {
    expect(spotInfo('european', 'column-1')!.numbers).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34])
    expect(spotInfo('european', 'dozen-3')!.numbers).toEqual([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36])
    for (const spot of ['red', 'black', 'odd', 'even', 'low', 'high']) expect(spotInfo('european', spot)!.numbers).toHaveLength(18)
    expect(spotInfo('european', 'line-31')!.numbers).toEqual([31, 32, 33, 34, 35, 36])
    expect(spotInfo('european', 'street-34')!.numbers).toEqual([34, 35, 36])
  })
})

describe('a spin', () => {
  it('pays each bet 36/n − 1 to 1, and the top line 6 to 1', () => {
    const bets = { 'straight-17': 2, 'split-17-20': 2, 'street-16': 2, 'corner-16-17-19-20': 2, 'line-16': 2, 'dozen-2': 5, 'column-2': 5, black: 5, odd: 5, low: 5 }
    const { events } = spin(table('european', bets), 17)
    expect(fates(events)).toEqual({
      'straight-17': 'won 70',
      'split-17-20': 'won 34',
      'street-16': 'won 22',
      'corner-16-17-19-20': 'won 16',
      'line-16': 'won 10',
      'dozen-2': 'won 10',
      'column-2': 'won 10',
      black: 'won 5',
      odd: 'won 5',
      low: 'won 5',
    })
    expect(fates(spin(table('american', { 'top-line': 2 }), DOUBLE_ZERO).events)).toEqual({ 'top-line': 'won 12' })
    expect(fates(spin(table('european', { 'trio-0-2-3': 2, 'first-four': 2 }), 0).events)).toEqual({ 'trio-0-2-3': 'won 22', 'first-four': 'won 16' })
  })

  it('leaves winning bets up and sweeps the losers', () => {
    const { state, events } = spin(table('european', { red: 10, black: 10, 'straight-3': 1 }), 3)
    expect(state.bets).toEqual({ red: 10, 'straight-3': 1 })
    expect(summarize(events)).toEqual({ paid: 10 + 35, lost: 10, back: 0 })
    expect(state.spins).toBe(1)
    expect(state.history).toEqual([3])
  })

  it('loses every outside bet to a zero, but for la partage on the French wheel', () => {
    const bets = { red: 10, odd: 6, 'dozen-1': 5, 'straight-0': 1 }
    expect(fates(spin(table('european', bets), 0).events)).toEqual({ red: 'lost', odd: 'lost', 'dozen-1': 'lost', 'straight-0': 'won 35' })
    const french = spin(table('french', bets), 0)
    expect(fates(french.events)).toEqual({ red: 'halved, 5 back', odd: 'halved, 3 back', 'dozen-1': 'lost', 'straight-0': 'won 35' })
    expect(summarize(french.events)).toEqual({ paid: 35, lost: 5 + 3 + 5, back: 5 + 3 })
    expect(french.state.bets).toEqual({ 'straight-0': 1 })
    // Double zero gets no partage: the American wheel has none.
    expect(fates(spin(table('american', { red: 10 }), DOUBLE_ZERO).events)).toEqual({ red: 'lost' })
  })

  it('keeps the latest numbers, newest first', () => {
    let state = table()
    for (const p of [5, 0, 32]) state = spin(state, p).state
    expect(state.history).toEqual([32, 0, 5])
  })

  it('only lands in a pocket the wheel has', () => {
    expect(isLegal(table('european'), { type: 'spin', pocket: DOUBLE_ZERO })).toBe(false)
    expect(isLegal(table('american'), { type: 'spin', pocket: DOUBLE_ZERO })).toBe(true)
    expect(() => spin(table('european'), 40)).toThrow()
  })
})

describe('betting', () => {
  it('takes inside bets from the inside minimum, outside bets from the outside minimum', () => {
    const s = table()
    expect(minBet(s, 'straight-5')).toBe(1)
    expect(minBet(s, 'red')).toBe(5)
    expect(isLegal(s, { type: 'bet', spot: 'red', amount: 4 })).toBe(false)
    expect(isLegal(s, { type: 'bet', spot: 'red', amount: 5 })).toBe(true)
    expect(isLegal(s, { type: 'bet', spot: 'straight-5', amount: 1 })).toBe(true)
  })

  it('scales an inside bet’s maximum with the numbers it covers', () => {
    const s = table()
    expect(maxBet(s, 'straight-5')).toBe(25)
    expect(maxBet(s, 'split-5-8')).toBe(50)
    expect(maxBet(s, 'line-1')).toBe(150)
    expect(maxBet(s, 'dozen-1')).toBe(250)
    expect(isLegal(s, { type: 'bet', spot: 'straight-5', amount: 26 })).toBe(false)
  })

  it('puts the French wheel’s even chances down in twos', () => {
    const s = table('french')
    expect(unitOf(s, 'red')).toBe(2)
    expect(unitOf(s, 'dozen-1')).toBe(1)
    expect(minBet(s, 'red')).toBe(6)
    expect(isLegal(s, { type: 'bet', spot: 'red', amount: 7 })).toBe(false)
    expect(isLegal(s, { type: 'bet', spot: 'red', amount: 8 })).toBe(true)
  })

  it('fits a chip to the spot: rounded up to its unit and minimum, held to its maximum and your caps', () => {
    const s = table('french')
    expect(fitBet(s, 'red', 5, 500)).toBe(6)
    expect(fitBet(s, 'dozen-1', 1, 500)).toBe(5)
    expect(fitBet(s, 'straight-1', 100, 500)).toBe(25)
    expect(fitBet(s, 'straight-1', 5, 3)).toBe(3)
    expect(fitBet(s, 'red', 5, 4)).toBeNull()
    const full = apply(s, { type: 'bet', spot: 'straight-1', amount: 25 }).state
    expect(fitBet(full, 'straight-1', 1, 500)).toBeNull()
    expect(fitBet(s, 'top-line', 5, 500)).toBeNull()
  })

  it('takes any bet down before the spin, and counts what’s on the layout', () => {
    let s = table()
    for (const [spot, amount] of [['red', 10], ['straight-7', 2], ['red', 5]] as const) s = apply(s, { type: 'bet', spot, amount }).state
    expect(betOn(s, 'red')).toBe(15)
    expect(onLayout(s.bets)).toBe(17)
    const { state, events } = apply(s, { type: 'down', spot: 'red' })
    expect(events).toEqual([{ type: 'down', spot: 'red', amount: 15 }])
    expect(activeSpots(state.bets)).toEqual(['straight-7'])
    expect(isLegal(state, { type: 'down', spot: 'red' })).toBe(false)
  })

  it('won’t take more than you have, or bets the layout doesn’t offer', () => {
    const s = table()
    expect(isLegal(s, { type: 'bet', spot: 'red', amount: 10 }, 9)).toBe(false)
    expect(isLegal(s, { type: 'bet', spot: 'split-1-5', amount: 1 })).toBe(false)
    expect(isLegal(s, { type: 'bet', spot: 'red', amount: 5.5 })).toBe(false)
    expect(() => apply(s, { type: 'bet', spot: 'split-1-5', amount: 1 })).toThrow()
  })
})

describe('the house edge, worked out through the engine', () => {
  const close = (wheel: WheelKind, spot: Spot, percent: number) => expect(houseEdge(wheel, spot) * 100, `${wheel} ${spot}`).toBeCloseTo(percent, 2)

  it('is 2.70% on every bet on the European wheel', () => {
    for (const spot of spotsOf('european')) close('european', spot, 100 / 37)
  })

  it('is 5.26% on the American wheel, and 7.89% on the top line', () => {
    for (const spot of spotsOf('american')) close('american', spot, spot === 'top-line' ? 300 / 38 : 200 / 38)
    close('american', 'top-line', 7.89)
    close('american', 'red', 5.26)
  })

  it('halves on the French wheel’s even chances: 1.35%', () => {
    for (const spot of spotsOf('french')) {
      const even = ['red', 'black', 'odd', 'even', 'low', 'high'].includes(spot)
      close('french', spot, even ? 50 / 37 : 100 / 37)
    }
    close('french', 'red', 1.35)
    close('french', 'straight-17', 2.7)
  })
})

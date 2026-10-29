import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import {
  type Line,
  type Rules,
  type Stops,
  type SymbolId,
  MAX_COINS,
  REEL_NUMBERS,
  STRIP_LENGTH,
  evaluate,
  isStops,
  lineOf,
  meterCaps,
  meterReset,
  meterShare,
  spin,
  spinStops,
  symbolAt,
} from './engine'
import { MACHINES, MACHINE_IDS } from './machines'
import { report, returnNow } from './odds'

const { caps, sevens, rocket } = MACHINES

/** The stops that put these symbols on the line: the first stop on each reel showing each one. */
function stopsFor(rules: Rules, line: readonly SymbolId[]): Stops {
  return line.map((symbol, i) => {
    const at = rules.reels[i].findIndex((s) => s.symbol === symbol)
    if (at === -1) throw new Error(`No ${symbol} on reel ${i + 1}`)
    return at
  }) as unknown as Stops
}

/** Coins a line pays, for so many coins played. */
const pays = (rules: Rules, line: Line, coins = 1) => evaluate(rules, line, coins)?.coins ?? 0

describe('the reels', () => {
  it('has 22 stops on every reel, a symbol and then a blank, with 64 numbers behind them', () => {
    for (const id of MACHINE_IDS) {
      for (const strip of MACHINES[id].reels) {
        expect(strip).toHaveLength(STRIP_LENGTH)
        strip.forEach((stop, i) => {
          expect(stop.symbol === 'blank').toBe(i % 2 === 1)
          expect(stop.weight).toBeGreaterThan(0)
          expect(Number.isInteger(stop.weight)).toBe(true)
        })
        expect(strip.reduce((n, s) => n + s.weight, 0)).toBe(REEL_NUMBERS)
      }
    }
  })

  it('gives every machine one top symbol per reel, owning 2 of its 64 numbers', () => {
    const tops: Record<string, SymbolId> = { caps: 'cap', sevens: 'atom', rocket: 'rocket' }
    for (const id of MACHINE_IDS) {
      for (const strip of MACHINES[id].reels) {
        const top = strip.filter((s) => s.symbol === tops[id])
        expect(top).toEqual([{ symbol: tops[id], weight: 2 }])
      }
    }
  })

  it('reads the window round the strip: the row above the line, the line, and the row below', () => {
    const strip = caps.reels[0]
    expect(symbolAt(strip, 0)).toBe('cap')
    expect(symbolAt(strip, 0, -1)).toBe('blank')
    expect(symbolAt(strip, 21, 1)).toBe('cap')
    expect(symbolAt(strip, 1, -1)).toBe('cap')
    expect(lineOf(caps, [0, 0, 0])).toEqual(['cap', 'cap', 'cap'])
  })

  it('lands on each stop as often as its numbers say', () => {
    const rng = createRng(5)
    const counts = caps.reels.map((strip) => strip.map(() => 0))
    const n = 64_000
    for (let i = 0; i < n; i++) spinStops(rng, caps).forEach((stop, reel) => counts[reel][stop]++)
    caps.reels.forEach((strip, reel) =>
      strip.forEach((stop, i) => {
        expect(counts[reel][i] / n).toBeCloseTo(stop.weight / REEL_NUMBERS, 2)
      }),
    )
  })

  it('knows a stop on every reel from anything else', () => {
    expect(isStops(caps, [0, 21, 5])).toBe(true)
    expect(isStops(caps, [0, 22, 5])).toBe(false)
    expect(isStops(caps, [0, 1])).toBe(false)
    expect(isStops(caps, [0, 1.5, 2])).toBe(false)
    expect(isStops(caps, 'no')).toBe(false)
  })
})

describe('Bottle Caps', () => {
  it('pays three of a kind, any three junk, and cherries anywhere', () => {
    expect(pays(caps, ['cap', 'cap', 'cap'])).toBe(500)
    expect(pays(caps, ['bell', 'bell', 'bell'])).toBe(100)
    expect(pays(caps, ['cherry', 'cherry', 'cherry'])).toBe(50)
    expect(pays(caps, ['shoe', 'shoe', 'shoe'])).toBe(40)
    expect(pays(caps, ['can', 'can', 'can'])).toBe(25)
    expect(pays(caps, ['cap', 'bell', 'can'])).toBe(5)
    expect(pays(caps, ['blank', 'cherry', 'cherry'])).toBe(5)
    expect(pays(caps, ['blank', 'blank', 'cherry'])).toBe(2)
    expect(pays(caps, ['cap', 'cap', 'blank'])).toBe(0)
    // A cherry isn't junk.
    expect(pays(caps, ['cap', 'cap', 'cherry'])).toBe(2)
  })

  it('pays only the highest win on the line', () => {
    const win = evaluate(caps, ['cherry', 'cherry', 'cherry'], 1)!
    expect(win.coins).toBe(50)
    expect(caps.pays[win.pay].match).toEqual({ kind: 'line', reels: [['cherry'], ['cherry'], ['cherry']] })
  })

  it('pays the same for each coin, however many are played', () => {
    expect([1, 2, 3].map((coins) => pays(caps, ['cap', 'cap', 'cap'], coins))).toEqual([500, 1000, 1500])
    expect([1, 2, 3].map((coins) => pays(caps, ['cherry', 'blank', 'blank'], coins))).toEqual([2, 4, 6])
  })
})

describe('Atomic Sevens', () => {
  it('lets an atom stand in for any symbol, doubling the pay, and two of them quadrupling it', () => {
    expect(pays(sevens, ['seven', 'seven', 'seven'])).toBe(100)
    expect(evaluate(sevens, ['seven', 'atom', 'seven'], 1)).toMatchObject({ coins: 200, wilds: 1, multiplier: 2 })
    expect(evaluate(sevens, ['atom', 'seven', 'atom'], 1)).toMatchObject({ coins: 400, wilds: 2, multiplier: 4 })
    expect(pays(sevens, ['bar1', 'bar3', 'atom'])).toBe(10)
    // The best reading of the line: three single bars doubled beats any bars doubled.
    expect(pays(sevens, ['bar1', 'atom', 'bar1'])).toBe(20)
    expect(pays(sevens, ['atom', 'atom', 'bar1'])).toBe(40)
  })

  it('pays three atoms their own award, unmultiplied, with a bonus on three coins', () => {
    expect(evaluate(sevens, ['atom', 'atom', 'atom'], 1)).toMatchObject({ coins: 1000, wilds: 0, multiplier: 1 })
    expect([1, 2, 3].map((coins) => pays(sevens, ['atom', 'atom', 'atom'], coins))).toEqual([1000, 2000, 4000])
  })

  it('pays atoms on their own, anywhere on the line', () => {
    expect(pays(sevens, ['atom', 'blank', 'blank'])).toBe(2)
    expect(pays(sevens, ['blank', 'blank', 'atom'])).toBe(2)
    expect(pays(sevens, ['atom', 'blank', 'atom'])).toBe(10)
    // Two atoms and a seven: four times the sevens.
    expect(pays(sevens, ['atom', 'atom', 'seven'])).toBe(400)
    expect(pays(sevens, ['seven', 'bar1', 'blank'])).toBe(0)
  })
})

describe('Moon Rocket', () => {
  const jackpot = stopsFor(rocket, ['rocket', 'rocket', 'rocket'])

  it('wins the meter on three rockets for three coins, and a fixed award for fewer', () => {
    expect(evaluate(rocket, ['rocket', 'rocket', 'rocket'], 3)).toMatchObject({ meter: true, coins: 4000 })
    expect(evaluate(rocket, ['rocket', 'rocket', 'rocket'], 1)).toMatchObject({ meter: false, coins: 1000 })
    expect(evaluate(rocket, ['rocket', 'rocket', 'rocket'], 2)).toMatchObject({ meter: false, coins: 2000 })
    expect(pays(rocket, ['rocket', 'blank', 'rocket'])).toBe(20)
    expect(pays(rocket, ['planet', 'rocket', 'blank'])).toBe(2)
    expect(pays(rocket, ['saucer', 'robot', 'raygun'])).toBe(0)
  })

  it('feeds the meter 2% of every three-coin bet, and nothing from fewer coins', () => {
    expect(meterShare(rocket, 3)).toBe(150)
    expect(meterShare(rocket, 2)).toBe(0)
    expect(meterShare(caps, 3)).toBe(0)
    const nothing = stopsFor(rocket, ['blank', 'blank', 'blank'])
    expect(spin(rocket, nothing, 3, 10_000_000).meter).toBe(10_000_150)
    expect(spin(rocket, nothing, 1, 10_000_000).meter).toBe(10_000_000)
  })

  it('pays whatever is on the meter, this bet’s share included, and starts it again from the reset', () => {
    const won = spin(rocket, jackpot, 3, 12_345_678)
    expect(won.paid).toBe(meterCaps(12_345_678 + 150))
    expect(won.paid).toBe(123_458)
    expect(won.meter).toBe(meterReset(rocket))
    expect(meterReset(rocket)).toBe(10_000_000)
    // One coin can't win it, and leaves it be.
    const small = spin(rocket, jackpot, 1, 12_345_678)
    expect(small.paid).toBe(1000 * 25)
    expect(small.meter).toBe(12_345_678)
  })
})

describe('a spin', () => {
  it('costs the coins played, and pays wins in caps', () => {
    const s = spin(sevens, stopsFor(sevens, ['seven', 'atom', 'seven']), 2)
    expect(s.bet).toBe(10)
    expect(s.paid).toBe(400 * 5)
    expect(s.line).toEqual(['seven', 'atom', 'seven'])
    expect(s.meter).toBeNull()
    const lost = spin(caps, stopsFor(caps, ['blank', 'blank', 'blank']), 3)
    expect(lost).toMatchObject({ bet: 3, paid: 0, win: null })
  })

  it('refuses coins it can’t take and stops that aren’t on the reels', () => {
    expect(() => spin(caps, [0, 0, 0], 0)).toThrow()
    expect(() => spin(caps, [0, 0, 0], 4)).toThrow()
    expect(() => spin(caps, [0, 0, 22], 1)).toThrow()
  })
})

describe('the return', () => {
  /** The same figures the long way: every one of the 22³ stops, by its numbers. */
  function everyStop(rules: Rules, coins: number) {
    const [a, b, c] = rules.reels
    let paid = 0
    let hits = 0
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++)
        for (let k = 0; k < c.length; k++) {
          const weight = a[i].weight * b[j].weight * c[k].weight
          const win = evaluate(rules, lineOf(rules, [i, j, k]), coins)
          if (win) {
            paid += weight * win.coins
            hits += weight
          }
        }
    const total = REEL_NUMBERS ** 3
    return { base: paid / total / coins, hit: hits / total }
  }

  it('matches a count of every stop', () => {
    for (const id of MACHINE_IDS) {
      for (let coins = 1; coins <= MAX_COINS; coins++) {
        const exact = everyStop(MACHINES[id], coins)
        expect(report(MACHINES[id], coins).base).toBeCloseTo(exact.base, 12)
        expect(report(MACHINES[id], coins).hit).toBeCloseTo(exact.hit, 12)
      }
    }
  })

  it('gives back about 95% on every machine for three coins', () => {
    for (const id of MACHINE_IDS) {
      const total = report(MACHINES[id], MAX_COINS).total
      expect(total).toBeGreaterThan(0.945)
      expect(total).toBeLessThan(0.955)
    }
  })

  it('publishes the figures on the paytable page', () => {
    const pct = (n: number) => Math.round(n * 10_000) / 100
    expect([1, 2, 3].map((c) => pct(report(caps, c).total))).toEqual([94.96, 94.96, 94.96])
    expect([1, 2, 3].map((c) => pct(report(sevens, c).total))).toEqual([93.99, 93.99, 95.01])
    expect([1, 2, 3].map((c) => pct(report(rocket, c).total))).toEqual([92.05, 92.05, 95.07])
    expect(pct(report(rocket, 3).base)).toBe(93.07)
    expect(report(rocket, 3).meter).toBeCloseTo(0.02, 12)
    expect(report(rocket, 1).meter).toBe(0)
    expect(1 / report(caps, 1).hit).toBeCloseTo(3.71, 2)
    expect(1 / report(sevens, 1).hit).toBeCloseTo(7.38, 2)
    expect(1 / report(rocket, 1).hit).toBeCloseTo(9.2, 1)
  })

  it('makes each machine’s top award one spin in 32,768', () => {
    for (const id of MACHINE_IDS) expect(1 / report(MACHINES[id], 3).pays[0].chance).toBeCloseTo(32_768, 6)
  })

  it('sums each pay’s share to the base return', () => {
    for (const id of MACHINE_IDS) {
      const r = report(MACHINES[id], 3)
      expect(r.pays.reduce((n, p) => n + p.share, 0)).toBeCloseTo(r.base, 12)
      expect(r.pays.reduce((n, p) => n + p.chance, 0)).toBeCloseTo(r.hit, 12)
    }
  })

  it('climbs past 100% on Moon Rocket once the meter is high enough', () => {
    const atReset = returnNow(rocket, meterReset(rocket)!)
    expect(atReset).toBeCloseTo(report(rocket, 3).base, 4)
    expect(returnNow(rocket, 20_000_000)).toBeGreaterThan(atReset)
    // Each extra cap on the meter is worth its chance of being won.
    const extra = (returnNow(rocket, 20_000_000) - returnNow(rocket, 10_000_000)) * 75
    expect(extra).toBeCloseTo(100_000 / 32_768, 6)
    expect(returnNow(rocket, 26_000_000)).toBeLessThan(1)
    expect(returnNow(rocket, 28_000_000)).toBeGreaterThan(1)
    expect(returnNow(caps, 0)).toBe(report(caps, 3).total)
  })

  it('comes out near the figure over a long run of real spins', () => {
    const rng = createRng(2024)
    let bet = 0
    let paid = 0
    for (let i = 0; i < 400_000; i++) {
      const s = spin(caps, spinStops(rng, caps), 1)
      bet += s.bet
      paid += s.paid
    }
    expect(Math.abs(paid / bet - report(caps, 1).total)).toBeLessThan(0.025)
  })
})

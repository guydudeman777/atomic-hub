/**
 * The three machines on the floor: their reel strips, the numbers behind
 * every stop, and their paytables. These are the rules each machine plays
 * by (engine.ts); what they're called and what the change girl says about
 * them is in content.ts.
 *
 * Every strip has 11 symbols with a blank after each. A stop's weight is
 * how many of the reel's 64 numbers land on it. The returns these give are
 * worked out exactly in odds.ts and checked by the tests:
 * - Bottle Caps: 94.96% for one coin or three. A hit every 3.7 spins.
 * - Atomic Sevens: 93.99% for one or two coins, 95.01% for three, which
 *   pays a bonus on three atoms. A hit every 7.4 spins.
 * - Moon Rocket: 92.05% for one or two coins. Three coins return 93.07%
 *   with the jackpot counted at its reset, and another 2% goes onto the
 *   meter: 95.07%. A hit every 9.2 spins.
 */

import type { Pay, Rules, Strip, SymbolId } from './engine'

export type MachineId = 'caps' | 'sevens' | 'rocket'

export const MACHINE_IDS: readonly MachineId[] = ['caps', 'sevens', 'rocket']

/** A strip from its symbols in order, each with its weight, and the weights of the blanks after them. */
function strip(symbols: readonly [SymbolId, number][], blanks: readonly number[]): Strip {
  if (symbols.length !== blanks.length) throw new Error('A blank after every symbol')
  return symbols.flatMap(([symbol, weight], i) => [
    { symbol, weight },
    { symbol: 'blank' as const, weight: blanks[i] },
  ])
}

const three = (symbol: SymbolId): Pay['match'] => ({ kind: 'line', reels: [[symbol], [symbol], [symbol]] })
const any = (symbols: readonly SymbolId[]): Pay['match'] => ({ kind: 'line', reels: [symbols, symbols, symbols] })
const count = (symbol: SymbolId, n: number): Pay['match'] => ({ kind: 'count', symbol, count: n })
/** So many coins for each coin played. */
const per = (coins: number): Pay['pays'] => [coins, coins * 2, coins * 3]

/** The junk on Bottle Caps: anything but a cherry. */
export const JUNK: readonly SymbolId[] = ['cap', 'bell', 'shoe', 'can']
export const BARS: readonly SymbolId[] = ['bar1', 'bar2', 'bar3']

export const MACHINES: Record<MachineId, Rules> = {
  /** Wasteland junk and cherries, a cap a coin. A straight multiplier: every coin pays the same. Small wins, often. */
  caps: {
    coin: 1,
    reels: [
      strip(
        [['cap', 2], ['cherry', 2], ['can', 3], ['bell', 2], ['shoe', 3], ['cherry', 2], ['can', 3], ['bell', 3], ['shoe', 4], ['cherry', 2], ['can', 4]],
        [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4],
      ),
      strip(
        [['cap', 2], ['can', 4], ['cherry', 2], ['shoe', 3], ['bell', 2], ['can', 3], ['cherry', 2], ['shoe', 4], ['can', 4], ['bell', 2], ['cherry', 1]],
        [3, 3, 3, 4, 3, 3, 3, 4, 3, 3, 3],
      ),
      strip(
        [['cap', 2], ['shoe', 4], ['can', 3], ['cherry', 1], ['bell', 2], ['can', 3], ['shoe', 4], ['cherry', 2], ['bell', 2], ['can', 4], ['cherry', 1]],
        [3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3],
      ),
    ],
    pays: [
      { match: three('cap'), pays: per(500) },
      { match: three('bell'), pays: per(100) },
      { match: three('cherry'), pays: per(50) },
      { match: three('shoe'), pays: per(40) },
      { match: three('can'), pays: per(25) },
      { match: any(JUNK), pays: per(5) },
      { match: count('cherry', 2), pays: per(5) },
      { match: count('cherry', 1), pays: per(2) },
    ],
  },

  /** Sevens and bars with a wild atom that doubles a win, or quadruples it two at a time. Five caps a coin. */
  sevens: {
    coin: 5,
    reels: [
      strip(
        [['atom', 2], ['bar1', 3], ['bar2', 2], ['seven', 2], ['bar1', 4], ['bar3', 2], ['bar2', 2], ['bar1', 4], ['seven', 2], ['bar3', 3], ['bar2', 3]],
        [3, 3, 3, 4, 3, 3, 3, 4, 3, 3, 3],
      ),
      strip(
        [['atom', 2], ['bar2', 2], ['bar1', 4], ['seven', 2], ['bar3', 2], ['bar1', 4], ['bar2', 1], ['seven', 2], ['bar1', 4], ['bar3', 3], ['bar2', 2]],
        [3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3],
      ),
      strip(
        [['atom', 2], ['bar1', 4], ['seven', 1], ['bar2', 2], ['bar3', 2], ['bar1', 3], ['bar2', 2], ['seven', 2], ['bar1', 4], ['bar3', 3], ['bar2', 3]],
        [4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 3],
      ),
    ],
    pays: [
      { match: three('atom'), pays: [1000, 2000, 4000] },
      { match: three('seven'), pays: per(100) },
      { match: three('bar3'), pays: per(40) },
      { match: three('bar2'), pays: per(25) },
      { match: three('bar1'), pays: per(10) },
      { match: any(BARS), pays: per(5) },
      { match: count('atom', 2), pays: per(10) },
      { match: count('atom', 1), pays: per(2) },
    ],
    wild: { symbol: 'atom', multipliers: [1, 2, 4] },
  },

  /** Rockets, saucers and robots, 25 caps a coin, with a progressive jackpot on three rockets for three coins. Long dry spells, big wins. */
  rocket: {
    coin: 25,
    reels: [
      strip(
        [['rocket', 2], ['planet', 5], ['raygun', 3], ['robot', 3], ['planet', 5], ['saucer', 2], ['raygun', 3], ['planet', 5], ['robot', 4], ['raygun', 3], ['saucer', 3]],
        [2, 2, 3, 2, 3, 2, 2, 3, 2, 3, 2],
      ),
      strip(
        [['rocket', 2], ['raygun', 3], ['planet', 5], ['saucer', 2], ['raygun', 3], ['planet', 5], ['robot', 2], ['raygun', 4], ['planet', 6], ['saucer', 2], ['robot', 2]],
        [2, 3, 2, 3, 3, 2, 3, 2, 3, 3, 2],
      ),
      strip(
        [['rocket', 2], ['planet', 5], ['robot', 3], ['raygun', 3], ['saucer', 2], ['planet', 5], ['raygun', 3], ['robot', 3], ['planet', 5], ['saucer', 3], ['raygun', 3]],
        [2, 3, 2, 3, 2, 2, 3, 2, 3, 2, 3],
      ),
    ],
    pays: [
      { match: three('rocket'), pays: [1000, 2000, 'meter'] },
      { match: three('saucer'), pays: per(250) },
      { match: three('robot'), pays: per(100) },
      { match: three('raygun'), pays: per(50) },
      { match: three('planet'), pays: per(25) },
      { match: count('rocket', 2), pays: per(20) },
      { match: count('rocket', 1), pays: per(2) },
    ],
    progressive: { reset: 100_000, shareBp: 200 },
  },
}

export const machineRules = (id: string): Rules => MACHINES[id as MachineId] ?? MACHINES.caps

export const isMachineId = (id: unknown): id is MachineId => typeof id === 'string' && (MACHINE_IDS as readonly string[]).includes(id)

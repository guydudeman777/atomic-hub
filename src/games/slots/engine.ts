/**
 * Slots rules engine: a three-reel machine with one pay line.
 *
 * Pure and framework-free, like the other casino games' engines: the UI
 * and the tests play a machine through `spin`. Caps live
 * outside the engine: a spin reports what it cost and what it paid, and
 * callers move the money. Nor does it choose where the reels stop: a spin
 * names its stops (`spinStops` picks them at random), so an online bank can
 * send the stops themselves rather than a seed anyone could read ahead.
 *
 * Rules
 * - Each reel is a strip of 22 stops, symbols and blanks taking turns, as
 *   on the mechanical reels these machines copy. The window shows three
 *   stops of each reel; only the middle row, the pay line, pays.
 * - Stops aren't equally likely. Each reel has 64 numbers behind it, and
 *   every stop owns a few of them: a spin draws one number for each reel
 *   and turns it to the stop that owns it. The top symbol owns 2 of the 64;
 *   a blank, two or three. That's the virtual reel every machine since the
 *   1980s has used, and why the jackpot shows just off the line more often
 *   than on it. The paytable page lists every stop and its numbers.
 * - You play one, two or three coins a spin, and every pay is so many coins
 *   for each coin played, but for the top award: three coins pays a bonus
 *   on some machines, and on a progressive machine three coins wins the
 *   meter. Only the highest win on the line is paid.
 * - A pay of three symbols can take any of a set on each reel (any three
 *   bars, say). Some pays count a symbol anywhere on the line (any cherry,
 *   any two atoms).
 * - A wild symbol stands in for any other in a three-symbol pay, and
 *   multiplies it: twice for one wild, four times for two. Three wilds pay
 *   their own award, unmultiplied.
 * - A progressive machine's meter starts at its reset and grows by a share
 *   of every three-coin bet. Three coins and three of its top symbol win
 *   whatever's on the meter, which then starts again from the reset. It's
 *   kept in hundredths of a cap so every share is whole.
 */

import { type Rng, randInt } from '../../core/rng'

export type SymbolId =
  | 'blank'
  // Bottle Caps
  | 'cap'
  | 'bell'
  | 'shoe'
  | 'can'
  | 'cherry'
  // Atomic Sevens
  | 'atom'
  | 'seven'
  | 'bar3'
  | 'bar2'
  | 'bar1'
  // Moon Rocket
  | 'rocket'
  | 'saucer'
  | 'robot'
  | 'raygun'
  | 'planet'

/** A place on a reel's strip, and how many of the reel's numbers land there. */
export interface Stop {
  readonly symbol: SymbolId
  readonly weight: number
}

export type Strip = readonly Stop[]

/** Where each reel stops: an index into its strip. */
export type Stops = readonly [number, number, number]

/** The three symbols on the pay line. */
export type Line = readonly [SymbolId, SymbolId, SymbolId]

export const REELS = 3
export const MAX_COINS = 3
export const STRIP_LENGTH = 22
/** The numbers behind each reel. */
export const REEL_NUMBERS = 64

export type Match =
  /** A symbol from each reel's set. */
  | { readonly kind: 'line'; readonly reels: readonly [readonly SymbolId[], readonly SymbolId[], readonly SymbolId[]] }
  /** At least `count` of a symbol, anywhere on the line. */
  | { readonly kind: 'count'; readonly symbol: SymbolId; readonly count: number }

export interface Pay {
  readonly match: Match
  /** Coins paid for one, two and three coins played. `meter` for the progressive. */
  readonly pays: readonly [number, number, number | 'meter']
}

export interface Rules {
  /** Caps a coin. */
  readonly coin: number
  readonly reels: readonly [Strip, Strip, Strip]
  /** Highest first. */
  readonly pays: readonly Pay[]
  readonly wild?: { readonly symbol: SymbolId; readonly multipliers: readonly [number, number, number] }
  readonly progressive?: {
    /** Where the meter starts, in caps. */
    readonly reset: number
    /** The share of each three-coin bet that goes onto the meter, in hundredths of a percent. */
    readonly shareBp: number
  }
}

/** The symbol at `offset` stops below `stop` on a strip: -1 is the row above the line, 1 the row below. */
export function symbolAt(strip: Strip, stop: number, offset = 0): SymbolId {
  const n = strip.length
  return strip[(((stop + offset) % n) + n) % n].symbol
}

export const lineOf = (rules: Rules, stops: Stops): Line => [symbolAt(rules.reels[0], stops[0]), symbolAt(rules.reels[1], stops[1]), symbolAt(rules.reels[2], stops[2])]

export const isStops = (rules: Rules, stops: unknown): stops is Stops =>
  Array.isArray(stops) && stops.length === REELS && stops.every((s, i) => Number.isInteger(s) && s >= 0 && s < rules.reels[i].length)

/** Draw a number for each reel and turn it to its stop. */
export function spinStops(rng: Rng, rules: Rules): Stops {
  const pick = (strip: Strip) => {
    let n = randInt(rng, strip.reduce((sum, s) => sum + s.weight, 0))
    for (let i = 0; i < strip.length; i++) {
      n -= strip[i].weight
      if (n < 0) return i
    }
    return strip.length - 1
  }
  return [pick(rules.reels[0]), pick(rules.reels[1]), pick(rules.reels[2])]
}

export interface Win {
  /** Which pay, as an index into the machine's pays. */
  pay: number
  /** Coins paid. For the meter, what the reset is worth in coins. */
  coins: number
  /** Wilds standing in, and what they multiplied the pay by. */
  wilds: number
  multiplier: number
  /** The progressive meter, won. */
  meter: boolean
}

/** What the line pays for `coins` played: the highest win on it, or null. The meter is counted at its reset. */
export function evaluate(rules: Rules, line: Line, coins: number): Win | null {
  let best: Win | null = null
  const wild = rules.wild?.symbol
  for (const [index, pay] of rules.pays.entries()) {
    const value = pay.pays[coins - 1]
    const meter = value === 'meter'
    const base = value === 'meter' ? Math.floor(rules.progressive!.reset / rules.coin) : value
    let wilds = 0
    let multiplier = 1
    if (pay.match.kind === 'count') {
      const { symbol, count } = pay.match
      if (line.filter((s) => s === symbol).length < count) continue
    } else {
      const sets = pay.match.reels
      const ownAward = sets.every((set) => set.length === 1 && set[0] === wild)
      let natural = 0
      let fits = true
      for (let i = 0; i < REELS && fits; i++) {
        if (sets[i].includes(line[i])) natural++
        else if (wild !== undefined && line[i] === wild) wilds++
        else fits = false
      }
      // Wilds stand in beside at least one symbol of the pay's own.
      if (!fits || (!ownAward && natural === 0)) continue
      if (ownAward) wilds = 0
      multiplier = rules.wild ? rules.wild.multipliers[wilds] : 1
    }
    const won = base * multiplier
    if (!best || won > best.coins) best = { pay: index, coins: won, wilds, multiplier, meter }
  }
  return best
}

/** What the meter grows by on a bet of `coins`, in hundredths of a cap. Only three coins feed it. */
export function meterShare(rules: Rules, coins: number): number {
  if (!rules.progressive || coins !== MAX_COINS) return 0
  return Math.floor((coins * rules.coin * rules.progressive.shareBp) / 100)
}

/** The meter at its reset, in hundredths of a cap. */
export const meterReset = (rules: Rules): number | null => (rules.progressive ? rules.progressive.reset * 100 : null)

/** Whole caps on a meter kept in hundredths. */
export const meterCaps = (meter: number) => Math.floor(meter / 100)

export interface Spin {
  stops: Stops
  line: Line
  coins: number
  /** Caps it cost. */
  bet: number
  win: Win | null
  /** Caps it paid. */
  paid: number
  /** The meter after the spin, in hundredths of a cap: fed by a three-coin bet, and back at the reset when it's won. Null without one. */
  meter: number | null
}

/**
 * Play a spin of `coins` that stops at `stops`, with the meter (if the
 * machine has one) at `meter`. The bet feeds the meter before the reels
 * stop, as the coins go in, so a winner takes their own share too.
 */
export function spin(rules: Rules, stops: Stops, coins: number, meter: number | null = meterReset(rules)): Spin {
  if (!Number.isInteger(coins) || coins < 1 || coins > MAX_COINS) throw new Error(`Coins must be 1 to ${MAX_COINS}: ${coins}`)
  if (!isStops(rules, stops)) throw new Error(`Not a stop on every reel: ${JSON.stringify(stops)}`)
  const line = lineOf(rules, stops)
  const win = evaluate(rules, line, coins)
  let next = rules.progressive ? (meter ?? meterReset(rules)!) + meterShare(rules, coins) : null
  let paid = win ? win.coins * rules.coin : 0
  if (win?.meter && next !== null) {
    paid = meterCaps(next)
    next = meterReset(rules)
  }
  return { stops, line, coins, bet: coins * rules.coin, win, paid, meter: next }
}

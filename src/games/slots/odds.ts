/**
 * Every machine's return, worked out exactly: every way the three reels can
 * stop, weighted by the numbers behind each stop, played through the
 * engine's own paytable. The paytable page, the guide and the tests use
 * these figures.
 *
 * Only the pay line counts, so the stops reduce to the symbol on each reel
 * and the numbers behind it: a few hundred combinations instead of 22³.
 * The tests check that shortcut against every stop.
 */

import { type Line, type Rules, type SymbolId, MAX_COINS, evaluate, meterCaps, meterShare } from './engine'

/** Each symbol on a reel, and how many of its numbers land on it. */
function symbolWeights(rules: Rules): [SymbolId, number][][] {
  return rules.reels.map((strip) => {
    const weights = new Map<SymbolId, number>()
    for (const stop of strip) weights.set(stop.symbol, (weights.get(stop.symbol) ?? 0) + stop.weight)
    return [...weights]
  })
}

/** Every line the reels can stop on, with its chance. */
function* lines(rules: Rules): Generator<{ line: Line; chance: number }> {
  const [a, b, c] = symbolWeights(rules)
  const total = [a, b, c].reduce((n, reel) => n * reel.reduce((sum, [, w]) => sum + w, 0), 1)
  for (const [s1, w1] of a) for (const [s2, w2] of b) for (const [s3, w3] of c) yield { line: [s1, s2, s3], chance: (w1 * w2 * w3) / total }
}

export interface PayOdds {
  /** The chance a spin pays this, as the line's highest win. */
  chance: number
  /** What it gives back of each cap bet, on average. */
  share: number
}

export interface Report {
  coins: number
  /** What the machine gives back of each cap bet, with a progressive meter counted at its reset. */
  base: number
  /** What goes onto the meter of each cap bet. */
  meter: number
  /** The whole return: the two together. */
  total: number
  /** The chance a spin pays anything. */
  hit: number
  /** By pay, in the paytable's order. */
  pays: PayOdds[]
}

const reports = new WeakMap<Rules, Report[]>()

/** The machine's published return for so many coins. */
export function report(rules: Rules, coins: number): Report {
  let cached = reports.get(rules)
  if (!cached) reports.set(rules, (cached = []))
  if (cached[coins]) return cached[coins]
  const pays: PayOdds[] = rules.pays.map(() => ({ chance: 0, share: 0 }))
  let base = 0
  let hit = 0
  for (const { line, chance } of lines(rules)) {
    const win = evaluate(rules, line, coins)
    if (!win) continue
    hit += chance
    base += (chance * win.coins) / coins
    pays[win.pay].chance += chance
    pays[win.pay].share += (chance * win.coins) / coins
  }
  const meter = meterShare(rules, coins) / 100 / (coins * rules.coin)
  return (cached[coins] = { coins, base, meter, total: base + meter, hit, pays })
}

/**
 * What a three-coin spin gives back right now, of each cap bet, with the
 * meter where it stands (in hundredths of a cap): above the published
 * return once the meter has climbed far enough.
 */
export function returnNow(rules: Rules, meter: number): number {
  const published = report(rules, MAX_COINS)
  const jackpot = rules.pays.findIndex((p) => p.pays[MAX_COINS - 1] === 'meter')
  if (jackpot === -1) return published.total
  const bet = MAX_COINS * rules.coin
  const atReset = published.pays[jackpot]
  const won = meterCaps(meter + meterShare(rules, MAX_COINS))
  return published.base - atReset.share + (atReset.chance * won) / bet
}

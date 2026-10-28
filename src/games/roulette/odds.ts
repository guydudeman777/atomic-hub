/**
 * The house edge on every bet, worked out exactly by playing the bet
 * through the engine against every pocket on the wheel, each as likely as
 * the next. The guide and the Bets and odds page show these numbers, and
 * the tests check them against the published ones.
 */

import { type Spot, type WheelKind, WHEEL_ORDER, apply, createTable, summarize } from './engine'

const LIMITS = { insideMin: 1, outsideMin: 1, straightMax: 1_000_000, outsideMax: 1_000_000 }

/** A stake every unit divides, so la partage's half is whole. */
const STAKE = 10

/** The house's share of a bet, from 0 to 1: what it keeps on average of each cap bet. */
export function houseEdge(wheel: WheelKind, spot: Spot): number {
  const start = createTable({ wheel, limits: LIMITS, bets: { [spot]: STAKE } })
  const pockets = WHEEL_ORDER[wheel]
  let net = 0
  for (const pocket of pockets) {
    const { paid, lost } = summarize(apply(start, { type: 'spin', pocket }).events)
    net += paid - lost
  }
  return -net / (pockets.length * STAKE)
}

/**
 * The house edge on every bet, worked out exactly by playing the bet
 * through the engine against all 36 ways the dice can land, roll after roll,
 * until it's decided. The guide and the Bets & odds page show these
 * numbers, and the tests check them against the published ones.
 */

import {
  type BetSpot,
  type Dice,
  type Die,
  type Limits,
  type PointNumber,
  type TableState,
  apply,
  createTable,
  flatOf,
  spotInfo,
} from './engine'

/** Every way two dice can land, each as likely as the next. */
export const ALL_ROLLS: readonly Dice[] = Array.from({ length: 36 }, (_, i) => [((i % 6) + 1) as Die, (Math.floor(i / 6) + 1) as Die] as const)

const LIMITS: Limits = { min: 1, max: 1_000_000, propMin: 1 }

/** A stake every bet's unit divides, so each payout is exact. */
const STAKE = 30

/** Where a bet is first made: on the come-out for line, field and one-roll bets, with a point for the rest. */
function startFor(spot: BetSpot): TableState {
  const { kind, number } = spotInfo(spot)
  const comeOut = kind === 'pass' || kind === 'dont-pass' || kind === 'field' || kind === 'any-seven' || kind === 'any-craps' || kind === 'yo' || kind === 'aces' || kind === 'boxcars'
  // Line odds ride on the point; anything else just needs one to be working.
  const point: PointNumber | null = comeOut ? null : kind === 'pass-odds' || kind === 'dont-pass-odds' ? (number ?? 6) : 4
  const flat = flatOf(spot)
  const bets: Partial<Record<BetSpot, number>> = { [spot]: STAKE }
  if (flat) bets[flat] = STAKE
  return createTable({ limits: LIMITS, seed: 0, point, bets })
}

/**
 * The house's share of a bet, from 0 to 1: what it loses on average for
 * each cap bet, once it's decided. A push counts as a decision that costs
 * nothing, as the published figures do (Don't Pass is 1.364%, not 1.403%).
 * For line odds, pass the point they're behind.
 */
export function houseEdge(spot: BetSpot, oddsPoint?: PointNumber): number {
  let start = startFor(spot)
  if (oddsPoint !== undefined) start = { ...start, point: oddsPoint }
  // Undecided positions, merged when they're the same, each with how likely it is.
  let frontier = new Map<string, { state: TableState; tracked: BetSpot; p: number }>([['start', { state: start, tracked: spot, p: 1 }]])
  let net = 0
  for (let roll = 0; roll < 1000 && frontier.size > 0; roll++) {
    const next = new Map<string, { state: TableState; tracked: BetSpot; p: number }>()
    for (const { state, tracked, p } of frontier.values()) {
      for (const dice of ALL_ROLLS) {
        const chance = p / 36
        const { state: after, events } = apply(state, { type: 'roll', dice })
        let follow: BetSpot | null = tracked
        for (const e of events) {
          if (e.type === 'moved' && e.from === follow) follow = e.to
          else if ((e.type === 'won' || e.type === 'lost' || e.type === 'pushed' || e.type === 'returned') && e.spot === follow) {
            if (e.type === 'won') net += chance * e.paid
            else if (e.type === 'lost') net -= chance * e.bet
            follow = null
          }
        }
        if (follow === null) continue
        const key = `${after.point}|${follow}|${JSON.stringify(after.bets)}`
        const seen = next.get(key)
        if (seen) seen.p += chance
        else next.set(key, { state: after, tracked: follow, p: chance })
      }
    }
    // Drop positions too unlikely to matter.
    for (const [key, v] of next) if (v.p < 1e-18) next.delete(key)
    frontier = next
  }
  return -net / STAKE
}

/**
 * Craps rules engine: one end of a Las Vegas craps table, with you as the
 * shooter.
 *
 * Pure and framework-free, like Blackjack's: the UI, the regulars at the
 * rail and the tests drive the table through `isLegal` and `apply`. State is
 * immutable. Caps live outside the engine: it tracks what's on each bet and
 * reports what each roll pays, and callers move the money, using the `bet`,
 * `down`, `won` and `returned` events.
 *
 * Rules
 * - The first roll of a hand is the come-out. 7 or 11 wins on the pass line,
 *   2, 3 or 12 is craps and loses. Any other total (4, 5, 6, 8, 9, 10) is the
 *   point. From then on the point wins the pass line and a 7 loses it: a
 *   seven-out, which ends the shooter's hand. Either way the next roll is a
 *   come-out.
 * - Don't Pass is the other side: 2 or 3 wins on the come-out, 7 or 11
 *   loses, and 12 is barred, a push. With a point, 7 wins and the point
 *   loses.
 * - Come and Don't Come are the same bets made while there's a point: the
 *   next roll is their own come-out. A Come or Don't Come bet that rolls a
 *   point number travels to that number's box and stays there until the
 *   number or a 7 rolls. Bets on numbers keep working through a come-out.
 * - Odds go behind a line or come bet once it has a point, and pay true
 *   odds: 2 to 1 on 4 and 10, 3 to 2 on 5 and 9, 6 to 5 on 6 and 8. Up to
 *   3, 4 and 5 times the flat bet (3-4-5× odds). Laid odds behind a don't
 *   bet pay 1 to 2, 2 to 3 and 5 to 6, up to 6 times the flat bet. Odds on
 *   a come bet are off on the come-out (they come back if it's decided
 *   then); laid odds on a don't come bet always work.
 * - Field: one roll. 3, 4, 9, 10 and 11 pay even money, 2 pays double and
 *   12 pays triple; 5, 6, 7 and 8 lose.
 * - Place bets on 4 and 10 pay 9 to 5, on 5 and 9 pay 7 to 5, on 6 and 8 pay
 *   7 to 6. They win whenever their number rolls and lose on a 7, and are off
 *   on the come-out.
 * - Hardways: 4 or 10 as a pair pays 7 to 1, 6 or 8 as a pair pays 9 to 1.
 *   They lose to a 7 or to their number rolled any other way ("easy"), and
 *   are off on the come-out.
 * - One-roll bets: Any Seven pays 4 to 1, Any Craps (2, 3 or 12) 7 to 1,
 *   Eleven ("yo") 15 to 1, and 2 (aces) or 12 (boxcars) 30 to 1.
 * - Contract bets: a Pass Line bet can't come down once it has a point, nor
 *   can a Come bet once it has travelled. Everything else can come down.
 * - A winning bet stays up for the next roll, and its winnings come back
 *   to you, except where the bet is decided for good: come bets and odds
 *   come back with their winnings, and so does a Come bet that wins as the
 *   point goes off. A push stays where it is.
 * - Bets go down in units that pay whole caps, as a dealer would ask: place
 *   bets on 6 and 8 in sixes, on 4, 5, 9 and 10 in fives; odds on 5 and 9
 *   in twos, on 6 and 8 in fives; laid odds on 4 and 10 in twos, on 5 and 9
 *   in threes, on 6 and 8 in sixes.
 * - Line, come, field and place bets start at the table minimum (place
 *   bets on 6 and 8 at the next six up). Hardways and one-roll bets start
 *   at the table's smaller proposition minimum. No bet but odds may go over
 *   the table maximum.
 */

import { createRng, randInt } from '../../core/rng'

export const POINTS = [4, 5, 6, 8, 9, 10] as const
export type PointNumber = (typeof POINTS)[number]
export const HARD_NUMBERS = [4, 6, 8, 10] as const
export type HardNumber = (typeof HARD_NUMBERS)[number]

export type Die = 1 | 2 | 3 | 4 | 5 | 6
export type Dice = readonly [Die, Die]

/** Where chips can sit on the layout. `come-6` is a Come bet that travelled to the 6. */
export type BetSpot =
  | 'pass'
  | 'pass-odds'
  | 'dont-pass'
  | 'dont-pass-odds'
  | 'come'
  | 'dont-come'
  | `come-${PointNumber}`
  | `come-odds-${PointNumber}`
  | `dont-come-${PointNumber}`
  | `dont-come-odds-${PointNumber}`
  | 'field'
  | `place-${PointNumber}`
  | `hard-${HardNumber}`
  | 'any-seven'
  | 'any-craps'
  | 'yo'
  | 'aces'
  | 'boxcars'

export type BetKind =
  | 'pass'
  | 'pass-odds'
  | 'dont-pass'
  | 'dont-pass-odds'
  | 'come'
  | 'dont-come'
  | 'come-point'
  | 'come-odds'
  | 'dont-come-point'
  | 'dont-come-odds'
  | 'field'
  | 'place'
  | 'hard'
  | 'any-seven'
  | 'any-craps'
  | 'yo'
  | 'aces'
  | 'boxcars'

export type Bets = Readonly<Partial<Record<BetSpot, number>>>

export interface Limits {
  readonly min: number
  readonly max: number
  /** The smallest hardway or one-roll bet. */
  readonly propMin: number
}

export interface TableState {
  readonly limits: Limits
  readonly seed: number
  /** Rolls so far. With the seed, it decides the next roll. */
  readonly rolls: number
  /** The point, or null on the come-out. */
  readonly point: PointNumber | null
  readonly bets: Bets
  /** The latest roll first, a few dozen back. */
  readonly history: readonly Dice[]
  /** Shooters' hands so far: a seven-out starts the next one. */
  readonly hand: number
  /** Rolls in the current hand. */
  readonly handRolls: number
}

export type Action =
  /** Add `amount` to a bet. */
  | { readonly type: 'bet'; readonly spot: BetSpot; readonly amount: number }
  /** Take a bet down, all of it (and any odds behind it). */
  | { readonly type: 'down'; readonly spot: BetSpot }
  /** Throw the dice. `dice` fixes the result, for tests. */
  | { readonly type: 'roll'; readonly dice?: Dice }

export type TableEvent =
  | { type: 'bet'; spot: BetSpot; amount: number }
  | { type: 'down'; spot: BetSpot; amount: number }
  | { type: 'rolled'; dice: Dice; total: number; comeOut: boolean }
  /** `paid` is the winnings. The bet stays up, or comes back with them. */
  | { type: 'won'; spot: BetSpot; bet: number; paid: number; stays: boolean }
  | { type: 'lost'; spot: BetSpot; bet: number }
  /** A barred 12 on a don't bet: no decision, and the bet stays. */
  | { type: 'pushed'; spot: BetSpot; bet: number }
  /** Back to you with no decision: odds that were off when their bet was decided. */
  | { type: 'returned'; spot: BetSpot; bet: number }
  /** A Come or Don't Come bet travelling to its number. */
  | { type: 'moved'; from: BetSpot; to: BetSpot; bet: number }
  | { type: 'point-set'; point: PointNumber }
  | { type: 'point-made'; point: PointNumber }
  | { type: 'seven-out'; point: PointNumber }

export interface ApplyResult {
  state: TableState
  events: TableEvent[]
}

/** How many dice rolls back the table remembers. */
export const HISTORY = 24

/** Odds behind a line or come bet, as a multiple of the flat bet (3-4-5×). */
export const ODDS_MULTIPLE: Record<PointNumber, number> = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 }
/** Laid odds behind a don't bet: up to six times the flat bet on any point, which wins at most 5×. */
export const LAY_MULTIPLE = 6

/** Winnings as [to win, for each]: 7 to 6 is [7, 6]. */
export type Ratio = readonly [number, number]

const EVEN: Ratio = [1, 1]
const TAKE_ODDS: Record<PointNumber, Ratio> = { 4: [2, 1], 5: [3, 2], 6: [6, 5], 8: [6, 5], 9: [3, 2], 10: [2, 1] }
const LAY_ODDS: Record<PointNumber, Ratio> = { 4: [1, 2], 5: [2, 3], 6: [5, 6], 8: [5, 6], 9: [2, 3], 10: [1, 2] }
const PLACE: Record<PointNumber, Ratio> = { 4: [9, 5], 5: [7, 5], 6: [7, 6], 8: [7, 6], 9: [7, 5], 10: [9, 5] }
const HARD: Record<HardNumber, Ratio> = { 4: [7, 1], 6: [9, 1], 8: [9, 1], 10: [7, 1] }
const ONE_ROLL: Record<'any-seven' | 'any-craps' | 'yo' | 'aces' | 'boxcars', Ratio> = {
  'any-seven': [4, 1],
  'any-craps': [7, 1],
  yo: [15, 1],
  aces: [30, 1],
  boxcars: [30, 1],
}

// ---- Spots ------------------------------------------------------------------

export interface SpotInfo {
  kind: BetKind
  /** The bet's number: a point, a place or hard number. */
  number: PointNumber | null
}

const NUMBERED = /^(come-odds|dont-come-odds|come|dont-come|place|hard)-(\d+)$/

export function spotInfo(spot: BetSpot): SpotInfo {
  const m = NUMBERED.exec(spot)
  if (!m) return { kind: spot as BetKind, number: null }
  const kind = { come: 'come-point', 'dont-come': 'dont-come-point', 'come-odds': 'come-odds', 'dont-come-odds': 'dont-come-odds', place: 'place', hard: 'hard' }[
    m[1]
  ] as BetKind
  return { kind, number: Number(m[2]) as PointNumber }
}

/** Every spot, in the order the layout settles them. */
export const ALL_SPOTS: readonly BetSpot[] = [
  'pass',
  'pass-odds',
  'dont-pass',
  'dont-pass-odds',
  ...POINTS.flatMap((n) => [`come-${n}`, `come-odds-${n}`, `dont-come-${n}`, `dont-come-odds-${n}`] as BetSpot[]),
  // Box bets after the numbers, so a bet that travels to a number lands after that number is settled.
  'come',
  'dont-come',
  'field',
  ...POINTS.map((n) => `place-${n}` as BetSpot),
  ...HARD_NUMBERS.map((n) => `hard-${n}` as BetSpot),
  'any-seven',
  'any-craps',
  'yo',
  'aces',
  'boxcars',
]

/** Bets you put down yourself; travelled come bets get where they are by rolling. */
export const PLACEABLE_SPOTS: readonly BetSpot[] = ALL_SPOTS.filter((s) => {
  const { kind } = spotInfo(s)
  return kind !== 'come-point' && kind !== 'dont-come-point'
})

/** The flat bet a set of odds sits behind. */
export function flatOf(spot: BetSpot): BetSpot | null {
  const { kind, number } = spotInfo(spot)
  if (kind === 'pass-odds') return 'pass'
  if (kind === 'dont-pass-odds') return 'dont-pass'
  if (kind === 'come-odds') return `come-${number}` as BetSpot
  if (kind === 'dont-come-odds') return `dont-come-${number}` as BetSpot
  return null
}

/** The odds that sit behind a flat bet, if it takes any. */
export function oddsOf(spot: BetSpot): BetSpot | null {
  const { kind, number } = spotInfo(spot)
  if (kind === 'pass') return 'pass-odds'
  if (kind === 'dont-pass') return 'dont-pass-odds'
  if (kind === 'come-point') return `come-odds-${number}` as BetSpot
  if (kind === 'dont-come-point') return `dont-come-odds-${number}` as BetSpot
  return null
}

const isOdds = (kind: BetKind) => kind === 'pass-odds' || kind === 'dont-pass-odds' || kind === 'come-odds' || kind === 'dont-come-odds'
const isLay = (kind: BetKind) => kind === 'dont-pass-odds' || kind === 'dont-come-odds'
const isProp = (kind: BetKind) => kind === 'hard' || kind === 'any-seven' || kind === 'any-craps' || kind === 'yo' || kind === 'aces' || kind === 'boxcars'

/** The number an odds bet is riding on: the point for line odds, the bet's own number for come odds. */
function oddsNumber(state: Pick<TableState, 'point'>, spot: BetSpot): PointNumber | null {
  const { kind, number } = spotInfo(spot)
  if (kind === 'pass-odds' || kind === 'dont-pass-odds') return state.point
  return number
}

/** What a bet pays, as a ratio. Field pays depend on the roll; this is its even-money rate. */
export function payout(state: Pick<TableState, 'point'>, spot: BetSpot): Ratio {
  const { kind, number } = spotInfo(spot)
  switch (kind) {
    case 'pass-odds':
    case 'come-odds':
    case 'dont-pass-odds':
    case 'dont-come-odds': {
      const n = oddsNumber(state, spot)
      if (n === null) return EVEN
      return isLay(kind) ? LAY_ODDS[n] : TAKE_ODDS[n]
    }
    case 'place':
      return PLACE[number!]
    case 'hard':
      return HARD[number as HardNumber]
    case 'any-seven':
    case 'any-craps':
    case 'yo':
    case 'aces':
    case 'boxcars':
      return ONE_ROLL[kind]
    default:
      return EVEN
  }
}

const winnings = (bet: number, [win, each]: Ratio) => Math.floor((bet * win) / each)

// ---- Rolling ---------------------------------------------------------------

/** The dice for roll number `n` at a table seeded with `seed`. */
export function rollFor(seed: number, n: number): Dice {
  const rng = createRng((seed + Math.imul(n + 1, 0x9e3779b1)) >>> 0)
  return [(randInt(rng, 6) + 1) as Die, (randInt(rng, 6) + 1) as Die]
}

export const total = (dice: Dice): number => dice[0] + dice[1]
export const isHard = (dice: Dice): boolean => dice[0] === dice[1]
export const isPoint = (n: number): n is PointNumber => (POINTS as readonly number[]).includes(n)

// ---- Setting up ----------------------------------------------------------------

export interface NewTableOptions {
  limits: Limits
  seed: number
  /** Start mid-hand with a point, for tests. */
  point?: PointNumber | null
  /** Start with chips already down, for tests. */
  bets?: Bets
}

export function createTable({ limits, seed, point = null, bets = {} }: NewTableOptions): TableState {
  return { limits, seed, rolls: 0, point, bets, history: [], hand: 1, handRolls: 0 }
}

export const betOn = (state: Pick<TableState, 'bets'>, spot: BetSpot): number => state.bets[spot] ?? 0

/** All your chips on the layout. */
export const onLayout = (bets: Bets): number => Object.values(bets).reduce((n, b) => n + (b ?? 0), 0)

/** The spots with chips on them, in settling order. */
export const activeSpots = (bets: Bets): BetSpot[] => ALL_SPOTS.filter((s) => (bets[s] ?? 0) > 0)

// ---- What you may do -------------------------------------------------------------

/** Whether chips can go on `spot` now (before amounts are considered). */
export function canBet(state: TableState, spot: BetSpot): boolean {
  const { kind } = spotInfo(spot)
  switch (kind) {
    case 'pass':
    case 'dont-pass':
      return state.point === null
    case 'come':
    case 'dont-come':
      return state.point !== null
    case 'come-point':
    case 'dont-come-point':
      return false
    case 'pass-odds':
    case 'dont-pass-odds':
      return state.point !== null && betOn(state, flatOf(spot)!) > 0
    case 'come-odds':
    case 'dont-come-odds':
      return betOn(state, flatOf(spot)!) > 0
    default:
      return true
  }
}

/** Whether a bet can come down now. Pass bets with a point and travelled Come bets are contracts. */
export function canTakeDown(state: TableState, spot: BetSpot): boolean {
  if (betOn(state, spot) <= 0) return false
  const { kind } = spotInfo(spot)
  if (kind === 'pass') return state.point === null
  if (kind === 'come-point') return false
  return true
}

/**
 * Bets go down in multiples of this, so they pay whole caps: whatever the
 * payout is "for each", as in place the 6 in sixes at 7 to 6.
 */
export const unitOf = (state: Pick<TableState, 'point'>, spot: BetSpot): number => payout(state, spot)[1]

const roundUp = (amount: number, unit: number) => Math.ceil(amount / unit) * unit
const roundDown = (amount: number, unit: number) => Math.floor(amount / unit) * unit

/** The smallest bet the spot takes. */
export function minBet(state: TableState, spot: BetSpot): number {
  const { kind } = spotInfo(spot)
  const unit = unitOf(state, spot)
  if (isOdds(kind)) return unit
  return roundUp(isProp(kind) ? state.limits.propMin : state.limits.min, unit)
}

/** The most the spot takes: the table maximum, or for odds, the multiple of the flat bet behind them. */
export function maxBet(state: TableState, spot: BetSpot): number {
  const { kind } = spotInfo(spot)
  const unit = unitOf(state, spot)
  if (isOdds(kind)) {
    const flat = betOn(state, flatOf(spot)!)
    const n = oddsNumber(state, spot)
    if (!flat || n === null) return 0
    return roundDown(flat * (isLay(kind) ? LAY_MULTIPLE : ODDS_MULTIPLE[n]), unit)
  }
  return roundDown(state.limits.max, unit)
}

/** Whether a bet of `amount` in all is allowed on `spot` (ignoring what you can afford). */
export function isValidAmount(state: TableState, spot: BetSpot, amount: number): boolean {
  return Number.isInteger(amount) && amount >= minBet(state, spot) && amount <= maxBet(state, spot) && amount % unitOf(state, spot) === 0
}

/**
 * What a dealer would make of adding `chip` to a bet: the total rounded up
 * to the spot's unit and at least its minimum, or down again if that's over
 * the maximum or more than you have. Null if no bigger bet fits.
 */
export function fitBet(state: TableState, spot: BetSpot, chip: number, available = Infinity): number | null {
  if (!canBet(state, spot)) return null
  const current = betOn(state, spot)
  const unit = unitOf(state, spot)
  const top = Math.min(maxBet(state, spot), roundDown(current + available, unit))
  const want = Math.max(roundUp(current + chip, unit), minBet(state, spot))
  const amount = Math.min(want, top)
  return amount > current && isValidAmount(state, spot, amount) ? amount : null
}

export function isLegal(state: TableState, action: Action, available = Infinity): boolean {
  switch (action.type) {
    case 'bet': {
      if (!canBet(state, action.spot) || !Number.isInteger(action.amount) || action.amount <= 0 || action.amount > available) return false
      return isValidAmount(state, action.spot, betOn(state, action.spot) + action.amount)
    }
    case 'down':
      return canTakeDown(state, action.spot)
    case 'roll':
      return true
  }
}

/** Whether a bet would be in action on the next roll. Place bets, hardways and come odds are off on the come-out. */
export function isWorking(state: Pick<TableState, 'point'>, spot: BetSpot): boolean {
  if (state.point !== null) return true
  const { kind } = spotInfo(spot)
  return kind !== 'place' && kind !== 'hard' && kind !== 'come-odds'
}

// ---- Playing it out ------------------------------------------------------------

export function apply(state: TableState, action: Action, available = Infinity): ApplyResult {
  if (!isLegal(state, action, available)) throw new Error(`Illegal action with the point ${state.point ?? 'off'}: ${JSON.stringify(action)}`)
  switch (action.type) {
    case 'bet': {
      const bets = { ...state.bets, [action.spot]: betOn(state, action.spot) + action.amount }
      return { state: { ...state, bets }, events: [{ type: 'bet', spot: action.spot, amount: action.amount }] }
    }
    case 'down': {
      const bets: Partial<Record<BetSpot, number>> = { ...state.bets }
      const events: TableEvent[] = []
      // Odds come down with the bet they're behind.
      for (const spot of [oddsOf(action.spot), action.spot]) {
        if (!spot || !bets[spot]) continue
        events.push({ type: 'down', spot, amount: bets[spot]! })
        delete bets[spot]
      }
      return { state: { ...state, bets }, events }
    }
    case 'roll':
      return roll(state, action.dice ?? rollFor(state.seed, state.rolls))
  }
}

function roll(state: TableState, dice: Dice): ApplyResult {
  const sum = total(dice)
  const hard = isHard(dice)
  const point = state.point
  const comeOut = point === null
  const events: TableEvent[] = [{ type: 'rolled', dice, total: sum, comeOut }]
  const bets: Partial<Record<BetSpot, number>> = { ...state.bets }

  // Where the point ends up after this roll.
  let nextPoint: PointNumber | null = point
  if (comeOut && isPoint(sum)) nextPoint = sum
  else if (!comeOut && (sum === point || sum === 7)) nextPoint = null

  const win = (spot: BetSpot, ratio: Ratio, stays: boolean) => {
    const bet = bets[spot]!
    events.push({ type: 'won', spot, bet, paid: winnings(bet, ratio), stays })
    if (!stays) delete bets[spot]
  }
  const lose = (spot: BetSpot) => {
    events.push({ type: 'lost', spot, bet: bets[spot]! })
    delete bets[spot]
  }
  const giveBack = (spot: BetSpot) => {
    events.push({ type: 'returned', spot, bet: bets[spot]! })
    delete bets[spot]
  }
  const move = (from: BetSpot, to: BetSpot) => {
    const bet = bets[from]!
    events.push({ type: 'moved', from, to, bet })
    delete bets[from]
    bets[to] = bet
  }

  for (const spot of activeSpots(state.bets)) {
    // Already settled with the bet it's behind.
    if (!bets[spot]) continue
    const { kind, number } = spotInfo(spot)
    switch (kind) {
      case 'pass':
        if (comeOut) {
          if (sum === 7 || sum === 11) win(spot, EVEN, true)
          else if (sum === 2 || sum === 3 || sum === 12) lose(spot)
        } else if (sum === point) win(spot, EVEN, true)
        else if (sum === 7) lose(spot)
        break

      case 'dont-pass':
        if (comeOut) {
          if (sum === 2 || sum === 3) win(spot, EVEN, true)
          else if (sum === 12) events.push({ type: 'pushed', spot, bet: bets[spot]! })
          else if (sum === 7 || sum === 11) lose(spot)
        } else if (sum === 7) win(spot, EVEN, true)
        else if (sum === point) lose(spot)
        break

      case 'pass-odds':
        if (sum === point) win(spot, TAKE_ODDS[point!], false)
        else if (sum === 7) lose(spot)
        break

      case 'dont-pass-odds':
        if (sum === 7) win(spot, LAY_ODDS[point!], false)
        else if (sum === point) lose(spot)
        break

      case 'come':
        // A come bet in the box stays up as long as there's a point to keep it in action.
        if (sum === 7 || sum === 11) win(spot, EVEN, nextPoint !== null)
        else if (sum === 2 || sum === 3 || sum === 12) lose(spot)
        else move(spot, `come-${sum as PointNumber}`)
        break

      case 'dont-come':
        if (sum === 2 || sum === 3) win(spot, EVEN, nextPoint !== null)
        else if (sum === 12) events.push({ type: 'pushed', spot, bet: bets[spot]! })
        else if (sum === 7 || sum === 11) lose(spot)
        else move(spot, `dont-come-${sum as PointNumber}`)
        break

      case 'come-point': {
        const odds = oddsOf(spot)!
        // Its odds are off on the come-out: they come back whichever way the bet goes.
        const oddsOff = comeOut && !!bets[odds]
        if (sum === number) {
          win(spot, EVEN, false)
          if (oddsOff) giveBack(odds)
          else if (bets[odds]) win(odds, TAKE_ODDS[number], false)
        } else if (sum === 7) {
          lose(spot)
          if (oddsOff) giveBack(odds)
          else if (bets[odds]) lose(odds)
        }
        break
      }

      case 'dont-come-point': {
        const odds = oddsOf(spot)!
        if (sum === 7) {
          win(spot, EVEN, false)
          if (bets[odds]) win(odds, LAY_ODDS[number!], false)
        } else if (sum === number) {
          lose(spot)
          if (bets[odds]) lose(odds)
        }
        break
      }

      case 'come-odds':
      case 'dont-come-odds':
        // Settled along with the bet in front of them.
        break

      case 'field':
        if (sum === 2) win(spot, [2, 1], true)
        else if (sum === 12) win(spot, [3, 1], true)
        else if (sum === 3 || sum === 4 || sum === 9 || sum === 10 || sum === 11) win(spot, EVEN, true)
        else lose(spot)
        break

      case 'place':
        if (comeOut) break
        if (sum === number) win(spot, PLACE[number], true)
        else if (sum === 7) lose(spot)
        break

      case 'hard':
        if (comeOut) break
        if (sum === number && hard) win(spot, HARD[number as HardNumber], true)
        else if (sum === number || sum === 7) lose(spot)
        break

      case 'any-seven':
        if (sum === 7) win(spot, ONE_ROLL[kind], true)
        else lose(spot)
        break

      case 'any-craps':
        if (sum === 2 || sum === 3 || sum === 12) win(spot, ONE_ROLL[kind], true)
        else lose(spot)
        break

      case 'yo':
        if (sum === 11) win(spot, ONE_ROLL[kind], true)
        else lose(spot)
        break

      case 'aces':
        if (sum === 2) win(spot, ONE_ROLL[kind], true)
        else lose(spot)
        break

      case 'boxcars':
        if (sum === 12) win(spot, ONE_ROLL[kind], true)
        else lose(spot)
        break
    }
  }

  let hand = state.hand
  let handRolls = state.handRolls + 1
  if (comeOut && nextPoint !== null) events.push({ type: 'point-set', point: nextPoint })
  else if (!comeOut && sum === point) events.push({ type: 'point-made', point })
  else if (!comeOut && sum === 7) {
    events.push({ type: 'seven-out', point: point! })
    hand += 1
    handRolls = 0
  }

  return {
    state: {
      ...state,
      rolls: state.rolls + 1,
      point: nextPoint,
      bets,
      history: [dice, ...state.history].slice(0, HISTORY),
      hand,
      handRolls,
    },
    events,
  }
}

// ---- Reading a roll -----------------------------------------------------------

/** What a roll paid and took, all told. */
export interface RollSummary {
  /** Winnings paid. */
  paid: number
  /** Bets lost. */
  lost: number
  /** Caps that come back to your rail: winnings, and bets that came down with them. */
  back: number
}

export function summarize(events: readonly TableEvent[]): RollSummary {
  let paid = 0
  let lost = 0
  let back = 0
  for (const e of events) {
    if (e.type === 'won') {
      paid += e.paid
      back += e.paid + (e.stays ? 0 : e.bet)
    } else if (e.type === 'lost') lost += e.bet
    else if (e.type === 'returned') back += e.bet
  }
  return { paid, lost, back }
}

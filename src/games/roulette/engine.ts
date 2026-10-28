/**
 * Roulette rules engine: one wheel, and the layout you bet on.
 *
 * Pure and framework-free, like the other casino games' engines: the UI,
 * the regulars and the tests drive the table through `isLegal` and `apply`.
 * State is immutable. Caps live outside the engine: it tracks what's on each
 * bet and reports what each spin pays, and callers move the money, using the
 * `bet`, `down`, `won` and `halved` events. Nor does it choose where the
 * ball lands: a spin names its pocket (`spinPocket` picks one at random), so
 * an online table can send the pocket itself rather than a seed anyone
 * could read ahead.
 *
 * Rules
 * - Three wheels. The European wheel has 37 pockets, 1 to 36 and a single
 *   zero. The French wheel is the same wheel with la partage: when the ball
 *   lands on zero, even-money bets lose only half, and the other half comes
 *   back. The American wheel has 38 pockets, with a double zero beside the
 *   zero. Each wheel has its own order of pockets, red and black
 *   alternating around it.
 * - Inside bets go on the numbers: straight up on one number (zero and
 *   double zero included), a split on two side by side, a street on a row
 *   of three, a corner on four, a six line on two rows. The zeros have bets
 *   of their own. On a single-zero wheel: splits 0/1, 0/2 and 0/3, the
 *   trios 0/1/2 and 0/2/3, and the first four, 0/1/2/3. On the American
 *   wheel: splits 0/1, 0/2, 0/00, 00/2 and 00/3, the trios 0/1/2, 0/00/2
 *   and 00/2/3, and the top line, 0/00/1/2/3.
 * - Outside bets cover the numbers by twelves and eighteens: the three
 *   dozens, the three columns, red or black, odd or even, 1 to 18 or 19 to
 *   36. A zero loses all of them, but for la partage.
 * - A bet covering n numbers pays 36/n − 1 to 1: 35 to 1 straight up, 17 a
 *   split, 11 a street or trio, 8 a corner or the first four, 5 a six line,
 *   2 a dozen or column, even money on the rest. The top line's five
 *   numbers pay 6 to 1.
 * - A winning bet is paid and stays up for the next spin; losing bets are
 *   swept. Any bet can come down until the ball is spun.
 * - Inside bets start at the table's inside minimum, and outside bets at its
 *   outside minimum. An inside bet takes at most the straight-up maximum for
 *   each number it covers; an outside bet, the outside maximum. On the
 *   French wheel, even-money bets go down in twos, so half of one is always
 *   whole caps.
 */

import { type Rng, randInt } from '../../core/rng'

export type WheelKind = 'european' | 'french' | 'american'

/** A pocket on the wheel: 0 to 36, and DOUBLE_ZERO for the American wheel's 00. */
export type Pocket = number
export const DOUBLE_ZERO = 37

/** Clockwise from the zero, as the pockets sit on each wheel. */
const SINGLE_ZERO_ORDER: readonly Pocket[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]
const DOUBLE_ZERO_ORDER: readonly Pocket[] = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, DOUBLE_ZERO, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
]

export const WHEEL_ORDER: Record<WheelKind, readonly Pocket[]> = {
  european: SINGLE_ZERO_ORDER,
  french: SINGLE_ZERO_ORDER,
  american: DOUBLE_ZERO_ORDER,
}

export const RED_NUMBERS: ReadonlySet<Pocket> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export type Color = 'red' | 'black' | 'green'

export const isZero = (p: Pocket) => p === 0 || p === DOUBLE_ZERO
export const colorOf = (p: Pocket): Color => (isZero(p) ? 'green' : RED_NUMBERS.has(p) ? 'red' : 'black')
/** "17", or "00". */
export const pocketName = (p: Pocket) => (p === DOUBLE_ZERO ? '00' : String(p))

export const hasDoubleZero = (wheel: WheelKind) => wheel === 'american'
export const zerosOf = (wheel: WheelKind): Pocket[] => (hasDoubleZero(wheel) ? [0, DOUBLE_ZERO] : [0])

/** Where the ball lands, at random. */
export const spinPocket = (rng: Rng, wheel: WheelKind): Pocket => WHEEL_ORDER[wheel][randInt(rng, WHEEL_ORDER[wheel].length)]

// ---- Bets ------------------------------------------------------------------

export type BetKind =
  | 'straight'
  | 'split'
  | 'street'
  | 'trio'
  | 'corner'
  | 'first-four'
  | 'top-line'
  | 'line'
  | 'dozen'
  | 'column'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'
  | 'high'

/**
 * Where chips can sit, named for what they cover: `straight-17`,
 * `split-14-17`, `street-16` (16 to 18), `corner-16-17-19-20`, `line-16`
 * (16 to 21), `trio-0-2-00`, `first-four`, `top-line`, `dozen-2`,
 * `column-3`, `red`, `low` and so on. Pockets in a name go lowest first,
 * with 00 last.
 */
export type Spot = string

export interface SpotInfo {
  kind: BetKind
  /** The pockets it wins on, lowest first. */
  numbers: readonly Pocket[]
  /** On the inside of the layout, among the numbers. */
  inside: boolean
}

const EVEN_MONEY = new Set<BetKind>(['red', 'black', 'odd', 'even', 'low', 'high'])
export const isEvenMoney = (kind: BetKind) => EVEN_MONEY.has(kind)

/** What a bet on so many numbers pays, to 1. */
const PAYS: Record<number, number> = { 1: 35, 2: 17, 3: 11, 4: 8, 5: 6, 6: 5, 12: 2, 18: 1 }

const range = (from: number, count: number, step = 1) => Array.from({ length: count }, (_, i) => from + i * step)

function spotsFor(wheel: WheelKind): Map<Spot, SpotInfo> {
  const spots = new Map<Spot, SpotInfo>()
  const add = (kind: BetKind, numbers: Pocket[], id?: Spot) => {
    const sorted = numbers.slice().sort((a, b) => a - b)
    const key = id ?? `${kind}-${sorted.map(pocketName).join('-')}`
    spots.set(key, { kind, numbers: sorted, inside: !['dozen', 'column', ...EVEN_MONEY].includes(kind) })
  }
  for (const z of zerosOf(wheel)) add('straight', [z])
  for (let n = 1; n <= 36; n++) add('straight', [n])
  // Side by side across a row of three, then along the table to the next row.
  for (let n = 1; n <= 36; n++) {
    if (n % 3 !== 0) add('split', [n, n + 1])
    if (n <= 33) add('split', [n, n + 3])
  }
  if (hasDoubleZero(wheel)) {
    for (const pair of [[0, 1], [0, 2], [0, DOUBLE_ZERO], [2, DOUBLE_ZERO], [3, DOUBLE_ZERO]]) add('split', pair)
  } else {
    for (const n of [1, 2, 3]) add('split', [0, n])
  }
  for (let n = 1; n <= 34; n += 3) add('street', [n, n + 1, n + 2], `street-${n}`)
  if (hasDoubleZero(wheel)) {
    for (const trio of [[0, 1, 2], [0, 2, DOUBLE_ZERO], [2, 3, DOUBLE_ZERO]]) add('trio', trio)
  } else {
    for (const trio of [[0, 1, 2], [0, 2, 3]]) add('trio', trio)
  }
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) add('corner', [n, n + 1, n + 3, n + 4])
  if (hasDoubleZero(wheel)) add('top-line', [0, 1, 2, 3, DOUBLE_ZERO], 'top-line')
  else add('first-four', [0, 1, 2, 3], 'first-four')
  for (let n = 1; n <= 31; n += 3) add('line', range(n, 6), `line-${n}`)

  for (let d = 0; d < 3; d++) add('dozen', range(d * 12 + 1, 12), `dozen-${d + 1}`)
  for (let c = 0; c < 3; c++) add('column', range(c + 1, 12, 3), `column-${c + 1}`)
  const all = range(1, 36)
  add('low', all.filter((n) => n <= 18), 'low')
  add('even', all.filter((n) => n % 2 === 0), 'even')
  add('red', all.filter((n) => RED_NUMBERS.has(n)), 'red')
  add('black', all.filter((n) => !RED_NUMBERS.has(n)), 'black')
  add('odd', all.filter((n) => n % 2 === 1), 'odd')
  add('high', all.filter((n) => n > 18), 'high')
  return spots
}

const SPOTS: Record<WheelKind, ReadonlyMap<Spot, SpotInfo>> = {
  european: spotsFor('european'),
  french: spotsFor('french'),
  american: spotsFor('american'),
}

/** Every spot on a wheel's layout, inside bets first, in a fixed order. */
export const spotsOf = (wheel: WheelKind): readonly Spot[] => [...SPOTS[wheel].keys()]

/** What a spot covers, or null if this wheel's layout has no such spot. */
export const spotInfo = (wheel: WheelKind, spot: Spot): SpotInfo | null => SPOTS[wheel].get(spot) ?? null

/** Every bet that wins when `pocket` comes up. */
export const spotsCovering = (wheel: WheelKind, pocket: Pocket): Spot[] => [...SPOTS[wheel]].flatMap(([spot, info]) => (info.numbers.includes(pocket) ? [spot] : []))

/** What a bet pays, to 1. */
export const paysOf = (info: SpotInfo): number => PAYS[info.numbers.length]

// ---- The table ---------------------------------------------------------------

export interface Limits {
  /** The smallest bet on any inside spot. */
  readonly insideMin: number
  /** The smallest bet on each outside spot. */
  readonly outsideMin: number
  /** The most on one number straight up. Other inside bets take this much for each number they cover. */
  readonly straightMax: number
  /** The most on one outside bet. */
  readonly outsideMax: number
}

export type Bets = Readonly<Partial<Record<Spot, number>>>

export interface TableState {
  readonly wheel: WheelKind
  readonly limits: Limits
  readonly bets: Bets
  /** Spins so far. */
  readonly spins: number
  /** Where the ball landed, the latest first, a few dozen back. */
  readonly history: readonly Pocket[]
}

export type Action =
  /** Add `amount` to a bet. */
  | { readonly type: 'bet'; readonly spot: Spot; readonly amount: number }
  /** Take a bet down, all of it. */
  | { readonly type: 'down'; readonly spot: Spot }
  /** Spin, and the ball lands in `pocket`. */
  | { readonly type: 'spin'; readonly pocket: Pocket }

export type TableEvent =
  | { readonly type: 'bet'; readonly spot: Spot; readonly amount: number }
  | { readonly type: 'down'; readonly spot: Spot; readonly amount: number }
  | { readonly type: 'spun'; readonly pocket: Pocket }
  /** Paid `paid` in winnings; the bet stays up. */
  | { readonly type: 'won'; readonly spot: Spot; readonly bet: number; readonly paid: number }
  /** La partage: the ball found zero, and half an even-money bet comes back. */
  | { readonly type: 'halved'; readonly spot: Spot; readonly bet: number; readonly back: number }
  | { readonly type: 'lost'; readonly spot: Spot; readonly bet: number }

const HISTORY_KEPT = 60

export interface TableOptions {
  wheel: WheelKind
  limits: Limits
  bets?: Bets
  history?: readonly Pocket[]
}

export function createTable({ wheel, limits, bets = {}, history = [] }: TableOptions): TableState {
  return { wheel, limits, bets, spins: 0, history }
}

export const betOn = (state: TableState, spot: Spot): number => state.bets[spot] ?? 0

/** Spots with chips on them, in the layout's order. */
export const activeSpots = (bets: Bets): Spot[] => Object.keys(bets).filter((s) => (bets[s] ?? 0) > 0)

/** Everything on the layout. */
export const onLayout = (bets: Bets): number => activeSpots(bets).reduce((n, s) => n + (bets[s] ?? 0), 0)

/** Bets on a spot go down in multiples of this: twos for la partage's even chances, ones anywhere else. */
export function unitOf(state: TableState, spot: Spot): number {
  const info = spotInfo(state.wheel, spot)
  return info && state.wheel === 'french' && isEvenMoney(info.kind) ? 2 : 1
}

const roundUp = (n: number, unit: number) => Math.ceil(n / unit) * unit
const roundDown = (n: number, unit: number) => Math.floor(n / unit) * unit

/** The smallest a bet on this spot can be. */
export function minBet(state: TableState, spot: Spot): number {
  const info = spotInfo(state.wheel, spot)
  if (!info) return Infinity
  return roundUp(info.inside ? state.limits.insideMin : state.limits.outsideMin, unitOf(state, spot))
}

/** The most a bet on this spot can be. */
export function maxBet(state: TableState, spot: Spot): number {
  const info = spotInfo(state.wheel, spot)
  if (!info) return 0
  const max = info.inside ? state.limits.straightMax * info.numbers.length : state.limits.outsideMax
  return roundDown(max, unitOf(state, spot))
}

export function isLegal(state: TableState, action: Action, available = Infinity): boolean {
  switch (action.type) {
    case 'bet': {
      const { spot, amount } = action
      if (!spotInfo(state.wheel, spot) || !Number.isInteger(amount) || amount <= 0 || amount > available) return false
      const total = betOn(state, spot) + amount
      return total >= minBet(state, spot) && total <= maxBet(state, spot) && total % unitOf(state, spot) === 0
    }
    case 'down':
      return betOn(state, action.spot) > 0
    case 'spin':
      return WHEEL_ORDER[state.wheel].includes(action.pocket)
  }
}

/**
 * What a chip pushed onto a spot comes to, as a dealer would take it:
 * rounded up to the spot's unit and its minimum, held to its maximum and
 * what you can cover. Null if nothing more can go there.
 */
export function fitBet(state: TableState, spot: Spot, chip: number, available: number): number | null {
  if (!spotInfo(state.wheel, spot)) return null
  const current = betOn(state, spot)
  const unit = unitOf(state, spot)
  const min = minBet(state, spot)
  const cap = Math.min(maxBet(state, spot), roundDown(current + Math.max(0, available), unit))
  const want = Math.min(Math.max(roundUp(current + chip, unit), min), cap)
  return want > current && want >= min ? want : null
}

/** Play an action. Throws if it isn't legal; `available` is what the player can still bet. */
export function apply(state: TableState, action: Action, available = Infinity): { state: TableState; events: TableEvent[] } {
  if (!isLegal(state, action, available)) throw new Error(`Illegal action: ${JSON.stringify(action)}`)
  switch (action.type) {
    case 'bet': {
      const bets = { ...state.bets, [action.spot]: betOn(state, action.spot) + action.amount }
      return { state: { ...state, bets }, events: [{ type: 'bet', spot: action.spot, amount: action.amount }] }
    }
    case 'down': {
      const amount = betOn(state, action.spot)
      const bets = { ...state.bets }
      delete bets[action.spot]
      return { state: { ...state, bets }, events: [{ type: 'down', spot: action.spot, amount }] }
    }
    case 'spin':
      return spin(state, action.pocket)
  }
}

function spin(state: TableState, pocket: Pocket): { state: TableState; events: TableEvent[] } {
  const events: TableEvent[] = [{ type: 'spun', pocket }]
  const bets: Partial<Record<Spot, number>> = {}
  // In the layout's order, so every table writes the same events.
  for (const spot of spotsOf(state.wheel)) {
    const bet = betOn(state, spot)
    if (bet <= 0) continue
    const info = spotInfo(state.wheel, spot)!
    if (info.numbers.includes(pocket)) {
      events.push({ type: 'won', spot, bet, paid: bet * paysOf(info) })
      bets[spot] = bet
    } else if (state.wheel === 'french' && isZero(pocket) && isEvenMoney(info.kind)) {
      events.push({ type: 'halved', spot, bet, back: bet / 2 })
    } else {
      events.push({ type: 'lost', spot, bet })
    }
  }
  const history = [pocket, ...state.history].slice(0, HISTORY_KEPT)
  return { state: { ...state, bets, spins: state.spins + 1, history }, events }
}

/**
 * What a spin did to a player's caps: winnings paid, bets lost (half of a
 * bet halved by la partage among them), and caps handed back (the other
 * half). Winning bets themselves stay on the layout.
 */
export function summarize(events: readonly TableEvent[]): { paid: number; lost: number; back: number } {
  let paid = 0
  let lost = 0
  let back = 0
  for (const e of events) {
    if (e.type === 'won') paid += e.paid
    else if (e.type === 'lost') lost += e.bet
    else if (e.type === 'halved') {
      lost += e.bet - e.back
      back += e.back
    }
  }
  return { paid, lost, back }
}

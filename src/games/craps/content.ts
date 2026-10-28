/**
 * Craps content: the tables and their stickmen, and the guide to every bet
 * on the layout.
 */

import { type BetKind, type BetSpot, type Limits, type PointNumber, payout, spotInfo } from './engine'
import { houseEdge } from './odds'

export interface Stakes {
  id: string
  name: string
  blurb: string
  limits: Limits
  /** Chip values in the rack, smallest first. */
  chips: readonly number[]
  stickman: Stickman
}

export interface Stickman {
  name: string
  /** What they say as you step up to the rail. */
  hello: readonly string[]
}

export const STAKES: readonly Stakes[] = [
  {
    id: 'low',
    name: 'Low limit',
    blurb: 'The five-cap game by the keno lounge. Plenty of room at the rail, and a stickman who explains his calls.',
    limits: { min: 5, max: 200, propMin: 1 },
    chips: [1, 5, 25, 100],
    stickman: {
      name: 'Benny',
      hello: ['New shooter! Get your bets down, the dice are coming out.', 'Step right up, friend. Pass line’s the place to start.', 'Fresh dice, fresh shooter. Bets on the pass line, please.'],
    },
  },
  {
    id: 'main',
    name: 'Main pit',
    blurb: 'Under the marquee in the middle of the floor, where the cheering comes from.',
    limits: { min: 25, max: 1000, propMin: 5 },
    chips: [5, 25, 100, 500],
    stickman: {
      name: 'Roxie',
      hello: ['Shooter’s in! Bets down, please, dice are coming out.', 'Welcome to the pit, hon. Twenty-five on the line gets you rolling.', 'Coming out with a new shooter. Let’s make some noise.'],
    },
  },
  {
    id: 'high',
    name: 'High limit',
    blurb: 'Behind the brass rail. Mahogany, quiet, and no small chips.',
    limits: { min: 100, max: 3000, propMin: 25 },
    chips: [25, 100, 500, 1000],
    stickman: {
      name: 'Mr. Vance',
      hello: ['Good evening. The dice are yours whenever you’re ready.', 'Welcome. One hundred to three thousand, as posted.', 'A new shooter. Bets down, please.'],
    },
  },
]

export const stakesById = (id: string): Stakes => STAKES.find((s) => s.id === id) ?? STAKES[0]

// ---- The guide ------------------------------------------------------------------

export const NUMBER_WORD: Record<number, string> = {
  2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve',
}

/** What the layout calls each spot. */
export function spotName(spot: BetSpot): string {
  const { kind, number } = spotInfo(spot)
  switch (kind) {
    case 'pass':
      return 'Pass line'
    case 'pass-odds':
      return 'Odds behind the line'
    case 'dont-pass':
      return 'Don’t pass'
    case 'dont-pass-odds':
      return 'Odds laid on the don’t'
    case 'come':
      return 'Come'
    case 'dont-come':
      return 'Don’t come'
    case 'come-point':
      return `Come bet on the ${number}`
    case 'come-odds':
      return `Odds on the come ${number}`
    case 'dont-come-point':
      return `Don’t come bet on the ${number}`
    case 'dont-come-odds':
      return `Odds laid on the don’t come ${number}`
    case 'field':
      return 'Field'
    case 'place':
      return `Place ${number}`
    case 'hard':
      return `Hard ${number}`
    case 'any-seven':
      return 'Any seven'
    case 'any-craps':
      return 'Any craps'
    case 'yo':
      return 'Eleven'
    case 'aces':
      return 'Aces'
    case 'boxcars':
      return 'Boxcars'
  }
}

/** "7 to 6", or for odds behind a point, what they pay on it. */
export function paysText(spot: BetSpot, point: PointNumber | null): string {
  const { kind } = spotInfo(spot)
  if (kind === 'field') return 'even money, double on 2, triple on 12'
  if ((kind === 'pass-odds' || kind === 'dont-pass-odds') && point === null) return kind === 'pass-odds' ? 'true odds on the point' : 'true odds against the point'
  const [win, each] = payout({ point }, spot)
  return win === each ? 'even money' : `${win} to ${each}`
}

const ABOUT: Record<BetKind, string> = {
  pass: 'With the shooter. On the come-out 7 or 11 wins and 2, 3 or 12 loses; any other number is the point, which has to come again before a 7.',
  'pass-odds': 'Behind your pass line bet once there’s a point, up to 3, 4 or 5 times it. Paid at true odds: no house edge at all.',
  'dont-pass': 'Against the shooter. 2 or 3 wins on the come-out, 7 or 11 loses, 12 is a push. Then a 7 before the point wins.',
  'dont-pass-odds': 'Laid behind a don’t pass bet, up to 6 times it. You risk more than you win, at true odds with no house edge.',
  come: 'A pass line bet made while there’s a point: the next roll is its come-out, and a point number moves it to that box.',
  'dont-come': 'A don’t pass bet made while there’s a point. A point number moves it to the top of that box.',
  'come-point': 'Wins when its number rolls, loses to a 7. Tap it to take odds; it can’t come down.',
  'come-odds': 'Odds behind a come bet. Off on the come-out.',
  'dont-come-point': 'Wins on a 7, loses when its number rolls. Tap it to lay odds.',
  'dont-come-odds': 'Odds laid behind a don’t come bet. Always working.',
  field: 'One roll: wins on 2, 3, 4, 9, 10, 11 or 12, and loses on 5, 6, 7 or 8.',
  place: 'Wins every time the number rolls before a 7, and stays up. Off on the come-out.',
  hard: 'Wins only when the number rolls as a pair. Loses to a 7 or the number rolled any other way. Off on the come-out.',
  'any-seven': 'One roll: wins on any 7.',
  'any-craps': 'One roll: wins on 2, 3 or 12.',
  yo: 'One roll: wins on 11.',
  aces: 'One roll: wins on 2.',
  boxcars: 'One roll: wins on 12.',
}

export const aboutSpot = (spot: BetSpot): string => ABOUT[spotInfo(spot).kind]

const UNITS: Record<number, string> = { 2: 'twos', 3: 'threes', 5: 'fives', 6: 'sixes' }

/** Units a dealer asks for, in words. */
export function unitsText(spot: BetSpot, point: PointNumber | null): string | null {
  const { kind, number } = spotInfo(spot)
  if (kind === 'place') return number === 6 || number === 8 ? 'Goes down in sixes.' : 'Goes down in fives.'
  if (kind === 'pass-odds' || kind === 'dont-pass-odds' || kind === 'come-odds' || kind === 'dont-come-odds') {
    const n = kind === 'come-odds' || kind === 'dont-come-odds' ? number : point
    if (n === null) return null
    const [, each] = payout({ point: n }, spot)
    return each === 1 ? null : `Goes down in ${UNITS[each]} on the ${n}.`
  }
  return null
}

const edges = new Map<string, number>()

/** The house edge on a bet, from 0 to 1, worked out exactly through the engine (odds.ts). */
export function edgeOf(spot: BetSpot): number {
  const { kind } = spotInfo(spot)
  if (kind === 'pass-odds' || kind === 'dont-pass-odds' || kind === 'come-odds' || kind === 'dont-come-odds') return 0
  // A travelled come bet is a come bet halfway through; it has the come bet's edge.
  const key: BetSpot = kind === 'come-point' ? 'come' : kind === 'dont-come-point' ? 'dont-come' : spot
  let edge = edges.get(key)
  if (edge === undefined) edges.set(key, (edge = houseEdge(key)))
  return edge
}

export const formatEdge = (edge: number): string => (edge === 0 ? 'none' : `${(edge * 100).toFixed(2)}%`)

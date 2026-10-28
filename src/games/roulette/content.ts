/**
 * Roulette content: the wheels, the tables and their croupiers, and the
 * guide to every bet on the layout.
 */

import { type BetKind, type Limits, type Spot, type WheelKind, isEvenMoney, paysOf, pocketName, spotInfo } from './engine'
import { houseEdge } from './odds'

export interface WheelInfo {
  id: WheelKind
  name: string
  /** The one-line case for it. */
  blurb: string
  /** What it costs, in words. */
  edge: string
}

export const WHEELS: readonly WheelInfo[] = [
  {
    id: 'european',
    name: 'European',
    blurb: 'Thirty-seven pockets and a single zero. The wheel they spin from Monte Carlo to Baden-Baden.',
    edge: 'Every bet costs the same: 2.70%.',
  },
  {
    id: 'french',
    name: 'French',
    blurb: 'The single-zero wheel with la partage: when the ball finds zero, even-money bets lose only half.',
    edge: '1.35% on red or black, odd or even, high or low; 2.70% on the rest.',
  },
  {
    id: 'american',
    name: 'American',
    blurb: 'Thirty-eight pockets, with a double zero beside the zero. Brought over from the Nevada clubs.',
    edge: '5.26% on every bet, and 7.89% on the top line.',
  },
]

export const wheelById = (id: string): WheelInfo => WHEELS.find((w) => w.id === id) ?? WHEELS[0]

export interface Croupier {
  name: string
  /** What they say as you sit down, in English and at the French wheel. */
  hello: { en: readonly string[]; fr: readonly string[] }
}

export interface Stakes {
  id: string
  name: string
  blurb: string
  limits: Limits
  /** Chip values in the rack, smallest first. */
  chips: readonly number[]
  croupier: Croupier
}

export const STAKES: readonly Stakes[] = [
  {
    id: 'salon',
    name: 'The Salon',
    blurb: 'By the tall windows over the harbor, where the yachts come in. Small chips and good company.',
    limits: { insideMin: 1, outsideMin: 5, straightMax: 25, outsideMax: 250 },
    chips: [1, 5, 25, 100],
    croupier: {
      name: 'Henri',
      hello: {
        en: ['Good evening. Your chips are the gold ones, monsieur, madame.', 'Welcome to the Salon. Place your bets whenever you like.', 'A new player! Gold chips for you. Bonne chance.'],
        fr: ['Bonsoir. Your chips are the gold ones. Faites vos jeux.', 'Bienvenue au Salon. The gold chips are yours.', 'Ah, a new player. Gold for you. Bonne chance.'],
      },
    },
  },
  {
    id: 'grand',
    name: 'Grand Salon',
    blurb: 'Under the great chandelier, in the middle of the room. The wheel everyone stops to watch.',
    limits: { insideMin: 5, outsideMin: 25, straightMax: 100, outsideMax: 1000 },
    chips: [5, 25, 100, 500],
    croupier: {
      name: 'Mademoiselle Odette',
      hello: {
        en: ['Good evening, and welcome to the Grand Salon. Gold chips are yours.', 'Please, sit. The wheel is warm tonight.', 'Your chips are gold. The ball is waiting.'],
        fr: ['Bonsoir, et bienvenue. Your chips are gold.', 'Asseyez-vous, je vous en prie. The wheel is warm tonight.', 'Gold for you. Faites vos jeux.'],
      },
    },
  },
  {
    id: 'prive',
    name: 'Salon Privé',
    blurb: 'Behind the velvet rope. Black lacquer, quiet voices, and no small chips at all.',
    limits: { insideMin: 25, outsideMin: 100, straightMax: 500, outsideMax: 5000 },
    chips: [25, 100, 500, 1000],
    croupier: {
      name: 'Monsieur Lacroix',
      hello: {
        en: ['Good evening. The limits are as posted. Gold chips are yours.', 'Welcome to the Salon Privé. Take your time.', 'A pleasure. Your chips are gold.'],
        fr: ['Bonsoir. Les limites sont affichées. Your chips are gold.', 'Bienvenue au Salon Privé. Prenez votre temps.', 'Enchanté. The gold chips are yours.'],
      },
    },
  },
]

export const stakesById = (id: string): Stakes => STAKES.find((s) => s.id === id) ?? STAKES[0]

/** What you need to sit down: one outside bet. */
export const buyInOf = (stakes: Stakes) => stakes.limits.outsideMin

// ---- The guide ------------------------------------------------------------------

const ORDINAL = ['1st', '2nd', '3rd']

const join = (numbers: readonly number[], sep = '/') => numbers.map(pocketName).join(sep)

/** What the layout calls each spot: "Split 14/17", "Six line 16–21", "2nd dozen". */
export function spotName(wheel: WheelKind, spot: Spot): string {
  const info = spotInfo(wheel, spot)
  if (!info) return spot
  const { kind, numbers } = info
  const first = numbers[0]
  const last = numbers[numbers.length - 1]
  switch (kind) {
    case 'straight':
      return `${pocketName(first)} straight up`
    case 'split':
      return `Split ${join([...numbers].sort((a, b) => orderOf(a) - orderOf(b)))}`
    case 'street':
      return `Street ${first}–${last}`
    case 'trio':
      return `Trio ${join([...numbers].sort((a, b) => orderOf(a) - orderOf(b)))}`
    case 'corner':
      return `Corner ${join(numbers)}`
    case 'first-four':
      return 'First four'
    case 'top-line':
      return 'Top line'
    case 'line':
      return `Six line ${first}–${last}`
    case 'dozen':
      return `${ORDINAL[(first - 1) / 12]} dozen`
    case 'column':
      return `${ORDINAL[first - 1]} column`
    case 'red':
      return 'Red'
    case 'black':
      return 'Black'
    case 'odd':
      return 'Odd'
    case 'even':
      return 'Even'
    case 'low':
      return '1 to 18'
    case 'high':
      return '19 to 36'
  }
}

/** Zeros first, as the layout reads: 0/00/2, 00/3. */
const orderOf = (p: number) => (p === 0 ? -2 : p === 37 ? -1 : p)

/** "17 to 1", or "even money". */
export function paysText(wheel: WheelKind, spot: Spot): string {
  const info = spotInfo(wheel, spot)
  if (!info) return ''
  const pays = paysOf(info)
  return pays === 1 ? 'even money' : `${pays} to 1`
}

const ABOUT: Record<BetKind, string> = {
  straight: 'One number, on its own.',
  split: 'Two numbers side by side: chips on the line between them.',
  street: 'A row of three across the layout: chips on its outside edge.',
  trio: 'Zero and two numbers beside it: chips where they meet.',
  corner: 'Four numbers that meet at a corner: chips on the point between them.',
  'first-four': 'Zero, 1, 2 and 3: chips on the outside corner where zero meets 1.',
  'top-line': 'Zero, double zero, 1, 2 and 3. The worst bet on the table.',
  line: 'Two rows side by side, six numbers: chips on the outside edge between them.',
  dozen: 'Twelve numbers in a run: 1 to 12, 13 to 24 or 25 to 36.',
  column: 'Twelve numbers in a line along the layout, one in every row.',
  red: 'Eighteen numbers. Zero is neither red nor black.',
  black: 'Eighteen numbers. Zero is neither red nor black.',
  odd: 'Eighteen numbers. Zero is neither odd nor even.',
  even: 'Eighteen numbers. Zero is neither odd nor even.',
  low: 'Eighteen numbers, called manque at the French wheel.',
  high: 'Eighteen numbers, called passe at the French wheel.',
}

/** A word about a bet, and la partage where it applies. */
export function aboutSpot(wheel: WheelKind, spot: Spot): string {
  const info = spotInfo(wheel, spot)
  if (!info) return ''
  const about = ABOUT[info.kind]
  return wheel === 'french' && isEvenMoney(info.kind) ? `${about} La partage: zero takes only half, and it goes down in twos.` : about
}

const edges = new Map<string, number>()

/** The house edge on a bet, from 0 to 1, worked out exactly through the engine (odds.ts). */
export function edgeOf(wheel: WheelKind, spot: Spot): number {
  const key = `${wheel}:${spot}`
  let edge = edges.get(key)
  if (edge === undefined) edges.set(key, (edge = houseEdge(wheel, spot)))
  return edge
}

export const formatEdge = (edge: number): string => `${(edge * 100).toFixed(2)}%`

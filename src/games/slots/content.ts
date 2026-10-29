/**
 * Slots content: the machines on the floor, the symbols on their reels,
 * and what every pay is called.
 */

import { type Pay, type Rules, type SymbolId, MAX_COINS } from './engine'
import { JUNK, MACHINES, type MachineId } from './machines'
import { report } from './odds'

export interface MachineInfo {
  id: MachineId
  name: string
  /** The one-line case for it. */
  blurb: string
  /** What a coin is, in words. */
  coinText: string
  /** How it plays. */
  feel: string
}

export const MACHINE_INFO: readonly MachineInfo[] = [
  {
    id: 'caps',
    name: 'Bottle Caps',
    blurb: 'Tin cans, horseshoes, bells and bottle caps off the scrap heap, and cherries for luck. The machine by the door.',
    coinText: 'A cap a coin',
    feel: 'Small wins, often: one spin in four pays something. One coin or three, it pays the same for each.',
  },
  {
    id: 'sevens',
    name: 'Atomic Sevens',
    blurb: 'Sevens and bars round a wild atom that stands in for anything, and doubles what it touches.',
    coinText: 'Five caps a coin',
    feel: 'Two atoms on a win pay four times over. Three coins pay a bonus on three atoms.',
  },
  {
    id: 'rocket',
    name: 'Moon Rocket',
    blurb: 'Rockets, saucers and robots under a jackpot meter that climbs with every three-coin pull on the row.',
    coinText: '25 caps a coin',
    feel: 'Long dry spells and big wins. Only three coins can win the meter.',
  },
]

export const machineInfo = (id: string): MachineInfo => MACHINE_INFO.find((m) => m.id === id) ?? MACHINE_INFO[0]

/** What it costs to sit down: one coin. */
export const buyInOf = (id: MachineId) => MACHINES[id].coin

export const SYMBOLS: Record<SymbolId, { name: string; plural: string }> = {
  blank: { name: 'blank', plural: 'blanks' },
  cap: { name: 'bottle cap', plural: 'bottle caps' },
  bell: { name: 'bell', plural: 'bells' },
  shoe: { name: 'horseshoe', plural: 'horseshoes' },
  can: { name: 'tin can', plural: 'tin cans' },
  cherry: { name: 'cherry', plural: 'cherries' },
  atom: { name: 'atom', plural: 'atoms' },
  seven: { name: 'seven', plural: 'sevens' },
  bar3: { name: 'triple bar', plural: 'triple bars' },
  bar2: { name: 'double bar', plural: 'double bars' },
  bar1: { name: 'single bar', plural: 'single bars' },
  rocket: { name: 'rocket', plural: 'rockets' },
  saucer: { name: 'flying saucer', plural: 'flying saucers' },
  robot: { name: 'robot', plural: 'robots' },
  raygun: { name: 'ray gun', plural: 'ray guns' },
  planet: { name: 'ringed planet', plural: 'ringed planets' },
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three']

/** What the glass calls a pay: "Three bells", "Any three junk", "Any two cherries". */
export function payName(pay: Pay): string {
  const m = pay.match
  if (m.kind === 'count') {
    const word = m.count === 1 ? SYMBOLS[m.symbol].name : `${NUMBER_WORDS[m.count]} ${SYMBOLS[m.symbol].plural}`
    return `Any ${word}`
  }
  const [a, b, c] = m.reels
  if (a.length === 1 && b.length === 1 && c.length === 1 && a[0] === b[0] && b[0] === c[0]) return `Three ${SYMBOLS[a[0]].plural}`
  if (a.length > 1 && a.every((s) => JUNK.includes(s))) return 'Any three junk'
  if (a.length > 1) return 'Any three bars'
  return [a, b, c].map((set) => set.map((s) => SYMBOLS[s].name).join(' or ')).join(', ')
}

/** What a pay is worth for so many coins: "1,000", or the meter. */
export function payValue(pay: Pay, coins: number): string {
  const value = pay.pays[coins - 1]
  return value === 'meter' ? 'Jackpot' : value.toLocaleString()
}

/** A pay's symbols, for drawing it on the glass: three across, a mix for "any three", or the counted symbol and "any" for the rest. */
export function payPicture(pay: Pay): (SymbolId | 'any')[] {
  const m = pay.match
  if (m.kind === 'count') return [...Array.from({ length: m.count }, () => m.symbol), ...Array.from({ length: 3 - m.count }, () => 'any' as const)]
  return m.reels.map((set, i) => set[(i + 1) % set.length])
}

export const formatPercent = (n: number): string => `${(n * 100).toFixed(2)}%`

/** "1 in 32,768", or "1 in 3.7" for the common ones. */
export function formatChance(chance: number): string {
  if (chance <= 0) return 'never'
  const n = 1 / chance
  return `1 in ${n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(1)}`
}

/** The return for one coin and for three, in words, for the lobby. */
export function returnText(rules: Rules): string {
  const one = report(rules, 1).total
  const max = report(rules, MAX_COINS).total
  if (Math.abs(one - max) < 0.00005) return `Pays back ${formatPercent(max)}, however many coins.`
  return `Pays back ${formatPercent(max)} on three coins, ${formatPercent(one)} on fewer.`
}

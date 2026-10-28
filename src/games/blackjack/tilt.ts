/**
 * Tilt: how the regulars take a beating.
 *
 * After every round each regular who lost feels a sting: worse for a lost
 * double or split, a dealer blackjack, or a run of losses. Depending on
 * their temper they may swear about it, slam the table, or get up and storm
 * off. Slam the table too often and security walks you out; bet like a card
 * counter and the pit boss has a word. At most one of them makes a scene in
 * a round, the most dramatic, so the table never turns into a brawl.
 *
 * Pure apart from the rng. Each regular's temper and lines are in content.ts.
 */

import type { Rng } from '../../core/rng'
import type { Hand } from './engine'

export interface Temper {
  /** How readily they slam the table after a bad loss, 0 (never) to 1. */
  slam: number
  /** How readily they swear about one. */
  curse: number
  /** How readily they storm off after a run of them. */
  quit: number
}

export interface Mood {
  /** Rounds lost in a row. */
  losses: number
  /** Times they've slammed the table this sitting. */
  slams: number
}

export const calmMood = (): Mood => ({ losses: 0, slams: 0 })

/** The mood after a round that ended `net` caps up or down. */
export const moodAfter = (mood: Mood, net: number): Mood => ({ ...mood, losses: net < 0 ? mood.losses + 1 : net > 0 ? 0 : mood.losses })

/**
 * How much a round hurt, 0 to 1. A plain loss stings a little; a lost
 * double or split, a dealer blackjack and each loss in a row add to it.
 */
export function sting(hands: readonly Hand[], net: number, losses: number, dealerBlackjack: boolean): number {
  if (net >= 0) return 0
  let s = 0.35
  if (hands.some((h) => h.doubled || h.split)) s += 0.25
  if (dealerBlackjack) s += 0.15
  s += 0.1 * Math.max(0, losses - 1)
  return Math.min(1, s)
}

export type Scene =
  /** Security walks them out for slamming the table, or the pit boss backs off a counter. */
  | { kind: 'kicked'; why: 'slamming' | 'counting' }
  /** They storm off, maybe slamming the table on the way. */
  | { kind: 'quit'; slam: boolean }
  | { kind: 'slam' }
  | { kind: 'curse' }

/** Most dramatic first: when several regulars react to a round, the first of these wins. */
export const DRAMA: readonly Scene['kind'][] = ['kicked', 'quit', 'slam', 'curse']

export interface RoundFeeling {
  temper: Temper
  /** Their mood after this round (moodAfter). */
  mood: Mood
  sting: number
  /** How much of their buy-in they're down, 0 to 1. */
  down: number
  /** They bet the top of a counter's spread this round. */
  hotBet: boolean
}

/** Chance the pit boss backs off a counter who just bet big. */
const BACK_OFF = 0.3

/**
 * Scale a temper and a sting into a chance. Tuned by self-play so a full
 * table of hotheads makes a scene every few rounds, not every round: Big Sal
 * slams the table about 5 times in 100 rounds and swears about 6 times.
 */
const SLAM_RATE = 0.4
const CURSE_RATE = 0.35

/** What, if anything, a regular does about the round. */
export function sceneAfter({ temper, mood, sting: hurt, down, hotBet }: RoundFeeling, rng: Rng): Scene | null {
  if (hotBet && rng() < BACK_OFF) return { kind: 'kicked', why: 'counting' }
  if (hurt === 0) return null

  // A run of losses, or half the buy-in gone, and they may have had enough.
  if (mood.losses >= 3 || down >= 0.5) {
    const fedUp = temper.quit * (0.4 + 0.15 * Math.max(0, mood.losses - 3) + (down >= 0.5 ? 0.3 : 0))
    if (rng() < fedUp) return { kind: 'quit', slam: rng() < temper.slam }
  }

  const r = rng()
  const slam = temper.slam * hurt * SLAM_RATE
  if (r < slam) {
    // Security has seen this before.
    const slams = mood.slams + 1
    if (slams >= 3 || (slams === 2 && rng() < 0.4)) return { kind: 'kicked', why: 'slamming' }
    return { kind: 'slam' }
  }
  if (r < slam + temper.curse * hurt * CURSE_RATE) return { kind: 'curse' }
  return null
}

/** Of everyone's scenes, the one the table sees: the most dramatic, the first seat breaking ties. */
export function headline<T extends { scene: Scene }>(scenes: readonly T[]): T | null {
  let best: T | null = null
  for (const s of scenes) {
    if (!best || DRAMA.indexOf(s.scene.kind) < DRAMA.indexOf(best.scene.kind)) best = s
  }
  return best
}

/** How many rounds an emptied seat stays empty before someone new sits down: one to three. */
export const vacancyRounds = (rng: Rng): number => 1 + Math.floor(rng() * 3)

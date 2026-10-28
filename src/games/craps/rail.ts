/**
 * The regulars at the rail: who's playing beside you, how they bet, and
 * what they say about the dice.
 *
 * Each regular bets their own caps on their own copy of the table, through
 * the same engine as yours, and every roll's dice settle their bets too.
 * Their chips stay off the layout, so yours are the only ones there; their
 * plates on the rail show their stacks.
 *
 * `RailTalk` decides whether anyone says something after a roll, and who:
 * big moments (a point made, a seven-out, a long hand) usually get a line
 * and small ones rarely do; the rail goes quiet for a roll or two after a
 * remark; nobody speaks twice running when someone else could; lines don't
 * repeat until a regular has used them all. Pure apart from the rng.
 */

import { type Rng, shuffle } from '../../core/rng'
import {
  type Action,
  type BetSpot,
  HARD_NUMBERS,
  POINTS,
  type TableEvent,
  type TableState,
  apply,
  betOn,
  canBet,
  fitBet,
  isLegal,
  minBet,
  summarize,
} from './engine'

/**
 * - right: the pass line with full odds, and two come bets with odds
 * - wrong: don't pass, with the odds laid
 * - place: the pass line, and the 6 and 8 placed
 * - longshot: the pass line, the hardways, and a yo on the come-out
 * - field: the pass line, and the field every roll
 */
export type RailStyle = 'right' | 'wrong' | 'place' | 'longshot' | 'field'

export const MOMENTS = ['hello', 'goodbye', 'sevenOut', 'pointMade', 'hotHand', 'myBigWin', 'hardway', 'natural', 'craps', 'pointSet'] as const
export type Moment = (typeof MOMENTS)[number]

export interface Regular {
  id: string
  name: string
  /** What their plate says where the full name won't fit. */
  short: string
  blurb: string
  style: RailStyle
  /** Buy-in, in table minimums. */
  bankroll: number
  /** Portrait color. */
  color: string
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /** A few lines for each moment they'd talk about; missing moments pass in silence. */
  lines: Partial<Record<Moment, readonly string[]>>
}

/** The bets a regular puts down before a roll, given what they have left. */
export function railBets(style: RailStyle, state: TableState, stack: number): Action[] {
  const actions: Action[] = []
  let left = stack
  let s = state
  /** Bring a bet up to `amount` in all, if it fits the rules and their stack. */
  const put = (spot: BetSpot, amount: number) => {
    const add = amount - betOn(s, spot)
    if (add <= 0 || add > left) return
    const action: Action = { type: 'bet', spot, amount: add }
    if (!isLegal(s, action, left)) return
    s = apply(s, action, left).state
    left -= add
    actions.push(action)
  }
  /** As much odds as the rules allow and the stack covers. */
  const odds = (spot: BetSpot) => {
    const amount = canBet(s, spot) ? fitBet(s, spot, Infinity, left) : null
    if (amount !== null) put(spot, amount)
  }
  const comeOut = state.point === null
  const line = style === 'wrong' ? 'dont-pass' : 'pass'
  if (comeOut) put(line, minBet(s, line))
  switch (style) {
    case 'right':
      if (!comeOut) {
        odds('pass-odds')
        for (const n of POINTS) odds(`come-odds-${n}`)
        const working = POINTS.filter((n) => betOn(s, `come-${n}`) > 0).length
        if (working < 2) put('come', minBet(s, 'come'))
      }
      break
    case 'wrong':
      if (!comeOut) odds('dont-pass-odds')
      break
    case 'place':
      if (!comeOut) for (const spot of ['place-6', 'place-8'] as const) put(spot, minBet(s, spot))
      break
    case 'longshot':
      if (comeOut) put('yo', minBet(s, 'yo'))
      else for (const n of HARD_NUMBERS) put(`hard-${n}`, minBet(s, `hard-${n}`))
      break
    case 'field':
      put('field', minBet(s, 'field'))
      break
  }
  return actions
}

/** Every roll this many into a hand, with the shooter still going, is worth a word. */
const HOT_EVERY = 8

export interface Found {
  moment: Moment
  /** Whose win it is, for myBigWin: an index into the seats. */
  seat?: number
}

/**
 * What a roll gave the rail to talk about, most notable first. `results`
 * is each seat's events for the roll (null for an empty seat).
 */
export function momentsOf(events: readonly TableEvent[], after: TableState, results: readonly (readonly TableEvent[] | null)[], min: number): Found[] {
  const found: Found[] = []
  const rolled = events.find((e) => e.type === 'rolled')
  if (!rolled || rolled.type !== 'rolled') return found
  const { dice, total, comeOut } = rolled
  if (events.some((e) => e.type === 'seven-out')) found.push({ moment: 'sevenOut' })
  if (events.some((e) => e.type === 'point-made')) found.push({ moment: 'pointMade' })
  if (!comeOut && after.point !== null && after.handRolls > 0 && after.handRolls % HOT_EVERY === 0) found.push({ moment: 'hotHand' })
  results.forEach((r, seat) => {
    if (!r) return
    const { paid, lost } = summarize(r)
    if (paid - lost >= min * 8) found.push({ moment: 'myBigWin', seat })
  })
  if (!comeOut && dice[0] === dice[1] && total >= 4 && total <= 10) found.push({ moment: 'hardway' })
  if (comeOut && (total === 7 || total === 11)) found.push({ moment: 'natural' })
  if (comeOut && (total === 2 || total === 3 || total === 12)) found.push({ moment: 'craps' })
  if (events.some((e) => e.type === 'point-set')) found.push({ moment: 'pointSet' })
  return found
}

/** Chance of a remark, before chattiness. Hello and goodbye are always said. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  goodbye: 1,
  sevenOut: 0.6,
  pointMade: 0.65,
  hotHand: 0.8,
  myBigWin: 0.5,
  hardway: 0.45,
  natural: 0.3,
  craps: 0.3,
  pointSet: 0.1,
}

/** Rolls that must pass after a remark. Big moments wait less. */
const QUIET_AFTER_BIG = 1
const QUIET_AFTER_SMALL = 3
const BIG = new Set<Moment>(['sevenOut', 'pointMade', 'hotHand'])

export interface Talker {
  seat: number
  regular: Regular
}

export interface Said {
  seat: number
  text: string
}

export class RailTalk {
  private readonly rng: Rng
  private roll = 0
  private lastRoll = -Infinity
  private lastSpeaker: number | null = null
  private readonly bags = new Map<string, string[]>()

  constructor(rng: Rng) {
    this.rng = rng
  }

  /** A remark about the roll, or null if nobody speaks. */
  react(found: readonly Found[], talkers: readonly Talker[]): Said | null {
    this.roll++
    for (const { moment, seat } of found) {
      const candidates = talkers.filter((t) => t.regular.lines[moment]?.length && (seat === undefined || t.seat === seat))
      if (candidates.length === 0) continue
      const quiet = BIG.has(moment) ? QUIET_AFTER_BIG : QUIET_AFTER_SMALL
      if (this.roll - this.lastRoll <= quiet) return null
      // Table moments go to whoever didn't speak last, when there's a choice.
      const fresh = candidates.length > 1 ? candidates.filter((t) => t.seat !== this.lastSpeaker) : candidates
      const speaker = this.weighted(fresh)
      if (this.rng() >= CHANCE[moment] * speaker.regular.chattiness) return null
      return this.speak(speaker, moment)
    }
    return null
  }

  /** Hello as they step up, goodbye as they leave. */
  say(talker: Talker, moment: 'hello' | 'goodbye'): string | null {
    if (!talker.regular.lines[moment]?.length) return null
    return this.speak(talker, moment).text
  }

  private speak(talker: Talker, moment: Moment): Said {
    this.lastRoll = this.roll
    this.lastSpeaker = talker.seat
    const key = `${talker.regular.id}:${moment}`
    let bag = this.bags.get(key)
    if (!bag || bag.length === 0) {
      bag = shuffle(talker.regular.lines[moment]!, this.rng)
      this.bags.set(key, bag)
    }
    return { seat: talker.seat, text: bag.pop()! }
  }

  private weighted(talkers: readonly Talker[]): Talker {
    const total = talkers.reduce((n, t) => n + t.regular.chattiness, 0)
    let r = this.rng() * total
    for (const t of talkers) {
      r -= t.regular.chattiness
      if (r < 0) return t
    }
    return talkers[talkers.length - 1]
  }
}

export const REGULARS: readonly Regular[] = [
  {
    id: 'doc',
    name: 'Doc Hollis',
    short: 'Doc',
    blurb: 'A retired dentist who plays the line and takes full odds, every time, and come bets while he waits.',
    style: 'right',
    bankroll: 60,
    color: '#3a6ea5',
    chattiness: 1,
    lines: {
      hello: ['Evening. Line and full odds: the only way to play.', 'Pass line, full odds. Same as every Tuesday.'],
      goodbye: ['That’s my budget. Good luck, shooter.', 'Out of chips and out of excuses. Night, all.'],
      pointMade: ['Winner! Pay the line, pay the odds.', 'That’s how it’s done. Odds paid true.', 'Now we’re rolling.'],
      sevenOut: ['Seven out. Well, the odds were fair while they lasted.', 'And there it goes. Nice hand, shooter.', 'Seven. Can’t win them all.'],
      hotHand: ['Don’t change a thing, shooter. Not a thing.', 'This hand is paying for my dinner.', 'Look at this. Every come bet working.'],
      myBigWin: ['Full odds. The house can’t touch those.', 'That’s the one bet they don’t make money on.'],
      hardway: ['The hard way. Never bet them, always watch them.'],
      natural: ['Front line winner. I’ll take it.'],
      craps: ['Craps. A cheap lesson.'],
      pointSet: ['Odds behind the line, please.'],
    },
  },
  {
    id: 'lou',
    name: 'Lucky Lou',
    short: 'Lou',
    blurb: 'Bets the don’t, against the shooter, and has learned to keep quiet about it.',
    style: 'wrong',
    bankroll: 60,
    color: '#5b5b6b',
    chattiness: 0.8,
    lines: {
      hello: ['Don’t mind me. I’m on the dark side.', 'Don’t pass for me. Nothing personal, shooter.'],
      goodbye: ['The don’t giveth, and the don’t taketh away. Night.'],
      pointMade: ['Hm. Good for you, I suppose.', 'There goes my don’t. Again.'],
      sevenOut: ['Sorry, folks. Somebody had to win.', 'Seven. Don’t mind me, I’ll just be over here.'],
      hotHand: ['Any time now, shooter. Any time.', 'A long one. My kingdom for a seven.'],
      myBigWin: ['Laid the odds, took the money. Quietly.'],
      natural: ['Seven on the come-out. Figures.'],
      craps: ['Craps. I’ll keep my mouth shut and take it.'],
    },
  },
  {
    id: 'rosa',
    name: 'Mama Rosa',
    short: 'Rosa',
    blurb: 'Places the 6 and the 8 and talks to the dice, mostly sweetly.',
    style: 'place',
    bankroll: 50,
    color: '#b0476b',
    chattiness: 1.3,
    lines: {
      hello: ['Six and eight, sweetheart. Always the six and eight.', 'Come on, dice. Mama needs a new coat.'],
      goodbye: ['That’s it for Rosa. Kiss the dice for me, shooter.'],
      pointMade: ['Bravo! Again, again!', 'Look at that. Beautiful.'],
      sevenOut: ['Ay, the seven. Who invited him?', 'Seven. My poor six and eight.'],
      hotHand: ['Don’t you dare stop, sweetheart.', 'Six, eight, six, eight. This is a good table.'],
      myBigWin: ['Pay me, pay me, honey!'],
      hardway: ['The hard way! Mama likes the hard way.'],
      natural: ['Winner! Lovely.'],
      pointSet: ['A point! Now bring me sixes and eights.'],
    },
  },
  {
    id: 'spike',
    name: 'Spike Malone',
    short: 'Spike',
    blurb: 'Bets the middle of the table, hardways and yo, against all advice and most arithmetic.',
    style: 'longshot',
    bankroll: 40,
    color: '#c7792b',
    chattiness: 1.4,
    lines: {
      hello: ['Hardways across, and a yo for luck.', 'Middle of the table. That’s where the money is. Somewhere.'],
      goodbye: ['Busted. Worth it.', 'That’s me cleaned out. See you next payday.'],
      hardway: ['Hard way! That one’s mine!', 'Told you. Told everybody.'],
      craps: ['Craps! Should’ve been on any craps.'],
      natural: ['Yo! Yo-leven!', 'Front line! Now do it again with an eleven.'],
      sevenOut: ['Seven. Takes the hardways with it, every time.', 'There go my hardways.'],
      pointMade: ['Hey, hey! Pay the man!'],
      hotHand: ['Shooter’s hot! Press it all!', 'I’m not leaving. Nobody’s leaving.'],
      myBigWin: ['Nine to one, baby!', 'See? The middle pays.'],
    },
  },
  {
    id: 'bea',
    name: 'Bea Calloway',
    short: 'Bea',
    blurb: 'Plays the field every roll and counts every one out loud.',
    style: 'field',
    bankroll: 50,
    color: '#4f8a5b',
    chattiness: 1.1,
    lines: {
      hello: ['Field and the line. Simple pleasures.', 'Field bet, every roll. Don’t tell my sister.'],
      goodbye: ['That’s my allowance. Lovely playing with you.'],
      sevenOut: ['Seven. The field loses too, of course.', 'Oh, dear. Seven.'],
      pointMade: ['Lovely! Pay the line.'],
      craps: ['Craps on the line, but the field pays. Swings and roundabouts.'],
      hotHand: ['What a lovely long roll this is.', 'I’ve lost count. That’s a good sign.'],
      myBigWin: ['Triple on twelve! Oh, my.', 'Double in the field!'],
      hardway: ['A pair! Is that good? It sounds good.'],
    },
  },
]

/** Three regulars for a night, in random seats. */
export const pickRegulars = (rng: Rng): Regular[] => shuffle(REGULARS, rng).slice(0, 3)

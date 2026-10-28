/**
 * The regulars at the wheel: who's sitting beside you, the system each one
 * swears by, and what they say about the spins.
 *
 * Each regular bets their own caps on their own copy of the layout, through
 * the same engine as yours. Their chips are on the felt in their own color,
 * as wheel chips are, so you can tell whose bet is whose. Before every spin
 * they pick up whatever's left and put down what their system calls for.
 *
 * `WheelTalk` decides whether anyone says something after a spin, and who:
 * a number hit straight up or a zero usually gets a line and the rest
 * rarely do; the table goes quiet for a spin or two after a remark; nobody
 * speaks twice running when someone else could; lines don't repeat until a
 * regular has used them all. Pure apart from the rng.
 */

import { type Rng, shuffle } from '../../core/rng'
import { numberWord } from './calls'
import {
  type Action,
  type Pocket,
  type Spot,
  type TableEvent,
  type TableState,
  apply,
  colorOf,
  fitBet,
  isLegal,
  isZero,
  pocketName,
  summarize,
} from './engine'

/**
 * - martingale: red, doubling after every loss, back to one unit after a win
 * - lucky: the same three numbers straight up, every spin
 * - fibonacci: black, a step up the Fibonacci sequence after a loss, two back after a win
 * - bond: 14 units on 19 to 36, 5 on the six line 13 to 18, and 1 on zero
 * - hot: straight up on the last three numbers to come up
 * - dozens: the two dozens the last number missed
 */
export type System = 'martingale' | 'lucky' | 'fibonacci' | 'bond' | 'hot' | 'dozens'

export const MOMENTS = ['hello', 'goodbye', 'yourNumber', 'myNumber', 'bigWin', 'bigLoss', 'zero', 'repeat', 'streak'] as const
export type Moment = (typeof MOMENTS)[number]

export interface Regular {
  id: string
  name: string
  /** What their plate says where the full name won't fit. */
  short: string
  blurb: string
  system: System
  /** Lucky numbers, for the lucky system. */
  numbers?: readonly Pocket[]
  /** Buy-in, in outside minimums. */
  bankroll: number
  /** Their wheel chips. */
  color: string
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /**
   * A few lines for each moment they'd talk about; missing moments pass in
   * silence. "{number}" is filled with the number that came up, "{count}"
   * and "{color}" with a run of one color ("six reds").
   */
  lines: Partial<Record<Moment, readonly string[]>>
}

/** Where a system has got to between spins: a step along its progression. */
export interface Memory {
  step: number
}

export const freshMemory = (): Memory => ({ step: 0 })

const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]

/** A run of the last number's color, with the zeros breaking it. */
export function colorRun(history: readonly Pocket[]): number {
  if (history.length === 0 || isZero(history[0])) return 0
  const color = colorOf(history[0])
  let n = 0
  while (n < history.length && colorOf(history[n]) === color) n++
  return n
}

/**
 * The bets a regular puts down before a spin, on a layout of their own with
 * nothing on it, and where their system stands after them: a progression
 * that has outgrown the table or their stack starts again from one unit.
 */
export function planBets(regular: Regular, state: TableState, stack: number, memory: Memory): { actions: Action[]; memory: Memory } {
  const { insideMin, outsideMin, outsideMax } = state.limits
  const actions: Action[] = []
  let left = stack
  let s = state
  /** Put `amount` on a spot, as a dealer would take it, if it fits their stack. */
  const put = (spot: Spot, amount: number) => {
    const want = fitBet(s, spot, amount, left)
    if (want === null || want < amount) return
    const action: Action = { type: 'bet', spot, amount: want }
    if (!isLegal(s, action, left)) return
    s = apply(s, action, left).state
    left -= want
    actions.push(action)
  }
  let step = memory.step
  switch (regular.system) {
    case 'martingale':
    case 'fibonacci': {
      const units = (n: number) => (regular.system === 'martingale' ? 2 ** n : FIBONACCI[Math.min(n, FIBONACCI.length - 1)])
      if (outsideMin * units(step) > Math.min(outsideMax, stack)) step = 0
      put(regular.system === 'martingale' ? 'red' : 'black', outsideMin * units(step))
      break
    }
    case 'lucky':
      for (const n of regular.numbers ?? [7]) put(`straight-${pocketName(n)}`, insideMin * 2)
      break
    case 'bond': {
      const unit = Math.max(insideMin, Math.ceil(outsideMin / 14))
      put('high', unit * 14)
      put('line-13', unit * 5)
      put('straight-0', unit)
      break
    }
    case 'hot': {
      const hot = [...new Set(state.history)].slice(0, 3)
      for (const n of hot.length ? hot : [17]) put(`straight-${pocketName(n)}`, insideMin * 2)
      break
    }
    case 'dozens': {
      // After a zero, or before the first spin, the 2nd and 3rd.
      const last = state.history[0]
      const hit = last === undefined || isZero(last) ? 1 : Math.ceil(last / 12)
      for (const d of [1, 2, 3]) if (d !== hit) put(`dozen-${d}`, outsideMin)
      break
    }
  }
  return { actions, memory: { step } }
}

/** How a regular's system moves on after a spin that came to `net` for them. */
export function afterSpin(regular: Regular, memory: Memory, net: number): Memory {
  if (net === 0) return memory
  switch (regular.system) {
    case 'martingale':
      return { step: net > 0 ? 0 : memory.step + 1 }
    case 'fibonacci':
      return { step: net > 0 ? Math.max(0, memory.step - 2) : Math.min(FIBONACCI.length - 1, memory.step + 1) }
    default:
      return memory
  }
}

export interface Found {
  moment: Moment
  /** Whose it is, for myNumber, bigWin and bigLoss: an index into the seats. */
  seat?: number
}

/**
 * What a spin gave the table to talk about, most notable first. `seats` is
 * each regular's events for the spin (null for an empty seat); `yours` is
 * yours; `min` the table's outside minimum.
 */
export function momentsOf(after: TableState, seats: readonly (readonly TableEvent[] | null)[], yours: readonly TableEvent[], min: number): Found[] {
  const found: Found[] = []
  const pocket = after.history[0]
  if (pocket === undefined) return found
  const straightHit = (events: readonly TableEvent[]) => events.some((e) => e.type === 'won' && e.spot.startsWith('straight-'))
  if (straightHit(yours)) found.push({ moment: 'yourNumber' })
  seats.forEach((events, seat) => {
    if (events && straightHit(events)) found.push({ moment: 'myNumber', seat })
  })
  seats.forEach((events, seat) => {
    if (!events) return
    const { paid, lost } = summarize(events)
    if (paid - lost >= min * 10) found.push({ moment: 'bigWin', seat })
  })
  if (isZero(pocket)) found.push({ moment: 'zero' })
  if (after.history[1] === pocket) found.push({ moment: 'repeat' })
  if (colorRun(after.history) >= 5) found.push({ moment: 'streak' })
  seats.forEach((events, seat) => {
    if (!events) return
    const { paid, lost } = summarize(events)
    if (paid - lost <= -min * 8) found.push({ moment: 'bigLoss', seat })
  })
  return found
}

/** Chance of a remark, before chattiness. Hello and goodbye are always said. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  goodbye: 1,
  yourNumber: 0.75,
  myNumber: 0.85,
  bigWin: 0.5,
  bigLoss: 0.55,
  zero: 0.5,
  repeat: 0.6,
  streak: 0.4,
}

/** Spins that must pass after a remark. Big moments wait less. */
const QUIET_AFTER_BIG = 0
const QUIET_AFTER_SMALL = 2
const BIG = new Set<Moment>(['yourNumber', 'myNumber', 'bigWin', 'zero'])

export interface Talker {
  seat: number
  regular: Regular
}

export interface Said {
  seat: number
  text: string
}

export class WheelTalk {
  private readonly rng: Rng
  private spin = 0
  private lastSpin = -Infinity
  private lastSpeaker: number | null = null
  private readonly bags = new Map<string, string[]>()

  constructor(rng: Rng) {
    this.rng = rng
  }

  /** A remark about the spin that left the table at `after`, or null if nobody speaks. */
  react(found: readonly Found[], talkers: readonly Talker[], after: TableState): Said | null {
    this.spin++
    for (const { moment, seat } of found) {
      const candidates = talkers.filter((t) => t.regular.lines[moment]?.length && (seat === undefined || t.seat === seat))
      if (candidates.length === 0) continue
      const quiet = BIG.has(moment) ? QUIET_AFTER_BIG : QUIET_AFTER_SMALL
      if (this.spin - this.lastSpin <= quiet) return null
      // Table moments go to whoever didn't speak last, when there's a choice.
      const fresh = candidates.length > 1 ? candidates.filter((t) => t.seat !== this.lastSpeaker) : candidates
      const speaker = this.weighted(fresh)
      if (this.rng() >= CHANCE[moment] * speaker.regular.chattiness) return null
      return this.speak(speaker, moment, after)
    }
    return null
  }

  /** Hello as they sit down, goodbye as they leave. */
  say(talker: Talker, moment: 'hello' | 'goodbye'): string | null {
    if (!talker.regular.lines[moment]?.length) return null
    return this.speak(talker, moment, null).text
  }

  private speak(talker: Talker, moment: Moment, after: TableState | null): Said {
    this.lastSpin = this.spin
    this.lastSpeaker = talker.seat
    const key = `${talker.regular.id}:${moment}`
    let bag = this.bags.get(key)
    if (!bag || bag.length === 0) {
      bag = shuffle(talker.regular.lines[moment]!, this.rng)
      this.bags.set(key, bag)
    }
    return { seat: talker.seat, text: fill(bag.pop()!, after) }
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

/** Fill a line's blanks from the spin. */
function fill(line: string, after: TableState | null): string {
  const pocket = after?.history[0]
  if (pocket === undefined) return line
  const run = colorRun(after!.history)
  const color = colorOf(pocket) === 'red' ? 'reds' : 'blacks'
  return line
    .replaceAll('{number}', pocketName(pocket))
    .replaceAll('{count}', numberWord(run).toLowerCase())
    .replaceAll('{color}', color)
    .replace(/^./, (c) => c.toUpperCase())
}

export const REGULARS: readonly Regular[] = [
  {
    id: 'duval',
    name: 'Monsieur Duval',
    short: 'Duval',
    blurb: 'A banker from Lyon who doubles his bet on red after every loss, and swears the system can’t fail.',
    system: 'martingale',
    bankroll: 40,
    color: '#3d7fc1',
    chattiness: 1,
    lines: {
      hello: ['Red, always red. And when red fails, twice as much red.', 'Bonsoir. I have a system, you know. It has never lost. Overall.'],
      goodbye: ['The table limit. Always the table limit. Bonsoir.', 'My system is perfect. My bankroll was not. Good night.'],
      bigWin: ['Red! You see? The system pays.', 'And back to one unit. Magnifique.'],
      bigLoss: ['Black again. No matter: I double.', 'This cannot continue. Statistically, it cannot.', 'The system is sound. The wheel is being difficult.'],
      zero: ['Zero. The wheel’s little tax.', 'Zero! Even the house must eat.'],
      streak: ['{count} {color} in a row. Red is coming. It must.', 'Look at that board. {count} {color}.'],
      yourNumber: ['Straight up? Bravo. Reckless, but bravo.'],
    },
  },
  {
    id: 'lucia',
    name: 'Contessa Lucia',
    short: 'Lucia',
    blurb: 'Bets her birthday, her wedding day and her second wedding day straight up, every spin, in pearl-white chips.',
    system: 'lucky',
    numbers: [7, 11, 23],
    bankroll: 30,
    color: '#ece4d2',
    chattiness: 1.3,
    lines: {
      hello: ['Seven, eleven and twenty-three, darling. They’ve never let me down. Well, rarely.', 'Good evening. My numbers are feeling lucky tonight.'],
      goodbye: ['My numbers are sulking. I shall go and sulk with them.', 'Ciao, darlings. Tomorrow, twenty-three.'],
      myNumber: ['{number}! Darling, that’s mine!', 'You see? {number} always remembers me.', 'Pay me, sweetheart. {number}, straight up.'],
      yourNumber: ['Oh, you lucky thing! {number}!', 'Straight up on {number}! Kiss me for luck next time.'],
      zero: ['Zero. How rude.'],
      repeat: ['{number} again? The wheel is in love.'],
    },
  },
  {
    id: 'kranz',
    name: 'Professor Kranz',
    short: 'Kranz',
    blurb: 'A mathematician from Zurich, working his way up the Fibonacci sequence on black, purely for research.',
    system: 'fibonacci',
    bankroll: 40,
    color: '#4fa36b',
    chattiness: 0.9,
    lines: {
      hello: ['One, one, two, three, five. On black, of course.', 'Good evening. I am here purely for research.'],
      goodbye: ['The sequence has outrun my grant. Good evening.', 'Fascinating data. Disastrous results. Goodbye.'],
      bigLoss: ['The Fibonacci numbers grow quickly. So does my concern.', 'The sequence is very patient. I am less so.'],
      bigWin: ['Black! Two steps back down the sequence. Elegant.'],
      zero: ['Zero: one chance in thirty-seven. Precisely as predicted.', 'The zero. The whole house edge, in one green pocket.'],
      streak: ['{count} {color} in a row. Statistically unremarkable. Emotionally, a disaster.'],
      repeat: ['{number} twice. The wheel has no memory, you know.'],
      yourNumber: ['Thirty-five to one, on odds of thirty-six to one. Enjoy it.'],
    },
  },
  {
    id: 'sterling',
    name: 'Mr. Sterling',
    short: 'Sterling',
    blurb: 'An Englishman in a white dinner jacket: 14 units on 19 to 36, 5 on the six line 13 to 18, one on zero, every spin.',
    system: 'bond',
    bankroll: 30,
    color: '#6f8396',
    chattiness: 0.7,
    lines: {
      hello: ['Fourteen on high, five on the line, one on zero. Shaken, of course.', 'Evening. Don’t mind me. I always play the same way.'],
      goodbye: ['Well. That’s the evening. Good night.', 'Rather an expensive dinner jacket, this. Good night.'],
      myNumber: ['Zero. Thirty-five to one, and the house is buying.', 'Ah. The zero. I did say.'],
      bigWin: ['High, and the line. Most satisfactory.', 'That will do nicely.'],
      yourNumber: ['Straight up. Well played.'],
      streak: ['{count} {color}. One does notice these things.'],
    },
  },
  {
    id: 'mimi',
    name: 'Mimi Laurent',
    short: 'Mimi',
    blurb: 'A film actress between pictures who bets the last three numbers straight up. Hot numbers, she calls them.',
    system: 'hot',
    bankroll: 30,
    color: '#d9659b',
    chattiness: 1.4,
    lines: {
      hello: ['Hello, darlings! Which numbers are hot tonight?', 'I only bet what just came up. It’s still warm, you see.'],
      goodbye: ['Cold, cold, cold. I’m off to the bar.', 'The numbers have gone cold, darling. Kisses.'],
      myNumber: ['{number}! Hot, hot, hot!', 'I told you {number} was hot!'],
      repeat: ['{number} twice! It’s on fire!', 'Again! Didn’t I say?'],
      yourNumber: ['Ooh, {number}! Now that one’s hot too.'],
      zero: ['Zero! Is zero hot? Somebody tell me.'],
    },
  },
  {
    id: 'ashby',
    name: 'Colonel Ashby',
    short: 'Ashby',
    blurb: 'A retired cavalry officer who covers the two dozens the last number missed. Two flanks held, one left open.',
    system: 'dozens',
    bankroll: 40,
    color: '#8f6bc6',
    chattiness: 0.8,
    lines: {
      hello: ['Two dozens, sir. Cover the ground.', 'Evening. Two flanks covered, one left open.'],
      goodbye: ['Retreating in good order. Evening, all.', 'Outflanked. Good night.'],
      zero: ['Zero! Ambushed.', 'The zero. Never trust a green pocket.'],
      bigWin: ['Held the line.'],
      streak: ['{count} {color} on the trot. Remarkable.'],
      yourNumber: ['A direct hit. Well done.'],
    },
  },
]

/** Three regulars for a night, in random seats. */
export const pickRegulars = (rng: Rng): Regular[] => shuffle(REGULARS, rng).slice(0, 3)

/**
 * The regulars on the row: who's playing the machines either side of
 * yours, how many coins each one puts in, how fast they pull, and what they
 * say.
 *
 * Each regular plays their own machine, the same kind as yours, through
 * the same engine, with caps of their own. Nobody waits for anybody at a
 * slot machine: each pulls at their own pace, and their reels spin while
 * yours do or don't. How many coins they play is their style: one at a
 * time to make the caps last, three every pull, up a coin after a win, or
 * three once the machine is "due".
 *
 * `RowTalk` decides whether anyone says something when a spin settles,
 * and who: a jackpot always gets a line and a big win usually does; the
 * row goes quiet for a while after a remark; nobody speaks twice running
 * when someone else could; lines don't repeat until a regular has used
 * them all. Pure apart from the rng and the clock it's given.
 */

import { type Rng, shuffle } from '../../core/rng'
import { type Rules, type Spin, MAX_COINS } from './engine'

/**
 * - penny: one coin, always
 * - max: three coins, always
 * - streak: up a coin after a win, back to one after a loss
 * - due: one coin, then three once ten pulls in a row have lost
 * - quick: two coins, and quick about it
 * - jackpot: three coins where there's a meter to win, two anywhere else
 */
export type Style = 'penny' | 'max' | 'streak' | 'due' | 'quick' | 'jackpot'

export const MOMENTS = ['hello', 'goodbye', 'myJackpot', 'yourJackpot', 'myWin', 'yourWin', 'close', 'dry'] as const
export type Moment = (typeof MOMENTS)[number]

export interface Regular {
  id: string
  name: string
  /** What their plate says where the full name won't fit. */
  short: string
  blurb: string
  style: Style
  /** Seconds from one pull to the next, at least and at most. */
  pace: readonly [number, number]
  /** Buy-in, in coins of the machine they sit at. */
  bankroll: number
  /** Their plate. */
  color: string
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /** A few lines for each moment they'd talk about; missing moments pass in silence. "{win}" is filled with the caps won. */
  lines: Partial<Record<Moment, readonly string[]>>
}

/** How their night is going, for their style: losing pulls in a row, and whether the last one paid. */
export interface Memory {
  dry: number
  coins: number
}

export const freshMemory = (regular: Regular, rules: Rules): Memory => ({ dry: 0, coins: startingCoins(regular, rules) })

function startingCoins(regular: Regular, rules: Rules): number {
  switch (regular.style) {
    case 'max':
      return MAX_COINS
    case 'quick':
      return 2
    case 'jackpot':
      return rules.progressive ? MAX_COINS : 2
    default:
      return 1
  }
}

/** Losing pulls in a row before a "due" player goes to three coins. */
export const DUE_AFTER = 10

/** What a regular puts in on their next pull, held to what they can cover: 0 if they can't cover a coin. */
export function coinsFor(regular: Regular, memory: Memory, rules: Rules, stack: number): number {
  const want = regular.style === 'due' && memory.dry >= DUE_AFTER ? MAX_COINS : memory.coins
  return Math.max(0, Math.min(want, Math.floor(stack / rules.coin)))
}

/** How their style moves on after a pull. */
export function afterSpin(regular: Regular, memory: Memory, spin: Spin, rules: Rules): Memory {
  const won = spin.paid > 0
  const dry = won ? 0 : memory.dry + 1
  if (regular.style === 'streak') return { dry, coins: won ? Math.min(MAX_COINS, memory.coins + 1) : 1 }
  return { dry, coins: startingCoins(regular, rules) }
}

export interface Found {
  moment: Moment
  /** Whose it is, for myJackpot, myWin and dry: an index into the seats. */
  seat?: number
}

/** A win worth remarking on: this many times the bet, or more. */
export const BIG_WIN = 15
/** A losing run worth a word. */
export const DRY_RUN = 15

/** The top award: the first pay on every machine. */
export const isTopAward = (spin: Spin) => spin.win?.pay === 0

/**
 * Whether two of a machine's top symbol sat on the line and the third
 * stopped just above or below it.
 */
export function isClose(rules: Rules, spin: Spin): boolean {
  if (isTopAward(spin)) return false
  const top = rules.pays[0].match
  if (top.kind !== 'line') return false
  const symbol = top.reels[0][0]
  const on = spin.line.filter((s) => s === symbol).length
  if (on !== 2) return false
  const miss = spin.line.findIndex((s) => s !== symbol)
  const strip = rules.reels[miss]
  const n = strip.length
  const at = spin.stops[miss]
  return strip[(at + 1) % n].symbol === symbol || strip[(at + n - 1) % n].symbol === symbol
}

/**
 * What a settled spin gives the row to talk about, most notable first.
 * `seat` is the regular whose spin it was, or null for yours. `dry` is that
 * player's losing run after it.
 */
export function momentsOf(rules: Rules, spin: Spin, seat: number | null, dry: number): Found[] {
  const found: Found[] = []
  const mine = seat === null
  if (isTopAward(spin)) found.push(mine ? { moment: 'yourJackpot' } : { moment: 'myJackpot', seat })
  else if (spin.paid >= spin.bet * BIG_WIN) found.push(mine ? { moment: 'yourWin' } : { moment: 'myWin', seat })
  if (mine && isClose(rules, spin)) found.push({ moment: 'close' })
  if (!mine && dry > 0 && dry % DRY_RUN === 0) found.push({ moment: 'dry', seat })
  return found
}

/** Chance of a remark, before chattiness. Hello and goodbye are always said. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  goodbye: 1,
  myJackpot: 1,
  yourJackpot: 1,
  myWin: 0.8,
  yourWin: 0.6,
  close: 0.35,
  dry: 0.5,
}

/** How long the row stays quiet after a remark, in milliseconds. Big moments wait less. */
const QUIET_AFTER_BIG_MS = 2500
const QUIET_AFTER_SMALL_MS = 12_000
const BIG = new Set<Moment>(['myJackpot', 'yourJackpot', 'myWin', 'yourWin'])

export interface Talker {
  seat: number
  regular: Regular
}

export interface Said {
  seat: number
  text: string
}

export class RowTalk {
  private readonly rng: Rng
  private lastAt = -Infinity
  private lastSpeaker: number | null = null
  private readonly bags = new Map<string, string[]>()

  constructor(rng: Rng) {
    this.rng = rng
  }

  /** A remark about a spin that just settled, at time `now` (ms), or null if nobody speaks. `won` is the caps it paid. */
  react(found: readonly Found[], talkers: readonly Talker[], now: number, won = 0): Said | null {
    for (const { moment, seat } of found) {
      const candidates = talkers.filter((t) => t.regular.lines[moment]?.length && (seat === undefined || t.seat === seat))
      if (candidates.length === 0) continue
      if (now - this.lastAt < (BIG.has(moment) ? QUIET_AFTER_BIG_MS : QUIET_AFTER_SMALL_MS)) return null
      // Row moments go to whoever didn't speak last, when there's a choice.
      const fresh = candidates.length > 1 ? candidates.filter((t) => t.seat !== this.lastSpeaker) : candidates
      const speaker = this.weighted(fresh)
      if (this.rng() >= CHANCE[moment] * speaker.regular.chattiness) return null
      return this.speak(speaker, moment, now, won)
    }
    return null
  }

  /** Hello as they sit down, goodbye as they leave. */
  say(talker: Talker, moment: 'hello' | 'goodbye', now: number): string | null {
    if (!talker.regular.lines[moment]?.length) return null
    return this.speak(talker, moment, now, 0).text
  }

  private speak(talker: Talker, moment: Moment, now: number, won: number): Said {
    this.lastAt = now
    this.lastSpeaker = talker.seat
    const key = `${talker.regular.id}:${moment}`
    let bag = this.bags.get(key)
    if (!bag || bag.length === 0) {
      bag = shuffle(talker.regular.lines[moment]!, this.rng)
      this.bags.set(key, bag)
    }
    return { seat: talker.seat, text: bag.pop()!.replaceAll('{win}', won.toLocaleString()) }
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
    id: 'opal',
    name: 'Granny Opal',
    short: 'Opal',
    blurb: 'Comes in on the afternoon bus with a paper cup of caps, and plays them one coin at a time so they last till the last bus home.',
    style: 'penny',
    pace: [4, 6.5],
    bankroll: 120,
    color: '#d98ab0',
    chattiness: 1.3,
    lines: {
      hello: ['Evening, dear. One coin at a time, that’s my secret. They last longer.', 'Pull up a stool, honey. Mind my cup.'],
      goodbye: ['Well, that’s my cup empty. Night night, dear.', 'There goes the bus money. Good luck, sweetie.'],
      myWin: ['Ooh! Look at that, dear!', 'That’ll pay for the bus, and then some.', 'Well, I never. {win} caps!'],
      yourWin: ['Good for you, honey!', 'Look at that! Don’t spend it all at once, dear.', 'Beginner’s luck, I always say.'],
      myJackpot: ['Lord have mercy! Jackpot! Somebody hold my cup!'],
      yourJackpot: ['Oh my stars, honey! Jackpot! Wait till I tell the girls.'],
      close: ['Oh, so close, dear.', 'Ooh, nearly!'],
      dry: ['This one’s been tight all evening.', 'My cup’s getting awfully light.'],
    },
  },
  {
    id: 'dusty',
    name: 'Dusty Wade',
    short: 'Dusty',
    blurb: 'A rancher in town for the cattle auction who plays three coins every pull and yanks the handle like it owes him money.',
    style: 'max',
    pace: [3, 5],
    bankroll: 150,
    color: '#c98a3e',
    chattiness: 1,
    lines: {
      hello: ['Howdy. Three coins every pull, partner. That’s how it’s done.', 'Evenin’. Don’t mind me, I pull hard.'],
      goodbye: ['Cleaned out. Back to the ranch.', 'Well, that’s the auction money. Evenin’.'],
      myWin: ['Yee-haw! Pay the man!', 'Now that’s more like it.', '{win} caps! Drinks are on me. One drink.'],
      yourWin: ['Now you’re cookin’!', 'Well, look at you, partner.'],
      myJackpot: ['Jackpot! Hot dang! Somebody call my wife!'],
      yourJackpot: ['Jackpot! Well, I’ll be. Congratulations, partner.'],
      close: ['Close only counts in horseshoes, partner.'],
      dry: ['This thing’s tighter than a new boot.', 'Not a nibble. Not one.'],
    },
  },
  {
    id: 'lefty',
    name: 'Lefty Malone',
    short: 'Lefty',
    blurb: 'Rubs the glass for luck, blows on every coin, and goes up a coin after each win to ride it while the machine’s hot.',
    style: 'streak',
    pace: [4, 7],
    bankroll: 120,
    color: '#5aa36f',
    chattiness: 1.2,
    lines: {
      hello: ['Don’t touch this one, pal. I got it warmed up.', 'Rub the glass for luck. Works every time. Mostly.'],
      goodbye: ['Machine’s gone cold. I know when I’m licked.', 'Somebody jinxed it. Not saying who.'],
      myWin: ['See? She’s hot! Up a coin!', 'Told ya. Warm glass, warm machine.', 'Ride it, Lefty, ride it!'],
      yourWin: ['Hey, that one’s hot too. Who knew?', 'Rubbed the glass, didn’t ya? I saw.'],
      myJackpot: ['JACKPOT! I told ya! I told ya she was hot!'],
      yourJackpot: ['Jackpot! Aw, that was gonna be my machine.'],
      close: ['Didja see that? It’s teasing you.', 'She’s winding up. Next pull, I bet.'],
      dry: ['She’s gone cold. Lemme warm her up.', 'Somebody breathed on my machine.'],
    },
  },
  {
    id: 'vivian',
    name: 'Miss Vivian',
    short: 'Vivian',
    blurb: 'A showgirl from the revue next door, still in her feathers, who has twenty minutes before the late show and plays two coins as fast as she can.',
    style: 'quick',
    pace: [2.2, 3.6],
    bankroll: 100,
    color: '#e0c25a',
    chattiness: 1.1,
    lines: {
      hello: ['Hi, sugar. I’ve got twenty minutes till the late show.', 'Don’t mind the feathers, honey. They’re working feathers.'],
      goodbye: ['Curtain’s up in five. Toodles!', 'That’s my cue, sugar. Break a leg.'],
      myWin: ['Ooh, that’s my feathers paid for!', 'Encore! Encore!', '{win} caps, sugar. A girl could get used to this.'],
      yourWin: ['Look at you, big spender!', 'Ooh, take a bow, sugar.'],
      myJackpot: ['Jackpot! Darling, I may never dance again!'],
      yourJackpot: ['Jackpot! Sugar, you’re the headliner tonight!'],
      dry: ['Honestly, this machine has no manners.', 'Not even a cherry. How rude.'],
    },
  },
  {
    id: 'pettibone',
    name: 'Mr. Pettibone',
    short: 'Pettibone',
    blurb: 'An insurance actuary who logs every pull in a notebook, and goes to three coins after ten losses because, by his figures, the machine is due.',
    style: 'due',
    pace: [5, 8],
    bankroll: 150,
    color: '#7f93b0',
    chattiness: 0.9,
    lines: {
      hello: ['Good evening. I’ve logged this row for three weeks. Something is due.', 'Don’t mind me. I’m keeping notes.'],
      goodbye: ['My figures were sound. My funds were not. Good evening.', 'I shall revise my tables. Good night.'],
      myWin: ['As my notes predicted. Roughly.', 'There. Due, and paid.'],
      yourWin: ['Hm. That was due on my machine, I suspect.', 'Noted. Most irregular.'],
      myJackpot: ['The jackpot! Twenty-one days of notes, vindicated!'],
      yourJackpot: ['A jackpot. I shall have to rethink everything.'],
      close: ['Close isn’t a pay, I’m afraid. Only the line counts.', 'Just off the line. The reels do that, you know.'],
      dry: ['Fifteen losses. By my figures, it’s very nearly due.', 'The pattern is clear. Well, nearly clear.'],
    },
  },
  {
    id: 'jim',
    name: 'Sailor Jim',
    short: 'Jim',
    blurb: 'On shore leave with three months’ pay, looking for the big one: three coins where there’s a jackpot meter, two anywhere else.',
    style: 'jackpot',
    pace: [3.5, 5.5],
    bankroll: 140,
    color: '#4f8fd0',
    chattiness: 1.2,
    lines: {
      hello: ['Ahoy! Shore leave, and three months’ pay burning a hole.', 'Evening, mate. Where’s the big one?'],
      goodbye: ['Shipping out. Fair winds, mate.', 'Back to the boat, flat broke. Same as last time.'],
      myWin: ['Anchors aweigh!', 'Pay up, you one-armed pirate!', '{win} caps! I’m buying the next round!'],
      yourWin: ['Ahoy, look at that!', 'Now that’s a haul, mate!'],
      myJackpot: ['Jackpot! I’m not going back to sea! Well, Tuesday.'],
      yourJackpot: ['Jackpot! Mate, you just bought the whole bar a drink.'],
      close: ['Blimey, nearly!'],
      dry: ['Becalmed, I tell ya. Not a breath of wind.'],
    },
  },
]

/** Two regulars for the night, for the machines either side of yours. */
export const pickRegulars = (rng: Rng): Regular[] => shuffle(REGULARS, rng).slice(0, 2)

/** Milliseconds until a regular's next pull. */
export const nextPullIn = (regular: Regular, rng: Rng) => (regular.pace[0] + rng() * (regular.pace[1] - regular.pace[0])) * 1000

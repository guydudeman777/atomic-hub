/**
 * Table talk: the regulars' remarks, and the house dealer's calls.
 *
 * After every step of a hand, `momentsOf` lists what just happened that's
 * worth a word (a bad beat, a bluff caught, you standing pat...).
 * `TableTalk` decides whether anyone says something about it, and who. Big
 * moments usually get a line and small ones rarely do; after a remark the
 * table stays quiet for a few steps; lines don't repeat until a regular has
 * used them all. Nobody gives away a hand they haven't shown.
 *
 * The dealer doesn't chat. `dealerCall` gives the calls a dealer makes at
 * every table: the ante, the draw, the cap and who takes the pot.
 *
 * Pure apart from the rng. Each regular's lines live in content.ts.
 */

import { type HandValue, describeValue, scoreOf, valueOf } from '../../core/poker'
import { type Rng, pick } from '../../core/rng'
import { type DrawEvent, type DrawState, MAX_BETS } from './engine'

/**
 * Something worth a remark, from the speaker's side: "my" is the regular
 * speaking, "your" the human player. Most notable first.
 */
export const MOMENTS = [
  'hello',
  'goodbye',
  /** Lost at the showdown holding two pair or better. */
  'myBadBeat',
  /** Bet after the draw on less than a pair, and got called. */
  'caughtBluffing',
  /** Won a big pot at the showdown. */
  'myBigPot',
  'yourBigPot',
  /** Bet after the draw on less than a pair, and everyone folded. They'll never tell. */
  'myBluff',
  /** A betting round went to the cap. */
  'capped',
  'yourPat',
  'yourFour',
] as const

export type Moment = (typeof MOMENTS)[number]

export interface Banter {
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /** A few lines for each moment they'd talk about; missing moments pass in silence. */
  lines: Partial<Record<Moment, readonly string[]>>
}

/** Moments a regular always speaks to: arriving and leaving. */
export type Scripted = 'hello' | 'goodbye'

/** Moments about one seat's own hand. The rest are about the table, and anyone may remark on them. */
const MINE = new Set<Moment>(['hello', 'goodbye', 'myBadBeat', 'caughtBluffing', 'myBigPot', 'myBluff'])

const CHANCE: Record<Moment, number> = {
  hello: 1,
  goodbye: 1,
  myBadBeat: 0.75,
  caughtBluffing: 0.6,
  myBigPot: 0.5,
  yourBigPot: 0.45,
  myBluff: 0.4,
  capped: 0.35,
  yourPat: 0.55,
  yourFour: 0.35,
}

/** Steps (cards, bets, draws) that must pass after a remark. Big moments wait less. */
const QUIET_AFTER_BIG = 2
const QUIET_AFTER_SMALL = 6
const BIG = new Set<Moment>(['myBadBeat', 'caughtBluffing', 'myBigPot', 'yourBigPot'])

/** A pot this many big bets or more is worth talking about. */
export const BIG_POT_BETS = 8

/** Two pair or better. */
const strong = (score: number) => score >> 20 >= 2
/** Less than a pair: nothing to bet on but nerve. */
const air = (score: number) => score >> 20 === 0

export interface Found {
  moment: Moment
  /** Whose hand it's about, for the "my" moments. */
  seat?: number
}

/** What happened in one step, most notable first. `you` is the human's seat. */
export function momentsOf(before: DrawState, events: readonly DrawEvent[], after: DrawState, you: number): Found[] {
  const found: Found[] = []
  const add = (moment: Moment, seat?: number) => found.push(seat === undefined ? { moment } : { moment, seat })
  const scores = new Map<number, number>()
  for (const e of events) {
    switch (e.type) {
      case 'drew':
        if (e.seat === you && e.discarded.length === 0) add('yourPat')
        if (e.seat === you && e.discarded.length === 4) add('yourFour')
        break
      case 'acted':
        if ((e.action === 'raise' || e.action === 'bet') && after.bets === MAX_BETS && before.bets === MAX_BETS - 1) add('capped')
        break
      case 'showdown':
        for (const h of e.hands) scores.set(h.seat, h.score)
        break
      case 'hand-over': {
        const pot = e.results.reduce((n, r) => n + r.committed, 0)
        const big = pot >= BIG_POT_BETS * after.stakes.big
        for (const r of e.results) {
          const seat = after.seats[r.seat]!
          const score = scores.get(r.seat)
          const betLate = seat.raised[1] > 0
          if (score !== undefined) {
            if (r.won === 0 && strong(score)) add('myBadBeat', r.seat)
            if (r.won === 0 && betLate && air(score)) add('caughtBluffing', r.seat)
            if (r.won > r.committed && big) add(r.seat === you ? 'yourBigPot' : 'myBigPot', r.seat === you ? undefined : r.seat)
          } else if (r.won > 0 && betLate && air(scoreOf(seat.cards))) {
            add('myBluff', r.seat)
          }
        }
        break
      }
    }
  }
  return found.filter((f) => f.seat !== you).sort((a, b) => MOMENTS.indexOf(a.moment) - MOMENTS.indexOf(b.moment))
}

/** A regular in a seat, as far as the conversation is concerned. */
export interface Talker {
  seat: number
  id: string
  banter: Banter
}

export interface Said {
  seat: number
  text: string
}

/** The regulars' side of the conversation, for one sitting. */
export class TableTalk {
  private readonly rng: Rng
  private readonly you: number
  private step = 0
  private lastStep = -Infinity
  private lastSpeaker: number | null = null
  private readonly used = new Map<string, Set<string>>()

  constructor(rng: Rng, you: number) {
    this.rng = rng
    this.you = you
  }

  /** A remark about the step that took `before` to `after`, or null if nobody speaks. */
  react(before: DrawState, events: readonly DrawEvent[], after: DrawState, talkers: readonly Talker[]): Said | null {
    this.step++
    for (const found of momentsOf(before, events, after, this.you)) {
      const candidates = talkers.filter((t) => t.banter.lines[found.moment]?.length && (MINE.has(found.moment) ? t.seat === found.seat : true))
      if (candidates.length === 0) continue
      const quiet = BIG.has(found.moment) ? QUIET_AFTER_BIG : QUIET_AFTER_SMALL
      if (this.step - this.lastStep < quiet) return null
      const fresh = candidates.length > 1 ? candidates.filter((t) => t.seat !== this.lastSpeaker) : candidates
      const speaker = this.weighted(fresh)
      if (this.rng() >= CHANCE[found.moment] * speaker.banter.chattiness) return null
      this.lastStep = this.step
      this.lastSpeaker = speaker.seat
      return { seat: speaker.seat, text: this.line(speaker, found.moment) }
    }
    return null
  }

  /** Something a regular always says: hello as they sit down, goodbye as they leave. */
  say(talker: Talker, moment: Scripted): string | null {
    if (!talker.banter.lines[moment]?.length) return null
    this.lastStep = this.step
    this.lastSpeaker = talker.seat
    return this.line(talker, moment)
  }

  private weighted(talkers: readonly Talker[]): Talker {
    const total = talkers.reduce((n, t) => n + t.banter.chattiness, 0)
    let r = this.rng() * total
    for (const t of talkers) {
      r -= t.banter.chattiness
      if (r < 0) return t
    }
    return talkers[talkers.length - 1]
  }

  private line(talker: Talker, moment: Moment): string {
    const lines = talker.banter.lines[moment] ?? []
    let used = this.used.get(talker.id)
    if (!used) this.used.set(talker.id, (used = new Set()))
    let fresh = lines.filter((l) => !used.has(l))
    if (fresh.length === 0) {
      for (const l of lines) used.delete(l)
      fresh = lines.slice()
    }
    const line = pick(fresh, this.rng)
    used.add(line)
    return line
  }
}

/** A hand as the dealer says it: “a pair of Jacks”, “two pair, Kings and Sevens”, “Ace high”. */
export function spoken(value: HandValue): string {
  const text = describeValue(value)
  if (value.category === 'high-card') return text
  const lower = text[0].toLowerCase() + text.slice(1)
  return ['two-pair', 'three-of-a-kind', 'four-of-a-kind'].includes(value.category) ? lower : `a ${lower}`
}

/**
 * What the house dealer calls out after a step, if anything. `you` is the
 * human's seat; `name` gives everyone else's name.
 */
export function dealerCall(before: DrawState, events: readonly DrawEvent[], after: DrawState, you: number, name: (seat: number) => string): string | null {
  let call: string | null = null
  const shown = new Map<number, number>()
  for (const e of events) {
    if (e.type === 'acted' && after.bets === MAX_BETS && before.bets === MAX_BETS - 1 && (e.action === 'raise' || e.action === 'bet')) call = 'That’s the cap.'
    else if (e.type === 'round-over' && e.round === 1 && after.phase === 'drawing') call = 'Pot’s right. Cards to the draw.'
    else if (e.type === 'showdown') for (const h of e.hands) shown.set(h.seat, h.score)
  }
  if (events.some((e) => e.type === 'hand-over') && after.payouts) {
    const main = after.payouts.filter((p) => p.pot === 0)
    const winner = main[0].seat
    if (shown.size === 0) call = winner === you ? 'Pot’s yours.' : `Pot to ${name(winner)}.`
    else if (main.length > 1) call = `Split pot. ${main.map((p) => (p.seat === you ? 'You' : name(p.seat))).join(' and ')} chop it up.`
    else call = `${winner === you ? 'You take' : `${name(winner)} takes`} it with ${spoken(valueOf(shown.get(winner)!))}.`
  }
  if (before.phase !== 'dealing' && after.phase === 'dealing') call = 'Ante up. Cards coming.'
  return call
}

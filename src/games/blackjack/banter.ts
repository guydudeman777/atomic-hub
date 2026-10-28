/**
 * Table talk: the regulars' remarks, and the dealer's calls.
 *
 * After every step of a round, `momentsOf` lists what just happened that's
 * worth a word (a blackjack, a dealer bust, you splitting tens...).
 * `TableTalk` decides whether anyone at the table says something about it,
 * and who. Big moments usually get a line and small ones rarely do; after a
 * remark the table stays quiet for a few steps; lines don't repeat until a
 * bot has used them all.
 *
 * The dealer doesn't chat. `dealerCall` gives the calls a dealer makes at
 * every table: insurance, the peek, the dealer's total.
 *
 * Pure apart from the rng. Each regular's lines live in content.ts.
 */

import type { Card } from '../../core/cards'
import { type Rng, pick } from '../../core/rng'
import { type TableEvent, type TableState, cardValue, handTotal, isBlackjack, upCard } from './engine'
import { trueCount, upValue } from './strategy'

/**
 * Something worth a remark, from the speaker's side: "my" is the bot
 * speaking, "your" the human player. Listed from most to least notable.
 */
export const MOMENTS = [
  'hello',
  'goodbye',
  /** Thrown out: security for slamming the table, or the pit boss for counting cards. */
  'kickedOut',
  /** Storming off after one loss too many. */
  'rageQuit',
  /** Slamming the table after a bad loss (tilt.ts decides when). */
  'mySlam',
  /** Swearing about one. */
  'myCurse',
  'dealerBlackjack',
  /** You hit a stiff against a weak dealer, and the card you took would have busted them. */
  'yourBustCard',
  'yourSplitTens',
  'myBlackjack',
  'yourBlackjack',
  'dealerBust',
  /** The dealer started on 12 to 16 and drew to 20 or 21. */
  'dealerDrewOut',
  'myDoubleWon',
  'yourDoubleWon',
  'myDoubleLost',
  /** The count is up: only a counter would notice. */
  'hotShoe',
  'shuffle',
  'myBust',
  'yourBust',
] as const

export type Moment = (typeof MOMENTS)[number]

export interface Banter {
  /** Scales how often they speak up (1 = average). */
  chattiness: number
  /** A few lines for each moment they'd talk about; missing moments pass in silence. */
  lines: Partial<Record<Moment, readonly string[]>>
}

/**
 * Moments a regular always speaks to when they happen: arriving, leaving,
 * and the scenes tilt.ts picks. The table talk never rolls for these.
 */
export type Scripted = 'hello' | 'goodbye' | 'kickedOut' | 'rageQuit' | 'mySlam' | 'myCurse'

/** Moments about one spot's hand. The rest are about the table, and anyone may remark on them. */
const MINE = new Set<Moment>(['hello', 'goodbye', 'kickedOut', 'rageQuit', 'mySlam', 'myCurse', 'myBlackjack', 'myDoubleWon', 'myDoubleLost', 'myBust'])

export interface Found {
  moment: Moment
  /** Whose hand it's about, for the "my" moments. */
  spot?: number
}

/** Chance of a remark, before chattiness. Scripted moments are never rolled for. */
const CHANCE: Record<Moment, number> = {
  hello: 1,
  goodbye: 1,
  kickedOut: 0,
  rageQuit: 0,
  mySlam: 0,
  myCurse: 0,
  dealerBlackjack: 0.6,
  yourBustCard: 0.75,
  yourSplitTens: 0.85,
  myBlackjack: 0.6,
  yourBlackjack: 0.5,
  dealerBust: 0.45,
  dealerDrewOut: 0.4,
  myDoubleWon: 0.45,
  yourDoubleWon: 0.4,
  myDoubleLost: 0.4,
  hotShoe: 0.5,
  shuffle: 0.3,
  myBust: 0.2,
  yourBust: 0.12,
}

/** Steps (deals, decisions, dealer cards) that must pass after a remark. Big moments wait less. */
const QUIET_AFTER_BIG = 2
const QUIET_AFTER_SMALL = 5
const BIG = new Set<Moment>(['dealerBlackjack', 'yourBustCard', 'yourSplitTens', 'myBlackjack', 'yourBlackjack'])

/** A hard 12 to 16: a hand that can bust with one card. */
const isStiff = (cards: readonly Card[]) => {
  const { total, soft } = handTotal(cards)
  return !soft && total >= 12 && total <= 16
}

/**
 * What happened in one step, most notable first. `you` is the human's spot;
 * `yourStiffHits` are the cards you drew this round hitting a stiff against
 * a 2 to 6.
 */
export function momentsOf(before: TableState, events: readonly TableEvent[], after: TableState, you: number, yourStiffHits: readonly Card[] = []): Found[] {
  const found: Found[] = []
  const add = (moment: Moment, spot?: number) => found.push(spot === undefined ? { moment } : { moment, spot })
  const whose = (spot: number, mine: Moment, yours: Moment) => (spot === you ? add(yours) : add(mine, spot))

  for (const e of events) {
    switch (e.type) {
      case 'shuffled':
        add('shuffle')
        break
      case 'dealt': {
        if (before.phase !== 'dealing' || e.to === 'dealer') break
        const hand = after.spots[e.to].hands[0]
        if (hand.cards.length === 2 && isBlackjack(hand)) whose(e.to, 'myBlackjack', 'yourBlackjack')
        break
      }
      case 'busted':
        whose(e.spot, 'myBust', 'yourBust')
        break
      case 'peeked':
        if (e.blackjack) add('dealerBlackjack')
        break
      case 'acted': {
        const cards = before.spots[e.spot].hands[e.hand].cards
        if (e.spot === you && e.action === 'split' && cardValue(cards[0]) === 10) add('yourSplitTens')
        break
      }
      case 'dealer-done': {
        if (e.busted) {
          add('dealerBust')
          break
        }
        const start = after.dealer.slice(0, 2)
        if (isStiff(start) && yourStiffHits.some((card) => handTotal([...start, card]).total > 21)) add('yourBustCard')
        if (isStiff(start) && e.total >= 20) add('dealerDrewOut')
        break
      }
      case 'settled':
        after.spots.forEach((spot, i) => {
          for (const hand of spot.hands) {
            if (!hand.doubled) continue
            if (hand.outcome === 'win') whose(i, 'myDoubleWon', 'yourDoubleWon')
            else if (i !== you && (hand.outcome === 'lose' || hand.outcome === 'bust')) add('myDoubleLost', i)
          }
        })
        break
    }
  }
  // A new round on a hot shoe. (A fresh shoe starts the count over.)
  if (before.phase !== 'dealing' && after.phase === 'dealing' && !events.some((e) => e.type === 'shuffled') && trueCount(before) >= 3) {
    add('hotShoe')
  }
  return found.sort((a, b) => MOMENTS.indexOf(a.moment) - MOMENTS.indexOf(b.moment))
}

/** A regular in a seat, as far as the conversation is concerned. */
export interface Talker {
  spot: number
  id: string
  banter: Banter
}

export interface Said {
  spot: number
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
  /** Cards you drew this round hitting a stiff against a 2–6. */
  private stiffHits: Card[] = []

  constructor(rng: Rng, you: number) {
    this.rng = rng
    this.you = you
  }

  /** A remark about the step that took `before` to `after`, or null if nobody speaks. */
  react(before: TableState, events: readonly TableEvent[], after: TableState, talkers: readonly Talker[]): Said | null {
    this.step++
    this.trackStiffHits(before, events, after)
    for (const found of momentsOf(before, events, after, this.you, this.stiffHits)) {
      const candidates = talkers.filter(
        (t) => t.banter.lines[found.moment]?.length && (MINE.has(found.moment) ? t.spot === found.spot : true),
      )
      if (candidates.length === 0) continue
      const quiet = BIG.has(found.moment) ? QUIET_AFTER_BIG : QUIET_AFTER_SMALL
      if (this.step - this.lastStep < quiet) return null
      // Table moments go to whoever didn't speak last, when there's a choice.
      const fresh = candidates.length > 1 ? candidates.filter((t) => t.spot !== this.lastSpeaker) : candidates
      const speaker = this.weighted(fresh)
      if (this.rng() >= CHANCE[found.moment] * speaker.banter.chattiness) return null
      this.lastStep = this.step
      this.lastSpeaker = speaker.spot
      return { spot: speaker.spot, text: this.line(speaker, found.moment) }
    }
    return null
  }

  /** Something a regular always says: hello as they sit down, goodbye as they leave, or a scene's line. */
  say(talker: Talker, moment: Scripted): string | null {
    if (!talker.banter.lines[moment]?.length) return null
    this.lastStep = this.step
    this.lastSpeaker = talker.spot
    return this.line(talker, moment)
  }

  private trackStiffHits(before: TableState, events: readonly TableEvent[], after: TableState) {
    if (after.round !== before.round) this.stiffHits = []
    const up = upCard(before)
    const hit = events.find((e) => e.type === 'acted' && e.spot === this.you && e.action === 'hit')
    if (!hit || hit.type !== 'acted' || !up || upValue(up) > 6) return
    if (!isStiff(before.spots[hit.spot].hands[hit.hand].cards)) return
    const drawn = events.find((e) => e.type === 'dealt' && e.to === hit.spot)
    if (drawn?.type === 'dealt') this.stiffHits.push(drawn.card)
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

/**
 * What the dealer calls out after a step, if anything. The calls are the
 * same at every table; `you` is the human's spot.
 */
export function dealerCall(before: TableState, events: readonly TableEvent[], after: TableState, you: number): string | null {
  let call: string | null = null
  for (const e of events) {
    if (e.type === 'shuffled') call = 'Fresh shoe. Shuffling up.'
    else if (e.type === 'dealt' && e.to === you && before.phase === 'dealing' && isBlackjack(after.spots[you].hands[0])) call = 'Blackjack!'
    else if (e.type === 'peeked') call = e.blackjack ? 'Dealer has blackjack.' : 'Nothing underneath. Play on.'
    else if (e.type === 'dealer-done') call = e.busted ? `Too many. Dealer busts with ${e.total}.` : `Dealer has ${e.total}.`
  }
  if (before.phase === 'dealing' && after.phase === 'insurance') call = 'Insurance? Pays two to one.'
  return call
}

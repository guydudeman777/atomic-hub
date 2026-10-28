/**
 * The table you're sitting at: the hand in play, who's in each chair, and
 * caps moving between your wallet and the pot. Not persisted.
 *
 * Your caps are your stack: antes and bets come out of your wallet as you
 * make them, and a pot you win goes straight back in. So getting up, or
 * closing the tab, only ever loses what's already in the pot.
 *
 * Online, friends sit in other chairs and every browser runs this same
 * session from the host's seed (see Blackjack's session.ts, which works the
 * same way). Players' bets and draws arrive as numbered inputs and wait in
 * `queue` until it's that player's turn; a hand is dealt once every player
 * has asked to be dealt in, with their caps as their stack. Each browser
 * holds every hand, and only shows you yours.
 */

import { create } from 'zustand'
import { type Card, cardLabel } from '../../../core/cards'
import { crowdReaction } from '../../../core/audio/live'
import { playSfx } from '../../../core/audio/sfx'
import { evaluate, valueOf } from '../../../core/poker'
import { createRng, pick, randomSeed } from '../../../core/rng'
import { useSave } from '../../../store/save'
import { botAction, warmPools } from '../ai'
import { BIG_POT_BETS, type Scripted, TableTalk, type Talker, dealerCall, spoken } from '../banter'
import { type Entry, isSys } from '../../../net/link'
import { REGULARS, type Regular, type Table, YOUR_SEAT, seatRegulars, tableById } from '../content'
import {
  type Action,
  type BetAction,
  type DrawEvent,
  type DrawState,
  MAX_SEATS,
  actor,
  apply,
  betweenHands,
  createTable,
  isLegal,
  isLive,
  seatAt,
} from '../engine'
import { bookDraw } from '../strategy'
import { seatAngle } from './layout'

export interface SitConfig {
  /** Regulars at the table with you, 1 to 5. Online, 0 to 4, beside the players. */
  opponents: number
  tableId: string
  /** Online: the shared seed, your chair, and the players by chair. */
  online?: { seed: number; me: number; humans: (Human | null)[] }
}

/** A player at an online table, you included. */
export interface Human {
  /** Their seat at the table link, which is also their chair. */
  seat: number
  name: string
  /** Their line dropped or they got up: they fold (or check) and stand pat, and their chair clears before the next deal. */
  gone: boolean
}

/** Where in the game an input was made: a decision counts only at that moment. */
export interface Moment {
  hand: number
  phase: DrawState['phase']
  round: 1 | 2
  bets: number
  toCall: number
}

export type Input =
  /** Deal me in, with my caps as my stack. A stack under the ante sits the hand out. */
  | { type: 'in'; hand: number; stack: number }
  | { type: 'bet'; at: Moment; action: BetAction }
  | { type: 'draw'; at: Moment; discards: string[] }
  /** Host: deal without whoever hasn't asked in. */
  | { type: 'deal-now'; hand: number }

export const momentOf = (state: DrawState): Moment => ({ hand: state.hand, phase: state.phase, round: state.round, bets: state.bets, toCall: state.toCall })

const sameMoment = (a: Moment, b: Moment) => a.hand === b.hand && a.phase === b.phase && a.round === b.round && a.bets === b.bets && a.toCall === b.toCall

export interface Occupant {
  regular: Regular
  /** Out of caps: they get up before the next deal. */
  leaving: boolean
}

export interface LogEntry {
  id: number
  /** About your hand, so it stands out. */
  mine: boolean
  text: string
}

/** Something said at the table: by a regular in a chair, or by the dealer. */
export interface Remark {
  id: number
  seat: number | 'dealer'
  text: string
  /** Milliseconds to wait before showing it, so the cards and chips land first. */
  delay: number
}

/** Chips on the move: a round's bets swept into the pot, or a pot pushed to a winner. */
export interface Flight {
  id: number
  amount: number
  from: number | 'pot'
  to: number | 'pot'
  /** Milliseconds before they set off. */
  delay: number
}

/** Cards thrown away in a draw, on their way to the muck from where they were. */
export interface Toss {
  id: number
  seat: number
  cards: { card: Card; slot: number }[]
}

/** The latest move at each seat this round, shown by their plate. */
export interface Move {
  id: number
  text: string
  tone?: 'bet' | 'fold'
}

/** Your result for the hand just played. */
export interface HandResult {
  committed: number
  won: number
}

interface SessionStore {
  /** Increments every time you sit down, so the table remounts. */
  sitting: number
  config: SitConfig | null
  table: Table | null
  state: DrawState | null
  /** Your chair: the one at the foot of the table, as you see it. */
  me: number
  /** Online: the players, by chair, you included. */
  humans: (Human | null)[]
  /** Online: each player's stack for the next deal, once they've asked to be dealt in. */
  ready: (number | null)[]
  /** Online: chairs the regulars may sit in. */
  regularChairs: boolean[]
  /** Online: inputs that arrived before the table was ready for them. */
  queue: Entry[]
  /** Who's in each chair. Players' chairs, yours included, are null; so are empty chairs. */
  seats: (Occupant | null)[]
  /** For each empty chair, the hands left before someone new sits down. */
  waits: number[]
  log: LogEntry[]
  /** The regulars' latest remark. */
  talk: Remark | null
  /** The dealer's latest call. */
  call: Remark | null
  result: HandResult | null
  flights: Flight[]
  tosses: Toss[]
  moves: (Move | null)[]
  /** Card ids you've picked to throw away. */
  marked: string[]
  sit: (config: SitConfig) => boolean
  /** The next hand. */
  deal: () => boolean
  bet: (action: BetAction) => void
  /** Pick a card to throw away, or put it back. */
  mark: (cardId: string) => void
  /** Pick just these cards to throw away. */
  markOnly: (cardIds: readonly string[]) => void
  draw: () => void
  /** The dealer's or a regular's next move. Does nothing while it's a player's turn. */
  step: () => void
  /** Online: play waiting inputs the table is ready for, calling `after` as each one is played. */
  pump: (after?: (entry: Entry) => void) => void
  /** Online: play everything waiting at once, the dealer and the regulars included, without a sound. */
  catchUp: (after?: (entry: Entry) => void) => void
  receive: (entries: Entry[]) => void
  /** Get up. Anything already in the pot is lost. */
  leave: () => void
}

let logId = 0
let remarkId = 0
let fxId = 0
let talk: TableTalk | null = null
/** The table's shared randomness: who sits down, and how the regulars play. Seeded by the host online. */
let rng = createRng(randomSeed())
/** Catching up on an online table's past: played through quietly, without touching your caps or record. */
let quiet = false

const REMARK_DELAY_MS = 500
const HELLO_DELAY_MS = 900
/** Bets wait for the last chips to land before they're swept to the pot; pots wait for that. */
const SWEEP_DELAY_MS = 450
const PUSH_DELAY_MS = 900

const caps = () => useSave.getState().wallet.caps

/** Stereo position of each chair as you see the table, by its angle round it. `me` sits at the foot. */
export const panAt = (seat: number, n: number, me = YOUR_SEAT): number => -Math.sin((seatAngle((seat - me + n) % n, n) * Math.PI) / 180) * 0.6

const COUNT = ['none', 'one', 'two', 'three', 'four']

/** A regular taking a seat with a fresh buy-in. */
const seatRegular = (regular: Regular): Occupant => ({ regular, leaving: false })

const buyIn = (regular: Regular, table: Table) => regular.bankroll * table.stakes.big

/** Hands an empty chair waits before someone new sits down. */
const vacancy = () => 1 + Math.floor(rng() * 3)

/** "Ann", "Ann and Bo", "Ann, Bo and Cy". */
export const listNames = (names: string[]): string => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

const talkers = (seats: (Occupant | null)[]): Talker[] => seats.flatMap((o, seat) => (o ? [{ seat, id: o.regular.id, banter: o.regular.banter }] : []))

/** What's in the pot from you this hand, while it's being played. */
export function yourStake(state: DrawState | null, me = YOUR_SEAT): number {
  if (!state || betweenHands(state)) return 0
  const you = state.seats[me]
  return you?.inHand ? you.committed : 0
}

/** Plain-language log lines for one step. */
function describe(before: DrawState, events: DrawEvent[], after: DrawState, name: (seat: number) => string, me: number): LogEntry[] {
  const YOUR_SEAT = me
  const lines: LogEntry[] = []
  const add = (text: string, mine = false) => lines.push({ id: ++logId, mine, text })
  const you = (seat: number) => seat === YOUR_SEAT
  for (const e of events) {
    switch (e.type) {
      case 'button':
        add(`Hand ${after.hand}. ${you(e.seat) ? 'You have' : `${name(e.seat)} has`} the button. Everyone antes ${after.stakes.ante}.`)
        break
      case 'acted': {
        const verb = (yours: string, theirs: string) => (you(e.seat) ? yours : theirs)
        const who = name(e.seat)
        const allIn = e.allIn ? `, and ${verb('you’re', 'is')} all in` : ''
        if (e.action === 'fold') add(`${who} ${verb('fold', 'folds')}.`, you(e.seat))
        else if (e.action === 'check') add(`${who} ${verb('check', 'checks')}.`, you(e.seat))
        else if (e.action === 'call') add(`${who} ${verb('call', 'calls')} ${e.amount}${allIn}.`, you(e.seat))
        else if (e.action === 'bet') add(`${who} ${verb('bet', 'bets')} ${e.to}${allIn}.`, you(e.seat))
        else add(`${who} ${verb('raise', 'raises')} to ${e.to}${allIn}.`, you(e.seat))
        break
      }
      case 'drew':
        if (you(e.seat)) {
          add(e.drawn.length ? `You draw ${COUNT[e.drawn.length]}: ${e.drawn.map(cardLabel).join(' ')}.` : 'You stand pat.', true)
        } else add(e.drawn.length ? `${name(e.seat)} draws ${COUNT[e.drawn.length]}.` : `${name(e.seat)} stands pat.`)
        break
      case 'showdown':
        for (const h of e.hands) add(`${name(h.seat)} ${you(h.seat) ? 'show' : 'shows'} ${spoken(valueOf(h.score))}.`, you(h.seat))
        break
      case 'won': {
        const side = e.pot > 0 ? ' from the side pot' : ''
        add(`${name(e.seat)} ${you(e.seat) ? 'win' : 'wins'} ${e.amount}${side}.`, you(e.seat))
        break
      }
    }
  }
  // The deal is done: what you've got.
  if (before.phase === 'dealing' && after.phase !== 'dealing' && after.seats[YOUR_SEAT]?.inHand) {
    const cards = after.seats[YOUR_SEAT]!.cards
    add(`You’re dealt ${cards.map(cardLabel).join(' ')}: ${spoken(evaluate(cards))}.`, true)
  }
  return lines
}

function playStepSounds(events: DrawEvent[], n: number, me: number) {
  const panOf = (seat: number, n: number) => panAt(seat, n, me)
  let chips = 0
  for (const e of events) {
    if (e.type === 'dealt') playSfx('deal', { pan: panOf(e.seat, n) * 0.7 })
    else if (e.type === 'anted') playSfx('chip', { pan: panOf(e.seat, n) * 0.6, delay: 0.04 * chips++ })
    else if (e.type === 'acted' && e.amount > 0) playSfx('chip', { pan: panOf(e.seat, n) * 0.6 })
    else if (e.type === 'acted' && e.action === 'fold') playSfx('discard', { pan: panOf(e.seat, n) * 0.6 })
    else if (e.type === 'acted' && e.action === 'check') playSfx('tick', { pan: panOf(e.seat, n) * 0.6 })
    else if (e.type === 'drew') {
      if (e.discarded.length) playSfx('discard', { pan: panOf(e.seat, n) * 0.6 })
      e.drawn.forEach((_, i) => playSfx('draw', { pan: panOf(e.seat, n) * 0.6, delay: 0.25 + i * 0.1 }))
    } else if (e.type === 'round-over') playSfx('chips', { delay: SWEEP_DELAY_MS / 1000 })
    else if (e.type === 'showdown') e.hands.forEach((_, i) => playSfx('flip', { delay: i * 0.12 }))
  }
}

export const useSession = create<SessionStore>()((set, get) => {
  /** Who's who, for the log and the dealer. */
  const nameOf = (seat: number) => (seat === get().me ? 'You' : (get().seats[seat]?.regular.name ?? get().humans[seat]?.name ?? 'Someone'))

  /** Apply one action and everything that follows from it: caps, sounds, the log, the talk. */
  const run = (action: Action) => {
    const { state, seats, table, log, talk: lastTalk, call: lastCall, moves, me } = get()
    if (!state || !table || !isLegal(state, action)) return
    const { state: next, events } = apply(state, action)
    const n = state.seats.length
    const save = useSave.getState()
    const wallet = (amount: number) => !quiet && save.adjustCaps(amount)

    let result = get().result
    let nextSeats = seats
    let nextMoves = moves
    const flights: Flight[] = []
    const tosses: Toss[] = []
    const leaving: number[] = []
    for (const e of events) {
      switch (e.type) {
        case 'button':
          nextMoves = nextMoves.map(() => null)
          result = null
          break
        case 'anted':
          if (e.seat === me) wallet(-e.amount)
          flights.push({ id: ++fxId, amount: e.amount, from: e.seat, to: 'pot', delay: 0 })
          break
        case 'acted': {
          if (e.seat === me && e.amount > 0) wallet(-e.amount)
          const text = { fold: 'Fold', check: 'Check', call: 'Call', bet: `Bet ${e.to}`, raise: `Raise to ${e.to}` }[e.action]
          const tone = e.action === 'fold' ? 'fold' : e.action === 'bet' || e.action === 'raise' ? 'bet' : undefined
          nextMoves = nextMoves.map((m, i) => (i === e.seat ? { id: ++fxId, text: e.allIn ? `${text}, all in` : text, tone } : m))
          break
        }
        case 'round-over':
          // Everyone's bets for the round slide into the pot.
          state.seats.forEach((s, seat) => {
            const amount = s?.roundBet ?? 0
            const final = events.find((x) => x.type === 'acted' && x.seat === seat)
            const total = amount + (final?.type === 'acted' ? final.amount : 0)
            if (total > 0) flights.push({ id: ++fxId, amount: total, from: seat, to: 'pot', delay: SWEEP_DELAY_MS })
          })
          nextMoves = nextMoves.map((m) => (m?.tone === 'fold' ? m : null))
          break
        case 'drew': {
          const before = state.seats[e.seat]!.cards
          tosses.push({ id: ++fxId, seat: e.seat, cards: e.discarded.map((card) => ({ card, slot: before.indexOf(card) })) })
          break
        }
        case 'won':
          if (e.seat === me) wallet(e.amount)
          flights.push({ id: ++fxId, amount: e.amount, from: 'pot', to: e.seat, delay: PUSH_DELAY_MS })
          break
        case 'hand-over': {
          for (const r of e.results) {
            if (r.seat === me) {
              result = { committed: r.committed, won: r.won }
              const net = r.won - r.committed
              if (!quiet) save.recordResult('draw', net > 0 ? 'win' : net < 0 ? 'loss' : 'draw', net)
            } else if (next.seats[r.seat]!.stack === 0 && nextSeats[r.seat]) {
              leaving.push(r.seat)
            }
          }
          nextSeats = nextSeats.map((o, seat) => (o && leaving.includes(seat) ? { ...o, leaving: true } : o))
          break
        }
      }
    }

    if (!quiet) playStepSounds(events, n, me)
    // The room reacts to the pots you win and lose big.
    if (result && result !== get().result && !quiet) {
      const net = result.won - result.committed
      const big = result.won >= BIG_POT_BETS * table.stakes.big || result.committed >= (BIG_POT_BETS / 2) * table.stakes.big
      window.setTimeout(() => {
        if (net > 0) playSfx(big ? 'win' : 'chips')
        if (big && net > 0) crowdReaction('cheer')
        else if (big && net < 0) crowdReaction('groan')
      }, PUSH_DELAY_MS)
    }

    // Hints: say so when your draw isn't the book's.
    const lines = describe(state, events, next, nameOf, me)
    const yourDraw = events.find((e) => e.type === 'drew' && e.seat === me)
    if (yourDraw?.type === 'drew' && save.draw.hints && !quiet) {
      const book = bookDraw(state.seats[me]!.cards)
      const same = book.discard.length === yourDraw.discarded.length && book.discard.every((c) => yourDraw.discarded.includes(c))
      if (!same) lines.push({ id: ++logId, mine: true, text: `Hint: the book draws differently. ${book.reason}` })
    }

    const said = talk?.react(state, events, next, talkers(nextSeats))
    let remark: Remark | null = said ? { id: ++remarkId, seat: said.seat, text: said.text, delay: REMARK_DELAY_MS } : lastTalk
    for (const seat of leaving) {
      const o = nextSeats[seat]!
      const bye = talk?.say({ seat, id: o.regular.id, banter: o.regular.banter }, 'goodbye')
      if (bye) remark = { id: ++remarkId, seat, text: bye, delay: PUSH_DELAY_MS + 600 }
    }
    const callText = dealerCall(state, events, next, me, nameOf)
    const call = callText ? { id: ++remarkId, seat: 'dealer' as const, text: callText, delay: events.some((e) => e.type === 'won') ? PUSH_DELAY_MS : 250 } : lastCall

    set({
      state: next,
      seats: nextSeats,
      moves: nextMoves,
      log: [...log, ...lines, ...leaving.map((seat) => ({ id: ++logId, mine: false, text: `${nameOf(seat)} is out of caps and gets up.` }))].slice(-150),
      talk: remark,
      call,
      result,
      flights: flights.length ? flights : get().flights,
      tosses: tosses.length ? tosses : events.some((e) => e.type === 'button') ? [] : get().tosses,
      marked: next.phase === 'drawing' && next.turn === me ? get().marked : [],
    })
  }

  const say = (seat: number, o: Occupant, moment: Scripted) => talk?.say({ seat, id: o.regular.id, banter: o.regular.banter }, moment) ?? null

  /**
   * Deal the next hand. `stacks` are the players' stacks by chair (yours is
   * your caps). Whoever's broke gets up, and their chair stays empty a hand
   * or three; then someone new may sit down.
   */
  const dealHand = (stacks: (number | null)[]) => {
    const { state, table, seats, me, config, regularChairs } = get()
    if (!state || !table) return false
    const online = !!config?.online
    // Players who've gone get up; their chairs are open again.
    const humans = get().humans.map((h) => (h?.gone ? null : h))
    const player = (seat: number) => (online ? !!humans[seat] : seat === me)
    const regularChair = (seat: number) => (online ? regularChairs[seat] && !humans[seat] : seat !== me)

    // A regular in a chair a player has taken gets up too.
    const waits = get().waits.map((w, seat) => (seats[seat] === null && regularChair(seat) ? Math.max(0, w - 1) : w))
    let nextSeats = seats.map((o, seat) => {
      if (!o || (!o.leaving && !player(seat))) return o
      waits[seat] = vacancy()
      return null
    })
    let next = state
    nextSeats.forEach((o, seat) => {
      if (!o && seats[seat] && !player(seat)) next = seatAt(next, seat, null)
    })
    const empty = nextSeats.flatMap((o, seat) => (regularChair(seat) && !o ? [seat] : []))
    const ready = empty.filter((seat) => waits[seat] === 0)
    // Never deal anyone in alone: if nobody else is left, someone sits down at once.
    const dealtIn = nextSeats.filter(Boolean).length + stacks.filter((stack, seat) => player(seat) && (stack ?? 0) >= table.stakes.ante).length
    const anywhere = nextSeats.flatMap((o, seat) => (!o && !player(seat) ? [seat] : []))
    const arrivals: number[] = []
    for (const seat of dealtIn < 2 ? (empty.length ? empty : anywhere).slice(0, 1) : ready) {
      const here = new Set(nextSeats.flatMap((o) => (o ? [o.regular.id] : [])))
      const free = REGULARS.filter((r) => !here.has(r.id))
      if (!free.length) break
      const regular = pick(free, rng)
      nextSeats = nextSeats.map((o, i) => (i === seat ? seatRegular(regular) : o))
      next = seatAt(next, seat, buyIn(regular, table))
      waits[seat] = 0
      arrivals.push(seat)
    }

    // A player's caps are their stack; an empty chair has none.
    stacks.forEach((stack, seat) => {
      if (player(seat)) next = seatAt(next, seat, Math.max(0, Math.floor(stack ?? 0)))
      else if (!nextSeats[seat]) next = seatAt(next, seat, null)
    })
    set({
      state: next,
      seats: nextSeats,
      waits,
      humans: online ? humans : get().humans,
      ready: get().ready.map(() => null),
      regularChairs: online ? regularChairs.map((r, seat) => r && !humans[seat]) : regularChairs,
      flights: [],
      tosses: [],
    })
    run({ type: 'deal' })
    for (const seat of arrivals) {
      const o = nextSeats[seat]!
      const hello = say(seat, o, 'hello')
      set((s) => ({
        log: [...s.log, { id: ++logId, mine: false, text: `${o.regular.name} sits down.` }],
        talk: hello ? { id: ++remarkId, seat, text: hello, delay: 300 } : s.talk,
      }))
    }
    return true
  }

  /** Online: deal once every player still here has asked in. */
  const dealIfReady = (force = false) => {
    const { ready, humans, state } = get()
    if (!state || !betweenHands(state)) return
    const players = humans.flatMap((h, seat) => (h && !h.gone ? [seat] : []))
    if (!force && players.some((seat) => ready[seat] === null)) return
    dealHand(ready)
  }

  /** Whether the table's ready for this input: now, not yet, or never (the rules wouldn't take it). */
  const readiness = (entry: Entry): 'now' | 'wait' | 'drop' => {
    const { state } = get()
    if (!state) return 'wait'
    if (isSys(entry.input)) return 'now'
    const input = entry.input as Input
    const seat = entry.seat
    switch (input.type) {
      case 'in':
      case 'deal-now':
        if (state.hand > input.hand) return 'drop'
        return state.hand === input.hand && betweenHands(state) ? 'now' : 'wait'
      case 'bet':
      case 'draw': {
        if (state.hand > input.at.hand) return 'drop'
        if (state.turn !== seat || !sameMoment(momentOf(state), input.at)) return 'wait'
        return 'now'
      }
    }
  }

  /** Play one input. Anything the rules don't allow is dropped, the same at every table. */
  const play = (entry: Entry) => {
    const { state } = get()
    if (!state) return
    const seat = entry.seat
    if (isSys(entry.input)) {
      if (entry.input.sys === 'join') {
        const human: Human = { seat, name: entry.input.name, gone: false }
        set((s) => ({
          humans: s.humans.map((h, i) => (i === seat ? human : h)),
          log: seat === s.me ? s.log : [...s.log, { id: ++logId, mine: false, text: `${human.name} pulls up a chair.` }],
        }))
      } else {
        const gone = get().humans[seat]
        if (!gone) return
        set((s) => ({
          humans: s.humans.map((h, i) => (i === seat && h ? { ...h, gone: true } : h)),
          ready: s.ready.map((r, i) => (i === seat ? null : r)),
          log: [...s.log, { id: ++logId, mine: false, text: `${gone.name} gets up from the table.` }],
        }))
        dealIfReady()
      }
      return
    }
    const input = entry.input as Input
    switch (input.type) {
      case 'in':
        set((s) => ({ ready: s.ready.map((r, i) => (i === seat ? Math.max(0, Math.floor(input.stack)) : r)) }))
        dealIfReady()
        break
      case 'deal-now':
        if (seat === 0) dealIfReady(true)
        break
      case 'bet':
        run({ type: input.action })
        break
      case 'draw':
        run({ type: 'draw', discards: input.discards })
        break
    }
  }

  return {
    sitting: 0,
    config: null,
    table: null,
    state: null,
    me: YOUR_SEAT,
    humans: [],
    ready: [],
    regularChairs: [],
    queue: [],
    seats: [],
    waits: [],
    log: [],
    talk: null,
    call: null,
    result: null,
    flights: [],
    tosses: [],
    moves: [],
    marked: [],

    sit: (config) => {
      const table = tableById(config.tableId)
      const online = config.online
      if (!online && caps() < table.minCaps) return false
      warmPools()
      rng = createRng(online?.seed ?? randomSeed())
      const me = online?.me ?? YOUR_SEAT
      let seats: (Occupant | null)[]
      let humans: (Human | null)[]
      let regularChairs: boolean[]
      let opponents: number
      if (online) {
        // Six chairs: the players in theirs, and the regulars from the far end.
        humans = online.humans.slice(0, MAX_SEATS)
        while (humans.length < MAX_SEATS) humans.push(null)
        const free = humans.flatMap((h, seat) => (h ? [] : [seat])).reverse()
        opponents = Math.max(0, Math.min(free.length, config.opponents))
        const regulars = seatRegulars(rng, opponents)
        seats = humans.map(() => null)
        free.slice(0, opponents).forEach((seat, k) => (seats[seat] = seatRegular(regulars[k])))
        regularChairs = seats.map(Boolean)
      } else {
        opponents = Math.max(1, Math.min(5, config.opponents))
        const regulars = seatRegulars(rng, opponents)
        seats = [null, ...regulars.map(seatRegular)]
        humans = seats.map(() => null)
        regularChairs = seats.map((_, seat) => seat !== me)
      }
      const stacks = seats.map((o, seat) => (o ? buyIn(o.regular, table) : !online && seat === me ? caps() : null))
      // The button starts anywhere; the first hand moves it on one.
      const state = createTable({ stakes: table.stakes, stacks, seed: online ? (online.seed ^ 0x2c1b3c6d) >>> 0 : randomSeed(), button: Math.floor(rng() * seats.length) })
      talk = new TableTalk(createRng(randomSeed()), me)
      const greeters = talkers(seats)
      const hello = greeters.length ? pick(greeters, rng) : null
      const helloText = hello ? say(hello.seat, seats[hello.seat]!, 'hello') : null
      const others = humans.flatMap((h, seat) => (h && seat !== me ? [h.name] : []))
      set((s) => ({
        sitting: s.sitting + 1,
        config: { ...config, opponents },
        table,
        state,
        me,
        humans,
        ready: seats.map(() => null),
        regularChairs,
        queue: [],
        seats,
        waits: seats.map(() => 0),
        log: [
          {
            id: ++logId,
            mine: false,
            text: `You sit down at ${table.name.toLowerCase().startsWith('the') ? table.name.toLowerCase() : `the ${table.name.toLowerCase()} table`}${others.length ? ` with ${listNames(others)}` : ''}. ${table.dealer.name} is dealing.`,
          },
        ],
        talk: hello && helloText ? { id: ++remarkId, seat: hello.seat, text: helloText, delay: HELLO_DELAY_MS + 1600 } : null,
        call: { id: ++remarkId, seat: 'dealer', text: pick(table.dealer.hello, rng), delay: HELLO_DELAY_MS },
        result: null,
        flights: [],
        tosses: [],
        moves: seats.map(() => null),
        marked: [],
      }))
      return true
    },

    deal: () => {
      const { state, table, me, seats } = get()
      if (!state || !table || !betweenHands(state)) return false
      if (caps() < table.stakes.ante) {
        playSfx('error')
        return false
      }
      return dealHand(seats.map((_, seat) => (seat === me ? caps() : null)))
    },

    bet: (action) => {
      const { state, me } = get()
      if (!state || state.phase !== 'betting' || state.turn !== me) return
      if (!isLegal(state, { type: action })) {
        playSfx('error')
        return
      }
      run({ type: action })
    },

    mark: (cardId) => {
      const { state, marked, me } = get()
      if (!state || state.phase !== 'drawing' || state.turn !== me) return
      const cards = state.seats[me]!.cards
      const next = marked.includes(cardId) ? marked.filter((id) => id !== cardId) : [...marked, cardId]
      // Four only when the card you keep is an Ace; never all five.
      const kept = cards.filter((c) => !next.includes(c.id))
      if (next.length > 4 || (next.length === 4 && kept[0]?.rank !== 'A')) {
        playSfx('error')
        return
      }
      playSfx('pick')
      set({ marked: next })
    },

    markOnly: (cardIds) => {
      const { state, me } = get()
      if (!state || state.phase !== 'drawing' || state.turn !== me) return
      playSfx('pick')
      set({ marked: cardIds.slice() })
    },

    draw: () => {
      const { state, marked, me } = get()
      if (!state || state.phase !== 'drawing' || state.turn !== me) return
      const action: Action = { type: 'draw', discards: marked }
      if (!isLegal(state, action)) {
        playSfx('error')
        return
      }
      run(action)
    },

    step: () => {
      const { state, seats, humans } = get()
      if (!state) return
      const who = actor(state)
      if (who === 'dealer') run({ type: 'next' })
      else if (who !== null) {
        const o = seats[who]
        if (o) run(botAction(state, who, o.regular.style, rng))
        // A player who's gone checks when they can, folds when they can't, and stands pat.
        else if (humans[who]?.gone) run(state.phase === 'drawing' ? { type: 'draw', discards: [] } : { type: isLegal(state, { type: 'check' }) ? 'check' : 'fold' })
      }
    },

    pump: (after) => {
      for (;;) {
        const [entry, ...rest] = get().queue
        if (!entry) break
        const when = readiness(entry)
        if (when === 'wait') break
        set({ queue: rest })
        if (when === 'now') play(entry)
        after?.(entry)
      }
    },

    catchUp: (after) => {
      quiet = true
      try {
        for (let guard = 0; guard < 100_000; guard++) {
          get().pump(after)
          const { state, queue, seats, humans } = get()
          if (!state || !queue.length) break
          // The table moves on by itself while it's the dealer's, a regular's or a departed player's turn.
          const who = actor(state)
          if (who === null || (who !== 'dealer' && !seats[who] && !humans[who]?.gone)) break
          get().step()
        }
      } finally {
        quiet = false
      }
    },

    receive: (entries) => set((s) => ({ queue: [...s.queue, ...entries] })),

    leave: () => {
      const staked = yourStake(get().state, get().me)
      if (staked > 0) useSave.getState().recordResult('draw', 'loss', -staked)
      talk = null
      set({ config: null, table: null, state: null, seats: [], waits: [], log: [], talk: null, call: null, result: null, flights: [], tosses: [], moves: [], marked: [], me: YOUR_SEAT, humans: [], ready: [], regularChairs: [], queue: [] })
    },
  }
})

/** Whether you're still in the hand being played. */
export const youreIn = (state: DrawState | null, me = YOUR_SEAT): boolean => !!state && !betweenHands(state) && isLive(state.seats[me])

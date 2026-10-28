/**
 * The table you're sitting at: the hand in play, who's in each chair, and
 * caps moving between your wallet and the pot. Not persisted.
 *
 * Your caps are your stack: antes and bets come out of your wallet as you
 * make them, and a pot you win goes straight back in. So getting up, or
 * closing the tab, only ever loses what's already in the pot.
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
import { REGULARS, type Regular, type Table, YOUR_SEAT, seatRegulars, tableById } from '../content'
import {
  type Action,
  type BetAction,
  type DrawEvent,
  type DrawState,
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
  /** Regulars at the table with you, 1 to 5. */
  opponents: number
  tableId: string
}

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
  /** Who's in each chair. Yours is always null; so are empty chairs. */
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
  /** The dealer's or a regular's next move. Does nothing while it's your turn. */
  step: () => void
  /** Get up. Anything already in the pot is lost. */
  leave: () => void
}

let logId = 0
let remarkId = 0
let fxId = 0
let talk: TableTalk | null = null
const rng = createRng(randomSeed())

const REMARK_DELAY_MS = 500
const HELLO_DELAY_MS = 900
/** Bets wait for the last chips to land before they're swept to the pot; pots wait for that. */
const SWEEP_DELAY_MS = 450
const PUSH_DELAY_MS = 900

const caps = () => useSave.getState().wallet.caps

/** Stereo position of each chair as you see the table, by its angle round it. */
export const panOf = (seat: number, n: number): number => -Math.sin((seatAngle(seat, n) * Math.PI) / 180) * 0.6

const COUNT = ['none', 'one', 'two', 'three', 'four']

/** A regular taking a seat with a fresh buy-in. */
const seatRegular = (regular: Regular): Occupant => ({ regular, leaving: false })

const buyIn = (regular: Regular, table: Table) => regular.bankroll * table.stakes.big

/** Hands an empty chair waits before someone new sits down. */
const vacancy = () => 1 + Math.floor(rng() * 3)

const talkers = (seats: (Occupant | null)[]): Talker[] => seats.flatMap((o, seat) => (o ? [{ seat, id: o.regular.id, banter: o.regular.banter }] : []))

/** What's in the pot from you this hand, while it's being played. */
export function yourStake(state: DrawState | null): number {
  if (!state || betweenHands(state)) return 0
  const you = state.seats[YOUR_SEAT]
  return you?.inHand ? you.committed : 0
}

/** Plain-language log lines for one step. */
function describe(before: DrawState, events: DrawEvent[], after: DrawState, name: (seat: number) => string): LogEntry[] {
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

function playStepSounds(events: DrawEvent[], n: number) {
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
  const nameOf = (seat: number) => (seat === YOUR_SEAT ? 'You' : (get().seats[seat]?.regular.name ?? 'Someone'))

  /** Apply one action and everything that follows from it: caps, sounds, the log, the talk. */
  const run = (action: Action) => {
    const { state, seats, table, log, talk: lastTalk, call: lastCall, moves } = get()
    if (!state || !table || !isLegal(state, action)) return
    const { state: next, events } = apply(state, action)
    const n = state.seats.length
    const save = useSave.getState()

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
          if (e.seat === YOUR_SEAT) save.adjustCaps(-e.amount)
          flights.push({ id: ++fxId, amount: e.amount, from: e.seat, to: 'pot', delay: 0 })
          break
        case 'acted': {
          if (e.seat === YOUR_SEAT && e.amount > 0) save.adjustCaps(-e.amount)
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
          if (e.seat === YOUR_SEAT) save.adjustCaps(e.amount)
          flights.push({ id: ++fxId, amount: e.amount, from: 'pot', to: e.seat, delay: PUSH_DELAY_MS })
          break
        case 'hand-over': {
          for (const r of e.results) {
            if (r.seat === YOUR_SEAT) {
              result = { committed: r.committed, won: r.won }
              const net = r.won - r.committed
              save.recordResult('draw', net > 0 ? 'win' : net < 0 ? 'loss' : 'draw', net)
            } else if (next.seats[r.seat]!.stack === 0 && nextSeats[r.seat]) {
              leaving.push(r.seat)
            }
          }
          nextSeats = nextSeats.map((o, seat) => (o && leaving.includes(seat) ? { ...o, leaving: true } : o))
          break
        }
      }
    }

    playStepSounds(events, n)
    // The room reacts to the pots you win and lose big.
    if (result && result !== get().result) {
      const net = result.won - result.committed
      const big = result.won >= BIG_POT_BETS * table.stakes.big || result.committed >= (BIG_POT_BETS / 2) * table.stakes.big
      window.setTimeout(() => {
        if (net > 0) playSfx(big ? 'win' : 'chips')
        if (big && net > 0) crowdReaction('cheer')
        else if (big && net < 0) crowdReaction('groan')
      }, PUSH_DELAY_MS)
    }

    // Hints: say so when your draw isn't the book's.
    const lines = describe(state, events, next, nameOf)
    const yourDraw = events.find((e) => e.type === 'drew' && e.seat === YOUR_SEAT)
    if (yourDraw?.type === 'drew' && save.draw.hints) {
      const book = bookDraw(state.seats[YOUR_SEAT]!.cards)
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
    const callText = dealerCall(state, events, next, YOUR_SEAT, nameOf)
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
      marked: next.phase === 'drawing' && next.turn === YOUR_SEAT ? get().marked : [],
    })
  }

  const say = (seat: number, o: Occupant, moment: Scripted) => talk?.say({ seat, id: o.regular.id, banter: o.regular.banter }, moment) ?? null

  return {
    sitting: 0,
    config: null,
    table: null,
    state: null,
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
      if (caps() < table.minCaps) return false
      warmPools()
      const opponents = Math.max(1, Math.min(5, config.opponents))
      const regulars = seatRegulars(rng, opponents)
      const seats: (Occupant | null)[] = [null, ...regulars.map(seatRegular)]
      const stacks = seats.map((o, seat) => (seat === YOUR_SEAT ? caps() : buyIn(o!.regular, table)))
      // The button starts anywhere; the first hand moves it on one.
      const state = createTable({ stakes: table.stakes, stacks, seed: randomSeed(), button: Math.floor(rng() * seats.length) })
      talk = new TableTalk(createRng(randomSeed()), YOUR_SEAT)
      const greeters = talkers(seats)
      const hello = pick(greeters, rng)
      const helloText = say(hello.seat, seats[hello.seat]!, 'hello')
      set((s) => ({
        sitting: s.sitting + 1,
        config: { ...config, opponents },
        table,
        state,
        seats,
        waits: seats.map(() => 0),
        log: [{ id: ++logId, mine: false, text: `You sit down at ${table.name.toLowerCase().startsWith('the') ? table.name.toLowerCase() : `the ${table.name.toLowerCase()} table`}. ${table.dealer.name} is dealing.` }],
        talk: helloText ? { id: ++remarkId, seat: hello.seat, text: helloText, delay: HELLO_DELAY_MS + 1600 } : null,
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
      const { state, table, seats } = get()
      if (!state || !table || !betweenHands(state)) return false
      if (caps() < table.stakes.ante) {
        playSfx('error')
        return false
      }

      // Whoever's broke gets up, and their chair stays empty a hand or three.
      // Once a chair has been empty long enough, someone new sits down.
      const waits = get().waits.map((w, seat) => (seats[seat] === null && seat !== YOUR_SEAT ? Math.max(0, w - 1) : w))
      let nextSeats = seats.map((o, seat) => {
        if (!o?.leaving) return o
        waits[seat] = vacancy()
        return null
      })
      let next = state
      nextSeats.forEach((o, seat) => {
        if (seat !== YOUR_SEAT && !o && seats[seat]) next = seatAt(next, seat, null)
      })
      const empty = nextSeats.flatMap((o, seat) => (seat !== YOUR_SEAT && !o ? [seat] : []))
      const ready = empty.filter((seat) => waits[seat] === 0)
      // Never deal you in alone: if nobody's left, someone sits down at once.
      const nobody = nextSeats.every((o, seat) => seat === YOUR_SEAT || !o)
      const arrivals: number[] = []
      for (const seat of nobody ? empty.slice(0, 1) : ready) {
        const here = new Set(nextSeats.flatMap((o) => (o ? [o.regular.id] : [])))
        const free = REGULARS.filter((r) => !here.has(r.id))
        if (!free.length) break
        const regular = pick(free, rng)
        nextSeats = nextSeats.map((o, i) => (i === seat ? seatRegular(regular) : o))
        next = seatAt(next, seat, buyIn(regular, table))
        waits[seat] = 0
        arrivals.push(seat)
      }

      // Your caps are your stack.
      next = seatAt(next, YOUR_SEAT, caps())
      set({ state: next, seats: nextSeats, waits, flights: [], tosses: [] })
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
    },

    bet: (action) => {
      const { state } = get()
      if (!state || state.phase !== 'betting' || state.turn !== YOUR_SEAT) return
      if (!isLegal(state, { type: action })) {
        playSfx('error')
        return
      }
      run({ type: action })
    },

    mark: (cardId) => {
      const { state, marked } = get()
      if (!state || state.phase !== 'drawing' || state.turn !== YOUR_SEAT) return
      const cards = state.seats[YOUR_SEAT]!.cards
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
      const { state } = get()
      if (!state || state.phase !== 'drawing' || state.turn !== YOUR_SEAT) return
      playSfx('pick')
      set({ marked: cardIds.slice() })
    },

    draw: () => {
      const { state, marked } = get()
      if (!state || state.phase !== 'drawing' || state.turn !== YOUR_SEAT) return
      const action: Action = { type: 'draw', discards: marked }
      if (!isLegal(state, action)) {
        playSfx('error')
        return
      }
      run(action)
    },

    step: () => {
      const { state, seats } = get()
      if (!state) return
      const who = actor(state)
      if (who === 'dealer') run({ type: 'next' })
      else if (who !== null && who !== YOUR_SEAT) {
        const o = seats[who]
        if (o) run(botAction(state, who, o.regular.style, rng))
      }
    },

    leave: () => {
      const staked = yourStake(get().state)
      if (staked > 0) useSave.getState().recordResult('draw', 'loss', -staked)
      talk = null
      set({ config: null, table: null, state: null, seats: [], waits: [], log: [], talk: null, call: null, result: null, flights: [], tosses: [], moves: [], marked: [] })
    },
  }
})

/** Whether you're still in the hand being played. */
export const youreIn = (state: DrawState | null): boolean => !!state && !betweenHands(state) && isLive(state.seats[YOUR_SEAT])

/**
 * The table you're at: the layout and your chips on it, the regulars beside
 * you, the ball on the wheel, the log, and what the croupier and the
 * regulars say. Not persisted. Caps leave your wallet as they go on the
 * layout and come back as they're paid or taken down. Every bet can come
 * down until the ball is spun, so getting up hands them all back.
 *
 * A spin is decided as the ball is launched but only shown when it settles:
 * `inFlight` holds the result until then, and `land` (on a timer, or at
 * once if you leave mid-spin) settles it.
 *
 * Online, friends sit at the wheel with you, each betting their own caps on
 * their own copy of the layout, in their own chip color. Every browser
 * plays the same inputs in the same order (net/link.ts): each player's
 * bets and take-downs, each saying they're done, and the host's spins,
 * which carry the pocket the ball lands in, so nobody can read the next
 * number off a seed. When everyone's done, the host's browser spins; the
 * host can also spin without the stragglers. Inputs wait while the ball is
 * rolling. The regulars stay home online: their chips would be on the
 * layout, and every browser would seat different ones.
 */

import { create } from 'zustand'
import { crowdReaction } from '../../../core/audio/live'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, pick, randInt, randomSeed } from '../../../core/rng'
import { type Entry, isSys } from '../../../net/link'
import { useSave } from '../../../store/save'
import { languageOf, noMoreBets, placeBets, resultCall } from '../calls'
import { type Stakes, buyInOf, spotName, stakesById } from '../content'
import {
  type Pocket,
  type Spot,
  type TableEvent,
  type TableState,
  type WheelKind,
  WHEEL_ORDER,
  activeSpots,
  apply,
  betOn,
  colorOf,
  createTable,
  fitBet,
  isLegal,
  maxBet,
  minBet,
  onLayout,
  pocketName,
  spinPocket,
  spotInfo,
  summarize,
  unitOf,
} from '../engine'
import { type Memory, REGULARS, type Regular, type Talker, WheelTalk, afterSpin, freshMemory, momentsOf, pickRegulars, planBets } from '../regulars'

export interface SitConfig {
  stakesId: string
  wheel: WheelKind
  /** Online: your seat at the link, whether you host, and who's at the table at the start, by seat. */
  online?: { me: number; host: boolean; players: { seat: number; name: string }[] }
}

/** Another player at an online table: their bets, and whether they're done betting. */
export interface Player {
  seat: number
  name: string
  state: TableState
  done: boolean
}

export type Input =
  /** `n` is the table's spin count when it was made, so a bet meant for a spin that's gone is dropped. */
  | { type: 'bet'; n: number; spot: Spot; amount: number; available: number }
  | { type: 'down'; n: number; spot: Spot }
  | { type: 'done'; n: number; done: boolean }
  /** The host's spin, and where the ball lands. */
  | { type: 'spin'; n: number; pocket: Pocket }

/** Online: players at the table, you and up to four friends. */
export const ONLINE_SEATS = 5

/** Wheel chips by link seat. Offline, yours are the first. */
export const SEAT_COLORS = ['#e1b84f', '#3d7fc1', '#4fa36b', '#d9659b', '#8f6bc6'] as const

export interface LogEntry {
  id: number
  /** About your bets, so it stands out. */
  mine: boolean
  text: string
}

/** Something someone says. */
export interface Remark {
  id: number
  text: string
  /** Milliseconds to wait before showing it. */
  delay: number
}

/** The ball: rolling until it settles, then at rest in its pocket. */
export interface Spin {
  /** The spin's number at this table, from 1. */
  id: number
  pocket: Pocket
  landed: boolean
  /** performance.now() at the launch, for the wheel to pick up the rotor where it is. */
  at: number
}

/** Someone else's chips the last spin settled, for the layout to show paid and swept. */
export interface Others {
  color: string
  events: TableEvent[]
}

/** The latest spin's results, for the layout to show: chips paid and swept. */
export interface Settled {
  id: number
  pocket: Pocket
  events: TableEvent[]
  /** Winnings less losses. */
  net: number
  /** Whether you had a bet on it. */
  decided: boolean
  others: Others[]
}

/** A regular at the wheel: their stack, their bets on their own copy of the layout, and where their system is. */
export interface Seat {
  regular: Regular
  stack: number
  state: TableState
  memory: Memory
}

/** Something a regular says, by their seat. */
export interface SeatRemark extends Remark {
  seat: number
}

/** A word from the croupier about a bet you tried: why it won't go down, or what it came to. */
export interface Notice {
  id: number
  text: string
}

interface SessionStore {
  /** Increments every time you sit down, so the table remounts. */
  sitting: number
  /** Online: your seat at the link, whether you host, the other players by seat, whether you're done, and inputs waiting. */
  online: { me: number; host: boolean; players: (Player | null)[]; done: boolean; queue: Entry[] } | null
  stakes: Stakes | null
  state: TableState | null
  /** The chip you're betting with. */
  chip: number
  /** Taps take bets down instead of adding chips. */
  takingDown: boolean
  /** The bet you last pointed at or tapped, for the guide. */
  focus: Spot | null
  spin: Spin | null
  settled: Settled | null
  /** Bets the last spin took, for Rebet. */
  lost: { spot: Spot; amount: number }[]
  log: LogEntry[]
  /** The croupier's latest call. */
  call: Remark | null
  /** The regulars beside you, by seat. An empty seat is null. */
  seats: (Seat | null)[]
  /** For each empty seat, the spins left before someone new sits down. */
  waits: number[]
  /** The regulars' latest remark. */
  talk: SeatRemark | null
  notice: Notice | null
  sit: (config: SitConfig) => boolean
  pickChip: (value: number) => void
  setTakingDown: (on: boolean) => void
  setFocus: (spot: Spot | null) => void
  /** Add your chip to a bet. */
  bet: (spot: Spot) => void
  takeDown: (spot: Spot) => void
  /** Take everything down. */
  clear: () => void
  /** Put back what the last spin took. */
  rebet: () => void
  /** Spin the wheel. Online, say you're done betting; the host's browser spins once everyone is. */
  spinWheel: () => void
  /** Online: take back saying you're done, to change your bets. */
  notDone: () => void
  /** Online, the host: spin without whoever isn't done. */
  spinNow: () => void
  /** Online: play waiting inputs the table is ready for, calling `after` as each one is played. */
  pump: (after?: (entry: Entry) => void) => void
  /** Online: play everything waiting at once, settling every spin, without a sound. */
  catchUp: (after?: (entry: Entry) => void) => void
  receive: (entries: Entry[]) => void
  /** Get up. Every bet comes back. */
  leave: () => void
}

let logId = 0
let remarkId = 0
let noticeId = 0
const rng = createRng(randomSeed())

/** From the launch to the ball settling in its pocket: in step with rl-ball in roulette.css. */
export const SPIN_MS = 5400
/** The ball comes off the track and hits a deflector, 70% of the way through: in step with the `ball-drop` sound. */
export const DROP_MS = Math.round(SPIN_MS * 0.7)
/** When the croupier closes the betting, once the ball's away. */
const NO_MORE_BETS_MS = 1200
const HELLO_DELAY_MS = 900
/** A regular's remark waits for the croupier's call. */
const TALK_DELAY_MS = 900

/** Seats beside yours. */
export const REGULAR_SEATS = 3

/** The spin in the air, the regulars and the other players after it, and the timer that lands it. */
let inFlight: {
  result: { state: TableState; events: TableEvent[] }
  seats: ({ state: TableState; events: TableEvent[] } | null)[]
  players: ({ state: TableState; events: TableEvent[] } | null)[] | null
  timer: number
} | null = null
/** Catching up on an online table's past: played through quietly, without touching your caps or record. */
let quiet = false
/** Online: how your bets and spins go to the table, instead of onto the layout at once. */
let send: ((input: Input) => void) | null = null
/** Online, the host: the spin already asked for, so it's asked for once. */
let spinAsked = -1

/** Online: send your bets and spins through this. Null plays them at once. */
export function sendThrough(fn: ((input: Input) => void) | null) {
  send = fn
  spinAsked = -1
}

let talk: WheelTalk | null = null

const caps = () => useSave.getState().wallet.caps

const UNIT_WORD: Record<number, string> = { 2: 'twos' }

/** Why a bet won't go down. */
export function refusal(state: TableState, spot: Spot, available: number): string {
  const max = maxBet(state, spot)
  if (betOn(state, spot) >= max) return `That’s as much as ${betLabel(state.wheel, spot)} takes: ${max.toLocaleString()} caps.`
  const min = minBet(state, spot)
  if (available < min) return available <= 0 ? 'You’re out of caps.' : `The minimum there is ${min.toLocaleString()} caps, and you have ${available.toLocaleString()}.`
  return 'You don’t have the caps for that.'
}

/** What the croupier says when a bet doesn't go down as the chip you pushed out: rounded up, or held to a limit. */
export function roundingNote(state: TableState, spot: Spot, chip: number, amount: number): string | null {
  const want = betOn(state, spot) + chip
  if (amount === want) return null
  const on = `${amount.toLocaleString()} on ${betLabel(state.wheel, spot)}`
  if (amount > want) {
    const unit = unitOf(state, spot)
    if (unit > 1 && want % unit !== 0) return `Even chances go down in ${UNIT_WORD[unit]} at the French wheel, so la partage’s half is whole caps. That’s ${on}.`
    return `The minimum there is ${minBet(state, spot).toLocaleString()}. That’s ${on}.`
  }
  if (amount >= maxBet(state, spot)) return `That’s as much as it takes: ${on}.`
  return `That’s all you can cover: ${on}.`
}

/** A bet as a sentence names it: "17 straight up", "the 2nd dozen", "red". */
function betLabel(wheel: WheelKind, spot: Spot): string {
  const name = spotName(wheel, spot)
  const kind = spotInfo(wheel, spot)?.kind
  if (kind === 'straight') return name
  if (kind === 'red' || kind === 'black' || kind === 'odd' || kind === 'even') return name.toLowerCase()
  if (kind === 'low' || kind === 'high') return name
  return `the ${name.charAt(0).toLowerCase()}${name.slice(1)}`
}

const COLOR_WORD = { red: 'red', black: 'black', green: 'green' }

/** "17 black", "0 green". */
export const pocketCall = (pocket: Pocket) => `${pocketName(pocket)} ${COLOR_WORD[colorOf(pocket)]}`

/** Plain-language log lines for your side of one spin. */
function describe(events: TableEvent[], wheel: WheelKind): LogEntry[] {
  const lines: LogEntry[] = []
  const add = (text: string, mine = false) => lines.push({ id: ++logId, mine, text })
  const losers = events.filter((e) => e.type === 'lost')
  for (const e of events) {
    switch (e.type) {
      case 'spun':
        add(`The ball lands on ${pocketCall(e.pocket)}.`)
        break
      case 'won':
        add(`${spotName(wheel, e.spot)} wins ${e.paid.toLocaleString()}, and the ${e.bet.toLocaleString()} stays up.`, true)
        break
      case 'halved':
        add(`La partage: half your ${e.bet.toLocaleString()} on ${betLabel(wheel, e.spot)} comes back.`, true)
        break
    }
  }
  if (losers.length === 1 && losers[0].type === 'lost') add(`${spotName(wheel, losers[0].spot)} loses ${losers[0].bet.toLocaleString()}.`, true)
  else if (losers.length > 1) add(`${losers.length} bets lose ${losers.reduce((n, e) => n + (e.type === 'lost' ? e.bet : 0), 0).toLocaleString()} caps.`, true)
  return lines
}

const wonStraight = (events: readonly TableEvent[]) => events.some((e) => e.type === 'won' && e.spot.startsWith('straight-'))

export const useSession = create<SessionStore>()((set, get) => {
  const notify = (text: string) => {
    playSfx('error')
    set({ notice: { id: ++noticeId, text } })
  }

  /** Apply a bet or take-down to your layout, moving the caps. */
  const change = (state: TableState, action: { type: 'bet'; spot: Spot; amount: number } | { type: 'down'; spot: Spot }, available = caps()) => {
    const { state: next, events } = apply(state, action, available)
    const save = useSave.getState()
    if (!quiet) {
      for (const e of events) {
        if (e.type === 'bet') save.adjustCaps(-e.amount)
        else if (e.type === 'down') save.adjustCaps(e.amount)
      }
    }
    return next
  }

  /** Your bet or take-down: onto the layout at once, or online, to the table to be played in turn. */
  const place = (state: TableState, action: { type: 'bet'; spot: Spot; amount: number } | { type: 'down'; spot: Spot }): TableState => {
    if (!send) return change(state, action)
    send(action.type === 'bet' ? { ...action, n: state.spins, available: caps() } : { ...action, n: state.spins })
    return state
  }

  /** Whether you can put chips down now, and if not, why not. */
  const closed = (): string | null => {
    if (inFlight) return 'No more bets: the ball is rolling.'
    if (get().online?.done) return 'You’ve said you’re done. Change your bets first.'
    return null
  }

  /** A regular's next bets: whatever they had on the layout comes back, and their system puts down what it calls for. */
  const rebuy = (seat: Seat, table: TableState): Seat | null => {
    const stack = seat.stack + onLayout(seat.state.bets)
    const empty: TableState = { ...seat.state, bets: {}, spins: table.spins, history: table.history }
    const { actions, memory } = planBets(seat.regular, empty, stack, seat.memory)
    if (actions.length === 0) return null
    let state = empty
    let left = stack
    for (const action of actions) {
      state = apply(state, action, left).state
      left -= action.type === 'bet' ? action.amount : 0
    }
    return { ...seat, stack: left, state, memory }
  }

  /** The ball settles: pay out, call it, and the regulars get ready for the next one. */
  const land = () => {
    if (!inFlight) return
    const { result, seats: seatResults, players: playerResults } = inFlight
    window.clearTimeout(inFlight.timer)
    inFlight = null
    const { stakes, seats, waits: oldWaits, online } = get()
    const { state: next, events } = result
    const pocket = next.history[0]
    const { paid, lost, back } = summarize(events)
    const save = useSave.getState()
    if (!quiet && paid + back > 0) save.adjustCaps(paid + back)
    const decided = events.some((e) => e.type === 'won' || e.type === 'lost' || e.type === 'halved')
    const net = paid - lost
    if (decided && !quiet) save.recordResult('roulette', net > 0 ? 'win' : net < 0 ? 'loss' : 'draw', net)

    const min = stakes?.limits.outsideMin ?? 1
    const yourNumber = wonStraight(events)
    const theirNumber = seatResults.some((r) => r && wonStraight(r.events)) || (playerResults ?? []).some((r) => r && wonStraight(r.events))
    if (!quiet) {
      if (decided) playSfx('chips', { delay: 0.3 })
      if (yourNumber) {
        crowdReaction('cheer')
        playSfx('win', { delay: 0.45 })
      } else if (theirNumber) {
        crowdReaction('cheer')
      } else if (net > 0 && paid >= min * 10) {
        playSfx('win', { delay: 0.4 })
      }
    }
    const lostBets = events.flatMap((e) => (e.type === 'lost' || e.type === 'halved' ? [{ spot: e.spot, amount: e.bet }] : []))
    const lines = describe(events, next.wheel)
    const mineDecided = events.filter((e) => e.type === 'won' || e.type === 'lost' || e.type === 'halved').length
    if (mineDecided > 1 && net !== 0) lines.push({ id: ++logId, mine: true, text: net > 0 ? `You’re up ${net.toLocaleString()} caps on the spin.` : `You’re down ${(-net).toLocaleString()} caps on the spin.` })

    // The regulars have their say, then pick up their winnings and put down their next bets.
    const others: Others[] = []
    let remark: SeatRemark | null = get().talk
    const found = momentsOf(next, seatResults.map((r) => r?.events ?? null), events, min)
    const said = talk?.react(found, talkers(seats), next)
    if (said) remark = { id: ++remarkId, seat: said.seat, text: said.text, delay: TALK_DELAY_MS }
    const waits = oldWaits.map((w, i) => (seats[i] ? w : Math.max(0, w - 1)))
    let nextSeats = seats.map((seat, i) => {
      const r = seatResults[i]
      if (!seat || !r) return seat
      others.push({ color: seat.regular.color, events: r.events })
      const s = summarize(r.events)
      const after: Seat = { ...seat, stack: seat.stack + s.paid + s.back, state: r.state, memory: afterSpin(seat.regular, seat.memory, s.paid - s.lost) }
      const ready = rebuy(after, next)
      if (ready) return ready
      // Nothing left to bet with: they get up.
      const bye = talk?.say({ seat: i, regular: seat.regular }, 'goodbye')
      if (bye && !quiet) remark = { id: ++remarkId, seat: i, text: bye, delay: TALK_DELAY_MS }
      lines.push({ id: ++logId, mine: false, text: `${seat.regular.name} is out of caps and leaves the table.` })
      waits[i] = 2 + randInt(rng, 3)
      return null
    })
    // Someone new sits down in a seat that's been empty long enough.
    const empty = nextSeats.findIndex((s, i) => s === null && waits[i] === 0)
    if (empty !== -1 && stakes && !online) {
      const here = new Set(nextSeats.flatMap((s) => (s ? [s.regular.id] : [])))
      const free = REGULARS.filter((r) => !here.has(r.id))
      if (free.length) {
        const regular = pick(free, rng)
        const seat = rebuy(seatRegular(regular, stakes, next), next)
        if (seat) {
          nextSeats = nextSeats.map((s, i) => (i === empty ? seat : s))
          lines.push({ id: ++logId, mine: false, text: `${regular.name} sits down at the wheel.` })
          const hello = talk?.say({ seat: empty, regular }, 'hello')
          if (hello && !said && !quiet) remark = { id: ++remarkId, seat: empty, text: hello, delay: TALK_DELAY_MS + 1800 }
        }
      }
    }
    const players = online && playerResults ? online.players.map((p, i) => (p && playerResults[i] ? { ...p, state: playerResults[i].state, done: false } : p)) : null
    for (const [i, r] of (playerResults ?? []).entries()) if (r && online?.players[i]) others.push({ color: SEAT_COLORS[i], events: r.events })

    set((s) => ({
      state: next,
      spin: s.spin ? { ...s.spin, landed: true } : null,
      settled: { id: next.spins, pocket, events, net, decided, others },
      lost: lostBets.length > 0 ? lostBets : s.lost,
      log: [...s.log, ...lines].slice(-150),
      call: { id: ++remarkId, text: resultCall(pocket, next.wheel), delay: 0 },
      seats: nextSeats,
      waits,
      talk: remark,
      online: s.online && players ? { ...s.online, players, done: false } : s.online,
    }))
  }

  /** Launch the ball into `pocket`. Everyone's bets ride it. */
  const launch = (pocket: Pocket) => {
    const { state, online, seats } = get()
    if (!state || inFlight) return
    const result = apply(state, { type: 'spin', pocket })
    const seatResults = seats.map((seat) => (seat ? apply(seat.state, { type: 'spin', pocket }) : null))
    const players = online ? online.players.map((p) => (p ? apply(p.state, { type: 'spin', pocket }) : null)) : null
    if (!quiet) {
      playSfx('ball-spin')
      playSfx('ball-drop', { delay: DROP_MS / 1000 })
    }
    inFlight = { result, seats: seatResults, players, timer: quiet ? 0 : window.setTimeout(land, SPIN_MS) }
    set({
      spin: { id: result.state.spins, pocket, landed: false, at: performance.now() },
      notice: null,
      focus: null,
      settled: null,
      call: { id: ++remarkId, text: noMoreBets(languageOf(state.wheel), rng), delay: NO_MORE_BETS_MS },
    })
    if (quiet) land()
  }

  /** Online, the host: spin once everyone still at the table is done. */
  const maybeSpin = () => {
    const { online, state } = get()
    if (!online?.host || !state || !send || inFlight || spinAsked === state.spins) return
    if (!online.done || online.players.some((p) => p && !p.done)) return
    spinAsked = state.spins
    send({ type: 'spin', n: state.spins, pocket: spinPocket(Math.random, state.wheel) })
  }

  /** Whether the table's ready for an input: everything waits while the ball is rolling. */
  const readiness = (entry: Entry): 'now' | 'wait' => (!isSys(entry.input) && inFlight ? 'wait' : 'now')

  /** Play one input. Anything the rules don't allow, or meant for a spin that's gone, is dropped, the same at every table. */
  const play = (entry: Entry) => {
    const { state, online, stakes } = get()
    if (!state || !online || !stakes) return
    const seat = entry.seat
    if (isSys(entry.input)) {
      if (entry.input.sys === 'join') {
        const name = entry.input.name
        if (seat === online.me) {
          // Your seat's last visit, before a reload: its chips went with it.
          set({ state: { ...state, bets: {} }, online: { ...online, done: false } })
          return
        }
        const player: Player = { seat, name, state: { ...createTable({ wheel: state.wheel, limits: stakes.limits }), spins: state.spins, history: state.history }, done: false }
        set((s) => ({
          online: s.online && { ...s.online, players: s.online.players.map((p, i) => (i === seat ? player : p)) },
          log: [...s.log, { id: ++logId, mine: false, text: `${name} sits down at the wheel.` }].slice(-150),
        }))
      } else {
        const gone = online.players[seat]
        if (seat === online.me) set({ state: { ...state, bets: {} } })
        else if (gone) {
          set((s) => ({
            online: s.online && { ...s.online, players: s.online.players.map((p, i) => (i === seat ? null : p)) },
            log: [...s.log, { id: ++logId, mine: false, text: `${gone.name} gets up from the wheel.` }].slice(-150),
          }))
        }
      }
      return
    }
    const input = entry.input as Input
    if (input.n !== state.spins) return
    switch (input.type) {
      case 'bet':
      case 'down': {
        const action = input.type === 'bet' ? { type: 'bet' as const, spot: input.spot, amount: input.amount } : { type: 'down' as const, spot: input.spot }
        const available = input.type === 'bet' ? Math.max(0, input.available) : Infinity
        if (seat === online.me) {
          if (online.done || !isLegal(state, action, available)) return
          if (!quiet) playSfx(action.type === 'bet' ? 'chip' : 'chips')
          set({ state: change(state, action, available) })
        } else {
          const p = online.players[seat]
          if (!p || p.done || !isLegal(p.state, action, available)) return
          const next = apply(p.state, action, available).state
          set((s) => ({ online: s.online && { ...s.online, players: s.online.players.map((x, i) => (i === seat && x ? { ...x, state: next } : x)) } }))
        }
        break
      }
      case 'done':
        if (seat === online.me) set({ online: { ...online, done: input.done } })
        else if (online.players[seat]) set((s) => ({ online: s.online && { ...s.online, players: s.online.players.map((x, i) => (i === seat && x ? { ...x, done: input.done } : x)) } }))
        break
      case 'spin':
        if (seat === 0 && WHEEL_ORDER[state.wheel].includes(input.pocket)) launch(input.pocket)
        break
    }
  }

  return {
    sitting: 0,
    online: null,
    stakes: null,
    state: null,
    chip: 0,
    takingDown: false,
    focus: null,
    spin: null,
    settled: null,
    lost: [],
    log: [],
    call: null,
    seats: [],
    waits: [],
    talk: null,
    notice: null,

    sit: (config) => {
      const stakes = stakesById(config.stakesId)
      if (!config.online && caps() < buyInOf(stakes)) return false
      const state = createTable({ wheel: config.wheel, limits: stakes.limits })
      talk = new WheelTalk(createRng(randomSeed()))
      const me = config.online?.me ?? 0
      const players: (Player | null)[] = Array.from({ length: ONLINE_SEATS }, () => null)
      for (const p of config.online?.players ?? []) {
        if (p.seat !== me) players[p.seat] = { seat: p.seat, name: p.name, state: createTable({ wheel: config.wheel, limits: stakes.limits }), done: false }
      }
      // The regulars stay home online.
      const seats: (Seat | null)[] = config.online
        ? Array.from({ length: REGULAR_SEATS }, () => null)
        : pickRegulars(rng).map((regular) => rebuy(seatRegular(regular, stakes, state), state))
      const greeters = seats.flatMap((s, i) => (s ? [i] : []))
      const greeter = greeters.length ? greeters[randInt(rng, greeters.length)] : null
      const hello = greeter !== null ? talk.say({ seat: greeter, regular: seats[greeter]!.regular }, 'hello') : null
      const names = players.flatMap((p) => (p ? [p.name] : []))
      const language = languageOf(config.wheel)
      set((s) => ({
        sitting: s.sitting + 1,
        online: config.online ? { me, host: config.online.host, players, done: false, queue: [] } : null,
        stakes,
        state,
        chip: stakes.chips[1] ?? stakes.chips[0],
        takingDown: false,
        focus: null,
        spin: null,
        settled: null,
        lost: [],
        log: [
          {
            id: ++logId,
            mine: false,
            text: `You sit down at the ${config.wheel === 'american' ? 'American' : config.wheel === 'french' ? 'French' : 'European'} wheel in ${stakes.name === 'The Salon' ? 'the Salon' : `the ${stakes.name}`}${names.length ? ` with ${names.join(' and ')}` : ''}. ${stakes.croupier.name} is the croupier.`,
          },
        ],
        call: { id: ++remarkId, text: `${pick(stakes.croupier.hello[language], rng)} ${placeBets(language, rng)}`, delay: HELLO_DELAY_MS },
        seats,
        waits: seats.map(() => 0),
        talk: hello && greeter !== null ? { id: ++remarkId, seat: greeter, text: hello, delay: HELLO_DELAY_MS + 2600 } : null,
        notice: null,
      }))
      return true
    },

    pickChip: (value) => {
      playSfx('chip')
      set({ chip: value, takingDown: false })
    },

    setTakingDown: (on) => {
      playSfx('tick')
      set({ takingDown: on })
    },

    setFocus: (spot) => {
      if (get().focus !== spot) set({ focus: spot })
    },

    bet: (spot) => {
      const { state, chip } = get()
      if (!state) return
      const shut = closed()
      if (shut) {
        notify(shut)
        return
      }
      set({ focus: spot })
      const available = caps()
      const amount = fitBet(state, spot, chip, available)
      if (amount === null) {
        notify(refusal(state, spot, available))
        return
      }
      const add = amount - betOn(state, spot)
      if (!send) playSfx('chip')
      const note = roundingNote(state, spot, chip, amount)
      set({ state: place(state, { type: 'bet', spot, amount: add }), notice: note ? { id: ++noticeId, text: note } : null })
    },

    takeDown: (spot) => {
      const { state } = get()
      if (!state) return
      const shut = closed()
      if (shut) {
        notify(shut)
        return
      }
      set({ focus: spot })
      if (betOn(state, spot) <= 0) {
        notify(`There’s nothing of yours on ${betLabel(state.wheel, spot)}.`)
        return
      }
      if (!send) playSfx('chips')
      set({ state: place(state, { type: 'down', spot }), notice: null })
    },

    clear: () => {
      let { state } = get()
      if (!state || closed()) return
      const spots = activeSpots(state.bets)
      if (spots.length === 0) return
      for (const spot of spots) state = place(state, { type: 'down', spot })
      if (!send) playSfx('chips')
      set({ state, notice: null })
    },

    rebet: () => {
      let { state } = get()
      const { lost } = get()
      if (!state || lost.length === 0) return
      const shut = closed()
      if (shut) {
        notify(shut)
        return
      }
      let placed = 0
      let available = caps()
      for (const { spot, amount } of lost) {
        const add = amount - betOn(state, spot)
        if (add <= 0 || !isLegal(state, { type: 'bet', spot, amount: add }, available)) continue
        state = place(state, { type: 'bet', spot, amount: add })
        available -= add
        placed++
      }
      if (placed === 0) {
        notify(available < (get().stakes?.limits.insideMin ?? 1) ? 'You don’t have the caps to put those back.' : 'Those bets are already back down.')
        return
      }
      if (!send) playSfx('chip')
      set({ state, notice: null })
    },

    spinWheel: () => {
      const { state, online } = get()
      if (!state || inFlight) return
      if (online && send) {
        if (!online.done) send({ type: 'done', n: state.spins, done: true })
        return
      }
      launch(spinPocket(rng, state.wheel))
    },

    notDone: () => {
      const { state, online } = get()
      if (state && online?.done && send && !inFlight) send({ type: 'done', n: state.spins, done: false })
    },

    spinNow: () => {
      const { state, online } = get()
      if (!state || !online?.host || !send || inFlight || spinAsked === state.spins) return
      spinAsked = state.spins
      send({ type: 'spin', n: state.spins, pocket: spinPocket(Math.random, state.wheel) })
    },

    pump: (after) => {
      for (;;) {
        const online = get().online
        const entry = online?.queue[0]
        if (!online || !entry) break
        if (readiness(entry) === 'wait') break
        set({ online: { ...online, queue: online.queue.slice(1) } })
        play(entry)
        after?.(entry)
      }
      maybeSpin()
    },

    catchUp: (after) => {
      quiet = true
      try {
        get().pump(after)
      } finally {
        quiet = false
      }
    },

    receive: (entries) => set((s) => ({ online: s.online && { ...s.online, queue: [...s.online.queue, ...entries] } })),

    leave: () => {
      // A ball in the air counts.
      land()
      const { state } = get()
      if (state) {
        const back = onLayout(state.bets)
        if (back > 0) useSave.getState().adjustCaps(back)
      }
      talk = null
      set({ online: null, stakes: null, state: null, spin: null, settled: null, lost: [], log: [], call: null, seats: [], waits: [], talk: null, notice: null, focus: null, takingDown: false })
    },
  }
})

/** A regular sitting down with a fresh buy-in. */
function seatRegular(regular: Regular, stakes: Stakes, table: TableState): Seat {
  return { regular, stack: regular.bankroll * stakes.limits.outsideMin, state: { ...createTable({ wheel: table.wheel, limits: stakes.limits }), spins: table.spins, history: table.history }, memory: freshMemory() }
}

const talkers = (seats: (Seat | null)[]): Talker[] => seats.flatMap((seat, i) => (seat ? [{ seat: i, regular: seat.regular }] : []))

/**
 * The table you're at: the layout and your chips on it, the regulars at
 * the rail, the dice in the air, the log, and what the stickman and the
 * regulars say. Not persisted. Caps leave your
 * wallet as they go on the layout and come back as they're paid or taken
 * down, so getting up returns every bet that can come down, and forfeits
 * the contract bets that can't.
 *
 * A roll is decided when it's thrown but only shown when the dice land:
 * `roll` holds the result until then, and `land` (on a timer, or at once
 * if you leave mid-throw) settles it.
 *
 * Online, friends stand at the rail beside you, each betting their own caps
 * on their own copy of the layout, and the dice go round: whoever's
 * shooting keeps them until they seven out. Every browser plays the same
 * inputs in the same order (net/link.ts): each player's bets and take-downs,
 * and the shooter's throws, with the dice they rolled. Bets wait while the
 * dice are in the air. The regulars at the rail are each browser's own
 * company, and step aside for players.
 */

import { create } from 'zustand'
import { crowdReaction } from '../../../core/audio/live'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, pick, randInt, randomSeed } from '../../../core/rng'
import { type Entry, isSys } from '../../../net/link'
import { useSave } from '../../../store/save'
import { stickmanCall } from '../calls'
import { type Stakes, spotName, stakesById } from '../content'
import { REGULARS, RailTalk, type Regular, type Talker, momentsOf, pickRegulars, railBets } from '../rail'
import {
  type ApplyResult,
  type BetSpot,
  type Dice,
  type Die,
  type TableEvent,
  type TableState,
  activeSpots,
  apply,
  betOn,
  canBet,
  canTakeDown,
  createTable,
  fitBet,
  isLegal,
  maxBet,
  minBet,
  onLayout,
  spotInfo,
  summarize,
  unitOf,
} from '../engine'

export interface SitConfig {
  stakesId: string
  /** Online: your seat at the link, and who's at the table at the start, by seat. */
  online?: { me: number; players: { seat: number; name: string }[] }
}

/** Another player at an online table, and their bets. */
export interface Player {
  seat: number
  name: string
  state: TableState
}

export type Input =
  | { type: 'bet'; spot: BetSpot; amount: number; available: number }
  | { type: 'down'; spot: BetSpot }
  /** The shooter's throw: `n` is the table's roll count, so a second click is dropped. */
  | { type: 'roll'; n: number; dice: Dice }
  /** The shooter hands the dice on without throwing. */
  | { type: 'pass'; n: number }

/** Online: players at the table, you and up to three at the rail. */
export const ONLINE_SEATS = 4

export interface LogEntry {
  id: number
  /** About your bets, so it stands out. */
  mine: boolean
  text: string
}

/** Something the stickman says. */
export interface Remark {
  id: number
  text: string
  /** Milliseconds to wait before showing it. */
  delay: number
}

/** The dice: in the air until they land, then at rest where they stopped. */
export interface Throw {
  /** The roll's number at this table, from 1. */
  id: number
  dice: Dice
  landed: boolean
}

/** The latest roll's results, for the layout to show: chips paid, swept, moved, given back. */
export interface Settled {
  id: number
  events: TableEvent[]
  /** Winnings less losses. */
  net: number
  /** Whether any of your bets were decided. */
  decided: boolean
}

/** A regular at the rail: their stack, and their bets on their own copy of the table. */
export interface RailSeat {
  regular: Regular
  stack: number
  /** Same point and dice as yours; their bets. */
  state: TableState
}

/** Something a regular says, by their seat at the rail. */
export interface RailRemark extends Remark {
  seat: number
}

/** A word from the dealer about a bet you tried: why it won't go down, or come up. */
export interface Notice {
  id: number
  text: string
}

interface SessionStore {
  /** Increments every time you sit down, so the table remounts. */
  sitting: number
  /** Online: your seat at the link, the other players by seat, and whose dice they are. */
  online: { me: number; players: (Player | null)[]; shooter: number; rolls: number; queue: Entry[] } | null
  stakes: Stakes | null
  state: TableState | null
  /** The chip you're betting with. */
  chip: number
  /** Taps take bets down instead of adding chips. */
  takingDown: boolean
  /** The bet you last pointed at or tapped, for the guide. */
  focus: BetSpot | null
  dice: Throw | null
  settled: Settled | null
  /** Bets the last roll took, for Rebet. */
  lost: { spot: BetSpot; amount: number }[]
  log: LogEntry[]
  call: Remark | null
  /** The regulars at the rail, by seat. An empty seat is null. */
  rail: (RailSeat | null)[]
  /** For each empty seat, the rolls left before someone new steps up. */
  railWaits: number[]
  /** The regulars' latest remark. */
  talk: RailRemark | null
  notice: Notice | null
  sit: (config: SitConfig) => boolean
  pickChip: (value: number) => void
  setTakingDown: (on: boolean) => void
  setFocus: (spot: BetSpot | null) => void
  /** Add your chip to a bet. */
  bet: (spot: BetSpot) => void
  /** Take a bet down, odds and all. */
  takeDown: (spot: BetSpot) => void
  /** Take down everything that can come down. */
  clear: () => void
  /** Put back what the last roll took, where it can go. */
  rebet: () => void
  /** Throw the dice. The shooter needs a line bet on the come-out. */
  roll: () => void
  /** Online: hand the dice to the next player. */
  passDice: () => void
  /** Online: play waiting inputs the table is ready for, calling `after` as each one is played. */
  pump: (after?: (entry: Entry) => void) => void
  /** Online: play everything waiting at once, landing every throw, without a sound. */
  catchUp: (after?: (entry: Entry) => void) => void
  receive: (entries: Entry[]) => void
  /** Get up. Bets that can come down come back; contract bets are lost. */
  leave: () => void
}

let logId = 0
let remarkId = 0
let noticeId = 0
const rng = createRng(randomSeed())

/** From the throw to the dice coming to rest: in step with the `dice` sound and cr-throw in craps.css. */
export const LAND_MS = 950
const HELLO_DELAY_MS = 900
/** A regular's remark waits for the stickman's call. */
const TALK_DELAY_MS = 700

/** Seats at the rail beside yours. */
export const RAIL_SEATS = 3

/** The roll in the air, the rail and the other players after it, and the timer that lands it. */
let inFlight: { result: ApplyResult; rail: (RailSeat | null)[]; railEvents: (TableEvent[] | null)[]; players: (Player | null)[] | null; timer: number } | null = null
/** Catching up on an online table's past: played through quietly, without touching your caps or record. */
let quiet = false
/** Online: how a bet or take-down you made goes to the table, instead of onto the layout at once. */
let send: ((input: Input) => void) | null = null

/** Online: send your bets and throws through this. Null plays them at once. */
export function sendThrough(fn: ((input: Input) => void) | null) {
  send = fn
}
let talk: RailTalk | null = null

const caps = () => useSave.getState().wallet.caps

const DIE_WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six']

/** Why a bet won't go down. */
export function refusal(state: TableState, spot: BetSpot, available: number): string {
  const { kind } = spotInfo(spot)
  if (!canBet(state, spot)) {
    switch (kind) {
      case 'pass':
      case 'dont-pass':
        return 'Line bets go down on the come-out. With a point on, bet Come or Don’t Come instead.'
      case 'come':
      case 'dont-come':
        return 'Come bets wait for a point. On the come-out, bet the pass line.'
      case 'pass-odds':
        return state.point === null ? 'Odds go behind the line once there’s a point.' : 'Odds go behind a pass line bet, and you don’t have one.'
      case 'dont-pass-odds':
        return state.point === null ? 'Odds are laid once there’s a point.' : 'Odds are laid behind a don’t pass bet, and you don’t have one.'
      default:
        return 'That bet won’t go down right now.'
    }
  }
  const max = maxBet(state, spot)
  if (betOn(state, spot) >= max) {
    if (kind === 'pass-odds' || kind === 'come-odds') return 'That’s full odds: 3, 4 or 5 times the bet in front.'
    if (kind === 'dont-pass-odds' || kind === 'dont-come-odds') return 'That’s full odds: 6 times the bet in front.'
    return `That’s the table maximum, ${max.toLocaleString()} caps.`
  }
  if (available <= 0) return 'You’re out of caps.'
  return 'You don’t have the caps for that.'
}

/** What a dealer says when a bet doesn't go down as the chip you pushed out: rounded up to its unit, or held to a limit. */
export function roundingNote(state: TableState, spot: BetSpot, chip: number, amount: number): string | null {
  const want = betOn(state, spot) + chip
  if (amount === want) return null
  const name = spotName(spot)
  const on = `${amount.toLocaleString()} on ${name.toLowerCase().startsWith('odds') ? 'the odds' : `the ${name.toLowerCase()}`}`
  if (amount > want) {
    const unit = unitOf(state, spot)
    if (unit > 1 && want % unit !== 0) return `${name} goes down in ${UNIT_WORD[unit] ?? `units of ${unit}`}, so it pays whole caps. That’s ${on}.`
    return `The minimum there is ${minBet(state, spot).toLocaleString()}. That’s ${on}.`
  }
  if (amount >= maxBet(state, spot)) return `That’s as much as it takes: ${on}.`
  return `That’s all you can cover: ${on}.`
}

const UNIT_WORD: Record<number, string> = { 2: 'twos', 3: 'threes', 5: 'fives', 6: 'sixes' }

/** Why a bet won't come down. */
export function stuck(state: TableState, spot: BetSpot): string {
  const { kind } = spotInfo(spot)
  if (betOn(state, spot) <= 0) return `There’s nothing of yours on the ${spotName(spot).toLowerCase()}.`
  if (kind === 'pass') return 'A pass line bet stays up once there’s a point. Its odds can come down.'
  if (kind === 'come-point') return 'A come bet stays on its number until the number or a 7 rolls. Its odds can come down.'
  return 'That bet can’t come down.'
}

/** Plain-language log lines for one roll. `shooter` is who threw it, or null for you. */
function describe(events: TableEvent[], shooter: string | null = null): LogEntry[] {
  const lines: LogEntry[] = []
  const add = (text: string, mine = false) => lines.push({ id: ++logId, mine, text })
  for (const e of events) {
    switch (e.type) {
      case 'rolled':
        add(`${shooter ?? 'You'} ${shooter ? 'rolls' : 'roll'} ${DIE_WORD[e.dice[0]]} and ${DIE_WORD[e.dice[1]]}: ${e.total}${e.dice[0] === e.dice[1] && e.total % 2 === 0 && e.total > 2 && e.total < 12 ? ' the hard way' : ''}.`)
        break
      case 'point-set':
        add(`The point is ${e.point}.`)
        break
      case 'point-made':
        add(`The point is made. Next roll is a come-out.`)
        break
      case 'seven-out':
        add('Seven out. Next roll is a come-out.')
        break
      case 'won':
        add(`${spotName(e.spot)} wins ${e.paid.toLocaleString()}${e.stays ? '' : `, and the ${e.bet.toLocaleString()} comes back`}.`, true)
        break
      case 'lost':
        add(`${spotName(e.spot)} loses ${e.bet.toLocaleString()}.`, true)
        break
      case 'pushed':
        add(`${spotName(e.spot)} pushes on the 12.`, true)
        break
      case 'returned':
        add(`Your odds on the ${spotInfo(e.spot).number} were off for the come-out, and come back.`, true)
        break
      case 'moved':
        add(`Your ${e.from === 'come' ? 'come' : 'don’t come'} bet moves to the ${spotInfo(e.to).number}.`, true)
        break
    }
  }
  return lines
}

export const useSession = create<SessionStore>()((set, get) => {
  const notify = (text: string) => {
    playSfx('error')
    set({ notice: { id: ++noticeId, text } })
  }

  /** Apply a bet or take-down to your layout, moving the caps. */
  const change = (state: TableState, action: { type: 'bet'; spot: BetSpot; amount: number } | { type: 'down'; spot: BetSpot }, available = caps()) => {
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
  const place = (state: TableState, action: { type: 'bet'; spot: BetSpot; amount: number } | { type: 'down'; spot: BetSpot }): TableState => {
    if (!send) return change(state, action)
    send(action.type === 'bet' ? { ...action, available: caps() } : action)
    return state
  }

  /** Online: the name of whoever's shooting, or null when it's you. */
  const shooterName = () => {
    const online = get().online
    if (!online || online.shooter === online.me) return null
    return online.players[online.shooter]?.name ?? 'The shooter'
  }

  /** Online: the next player round the table after `seat`, still here. */
  const nextShooter = (seat: number) => {
    const online = get().online!
    for (let k = 1; k <= ONLINE_SEATS; k++) {
      const s = (seat + k) % ONLINE_SEATS
      if (s === online.me || online.players[s]) return s
    }
    return online.me
  }

  /** Online: the dice go to the next player. */
  const handOn = () => {
    const online = get().online
    if (!online) return
    const shooter = nextShooter(online.shooter)
    if (shooter === online.shooter) return
    const name = shooter === online.me ? null : online.players[shooter]?.name
    set((s) => ({
      online: s.online && { ...s.online, shooter },
      log: [...s.log, { id: ++logId, mine: shooter === online.me, text: name ? `The dice go to ${name}.` : 'The dice come to you.' }].slice(-150),
    }))
  }

  /** The dice come to rest: settle the roll, pay out, and call it. */
  const land = () => {
    if (!inFlight) return
    const { result, railEvents } = inFlight
    let rail = inFlight.rail
    const players = inFlight.players
    window.clearTimeout(inFlight.timer)
    inFlight = null
    const { state: next, events } = result
    const { paid, lost, back } = summarize(events)
    const save = useSave.getState()
    if (back > 0 && !quiet) save.adjustCaps(back)
    const decided = events.some((e) => e.type === 'won' || e.type === 'lost' || e.type === 'pushed' || e.type === 'returned')
    const net = paid - lost
    if (decided && !quiet) save.recordResult('craps', net > 0 ? 'win' : net < 0 ? 'loss' : 'draw', net)

    // The chips get pushed, and the room reacts to the big moments.
    const turn = events.find((e) => e.type === 'point-made' || e.type === 'seven-out')
    if (!quiet) {
      if (paid > 0) playSfx('chips', { delay: 0.25 })
      if (turn?.type === 'point-made') {
        crowdReaction('cheer')
        if (net > 0) playSfx('win', { delay: 0.35 })
      } else if (turn?.type === 'seven-out') {
        crowdReaction('groan')
        if (net < 0) playSfx('lose', { delay: 0.4 })
      } else if (net > 0 && paid >= 10 * Math.max(1, lost) && paid >= (get().stakes?.limits.min ?? 0) * 4) {
        playSfx('win', { delay: 0.3 })
      }
    }
    const lostBets = events.flatMap((e) => (e.type === 'lost' ? [{ spot: e.spot, amount: e.bet }] : []))

    const lines = describe(events, shooterName())
    const mineDecided = events.filter((e) => e.type === 'won' || e.type === 'lost').length
    if (mineDecided > 1 && net !== 0) lines.push({ id: ++logId, mine: true, text: net > 0 ? `You’re up ${net.toLocaleString()} caps on the roll.` : `You’re down ${(-net).toLocaleString()} caps on the roll.` })
    const text = stickmanCall(events, rng)

    // The rail has its say. Anyone out of caps with nothing left on the layout gets up.
    const min = get().stakes?.limits.min ?? 0
    const said = talk?.react(momentsOf(events, next, railEvents, min), talkers(rail))
    let remark: RailRemark | null = said ? { id: ++remarkId, seat: said.seat, text: said.text, delay: TALK_DELAY_MS } : get().talk
    const waits = get().railWaits.map((w, seat) => (rail[seat] ? w : Math.max(0, w - 1)))
    rail = rail.map((seat, i) => {
      if (!seat || seat.stack >= min || onLayout(seat.state.bets) > 0) return seat
      const bye = talk?.say({ seat: i, regular: seat.regular }, 'goodbye')
      if (bye) remark = { id: ++remarkId, seat: i, text: bye, delay: TALK_DELAY_MS }
      lines.push({ id: ++logId, mine: false, text: `${seat.regular.name} is out of caps and steps away from the rail.` })
      waits[i] = 2 + randInt(rng, 3)
      return null
    })

    set((s) => ({
      state: next,
      dice: s.dice ? { ...s.dice, landed: true } : null,
      settled: { id: next.rolls, events, net, decided },
      lost: lostBets.length > 0 ? lostBets : s.lost,
      log: [...s.log, ...lines].slice(-150),
      call: text ? { id: ++remarkId, text, delay: 0 } : s.call,
      rail,
      railWaits: waits,
      talk: remark,
      online: s.online && players ? { ...s.online, players, rolls: s.online.rolls + 1 } : s.online,
    }))
    // A seven-out passes the dice.
    if (turn?.type === 'seven-out') handOn()
  }

  /** A regular steps up to an empty seat that's been empty long enough, before the next roll. Not where a player stands. */
  const arrive = (state: TableState) => {
    const { rail, railWaits, stakes } = get()
    if (!stakes) return rail
    const taken = playerSpots()
    const seat = rail.findIndex((r, i) => r === null && railWaits[i] === 0 && !taken.includes(i))
    const here = new Set(rail.flatMap((r) => (r ? [r.regular.id] : [])))
    const free = REGULARS.filter((r) => !here.has(r.id))
    if (seat === -1 || free.length === 0) return rail
    const regular = pick(free, rng)
    const next = rail.map((r, i) => (i === seat ? seatRegular(regular, stakes, state) : r))
    const hello = talk?.say({ seat, regular }, 'hello')
    set((s) => ({
      rail: next,
      log: [...s.log, { id: ++logId, mine: false, text: `${regular.name} steps up to the rail.` }],
      talk: hello && !quiet ? { id: ++remarkId, seat, text: hello, delay: 200 } : s.talk,
    }))
    return next
  }

  /** Online: where each other player stands at the rail, by their order round the table. */
  const playerSpots = (): number[] => {
    const online = get().online
    if (!online) return []
    return online.players.flatMap((p) => (p ? [0] : [])).map((_, k) => RAIL_SEATS - 1 - k)
  }

  /** Regulars standing where a player now stands step aside. */
  const makeRoom = () => {
    const taken = playerSpots()
    const { rail } = get()
    if (!rail.some((r, i) => r && taken.includes(i))) return
    set((s) => ({
      rail: s.rail.map((r, i) => (r && taken.includes(i) ? null : r)),
      railWaits: s.railWaits.map((w, i) => (taken.includes(i) ? 2 : w)),
    }))
  }

  /** Throw the dice: these ones online, or the table's own. Everyone's bets ride them. */
  const throwDice = (dice?: Dice) => {
    const { state, online } = get()
    if (!state || inFlight) return
    const result = apply(state, dice ? { type: 'roll', dice } : { type: 'roll' })
    const thrown = result.state.history[0]
    // The regulars put their chips down and ride the same dice.
    const railEvents: (TableEvent[] | null)[] = []
    const rail = arrive(state).map((seat) => {
      if (!seat) {
        railEvents.push(null)
        return null
      }
      let { stack, state: theirs } = seat
      for (const action of railBets(seat.regular.style, theirs, stack)) {
        theirs = apply(theirs, action, stack).state
        stack -= action.type === 'bet' ? action.amount : 0
      }
      const after = apply(theirs, { type: 'roll', dice: thrown })
      railEvents.push(after.events)
      return { ...seat, stack: stack + summarize(after.events).back, state: after.state }
    })
    // So do the other players'.
    const players = online ? online.players.map((p) => p && { ...p, state: apply(p.state, { type: 'roll', dice: thrown }).state }) : null
    if (!quiet) playSfx('dice')
    inFlight = { result, rail, railEvents, players, timer: quiet ? 0 : window.setTimeout(land, LAND_MS) }
    set({ dice: { id: result.state.rolls, dice: thrown, landed: false }, notice: null, focus: null })
    if (quiet) land()
  }

  /** Whether the table's ready for an input: bets and throws wait while the dice are in the air. */
  const readiness = (entry: Entry): 'now' | 'wait' | 'drop' => {
    if (isSys(entry.input)) return 'now'
    if (inFlight) return 'wait'
    const input = entry.input as Input
    const online = get().online!
    if (input.type === 'roll' || input.type === 'pass') return input.n === online.rolls && entry.seat === online.shooter ? 'now' : 'drop'
    return 'now'
  }

  /** Play one input. Anything the rules don't allow is dropped, the same at every table. */
  const play = (entry: Entry) => {
    const { state, online, stakes } = get()
    if (!state || !online || !stakes) return
    const seat = entry.seat
    if (isSys(entry.input)) {
      if (entry.input.sys === 'join') {
        const name = entry.input.name
        // A newcomer's layout starts at the point the table's on.
        const player: Player = { seat, name, state: createTable({ limits: stakes.limits, seed: state.seed, point: state.point }) }
        if (seat === online.me) {
          set({ state: { ...state, bets: {} } })
          return
        }
        set((s) => ({
          online: s.online && { ...s.online, players: s.online.players.map((p, i) => (i === seat ? player : p)) },
          log: [...s.log, { id: ++logId, mine: false, text: `${name} steps up to the rail.` }].slice(-150),
        }))
        makeRoom()
      } else {
        const gone = online.players[seat]
        if (seat === online.me) {
          // Your seat's last visit, before a reload: its chips went with it.
          set({ state: { ...state, bets: {} } })
        } else if (gone) {
          set((s) => ({
            online: s.online && { ...s.online, players: s.online.players.map((p, i) => (i === seat ? null : p)) },
            log: [...s.log, { id: ++logId, mine: false, text: `${gone.name} steps away from the rail.` }].slice(-150),
          }))
        }
        if (get().online!.shooter === seat) handOn()
      }
      return
    }
    const input = entry.input as Input
    switch (input.type) {
      case 'bet':
      case 'down': {
        const action = input.type === 'bet' ? { type: 'bet' as const, spot: input.spot, amount: input.amount } : { type: 'down' as const, spot: input.spot }
        const available = input.type === 'bet' ? Math.max(0, input.available) : Infinity
        if (seat === online.me) {
          if (!isLegal(state, action, available)) return
          if (!quiet) playSfx(action.type === 'bet' ? 'chip' : 'chips')
          set({ state: change(state, action, available) })
        } else {
          const p = online.players[seat]
          if (!p || !isLegal(p.state, action, available)) return
          const next = apply(p.state, action, available).state
          set((s) => ({ online: s.online && { ...s.online, players: s.online.players.map((x, i) => (i === seat && x ? { ...x, state: next } : x)) } }))
        }
        break
      }
      case 'roll':
        if (input.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6) && input.dice.length === 2) throwDice([input.dice[0], input.dice[1]])
        break
      case 'pass':
        handOn()
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
    dice: null,
    settled: null,
    lost: [],
    log: [],
    call: null,
    rail: [],
    railWaits: [],
    talk: null,
    notice: null,

    sit: (config) => {
      const stakes = stakesById(config.stakesId)
      if (!config.online && caps() < stakes.limits.min) return false
      const state = createTable({ limits: stakes.limits, seed: randomSeed() })
      talk = new RailTalk(createRng(randomSeed()))
      const players: (Player | null)[] = Array.from({ length: ONLINE_SEATS }, () => null)
      const me = config.online?.me ?? 0
      for (const p of config.online?.players ?? []) {
        if (p.seat !== me) players[p.seat] = { seat: p.seat, name: p.name, state: createTable({ limits: stakes.limits, seed: state.seed }) }
      }
      const others = players.filter(Boolean).length
      // Players stand at the rail from the far end; regulars fill the rest.
      const rail: (RailSeat | null)[] = pickRegulars(rng)
        .map((regular) => seatRegular(regular, stakes, state))
        .map((seat, i) => (i < RAIL_SEATS - others ? seat : null))
      // One of the regulars says hello once the stickman has.
      const greeters = rail.flatMap((r, i) => (r ? [i] : []))
      const greeter = greeters.length ? greeters[randInt(rng, greeters.length)] : null
      const hello = greeter !== null ? talk.say({ seat: greeter, regular: rail[greeter]!.regular }, 'hello') : null
      const names = players.flatMap((p) => (p ? [p.name] : []))
      const shooter = config.online ? Math.min(...(config.online.players.map((p) => p.seat).concat(me))) : 0
      const shooterIs = shooter === me ? 'the dice are yours' : `${players[shooter]?.name ?? 'the host'} has the dice`
      set((s) => ({
        sitting: s.sitting + 1,
        online: config.online ? { me, players, shooter, rolls: 0, queue: [] } : null,
        stakes,
        state,
        chip: stakes.chips[1] ?? stakes.chips[0],
        takingDown: false,
        focus: null,
        dice: null,
        settled: null,
        lost: [],
        log: [
          {
            id: ++logId,
            mine: false,
            text: `You step up to the rail at the ${stakes.name.toLowerCase()} table${names.length ? ` with ${names.join(' and ')}` : ''}. ${stakes.stickman.name} is on the stick, and ${shooterIs}.`,
          },
        ],
        call: { id: ++remarkId, text: pick(stakes.stickman.hello, rng), delay: HELLO_DELAY_MS },
        rail,
        railWaits: rail.map(() => 0),
        talk: hello && greeter !== null ? { id: ++remarkId, seat: greeter, text: hello, delay: HELLO_DELAY_MS + 2200 } : null,
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
      if (!state || inFlight) return
      set({ focus: spot })
      const available = caps()
      const amount = fitBet(state, spot, chip, available)
      if (amount === null) {
        notify(refusal(state, spot, available))
        return
      }
      const add = amount - betOn(state, spot)
      if (!isLegal(state, { type: 'bet', spot, amount: add }, available)) {
        notify(refusal(state, spot, available))
        return
      }
      if (!send) playSfx('chip')
      const note = roundingNote(state, spot, chip, amount)
      set({
        state: place(state, { type: 'bet', spot, amount: add }),
        notice: note ? { id: ++noticeId, text: note } : null,
      })
    },

    takeDown: (spot) => {
      const { state } = get()
      if (!state || inFlight) return
      set({ focus: spot })
      if (!canTakeDown(state, spot)) {
        notify(stuck(state, spot))
        return
      }
      if (!send) playSfx('chips')
      set({ state: place(state, { type: 'down', spot }), notice: null })
    },

    clear: () => {
      let { state } = get()
      if (!state || inFlight) return
      let any = false
      for (const spot of activeSpots(state.bets)) {
        if (!canTakeDown(state, spot)) continue
        state = place(state, { type: 'down', spot })
        any = true
      }
      if (!any) return
      if (!send) playSfx('chips')
      set({ state, notice: null })
    },

    rebet: () => {
      let { state } = get()
      const { lost } = get()
      if (!state || inFlight || lost.length === 0) return
      let placed = 0
      let available = caps()
      for (const { spot, amount } of lost) {
        // A come bet that travelled goes back in the come box; its odds wait for it to travel again.
        const { kind } = spotInfo(spot)
        const target: BetSpot = kind === 'come-point' ? 'come' : kind === 'dont-come-point' ? 'dont-come' : spot
        const add = amount - betOn(state, target)
        if (add <= 0 || !isLegal(state, { type: 'bet', spot: target, amount: add }, available)) continue
        state = place(state, { type: 'bet', spot: target, amount: add })
        available -= add
        placed++
      }
      if (placed === 0) {
        notify('Those bets can’t go back down right now.')
        return
      }
      if (!send) playSfx('chip')
      set({ state, notice: null })
    },

    roll: () => {
      const { state, online } = get()
      if (!state || inFlight) return
      if (online && online.shooter !== online.me) {
        notify(`${online.players[online.shooter]?.name ?? 'Someone else'} has the dice.`)
        return
      }
      if (needsLineBet(state)) {
        notify('The shooter needs a bet on the pass line or don’t pass to come out.')
        return
      }
      if (online && send) {
        const die = () => (1 + Math.floor(Math.random() * 6)) as Die
        send({ type: 'roll', n: online.rolls, dice: [die(), die()] })
        return
      }
      throwDice()
    },

    passDice: () => {
      const { online } = get()
      if (online && send && online.shooter === online.me && !inFlight) send({ type: 'pass', n: online.rolls })
    },

    pump: (after) => {
      for (;;) {
        const online = get().online
        const entry = online?.queue[0]
        if (!online || !entry) break
        const when = readiness(entry)
        if (when === 'wait') break
        set({ online: { ...online, queue: online.queue.slice(1) } })
        if (when === 'now') play(entry)
        after?.(entry)
      }
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
      // A roll in the air counts.
      land()
      const { state } = get()
      if (state) {
        let forfeit = 0
        for (const spot of activeSpots(state.bets)) {
          const amount = betOn(state, spot)
          if (canTakeDown(state, spot)) useSave.getState().adjustCaps(amount)
          else forfeit += amount
        }
        if (forfeit > 0) useSave.getState().recordResult('craps', 'loss', -forfeit)
      }
      talk = null
      set({ online: null, stakes: null, state: null, dice: null, settled: null, lost: [], log: [], call: null, rail: [], railWaits: [], talk: null, notice: null, focus: null, takingDown: false })
    },
  }
})

/** A regular stepping up with a fresh buy-in, at the point the table's on. */
function seatRegular(regular: Regular, stakes: Stakes, table: TableState): RailSeat {
  return { regular, stack: regular.bankroll * stakes.limits.min, state: createTable({ limits: stakes.limits, seed: table.seed, point: table.point }) }
}

const talkers = (rail: (RailSeat | null)[]): Talker[] => rail.flatMap((seat, i) => (seat ? [{ seat: i, regular: seat.regular }] : []))

/** On the come-out, the shooter has to have a line bet to roll. */
export const needsLineBet = (state: TableState): boolean => state.point === null && betOn(state, 'pass') === 0 && betOn(state, 'dont-pass') === 0

/** What a getup would cost you: contract bets, which can't come down. */
export function forfeitOf(state: TableState | null): number {
  if (!state) return 0
  return activeSpots(state.bets).reduce((n, spot) => n + (canTakeDown(state, spot) ? 0 : betOn(state, spot)), 0)
}

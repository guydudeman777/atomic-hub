/**
 * The machine you're at: your reels and your bet, the regulars at the
 * machines either side, the jackpot meter, the log, and what the change
 * girl and the regulars say. Not persisted, but for the meter. Caps leave
 * your wallet as the coins go in and come back when a win is paid.
 *
 * A pull is decided as the handle comes down but only paid when the last
 * reel stops: `pull` holds it until then, and `settle` (on a timer, or at
 * once if you get up mid-spin) pays it.
 *
 * The regulars pull at their own pace, on timers of their own, with caps
 * of their own, through the same engine. On Moon Rocket every three-coin
 * pull on the row feeds the one meter, and anyone can win it. The meter is
 * saved, so it's where the row left it next time.
 *
 * Online, friends play the machines either side of yours, each with their
 * own caps. Every browser plays the same pulls in the same order
 * (net/link.ts). A pull carries its stops, picked by the browser that
 * pulled, so nobody can read the next spin off a seed, and every browser's
 * meter comes out the same. Online play starts the meter at its reset and
 * leaves the saved one alone. The regulars stay home.
 */

import { create } from 'zustand'
import { crowdReaction } from '../../../core/audio/live'
import { type Sfx, playSfx } from '../../../core/audio/sfx'
import { createRng, randInt, randomSeed } from '../../../core/rng'
import { type Entry, isSys } from '../../../net/link'
import { useSave } from '../../../store/save'
import { CHANGE_GIRL, changeCall, helloCall, jackpotCall, meterCall, winCall } from '../calls'
import { SYMBOLS, buyInOf, machineInfo, payName } from '../content'
import { type Rules, type Spin, type Stops, MAX_COINS, isStops, meterCaps, meterReset, spin, spinStops } from '../engine'
import { MACHINES, type MachineId } from '../machines'
import {
  BIG_WIN,
  type Memory,
  REGULARS,
  type Regular,
  RowTalk,
  type Talker,
  afterSpin,
  coinsFor,
  freshMemory,
  isTopAward,
  momentsOf,
  nextPullIn,
  pickRegulars,
} from '../regulars'

export interface SitConfig {
  machine: MachineId
  /** Online: your seat at the link, whether you host, and who's on the row at the start, by seat. */
  online?: { me: number; host: boolean; players: { seat: number; name: string }[] }
}

/** A pull on a machine, from the handle coming down to the last reel stopping. */
export interface Pull {
  /** The pull's number on its machine this sitting, from 1. */
  id: number
  spin: Spin
  /** performance.now() at the pull, for the reels to pick up where they are. */
  at: number
  /** The reels have stopped and the win is paid. */
  settled: boolean
}

/** A regular at a machine beside yours: their caps, their style's memory, and their latest pull. */
export interface Seat {
  regular: Regular
  stack: number
  memory: Memory
  pull: Pull | null
  /** Coins in on their machine. */
  coins: number
}

/** A friend at a machine beside yours, online. */
export interface Player {
  seat: number
  name: string
  pull: Pull | null
  pulls: number
  /** Caps won less caps played this sitting, the pull in the air included. */
  net: number
}

export type Input =
  /** `n` is how many pulls you'd made when you pulled, so a repeated click is dropped. The stops are picked by the browser that pulled. */
  { type: 'pull'; n: number; coins: number; stops: Stops }

/** Online: you and up to two friends, at the machines side by side. */
export const ONLINE_SEATS = 3

/** Plates by link seat, online. */
export const SEAT_COLORS = ['#f2c14e', '#5ab0d6', '#e07a8f'] as const

export interface LogEntry {
  id: number
  /** About your machine, so it stands out. */
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

/** Something a regular says, by their seat. */
export interface SeatRemark extends Remark {
  seat: number
}

/** A word about your bet: why the handle won't come down, or what changed. */
export interface Notice {
  id: number
  text: string
}

interface SessionStore {
  /** Increments every time you sit down, so the machine remounts. */
  sitting: number
  machine: MachineId | null
  /** Online: your seat at the link, whether you host, the other players by seat, and pulls waiting to be played. */
  online: { me: number; host: boolean; players: (Player | null)[]; queue: Entry[] } | null
  /** Coins in for the next pull: the bet meter. */
  coins: number
  /** Your latest pull. */
  pull: Pull | null
  /** Pulls you've made this sitting. */
  pulls: number
  /** Your losing pulls in a row. */
  dry: number
  /** Caps won less caps played this sitting, for the terminal. */
  net: number
  /** The jackpot meter, in hundredths of a cap; null on a machine without one. */
  meter: number | null
  /** The regulars beside you: left and right. An empty machine is null. */
  seats: (Seat | null)[]
  log: LogEntry[]
  /** The change girl's latest call. */
  call: Remark | null
  /** The regulars' latest remark. */
  talk: SeatRemark | null
  notice: Notice | null
  /** Online: your pull is on its way to the table and back. */
  waiting: boolean
  sit: (config: SitConfig) => boolean
  /** Add a coin to the bet, round from three back to one. */
  betOne: () => void
  setCoins: (coins: number) => void
  /** Three coins in, and pull. */
  betMax: () => void
  /** Pull the handle. */
  pullHandle: () => void
  /** Online: play waiting pulls, calling `after` as each one is played. */
  pump: (after?: (entry: Entry) => void) => void
  /** Online: play everything waiting at once, every pull settled, without a sound. */
  catchUp: (after?: (entry: Entry) => void) => void
  receive: (entries: Entry[]) => void
  /** Get up. A pull in the air is paid first. */
  leave: () => void
}

let logId = 0
let remarkId = 0
let noticeId = 0
const rng = createRng(randomSeed())

/** When each reel stops after the pull, in milliseconds: in step with the reel animations in slots.css and the `reels` sound. */
export const REEL_STOP_MS = [1000, 1450, 1900] as const
/** The last reel stops, bounces and settles; then the win is paid. */
export const SETTLE_MS = 2150
const HELLO_DELAY_MS = 900
/** A regular's remark waits a moment for the reels and the change girl. */
const TALK_DELAY_MS = 700
/** Dottie comes back down the row every so often. */
const WALK_MS: readonly [number, number] = [70_000, 130_000]
/** Before someone takes an empty machine. */
const EMPTY_MS: readonly [number, number] = [15_000, 40_000]
/** Moon Rocket's meter is worth a word from Dottie past this share over its reset. */
const METER_WORTH_MENTIONING = 1.25

/** Neighbors' machines: quieter than yours, and off to the side. */
const NEIGHBOR_LEVEL = 0.32
const NEIGHBOR_PAN = [-0.7, 0.7] as const

/** Every timer the row is running: your reels, the regulars' pulls and settles, empty stools, and Dottie. */
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const after = (key: string, ms: number, fn: () => void) => {
  clearTimeout(timers.get(key))
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      fn()
    }, ms),
  )
}
const clearTimers = () => {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
}

/** Catching up on an online row's past: played through quietly, without touching your caps or record. */
let quiet = false
/** Online: how your pulls go to the table, instead of onto the reels at once. */
let send: ((input: Input) => void) | null = null

/** Online: send your pulls through this. Null plays them at once. */
export function sendThrough(fn: ((input: Input) => void) | null) {
  send = fn
}

let talk: RowTalk | null = null
/** When Dottie last said something, so she doesn't talk over herself on her walk. */
let lastCallAt = -Infinity
/** Regulars who went broke this sitting: they don't come back with a fresh stack. */
const broke = new Set<string>()

const caps = () => useSave.getState().wallet.caps
const rulesOf = (machine: MachineId | null): Rules | null => (machine ? MACHINES[machine] : null)

const between = ([lo, hi]: readonly [number, number]) => lo + rng() * (hi - lo)

const sound = (name: Sfx, options: { delay?: number; pan?: number; level?: number } = {}) => {
  if (!quiet) playSfx(name, options)
}

/** The reels coming round and stopping, one after another, on a machine at `pan`. */
function reelSounds(pan: number, level: number) {
  sound('lever', { pan, level })
  sound('reels', { pan, level })
  REEL_STOP_MS.forEach((ms, i) => sound('reel-stop', { pan: pan + (i - 1) * 0.2, level, delay: ms / 1000 }))
}

/** "Bell, cherry, blank." */
const lineText = (spin: Spin) => {
  const text = spin.line.map((s) => SYMBOLS[s].name).join(', ')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

/** What a win was, in words: "Three bells", "Three sevens, an atom doubling it". */
function winText(rules: Rules, spin: Spin): string {
  const win = spin.win!
  const name = payName(rules.pays[win.pay])
  if (win.meter) return `${name}: the jackpot`
  if (win.wilds === 1) return `${name}, the atom doubling it`
  if (win.wilds === 2) return `${name}, two atoms quadrupling it`
  return name
}

const COIN_WORDS = ['', 'One coin', 'Two coins', 'Three coins']

export const useSession = create<SessionStore>()((set, get) => {
  const notify = (text: string, error = true) => {
    if (error) sound('error')
    set({ notice: { id: ++noticeId, text } })
  }

  const addLog = (...lines: Omit<LogEntry, 'id'>[]) => set((s) => ({ log: [...s.log, ...lines.map((l) => ({ ...l, id: ++logId }))].slice(-150) }))

  const sayCall = (text: string, delay = 0) => {
    if (quiet) return
    lastCallAt = performance.now()
    set({ call: { id: ++remarkId, text, delay } })
  }

  const talkers = (): Talker[] => get().seats.flatMap((seat, i) => (seat ? [{ seat: i, regular: seat.regular }] : []))

  /** The meter after a pull feeds it or is won, and saved where the row leaves it, offline. */
  const setMeter = (meter: number | null) => {
    set({ meter })
    if (!get().online && meter !== null) useSave.getState().updateSlots({ meter })
  }

  // ---- Your machine ---------------------------------------------------------

  /** The handle comes down on your machine: coins in, the meter fed, the reels away. */
  const startMine = (coins: number, stops: Stops) => {
    const { machine, meter, pulls, pull: last } = get()
    const rules = rulesOf(machine)
    if (!rules) return
    if (last && !last.settled) settleMine()
    const s = spin(rules, stops, coins, meter)
    if (!quiet) useSave.getState().adjustCaps(-s.bet)
    const pull: Pull = { id: pulls + 1, spin: s, at: performance.now(), settled: false }
    set({ pull, pulls: pull.id, net: get().net - s.bet + s.paid, waiting: false, notice: null })
    setMeter(s.meter)
    reelSounds(0, 1)
    if (quiet) settleMine()
    else after('mine', SETTLE_MS, settleMine)
  }

  /** Your reels have stopped: pay the win, call it, and let the row have its say. */
  const settleMine = () => {
    const { pull, machine, dry } = get()
    const rules = rulesOf(machine)
    if (!pull || pull.settled || !rules || !machine) return
    clearTimeout(timers.get('mine'))
    timers.delete('mine')
    const s = pull.spin
    const save = useSave.getState()
    if (!quiet) {
      if (s.paid > 0) save.adjustCaps(s.paid)
      const net = s.paid - s.bet
      save.recordResult('slots', net > 0 ? 'win' : net < 0 ? 'loss' : 'draw', net)
    }
    const top = isTopAward(s)
    const big = s.paid >= s.bet * BIG_WIN
    if (top) {
      sound('jackpot')
      if (!quiet) crowdReaction('cheer')
    } else if (big) sound('win', { delay: 0.2 })

    const lines: Omit<LogEntry, 'id'>[] = [{ mine: true, text: `${COIN_WORDS[s.coins]}: ${lineText(s).toLowerCase()}` }]
    if (s.win) lines.push({ mine: true, text: `${winText(rules, s)}. ${s.win.meter ? '' : `${s.win.coins.toLocaleString()} coins, `}${s.paid.toLocaleString()} caps.` })
    addLog(...lines)

    const nextDry = s.paid > 0 ? 0 : dry + 1
    set({ pull: { ...pull, settled: true }, dry: nextDry })
    if (quiet) return
    if (top) sayCall(jackpotCall(machineInfo(machine).name, null, s.paid, rng), 300)
    else if (big) sayCall(winCall(null, s.paid, rng), 500)
    const said = talk?.react(momentsOf(rules, s, null, nextDry), talkers(), performance.now(), s.paid)
    if (said) set({ talk: { id: ++remarkId, seat: said.seat, text: said.text, delay: TALK_DELAY_MS + (top || big ? 1600 : 0) } })
  }

  /** Whether your machine can take a pull now, and if not, why not. */
  const busy = (): string | null => {
    const { pull, waiting } = get()
    if (waiting || (pull && !pull.settled)) return 'The reels are still turning.'
    return null
  }

  // ---- The regulars -----------------------------------------------------------

  const setSeat = (i: number, seat: Seat | null) => set((s) => ({ seats: s.seats.map((x, j) => (j === i ? seat : x)) }))

  /** A regular pulls their handle, or gets up if they can't cover a coin. */
  const regularPull = (i: number) => {
    const { seats, machine, meter } = get()
    const seat = seats[i]
    const rules = rulesOf(machine)
    if (!seat || !rules) return
    const coins = coinsFor(seat.regular, seat.memory, rules, seat.stack)
    if (coins === 0) {
      getUp(i)
      return
    }
    const s = spin(rules, spinStops(rng, rules), coins, meter)
    setSeat(i, { ...seat, stack: seat.stack - s.bet, coins, pull: { id: (seat.pull?.id ?? 0) + 1, spin: s, at: performance.now(), settled: false } })
    setMeter(s.meter)
    reelSounds(NEIGHBOR_PAN[i], NEIGHBOR_LEVEL)
    after(`settle-${i}`, SETTLE_MS, () => settleRegular(i))
  }

  /** A regular's reels stop: they take their win, and pull again when they're ready. */
  const settleRegular = (i: number) => {
    const { seats, machine } = get()
    const seat = seats[i]
    const rules = rulesOf(machine)
    if (!seat?.pull || seat.pull.settled || !rules || !machine) return
    const s = seat.pull.spin
    const memory = afterSpin(seat.regular, seat.memory, s, rules)
    setSeat(i, { ...seat, stack: seat.stack + s.paid, memory, pull: { ...seat.pull, settled: true } })
    const top = isTopAward(s)
    const big = s.paid >= s.bet * BIG_WIN
    if (s.paid > 0) sound('payout', { pan: NEIGHBOR_PAN[i], level: NEIGHBOR_LEVEL * (big ? 1.6 : 1) })
    if (top) {
      sound('jackpot', { pan: NEIGHBOR_PAN[i] * 0.6, level: 0.6 })
      crowdReaction('cheer')
      sayCall(jackpotCall(machineInfo(machine).name, seat.regular.name, s.paid, rng), 300)
      addLog({ mine: false, text: `Jackpot for ${seat.regular.name}: ${s.paid.toLocaleString()} caps.` })
    } else if (big) {
      addLog({ mine: false, text: `${seat.regular.name} hits ${winText(rules, s).charAt(0).toLowerCase()}${winText(rules, s).slice(1)} for ${s.paid.toLocaleString()} caps.` })
      if (s.paid >= s.bet * 50) sayCall(winCall(seat.regular.name, s.paid, rng), 400)
    }
    const said = talk?.react(momentsOf(rules, s, i, memory.dry), talkers(), performance.now(), s.paid)
    if (said) set({ talk: { id: ++remarkId, seat: said.seat, text: said.text, delay: TALK_DELAY_MS + (top ? 1600 : 0) } })
    after(`pull-${i}`, nextPullIn(seat.regular, rng), () => regularPull(i))
  }

  /** Out of caps: they say goodbye and go, and someone else sits down in a while. */
  const getUp = (i: number) => {
    const seat = get().seats[i]
    if (!seat) return
    broke.add(seat.regular.id)
    const bye = talk?.say({ seat: i, regular: seat.regular }, 'goodbye', performance.now())
    if (bye) set({ talk: { id: ++remarkId, seat: i, text: bye, delay: 300 } })
    addLog({ mine: false, text: `${seat.regular.name} is out of caps and leaves the row.` })
    // They stay on their stool to say goodbye before they go.
    after(`leave-${i}`, 4500, () => setSeat(i, null))
    after(`empty-${i}`, between(EMPTY_MS), () => sitDown(i))
  }

  /** Someone takes the empty machine: whoever isn't here and hasn't gone broke tonight. */
  const sitDown = (i: number) => {
    const { seats, machine } = get()
    const rules = rulesOf(machine)
    if (seats[i] || !rules) return
    const here = new Set(seats.flatMap((s) => (s ? [s.regular.id] : [])))
    const away = REGULARS.filter((r) => !here.has(r.id))
    const fresh = away.filter((r) => !broke.has(r.id))
    const free = fresh.length ? fresh : away
    if (!free.length) return
    const regular = free[randInt(rng, free.length)]
    setSeat(i, seatRegular(regular, rules))
    addLog({ mine: false, text: `${regular.name} sits down at the machine on your ${i === 0 ? 'left' : 'right'}.` })
    const hello = talk?.say({ seat: i, regular }, 'hello', performance.now())
    if (hello) set({ talk: { id: ++remarkId, seat: i, text: hello, delay: TALK_DELAY_MS } })
    after(`pull-${i}`, 2500 + nextPullIn(regular, rng), () => regularPull(i))
  }

  // ---- Dottie -------------------------------------------------------------------

  /** Dottie comes down the row: the meter, if it's worth a word, or a call for change. */
  const walk = () => {
    const { machine, meter } = get()
    const rules = rulesOf(machine)
    if (!rules) return
    const reset = meterReset(rules)
    if (performance.now() - lastCallAt > 20_000) {
      if (meter !== null && reset !== null && meter >= reset * METER_WORTH_MENTIONING) sayCall(meterCall(meterCaps(meter)))
      else sayCall(changeCall(rng))
    }
    after('walk', between(WALK_MS), walk)
  }

  // ---- Online -------------------------------------------------------------------

  /** A friend's handle comes down on their machine. */
  const startPlayer = (seat: number, coins: number, stops: Stops) => {
    const { online, machine, meter } = get()
    const rules = rulesOf(machine)
    const player = online?.players[seat]
    if (!online || !rules || !player) return
    if (player.pull && !player.pull.settled) settlePlayer(seat)
    const s = spin(rules, stops, coins, meter)
    const pull: Pull = { id: player.pulls + 1, spin: s, at: performance.now(), settled: false }
    const next: Player = { ...player, pull, pulls: pull.id, net: player.net - s.bet + s.paid }
    set((st) => ({ online: st.online && { ...st.online, players: st.online.players.map((p, i) => (i === seat ? next : p)) } }))
    setMeter(s.meter)
    reelSounds(NEIGHBOR_PAN[sideOf(online, seat)], NEIGHBOR_LEVEL)
    if (quiet) settlePlayer(seat)
    else after(`player-${seat}`, SETTLE_MS, () => settlePlayer(seat))
  }

  /** A friend's reels stop. */
  const settlePlayer = (seat: number) => {
    const { online, machine } = get()
    const rules = rulesOf(machine)
    const player = online?.players[seat]
    if (!online || !rules || !machine || !player?.pull || player.pull.settled) return
    clearTimeout(timers.get(`player-${seat}`))
    timers.delete(`player-${seat}`)
    const s = player.pull.spin
    set((st) => ({ online: st.online && { ...st.online, players: st.online.players.map((p, i) => (i === seat && p?.pull ? { ...p, pull: { ...p.pull, settled: true } } : p)) } }))
    if (quiet) return
    const side = sideOf(online, seat)
    if (s.paid > 0) sound('payout', { pan: NEIGHBOR_PAN[side], level: NEIGHBOR_LEVEL })
    if (isTopAward(s)) {
      sound('jackpot', { pan: NEIGHBOR_PAN[side] * 0.6, level: 0.6 })
      crowdReaction('cheer')
      sayCall(jackpotCall(machineInfo(machine).name, player.name, s.paid, rng), 300)
      addLog({ mine: false, text: `Jackpot for ${player.name}: ${s.paid.toLocaleString()} caps.` })
    } else if (s.paid >= s.bet * BIG_WIN) {
      addLog({ mine: false, text: `${player.name} hits ${s.paid.toLocaleString()} caps.` })
    }
  }

  /** Play one input. A pull that doesn't fit the rules, or a repeated one, is dropped, the same at every table. */
  const play = (entry: Entry) => {
    const { online, machine } = get()
    const rules = rulesOf(machine)
    if (!online || !rules) return
    const seat = entry.seat
    if (isSys(entry.input)) {
      if (entry.input.sys === 'join') {
        if (seat === online.me) {
          // Your seat's last visit, before a reload: the row counts your pulls afresh.
          set({ pulls: 0, net: 0 })
          return
        }
        const name = entry.input.name
        const player: Player = { seat, name, pull: null, pulls: 0, net: 0 }
        set((s) => ({ online: s.online && { ...s.online, players: s.online.players.map((p, i) => (i === seat ? player : p)) } }))
        addLog({ mine: false, text: `${name} sits down at the next machine.` })
      } else if (seat !== online.me) {
        const gone = online.players[seat]
        if (gone) {
          clearTimeout(timers.get(`player-${seat}`))
          set((s) => ({ online: s.online && { ...s.online, players: s.online.players.map((p, i) => (i === seat ? null : p)) } }))
          addLog({ mine: false, text: `${gone.name} gets up from the row.` })
        }
      }
      return
    }
    const input = entry.input as Input
    if (input?.type !== 'pull' || !Number.isInteger(input.coins) || input.coins < 1 || input.coins > MAX_COINS || !isStops(rules, input.stops)) return
    if (seat === online.me) {
      if (input.n !== get().pulls) {
        set({ waiting: false })
        return
      }
      startMine(input.coins, input.stops)
    } else {
      const player = online.players[seat]
      if (!player || input.n !== player.pulls) return
      startPlayer(seat, input.coins, input.stops)
    }
  }

  return {
    sitting: 0,
    machine: null,
    online: null,
    coins: 1,
    pull: null,
    pulls: 0,
    dry: 0,
    net: 0,
    meter: null,
    seats: [],
    log: [],
    call: null,
    talk: null,
    notice: null,
    waiting: false,

    sit: (config) => {
      const rules = MACHINES[config.machine]
      if (!rules || (!config.online && caps() < buyInOf(config.machine))) return false
      clearTimers()
      talk = new RowTalk(createRng(randomSeed()))
      broke.clear()
      const me = config.online?.me ?? 0
      const players: (Player | null)[] = Array.from({ length: ONLINE_SEATS }, () => null)
      for (const p of config.online?.players ?? []) {
        if (p.seat !== me) players[p.seat] = { seat: p.seat, name: p.name, pull: null, pulls: 0, net: 0 }
      }
      // The regulars stay home online.
      const seats: (Seat | null)[] = config.online ? [null, null] : pickRegulars(rng).map((regular) => seatRegular(regular, rules))
      const reset = meterReset(rules)
      const saved = useSave.getState().slots.meter
      // Online, the row starts its own meter; offline it's where the row left it, never below the reset.
      const meter = reset === null ? null : config.online || saved === null ? reset : Math.max(reset, Math.floor(saved))
      const info = machineInfo(config.machine)
      const names = config.online ? players.flatMap((p) => (p ? [p.name] : [])) : seats.flatMap((s) => (s ? [s.regular.name] : []))
      const greeter = seats.length ? randInt(rng, seats.length) : 0
      const hello = !config.online && seats[greeter] ? talk.say({ seat: greeter, regular: seats[greeter]!.regular }, 'hello', -Infinity) : null
      set((s) => ({
        sitting: s.sitting + 1,
        machine: config.machine,
        online: config.online ? { me, host: config.online.host, players, queue: [] } : null,
        coins: 1,
        pull: null,
        pulls: 0,
        dry: 0,
        net: 0,
        meter,
        seats,
        log: [
          {
            id: ++logId,
            mine: false,
            text: `You sit down at ${info.name}, ${info.coinText.toLowerCase()}${names.length ? `, ${config.online ? 'beside' : 'between'} ${names.join(' and ')}` : ''}. ${CHANGE_GIRL} is working the row.`,
          },
        ],
        call: { id: ++remarkId, text: helloCall(config.machine, rng), delay: HELLO_DELAY_MS },
        talk: hello ? { id: ++remarkId, seat: greeter, text: hello, delay: HELLO_DELAY_MS + 3200 } : null,
        notice: null,
        waiting: false,
      }))
      if (meter !== null && !config.online) useSave.getState().updateSlots({ meter })
      seats.forEach((seat, i) => {
        if (seat) after(`pull-${i}`, 1800 + i * 1300 + nextPullIn(seat.regular, rng), () => regularPull(i))
      })
      after('walk', between(WALK_MS), walk)
      return true
    },

    betOne: () => {
      const { machine, coins } = get()
      if (!machine || busy()) return
      sound('coin')
      set({ coins: (coins % MAX_COINS) + 1, notice: null })
    },

    setCoins: (n) => {
      if (!get().machine || busy() || n < 1 || n > MAX_COINS) return
      sound('coin')
      set({ coins: n, notice: null })
    },

    betMax: () => {
      if (!get().machine || busy()) return
      set({ coins: MAX_COINS })
      get().pullHandle()
    },

    pullHandle: () => {
      const { machine, coins, pulls } = get()
      const rules = rulesOf(machine)
      if (!rules) return
      const why = busy()
      if (why) return
      const have = caps()
      if (have < rules.coin) {
        notify(`A coin here is ${rules.coin} caps, and you have ${have}.`)
        return
      }
      if (have < coins * rules.coin) {
        const fits = Math.floor(have / rules.coin)
        set({ coins: fits })
        notify(`You have the caps for ${fits === 1 ? 'one coin' : 'two coins'}. The bet’s down to ${fits}.`)
        return
      }
      if (send) {
        set({ waiting: true, notice: null })
        send({ type: 'pull', n: pulls, coins, stops: spinStops(Math.random, rules) })
        return
      }
      startMine(coins, spinStops(rng, rules))
    },

    pump: (afterEach) => {
      for (;;) {
        const online = get().online
        const entry = online?.queue[0]
        if (!online || !entry) break
        set({ online: { ...online, queue: online.queue.slice(1) } })
        play(entry)
        afterEach?.(entry)
      }
    },

    catchUp: (afterEach) => {
      quiet = true
      try {
        get().pump(afterEach)
      } finally {
        quiet = false
      }
    },

    receive: (entries) => set((s) => ({ online: s.online && { ...s.online, queue: [...s.online.queue, ...entries] } })),

    leave: () => {
      // Reels in motion still pay.
      settleMine()
      clearTimers()
      talk = null
      set({ machine: null, online: null, pull: null, seats: [], log: [], call: null, talk: null, notice: null, waiting: false, meter: null })
    },
  }
})

/**
 * Which side of yours a friend's machine is on, online: the friends in seat
 * order, the first on your left and the second on your right (Table.tsx).
 */
export function sideOf(online: { me: number; players: (Player | null)[] }, seat: number): 0 | 1 {
  const others = online.players.flatMap((p, i) => (p && i !== online.me ? [i] : []))
  return others.indexOf(seat) === 1 ? 1 : 0
}

/** A regular sitting down with a fresh buy-in. */
function seatRegular(regular: Regular, rules: Rules): Seat {
  const memory = freshMemory(regular, rules)
  return { regular, stack: regular.bankroll * rules.coin, memory, pull: null, coins: memory.coins }
}

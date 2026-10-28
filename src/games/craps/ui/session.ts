/**
 * The table you're at: the layout and your chips on it, the dice in the
 * air, the log and the stickman's calls. Not persisted. Caps leave your
 * wallet as they go on the layout and come back as they're paid or taken
 * down, so getting up returns every bet that can come down, and forfeits
 * the contract bets that can't.
 *
 * A roll is decided when it's thrown but only shown when the dice land:
 * `roll` holds the result until then, and `land` (on a timer, or at once
 * if you leave mid-throw) settles it.
 */

import { create } from 'zustand'
import { crowdReaction } from '../../../core/audio/live'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, pick, randomSeed } from '../../../core/rng'
import { useSave } from '../../../store/save'
import { stickmanCall } from '../calls'
import { type Stakes, spotName, stakesById } from '../content'
import {
  type ApplyResult,
  type BetSpot,
  type Dice,
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
  spotInfo,
  summarize,
  unitOf,
} from '../engine'

export interface SitConfig {
  stakesId: string
}

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

/** A word from the dealer about a bet you tried: why it won't go down, or come up. */
export interface Notice {
  id: number
  text: string
}

interface SessionStore {
  /** Increments every time you sit down, so the table remounts. */
  sitting: number
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

/** The roll in the air, and the timer that lands it. */
let inFlight: { result: ApplyResult; timer: number } | null = null

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

/** Plain-language log lines for one roll. */
function describe(events: TableEvent[]): LogEntry[] {
  const lines: LogEntry[] = []
  const add = (text: string, mine = false) => lines.push({ id: ++logId, mine, text })
  for (const e of events) {
    switch (e.type) {
      case 'rolled':
        add(`You roll ${DIE_WORD[e.dice[0]]} and ${DIE_WORD[e.dice[1]]}: ${e.total}${e.dice[0] === e.dice[1] && e.total % 2 === 0 && e.total > 2 && e.total < 12 ? ' the hard way' : ''}.`)
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

  /** Apply a bet or take-down, moving the caps. */
  const change = (state: TableState, action: { type: 'bet'; spot: BetSpot; amount: number } | { type: 'down'; spot: BetSpot }) => {
    const { state: next, events } = apply(state, action, caps())
    const save = useSave.getState()
    for (const e of events) {
      if (e.type === 'bet') save.adjustCaps(-e.amount)
      else if (e.type === 'down') save.adjustCaps(e.amount)
    }
    return next
  }

  /** The dice come to rest: settle the roll, pay out, and call it. */
  const land = () => {
    if (!inFlight) return
    const { result } = inFlight
    window.clearTimeout(inFlight.timer)
    inFlight = null
    const { state: next, events } = result
    const { paid, lost, back } = summarize(events)
    const save = useSave.getState()
    if (back > 0) save.adjustCaps(back)
    const decided = events.some((e) => e.type === 'won' || e.type === 'lost' || e.type === 'pushed' || e.type === 'returned')
    const net = paid - lost
    if (decided) save.recordResult('craps', net > 0 ? 'win' : net < 0 ? 'loss' : 'draw', net)

    // The chips get pushed, and the room reacts to the big moments.
    if (paid > 0) playSfx('chips', { delay: 0.25 })
    const change = events.find((e) => e.type === 'point-made' || e.type === 'seven-out')
    if (change?.type === 'point-made') {
      crowdReaction('cheer')
      if (net > 0) playSfx('win', { delay: 0.35 })
    } else if (change?.type === 'seven-out') {
      crowdReaction('groan')
      if (net < 0) playSfx('lose', { delay: 0.4 })
    } else if (net > 0 && paid >= 10 * Math.max(1, lost) && paid >= (get().stakes?.limits.min ?? 0) * 4) {
      playSfx('win', { delay: 0.3 })
    }
    const lostBets = events.flatMap((e) => (e.type === 'lost' ? [{ spot: e.spot, amount: e.bet }] : []))

    const lines = describe(events)
    const mineDecided = events.filter((e) => e.type === 'won' || e.type === 'lost').length
    if (mineDecided > 1 && net !== 0) lines.push({ id: ++logId, mine: true, text: net > 0 ? `You’re up ${net.toLocaleString()} caps on the roll.` : `You’re down ${(-net).toLocaleString()} caps on the roll.` })
    const text = stickmanCall(events, rng)

    set((s) => ({
      state: next,
      dice: s.dice ? { ...s.dice, landed: true } : null,
      settled: { id: next.rolls, events, net, decided },
      lost: lostBets.length > 0 ? lostBets : s.lost,
      log: [...s.log, ...lines].slice(-150),
      call: text ? { id: ++remarkId, text, delay: 0 } : s.call,
    }))
  }

  return {
    sitting: 0,
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
    notice: null,

    sit: (config) => {
      const stakes = stakesById(config.stakesId)
      if (caps() < stakes.limits.min) return false
      set((s) => ({
        sitting: s.sitting + 1,
        stakes,
        state: createTable({ limits: stakes.limits, seed: randomSeed() }),
        chip: stakes.chips[1] ?? stakes.chips[0],
        takingDown: false,
        focus: null,
        dice: null,
        settled: null,
        lost: [],
        log: [{ id: ++logId, mine: false, text: `You step up to the rail at the ${stakes.name.toLowerCase()} table. ${stakes.stickman.name} is on the stick, and the dice are yours.` }],
        call: { id: ++remarkId, text: pick(stakes.stickman.hello, rng), delay: HELLO_DELAY_MS },
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
      playSfx('chip')
      const note = roundingNote(state, spot, chip, amount)
      set({
        state: change(state, { type: 'bet', spot, amount: add }),
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
      playSfx('chips')
      set({ state: change(state, { type: 'down', spot }), notice: null })
    },

    clear: () => {
      let { state } = get()
      if (!state || inFlight) return
      let any = false
      for (const spot of activeSpots(state.bets)) {
        if (!canTakeDown(state, spot)) continue
        state = change(state, { type: 'down', spot })
        any = true
      }
      if (!any) return
      playSfx('chips')
      set({ state, notice: null })
    },

    rebet: () => {
      let { state } = get()
      const { lost } = get()
      if (!state || inFlight || lost.length === 0) return
      let placed = 0
      for (const { spot, amount } of lost) {
        // A come bet that travelled goes back in the come box; its odds wait for it to travel again.
        const { kind } = spotInfo(spot)
        const target: BetSpot = kind === 'come-point' ? 'come' : kind === 'dont-come-point' ? 'dont-come' : spot
        const add = amount - betOn(state, target)
        if (add <= 0 || !isLegal(state, { type: 'bet', spot: target, amount: add }, caps())) continue
        state = change(state, { type: 'bet', spot: target, amount: add })
        placed++
      }
      if (placed === 0) {
        notify('Those bets can’t go back down right now.')
        return
      }
      playSfx('chip')
      set({ state, notice: null })
    },

    roll: () => {
      const { state } = get()
      if (!state || inFlight) return
      if (needsLineBet(state)) {
        notify('The shooter needs a bet on the pass line or don’t pass to come out.')
        return
      }
      const result = apply(state, { type: 'roll' })
      const dice = result.state.history[0]
      playSfx('dice')
      inFlight = { result, timer: window.setTimeout(land, LAND_MS) }
      set({ dice: { id: result.state.rolls, dice, landed: false }, notice: null, focus: null })
    },

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
      set({ stakes: null, state: null, dice: null, settled: null, lost: [], log: [], call: null, notice: null, focus: null, takingDown: false })
    },
  }
})

/** On the come-out, the shooter has to have a line bet to roll. */
export const needsLineBet = (state: TableState): boolean => state.point === null && betOn(state, 'pass') === 0 && betOn(state, 'dont-pass') === 0

/** What a getup would cost you: contract bets, which can't come down. */
export function forfeitOf(state: TableState | null): number {
  if (!state) return 0
  return activeSpots(state.bets).reduce((n, spot) => n + (canTakeDown(state, spot) ? 0 : betOn(state, spot)), 0)
}

/**
 * The table you're sitting at: the round in play, who's in each seat, and
 * caps moving between your wallet and the felt. Not persisted. Caps go on
 * the table when they're bet, so leaving mid-round forfeits them.
 */

import { create } from 'zustand'
import { cardLabel } from '../../../core/cards'
import { crowdReaction } from '../../../core/audio/live'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, pick, randomSeed } from '../../../core/rng'
import { useSave } from '../../../store/save'
import { TableTalk, type Talker, dealerCall } from '../banter'
import { type BetMemory, botAction, botBet, freshMemory, remember } from '../bots'
import { REGULARS, type Regular, SPOTS, type Stakes, type TableMode, YOUR_SPOT, seatRegulars, stakesById } from '../content'
import {
  type Action,
  type PlayerAction,
  type TableEvent,
  type TableState,
  actor,
  apply,
  createTable,
  currentHand,
  handTotal,
  isLegal,
  legalActions,
  upCard,
} from '../engine'
import { ACTION_LABEL, basicStrategy, describeHand, describeUp } from '../strategy'

export interface SitConfig {
  mode: TableMode
  stakesId: string
}

export interface Occupant {
  regular: Regular
  stack: number
  memory: BetMemory
  /** Broke: they get up before the next deal. */
  leaving: boolean
}

export interface LogEntry {
  id: number
  /** About your hand, so it stands out. */
  mine: boolean
  text: string
}

/** Something said at the table: by a regular in a seat, or by the dealer. */
export interface Remark {
  id: number
  spot: number | 'dealer'
  text: string
  /** Milliseconds to wait before showing it, so the cards land first. */
  delay: number
}

/** Your result for the round just paid. */
export interface RoundResult {
  staked: number
  returned: number
}

interface SessionStore {
  /** Increments every time you sit down, so the table remounts. */
  sitting: number
  config: SitConfig | null
  stakes: Stakes | null
  state: TableState | null
  /** Who's in each spot. Yours is always null; so are empty seats. */
  seats: (Occupant | null)[]
  /** Your bet for the next deal. */
  bet: number
  log: LogEntry[]
  /** The regulars' latest remark. */
  talk: Remark | null
  /** The dealer's latest call. */
  call: Remark | null
  result: RoundResult | null
  sit: (config: SitConfig) => boolean
  /** Add a chip to your bet, within the table maximum and your caps. */
  addChip: (value: number) => void
  clearBet: () => void
  deal: () => boolean
  /** Your decision on your hand. */
  act: (action: PlayerAction) => void
  insure: (take: boolean) => void
  /** The dealer's or a regular's next move. Does nothing while it's your turn. */
  step: () => void
  /** Get up. Anything still on the table this round is lost. */
  leave: () => void
}

let logId = 0
let remarkId = 0
let talk: TableTalk | null = null
const rng = createRng(randomSeed())

const REMARK_DELAY_MS = 500
const HELLO_DELAY_MS = 900

const caps = () => useSave.getState().wallet.caps

/** Stereo position of each spot, as you see the table: first base is on your right. */
export const SPOT_PAN = [0.55, 0.3, 0, -0.3, -0.55]

const nameOf = (seats: (Occupant | null)[], spot: number) => (spot === YOUR_SPOT ? 'You' : (seats[spot]?.regular.name ?? 'Someone'))

const totalText = (cards: Parameters<typeof handTotal>[0]) => {
  const { total, soft } = handTotal(cards)
  return soft && total < 21 ? `soft ${total}` : String(total)
}

/** What's on the felt for you this round, insurance included. */
export function yourStake(state: TableState | null): number {
  if (!state || state.phase === 'settled' || state.phase === 'betting') return 0
  const spot = state.spots[YOUR_SPOT]
  return spot.hands.reduce((n, h) => n + h.bet, 0) + (spot.insurance ?? 0)
}

/** Plain-language log lines for one step. */
function describe(before: TableState, events: TableEvent[], after: TableState, seats: (Occupant | null)[]): LogEntry[] {
  const lines: LogEntry[] = []
  const add = (text: string, mine = false) => lines.push({ id: ++logId, mine, text })
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    switch (e.type) {
      case 'shuffled':
        add('The dealer shuffles a fresh shoe.')
        break
      case 'insured':
        if (e.amount > 0) add(`${nameOf(seats, e.spot)} ${e.spot === YOUR_SPOT ? 'take' : 'takes'} insurance for ${e.amount}.`, e.spot === YOUR_SPOT)
        else if (e.spot === YOUR_SPOT) add('You decline insurance.', true)
        break
      case 'peeked':
        add(e.blackjack ? 'The dealer checks the hole card: blackjack.' : 'The dealer checks the hole card: no blackjack.')
        break
      case 'revealed':
        add(`The dealer turns over ${cardLabel(e.card)}: ${totalText(after.dealer.slice(0, 2))}.`)
        break
      case 'acted': {
        const you = e.spot === YOUR_SPOT
        const who = nameOf(seats, e.spot)
        const verb = { hit: you ? 'hit' : 'hits', stand: you ? 'stand' : 'stands', double: you ? 'double' : 'doubles', split: you ? 'split' : 'splits' }[e.action]
        const hands = after.spots[e.spot].hands
        if (e.action === 'stand') {
          add(`${who} ${verb} on ${totalText(before.spots[e.spot].hands[e.hand].cards)}.`, you)
        } else if (e.action === 'split') {
          add(`${who} ${verb} ${describeHand(before.spots[e.spot].hands[e.hand].cards)}.`, you)
        } else {
          const drawn = events.slice(i + 1).find((d) => d.type === 'dealt' && d.to === e.spot)
          const hand = hands[e.hand]
          const busted = hand.outcome === 'bust'
          const card = drawn?.type === 'dealt' ? cardLabel(drawn.card) : ''
          add(`${who} ${verb}: ${card}, ${busted ? `bust with ${handTotal(hand.cards).total}` : totalText(hand.cards)}.`, you)
        }
        break
      }
      case 'dealt':
        if (e.to === 'dealer' && before.phase === 'dealer') add(`The dealer draws ${cardLabel(e.card)}: ${totalText(after.dealer)}.`)
        break
      case 'dealer-done':
        add(e.busted ? `The dealer busts with ${e.total}.` : `The dealer stands on ${e.total}.`)
        break
      case 'settled': {
        const mine = e.results.find((r) => r.spot === YOUR_SPOT)
        if (!mine) break
        const net = mine.returned - mine.staked
        const blackjack = after.spots[YOUR_SPOT].hands.some((h) => h.outcome === 'blackjack')
        if (net > 0) add(blackjack ? `Blackjack! You win ${net} caps.` : `You win ${net} caps.`, true)
        else if (net < 0) add(`You lose ${-net} caps.`, true)
        else add('Push. Your caps come back.', true)
        break
      }
    }
  }
  // When the opening deal is done: what you've got, and what the dealer shows.
  if (before.phase === 'dealing' && after.phase !== 'dealing') {
    const hand = after.spots[YOUR_SPOT].hands[0]
    const up = upCard(after)
    if (hand && up) add(`You have ${hand.cards.map(cardLabel).join(' ')} (${totalText(hand.cards)}). The dealer shows ${cardLabel(up)}.`, true)
  }
  return lines
}

function playStepSounds(events: TableEvent[]) {
  let chips = 0
  for (const e of events) {
    if (e.type === 'shuffled') playSfx('shuffle')
    else if (e.type === 'dealt') playSfx('deal', { pan: e.to === 'dealer' ? 0 : SPOT_PAN[e.to] * 0.6 })
    else if (e.type === 'revealed') playSfx('flip', { delay: 0.05 })
    else if (e.type === 'staked') playSfx('chip', { pan: SPOT_PAN[e.spot] * 0.6, delay: 0.04 * chips++ })
    else if (e.type === 'busted') playSfx('remove', { pan: SPOT_PAN[e.spot] * 0.6, delay: 0.3 })
  }
}

/** The chips get pushed, and the room reacts to your blackjacks and your big hands. */
function playResultSounds(state: TableState, result: RoundResult) {
  const hands = state.spots[YOUR_SPOT].hands
  const net = result.returned - result.staked
  const big = (h: (typeof hands)[number]) => h.doubled || h.split
  window.setTimeout(() => {
    if (result.returned > 0) playSfx('chips', { pan: 0 })
    if (hands.some((h) => h.outcome === 'blackjack')) {
      playSfx('win', { delay: 0.2 })
      crowdReaction('cheer')
    } else if (net > 0 && hands.some((h) => big(h) && h.outcome === 'win')) {
      crowdReaction('cheer')
    } else if (net < 0 && hands.some(big)) {
      crowdReaction('groan')
    }
  }, 350)
}

const talkers = (seats: (Occupant | null)[]): Talker[] =>
  seats.flatMap((o, spot) => (o ? [{ spot, id: o.regular.id, banter: o.regular.banter }] : []))

export const useSession = create<SessionStore>()((set, get) => {
  /** Apply one action and everything that follows from it: caps, sounds, the log, the talk. */
  const run = (action: Action, available: number) => {
    const { state, seats, log, talk: lastTalk, call: lastCall, stakes } = get()
    if (!state || !stakes) return
    const { state: next, events } = apply(state, action, available)

    let nextSeats = seats
    let result: RoundResult | null = get().result
    const leaving: Occupant[] = []
    for (const e of events) {
      if (e.type === 'staked') {
        if (e.spot === YOUR_SPOT) useSave.getState().adjustCaps(-e.amount)
        else nextSeats = nextSeats.map((o, i) => (i === e.spot && o ? { ...o, stack: o.stack - e.amount } : o))
      } else if (e.type === 'settled') {
        for (const r of e.results) {
          const net = r.returned - r.staked
          if (r.spot === YOUR_SPOT) {
            result = { staked: r.staked, returned: r.returned }
            const save = useSave.getState()
            save.adjustCaps(r.returned)
            save.recordResult('blackjack', net > 0 ? 'win' : net < 0 ? 'loss' : 'draw', net)
            continue
          }
          nextSeats = nextSeats.map((o, i) => {
            if (i !== r.spot || !o) return o
            const stack = o.stack + r.returned
            const broke = stack < stakes.limits.min
            // What they bet on the deal, before any double.
            const first = next.spots[i].hands[0]
            const bet = first ? (first.doubled ? first.bet / 2 : first.bet) : 0
            const updated = { ...o, stack, memory: remember(bet, net), leaving: broke }
            if (broke) leaving.push(updated)
            return updated
          })
        }
      }
    }

    playStepSounds(events)
    if (result && result !== get().result) playResultSounds(next, result)

    const said = talk?.react(state, events, next, talkers(nextSeats))
    let remark: Remark | null = said ? { id: ++remarkId, spot: said.spot, text: said.text, delay: REMARK_DELAY_MS } : lastTalk
    for (const o of leaving) {
      const spot = nextSeats.findIndex((s) => s?.regular.id === o.regular.id)
      const bye = talk?.say({ spot, id: o.regular.id, banter: o.regular.banter }, 'goodbye')
      if (bye) remark = { id: ++remarkId, spot, text: bye, delay: REMARK_DELAY_MS + 600 }
    }
    const callText = dealerCall(state, events, next, YOUR_SPOT)
    const call = callText ? { id: ++remarkId, spot: 'dealer' as const, text: callText, delay: 250 } : lastCall

    set({
      state: next,
      seats: nextSeats,
      log: [...log, ...describe(state, events, next, nextSeats), ...leaving.map((o) => ({ id: ++logId, mine: false, text: `${o.regular.name} is out of caps and gets up.` }))].slice(-120),
      talk: remark,
      call,
      result,
      // A rebet can't be more than you have left.
      bet: Math.min(get().bet, caps()),
    })
  }

  return {
    sitting: 0,
    config: null,
    stakes: null,
    state: null,
    seats: [],
    bet: 0,
    log: [],
    talk: null,
    call: null,
    result: null,

    sit: (config) => {
      const stakes = stakesById(config.stakesId)
      if (caps() < stakes.limits.min) return false
      const state = createTable({ spots: SPOTS, limits: stakes.limits, seed: randomSeed() })
      talk = new TableTalk(createRng(randomSeed()), YOUR_SPOT)
      const regulars = config.mode === 'full' ? seatRegulars(rng) : []
      const seats: (Occupant | null)[] = Array.from({ length: SPOTS }, () => null)
      ;[0, 1, 3, 4].forEach((spot, k) => {
        const regular = regulars[k]
        if (regular) seats[spot] = { regular, stack: regular.bankroll * stakes.limits.min, memory: freshMemory(), leaving: false }
      })
      // One of the regulars says hello once everyone's settled in; the dealer greets you first.
      const greeters = talkers(seats)
      const hello = greeters.length ? pick(greeters, rng) : null
      const helloText = hello ? talk.say(hello, 'hello') : null
      set((s) => ({
        sitting: s.sitting + 1,
        config,
        stakes,
        state,
        seats,
        bet: Math.min(stakes.limits.min, caps()),
        log: [{ id: ++logId, mine: false, text: `You sit down at the ${stakes.name.toLowerCase()} table. ${stakes.dealer.name} is dealing.` }],
        talk: hello && helloText ? { id: ++remarkId, spot: hello.spot, text: helloText, delay: HELLO_DELAY_MS + 1600 } : null,
        call: { id: ++remarkId, spot: 'dealer', text: pick(stakes.dealer.hello, rng), delay: HELLO_DELAY_MS },
        result: null,
      }))
      return true
    },

    addChip: (value) => {
      const { stakes, bet } = get()
      if (!stakes || !canBet(get().state)) return
      const next = Math.min(bet + value, stakes.limits.max, caps())
      if (next === bet) {
        playSfx('error')
        return
      }
      playSfx('chip', { pan: 0 })
      set({ bet: next })
    },

    clearBet: () => {
      if (!canBet(get().state)) return
      set({ bet: 0 })
    },

    deal: () => {
      const { state, stakes, bet, seats } = get()
      if (!state || !stakes || !canBet(state)) return false
      if (bet < stakes.limits.min || bet > caps()) {
        playSfx('error')
        return false
      }

      // Broke regulars get up; at a full table, someone new takes an empty seat.
      let nextSeats = seats.map((o) => (o?.leaving ? null : o))
      let arrival: { spot: number; regular: Regular } | null = null
      if (get().config?.mode === 'full') {
        const empty = [0, 1, 3, 4].filter((spot) => !nextSeats[spot])
        const seated = new Set(nextSeats.flatMap((o) => (o ? [o.regular.id] : [])))
        const free = REGULARS.filter((r) => !seated.has(r.id))
        if (empty.length && free.length && seats.every((o) => !o?.leaving)) {
          arrival = { spot: pick(empty, rng), regular: pick(free, rng) }
          nextSeats = nextSeats.map((o, i) =>
            i === arrival!.spot ? { regular: arrival!.regular, stack: arrival!.regular.bankroll * stakes.limits.min, memory: freshMemory(), leaving: false } : o,
          )
        }
      }

      const bets = nextSeats.map((o, spot) => (spot === YOUR_SPOT ? bet : o ? botBet(o.regular.style, o.memory, state, o.stack) : 0))
      if (!isLegal(state, { type: 'deal', bets })) return false
      if (!useSave.getState().spendCaps(bet)) return false
      nextSeats = nextSeats.map((o, spot) => (o ? { ...o, stack: o.stack - bets[spot] } : o))
      bets.forEach((b, spot) => b > 0 && playSfx('chip', { pan: SPOT_PAN[spot] * 0.6, delay: 0.05 * spot }))

      set({ seats: nextSeats, result: null })
      run({ type: 'deal', bets }, Infinity)
      if (arrival) {
        const hello = talk?.say({ spot: arrival.spot, id: arrival.regular.id, banter: arrival.regular.banter }, 'hello')
        set((s) => ({
          log: [...s.log, { id: ++logId, mine: false, text: `${arrival.regular.name} sits down.` }],
          talk: hello ? { id: ++remarkId, spot: arrival.spot, text: hello, delay: 300 } : s.talk,
        }))
      }
      return true
    },

    act: (action) => {
      const { state } = get()
      if (!state || state.phase !== 'playing' || actor(state) !== YOUR_SPOT) return
      const available = caps()
      if (!isLegal(state, { type: action }, available)) {
        playSfx('error')
        return
      }
      const hand = currentHand(state)!
      const up = upCard(state)!
      const allowed = new Set(legalActions(state, available).map((a) => a.type))
      const book = basicStrategy(hand.cards, up, { canDouble: allowed.has('double'), canSplit: allowed.has('split') })
      run({ type: action }, available)
      if (book !== action && useSave.getState().blackjack.coach) {
        set((s) => ({
          log: [
            ...s.log,
            { id: ++logId, mine: true, text: `Coach: the book says ${ACTION_LABEL[book].toLowerCase()} on ${describeHand(hand.cards)} against ${describeUp(up)}.` },
          ],
        }))
      }
    },

    insure: (take) => {
      const { state } = get()
      if (!state || state.phase !== 'insurance' || actor(state) !== YOUR_SPOT) return
      const available = caps()
      if (!isLegal(state, { type: 'insurance', take }, available)) {
        playSfx('error')
        return
      }
      run({ type: 'insurance', take }, available)
      if (take && useSave.getState().blackjack.coach) {
        set((s) => ({ log: [...s.log, { id: ++logId, mine: true, text: 'Coach: the book never takes insurance. It only pays when the shoe is rich in tens.' }] }))
      }
    },

    step: () => {
      const { state, seats } = get()
      if (!state) return
      const who = actor(state)
      if (who === 'dealer') run({ type: 'next' }, Infinity)
      else if (who !== null && who !== YOUR_SPOT) {
        const occupant = seats[who]
        if (!occupant) return
        run(botAction(occupant.regular.style, state, occupant.stack), occupant.stack)
      }
    },

    leave: () => {
      const staked = yourStake(get().state)
      if (staked > 0) useSave.getState().recordResult('blackjack', 'loss', -staked)
      talk = null
      set({ config: null, stakes: null, state: null, seats: [], bet: 0, log: [], talk: null, call: null, result: null })
    },
  }
})

/** Bets go down between rounds. */
export const canBet = (state: TableState | null): boolean => !!state && (state.phase === 'betting' || state.phase === 'settled')

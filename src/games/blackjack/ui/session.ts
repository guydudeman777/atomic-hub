/**
 * The table you're sitting at: the round in play, who's in each seat, and
 * caps moving between your wallet and the felt. Not persisted. Caps go on
 * the table when they're bet, so leaving mid-round forfeits them.
 *
 * Online, friends sit in other spots. Every browser at the table runs this
 * same session from the host's seed, and what the players do arrives as
 * numbered inputs (net/link.ts): a bet for the next round, a decision on a
 * hand, insurance. Each input waits in `queue` until the table is ready for
 * it (`pump`): a decision on a hand waits for that hand's turn, and the deal
 * waits until every player has bet. The dealer and the regulars play the
 * same everywhere, since all their choices come from the shared seed. Each
 * browser only moves its own player's caps.
 */

import { create } from 'zustand'
import { cardLabel } from '../../../core/cards'
import { crowdReaction } from '../../../core/audio/live'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, pick, randomSeed } from '../../../core/rng'
import { useSave } from '../../../store/save'
import { type Scripted, TableTalk, type Talker, dealerCall } from '../banter'
import { type BetMemory, botAction, botBet, freshMemory, remember } from '../bots'
import { type Entry, isSys } from '../../../net/link'
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
  dealerHasBlackjack,
  handTotal,
  isLegal,
  legalActions,
  upCard,
} from '../engine'
import { ACTION_LABEL, basicStrategy, describeHand, describeUp } from '../strategy'
import { type Mood, type Scene, calmMood, headline, moodAfter, sceneAfter, sting, vacancyRounds } from '../tilt'

export interface SitConfig {
  mode: TableMode
  stakesId: string
  /** Online: the shared seed, your spot, and the other players by spot. */
  online?: { seed: number; me: number; humans: (Human | null)[] }
}

/** Another player at an online table. */
export interface Human {
  /** Their seat at the table link. */
  seat: number
  name: string
  /** Their line dropped or they got up: their hands stand, and the spot clears before the next deal. */
  gone: boolean
}

/**
 * What players send at an online table. `available` is their caps, for
 * doubles, splits and insurance. Each says where in the game it was made
 * (the round, and for a decision the hand and its cards), so a repeat that
 * arrives after the moment has passed is dropped rather than played later.
 */
export type Input =
  | { type: 'bet'; round: number; amount: number }
  | { type: 'act'; round: number; hand: number; cards: number; action: PlayerAction; available: number }
  | { type: 'insure'; round: number; take: boolean; available: number }
  /** Host: deal now, with whoever has bet. */
  | { type: 'deal-now'; round: number }

/** Your input for the moment the table's at, to send. */
export function inputFor(state: TableState, move: { type: 'bet'; amount: number } | { type: 'act'; action: PlayerAction } | { type: 'insure'; take: boolean } | { type: 'deal-now' }): Input {
  const round = state.round
  switch (move.type) {
    case 'bet':
      return { type: 'bet', round, amount: move.amount }
    case 'deal-now':
      return { type: 'deal-now', round }
    case 'insure':
      return { type: 'insure', round, take: move.take, available: caps() }
    case 'act': {
      const turn = state.turn
      const cards = turn ? (state.spots[turn.spot].hands[turn.hand]?.cards.length ?? 0) : 0
      return { type: 'act', round, hand: turn?.hand ?? 0, cards, action: move.action, available: caps() }
    }
  }
}

/** Online spots by link seat: the host in the middle, then outward. */
export const SPOT_OF_SEAT = [2, 3, 1, 4, 0]

export interface Occupant {
  regular: Regular
  stack: number
  memory: BetMemory
  mood: Mood
  /** Why they get up before the next deal: out of caps, storming off, or thrown out. */
  leaving: false | 'broke' | 'quit' | 'kicked'
}

/** A regular blowing up at the table: the felt shakes under their fist. */
export interface Fx {
  id: number
  kind: 'slam'
  spot: number
  /** Milliseconds from now, in step with what they say. */
  delay: number
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
  /** Said in a temper. */
  angry?: boolean
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
  /** Your spot: the middle one, unless an online table put you elsewhere. */
  me: number
  /** Online: the other players, by spot. */
  humans: (Human | null)[]
  /** Online: each player's bet for the next deal, by spot, once they've placed it. */
  ready: (number | null)[]
  /** Online: inputs that arrived before the table was ready for them. */
  queue: Entry[]
  stakes: Stakes | null
  state: TableState | null
  /** Who's in each spot. Yours is always null; so are empty seats. */
  seats: (Occupant | null)[]
  /** For each empty seat, the rounds left before someone new sits down. */
  waits: number[]
  /** Regulars thrown out this sitting. They don't come back. */
  banned: string[]
  fx: Fx | null
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
  /** The dealer's or a regular's next move. Does nothing while it's a player's turn. */
  step: () => void
  /** Online: play waiting inputs the table is ready for, calling `after` as each one is played. */
  pump: (after?: (entry: Entry) => void) => void
  /** Online: play everything waiting at once, the dealer and the regulars included, without a sound. */
  catchUp: (after?: (entry: Entry) => void) => void
  /** Online: inputs from the table link, in order. */
  receive: (entries: Entry[]) => void
  /** Get up. Anything still on the table this round is lost. */
  leave: () => void
}

let logId = 0
let remarkId = 0
let talk: TableTalk | null = null
/** The table's shared randomness: who sits down, and how tempers flare. Seeded by the host online. */
let rng = createRng(randomSeed())
/**
 * Catching up on an online table's past: everything is played through, but
 * quietly, and without touching your caps or your record. Those rounds
 * happened before you sat down (or before you reloaded the page).
 */
let quiet = false

const REMARK_DELAY_MS = 500
const HELLO_DELAY_MS = 900
/** A scene waits for the chips to be paid, so everyone sees what they lost. */
const SCENE_DELAY_MS = 900
let fxId = 0

interface Staging {
  /** What they say. */
  line: Scripted
  /** What the dealer says first, if anything. */
  call?: string
  slam: boolean
  /** Whether they get up after the round. */
  leave: Occupant['leaving']
  log: (name: string, said: string | null) => string
}

const quote = (said: string | null) => (said ? `: “${said}”` : '.')

/** How a scene plays out at the table. */
function stage(scene: Scene, o: Occupant): Staging {
  switch (scene.kind) {
    case 'kicked':
      return scene.why === 'counting'
        ? {
            line: 'kickedOut',
            call: 'Sir, the pit boss would like a word.',
            slam: false,
            leave: 'kicked',
            log: (name, said) => `The pit boss has a word with ${name}, who colors up and leaves${quote(said)}`,
          }
        : {
            line: 'kickedOut',
            call: 'Security. That’s enough, sir.',
            slam: true,
            leave: 'kicked',
            log: (name, said) => `Security walks ${name} out for slamming the table${quote(said)}`,
          }
    case 'quit':
      return {
        line: 'rageQuit',
        slam: scene.slam && o.regular.banter.lines.mySlam !== undefined,
        leave: 'quit',
        log: (name, said) => `${name} ${scene.slam ? 'slams the table and ' : ''}storms off${quote(said)}`,
      }
    case 'slam':
      return { line: 'mySlam', slam: true, leave: false, log: (name, said) => `${name} slams the table${quote(said)}` }
    case 'curse':
      return { line: 'myCurse', slam: false, leave: false, log: (name, said) => `${name} mutters${quote(said)}` }
  }
}

const caps = () => useSave.getState().wallet.caps

/** Stereo position of each spot, as you see the table: first base is on your right. */
export const SPOT_PAN = [0.55, 0.3, 0, -0.3, -0.55]

/** Who's in a spot, for the log: you, a regular, or another player. */
type Names = (spot: number) => string

const totalText = (cards: Parameters<typeof handTotal>[0]) => {
  const { total, soft } = handTotal(cards)
  return soft && total < 21 ? `soft ${total}` : String(total)
}

/** What's on the felt for you this round, insurance included. */
export function yourStake(state: TableState | null, me = YOUR_SPOT): number {
  if (!state || state.phase === 'settled' || state.phase === 'betting') return 0
  const spot = state.spots[me]
  return spot.hands.reduce((n, h) => n + h.bet, 0) + (spot.insurance ?? 0)
}

/** Plain-language log lines for one step. */
function describe(before: TableState, events: TableEvent[], after: TableState, nameOf: Names, me: number): LogEntry[] {
  const YOUR_SPOT = me
  const lines: LogEntry[] = []
  const add = (text: string, mine = false) => lines.push({ id: ++logId, mine, text })
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    switch (e.type) {
      case 'shuffled':
        add('The dealer shuffles a fresh shoe.')
        break
      case 'insured':
        if (e.amount > 0) add(`${nameOf(e.spot)} ${e.spot === YOUR_SPOT ? 'take' : 'takes'} insurance for ${e.amount}.`, e.spot === YOUR_SPOT)
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
        const who = nameOf(e.spot)
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
function playResultSounds(state: TableState, result: RoundResult, me: number) {
  const hands = state.spots[me].hands
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

/** A regular taking a seat with a fresh buy-in, in a good mood. */
const seatRegular = (regular: Regular, stakes: Stakes): Occupant => ({
  regular,
  stack: regular.bankroll * stakes.limits.min,
  memory: freshMemory(),
  mood: calmMood(),
  leaving: false,
})

const talkers = (seats: (Occupant | null)[]): Talker[] =>
  seats.flatMap((o, spot) => (o ? [{ spot, id: o.regular.id, banter: o.regular.banter }] : []))

export const useSession = create<SessionStore>()((set, get) => {
  /** You, a regular, or another player. */
  const nameOf: Names = (spot) => (spot === get().me ? 'You' : (get().seats[spot]?.regular.name ?? get().humans[spot]?.name ?? 'Someone'))

  /** Apply one action and everything that follows from it: caps, sounds, the log, the talk. */
  const run = (action: Action, available: number) => {
    const { state, seats, log, talk: lastTalk, call: lastCall, stakes, me } = get()
    if (!state || !stakes) return
    const { state: next, events } = apply(state, action, available)

    let nextSeats = seats
    let result: RoundResult | null = get().result
    const leaving: Occupant[] = []
    const scenes: { spot: number; scene: Scene }[] = []
    const banned = get().banned.slice()
    for (const e of events) {
      if (e.type === 'staked') {
        if (e.spot === me) {
          if (!quiet) useSave.getState().adjustCaps(-e.amount)
        }
        else nextSeats = nextSeats.map((o, i) => (i === e.spot && o ? { ...o, stack: o.stack - e.amount } : o))
      } else if (e.type === 'settled') {
        for (const r of e.results) {
          const net = r.returned - r.staked
          if (r.spot === me) {
            result = { staked: r.staked, returned: r.returned }
            if (quiet) continue
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
            const mood = moodAfter(o.mood, net)
            const updated: Occupant = { ...o, stack, memory: remember(bet, net), mood, leaving: broke ? 'broke' : o.leaving }
            if (broke) {
              leaving.push(updated)
            } else if (!o.leaving) {
              const buyIn = o.regular.bankroll * stakes.limits.min
              const scene = sceneAfter(
                {
                  temper: o.regular.temper,
                  mood,
                  sting: sting(next.spots[i].hands, net, mood.losses, dealerHasBlackjack(next)),
                  down: Math.max(0, (buyIn - stack) / buyIn),
                  hotBet: o.regular.style.betting === 'spread' && bet >= stakes.limits.min * 6,
                },
                rng,
              )
              if (scene) scenes.push({ spot: i, scene })
            }
            return updated
          })
        }
      }
    }

    // The round's scene, if anyone makes one: the most dramatic wins.
    const scene = headline(scenes)
    let fx: Fx | null = get().fx
    let sceneTalk: Remark | null = null
    let sceneCall: Remark | null = null
    const sceneLog: LogEntry[] = []
    if (scene && nextSeats[scene.spot]) {
      const o = nextSeats[scene.spot]!
      const { line, call, slam, leave, log: logText } = stage(scene.scene, o)
      const text = talk?.say({ spot: scene.spot, id: o.regular.id, banter: o.regular.banter }, line) ?? null
      const mood = slam ? { ...o.mood, slams: o.mood.slams + 1 } : o.mood
      nextSeats = nextSeats.map((s, i) => (i === scene.spot && s ? { ...s, mood, leaving: leave } : s))
      if (slam && !quiet) {
        fx = { id: ++fxId, kind: 'slam', spot: scene.spot, delay: SCENE_DELAY_MS }
        playSfx('slam', { pan: SPOT_PAN[scene.spot] * 0.7, delay: SCENE_DELAY_MS / 1000 })
      }
      if (call) sceneCall = { id: ++remarkId, spot: 'dealer', text: call, delay: SCENE_DELAY_MS + (slam ? 500 : 0) }
      // Fists and storming off are said in a temper; a counter takes the pit boss calmly.
      const angry = slam || scene.scene.kind === 'quit'
      if (text) sceneTalk = { id: ++remarkId, spot: scene.spot, text, delay: SCENE_DELAY_MS + (call ? 900 : 0), angry: angry || undefined }
      if ((leave === 'kicked' || (slam && rng() < 0.5)) && !quiet) window.setTimeout(() => crowdReaction('laugh'), SCENE_DELAY_MS + 400)
      sceneLog.push({ id: ++logId, mine: false, text: logText(o.regular.name, text) })
      if (leave === 'kicked') banned.push(o.regular.id)
    }

    if (!quiet) playStepSounds(events)
    if (result && result !== get().result && !quiet) playResultSounds(next, result, me)

    const said = talk?.react(state, events, next, talkers(nextSeats))
    let remark: Remark | null = said ? { id: ++remarkId, spot: said.spot, text: said.text, delay: REMARK_DELAY_MS } : lastTalk
    for (const o of leaving) {
      const spot = nextSeats.findIndex((s) => s?.regular.id === o.regular.id)
      const bye = talk?.say({ spot, id: o.regular.id, banter: o.regular.banter }, 'goodbye')
      if (bye) remark = { id: ++remarkId, spot, text: bye, delay: REMARK_DELAY_MS + 600 }
    }
    // A scene drowns out the small talk.
    if (sceneTalk) remark = sceneTalk
    const callText = dealerCall(state, events, next, me)
    const call = sceneCall ?? (callText ? { id: ++remarkId, spot: 'dealer' as const, text: callText, delay: 250 } : lastCall)

    set({
      state: next,
      seats: nextSeats,
      banned,
      fx,
      log: [
        ...log,
        ...describe(state, events, next, nameOf, me),
        ...leaving.map((o) => ({ id: ++logId, mine: false, text: `${o.regular.name} is out of caps and gets up.` })),
        ...sceneLog,
      ].slice(-120),
      talk: remark,
      call,
      result,
      // A rebet can't be more than you have left.
      bet: Math.min(get().bet, caps()),
    })
  }

  /**
   * Deal the next round with these bets, by spot. Whoever's leaving gets up
   * first, and at a full table someone new may sit down in a seat that's
   * been empty long enough. Your own bet comes out of your wallet.
   */
  const dealRound = (bets: number[]): boolean => {
    const { state, stakes, seats, me, humans, config } = get()
    if (!state || !stakes) return false
    const online = !!config?.online
    // Players who've gone get up; their spots are open again.
    const nextHumans = humans.map((h) => (h?.gone ? null : h))

    // Whoever's leaving gets up, and their seat stays empty a round or three.
    // At a full table, once a seat has been empty long enough, someone new sits down.
    // A regular in a spot a player now holds gets up too.
    const waits = get().waits.map((w, spot) => (seats[spot] === null ? Math.max(0, w - 1) : w))
    let nextSeats = seats.map((o, spot) => {
      if (!o || (!o.leaving && !nextHumans[spot])) return o
      waits[spot] = vacancyRounds(rng)
      return null
    })
    let arrival: { spot: number; regular: Regular } | null = null
    if (config?.mode === 'full') {
      const ready = REGULAR_SPOTS.filter((spot) => spot !== me && !nextHumans[spot] && seats[spot] === null && waits[spot] === 0)
      const away = new Set([...nextSeats.flatMap((o) => (o ? [o.regular.id] : [])), ...seats.flatMap((o) => (o ? [o.regular.id] : [])), ...get().banned])
      const free = REGULARS.filter((r) => !away.has(r.id))
      if (ready.length && free.length) {
        arrival = { spot: pick(ready, rng), regular: pick(free, rng) }
        nextSeats = nextSeats.map((o, i) => (i === arrival!.spot ? seatRegular(arrival!.regular, stakes) : o))
      }
    }

    // A bet the table can't take sits that player out, the same at every table.
    const clean = bets.map((b, spot) => (spot === me || nextHumans[spot] ? (b >= stakes.limits.min && b <= stakes.limits.max ? b : 0) : 0))
    const all = nextSeats.map((o, spot) => (o ? botBet(o.regular.style, o.memory, state, o.stack) : clean[spot]))
    if (!isLegal(state, { type: 'deal', bets: all })) return false
    if (all[me] > 0 && !quiet && !useSave.getState().spendCaps(all[me])) {
      if (!online) return false
      // Online the bet was placed already, so it stands.
      useSave.getState().adjustCaps(-all[me])
    }
    nextSeats = nextSeats.map((o, spot) => (o ? { ...o, stack: o.stack - all[spot] } : o))
    if (!quiet) all.forEach((b, spot) => b > 0 && spot !== me && playSfx('chip', { pan: SPOT_PAN[spot] * 0.6, delay: 0.05 * spot }))

    set({ seats: nextSeats, waits, humans: nextHumans, ready: nextHumans.map(() => null), result: null })
    run({ type: 'deal', bets: all }, Infinity)
    if (arrival) {
      const hello = talk?.say({ spot: arrival.spot, id: arrival.regular.id, banter: arrival.regular.banter }, 'hello')
      set((s) => ({
        log: [...s.log, { id: ++logId, mine: false, text: `${arrival.regular.name} sits down.` }],
        talk: hello ? { id: ++remarkId, spot: arrival.spot, text: hello, delay: 300 } : s.talk,
      }))
    }
    return true
  }

  /** Online: deal once every player still here has bet. */
  const dealIfReady = (force = false) => {
    const { ready, humans, state } = get()
    if (!state || !canBet(state)) return
    const players = humans.flatMap((h, spot) => (h && !h.gone ? [spot] : []))
    if (!force && players.some((spot) => ready[spot] === null)) return
    if (players.every((spot) => !ready[spot])) return
    dealRound(ready.map((b) => b ?? 0))
  }

  /**
   * Whether the table is ready for this input: now, not yet (the dealer is
   * still dealing, or someone before them is playing), or never, because its
   * moment has passed. Inputs wait in order until the table's ready.
   */
  const readiness = (entry: Entry): 'now' | 'wait' | 'drop' => {
    const { state } = get()
    if (!state) return 'wait'
    if (isSys(entry.input)) return 'now'
    const input = entry.input as Input
    const spot = spotOf(entry.seat)
    if (state.round > input.round) return 'drop'
    if (state.round < input.round) return 'wait'
    // In seat order: a turn still coming waits; one that's gone by is dropped.
    const order = (turnSpot: number, turnHand = 0, hand = 0) =>
      turnSpot < spot || (turnSpot === spot && turnHand < hand) ? 'wait' : turnSpot === spot && turnHand === hand ? 'now' : 'drop'
    switch (input.type) {
      case 'bet':
      case 'deal-now':
        // This round is still being played here.
        return canBet(state) ? 'now' : 'wait'
      case 'insure':
        if (state.phase === 'dealing') return 'wait'
        return state.phase === 'insurance' && state.turn ? order(state.turn.spot) : 'drop'
      case 'act': {
        if (state.phase === 'dealing' || state.phase === 'insurance' || state.phase === 'peek') return 'wait'
        if (state.phase !== 'playing' || !state.turn) return 'drop'
        const when = order(state.turn.spot, state.turn.hand, input.hand)
        if (when !== 'now') return when
        return (currentHand(state)?.cards.length ?? 0) === input.cards ? 'now' : 'drop'
      }
    }
  }

  /** Play one input. Anything the rules don't allow is dropped, the same at every table. */
  const play = (entry: Entry) => {
    const { state, me } = get()
    if (!state) return
    const spot = spotOf(entry.seat)
    if (isSys(entry.input)) {
      if (entry.input.sys === 'join') {
        const human: Human = { seat: entry.seat, name: entry.input.name, gone: false }
        set((s) => ({
          humans: s.humans.map((h, i) => (i === spot ? human : h)),
          log: spot === me ? s.log : [...s.log, { id: ++logId, mine: false, text: `${human.name} pulls up a chair.` }],
        }))
      } else {
        const gone = get().humans[spot]
        if (!gone) return
        set((s) => ({
          humans: s.humans.map((h, i) => (i === spot && h ? { ...h, gone: true } : h)),
          ready: s.ready.map((b, i) => (i === spot ? null : b)),
          log: [...s.log, { id: ++logId, mine: false, text: `${gone.name} gets up from the table.` }],
        }))
        dealIfReady()
      }
      return
    }
    const input = entry.input as Input
    switch (input.type) {
      case 'bet':
        set((s) => ({ ready: s.ready.map((b, i) => (i === spot ? Math.max(0, Math.floor(input.amount)) : b)) }))
        dealIfReady()
        break
      case 'deal-now':
        if (entry.seat === 0) dealIfReady(true)
        break
      case 'act': {
        const available = Math.max(0, input.available)
        if (!isLegal(state, { type: input.action }, available)) return
        if (spot === me && !quiet) coach(input.action, available)
        else run({ type: input.action }, available)
        break
      }
      case 'insure': {
        const available = Math.max(0, input.available)
        if (!isLegal(state, { type: 'insurance', take: input.take }, available)) return
        run({ type: 'insurance', take: input.take }, available)
        if (spot === me && input.take && !quiet) coachInsurance()
        break
      }
    }
  }

  /** Your decision, with a word from the coach when it isn't the book's. */
  const coach = (action: PlayerAction, available: number) => {
    const { state } = get()
    if (!state) return
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
  }

  const coachInsurance = () => {
    if (useSave.getState().blackjack.coach) {
      set((s) => ({ log: [...s.log, { id: ++logId, mine: true, text: 'Coach: the book never takes insurance. It only pays when the shoe is rich in tens.' }] }))
    }
  }

  /** Online: the link seat sitting in each spot. */
  const spotOf = (seat: number) => SPOT_OF_SEAT[seat] ?? -1

  return {
    sitting: 0,
    config: null,
    me: YOUR_SPOT,
    humans: [],
    ready: [],
    queue: [],
    stakes: null,
    state: null,
    seats: [],
    waits: [],
    banned: [],
    fx: null,
    bet: 0,
    log: [],
    talk: null,
    call: null,
    result: null,

    sit: (config) => {
      const stakes = stakesById(config.stakesId)
      const online = config.online
      if (!online && caps() < stakes.limits.min) return false
      rng = createRng(online?.seed ?? randomSeed())
      const me = online?.me ?? YOUR_SPOT
      const humans = online?.humans ?? Array.from({ length: SPOTS }, () => null)
      const state = createTable({ spots: SPOTS, limits: stakes.limits, seed: online ? (online.seed ^ 0x5bd1e995) >>> 0 : randomSeed() })
      talk = new TableTalk(createRng(randomSeed()), me)
      const open = REGULAR_SPOTS.filter((spot) => spot !== me && !humans[spot])
      const regulars = config.mode === 'full' ? seatRegulars(rng, open.length) : []
      const seats: (Occupant | null)[] = Array.from({ length: SPOTS }, () => null)
      open.forEach((spot, k) => {
        const regular = regulars[k]
        if (regular) seats[spot] = seatRegular(regular, stakes)
      })
      // One of the regulars says hello once everyone's settled in; the dealer greets you first.
      const greeters = talkers(seats)
      const hello = greeters.length ? pick(greeters, rng) : null
      const helloText = hello ? talk.say(hello, 'hello') : null
      const others = humans.flatMap((h) => (h ? [h.name] : []))
      set((s) => ({
        sitting: s.sitting + 1,
        config,
        me,
        humans,
        ready: humans.map(() => null),
        queue: [],
        stakes,
        state,
        seats,
        waits: Array.from({ length: SPOTS }, () => 0),
        banned: [],
        fx: null,
        bet: Math.min(stakes.limits.min, caps()),
        log: [
          {
            id: ++logId,
            mine: false,
            text: `You sit down at the ${stakes.name.toLowerCase()} table${others.length ? ` with ${listNames(others)}` : ''}. ${stakes.dealer.name} is dealing.`,
          },
        ],
        talk: hello && helloText ? { id: ++remarkId, spot: hello.spot, text: helloText, delay: HELLO_DELAY_MS + 1600 } : null,
        call: { id: ++remarkId, spot: 'dealer', text: pick(stakes.dealer.hello, rng), delay: HELLO_DELAY_MS },
        result: null,
      }))
      return true
    },

    addChip: (value) => {
      const { stakes, bet, state, ready, me, config } = get()
      if (!stakes || !canBet(state)) return
      if (config?.online && ready[me] !== null) return
      const next = Math.min(bet + value, stakes.limits.max, caps())
      if (next === bet) {
        playSfx('error')
        return
      }
      playSfx('chip', { pan: 0 })
      set({ bet: next })
    },

    clearBet: () => {
      const { state, ready, me, config } = get()
      if (!canBet(state) || (config?.online && ready[me] !== null)) return
      set({ bet: 0 })
    },

    deal: () => {
      const { state, stakes, bet, me } = get()
      if (!state || !stakes || !canBet(state)) return false
      if (bet < stakes.limits.min || bet > caps()) {
        playSfx('error')
        return false
      }
      return dealRound(Array.from({ length: SPOTS }, (_, spot) => (spot === me ? bet : 0)))
    },

    act: (action) => {
      const { state, me } = get()
      if (!state || state.phase !== 'playing' || actor(state) !== me) return
      const available = caps()
      if (!isLegal(state, { type: action }, available)) {
        playSfx('error')
        return
      }
      coach(action, available)
    },

    insure: (take) => {
      const { state, me } = get()
      if (!state || state.phase !== 'insurance' || actor(state) !== me) return
      const available = caps()
      if (!isLegal(state, { type: 'insurance', take }, available)) {
        playSfx('error')
        return
      }
      run({ type: 'insurance', take }, available)
      if (take) coachInsurance()
    },

    step: () => {
      const { state, seats, humans } = get()
      if (!state) return
      const who = actor(state)
      if (who === 'dealer') run({ type: 'next' }, Infinity)
      else if (who !== null) {
        const occupant = seats[who]
        if (occupant) run(botAction(occupant.regular.style, state, occupant.stack), occupant.stack)
        // A player who's gone stands, and turns insurance down.
        else if (humans[who]?.gone) run(state.phase === 'insurance' ? { type: 'insurance', take: false } : { type: 'stand' }, 0)
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
      if (staked > 0) useSave.getState().recordResult('blackjack', 'loss', -staked)
      talk = null
      set({ config: null, stakes: null, state: null, seats: [], waits: [], banned: [], fx: null, bet: 0, log: [], talk: null, call: null, result: null, me: YOUR_SPOT, humans: [], ready: [], queue: [] })
    },
  }
})

/** Spots the regulars sit in when you're alone: all but the middle. */
const REGULAR_SPOTS = [0, 1, 3, 4]

/** "Ann", "Ann and Bo", "Ann, Bo and Cy". */
export const listNames = (names: string[]): string => (names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

/** Bets go down between rounds. */
export const canBet = (state: TableState | null): boolean => !!state && (state.phase === 'betting' || state.phase === 'settled')

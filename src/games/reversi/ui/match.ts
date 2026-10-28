/**
 * The game in progress: engine state, the move log, the opponent's talk,
 * and recording the result when it ends. Not persisted; leaving a game
 * against the AI before it's over counts as resigning.
 */

import { create } from 'zustand'
import { createRng, randomSeed } from '../../../core/rng'
import { playSfx } from '../../../core/audio/sfx'
import { useSave } from '../../../store/save'
import { TableTalk } from '../banter'
import { OPPONENTS, opponentById } from '../content'
import {
  COLOR_NAME,
  type GameEvent,
  type GameState,
  type Player,
  apply,
  colOf,
  createGame,
  discCount,
  distance,
  finalScore,
  other,
  squareName,
} from '../engine'

export interface MatchConfig {
  mode: 'ai' | 'hotseat' | 'online'
  /** Set in AI mode. */
  opponentId?: string
  /** Black's name, then White's. Against the AI, yours is "You". */
  names: [string, string]
  /** The color you play against the AI or online. In hot-seat, both are people. */
  you: Player
}

export interface LogEntry {
  id: number
  player: Player
  /** Your move, or about you, against the AI. */
  mine: boolean
  text: string
}

/** Something the opponent says, shown in a speech bubble by their name. */
export interface Remark {
  id: number
  text: string
  /** Milliseconds to wait before showing it, so the discs settle first. */
  delay: number
}

/** The latest move, for the board to animate: where the disc went, and what turned. */
export interface LastMove {
  id: number
  player: Player
  square: number
  /** Nearest the new disc first. */
  flipped: readonly number[]
}

/** A player with no move, announced over the board once the discs settle. */
export interface Notice {
  id: number
  player: Player
  delay: number
}

export interface Result {
  winner: Player | null
  /** Black's, then White's, empty squares to the winner. */
  score: [number, number]
  /** Against the AI: the opponent your win opened up, if it's the first time. */
  unlocked: string | null
  /** Online: who gave the game up. */
  resigned?: Player
}

// ---- Timing ---------------------------------------------------------------------
// Keep in step with reversi.css, which reads them from the board's style.

/** A disc drops onto its square. */
export const DROP_MS = 260
/** Each ring of turned discs starts this much after the one inside it. */
export const FLIP_STEP_MS = 90
/** One disc turning over. */
export const FLIP_MS = 460

/** When everything a move set off has settled. */
export function settleTime(move: LastMove | null): number {
  if (!move) return 0
  const rings = move.flipped.reduce((n, sq) => Math.max(n, distance(move.square, sq)), 0)
  return DROP_MS + Math.max(0, rings - 1) * FLIP_STEP_MS + FLIP_MS
}

/** When the disc on `square` starts to turn, after `move` was played. */
export const flipDelay = (move: LastMove, square: number) => DROP_MS + (distance(move.square, square) - 1) * FLIP_STEP_MS

// ---------------------------------------------------------------------------------

interface MatchStore {
  /** Increments with every new game, so the board remounts and sets up again. */
  gameId: number
  config: MatchConfig | null
  state: GameState | null
  log: LogEntry[]
  lastMove: LastMove | null
  remark: Remark | null
  notice: Notice | null
  result: Result | null
  start: (config: MatchConfig) => void
  /** `quiet` plays a move without its sounds, for catching up on an online game. */
  play: (square: number, quiet?: boolean) => void
  /** Give up a game against the AI: it counts as a loss. */
  resign: () => void
  /** Online: a player gives the game up, and the other wins. */
  concede: (player: Player) => void
  leave: () => void
}

let logId = 0
let moveId = 0
let remarkId = 0
let noticeId = 0
let talk: TableTalk | null = null

/** The greeting waits for you to sit down; remarks wait for the discs to settle. */
const HELLO_DELAY_MS = 900

const isYou = (config: MatchConfig, player: Player) => config.mode !== 'hotseat' && player === config.you

/** Who's who in the log, from the table's point of view. */
function nameOf(config: MatchConfig, player: Player): string {
  return isYou(config, player) ? 'You' : config.names[player]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function describe(events: readonly GameEvent[], config: MatchConfig): LogEntry[] {
  const entries: LogEntry[] = []
  const add = (player: Player, text: string) => entries.push({ id: ++logId, player, mine: isYou(config, player), text })
  const turned = events.find((e) => e.type === 'flipped')
  for (const e of events) {
    switch (e.type) {
      case 'placed': {
        const n = turned?.type === 'flipped' ? turned.squares.length : 0
        add(e.player, `${nameOf(config, e.player)} ${isYou(config, e.player) ? 'play' : 'plays'} ${squareName(e.square)}, turning ${plural(n, 'disc', 'discs')}.`)
        break
      }
      case 'passed': {
        const you = isYou(config, e.player)
        add(e.player, `${nameOf(config, e.player)} ${you ? 'have' : 'has'} no move and ${you ? 'pass' : 'passes'}.`)
        break
      }
      case 'ended':
        add(e.winner ?? 0, endLine(config, e.winner, e.score))
        break
    }
  }
  return entries
}

/** "You win 40 to 24", "Aunt Marge wins 33 to 31", "A draw, 32 all". */
export function endLine(config: MatchConfig, winner: Player | null, score: readonly [number, number]): string {
  if (winner === null) return `A draw, ${score[0]} all.`
  const high = score[winner]
  const low = score[other(winner)]
  return `${nameOf(config, winner)} ${isYou(config, winner) ? 'win' : 'wins'} ${high} to ${low}.`
}

/** Each disc's sounds come from its side of the board. */
const panOf = (square: number) => ((colOf(square) - 3.5) / 3.5) * 0.45

/** The disc lands, then each turned disc ticks over as it comes down. */
function playMoveSounds(move: LastMove) {
  playSfx('disc', { pan: panOf(move.square), delay: (DROP_MS - 40) / 1000 })
  for (const sq of move.flipped.slice(0, 14)) {
    playSfx('disc-flip', { pan: panOf(sq), delay: (flipDelay(move, sq) + FLIP_MS - 70) / 1000 })
  }
}

/** Record a game against the AI, and open the next opponent on a first win. */
function record(config: MatchConfig, winner: Player | null): string | null {
  if (config.mode !== 'ai') return null
  const save = useSave.getState()
  if (winner === null) {
    save.recordResult('reversi', 'draw')
    return null
  }
  if (winner !== config.you) {
    save.recordResult('reversi', 'loss')
    return null
  }
  save.recordResult('reversi', 'win')
  const id = config.opponentId ?? ''
  const beaten = save.reversi.beaten
  save.updateReversi({ beaten: { ...beaten, [id]: (beaten[id] ?? 0) + 1 } })
  const next = OPPONENTS[OPPONENTS.findIndex((o) => o.id === id) + 1]
  return next && !(beaten[id] ?? 0) ? next.name : null
}

export const useMatch = create<MatchStore>()((set, get) => ({
  gameId: 0,
  config: null,
  state: null,
  log: [],
  lastMove: null,
  remark: null,
  notice: null,
  result: null,

  start: (config) => {
    const opponent = config.mode === 'ai' ? opponentById(config.opponentId ?? '') : undefined
    talk = opponent ? new TableTalk(opponent.banter, createRng(randomSeed()), other(config.you)) : null
    const first = nameOf(config, 0)
    set((s) => ({
      gameId: s.gameId + 1,
      config,
      state: createGame(),
      lastMove: null,
      notice: null,
      result: null,
      remark: talk ? { id: ++remarkId, text: talk.hello(), delay: HELLO_DELAY_MS } : null,
      log: [{ id: ++logId, player: 0, mine: isYou(config, 0), text: `New game. ${first === 'You' ? 'You play' : `${first} plays`} Black and ${first === 'You' ? 'go' : 'goes'} first.` }],
    }))
  },

  play: (square, quiet = false) => {
    const { state, config, log, remark } = get()
    if (!state || !config || state.over) return
    const { state: next, events } = apply(state, square)
    const flipped = events.find((e) => e.type === 'flipped')
    const lastMove: LastMove = {
      id: ++moveId,
      player: state.current,
      square,
      flipped: flipped?.type === 'flipped' ? flipped.squares : [],
    }
    if (!quiet) playMoveSounds(lastMove)
    const settle = settleTime(lastMove)

    const passed = events.find((e) => e.type === 'passed')
    const notice = passed?.type === 'passed' ? { id: ++noticeId, player: passed.player, delay: settle } : get().notice

    let result: Result | null = null
    if (next.over) {
      const unlocked = record(config, next.winner)
      result = { winner: next.winner, score: finalScore(next), unlocked }
      // A fanfare for any win at hot-seat, and for yours against the AI or online. A draw passes quietly.
      if (next.winner !== null && !quiet) {
        const happy = config.mode === 'hotseat' || next.winner === config.you
        window.setTimeout(() => playSfx(happy ? 'win' : 'lose'), settle + 150)
      }
    }

    const said = talk?.react(state, events, next)
    set({
      state: next,
      lastMove,
      notice,
      result,
      log: [...log, ...describe(events, config)].slice(-120),
      remark: said ? { id: ++remarkId, text: said, delay: settle + 120 } : remark,
    })
  },

  concede: (player) => {
    const { state, config, log } = get()
    if (!state || !config || state.over) return
    const winner = other(player)
    const you = isYou(config, player)
    window.setTimeout(() => playSfx(you ? 'lose' : 'win'), 150)
    set({
      state: { ...state, over: true, winner },
      result: { winner, score: discCount(state), unlocked: null, resigned: player },
      log: [...log, { id: ++logId, player, mine: you, text: `${nameOf(config, player)} ${you ? 'resign' : 'resigns'}. ${nameOf(config, winner)} ${isYou(config, winner) ? 'win' : 'wins'}.` }].slice(-120),
    })
  },

  resign: () => {
    const { state, config } = get()
    if (!state || !config || state.over || config.mode !== 'ai') return
    record(config, other(config.you))
    talk = null
    set({ config: null, state: null, log: [], lastMove: null, remark: null, notice: null, result: null })
  },

  leave: () => {
    talk = null
    set({ config: null, state: null, log: [], lastMove: null, remark: null, notice: null, result: null })
  },
}))

/** "Black" or "White", with the player's name in hot-seat and online. */
export function colorLabel(config: MatchConfig, player: Player): string {
  return config.mode === 'ai' ? COLOR_NAME[player] : `${config.names[player]} (${COLOR_NAME[player]})`
}

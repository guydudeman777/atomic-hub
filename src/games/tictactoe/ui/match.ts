/**
 * The game in progress: engine state, the move log, the opponent's talk,
 * the score for the sitting, and recording the result when a game ends.
 * Not persisted; leaving a game against the AI before it's over counts as
 * resigning.
 *
 * A sitting is a run of games between the same two people. Against the AI
 * you keep your mark from game to game; at hot-seat and online, X and O
 * swap every game, so each of you gets to go first.
 */

import { create } from 'zustand'
import { createRng, randomSeed } from '../../../core/rng'
import { playSfx } from '../../../core/audio/sfx'
import { useSave } from '../../../store/save'
import { TableTalk } from '../banter'
import { OPPONENTS, opponentById } from '../content'
import {
  type GameEvent,
  type GameState,
  type Player,
  type Variant,
  MARK,
  apply,
  createGame,
  gridName,
  lineName,
  other,
  position,
  squareName,
} from '../engine'

export interface MatchConfig {
  mode: 'ai' | 'hotseat' | 'online'
  variant: Variant
  /** Set in AI mode. */
  opponentId?: string
  /** X's name, then O's. Against the AI, yours is "You". */
  names: [string, string]
  /** The mark you play against the AI or online. In hot-seat, both are people. */
  you: Player
  /** Which of the sitting's two people plays X this game: 0 is you (or hot-seat's first player). */
  xPerson: 0 | 1
}

/** The sitting so far: the two people, by `xPerson`'s numbering, and their wins. */
export interface Series {
  people: [string, string]
  wins: [number, number]
  draws: number
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
  /** Milliseconds to wait before showing it, so the pencil's down first. */
  delay: number
}

/** The latest move, for the board to draw: the mark, a grid it won, and the winning line. */
export interface LastMove {
  id: number
  player: Player
  square: number
  /** Ultimate: the small grid the move won. */
  grid: number | null
  /** The game's winning three, if this move made it. */
  line: readonly number[] | null
}

export interface Result {
  winner: Player | null
  /** Against the AI: the opponent your win opened up, if it's the first time. */
  unlocked: string | null
  /** Online: who gave the game up. */
  resigned?: Player
}

// ---- Timing ---------------------------------------------------------------------
// Keep in step with tictactoe.css, which reads them from the board's style.

/** A mark drawing itself: an O's loop, or an X's two strokes. */
export const MARK_MS = 340
/** Ultimate: the big mark over a small grid that's just been won. */
export const BIG_MARK_MS = 520
/** The line struck through a winning three. */
export const STRIKE_MS = 480

/** When the pencil's done with everything a move set off. */
export function settleTime(move: LastMove | null): number {
  if (!move) return 0
  return MARK_MS + (move.grid !== null ? BIG_MARK_MS : 0) + (move.line ? STRIKE_MS : 0)
}

// ---------------------------------------------------------------------------------

interface MatchStore {
  /** Increments with every new game, so the board remounts and sets up again. */
  gameId: number
  config: MatchConfig | null
  state: GameState | null
  series: Series | null
  log: LogEntry[]
  lastMove: LastMove | null
  remark: Remark | null
  result: Result | null
  /** A new sitting, or with `keepSeries`, the next game of this one. */
  start: (config: MatchConfig, keepSeries?: boolean) => void
  /** The next game of the sitting: marks swap, except against the AI. */
  again: () => void
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
let talk: TableTalk | null = null

/** The greeting waits for you to sit down; remarks wait for the pencil. */
const HELLO_DELAY_MS = 900

const isYou = (config: MatchConfig, player: Player) => config.mode !== 'hotseat' && player === config.you

/** Who's who in the log, from the table's point of view. */
function nameOf(config: MatchConfig, player: Player): string {
  return isYou(config, player) ? 'You' : config.names[player]
}

function describe(events: readonly GameEvent[], config: MatchConfig): LogEntry[] {
  const entries: LogEntry[] = []
  const add = (player: Player, text: string) => entries.push({ id: ++logId, player, mine: isYou(config, player), text })
  const s = (player: Player) => (isYou(config, player) ? '' : 's')
  for (const e of events) {
    switch (e.type) {
      case 'placed':
        add(e.player, `${nameOf(config, e.player)} put${s(e.player)} an ${MARK[e.player]} in ${squareName(config.variant, e.square)}.`)
        break
      case 'grid-won':
        add(e.player, `${nameOf(config, e.player)} win${s(e.player)} ${gridName(e.grid)}.`)
        break
      case 'grid-full':
        entries.push({ id: ++logId, player: 0, mine: false, text: `${capitalize(gridName(e.grid))} is full with no three in a row. It counts for nobody.` })
        break
      case 'sent':
        if (e.grid === null) add(e.player, `${nameOf(config, e.player)} ${isYou(config, e.player) ? 'are' : 'is'} sent to a closed grid, so ${isYou(config, e.player) ? 'you' : 'they'} can play in any open one.`)
        break
      case 'ended':
        add(e.winner ?? 0, endLine(config, e.winner, e.line))
        break
    }
  }
  return entries
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)

/** "You win with three in a row down the middle", "Bev Kowalski wins with three grids in a row", "A cat’s game". */
export function endLine(config: MatchConfig, winner: Player | null, line: readonly number[] | null = null): string {
  if (winner === null) return config.variant === 'classic' ? 'A cat’s game: nobody wins.' : 'Every grid is settled, and nobody has three in a row. A draw.'
  return `${nameOf(config, winner)} ${isYou(config, winner) ? 'win' : 'wins'} with ${lineText(config.variant, line)}.`
}

/** "three in a row across the top", "three grids in a row corner to corner". */
export function lineText(variant: MatchConfig['variant'], line: readonly number[] | null): string {
  const what = variant === 'classic' ? 'three in a row' : 'three grids in a row'
  return line ? `${what} ${lineName(line)}` : what
}

/** Each mark's sounds come from its side of the placemat. */
const panOf = (config: MatchConfig, square: number) => {
  const cols = config.variant === 'classic' ? 3 : 9
  return ((position(config.variant, square).col + 0.5) / cols - 0.5) * 0.8
}

/** The pencil: the mark, then a big mark over a won grid, then the line through the winning three. */
function playMoveSounds(config: MatchConfig, move: LastMove) {
  const pan = panOf(config, move.square)
  playSfx(move.player === 0 ? 'pencil-x' : 'pencil-o', { pan })
  let at = MARK_MS
  if (move.grid !== null) {
    playSfx(move.player === 0 ? 'pencil-x' : 'pencil-o', { pan: ((move.grid % 3) - 1) * 0.4, delay: at / 1000 })
    at += BIG_MARK_MS
  }
  if (move.line) playSfx('pencil-line', { delay: at / 1000 })
}

/** Record a game against the AI, and open the next opponent on a first win. */
function record(config: MatchConfig, winner: Player | null): string | null {
  if (config.mode !== 'ai') return null
  const save = useSave.getState()
  if (winner === null) {
    save.recordResult('tictactoe', 'draw')
    return null
  }
  if (winner !== config.you) {
    save.recordResult('tictactoe', 'loss')
    return null
  }
  save.recordResult('tictactoe', 'win')
  const id = config.opponentId ?? ''
  const beaten = save.tictactoe.beaten
  save.updateTicTacToe({ beaten: { ...beaten, [id]: (beaten[id] ?? 0) + 1 } })
  const next = OPPONENTS[OPPONENTS.findIndex((o) => o.id === id) + 1]
  return next && !(beaten[id] ?? 0) ? next.name : null
}

/** The sitting's two people, numbered as `xPerson` counts them. */
function peopleOf(config: MatchConfig): [string, string] {
  const x = config.names[0]
  const o = config.names[1]
  return config.xPerson === 0 ? [x, o] : [o, x]
}

/** Which of the sitting's people played `player` this game. */
export const personOf = (config: MatchConfig, player: Player): 0 | 1 => (player === 0 ? config.xPerson : config.xPerson === 0 ? 1 : 0)

/** The next game of a sitting: X and O change hands, except against the AI. */
export function nextConfig(config: MatchConfig): MatchConfig {
  if (config.mode === 'ai') return config
  return { ...config, names: [config.names[1], config.names[0]], you: other(config.you), xPerson: config.xPerson === 0 ? 1 : 0 }
}

function scored(series: Series, config: MatchConfig, winner: Player | null): Series {
  if (winner === null) return { ...series, draws: series.draws + 1 }
  const wins: [number, number] = [...series.wins]
  wins[personOf(config, winner)]++
  return { ...series, wins }
}

export const useMatch = create<MatchStore>()((set, get) => ({
  gameId: 0,
  config: null,
  state: null,
  series: null,
  log: [],
  lastMove: null,
  remark: null,
  result: null,

  start: (config, keepSeries = false) => {
    const opponent = config.mode === 'ai' ? opponentById(config.opponentId ?? '') : undefined
    talk = opponent ? new TableTalk(opponent.banter, createRng(randomSeed()), other(config.you)) : null
    const first = nameOf(config, 0)
    const series = keepSeries && get().series ? get().series : { people: peopleOf(config), wins: [0, 0] as [number, number], draws: 0 }
    const game = config.variant === 'classic' ? 'Classic' : 'Ultimate'
    set((s) => ({
      gameId: s.gameId + 1,
      config,
      state: createGame(config.variant),
      series,
      lastMove: null,
      result: null,
      remark: talk ? { id: ++remarkId, text: talk.hello(), delay: HELLO_DELAY_MS } : null,
      log: [
        ...(keepSeries ? s.log : []),
        { id: ++logId, player: 0 as Player, mine: isYou(config, 0), text: `New game of ${game}. ${first === 'You' ? 'You play' : `${first} plays`} X and ${first === 'You' ? 'go' : 'goes'} first.` },
      ].slice(-120),
    }))
  },

  again: () => {
    const { config } = get()
    if (config) get().start(nextConfig(config), true)
  },

  play: (square, quiet = false) => {
    const { state, config, log, remark, series } = get()
    if (!state || !config || state.over) return
    const { state: next, events } = apply(state, square)
    const won = events.find((e) => e.type === 'grid-won')
    const ended = events.find((e) => e.type === 'ended')
    const lastMove: LastMove = {
      id: ++moveId,
      player: state.current,
      square,
      grid: won?.type === 'grid-won' ? won.grid : null,
      line: ended?.type === 'ended' ? ended.line : null,
    }
    if (!quiet) playMoveSounds(config, lastMove)
    const settle = settleTime(lastMove)

    let result: Result | null = null
    if (next.over) {
      const unlocked = record(config, next.winner)
      result = { winner: next.winner, unlocked }
      // A fanfare for any win at hot-seat, and for yours against the AI or online. A cat's game passes quietly.
      if (next.winner !== null && !quiet) {
        const happy = config.mode === 'hotseat' || next.winner === config.you
        window.setTimeout(() => playSfx(happy ? 'win' : 'lose'), settle + 150)
      }
    }

    const said = talk?.react(state, events, next)
    set({
      state: next,
      lastMove,
      result,
      series: next.over && series ? scored(series, config, next.winner) : series,
      log: [...log, ...describe(events, config)].slice(-120),
      remark: said ? { id: ++remarkId, text: said, delay: settle + 120 } : remark,
    })
  },

  concede: (player) => {
    const { state, config, log, series } = get()
    if (!state || !config || state.over) return
    const winner = other(player)
    const you = isYou(config, player)
    window.setTimeout(() => playSfx(you ? 'lose' : 'win'), 150)
    set({
      state: { ...state, over: true, winner, forced: null },
      result: { winner, unlocked: null, resigned: player },
      series: series && scored(series, config, winner),
      log: [...log, { id: ++logId, player, mine: you, text: `${nameOf(config, player)} ${you ? 'resign' : 'resigns'}. ${nameOf(config, winner)} ${isYou(config, winner) ? 'win' : 'wins'}.` }].slice(-120),
    })
  },

  resign: () => {
    const { state, config } = get()
    if (!state || !config || state.over || config.mode !== 'ai') return
    record(config, other(config.you))
    talk = null
    set({ config: null, state: null, series: null, log: [], lastMove: null, remark: null, result: null })
  },

  leave: () => {
    talk = null
    set({ config: null, state: null, series: null, log: [], lastMove: null, remark: null, result: null })
  },
}))

/** "X" or "O", with the player's name in hot-seat and online. */
export function markLabel(config: MatchConfig, player: Player): string {
  return config.mode === 'ai' ? MARK[player] : `${config.names[player]} (${MARK[player]})`
}

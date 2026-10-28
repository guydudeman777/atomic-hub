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
import { COLOR_NAME, COLS, type GameEvent, type GameState, type Player, ROWS, apply, columnName, createGame, describeLine, other } from '../engine'

export interface MatchConfig {
  mode: 'ai' | 'hotseat' | 'online'
  /** Set in AI mode. */
  opponentId?: string
  /** Red's name, then Yellow's. Against the AI, yours is "You". */
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
  /** Milliseconds to wait before showing it, so the checker lands first. */
  delay: number
}

/** The latest drop, for the rack to animate. */
export interface LastMove {
  id: number
  player: Player
  col: number
  row: number
}

/** The last game's checkers falling out of the rack as the slider's pulled, before the next game. */
export interface Release {
  id: number
  board: readonly (Player | null)[]
}

export interface Result {
  winner: Player | null
  /** The winning checkers, or null for a full rack. */
  line: readonly number[] | null
  /** Against the AI: the opponent your win opened up, if it's the first time. */
  unlocked: string | null
  /** Online: who gave the game up. */
  resigned?: Player
}

// ---- Timing ---------------------------------------------------------------------
// Keep in step with connect4.css, which reads them from the rack's style.

/** A checker falls one row in this long; further takes longer, as it would under gravity. */
export const FALL_MS = 92
/** Where a checker waits over the rack before it's dropped: this many rows above the top hole. */
export const HOVER_ROWS = 1.1
/** The little bounce as it lands. */
export const BOUNCE_MS = 150
/** The slider pulled and the rack emptying out, before a new game. */
export const RELEASE_MS = 1150

/** How far a checker dropped into `row` falls, in rows. */
export const fallRows = (row: number) => ROWS - 1 - row + HOVER_ROWS

/** How long a checker dropped into `row` takes to reach it. */
export const fallTime = (row: number) => Math.round(FALL_MS * Math.sqrt(fallRows(row)))

/** When everything a move set off has settled. */
export const settleTime = (move: LastMove | null): number => (move ? fallTime(move.row) + BOUNCE_MS : 0)

// ---------------------------------------------------------------------------------

interface MatchStore {
  /** Increments with every new game. */
  gameId: number
  config: MatchConfig | null
  state: GameState | null
  log: LogEntry[]
  lastMove: LastMove | null
  remark: Remark | null
  release: Release | null
  result: Result | null
  /** `quiet` sets up without the slider's clatter, for catching up on an online game. */
  start: (config: MatchConfig, quiet?: boolean) => void
  /** `quiet` plays a move without its sounds, for catching up on an online game. */
  play: (col: number, quiet?: boolean) => void
  /** Give up a game against the AI: it counts as a loss. */
  resign: () => void
  /** Online: a player gives the game up, and the other wins. */
  concede: (player: Player) => void
  leave: () => void
}

let logId = 0
let moveId = 0
let remarkId = 0
let releaseId = 0
let talk: TableTalk | null = null

/** The greeting waits for you to sit down; remarks wait for the checker to land. */
const HELLO_DELAY_MS = 900

const isYou = (config: MatchConfig, player: Player) => config.mode !== 'hotseat' && player === config.you

/** Who's who in the log, from the table's point of view. */
function nameOf(config: MatchConfig, player: Player): string {
  return isYou(config, player) ? 'You' : config.names[player]
}

function describe(events: readonly GameEvent[], config: MatchConfig): LogEntry[] {
  const entries: LogEntry[] = []
  const add = (player: Player, text: string) => entries.push({ id: ++logId, player, mine: isYou(config, player), text })
  for (const e of events) {
    if (e.type === 'dropped') add(e.player, `${nameOf(config, e.player)} ${isYou(config, e.player) ? 'drop' : 'drops'} into ${columnName(e.col)}.`)
    else add(e.winner ?? 0, endLine(config, e.winner, e.line))
  }
  return entries
}

/** "You win with four across the bottom row", "Mabel Pruitt wins with four up column 3", "The rack is full: a draw". */
export function endLine(config: MatchConfig, winner: Player | null, line: readonly number[] | null): string {
  if (winner === null || !line) return 'The rack is full: a draw.'
  return `${nameOf(config, winner)} ${isYou(config, winner) ? 'win' : 'wins'} with four ${describeLine(line)}.`
}

/** Each checker's sound comes from its side of the rack. */
const panOf = (col: number) => ((col - (COLS - 1) / 2) / ((COLS - 1) / 2)) * 0.45

/** Record a game against the AI, and open the next opponent on a first win. */
function record(config: MatchConfig, winner: Player | null): string | null {
  if (config.mode !== 'ai') return null
  const save = useSave.getState()
  if (winner === null) {
    save.recordResult('connect4', 'draw')
    return null
  }
  if (winner !== config.you) {
    save.recordResult('connect4', 'loss')
    return null
  }
  save.recordResult('connect4', 'win')
  const id = config.opponentId ?? ''
  const beaten = save.connect4.beaten
  save.updateConnect4({ beaten: { ...beaten, [id]: (beaten[id] ?? 0) + 1 } })
  const next = OPPONENTS[OPPONENTS.findIndex((o) => o.id === id) + 1]
  return next && !(beaten[id] ?? 0) ? next.name : null
}

const cleared = { config: null, state: null, log: [], lastMove: null, remark: null, release: null, result: null }

export const useMatch = create<MatchStore>()((set, get) => ({
  gameId: 0,
  ...cleared,

  start: (config, quiet = false) => {
    const opponent = config.mode === 'ai' ? opponentById(config.opponentId ?? '') : undefined
    talk = opponent ? new TableTalk(opponent.banter, createRng(randomSeed()), other(config.you)) : null
    const previous = get().state
    // Another game at the same rack: pull the slider and let the last one's checkers out first.
    const release = previous && previous.turn > 0 && !quiet ? { id: ++releaseId, board: previous.board } : null
    if (release) playSfx('release')
    const first = nameOf(config, 0)
    const delay = HELLO_DELAY_MS + (release ? RELEASE_MS : 0)
    const opening: LogEntry = {
      id: ++logId,
      player: 0,
      mine: isYou(config, 0),
      text: `New game. ${first === 'You' ? 'You play' : `${first} plays`} ${COLOR_NAME[0]} and ${first === 'You' ? 'drop' : 'drops'} first.`,
    }
    set((s) => ({
      gameId: s.gameId + 1,
      config,
      state: createGame(),
      lastMove: null,
      release,
      result: null,
      remark: talk ? { id: ++remarkId, text: talk.hello(), delay } : null,
      log: [...(release ? s.log : []), opening].slice(-120),
    }))
  },

  play: (col, quiet = false) => {
    const { state, config, log, remark } = get()
    if (!state || !config || state.over) return
    const { state: next, events } = apply(state, col)
    const row = state.heights[col]
    const lastMove: LastMove = { id: ++moveId, player: state.current, col, row }
    if (!quiet) playSfx('checker', { pan: panOf(col), delay: fallTime(row) / 1000 })
    const settle = settleTime(lastMove)

    let result: Result | null = null
    if (next.over) {
      const unlocked = record(config, next.winner)
      result = { winner: next.winner, line: next.line, unlocked }
      // A fanfare for any win at hot-seat, and for yours against the AI or online. A draw passes quietly.
      if (next.winner !== null && !quiet) {
        const happy = config.mode === 'hotseat' || next.winner === config.you
        window.setTimeout(() => playSfx(happy ? 'win' : 'lose'), settle + 250)
      }
    }

    const said = talk?.react(state, events, next)
    set({
      state: next,
      lastMove,
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
      result: { winner, line: null, unlocked: null, resigned: player },
      log: [...log, { id: ++logId, player, mine: you, text: `${nameOf(config, player)} ${you ? 'resign' : 'resigns'}. ${nameOf(config, winner)} ${isYou(config, winner) ? 'win' : 'wins'}.` }].slice(-120),
    })
  },

  resign: () => {
    const { state, config } = get()
    if (!state || !config || state.over || config.mode !== 'ai') return
    record(config, other(config.you))
    talk = null
    set(cleared)
  },

  leave: () => {
    talk = null
    set(cleared)
  },
}))

/** "Red" or "Yellow", with the player's name in hot-seat and online. */
export function colorLabel(config: MatchConfig, player: Player): string {
  return config.mode === 'ai' ? COLOR_NAME[player] : `${config.names[player]} (${COLOR_NAME[player]})`
}

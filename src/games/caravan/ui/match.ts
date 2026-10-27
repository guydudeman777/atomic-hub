/**
 * The match in progress: engine state, the move log, and settling rewards
 * when it ends. Not persisted; leaving the table forfeits.
 */

import { create } from 'zustand'
import { type Card, cardLabel } from '../../../core/cards'
import { createRng, randomSeed } from '../../../core/rng'
import { crowdReaction } from '../../../core/audio/live'
import { playSfx } from '../../../core/audio/sfx'
import { useSave } from '../../../store/save'
import { DUPLICATE_BONUS_CAPS, drawUnowned, opponentById } from '../content'
import { type GameEvent, type GameState, type Lane, type Move, type PlayerId, applyMove, createGame, other } from '../engine'

export const LANE_NAMES: Record<Lane, string> = { 0: 'left', 1: 'middle', 2: 'right' }

export interface MatchConfig {
  mode: 'ai' | 'hotseat'
  /** Set in AI mode. The AI always sits in seat 1. */
  opponentId?: string
  wager: number
  names: [string, string]
  decks: [Card[], Card[]]
}

export interface LogEntry {
  id: number
  player: PlayerId
  text: string
}

export interface Settlement {
  winner: PlayerId
  reason: GameState['endReason']
  capsDelta: number
  newCards: Card[]
  bonusCaps: number
}

interface MatchStore {
  /** Increments with every new deal, so the table remounts and re-deals. */
  gameId: number
  config: MatchConfig | null
  state: GameState | null
  log: LogEntry[]
  /** Card ids touched by the latest move, for highlighting. */
  recent: string[]
  /** Who made the latest move. */
  lastMover: PlayerId | null
  settlement: Settlement | null
  start: (config: MatchConfig) => boolean
  play: (move: Move) => void
  forfeit: () => void
  leave: () => void
}

let logId = 0

/** Plain-language log lines, written from the table's point of view. */
function describe(events: GameEvent[], names: [string, string], mode: MatchConfig['mode']): LogEntry[] {
  const possessive = (p: PlayerId) => (mode === 'ai' && p === 0 ? 'your' : `${names[p]}’s`)
  const wins = (p: PlayerId) => (mode === 'ai' && p === 0 ? `${names[p]} win` : `${names[p]} wins`)
  const entries: LogEntry[] = []
  for (const e of events) {
    let text: string | null = null
    let player: PlayerId = 0
    switch (e.type) {
      case 'played':
        player = e.player
        text = e.target
          ? `${names[e.player]} played ${cardLabel(e.card)} on ${e.owner === e.player ? (mode === 'ai' && e.player === 0 ? 'your' : 'their') : possessive(e.owner)} ${cardLabel(e.target)} (${LANE_NAMES[e.lane]})`
          : `${names[e.player]} played ${cardLabel(e.card)} on the ${LANE_NAMES[e.lane]} caravan`
        break
      case 'removed':
        player = e.owner
        text = `Removed ${e.cards.map(cardLabel).join(', ')} from ${possessive(e.owner)} ${LANE_NAMES[e.lane]} caravan`
        break
      case 'discarded':
        player = e.player
        text = `${names[e.player]} discarded ${cardLabel(e.card)}`
        break
      case 'disbanded':
        player = e.player
        text = `${names[e.player]} disbanded the ${LANE_NAMES[e.lane]} caravan`
        break
      case 'game-over':
        player = e.winner
        text = e.reason === 'out-of-cards' ? `${names[other(e.winner)]} ran out of cards. ${wins(e.winner)}.` : `${wins(e.winner)} the game.`
        break
    }
    if (text) entries.push({ id: ++logId, player, text })
  }
  return entries
}

/** Each caravan's sounds come from its side of the table. */
const LANE_PAN: Record<Lane, number> = { 0: -0.35, 1: 0, 2: 0.35 }

function playMoveSounds(events: GameEvent[], drew: boolean) {
  let removals = 0
  for (const e of events) {
    if (e.type === 'played') playSfx('card', { pan: LANE_PAN[e.lane] })
    else if (e.type === 'discarded') playSfx('discard')
    else if (e.type === 'disbanded') playSfx('disband', { pan: LANE_PAN[e.lane] })
    // Jacks and Jokers: the card lands, then the ones it beat get swept off.
    else if (e.type === 'removed') playSfx('remove', { pan: LANE_PAN[e.lane], delay: 0.15 + 0.08 * removals++ })
  }
  if (drew) playSfx('draw', { delay: 0.35 })
}

function touched(events: GameEvent[]): string[] {
  const ids: string[] = []
  for (const e of events) {
    if (e.type === 'played') ids.push(e.card.id, ...(e.target ? [e.target.id] : []))
  }
  return ids
}

/** Pay out (or not) when an AI match ends. Hot-seat games aren't recorded. */
function settle(config: MatchConfig, state: GameState): Settlement {
  const winner = state.winner as PlayerId
  const base = { winner, reason: state.endReason, newCards: [] as Card[], bonusCaps: 0 }
  if (config.mode !== 'ai') return { ...base, capsDelta: 0 }

  const save = useSave.getState()
  const opponent = opponentById(config.opponentId ?? '')
  if (winner === 0) {
    save.adjustCaps(config.wager * 2)
    let newCards: Card[] = []
    let bonusCaps = 0
    if (opponent) {
      const owned = new Set(save.caravan.collection)
      newCards = drawUnowned(opponent.set, owned, opponent.rewardCards, createRng(randomSeed()))
      bonusCaps = (opponent.rewardCards - newCards.length) * DUPLICATE_BONUS_CAPS
      save.addCaravanCards(newCards.map((c) => c.id))
      if (bonusCaps) save.adjustCaps(bonusCaps)
      save.markBeaten(opponent.id)
    }
    save.recordResult('caravan', 'win', config.wager + bonusCaps)
    return { ...base, capsDelta: config.wager, newCards, bonusCaps }
  }
  save.recordResult('caravan', 'loss', -config.wager)
  return { ...base, capsDelta: -config.wager }
}

export const useMatch = create<MatchStore>()((set, get) => ({
  gameId: 0,
  config: null,
  state: null,
  log: [],
  recent: [],
  lastMover: null,
  settlement: null,

  start: (config) => {
    if (config.wager > 0 && !useSave.getState().spendCaps(config.wager)) return false
    const rng = createRng(randomSeed())
    const firstPlayer: PlayerId = rng() < 0.5 ? 0 : 1
    const state = createGame({ decks: config.decks, rng, firstPlayer })
    set((s) => ({
      gameId: s.gameId + 1,
      config,
      state,
      settlement: null,
      recent: [],
      lastMover: null,
      log: [{ id: ++logId, player: firstPlayer, text: `New game. ${config.mode === 'ai' && firstPlayer === 0 ? 'You go' : `${config.names[firstPlayer]} goes`} first.` }],
    }))
    return true
  },

  play: (move) => {
    const { state, config, log } = get()
    if (!state || !config || state.winner !== null) return
    const { state: next, events } = applyMove(state, move)
    const mover = state.current
    playMoveSounds(events, next.players[mover].deck.length < state.players[mover].deck.length)
    const settlement = next.winner !== null ? settle(config, next) : null
    if (settlement) {
      const humanWon = config.mode === 'hotseat' || settlement.winner === 0
      window.setTimeout(() => {
        playSfx(humanWon ? 'win' : 'lose')
        crowdReaction(humanWon ? 'cheer' : 'groan')
      }, 250)
    }
    set({
      state: next,
      log: [...log, ...describe(events, config.names, config.mode)].slice(-120),
      recent: touched(events),
      lastMover: state.current,
      settlement,
    })
  },

  forfeit: () => {
    const { state, config } = get()
    if (state && config && state.winner === null && config.mode === 'ai') {
      useSave.getState().recordResult('caravan', 'loss', -config.wager)
    }
    set({ config: null, state: null, log: [], recent: [], lastMover: null, settlement: null })
  },

  leave: () => set({ config: null, state: null, log: [], recent: [], lastMover: null, settlement: null }),
}))

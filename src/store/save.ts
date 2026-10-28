/**
 * The persistent save: caps, settings, stats, the Caravan collection, and
 * each table's preferences.
 * Stored in localStorage and exportable as a JSON file.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { STARTING_CAPS, type WalletState, claimRefill } from '../core/wallet'
import { STARTER_DECK, type SavedDeck } from '../games/caravan/content'
import { fullSet } from '../core/cards'

export type Phosphor = 'green' | 'amber'

export interface Settings {
  phosphor: Phosphor
  /** Scanlines, curvature shading and glow. */
  crt: boolean
  /** Subtle screen flicker; always off when the OS asks for reduced motion. */
  flicker: boolean
  /** Animated changes between the hub and games; off with reduced motion too. */
  transitions: boolean
  /** Game tables drawn in perspective, with cards that turn over. */
  table3d: boolean
  /** Sound effects and their volume. */
  sound: boolean
  volume: number
  /** The saloon radio. */
  music: boolean
  musicVolume: number
  /** Talk, laughter and glasses at the tables. */
  chatter: boolean
  chatterVolume: number
  /** What other players see at online tables. */
  playerName: string
}

export interface GameStats {
  played: number
  won: number
  lost: number
  drawn: number
  streak: number
  bestStreak: number
  capsWon: number
  capsLost: number
}

export const emptyStats = (): GameStats => ({
  played: 0, won: 0, lost: 0, drawn: 0, streak: 0, bestStreak: 0, capsWon: 0, capsLost: 0,
})

export interface CaravanSave {
  collection: string[]
  decks: SavedDeck[]
  activeDeckId: string
  /** Wins against each opponent id. */
  beaten: Record<string, number>
}

export interface BlackjackSave {
  /** Basic strategy advice for each decision. */
  coach: boolean
  /** The Hi-Lo count, for practice. */
  count: boolean
}

export interface DrawSave {
  /** Mark the cards the book would keep before the draw. */
  hints: boolean
}

export interface CrapsSave {
  /** What each bet pays, and its house edge, shown as you point at it. */
  guide: boolean
}

export interface ReversiSave {
  /** Mark the squares you can play. */
  showMoves: boolean
  /** Wins against each opponent id, which opens the next one on the ladder. */
  beaten: Record<string, number>
}

export interface SaveData {
  version: 1
  wallet: WalletState
  settings: Settings
  stats: Record<string, GameStats>
  caravan: CaravanSave
  blackjack: BlackjackSave
  draw: DrawSave
  craps: CrapsSave
  reversi: ReversiSave
}

export type GameResult = 'win' | 'loss' | 'draw'

interface SaveActions {
  /** Add (or with a negative amount, remove) caps. Balance never goes below zero. */
  adjustCaps: (amount: number) => void
  /** Spend caps if affordable; returns whether it went through. */
  spendCaps: (amount: number) => boolean
  claimRefill: () => boolean
  updateSettings: (patch: Partial<Settings>) => void
  recordResult: (gameId: string, result: GameResult, capsDelta?: number) => void
  addCaravanCards: (ids: string[]) => void
  saveCaravanDeck: (deck: SavedDeck) => void
  deleteCaravanDeck: (id: string) => void
  setActiveCaravanDeck: (id: string) => void
  markBeaten: (opponentId: string) => void
  updateBlackjack: (patch: Partial<BlackjackSave>) => void
  updateDraw: (patch: Partial<DrawSave>) => void
  updateCraps: (patch: Partial<CrapsSave>) => void
  updateReversi: (patch: Partial<ReversiSave>) => void
  importSave: (json: string) => { ok: true } | { ok: false; error: string }
  resetSave: () => void
}

export const newSave = (): SaveData => ({
  version: 1,
  wallet: { caps: STARTING_CAPS, lastRefillAt: null },
  settings: {
    phosphor: 'green',
    crt: true,
    flicker: true,
    transitions: true,
    table3d: true,
    sound: true,
    volume: 0.5,
    music: true,
    musicVolume: 0.5,
    chatter: true,
    chatterVolume: 0.5,
    playerName: '',
  },
  stats: {},
  caravan: {
    collection: fullSet('standard').map((c) => c.id),
    decks: [STARTER_DECK],
    activeDeckId: STARTER_DECK.id,
    beaten: {},
  },
  blackjack: { coach: true, count: false },
  draw: { hints: true },
  craps: { guide: true },
  reversi: { showMoves: true, beaten: {} },
})

/** Just the data fields, for export. */
export function snapshot(state: SaveData): SaveData {
  const { version, wallet, settings, stats, caravan, blackjack, draw, craps, reversi } = state
  return { version, wallet, settings, stats, caravan, blackjack, draw, craps, reversi }
}

function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<SaveData>
  return (
    v.version === 1 &&
    typeof v.wallet?.caps === 'number' &&
    typeof v.settings === 'object' &&
    typeof v.stats === 'object' &&
    Array.isArray(v.caravan?.collection) &&
    Array.isArray(v.caravan?.decks)
  )
}

export const useSave = create<SaveData & SaveActions>()(
  persist(
    (set, get) => ({
      ...newSave(),

      adjustCaps: (amount) =>
        set((s) => ({ wallet: { ...s.wallet, caps: Math.max(0, Math.round(s.wallet.caps + amount)) } })),

      spendCaps: (amount) => {
        if (get().wallet.caps < amount) return false
        get().adjustCaps(-amount)
        return true
      },

      claimRefill: () => {
        const next = claimRefill(get().wallet, Date.now())
        if (!next) return false
        set({ wallet: next })
        return true
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      recordResult: (gameId, result, capsDelta = 0) =>
        set((s) => {
          const prev = s.stats[gameId] ?? emptyStats()
          const streak = result === 'win' ? prev.streak + 1 : 0
          const next: GameStats = {
            played: prev.played + 1,
            won: prev.won + (result === 'win' ? 1 : 0),
            lost: prev.lost + (result === 'loss' ? 1 : 0),
            drawn: prev.drawn + (result === 'draw' ? 1 : 0),
            streak,
            bestStreak: Math.max(prev.bestStreak, streak),
            capsWon: prev.capsWon + Math.max(0, capsDelta),
            capsLost: prev.capsLost + Math.max(0, -capsDelta),
          }
          return { stats: { ...s.stats, [gameId]: next } }
        }),

      addCaravanCards: (ids) =>
        set((s) => ({
          caravan: { ...s.caravan, collection: [...new Set([...s.caravan.collection, ...ids])] },
        })),

      saveCaravanDeck: (deck) =>
        set((s) => {
          const exists = s.caravan.decks.some((d) => d.id === deck.id)
          const decks = exists ? s.caravan.decks.map((d) => (d.id === deck.id ? deck : d)) : [...s.caravan.decks, deck]
          return { caravan: { ...s.caravan, decks } }
        }),

      deleteCaravanDeck: (id) =>
        set((s) => {
          const decks = s.caravan.decks.filter((d) => d.id !== id)
          if (decks.length === 0) decks.push(STARTER_DECK)
          const activeDeckId = s.caravan.activeDeckId === id ? decks[0].id : s.caravan.activeDeckId
          return { caravan: { ...s.caravan, decks, activeDeckId } }
        }),

      setActiveCaravanDeck: (id) => set((s) => ({ caravan: { ...s.caravan, activeDeckId: id } })),

      markBeaten: (opponentId) =>
        set((s) => ({
          caravan: {
            ...s.caravan,
            beaten: { ...s.caravan.beaten, [opponentId]: (s.caravan.beaten[opponentId] ?? 0) + 1 },
          },
        })),

      updateBlackjack: (patch) => set((s) => ({ blackjack: { ...s.blackjack, ...patch } })),

      updateDraw: (patch) => set((s) => ({ draw: { ...s.draw, ...patch } })),

      updateCraps: (patch) => set((s) => ({ craps: { ...s.craps, ...patch } })),

      updateReversi: (patch) => set((s) => ({ reversi: { ...s.reversi, ...patch } })),

      importSave: (json) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(json)
        } catch {
          return { ok: false, error: 'That file isn’t valid JSON.' }
        }
        if (!isSaveData(parsed)) return { ok: false, error: 'That file isn’t an Atomic Hub save.' }
        const base = newSave()
        set({
          ...parsed,
          settings: { ...base.settings, ...parsed.settings },
          blackjack: { ...base.blackjack, ...parsed.blackjack },
          draw: { ...base.draw, ...parsed.draw },
          craps: { ...base.craps, ...parsed.craps },
          reversi: { ...base.reversi, ...parsed.reversi },
        })
        return { ok: true }
      },

      resetSave: () => set(newSave()),
    }),
    {
      name: 'atomic-hub-save',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => snapshot(s),
      // Merge section by section so a partial or older save never loses defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SaveData>
        const caravan = { ...current.caravan, ...p.caravan }
        if (!Array.isArray(caravan.collection)) caravan.collection = current.caravan.collection
        if (!Array.isArray(caravan.decks) || caravan.decks.length === 0) caravan.decks = current.caravan.decks
        if (!caravan.decks.some((d) => d.id === caravan.activeDeckId)) caravan.activeDeckId = caravan.decks[0].id
        return {
          ...current,
          wallet: { ...current.wallet, ...p.wallet },
          settings: { ...current.settings, ...p.settings },
          stats: { ...current.stats, ...p.stats },
          caravan: { ...caravan, beaten: { ...caravan.beaten } },
          blackjack: { ...current.blackjack, ...p.blackjack },
          draw: { ...current.draw, ...p.draw },
          craps: { ...current.craps, ...p.craps },
          reversi: { ...current.reversi, ...p.reversi },
        }
      },
    },
  ),
)

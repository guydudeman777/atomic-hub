import { describe, expect, it } from 'vitest'
import { fullSet } from '../../core/cards'
import { createRng } from '../../core/rng'
import { type AiProfile, chooseMove, determinize } from './ai'
import { type GameState, type PlayerId, applyMove, createGame, isLegal } from './engine'

function playOut(profiles: [AiProfile, AiProfile], seed: number, firstPlayer: PlayerId = 0): GameState {
  const rng = createRng(seed)
  let state = createGame({ decks: [fullSet('a'), fullSet('b')], rng, firstPlayer })
  for (let turn = 0; turn < 600 && state.winner === null; turn++) {
    const move = chooseMove(state, profiles[state.current], rng)
    expect(isLegal(state, move)).toBe(true)
    state = applyMove(state, move).state
  }
  return state
}

const easy: AiProfile = { difficulty: 'easy', aggression: 0.1 }
const normal: AiProfile = { difficulty: 'normal', aggression: 1 }
const hard: AiProfile = { difficulty: 'hard', aggression: 1 }

describe('caravan AI', () => {
  it('determinizing hides only what the AI cannot see', () => {
    const state = createGame({ decks: [fullSet('a'), fullSet('b')], rng: createRng(1) })
    const sample = determinize(state, 0, createRng(2))
    expect(sample.players[0].hand).toEqual(state.players[0].hand)
    expect(sample.players[1].hand).toHaveLength(state.players[1].hand.length)
    const ids = (s: GameState) => [...s.players[1].hand, ...s.players[1].deck].map((c) => c.id).sort()
    expect(ids(sample)).toEqual(ids(state))
  })

  it('finishes games with a winner', () => {
    for (let seed = 0; seed < 6; seed++) {
      expect(playOut([normal, easy], seed, (seed % 2) as PlayerId).winner).not.toBeNull()
    }
  })

  // A smoke check with fixed seeds; the tuning numbers in ai.ts come from
  // hundreds of paired games, which is too slow for every test run.
  it('stronger levels beat weaker ones most of the time', { timeout: 120_000 }, () => {
    let normalWins = 0
    let hardWins = 0
    const games = 20
    for (let seed = 0; seed < games; seed++) {
      const first = (seed % 2) as PlayerId
      if (playOut([normal, easy], 100 + seed, first).winner === 0) normalWins++
      if (playOut([hard, normal], 200 + seed, first).winner === 0) hardWins++
    }
    expect(normalWins / games).toBeGreaterThanOrEqual(0.65)
    expect(hardWins / games).toBeGreaterThan(0.5)
  })
})

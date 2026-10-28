import { beforeEach, describe, expect, it } from 'vitest'
import { STARTING_CAPS } from '../core/wallet'
import { newSave, snapshot, useSave } from './save'

beforeEach(() => useSave.getState().resetSave())

describe('save store', () => {
  it('starts with 500 caps and the starter deck', () => {
    const s = useSave.getState()
    expect(s.wallet.caps).toBe(STARTING_CAPS)
    expect(s.caravan.collection).toHaveLength(54)
    expect(s.caravan.decks[0].cards).toHaveLength(54)
  })

  it('only spends caps you have', () => {
    expect(useSave.getState().spendCaps(600)).toBe(false)
    expect(useSave.getState().spendCaps(200)).toBe(true)
    expect(useSave.getState().wallet.caps).toBe(300)
  })

  it('never goes below zero', () => {
    useSave.getState().adjustCaps(-10_000)
    expect(useSave.getState().wallet.caps).toBe(0)
  })

  it('tracks wins, losses and streaks', () => {
    const { recordResult } = useSave.getState()
    recordResult('caravan', 'win', 50)
    recordResult('caravan', 'win', 20)
    recordResult('caravan', 'loss', -30)
    expect(useSave.getState().stats.caravan).toMatchObject({
      played: 3, won: 2, lost: 1, streak: 0, bestStreak: 2, capsWon: 70, capsLost: 30,
    })
  })

  it('adds cards without duplicates', () => {
    useSave.getState().addCaravanCards(['rust:5H', 'rust:5H', 'standard:5H'])
    expect(useSave.getState().caravan.collection.filter((id) => id.endsWith('5H'))).toEqual(['standard:5H', 'rust:5H'])
  })

  it('always keeps at least one deck', () => {
    useSave.getState().deleteCaravanDeck('starter')
    expect(useSave.getState().caravan.decks).toHaveLength(1)
  })

  it('round-trips through export and import', () => {
    useSave.getState().adjustCaps(-123)
    const exported = JSON.stringify(snapshot(useSave.getState()))
    useSave.getState().resetSave()
    expect(useSave.getState().importSave(exported)).toEqual({ ok: true })
    expect(useSave.getState().wallet.caps).toBe(STARTING_CAPS - 123)
  })

  it('turns 3D tables on for saves made before the setting existed', () => {
    const old = snapshot(useSave.getState())
    const { table3d: _, ...oldSettings } = old.settings
    useSave.getState().updateSettings({ table3d: false })
    expect(useSave.getState().importSave(JSON.stringify({ ...old, settings: oldSettings }))).toEqual({ ok: true })
    expect(useSave.getState().settings.table3d).toBe(true)
  })

  it('keeps Blackjack’s preferences, with defaults for saves made before Blackjack', () => {
    useSave.getState().updateBlackjack({ coach: false })
    const exported = snapshot(useSave.getState())
    expect(exported.blackjack).toEqual({ coach: false, count: false })
    const { blackjack: _, ...old } = exported
    useSave.getState().updateBlackjack({ count: true })
    expect(useSave.getState().importSave(JSON.stringify(old))).toEqual({ ok: true })
    expect(useSave.getState().blackjack).toEqual({ coach: true, count: false })
  })

  it('rejects files that are not saves', () => {
    expect(useSave.getState().importSave('{"hello":1}')).toMatchObject({ ok: false })
    expect(useSave.getState().importSave('not json')).toMatchObject({ ok: false })
    expect(useSave.getState().wallet.caps).toBe(newSave().wallet.caps)
  })
})

import { describe, expect, it } from 'vitest'
import { screenFor, transitionKind } from './routes'

describe('screen transitions', () => {
  it('powers the terminal off when entering a game and on when leaving', () => {
    expect(transitionKind('/', '/caravan')).toBe('enter-game')
    expect(transitionKind('/records', '/caravan/decks')).toBe('enter-game')
    expect(transitionKind('/caravan', '/')).toBe('exit-game')
    expect(transitionKind('/caravan/play', '/')).toBe('exit-game')
  })

  it('sits down at the table and gets up again', () => {
    expect(transitionKind('/caravan', '/caravan/play')).toBe('sit')
    expect(transitionKind('/caravan/play', '/caravan')).toBe('stand')
    expect(transitionKind('/caravan/play', '/caravan/decks')).toBe('stand')
  })

  it('swaps instantly within the hub and between a game’s own pages', () => {
    expect(transitionKind('/', '/settings')).toBeNull()
    expect(transitionKind('/caravan', '/caravan/decks')).toBeNull()
  })

  it('matches game routes by prefix only at a path boundary', () => {
    expect(screenFor('/caravan/play')?.prefix).toBe('/caravan')
    expect(screenFor('/caravans')).toBeUndefined()
    expect(screenFor('/')).toBeUndefined()
  })
})

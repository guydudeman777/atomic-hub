import { describe, expect, it } from 'vitest'
import { REFILL_COOLDOWN_MS, REFILL_TARGET, REFILL_THRESHOLD, claimRefill, formatCountdown, refillStatus } from './wallet'

const NOW = 1_700_000_000_000

describe('caps refills', () => {
  it('is not offered while you can still play', () => {
    expect(refillStatus({ caps: REFILL_THRESHOLD, lastRefillAt: null }, NOW)).toEqual({ kind: 'not-needed' })
    expect(claimRefill({ caps: 400, lastRefillAt: null }, NOW)).toBeNull()
  })

  it('is ready the first time you go broke', () => {
    expect(refillStatus({ caps: 10, lastRefillAt: null }, NOW)).toEqual({ kind: 'ready' })
    expect(claimRefill({ caps: 10, lastRefillAt: null }, NOW)).toEqual({ caps: REFILL_TARGET, lastRefillAt: NOW })
  })

  it('waits ten minutes between refills', () => {
    const wallet = { caps: 0, lastRefillAt: NOW }
    expect(refillStatus(wallet, NOW + 60_000)).toEqual({ kind: 'cooldown', msRemaining: REFILL_COOLDOWN_MS - 60_000 })
    expect(claimRefill(wallet, NOW + REFILL_COOLDOWN_MS - 1)).toBeNull()
    expect(claimRefill(wallet, NOW + REFILL_COOLDOWN_MS)).toEqual({ caps: REFILL_TARGET, lastRefillAt: NOW + REFILL_COOLDOWN_MS })
  })

  it('cooldown is ten minutes', () => {
    expect(REFILL_COOLDOWN_MS).toBe(10 * 60 * 1000)
  })

  it('formats the countdown as m:ss', () => {
    expect(formatCountdown(9 * 60_000 + 5_000)).toBe('9:05')
    expect(formatCountdown(500)).toBe('0:01')
  })
})

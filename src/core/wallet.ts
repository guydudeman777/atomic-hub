/**
 * Caps economy rules, kept free of React and storage so they're easy to test.
 */

export const STARTING_CAPS = 500
/** Below this balance you're considered broke and may claim a refill. */
export const REFILL_THRESHOLD = 50
/** A refill tops your balance back up to this amount. */
export const REFILL_TARGET = 500
/** At most one refill per this many milliseconds. */
export const REFILL_COOLDOWN_MS = 10 * 60 * 1000

export interface WalletState {
  caps: number
  /** Epoch ms of the last refill claimed, or null if never. */
  lastRefillAt: number | null
}

export type RefillStatus =
  | { kind: 'not-needed' }
  | { kind: 'ready' }
  | { kind: 'cooldown'; msRemaining: number }

export function refillStatus(wallet: WalletState, now: number): RefillStatus {
  if (wallet.caps >= REFILL_THRESHOLD) return { kind: 'not-needed' }
  if (wallet.lastRefillAt === null) return { kind: 'ready' }
  const msRemaining = wallet.lastRefillAt + REFILL_COOLDOWN_MS - now
  return msRemaining <= 0 ? { kind: 'ready' } : { kind: 'cooldown', msRemaining }
}

/** Returns the wallet after claiming a refill, or null if one isn't available. */
export function claimRefill(wallet: WalletState, now: number): WalletState | null {
  if (refillStatus(wallet, now).kind !== 'ready') return null
  return { caps: Math.max(wallet.caps, REFILL_TARGET), lastRefillAt: now }
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

import { playSfx } from '../core/sfx'
import { REFILL_TARGET, REFILL_THRESHOLD, formatCountdown, refillStatus } from '../core/wallet'
import { useSave } from '../store/save'
import { useNow } from './useNow'

/** Caps balance with the broke-refill control underneath. */
export function CapsReadout() {
  const wallet = useSave((s) => s.wallet)
  const claim = useSave((s) => s.claimRefill)
  // Only tick while broke, when a countdown may be on screen.
  const now = useNow(wallet.caps < REFILL_THRESHOLD)
  const live = refillStatus(wallet, now)

  return (
    <div className="caps">
      <div className="caps__balance" aria-live="polite">
        <span className="term-dim">Caps</span> <span className="term-caps">{wallet.caps.toLocaleString()}</span>
      </div>
      {live.kind === 'ready' && (
        <button
          className="term-button caps__refill"
          onClick={() => {
            if (claim()) playSfx('coin')
          }}
        >
          Claim refill to {REFILL_TARGET}
        </button>
      )}
      {live.kind === 'cooldown' && (
        <p className="caps__note term-dim">Next refill in {formatCountdown(live.msRemaining)}</p>
      )}
    </div>
  )
}

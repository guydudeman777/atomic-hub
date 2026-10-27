import { useCallback, useEffect, useState } from 'react'

const LINES = [
  'ATOMIC HUB TERMINAL  rev 0.1',
  'Checking caps ledger ............ OK',
  'Shuffling decks ................. OK',
  'Warming vacuum tubes ............ OK',
  '',
  '> Welcome back, caravaneer.',
]

const SEEN_KEY = 'atomic-hub:booted'

function alreadyBooted(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

/** Once-per-session boot text. Any key, click or tap skips it. */
export function Boot({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(alreadyBooted)
  const [shown, setShown] = useState(0)

  const finish = useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Fine: the boot just shows again next time.
    }
    setDone(true)
  }, [])

  useEffect(() => {
    if (done) return
    const t = window.setTimeout(shown >= LINES.length ? finish : () => setShown((n) => n + 1), shown >= LINES.length ? 600 : 220)
    return () => window.clearTimeout(t)
  }, [done, shown, finish])

  useEffect(() => {
    if (done) return
    window.addEventListener('keydown', finish)
    window.addEventListener('pointerdown', finish)
    return () => {
      window.removeEventListener('keydown', finish)
      window.removeEventListener('pointerdown', finish)
    }
  }, [done, finish])

  if (done) return <>{children}</>
  return (
    <div className="casing">
      <div className="casing__plate">THE ATOMIC HUB</div>
      <div className="screen boot" role="status">
        <pre className="boot__text">
          {LINES.slice(0, shown).join('\n')}
          <span className="cursor-blink" aria-hidden="true" />
        </pre>
        <p className="boot__skip term-dim">Press any key or tap to skip</p>
      </div>
    </div>
  )
}

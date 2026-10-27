import type { ReactNode } from 'react'
import { Link } from '../router'
import { CapsReadout } from './CapsReadout'

/** The casing and CRT screen that frame every hub page. */
export function Terminal({ children, back }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="casing">
      <div className="casing__plate">THE ATOMIC HUB</div>
      <main className="screen">
        <header className="term-header">
          {back ? (
            <Link to="/" className="term-button">
              Back to menu
            </Link>
          ) : (
            <h1 className="term-title">
              The Atomic Hub<span className="cursor-blink" aria-hidden="true" />
            </h1>
          )}
          <CapsReadout />
        </header>
        {children}
      </main>
    </div>
  )
}

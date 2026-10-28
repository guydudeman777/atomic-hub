/**
 * A word over an online table when the line has trouble: a player's
 * connection dropped and the game waits for them, or the table closed.
 */

import type { Link } from '../link'
import { useLink } from '../store'

interface Props {
  link: Link | null
  /** Whether the game waits on the others: at a two-player table, a dropped player holds it up. */
  waitsForOthers: boolean
  /** Back to the lobby, after the table's gone. */
  onGone: () => void
}

export function LinkBanner({ link, waitsForOthers, onGone }: Props) {
  if (!link) return null
  if (link.status === 'closed') {
    return (
      <div className="net-banner" role="alert">
        <span>{link.reason ?? 'You left the table.'}</span>
        <button
          onClick={() => {
            useLink.getState().dismiss()
            onGone()
          }}
        >
          Back to the lobby
        </button>
      </div>
    )
  }
  const away = waitsForOthers ? link.roster.filter((m) => !m.online && m.seat !== link.seat) : []
  if (!away.length) return null
  return (
    <div className="net-banner" role="status">
      <span>
        {away.map((m) => m.name).join(' and ')} lost {away.length === 1 ? 'their' : 'the'} connection. Waiting for them to come back…
      </span>
    </div>
  )
}

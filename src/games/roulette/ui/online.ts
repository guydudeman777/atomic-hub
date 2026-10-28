/**
 * Roulette with friends: up to five players at one wheel, each betting
 * their own caps in their own chip color. Bets, take-downs, saying you're
 * done and the host's spins go through the table link, and every browser's
 * session plays them in order (session.ts). The host picks the wheel and
 * the limits; friends can sit down between spins.
 */

import { useEffect } from 'react'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import type { WheelKind } from '../engine'
import { ONLINE_SEATS, sendThrough, useSession } from './session'

export const GAME = 'roulette'
export const SEATS = ONLINE_SEATS

export interface Setup {
  stakesId: string
  wheel: WheelKind
  /** Who's at the table at the start, by link seat. */
  players: { seat: number; name: string }[]
}

export function startOnline(link: Link, stakesId: string, wheel: WheelKind) {
  const players = link.roster.map((m) => ({ seat: m.seat, name: m.name }))
  link.start({ stakesId, wheel, players } satisfies Setup)
}

let played: { code: string; given: number } | null = null

/** Everyone's bets, who's done, and the latest number: what every table should agree on. */
const sumOf = () => {
  const { state, online } = useSession.getState()
  if (!state || !online) return 0
  return fingerprint({
    spins: state.spins,
    last: state.history[0] ?? null,
    // Everyone's bets by seat, yours among them, so every table writes them out the same.
    bets: online.players.map((p, seat) => (seat === online.me ? state.bets : (p?.state.bets ?? null))),
    done: online.players.map((p, seat) => (seat === online.me ? online.done : (p?.done ?? null))),
  })
}

/** After each input, the checksum goes to the host. Players coming and going are left out, as they don't wait for the ball. */
export const checksumAfter = (link: Link | null) => (entry: Entry) => {
  if (link && !isSys(entry.input)) link.checksum(entry.seq, sumOf())
}

export function useRouletteOnline(path: string) {
  const link = useGameLink(GAME)
  const length = link?.log.length ?? 0
  const started = link?.started ?? false

  useEffect(() => {
    if (!link || !started || link.seat === null || link.status === 'closed') return
    const session = useSession.getState()
    if (played?.code !== link.code) {
      played = { code: link.code, given: link.log.length }
      const setup = link.setup as Setup
      sendThrough((input) => link.submit(input))
      session.sit({ stakesId: setup.stakesId, wheel: setup.wheel, online: { me: link.seat, host: link.host, players: setup.players } })
      session.receive(link.log.slice())
      session.catchUp(checksumAfter(link))
      if (path !== '/roulette/play') void navigate('/roulette/play')
      return
    }
    if (played.given < link.log.length) {
      session.receive(link.log.slice(played.given))
      played.given = link.log.length
    }
  }, [link, started, length, path])
}

export function leaveOnline() {
  useLink.getState().leave()
  played = null
  sendThrough(null)
  useSession.getState().leave()
}

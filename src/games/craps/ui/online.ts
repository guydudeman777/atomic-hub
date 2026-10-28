/**
 * Craps with friends: up to four players at one table, each betting their
 * own caps on the same dice, which go round the table on a seven-out. Bets,
 * take-downs and throws go through the table link, and every browser's
 * session plays them in order (session.ts).
 */

import { useEffect } from 'react'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import { ONLINE_SEATS, sendThrough, useSession } from './session'

export const GAME = 'craps'
export const SEATS = ONLINE_SEATS

export interface Setup {
  stakesId: string
  /** Who's at the table at the start, by link seat. */
  players: { seat: number; name: string }[]
}

export function startOnline(link: Link, stakesId: string) {
  const players = link.roster.map((m) => ({ seat: m.seat, name: m.name }))
  link.start({ stakesId, players } satisfies Setup)
}

let played: { code: string; given: number } | null = null

/** Everyone's bets, the point and whose dice they are: what every table should agree on. */
const sumOf = () => {
  const { state, online } = useSession.getState()
  if (!state || !online) return 0
  return fingerprint({
    point: state.point,
    rolls: online.rolls,
    shooter: online.shooter,
    // Everyone's bets by seat, yours among them, so every table writes them out the same.
    bets: online.players.map((p, seat) => (seat === online.me ? state.bets : (p?.state.bets ?? null))),
  })
}

/** After each input, the checksum goes to the host. Players coming and going are left out, as they don't wait for the dice. */
export const checksumAfter = (link: Link | null) => (entry: Entry) => {
  if (link && !isSys(entry.input)) link.checksum(entry.seq, sumOf())
}

export function useCrapsOnline(path: string) {
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
      session.sit({ stakesId: setup.stakesId, online: { me: link.seat, players: setup.players } })
      session.receive(link.log.slice())
      session.catchUp(checksumAfter(link))
      if (path !== '/craps/play') void navigate('/craps/play')
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

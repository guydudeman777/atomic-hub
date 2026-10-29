/**
 * Slots with friends: up to three of you at machines side by side, each
 * playing your own caps on your own machine. Every pull goes through the
 * table link with its stops, and every browser's session plays them in
 * order (session.ts), so everyone sees everyone's reels and Moon Rocket's
 * meter climbs with the whole row's play. The host picks the machine;
 * friends can sit down at any time.
 */

import { useEffect } from 'react'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import type { MachineId } from '../machines'
import { ONLINE_SEATS, sendThrough, useSession } from './session'

export const GAME = 'slots'
export const SEATS = ONLINE_SEATS

export interface Setup {
  machine: MachineId
  /** Who's on the row at the start, by link seat. */
  players: { seat: number; name: string }[]
}

export function startOnline(link: Link, machine: MachineId) {
  const players = link.roster.map((m) => ({ seat: m.seat, name: m.name }))
  link.start({ machine, players } satisfies Setup)
}

let played: { code: string; given: number } | null = null

/** The meter and everyone's pulls: what every row should agree on. Nets are left out: yours lives in your wallet. */
const sumOf = () => {
  const { meter, pulls, online } = useSession.getState()
  if (!online) return 0
  return fingerprint({ meter, pulls: online.players.map((p, seat) => (seat === online.me ? pulls : (p?.pulls ?? null))) })
}

/** After each pull, the checksum goes to the host. Players coming and going are left out. */
export const checksumAfter = (link: Link | null) => (entry: Entry) => {
  if (link && !isSys(entry.input)) link.checksum(entry.seq, sumOf())
}

export function useSlotsOnline(path: string) {
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
      session.sit({ machine: setup.machine, online: { me: link.seat, host: link.host, players: setup.players } })
      session.receive(link.log.slice())
      session.catchUp(checksumAfter(link))
      if (path !== '/slots/play') void navigate('/slots/play')
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

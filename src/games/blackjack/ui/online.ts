/**
 * Blackjack with friends. The host picks the table; everyone sits at it in
 * their own spot, beside whichever regulars are left, and bets their own
 * caps. The inputs (bets, decisions, insurance) go through the table link,
 * and every browser's session plays them in order (session.ts).
 *
 * Players can join between rounds and leave at any time; a player who
 * leaves mid-round stands on what they have.
 */

import { useEffect } from 'react'
import { randomSeed } from '../../../core/rng'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import { SPOTS, type TableMode } from '../content'
import { type PlayerAction, actor } from '../engine'
import { type Human, SPOT_OF_SEAT, type SitConfig, canBet, inputFor, useSession } from './session'

export const GAME = 'blackjack'
/** One player per spot. */
export const SEATS = SPOTS

export interface Setup {
  seed: number
  stakesId: string
  mode: TableMode
  /** Who's at the table at the start, by link seat. */
  players: { seat: number; name: string }[]
}

/** Host: open the table everyone sits down at. */
export function startOnline(link: Link, stakesId: string, mode: TableMode) {
  const players = link.roster.map((m) => ({ seat: m.seat, name: m.name }))
  link.start({ seed: randomSeed(), stakesId, mode, players } satisfies Setup)
}

function sitConfig(setup: Setup, seat: number): SitConfig {
  const humans: (Human | null)[] = Array.from({ length: SPOTS }, () => null)
  for (const p of setup.players) humans[SPOT_OF_SEAT[p.seat]] = { seat: p.seat, name: p.name, gone: false }
  return { mode: setup.mode, stakesId: setup.stakesId, online: { seed: setup.seed, me: SPOT_OF_SEAT[seat], humans } }
}

/** Where this browser is in the table's log. */
let played: { code: string; given: number } | null = null

/** A checksum of the table, for comparing with the host's. */
const sumOf = () => {
  const { state, seats, humans, ready } = useSession.getState()
  return fingerprint({ state, seats: seats.map((o) => o && [o.regular.id, o.stack]), humans: humans.map((h) => h && [h.seat, h.gone]), ready })
}

/** After each input is played, the checksum goes to the host. Players coming and going don't wait for the table, so they're left out. */
export const checksumAfter = (link: Link | null) => (entry: Entry) => {
  if (link && !isSys(entry.input)) link.checksum(entry.seq, sumOf())
}

/** Sit down when the host starts, catch up on anything already played, then pass on each input as it comes. */
export function useBlackjackOnline(path: string) {
  const link = useGameLink(GAME)
  const length = link?.log.length ?? 0
  const started = link?.started ?? false

  useEffect(() => {
    if (!link || !started || link.seat === null || link.status === 'closed') return
    const session = useSession.getState()
    if (played?.code !== link.code) {
      played = { code: link.code, given: link.log.length }
      session.sit(sitConfig(link.setup as Setup, link.seat))
      session.receive(link.log.slice())
      session.catchUp(checksumAfter(link))
      if (path !== '/blackjack/play') void navigate('/blackjack/play')
      return
    }
    if (played.given < link.log.length) {
      session.receive(link.log.slice(played.given))
      played.given = link.log.length
    }
  }, [link, started, length, path])
}

/** Get up from the online table: tell it, and leave the session (what's on the felt is lost). */
export function leaveOnline() {
  useLink.getState().leave()
  played = null
  useSession.getState().leave()
}

/** The online table, read outside of rendering. */
export function currentLink(): Link | null {
  const link = useLink.getState().link
  return link?.game === GAME && link.status === 'open' ? link : null
}

/**
 * Your moves at the table. Offline they're played at once; online they go
 * to the table and count when they come back, in order.
 */
export const yourMoves = {
  act(action: PlayerAction) {
    const session = useSession.getState()
    const link = session.config?.online ? currentLink() : null
    if (!link) return session.act(action)
    const { state, me } = session
    if (state && actor(state) === me) link.submit(inputFor(state, { type: 'act', action }))
  },
  insure(take: boolean) {
    const session = useSession.getState()
    const link = session.config?.online ? currentLink() : null
    if (!link) return session.insure(take)
    const { state, me } = session
    if (state && actor(state) === me) link.submit(inputFor(state, { type: 'insure', take }))
  },
  /** Deal, or online, put your bet down for the next deal. */
  deal(amount = useSession.getState().bet) {
    const session = useSession.getState()
    const link = session.config?.online ? currentLink() : null
    if (!link) return void session.deal()
    const { state, stakes, ready, me } = session
    if (!state || !stakes || !canBet(state) || ready[me] !== null) return
    link.submit(inputFor(state, { type: 'bet', amount }))
  },
  /** Host: deal without whoever hasn't bet. */
  dealNow() {
    const { state } = useSession.getState()
    const link = currentLink()
    if (state && link?.host) link.submit(inputFor(state, { type: 'deal-now' }))
  },
}

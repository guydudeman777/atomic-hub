/**
 * Five-Card Draw with friends. The host picks the table and how many
 * regulars sit in; everyone plays their own caps from their own chair, and
 * sees the table from it. The inputs (dealing in, bets, draws) go through
 * the table link, and every browser's session plays them in order
 * (session.ts). Players can join between hands and leave at any time.
 */

import { useEffect } from 'react'
import { randomSeed } from '../../../core/rng'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import { useSave } from '../../../store/save'
import { type BetAction, MAX_SEATS, actor, betweenHands } from '../engine'
import { type Human, type Input, type SitConfig, momentOf, useSession } from './session'

export const GAME = 'draw'
export const SEATS = MAX_SEATS

export interface Setup {
  seed: number
  tableId: string
  /** Regulars sitting in at the start. */
  regulars: number
  /** Who's at the table at the start, by link seat. */
  players: { seat: number; name: string }[]
}

export function startOnline(link: Link, tableId: string, regulars: number) {
  const players = link.roster.map((m) => ({ seat: m.seat, name: m.name }))
  link.start({ seed: randomSeed(), tableId, regulars, players } satisfies Setup)
}

function sitConfig(setup: Setup, seat: number): SitConfig {
  const humans: (Human | null)[] = Array.from({ length: MAX_SEATS }, () => null)
  for (const p of setup.players) humans[p.seat] = { seat: p.seat, name: p.name, gone: false }
  return { opponents: setup.regulars, tableId: setup.tableId, online: { seed: setup.seed, me: seat, humans } }
}

let played: { code: string; given: number } | null = null

const sumOf = () => {
  const { state, seats, humans, ready } = useSession.getState()
  return fingerprint({ state, seats: seats.map((o) => o?.regular.id ?? null), humans: humans.map((h) => h && [h.seat, h.gone]), ready })
}

/** After each input is played, the checksum goes to the host. Players coming and going don't wait for the table, so they're left out. */
export const checksumAfter = (link: Link | null) => (entry: Entry) => {
  if (link && !isSys(entry.input)) link.checksum(entry.seq, sumOf())
}

export function useDrawOnline(path: string) {
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
      if (path !== '/draw/play') void navigate('/draw/play')
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
  sent = null
  useSession.getState().leave()
}

function currentLink(): Link | null {
  const link = useLink.getState().link
  return link?.game === GAME && link.status === 'open' ? link : null
}

/** The decision you last sent, so a second click doesn't send it again. */
let sent: string | null = null
const once = (key: string, send: () => void) => {
  if (sent === key) return
  sent = key
  send()
}

/** Your moves: played at once offline, sent to the table online. */
export const yourMoves = {
  bet(action: BetAction) {
    const session = useSession.getState()
    const link = session.config?.online ? currentLink() : null
    if (!link) return session.bet(action)
    const { state, me } = session
    if (!state || state.phase !== 'betting' || actor(state) !== me) return
    const at = momentOf(state)
    once(JSON.stringify(at), () => link.submit({ type: 'bet', at, action } satisfies Input))
  },
  draw() {
    const session = useSession.getState()
    const link = session.config?.online ? currentLink() : null
    if (!link) return session.draw()
    const { state, me, marked } = session
    if (!state || state.phase !== 'drawing' || actor(state) !== me) return
    const at = momentOf(state)
    once(JSON.stringify(at), () => link.submit({ type: 'draw', at, discards: marked } satisfies Input))
  },
  /** Deal, or online, ask to be dealt in (with nothing, to sit the hand out). */
  deal(sitOut = false) {
    const session = useSession.getState()
    const link = session.config?.online ? currentLink() : null
    if (!link) return void session.deal()
    const { state, ready, me } = session
    if (!state || !betweenHands(state) || ready[me] !== null) return
    const stack = sitOut ? 0 : useSave.getState().wallet.caps
    once(`in-${state.hand}`, () => link.submit({ type: 'in', hand: state.hand, stack } satisfies Input))
  },
  dealNow() {
    const { state } = useSession.getState()
    const link = currentLink()
    if (state && link?.host) link.submit({ type: 'deal-now', hand: state.hand } satisfies Input)
  },
}

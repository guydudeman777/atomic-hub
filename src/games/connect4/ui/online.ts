/**
 * Connect Four across two browsers. The host deals the colors; after that
 * the only inputs are columns dropped into, a resignation, and Play again,
 * which swaps the colors. Each browser plays them through its own match
 * store, so the rack, the sounds and the log work just as they do at
 * hot-seat.
 */

import { useEffect } from 'react'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import { type Player, isLegal } from '../engine'
import { type MatchConfig, useMatch } from './match'

export const GAME = 'connect4'
export const SEATS = 2

export interface Setup {
  /** The seat playing Red in the first game. */
  red: number
  /** By seat. */
  names: [string, string]
}

export type Input = { col: number } | { resign: true } | { again: true }

/** Host: deal the colors and start. */
export function startOnline(link: Link, hostColor: Player | 'random') {
  const names = [0, 1].map((seat) => link.roster.find((m) => m.seat === seat)?.name ?? 'A stranger') as [string, string]
  const hostRed = hostColor === 'random' ? Math.random() < 0.5 : hostColor === 0
  link.start({ red: hostRed ? 0 : 1, names } satisfies Setup)
}

/** The seat playing Red in game number `round`: colors swap every game. */
const redSeat = (setup: Setup, round: number) => (round % 2 === 0 ? setup.red : 1 - setup.red)

/** The match for game number `round` at this table. */
export function configFor(setup: Setup, seat: number, round: number): MatchConfig {
  const red = redSeat(setup, round)
  const yellow = 1 - red
  return { mode: 'online', names: [setup.names[red], setup.names[yellow]], you: seat === red ? 0 : 1 }
}

/** Where this browser is in the table's log. */
let played: { code: string; applied: number; round: number } | null = null

/** Play one input through the match. Anything out of turn or illegal is ignored, the same everywhere. */
function playEntry(entry: Entry, setup: Setup, seat: number, quiet: boolean) {
  const match = useMatch.getState()
  const { state, config } = match
  const input = entry.input as Input
  if (!played || !state || !config || isSys(input)) return
  const player: Player = entry.seat === redSeat(setup, played.round) ? 0 : 1
  if ('col' in input) {
    if (state.current === player && isLegal(state, input.col)) match.play(input.col, quiet)
  } else if ('resign' in input) {
    match.concede(player)
  } else if ('again' in input && state.over) {
    played.round++
    match.start(configFor(setup, seat, played.round), quiet)
  }
}

/** Keep the match in step with the table: start it when the host does, and play every input as it comes. */
export function useConnect4Online(path: string) {
  const link = useGameLink(GAME)
  const length = link?.log.length ?? 0
  const started = link?.started ?? false

  useEffect(() => {
    if (!link || !started || link.seat === null || link.status === 'closed') return
    const setup = link.setup as Setup
    if (played?.code !== link.code) {
      played = { code: link.code, applied: 0, round: 0 }
      useMatch.getState().start(configFor(setup, link.seat, 0), true)
      if (path !== '/connect4/play') void navigate('/connect4/play')
    }
    // Catching up after a reload plays the moves quietly; only the newest one is heard.
    while (played.applied < link.log.length) {
      const entry = link.log[played.applied++]
      playEntry(entry, setup, link.seat, played.applied < link.log.length)
      link.checksum(entry.seq, fingerprint(useMatch.getState().state))
    }
  }, [link, started, length, path])
}

/** Get up from the online table: tell it, and clear the rack. */
export function leaveOnline() {
  useLink.getState().leave()
  played = null
  useMatch.getState().leave()
}

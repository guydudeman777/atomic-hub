/**
 * Tic-Tac-Toe across two browsers. The host picks the game and deals the
 * marks; after that the only inputs are squares played, a resignation,
 * and Play again, which swaps X and O. Each browser plays them through
 * its own match store, so the board, the sounds and the log work just as
 * they do at hot-seat.
 */

import { useEffect } from 'react'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import { type Player, type Variant, isLegal } from '../engine'
import { type MatchConfig, useMatch } from './match'

export const GAME = 'tictactoe'
export const SEATS = 2

export interface Setup {
  variant: Variant
  /** The seat playing X in the first game. */
  x: number
  /** By seat. */
  names: [string, string]
}

export type Input = { square: number } | { resign: true } | { again: true }

/** Host: deal the marks and start. */
export function startOnline(link: Link, variant: Variant, hostMark: Player | 'random') {
  const names = [0, 1].map((seat) => link.roster.find((m) => m.seat === seat)?.name ?? 'A stranger') as [string, string]
  const hostX = hostMark === 'random' ? Math.random() < 0.5 : hostMark === 0
  link.start({ variant: variant === 'ultimate' ? 'ultimate' : 'classic', x: hostX ? 0 : 1, names } satisfies Setup)
}

/** Who plays X in game number `round`: the marks swap every game. */
const xSeat = (setup: Setup, round: number) => (round % 2 === 0 ? setup.x : 1 - setup.x)

/** The match for game number `round` at this table. */
export function configFor(setup: Setup, seat: number, round: number): MatchConfig {
  const x = xSeat(setup, round)
  const you: Player = seat === x ? 0 : 1
  return { mode: 'online', variant: setup.variant, names: [setup.names[x], setup.names[1 - x]], you, xPerson: you === 0 ? 0 : 1 }
}

/** Where this browser is in the table's log. */
let played: { code: string; applied: number; round: number } | null = null

/** Play one input through the match. Anything out of turn or illegal is ignored, the same everywhere. */
function playEntry(entry: Entry, setup: Setup, seat: number, quiet: boolean) {
  const match = useMatch.getState()
  const { state, config } = match
  const input = entry.input as Input
  if (!played || !state || !config || isSys(input)) return
  const player: Player = entry.seat === xSeat(setup, played.round) ? 0 : 1
  if ('square' in input) {
    if (state.current === player && isLegal(state, input.square)) match.play(input.square, quiet)
  } else if ('resign' in input) {
    match.concede(player)
  } else if ('again' in input && state.over) {
    played.round++
    match.start(configFor(setup, seat, played.round), true)
  }
}

/** Keep the match in step with the table: start it when the host does, and play every input as it comes. */
export function useTicTacToeOnline(path: string) {
  const link = useGameLink(GAME)
  const length = link?.log.length ?? 0
  const started = link?.started ?? false

  useEffect(() => {
    if (!link || !started || link.seat === null || link.status === 'closed') return
    const setup = link.setup as Setup
    if (played?.code !== link.code) {
      played = { code: link.code, applied: 0, round: 0 }
      useMatch.getState().start(configFor(setup, link.seat, 0))
      if (path !== '/tictactoe/play') void navigate('/tictactoe/play')
    }
    // Catching up after a reload plays the moves quietly; only the newest one is heard.
    while (played.applied < link.log.length) {
      const entry = link.log[played.applied++]
      playEntry(entry, setup, link.seat, played.applied < link.log.length)
      link.checksum(entry.seq, fingerprint(useMatch.getState().state))
    }
  }, [link, started, length, path])
}

/** Get up from the online table: tell it, and clear the board. */
export function leaveOnline() {
  useLink.getState().leave()
  played = null
  useMatch.getState().leave()
}

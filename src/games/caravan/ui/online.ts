/**
 * Caravan across two browsers. Each player brings their own deck: once
 * the host starts, both send theirs, and when both have arrived each table
 * deals the same game from the host's seed. After that the inputs are the
 * moves, a resignation, and Play again, which deals a fresh game with the
 * other player going first.
 *
 * Both tables hold the whole game, hands included; each only shows you
 * your own.
 */

import { useEffect } from 'react'
import { type Card, parseCardId } from '../../../core/cards'
import { randomSeed } from '../../../core/rng'
import { navigate } from '../../../navigation'
import { type Entry, type Link, isSys } from '../../../net/link'
import { fingerprint, useGameLink, useLink } from '../../../net/store'
import { useSave } from '../../../store/save'
import { STARTER_DECK, deckCards } from '../content'
import { type Move, type PlayerId, checkDeck, other } from '../engine'
import { type MatchConfig, useMatch } from './match'

export const GAME = 'caravan'
export const SEATS = 2

export interface Setup {
  seed: number
  /** Who goes first in the first game. */
  first: PlayerId
  /** By seat. */
  names: [string, string]
}

export type Input = { deck: string[] } | { move: Move } | { resign: true } | { again: true }

/** Host: toss for who goes first, and start. */
export function startOnline(link: Link) {
  const names = [0, 1].map((seat) => link.roster.find((m) => m.seat === seat)?.name ?? 'A stranger') as [string, string]
  link.start({ seed: randomSeed(), first: Math.random() < 0.5 ? 0 : 1, names } satisfies Setup)
}

/** The deck you'd bring: your active one if it's legal, or the starter deck. */
export function deckToBring(): string[] {
  const { decks, activeDeckId } = useSave.getState().caravan
  const deck = decks.find((d) => d.id === activeDeckId)
  return deck && checkDeck(deckCards(deck)).ok ? deck.cards.slice() : STARTER_DECK.cards.slice()
}

/** A deck someone sent: theirs if every card is real and it's legal, or the starter deck. */
function readDeck(ids: unknown): Card[] {
  try {
    if (Array.isArray(ids) && ids.every((id) => typeof id === 'string')) {
      const cards = ids.map(parseCardId)
      if (checkDeck(cards).ok) return cards
    }
  } catch {
    // An unknown card: fall through.
  }
  return deckCards(STARTER_DECK)
}

export function configFor(setup: Setup, seat: number, decks: [Card[], Card[]], round: number): MatchConfig {
  const you = seat as PlayerId
  const names: [string, string] = [setup.names[0], setup.names[1]]
  names[you] = 'You'
  return {
    mode: 'online',
    wager: 0,
    names,
    decks,
    you,
    seed: (setup.seed + round * 0x9e3779b1) >>> 0,
    firstPlayer: round % 2 === 0 ? setup.first : other(setup.first),
  }
}

/** Where this browser is in the table's log. */
let played: { code: string; applied: number; round: number; decks: (Card[] | null)[]; sentDeck: boolean; seated: boolean } | null = null

function playEntry(entry: Entry, setup: Setup, seat: number, quiet: boolean) {
  if (!played || isSys(entry.input)) return
  const input = entry.input as Input
  const player = entry.seat as PlayerId
  const match = useMatch.getState()
  if ('deck' in input) {
    if (played.decks[player]) return
    played.decks[player] = readDeck(input.deck)
    const [a, b] = played.decks
    if (a && b) match.start(configFor(setup, seat, [a, b], 0))
    return
  }
  const { state } = match
  if (!state) return
  if ('move' in input) {
    if (state.winner === null && state.current === player) match.play(input.move, quiet)
  } else if ('resign' in input) {
    match.concede(player)
  } else if ('again' in input && state.winner !== null) {
    played.round++
    const [a, b] = played.decks
    match.start(configFor(setup, seat, [a!, b!], played.round))
  }
}

/** Keep the match in step with the table: bring your deck, deal when both are in, and play every input as it comes. */
export function useCaravanOnline(path: string) {
  const link = useGameLink(GAME)
  const length = link?.log.length ?? 0
  const started = link?.started ?? false

  useEffect(() => {
    if (!link || !started || link.seat === null || link.status === 'closed') return
    const setup = link.setup as Setup
    if (played?.code !== link.code) {
      useMatch.getState().leave()
      played = { code: link.code, applied: 0, round: 0, decks: [null, null], sentDeck: false, seated: false }
    }
    while (played.applied < link.log.length) {
      const entry = link.log[played.applied++]
      playEntry(entry, setup, link.seat, played.applied < link.log.length)
      link.checksum(entry.seq, fingerprint(useMatch.getState().state))
    }
    // Bring your deck, unless the table already has it (you're back after a reload).
    if (!played.sentDeck && !played.decks[link.seat]) {
      played.sentDeck = true
      link.submit({ deck: deckToBring() } satisfies Input)
    }
    // To the table once the cards are dealt.
    if (!played.seated && useMatch.getState().state) {
      played.seated = true
      if (path !== '/caravan/play') void navigate('/caravan/play')
    }
  }, [link, started, length, path])
}

/** Get up from the online table: tell it, and clear the board. */
export function leaveOnline() {
  useLink.getState().leave()
  played = null
  useMatch.getState().leave()
}

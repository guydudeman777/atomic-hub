/**
 * A table shared over the network.
 *
 * One player hosts: their browser keeps the table's one true order of
 * events. Everyone else joins with the table's code. Players are numbered
 * by seat, the host in seat 0.
 *
 * Nothing is sent but what players do. Every game is seeded, so when the
 * host starts the table it sends the setup (the seed, the stakes, who sits
 * where), and from then on each player's moves, bets and draws go to the
 * host, which numbers them and passes them to everyone, itself included.
 * Each browser plays the same inputs in the same order through the same
 * engine, so every table comes out the same. Someone joining late, or
 * coming back after a reload, gets the setup and every input so far, and
 * plays them through to catch up.
 *
 * The link only carries inputs; each game decides what they mean, and
 * waits until its table is ready for the next one (the dealer may still be
 * dealing). To catch a table that has drifted, each guest sends the host a
 * checksum of its game after inputs it plays, and the host says if one
 * doesn't match its own.
 *
 * After the start, people coming and going become inputs too, `join` and
 * `leave`, so every table sees them at the same moment. At a two-player
 * game, a seat isn't given away: whoever left can come back to it.
 */

import { type Transport, type Wire, openTransport } from './transport'

/** Bumped whenever the messages change, so old and new pages don't sit at one table. */
export const PROTOCOL = 1

export interface Member {
  seat: number
  name: string
  online: boolean
}

/** The link's own inputs, for players arriving and leaving after the start. */
export type SysInput = { sys: 'join'; name: string } | { sys: 'leave' }

export interface Entry<I = unknown> {
  seq: number
  seat: number
  input: I | SysInput
}

export const isSys = (input: unknown): input is SysInput => !!input && typeof input === 'object' && 'sys' in input

export type LinkStatus = 'connecting' | 'open' | 'closed'

type Message =
  | { t: 'hello'; v: number; game: string; name: string; token: string }
  | { t: 'welcome'; seat: number; roster: Member[]; setup: unknown; log: Entry[] }
  | { t: 'refused'; reason: string }
  | { t: 'roster'; roster: Member[] }
  | { t: 'start'; setup: unknown }
  | { t: 'submit'; input: unknown }
  | { t: 'input'; entry: Entry }
  | { t: 'sum'; seq: number; sum: number }
  | { t: 'desync'; seq: number }
  | { t: 'bye' }
  | { t: 'close'; reason: string }

export interface LinkOptions {
  /** The game's route, `reversi` or `blackjack`: tables for different games never meet. */
  game: string
  name: string
  /** Seats at the table, the host's included. */
  seats: number
  /** Whether people can sit down after the start. Two-player games keep the seats for whoever left. */
  lateJoin: boolean
  /** For tests. */
  transport?: Transport
  token?: string
}

/** How long a guest looks for the host before giving up. Relays can take a while to introduce two browsers. */
export const FIND_TIMEOUT_MS = 45_000
const HELLO_EVERY_MS = 2000
/** Checksums kept for comparing. */
const SUMS_KEPT = 400

/** The same in every tab of a session, so a reload sits back down in your seat. */
function sessionToken(): string {
  const key = 'atomic-hub:net-token'
  try {
    const saved = window.sessionStorage.getItem(key)
    if (saved) return saved
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    window.sessionStorage.setItem(key, token)
    return token
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

const roomKey = (game: string, code: string) => `atomic-hub/${game}/${code}`

export class Link {
  readonly role: 'host' | 'guest'
  readonly game: string
  readonly code: string
  readonly name: string
  status: LinkStatus = 'connecting'
  /** Why the link closed: refused, host gone, or a checksum that didn't match. */
  reason: string | null = null
  /** Your seat, once seated. */
  seat: number | null = null
  roster: Member[] = []
  /** Set once the host starts the table. */
  setup: unknown = null
  log: Entry[] = []
  /** A guest whose table no longer matches the host's. */
  desynced = false

  private transport: Transport | null = null
  private listeners = new Set<() => void>()
  private readonly options: LinkOptions
  private readonly token: string
  private timers: ReturnType<typeof setTimeout>[] = []

  // Host only.
  private peers = new Map<string, number>()
  private tokens = new Map<string, number>()
  private sums = new Map<number, number>()
  private guestSums = new Map<number, { peer: string; sum: number }[]>()

  // Guest only.
  private hostId: string | null = null

  private constructor(role: 'host' | 'guest', code: string, options: LinkOptions) {
    this.role = role
    this.code = code
    this.game = options.game
    this.name = options.name
    this.options = options
    this.token = options.token ?? sessionToken()
  }

  /** Open a table and wait for players. */
  static async host(code: string, options: LinkOptions): Promise<Link> {
    const link = new Link('host', code, options)
    link.seat = 0
    link.roster = [{ seat: 0, name: options.name, online: true }]
    link.tokens.set(link.token, 0)
    await link.connect()
    link.status = 'open'
    link.changed()
    return link
  }

  /** Find the table with this code and ask for a seat. */
  static async join(code: string, options: LinkOptions): Promise<Link> {
    const link = new Link('guest', code, options)
    await link.connect()
    const hello = () => link.send({ t: 'hello', v: PROTOCOL, game: options.game, name: options.name, token: link.token })
    hello()
    link.every(HELLO_EVERY_MS, () => link.status === 'connecting' && hello())
    link.after(FIND_TIMEOUT_MS, () => {
      if (link.status === 'connecting') link.shut('Nobody’s hosting a table with that code. Check it, or ask the host for a fresh invite.')
    })
    return link
  }

  get started(): boolean {
    return this.setup !== null
  }

  get host(): boolean {
    return this.role === 'host'
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Host: deal everyone in with this setup. */
  start(setup: unknown) {
    if (!this.host || this.started || this.status !== 'open') return
    this.setup = setup
    this.broadcast({ t: 'start', setup })
    this.changed()
  }

  /** Something you did at the table. It counts once the host has numbered it. */
  submit(input: unknown) {
    if (this.status !== 'open' || !this.started || this.seat === null) return
    if (this.host) this.sequence(0, input)
    else if (this.hostId) this.send({ t: 'submit', input }, this.hostId)
  }

  /**
   * After playing the input numbered `seq`, a checksum of the game as it
   * stands. Guests send theirs to the host, which compares them with its own.
   */
  checksum(seq: number, sum: number) {
    if (this.status !== 'open') return
    if (!this.host) {
      if (this.hostId) this.send({ t: 'sum', seq, sum }, this.hostId)
      return
    }
    this.sums.set(seq, sum)
    this.sums.delete(seq - SUMS_KEPT)
    for (const g of this.guestSums.get(seq) ?? []) this.compare(g.peer, seq, g.sum)
    this.guestSums.delete(seq)
    this.guestSums.delete(seq - SUMS_KEPT)
  }

  /** Get up. As host, this closes the table for everyone. */
  leave() {
    if (this.status === 'closed') return
    if (this.host) this.broadcast({ t: 'close', reason: 'The host closed the table.' })
    else if (this.hostId) this.send({ t: 'bye' }, this.hostId)
    this.shut(null)
  }

  // ---- Plumbing -------------------------------------------------------------------

  private async connect() {
    const transport = this.options.transport ?? (await openTransport(roomKey(this.game, this.code)))
    this.transport = transport
    transport.onMessage = (message, from) => this.receive(message as Message, from)
    transport.onPeerLeave = (peer) => this.gone(peer)
  }

  private send(message: Message, to?: string) {
    this.transport?.send(message as unknown as Wire, to)
  }

  /** To every player at the table (the host's own peers; anyone else in the room is ignored). */
  private broadcast(message: Message) {
    for (const peer of this.peers.keys()) this.send(message, peer)
  }

  private changed() {
    for (const l of this.listeners) l()
  }

  private every(ms: number, fn: () => void) {
    this.timers.push(setInterval(fn, ms))
  }

  private after(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms))
  }

  private shut(reason: string | null) {
    if (this.status === 'closed') return
    this.status = 'closed'
    this.reason = reason
    for (const t of this.timers) clearTimeout(t)
    this.transport?.close()
    this.transport = null
    this.changed()
  }

  private receive(message: Message, from: string) {
    if (this.status === 'closed' || !message || typeof message.t !== 'string') return
    if (this.host) this.hostReceive(message, from)
    else this.guestReceive(message, from)
  }

  // ---- Host -----------------------------------------------------------------------

  private hostReceive(message: Message, from: string) {
    switch (message.t) {
      case 'hello':
        this.greet(message, from)
        break
      case 'submit': {
        const seat = this.peers.get(from)
        if (seat !== undefined && this.started) this.sequence(seat, message.input)
        break
      }
      case 'sum': {
        if (!this.peers.has(from)) break
        const mine = this.sums.get(message.seq)
        if (mine !== undefined) this.compare(from, message.seq, message.sum)
        else if (message.seq >= this.log.length - SUMS_KEPT) {
          const waiting = this.guestSums.get(message.seq) ?? []
          this.guestSums.set(message.seq, [...waiting, { peer: from, sum: message.sum }])
        }
        break
      }
      case 'bye':
        this.gone(from)
        break
    }
  }

  private greet(hello: Extract<Message, { t: 'hello' }>, from: string) {
    if (this.peers.has(from)) return
    const refuse = (reason: string) => this.send({ t: 'refused', reason }, from)
    if (hello.game !== this.game) return
    if (hello.v !== PROTOCOL) {
      refuse('The host is on a different version of the hub. Reload the page, and ask them to as well.')
      return
    }
    const name = cleanName(hello.name)
    let seat = this.tokens.get(hello.token)
    const held = seat !== undefined && this.roster.find((m) => m.seat === seat)
    if (held && held.online) {
      refuse('You’re already at this table in another tab.')
      return
    }
    // A seat kept for whoever left a two-player game.
    const returning = !!held
    if (!returning) {
      if (this.started && !this.options.lateJoin) {
        refuse('That game has already started.')
        return
      }
      seat = Array.from({ length: this.options.seats }, (_, i) => i).find((i) => !this.roster.some((m) => m.seat === i))
      if (seat === undefined) {
        refuse('The table is full.')
        return
      }
      this.tokens.set(hello.token, seat)
    }
    const s = seat as number
    this.peers.set(from, s)
    this.roster = returning
      ? this.roster.map((m) => (m.seat === s ? { ...m, name, online: true } : m))
      : [...this.roster, { seat: s, name, online: true }].sort((a, b) => a.seat - b.seat)
    this.send({ t: 'welcome', seat: s, roster: this.roster, setup: this.setup, log: this.log }, from)
    this.broadcast({ t: 'roster', roster: this.roster })
    if (this.started && !returning) this.sequence(s, { sys: 'join', name })
    this.changed()
  }

  private gone(peer: string) {
    if (!this.host) {
      if (peer === this.hostId) this.shut('The host left the table.')
      return
    }
    const seat = this.peers.get(peer)
    if (seat === undefined) return
    this.peers.delete(peer)
    // A two-player game keeps the seat for them; anywhere else it's free again.
    const keep = this.started && !this.options.lateJoin
    this.roster = keep ? this.roster.map((m) => (m.seat === seat ? { ...m, online: false } : m)) : this.roster.filter((m) => m.seat !== seat)
    if (!keep) for (const [token, s] of this.tokens) if (s === seat) this.tokens.delete(token)
    this.broadcast({ t: 'roster', roster: this.roster })
    if (this.started && !keep) this.sequence(seat, { sys: 'leave' })
    this.changed()
  }

  private sequence(seat: number, input: unknown) {
    const entry: Entry = { seq: this.log.length, seat, input }
    this.log.push(entry)
    this.broadcast({ t: 'input', entry })
    this.changed()
  }

  private compare(peer: string, seq: number, sum: number) {
    if (this.sums.get(seq) !== sum && this.peers.has(peer)) this.send({ t: 'desync', seq }, peer)
  }

  // ---- Guest ----------------------------------------------------------------------

  private guestReceive(message: Message, from: string) {
    if (this.hostId === null) {
      if (message.t === 'welcome') {
        this.hostId = from
        this.status = 'open'
        this.seat = message.seat
        this.roster = message.roster
        this.setup = message.setup ?? null
        this.log = message.log
        this.changed()
      } else if (message.t === 'refused') {
        this.shut(message.reason)
      }
      return
    }
    if (from !== this.hostId) return
    switch (message.t) {
      case 'roster':
        this.roster = message.roster
        this.changed()
        break
      case 'start':
        this.setup = message.setup
        this.changed()
        break
      case 'input':
        // Data channels deliver in order; anything else is a repeat.
        if (message.entry.seq !== this.log.length) return
        this.log.push(message.entry)
        this.changed()
        break
      case 'desync':
        this.desynced = true
        this.shut('Your table got out of step with the host’s. Join again to catch up.')
        break
      case 'close':
        this.shut(message.reason)
        break
    }
  }
}

export function cleanName(name: unknown): string {
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 20) : ''
  return clean || 'A stranger'
}

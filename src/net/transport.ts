/**
 * How two browsers reach each other. Everything above this only sees a room
 * with peers in it and JSON messages between them.
 *
 * - nostr: WebRTC data channels between the players' browsers, introduced
 *   through public Nostr relays (Trystero). Nothing to host: the relays only
 *   pass along the handshake, and the game itself goes browser to browser.
 * - local: a BroadcastChannel between tabs of the same browser, for the
 *   end-to-end tests and for trying a table out on one machine. Turned on
 *   with `?net=local` in the address, or `atomic-hub:net` set to `local` in
 *   localStorage.
 */

export type Wire = { [key: string]: unknown }

export interface Transport {
  readonly selfId: string
  /** To one peer, or to everyone in the room. */
  send: (message: Wire, to?: string) => void
  onMessage: ((message: Wire, from: string) => void) | null
  onPeerJoin: ((peerId: string) => void) | null
  onPeerLeave: ((peerId: string) => void) | null
  close: () => void
}

export type TransportKind = 'nostr' | 'local'

export function transportKind(): TransportKind {
  try {
    if (new URLSearchParams(window.location.search).get('net') === 'local') return 'local'
    if (window.localStorage.getItem('atomic-hub:net') === 'local') return 'local'
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return 'nostr'
}

/** Join a room by its key. The Nostr code is only loaded when someone goes online. */
export async function openTransport(room: string, kind: TransportKind = transportKind()): Promise<Transport> {
  if (kind === 'local') {
    const { openLocal } = await import('./local')
    return openLocal(room)
  }
  const { openNostr } = await import('./nostr')
  return openNostr(room)
}

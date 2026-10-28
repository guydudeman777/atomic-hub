/**
 * Rooms in memory, for unit tests: every transport opened on one network
 * hears the others. Messages are delivered on a microtask, in order, the
 * way a data channel delivers them.
 */

import type { Transport, Wire } from './transport'

export interface MemoryNetwork {
  open: (room: string) => Transport
  /** Let every message in flight arrive, and whatever they set off. */
  settle: () => Promise<void>
  /** Cut a peer off without a goodbye, as a closed lid or a dropped connection would. */
  drop: (peerId: string) => void
}

export function memoryNetwork(): MemoryNetwork {
  const rooms = new Map<string, Map<string, Transport>>()
  let next = 0
  let inFlight = 0

  const deliver = (fn: () => void) => {
    inFlight++
    queueMicrotask(() => {
      inFlight--
      fn()
    })
  }

  const leave = (room: string, id: string) => {
    const members = rooms.get(room)
    if (!members?.delete(id)) return
    for (const other of members.values()) deliver(() => other.onPeerLeave?.(id))
  }

  const open = (room: string): Transport => {
    const members = rooms.get(room) ?? new Map<string, Transport>()
    rooms.set(room, members)
    const selfId = `peer${++next}`
    const transport: Transport = {
      selfId,
      send: (message: Wire, to?: string) => {
        if (!members.has(selfId)) return
        const copy = JSON.parse(JSON.stringify(message)) as Wire
        for (const [id, other] of members) {
          if (id === selfId || (to && id !== to)) continue
          deliver(() => members.has(id) && other.onMessage?.(copy, selfId))
        }
      },
      onMessage: null,
      onPeerJoin: null,
      onPeerLeave: null,
      close: () => leave(room, selfId),
    }
    for (const [id, other] of members) {
      deliver(() => other.onPeerJoin?.(selfId))
      deliver(() => transport.onPeerJoin?.(id))
    }
    members.set(selfId, transport)
    return transport
  }

  const settle = async () => {
    for (let i = 0; i < 1000 && inFlight > 0; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  const drop = (peerId: string) => {
    for (const [room, members] of rooms) if (members.has(peerId)) leave(room, peerId)
  }

  return { open, settle, drop }
}

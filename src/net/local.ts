/**
 * A room between tabs of one browser, over a BroadcastChannel. Each tab says
 * hello when it opens, everyone already there answers, and a tab says bye
 * as it closes.
 */

import type { Transport, Wire } from './transport'

type Frame =
  | { kind: 'hello'; from: string }
  | { kind: 'here'; from: string; to: string }
  | { kind: 'bye'; from: string }
  | { kind: 'msg'; from: string; to?: string; data: Wire }

const newId = () => Math.random().toString(36).slice(2, 10)

export function openLocal(room: string): Transport {
  const selfId = newId()
  const channel = new BroadcastChannel(`atomic-hub-net:${room}`)
  const peers = new Set<string>()
  let open = true

  const post = (frame: Frame) => {
    if (open) channel.postMessage(frame)
  }

  const transport: Transport = {
    selfId,
    send: (data, to) => post({ kind: 'msg', from: selfId, to, data }),
    onMessage: null,
    onPeerJoin: null,
    onPeerLeave: null,
    close: () => {
      if (!open) return
      post({ kind: 'bye', from: selfId })
      open = false
      channel.close()
      window.removeEventListener('pagehide', transport.close)
    },
  }

  const joined = (id: string) => {
    if (peers.has(id)) return
    peers.add(id)
    transport.onPeerJoin?.(id)
  }

  channel.onmessage = (e: MessageEvent<Frame>) => {
    const frame = e.data
    if (!open || frame.from === selfId) return
    switch (frame.kind) {
      case 'hello':
        post({ kind: 'here', from: selfId, to: frame.from })
        joined(frame.from)
        break
      case 'here':
        if (frame.to === selfId) joined(frame.from)
        break
      case 'bye':
        if (peers.delete(frame.from)) transport.onPeerLeave?.(frame.from)
        break
      case 'msg':
        if (frame.to && frame.to !== selfId) return
        if (!peers.has(frame.from)) joined(frame.from)
        transport.onMessage?.(frame.data, frame.from)
        break
    }
  }

  window.addEventListener('pagehide', transport.close)
  // Let the caller attach its handlers before anyone answers.
  queueMicrotask(() => post({ kind: 'hello', from: selfId }))
  return transport
}

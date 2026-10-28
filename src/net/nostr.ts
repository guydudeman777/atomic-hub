/**
 * A room over WebRTC, with Trystero finding the other players through public
 * Nostr relays. The room key doubles as the password, so the handshakes the
 * relays carry are encrypted and only someone with the code can join.
 */

import { type JsonValue, joinRoom, selfId } from 'trystero'
import type { Transport, Wire } from './transport'

const APP_ID = 'atomic-hub-tables'

/** Public STUN servers, so players behind ordinary home routers can reach each other. */
const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]

export function openNostr(key: string): Transport {
  const room = joinRoom({ appId: APP_ID, password: key, rtcConfig: { iceServers: ICE_SERVERS } }, key)
  const action = room.makeAction<JsonValue>('m')

  const transport: Transport = {
    selfId,
    send: (message, to) => {
      void action.send(message as JsonValue, { target: to ?? null }).catch(() => {})
    },
    onMessage: null,
    onPeerJoin: null,
    onPeerLeave: null,
    close: () => {
      window.removeEventListener('pagehide', transport.close)
      void room.leave()
    },
  }

  action.onMessage = (data, { peerId }) => {
    if (data && typeof data === 'object' && !Array.isArray(data)) transport.onMessage?.(data as Wire, peerId)
  }
  room.onPeerJoin = (peerId) => transport.onPeerJoin?.(peerId)
  room.onPeerLeave = (peerId) => transport.onPeerLeave?.(peerId)
  window.addEventListener('pagehide', transport.close)
  return transport
}

/**
 * The table you're linked to, if any, for the screens to follow. One at a
 * time: hosting or joining another closes the last.
 */

import { create } from 'zustand'
import { useSave } from '../store/save'
import { newCode } from './codes'
import { Link, type LinkOptions } from './link'

export type LinkSetup = Omit<LinkOptions, 'name'>

interface LinkStore {
  link: Link | null
  /** Bumped whenever the link changes, so screens re-render. */
  tick: number
  /** Opening the connection, before the link exists. */
  opening: boolean
  /** Couldn't open a connection at all. */
  error: string | null
  host: (setup: LinkSetup) => Promise<Link | null>
  join: (code: string, setup: LinkSetup) => Promise<Link | null>
  /** Get up from the table. As host, this closes it for everyone. */
  leave: () => void
  /** Forget a closed link, once its reason has been read. */
  dismiss: () => void
}

/** Your name at online tables, from Settings. */
export const playerName = (): string => useSave.getState().settings.playerName.trim() || 'A stranger'

export const useLink = create<LinkStore>()((set, get) => {
  let unsubscribe: (() => void) | null = null

  const adopt = (link: Link) => {
    unsubscribe?.()
    unsubscribe = link.subscribe(() => set((s) => ({ tick: s.tick + 1 })))
    set((s) => ({ link, opening: false, error: null, tick: s.tick + 1 }))
    return link
  }

  const open = async (make: () => Promise<Link>) => {
    get().leave()
    set({ opening: true, error: null })
    try {
      return adopt(await make())
    } catch {
      set({ opening: false, error: 'Couldn’t reach the network. Check your connection and try again.' })
      return null
    }
  }

  return {
    link: null,
    tick: 0,
    opening: false,
    error: null,
    host: (setup) => open(() => Link.host(newCode(), { ...setup, name: playerName() })),
    join: (code, setup) => open(() => Link.join(code, { ...setup, name: playerName() })),
    leave: () => {
      const { link } = get()
      if (!link) return
      unsubscribe?.()
      unsubscribe = null
      link.leave()
      set((s) => ({ link: null, tick: s.tick + 1 }))
    },
    dismiss: () => {
      const { link } = get()
      if (link?.status === 'closed') {
        unsubscribe?.()
        unsubscribe = null
        set((s) => ({ link: null, tick: s.tick + 1 }))
      }
      set({ error: null })
    },
  }
})

/** The link for `game`, if that's the one you're at. */
export function useGameLink(game: string): Link | null {
  useLink((s) => s.tick)
  const link = useLink((s) => s.link)
  return link && link.game === game ? link : null
}

/** A checksum of a game's state, for comparing tables (FNV-1a over its JSON). */
export function fingerprint(value: unknown): number {
  const text = JSON.stringify(value)
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

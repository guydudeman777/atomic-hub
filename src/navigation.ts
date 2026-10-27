/**
 * A tiny hash router with animated screen changes. Hash URLs (`#/caravan`)
 * work on GitHub Pages without any server rewrites.
 *
 * A screen change plays in two phases (see styles/transitions.css): the
 * outgoing screen animates out under html[data-leaving], then the new screen
 * mounts and animates in under html[data-entering]. With reduced motion or
 * transitions turned off, screens swap instantly.
 */

import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { type Sfx, playSfx } from './core/sfx'
import { type TransitionKind, preloadScreen, transitionKind } from './routes'

function pathFromLocation(): string {
  const path = window.location.hash.replace(/^#/, '')
  return path.startsWith('/') ? path : '/'
}

let path = pathFromLocation()
/** A path we're on our way to, so repeat requests don't stack transitions. */
let pending: string | null = null
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function usePath(): string {
  return useSyncExternalStore(
    subscribe,
    () => path,
    () => '/',
  )
}

function transitionsEnabled(): boolean {
  // Mirrored from settings and prefers-reduced-motion by App.
  return document.documentElement.dataset.transitions !== 'off'
}

/** How long each phase runs; keep in step with styles/transitions.css. */
const PHASES: Record<TransitionKind, { out: number; in: number; sfx?: Sfx; sfxAt?: number }> = {
  'enter-game': { out: 560, in: 650, sfx: 'power-off', sfxAt: 0 },
  'exit-game': { out: 380, in: 720, sfx: 'power-on', sfxAt: 520 },
  sit: { out: 300, in: 560, sfx: 'shuffle', sfxAt: 250 },
  stand: { out: 300, in: 480 },
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** Transitions run one at a time, in order. */
let queue: Promise<void> = Promise.resolve()

function show(to: string, during?: () => void): Promise<void> {
  const run = async () => {
    const kind = transitionKind(path, to)
    const update = () => {
      during?.()
      path = to
      if (pending === to) pending = null
      for (const l of listeners) l()
    }
    if (!kind || !transitionsEnabled()) {
      flushSync(update)
      return
    }

    const root = document.documentElement
    const phase = PHASES[kind]
    if (phase.sfx) window.setTimeout(() => playSfx(phase.sfx as Sfx), phase.sfxAt ?? 0)

    root.dataset.leaving = kind
    await wait(phase.out)
    // Swap in one synchronous step so no frame shows the old screen without its exit pose.
    root.dataset.entering = kind
    delete root.dataset.leaving
    flushSync(update)
    await wait(phase.in)
    if (root.dataset.entering === kind) delete root.dataset.entering
  }
  queue = queue.then(run, run)
  return queue
}

export interface NavigateOptions {
  /** State changes to apply in the same frame as the screen change. */
  during?: () => void
}

export async function navigate(to: string, { during }: NavigateOptions = {}): Promise<void> {
  if (to === path || to === pending) {
    during?.()
    return
  }
  pending = to
  window.history.pushState(null, '', `#${to}`)
  await preloadScreen(to)
  await show(to, during)
}

// Back/forward buttons and hand-edited URLs.
function onHistoryChange() {
  const to = pathFromLocation()
  if (to === path || to === pending) return
  pending = to
  void preloadScreen(to).then(() => show(to))
}
window.addEventListener('popstate', onHistoryChange)
window.addEventListener('hashchange', onHistoryChange)

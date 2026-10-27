/**
 * A tiny hash router. Hash URLs (`#/caravan`) work on GitHub Pages without
 * any server rewrites.
 */

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function currentPath(): string {
  const path = window.location.hash.replace(/^#/, '')
  return path.startsWith('/') ? path : '/'
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/')
}

export function navigate(path: string) {
  if (currentPath() !== path) window.location.hash = path
}

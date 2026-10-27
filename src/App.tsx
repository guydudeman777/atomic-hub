import { Suspense, useEffect, useSyncExternalStore } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Boot } from './hub/Boot'
import { HubScreen } from './hub/HubScreen'
import { RecordsScreen } from './hub/RecordsScreen'
import { SettingsScreen } from './hub/SettingsScreen'
import { navigate, usePath } from './navigation'
import { screenFor } from './routes'
import { useSave } from './store/save'

const motionQuery = '(prefers-reduced-motion: reduce)'
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(motionQuery)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(motionQuery).matches,
    () => false,
  )
}

/** Mirror display settings onto <html> so plain CSS can react to them. */
function useDisplaySettings() {
  const { phosphor, crt, flicker, transitions } = useSave((s) => s.settings)
  const reduced = useReducedMotion()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.phosphor = phosphor
    root.dataset.crt = crt ? 'on' : 'off'
    root.dataset.flicker = flicker && !reduced ? 'on' : 'off'
    root.dataset.transitions = transitions && !reduced ? 'on' : 'off'
  }, [phosphor, crt, flicker, transitions, reduced])
}

function Screen({ path }: { path: string }) {
  if (path === '/records') return <RecordsScreen />
  if (path === '/settings') return <SettingsScreen />
  const game = screenFor(path)
  if (game) {
    // Already loaded when we got here through navigate(); lazy for direct links.
    const GameApp = game.component ?? game.lazy
    return (
      <Suspense fallback={<div className="loading">Loading…</div>}>
        <GameApp path={path} />
      </Suspense>
    )
  }
  return <HubScreen />
}

export default function App() {
  useDisplaySettings()
  const path = usePath()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])
  return (
    <Boot>
      <ErrorBoundary key={path} onHome={() => navigate('/')}>
        <Screen path={path} />
      </ErrorBoundary>
    </Boot>
  )
}

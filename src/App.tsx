import { Suspense, lazy, useEffect, useSyncExternalStore } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Boot } from './hub/Boot'
import { HubScreen } from './hub/HubScreen'
import { RecordsScreen } from './hub/RecordsScreen'
import { SettingsScreen } from './hub/SettingsScreen'
import { navigate, usePath } from './navigation'
import { useSave } from './store/save'

const CaravanApp = lazy(() => import('./games/caravan/ui/CaravanApp'))

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
  const { phosphor, crt, flicker } = useSave((s) => s.settings)
  const reduced = useReducedMotion()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.phosphor = phosphor
    root.dataset.crt = crt ? 'on' : 'off'
    root.dataset.flicker = flicker && !reduced ? 'on' : 'off'
  }, [phosphor, crt, flicker, reduced])
}

function Screen({ path }: { path: string }) {
  if (path === '/records') return <RecordsScreen />
  if (path === '/settings') return <SettingsScreen />
  if (path === '/caravan' || path.startsWith('/caravan/')) {
    return (
      <Suspense fallback={<div className="loading">Loading…</div>}>
        <CaravanApp path={path} />
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

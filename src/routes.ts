/**
 * Game screens and the transitions between screens.
 *
 * Each game's code is split into its own chunk. Navigation loads it before
 * starting a screen transition, so the animation never captures a loading
 * placeholder.
 */

import { type ComponentType, lazy } from 'react'

export interface GameScreenProps {
  path: string
}

type GameModule = { default: ComponentType<GameScreenProps> }

export interface GameScreen {
  prefix: string
  /** Set once the code has loaded, so the screen can render without suspending. */
  component: ComponentType<GameScreenProps> | null
  /** For direct links, before anything has been preloaded. */
  lazy: ComponentType<GameScreenProps>
  load: () => Promise<GameModule>
}

function gameScreen(prefix: string, importer: () => Promise<GameModule>): GameScreen {
  let loading: Promise<GameModule> | null = null
  const load = () => {
    loading ??= importer().then(
      (module) => {
        screen.component = module.default
        return module
      },
      (error: unknown) => {
        loading = null
        throw error
      },
    )
    return loading
  }
  const screen: GameScreen = { prefix, component: null, lazy: lazy(load), load }
  return screen
}

export const GAME_SCREENS: readonly GameScreen[] = [
  gameScreen('/caravan', () => import('./games/caravan/ui/CaravanApp')),
  gameScreen('/blackjack', () => import('./games/blackjack/ui/BlackjackApp')),
  gameScreen('/draw', () => import('./games/draw/ui/DrawApp')),
  gameScreen('/craps', () => import('./games/craps/ui/CrapsApp')),
  gameScreen('/reversi', () => import('./games/reversi/ui/ReversiApp')),
]

export function screenFor(path: string): GameScreen | undefined {
  return GAME_SCREENS.find((s) => path === s.prefix || path.startsWith(`${s.prefix}/`))
}

/** Load a game's code ahead of showing it. Failures surface when it renders. */
export function preloadScreen(path: string): Promise<void> {
  const screen = screenFor(path)
  if (!screen || screen.component) return Promise.resolve()
  return screen.load().then(
    () => undefined,
    () => undefined,
  )
}

/**
 * - enter-game / exit-game: between the hub terminal and a game
 * - sit / stand: between a game's lobby and its table (`<game>/play`)
 */
export type TransitionKind = 'enter-game' | 'exit-game' | 'sit' | 'stand'

const isTable = (path: string) => path.endsWith('/play')

export function transitionKind(from: string, to: string): TransitionKind | null {
  const fromGame = !!screenFor(from)
  const toGame = !!screenFor(to)
  if (!fromGame && toGame) return 'enter-game'
  if (fromGame && !toGame) return 'exit-game'
  if (!fromGame) return null
  if (!isTable(from) && isTable(to)) return 'sit'
  if (isTable(from) && !isTable(to)) return 'stand'
  return null
}

import { useEffect, useRef, useState } from 'react'
import { playSfx } from '../core/audio/sfx'
import { Link } from '../router'
import { navigate } from '../navigation'
import { preloadScreen } from '../routes'
import { emptyStats, useSave } from '../store/save'
import { CATEGORIES, type Category, GAMES, type GameInfo } from './games'
import { GameIcon } from './Icons'
import { Terminal } from './Terminal'

const TAB_KEY = 'atomic-hub:tab'

function initialTab(): Category {
  try {
    const saved = sessionStorage.getItem(TAB_KEY)
    if (saved && CATEGORIES.some((c) => c.id === saved)) return saved as Category
  } catch {
    // Storage can be unavailable (private mode); the default tab is fine.
  }
  return 'cards'
}

export function HubScreen() {
  const [tab, setTab] = useState<Category>(initialTab)
  const [selected, setSelected] = useState<Record<Category, number>>({ cards: 0, casino: 0, board: 0 })
  const listRef = useRef<HTMLUListElement>(null)

  const games = GAMES.filter((g) => g.category === tab)
  const index = Math.min(selected[tab], games.length - 1)
  const game = games[index]

  // Fetch playable games' code in the background so entering one is instant.
  useEffect(() => {
    for (const g of GAMES) if (g.ready) void preloadScreen(g.path)
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_KEY, tab)
    } catch {
      // Not critical.
    }
  }, [tab])

  const select = (i: number) => {
    setSelected((s) => ({ ...s, [tab]: i }))
    playSfx('tick')
  }

  const changeTab = (step: number) => {
    const i = CATEGORIES.findIndex((c) => c.id === tab)
    setTab(CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length].id)
    playSfx('tick')
  }

  const open = (g: GameInfo) => {
    if (!g.ready) {
      playSfx('error')
      return
    }
    void navigate(g.path)
  }

  // Arrow keys drive the menu like a terminal; Enter opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea')) return
      if (e.key === 'ArrowDown') select((index + 1) % games.length)
      else if (e.key === 'ArrowUp') select((index - 1 + games.length) % games.length)
      else if (e.key === 'ArrowRight') changeTab(1)
      else if (e.key === 'ArrowLeft') changeTab(-1)
      else if (e.key === 'Enter' && !target.closest('button, a')) open(game)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <Terminal>
      <nav className="hub-tabs" aria-label="Game categories">
        <div role="tablist" className="hub-tabs__cats">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === tab}
              className="hub-tab"
              onClick={() => {
                setTab(c.id)
                playSfx('tick')
              }}
            >
              <span className="wide-only">{c.label}</span>
              <span className="narrow-only">{c.short}</span>
            </button>
          ))}
        </div>
        <div className="hub-tabs__links">
          <Link to="/records" className="hub-tab">
            Records
          </Link>
          <Link to="/settings" className="hub-tab">
            Settings
          </Link>
        </div>
      </nav>

      <div className="hub-body">
        <ul className="hub-list" ref={listRef} role="listbox" aria-label="Games" aria-activedescendant={`game-${game.id}`}>
          {games.map((g, i) => (
            <li
              key={g.id}
              id={`game-${g.id}`}
              role="option"
              aria-selected={i === index}
              className={`hub-item${i === index ? ' is-active' : ''}${g.ready ? '' : ' is-locked'}`}
              // A mouse selects by pointing. A tap selects, and a second tap opens.
              onPointerEnter={(e) => e.pointerType === 'mouse' && i !== index && select(i)}
              onClick={() => (i === index ? open(g) : select(i))}
            >
              <span className="hub-item__name">{g.name}</span>
              {!g.ready && <span className="hub-item__tag">In development</span>}
              {g.ready && i === index && (
                <span className="hub-item__go" aria-hidden="true">
                  Play
                </span>
              )}
            </li>
          ))}
        </ul>

        <GameDetail game={game} onPlay={() => open(game)} />
      </div>

      <footer className="hub-footer term-dim">
        <span>
          <span className="term-kbd">↑</span> <span className="term-kbd">↓</span> choose
        </span>
        <span>
          <span className="term-kbd">←</span> <span className="term-kbd">→</span> category
        </span>
        <span>
          <span className="term-kbd">Enter</span> play
        </span>
      </footer>
    </Terminal>
  )
}

function GameDetail({ game, onPlay }: { game: GameInfo; onPlay: () => void }) {
  const stats = useSave((s) => s.stats[game.id]) ?? emptyStats()
  return (
    <section className="hub-detail" aria-live="polite">
      <div className="hub-detail__icon">
        <GameIcon icon={game.icon} size={132} />
      </div>
      <h2 className="term-heading">{game.name}</h2>
      <p className="hub-detail__blurb">{game.blurb}</p>
      <dl className="hub-detail__facts">
        <dt>Play</dt>
        <dd>{game.modes}</dd>
        <dt>Record</dt>
        <dd>
          {stats.played === 0
            ? 'No games yet'
            : `${stats.won} won, ${stats.lost} lost${stats.drawn ? `, ${stats.drawn} drawn` : ''}`}
        </dd>
      </dl>
      {game.ready ? (
        <button className="term-button term-button--primary hub-detail__play" onClick={onPlay}>
          Play {game.name}
        </button>
      ) : (
        <p className="term-dim">Coming in a later update. Caravan is open now.</p>
      )}
    </section>
  )
}

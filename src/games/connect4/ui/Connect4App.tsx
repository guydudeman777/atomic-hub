import { codeFromPath } from '../../../net/codes'
import { Link } from '../../../router'
import { Lobby } from './Lobby'
import { GAME, useConnect4Online } from './online'
import { RulesText } from './Rules'
import { FerrisWheel } from './Scenery'
import { Table } from './Table'
import '@fontsource/bungee/latin-400.css'
import '../connect4.css'
import '../connect4-3d.css'

const SECTIONS = [
  { path: '/connect4', label: 'Opponents', short: 'Play' },
  { path: '/connect4/rules', label: 'How to play', short: 'Rules' },
]

export default function Connect4App({ path }: { path: string }) {
  useConnect4Online(path)
  if (path === '/connect4/play') {
    return (
      <div className="c4 c4-midway">
        <Table />
      </div>
    )
  }

  const page =
    path === '/connect4/rules' ? (
      <div className="c4-card c4-rules-page">
        <RulesText />
      </div>
    ) : (
      <Lobby inviteCode={codeFromPath(path, GAME)} />
    )

  return (
    <div className="c4 c4-midway c4-page">
      <header className="c4-header">
        <Link to="/" className="c4-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <h1 className="c4-sign">
          <span className="c4-sign__bulbs" aria-hidden="true" />
          <span className="c4-sign__text">Connect Four</span>
        </h1>
        <nav className="c4-nav" aria-label="Connect Four">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="c4-nav__link" aria-current={path === s.path || (s.path === '/connect4' && path.startsWith('/connect4/join/')) ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <FerrisWheel className="c4-header__wheel" />
      </header>
      <main className="c4-main">{page}</main>
    </div>
  )
}

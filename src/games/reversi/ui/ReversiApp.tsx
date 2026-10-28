import { Link } from '../../../router'
import { Lobby } from './Lobby'
import { RulesText } from './Rules'
import { StarburstClock } from './StarburstClock'
import { Table } from './Table'
import '@fontsource/righteous/latin-400.css'
import '../reversi.css'
import '../reversi-3d.css'

const SECTIONS = [
  { path: '/reversi', label: 'Opponents', short: 'Play' },
  { path: '/reversi/rules', label: 'How to play', short: 'Rules' },
]

export default function ReversiApp({ path }: { path: string }) {
  if (path === '/reversi/play') {
    return (
      <div className="rv rv-den">
        <Table />
      </div>
    )
  }

  const page =
    path === '/reversi/rules' ? (
      <div className="rv-card rv-rules-page">
        <RulesText />
      </div>
    ) : (
      <Lobby />
    )

  return (
    <div className="rv rv-den rv-page">
      <header className="rv-header">
        <Link to="/" className="rv-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <h1 className="rv-sign">
          <svg className="rv-sign__spark" viewBox="-10 -10 20 20" aria-hidden="true">
            <path d="M0-10L1.6-1.6 10 0 1.6 1.6 0 10-1.6 1.6-10 0-1.6-1.6Z" />
          </svg>
          Reversi
        </h1>
        <nav className="rv-nav" aria-label="Reversi">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="rv-nav__link" aria-current={path === s.path ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <StarburstClock className="rv-clock" />
      </header>
      <main className="rv-main">{page}</main>
    </div>
  )
}

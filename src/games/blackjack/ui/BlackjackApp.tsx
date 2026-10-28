import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { Lobby } from './Lobby'
import { RulesText, StrategyChart } from './Rules'
import { Table } from './Table'
import '@fontsource/limelight/latin-400.css'
import '../blackjack.css'
import '../blackjack-3d.css'

const SECTIONS = [
  { path: '/blackjack', label: 'Tables' },
  { path: '/blackjack/strategy', label: 'Strategy chart' },
  { path: '/blackjack/rules', label: 'How to play' },
]

export default function BlackjackApp({ path }: { path: string }) {
  if (path === '/blackjack/play') {
    return (
      <div className="bj bj-room">
        <Table />
      </div>
    )
  }

  let page
  if (path === '/blackjack/strategy') page = <div className="bj-panel bj-page-panel"><StrategyChart /></div>
  else if (path === '/blackjack/rules') page = <div className="bj-panel bj-page-panel"><RulesText /></div>
  else page = <Lobby />

  return (
    <div className="bj bj-room bj-page">
      <header className="bj-header">
        <Link to="/" className="bj-back">
          Back to the hub
        </Link>
        <h1 className="bj-sign">
          <svg className="bj-sign__star" viewBox="-10 -10 20 20" aria-hidden="true">
            <path d="M0-10L1.6-1.6 10 0 1.6 1.6 0 10-1.6 1.6-10 0-1.6-1.6Z" />
          </svg>
          Blackjack
        </h1>
        <nav className="bj-nav" aria-label="Blackjack">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="bj-nav__link" aria-current={path === s.path ? 'page' : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>
        <CapsTag />
      </header>
      <main className="bj-main">{page}</main>
    </div>
  )
}

function CapsTag() {
  const caps = useSave((s) => s.wallet.caps)
  return (
    <Link to="/" className="bj-caps" title="Caps. Refills are claimed from the hub menu.">
      {caps.toLocaleString()} caps
    </Link>
  )
}

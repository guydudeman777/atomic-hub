import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { DeckBuilder } from './DeckBuilder'
import { Lobby } from './Lobby'
import { RulesText } from './Rules'
import { Table } from './Table'
import { Trader } from './Trader'
import '../caravan.css'
import '../caravan-3d.css'

const SECTIONS = [
  { path: '/caravan', label: 'Tables', short: 'Tables' },
  { path: '/caravan/decks', label: 'Deck builder', short: 'Decks' },
  { path: '/caravan/trader', label: 'Trader', short: 'Trader' },
  { path: '/caravan/rules', label: 'How to play', short: 'Rules' },
]

export default function CaravanApp({ path }: { path: string }) {
  if (path === '/caravan/play') {
    return (
      <div className="cv cv-wood">
        <Table />
      </div>
    )
  }

  let page
  if (path === '/caravan/decks') page = <DeckBuilder />
  else if (path === '/caravan/trader') page = <Trader />
  else if (path === '/caravan/rules')
    page = (
      <div className="cv-paper cv-rules-page">
        <RulesText />
      </div>
    )
  else page = <Lobby />

  return (
    <div className="cv cv-wood cv-page">
      <header className="cv-header">
        <Link to="/" className="cv-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <h1 className="cv-title">Caravan</h1>
        <nav className="cv-nav" aria-label="Caravan">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="cv-nav__link" aria-current={path === s.path ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <CapsTag />
      </header>
      <main className="cv-main">{page}</main>
    </div>
  )
}

function CapsTag() {
  const caps = useSave((s) => s.wallet.caps)
  return (
    <Link to="/" className="cv-caps" title="Caps. Refills are claimed from the hub menu.">
      {caps.toLocaleString()} caps
    </Link>
  )
}

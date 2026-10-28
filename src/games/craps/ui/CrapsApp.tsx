import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { Lobby } from './Lobby'
import { BetsTable, RulesText } from './Rules'
import { Table } from './Table'
import '@fontsource/limelight/latin-400.css'
import '@fontsource/monoton/latin-400.css'
import '../craps.css'
import '../craps-3d.css'

const SECTIONS = [
  { path: '/craps', label: 'Tables', short: 'Tables' },
  { path: '/craps/bets', label: 'Bets and odds', short: 'Odds' },
  { path: '/craps/rules', label: 'How to play', short: 'Rules' },
]

export default function CrapsApp({ path }: { path: string }) {
  if (path === '/craps/play') {
    return (
      <div className="cr cr-room">
        <Table />
      </div>
    )
  }

  let page
  if (path === '/craps/bets') page = <div className="cr-panel cr-page-panel"><BetsTable /></div>
  else if (path === '/craps/rules') page = <div className="cr-panel cr-page-panel"><RulesText /></div>
  else page = <Lobby />

  return (
    <div className="cr cr-room cr-page">
      <header className="cr-header">
        <Link to="/" className="cr-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <Marquee />
        <nav className="cr-nav" aria-label="Craps">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="cr-nav__link" aria-current={path === s.path ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <CapsTag />
      </header>
      <main className="cr-main">{page}</main>
    </div>
  )
}

/** The marquee over the pit: neon letters in a frame of chasing bulbs. */
function Marquee() {
  return (
    <h1 className="cr-marquee">
      <span className="cr-marquee__bulbs" aria-hidden="true" />
      <span className="cr-marquee__text">Craps</span>
    </h1>
  )
}

function CapsTag() {
  const caps = useSave((s) => s.wallet.caps)
  return (
    <Link to="/" className="cr-caps" title="Caps. Refills are claimed from the hub menu.">
      {caps.toLocaleString()} caps
    </Link>
  )
}

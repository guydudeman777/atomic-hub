import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { Lobby } from './Lobby'
import { HandRankings, RulesText } from './Rules'
import { Table } from './Table'
import '@fontsource/rye/latin-400.css'
import '../draw.css'
import '../draw-3d.css'

const SECTIONS = [
  { path: '/draw', label: 'Tables', short: 'Tables' },
  { path: '/draw/rankings', label: 'Hand rankings', short: 'Hands' },
  { path: '/draw/rules', label: 'How to play', short: 'Rules' },
]

export default function DrawApp({ path }: { path: string }) {
  if (path === '/draw/play') {
    return (
      <div className="dw dw-room">
        <Table />
      </div>
    )
  }

  let page
  if (path === '/draw/rankings') page = <div className="dw-panel dw-page-panel"><HandRankings /></div>
  else if (path === '/draw/rules') page = <div className="dw-panel dw-page-panel"><RulesText /></div>
  else page = <Lobby />

  return (
    <div className="dw dw-room dw-page">
      <header className="dw-header">
        <Link to="/" className="dw-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <h1 className="dw-sign">
          <span className="dw-sign__board">Five-Card Draw</span>
        </h1>
        <nav className="dw-nav" aria-label="Five-Card Draw">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="dw-nav__link" aria-current={path === s.path ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <CapsTag />
      </header>
      <main className="dw-main">{page}</main>
    </div>
  )
}

function CapsTag() {
  const caps = useSave((s) => s.wallet.caps)
  return (
    <Link to="/" className="dw-caps" title="Caps. Refills are claimed from the hub menu.">
      {caps.toLocaleString()} caps
    </Link>
  )
}

import { codeFromPath } from '../../../net/codes'
import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { Lobby } from './Lobby'
import { GAME, useSlotsOnline } from './online'
import { PaysTable, RulesText } from './Rules'
import { SymbolSprite } from './Symbols'
import { Table } from './Table'
import '@fontsource/atomic-age/latin-400.css'
import '../slots.css'
import '../slots-3d.css'

const SECTIONS = [
  { path: '/slots', label: 'Machines', short: 'Machines' },
  { path: '/slots/pays', label: 'Paytables', short: 'Pays' },
  { path: '/slots/rules', label: 'How to play', short: 'Rules' },
]

export default function SlotsApp({ path }: { path: string }) {
  useSlotsOnline(path)
  if (path === '/slots/play') {
    return (
      <div className="sl sl-parlor">
        <Table />
      </div>
    )
  }

  let page
  if (path === '/slots/pays') page = <div className="sl-panel sl-page-panel"><PaysTable /></div>
  else if (path === '/slots/rules') page = <div className="sl-panel sl-page-panel"><RulesText /></div>
  else page = <Lobby inviteCode={codeFromPath(path, GAME)} />

  return (
    <div className="sl sl-parlor sl-page">
      <SymbolSprite />
      <header className="sl-header">
        <Link to="/" className="sl-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <Sign />
        <nav className="sl-nav" aria-label="Slots">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="sl-nav__link" aria-current={path === s.path || (s.path === '/slots' && path.startsWith('/slots/join/')) ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <CapsTag />
      </header>
      <main className="sl-main">{page}</main>
    </div>
  )
}

/** Rocket Row's sign: neon letters off a little rocket, with a starburst behind. */
function Sign() {
  return (
    <h1 className="sl-sign">
      <svg className="sl-sign__burst" viewBox="-50 -50 100 100" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4
          const r = i % 2 ? 26 : 46
          return <path key={i} d={`M0 0L${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`} />
        })}
        <circle r="6" />
      </svg>
      <span className="sl-sign__text">Slots</span>
      <span className="sl-sign__sub">Rocket Row</span>
    </h1>
  )
}

function CapsTag() {
  const caps = useSave((s) => s.wallet.caps)
  return (
    <Link to="/" className="sl-caps" title="Caps. Refills are claimed from the hub menu.">
      {caps.toLocaleString()} caps
    </Link>
  )
}

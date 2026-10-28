import { codeFromPath } from '../../../net/codes'
import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { Lobby } from './Lobby'
import { GAME, useRouletteOnline } from './online'
import { BetsTable, RulesText } from './Rules'
import { Table } from './Table'
import '@fontsource/poiret-one/latin-400.css'
import '../roulette.css'
import '../roulette-3d.css'

const SECTIONS = [
  { path: '/roulette', label: 'Tables', short: 'Tables' },
  { path: '/roulette/bets', label: 'Bets and odds', short: 'Odds' },
  { path: '/roulette/rules', label: 'How to play', short: 'Rules' },
]

export default function RouletteApp({ path }: { path: string }) {
  useRouletteOnline(path)
  if (path === '/roulette/play') {
    return (
      <div className="rl rl-salon">
        <Table />
      </div>
    )
  }

  let page
  if (path === '/roulette/bets') page = <div className="rl-panel rl-page-panel"><BetsTable /></div>
  else if (path === '/roulette/rules') page = <div className="rl-panel rl-page-panel"><RulesText /></div>
  else page = <Lobby inviteCode={codeFromPath(path, GAME)} />

  return (
    <div className="rl rl-salon rl-page">
      <header className="rl-header">
        <Link to="/" className="rl-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <Sign />
        <nav className="rl-nav" aria-label="Roulette">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="rl-nav__link" aria-current={path === s.path || (s.path === '/roulette' && path.startsWith('/roulette/join/')) ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <CapsTag />
      </header>
      <main className="rl-main">{page}</main>
    </div>
  )
}

/** The salon's sign: gold deco letters under a sunburst fan. */
function Sign() {
  return (
    <h1 className="rl-sign">
      <svg className="rl-sign__fan" viewBox="-50 -50 100 52" aria-hidden="true">
        {Array.from({ length: 11 }, (_, i) => {
          const a = Math.PI + (i * Math.PI) / 10
          return <path key={i} d={`M0 0L${(48 * Math.cos(a)).toFixed(2)} ${(48 * Math.sin(a)).toFixed(2)}`} />
        })}
        <path d="M-20 0A20 20 0 0 1 20 0" />
        <path d="M-34 0A34 34 0 0 1 34 0" />
      </svg>
      <span className="rl-sign__text">Roulette</span>
    </h1>
  )
}

function CapsTag() {
  const caps = useSave((s) => s.wallet.caps)
  return (
    <Link to="/" className="rl-caps" title="Caps. Refills are claimed from the hub menu.">
      {caps.toLocaleString()} caps
    </Link>
  )
}

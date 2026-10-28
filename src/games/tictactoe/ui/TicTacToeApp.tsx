import { codeFromPath } from '../../../net/codes'
import { Link } from '../../../router'
import { NeonSign } from './Drawn'
import { Lobby } from './Lobby'
import { GAME, useTicTacToeOnline } from './online'
import { RulesText } from './Rules'
import { Table } from './Table'
import '@fontsource/pacifico/latin-400.css'
import '../tictactoe.css'
import '../tictactoe-3d.css'

const SECTIONS = [
  { path: '/tictactoe', label: 'Opponents', short: 'Play' },
  { path: '/tictactoe/rules', label: 'How to play', short: 'Rules' },
]

export default function TicTacToeApp({ path }: { path: string }) {
  useTicTacToeOnline(path)
  if (path === '/tictactoe/play') {
    return (
      <div className="tt tt-diner">
        <Table />
      </div>
    )
  }

  const page =
    path === '/tictactoe/rules' ? (
      <div className="tt-card tt-rules-page">
        <RulesText />
      </div>
    ) : (
      <Lobby inviteCode={codeFromPath(path, GAME)} />
    )

  return (
    <div className="tt tt-diner tt-page">
      <header className="tt-header">
        <Link to="/" className="tt-back">
          <span className="wide-only">Back to the hub</span>
          <span className="narrow-only">‹ Hub</span>
        </Link>
        <h1 className="tt-sign">Tic-Tac-Toe</h1>
        <nav className="tt-nav" aria-label="Tic-Tac-Toe">
          {SECTIONS.map((s) => (
            <Link key={s.path} to={s.path} className="tt-nav__link" aria-current={path === s.path || (s.path === '/tictactoe' && path.startsWith('/tictactoe/join/')) ? 'page' : undefined}>
              <span className="wide-only">{s.label}</span>
              <span className="narrow-only">{s.short}</span>
            </Link>
          ))}
        </nav>
        <NeonSign className="tt-header__neon" />
      </header>
      <main className="tt-main">{page}</main>
    </div>
  )
}

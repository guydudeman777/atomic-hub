import { type CSSProperties, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, randomSeed } from '../../../core/rng'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { chooseMove } from '../ai'
import { opponentById } from '../content'
import {
  COLOR_NAME,
  FILES,
  type GameState,
  type Player,
  cells,
  colOf,
  discCount,
  legalMoves,
  other,
  parseSquare,
  rowOf,
  squareName,
} from '../engine'
import { DiscIcon } from './DiscIcon'
import {
  DROP_MS,
  FLIP_MS,
  type LastMove,
  type MatchConfig,
  type Notice,
  type Remark,
  endLine,
  flipDelay,
  settleTime,
  useMatch,
} from './match'
import { RulesText } from './Rules'
import { StarburstClock } from './StarburstClock'

/**
 * Phones and small windows get the compact table in reversi.css, whose
 * media queries match this one: the HUD keeps its move log and table
 * controls behind a Menu button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 520px)'

/** The AI's pause before its first move, while you settle in. */
const FIRST_MOVE_DELAY_MS = 1300
/** And after the discs from the last move settle, so it looks like it's thinking. */
const THINK_MS = 350
/** When you had to pass, long enough to read the notice before it goes again. */
const PASS_PAUSE_MS = 1500
/** How long a game-over card waits for the last discs to land. */
const GAME_OVER_DELAY_MS = 700

export function Table() {
  const { gameId, config, state, lastMove } = useMatch()
  const play = useMatch((s) => s.play)

  // No game? Back to the lobby.
  useEffect(() => {
    if (!config || !state) navigate('/reversi')
  }, [config, state])

  // The AI moves once the discs from the last move have settled.
  const aiRng = useRef(createRng(randomSeed()))
  useEffect(() => {
    if (!config || !state || config.mode !== 'ai' || state.over || state.current === config.you) return
    const profile = opponentById(config.opponentId ?? '')?.profile
    if (!profile) return
    // The same side moving twice running means you had no move.
    const youPassed = lastMove?.player === state.current
    const delay = lastMove ? settleTime(lastMove) + THINK_MS + (youPassed ? PASS_PAUSE_MS : 0) : FIRST_MOVE_DELAY_MS
    const t = window.setTimeout(() => play(chooseMove(state, profile, aiRng.current)), delay)
    return () => window.clearTimeout(t)
  }, [config, state, lastMove, play])

  if (!config || !state) return null
  return <TableView key={gameId} config={config} state={state} />
}

// ---------------------------------------------------------------------------------

function TableView({ config, state }: { config: MatchConfig; state: GameState }) {
  const { lastMove, remark, notice, log, result } = useMatch()
  const play = useMatch((s) => s.play)
  const showMoves = useSave((s) => s.reversi.showMoves)
  const hotseat = config.mode === 'hotseat'
  const yourTurn = !state.over && (hotseat || state.current === config.you)
  const legal = useMemo(() => new Set(yourTurn ? legalMoves(state) : []), [state, yourTurn])
  const compact = useMediaQuery(COMPACT_TABLE)

  // Against the AI, you sit at the bottom. At hot-seat, Black does.
  const bottom: Player = hotseat ? 0 : config.you
  const top = other(bottom)
  const opponent = opponentById(config.opponentId ?? '')

  // The keyboard cursor: shown once you use the keys, hidden again with Esc or a tap.
  const [cursor, setCursor] = useState(() => parseSquare('d3')!)
  const [cursorShown, setCursorShown] = useState(false)
  const [typed, setTyped] = useState<string | null>(null)
  const [refused, setRefused] = useState<number | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const tryPlay = (square: number) => {
    if (!yourTurn) return
    if (!legal.has(square)) {
      playSfx('error')
      setRefused(square)
      return
    }
    setRefused(null)
    play(square)
  }

  // The game-over card waits for the last discs to land, and can be put away to look at the board.
  const [overShown, setOverShown] = useState(false)
  const [overDismissed, setOverDismissed] = useState(false)
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => setOverShown(true), settleTime(lastMove) + GAME_OVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [result, lastMove])

  // Keyboard: arrows move the cursor, Enter or Space plays it, a letter and a number play a square by name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role="dialog"]')) return
      const key = e.key.toLowerCase()
      const step: Record<string, [number, number]> = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] }
      if (step[key]) {
        const [dr, dc] = step[key]
        const next = Math.min(7, Math.max(0, rowOf(cursor) + dr)) * 8 + Math.min(7, Math.max(0, colOf(cursor) + dc))
        setCursor(next)
        setCursorShown(true)
        setTyped(null)
        if (boardRef.current?.contains(target)) boardRef.current.querySelector<HTMLElement>(`[data-square="${next}"]`)?.focus()
      } else if ((key === 'enter' || key === ' ') && cursorShown && !target.closest('button, a')) {
        tryPlay(cursor)
      } else if (key === 'escape') {
        setCursorShown(false)
        setTyped(null)
      } else if (key.length === 1 && FILES.includes(key)) {
        setTyped(key)
      } else if (typed && /^[1-8]$/.test(key)) {
        const square = parseSquare(`${typed}${key}`)!
        setTyped(null)
        setCursor(square)
        tryPlay(square)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const [black, white] = discCount(state)
  const counts: [number, number] = [black, white]
  const who = (p: Player) => (hotseat ? config.names[p] : p === config.you ? 'You' : (opponent?.name ?? COLOR_NAME[p]))

  let status: string
  if (state.over) status = 'Game over'
  else if (hotseat) status = `${config.names[state.current]} to play`
  else if (yourTurn) status = 'Your turn'
  else status = `${opponent?.name ?? 'Your opponent'} is thinking…`

  let help = ''
  if (result) help = endLine(config, result.winner, result.score)
  else if (yourTurn && refused !== null) help = `${squareName(refused)} doesn’t flank anything. Pick a square with a line of ${COLOR_NAME[other(state.current)].toLowerCase()} discs between it and one of yours.`
  else if (yourTurn) {
    const n = legal.size
    const color = COLOR_NAME[state.current].toLowerCase()
    const moves = `${n} ${n === 1 ? 'square is' : 'squares are'} open`
    help = hotseat
      ? `${COLOR_NAME[state.current]} to play. ${moves}${showMoves ? ', marked on the board' : ''}.`
      : `You play ${color}. ${moves}${showMoves ? ', marked on the board' : ''}.${compact ? '' : ' Arrow keys and Enter work too.'}`
  }

  return (
    <div className="rv-game">
      {/* Upright on a phone, the wall above the table, with the clock on it. */}
      {compact && (
        <div className="rv-wall" aria-hidden="true">
          <StarburstClock className="rv-wall__clock" />
        </div>
      )}
      <PlayerBar
        place="top"
        name={who(top)}
        player={top}
        count={counts[top]}
        active={!state.over && state.current === top}
        thinking={!hotseat && !state.over && state.current === top}
        portrait={!hotseat && opponent ? { initials: opponent.initials, color: opponent.color } : null}
        remark={hotseat ? null : remark}
      />

      <div className="rv-stage">
        {!compact && <StarburstClock className="rv-wall-clock" />}
        <div className="rv-plane">
          <CoffeeTable />
          <Board
            ref={boardRef}
            state={state}
            lastMove={lastMove}
            legal={legal}
            showMoves={showMoves}
            yourTurn={yourTurn}
            cursor={cursorShown ? cursor : null}
            onFocusSquare={setCursor}
            onPlay={(sq) => {
              setCursorShown(false)
              tryPlay(sq)
            }}
          />
        </div>
        <PassNotice notice={notice} config={config} />
      </div>

      <PlayerBar
        place="bottom"
        name={who(bottom)}
        player={bottom}
        count={counts[bottom]}
        active={!state.over && state.current === bottom}
        thinking={false}
        portrait={null}
        remark={null}
      />

      <Hud config={config} state={state} status={status} help={help} log={log} compact={compact} onShowResult={() => setOverDismissed(false)} />

      {result && overShown && !overDismissed && <GameOver onLook={() => setOverDismissed(true)} />}
    </div>
  )
}

// ---- The players ------------------------------------------------------------------

interface BarProps {
  place: 'top' | 'bottom'
  name: string
  player: Player
  count: number
  active: boolean
  thinking: boolean
  portrait: { initials: string; color: string } | null
  remark: Remark | null
}

function PlayerBar({ place, name, player, count, active, thinking, portrait, remark }: BarProps) {
  return (
    <div className={`rv-bar rv-bar--${place}${active ? ' is-active' : ''}`}>
      <div className="rv-bar__who">
        {portrait && (
          <span className="rv-portrait" style={{ background: portrait.color }} aria-hidden="true">
            {portrait.initials}
          </span>
        )}
        <span className="rv-bar__name">{name}</span>
        {thinking && (
          <span className="rv-bar__thinking" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        {portrait && <SpeechBubble name={name} remark={remark} />}
      </div>
      <div className="rv-bar__count" aria-label={`${COLOR_NAME[player]}: ${count} ${count === 1 ? 'disc' : 'discs'}`}>
        <DiscIcon player={player} />
        <span className="rv-bar__number">{count}</span>
      </div>
    </div>
  )
}

/** Long enough to read the line twice at a relaxed pace. */
const readingTime = (text: string) => Math.min(6000, Math.max(2600, 1600 + text.length * 55))

/** The opponent's latest remark, shown once the discs settle and faded after a while. */
function SpeechBubble({ name, remark }: { name: string; remark: Remark | null }) {
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (!remark) return
    const hold = readingTime(remark.text)
    const show = window.setTimeout(() => setShown(remark.id), remark.delay)
    const hide = window.setTimeout(() => setShown(null), remark.delay + hold + 300)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [remark])
  const visible = remark !== null && shown === remark.id
  return (
    <div className="rv-talk" aria-live="polite">
      {visible && (
        <p key={remark.id} className="rv-talk__bubble" style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          <span className="visually-hidden">{name} says: </span>
          {remark.text}
        </p>
      )}
    </div>
  )
}

// ---- The board ----------------------------------------------------------------------

/** The kidney-shaped teak coffee table the board sits on. */
function CoffeeTable() {
  return (
    <svg className="rv-coffee" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="rv-teak" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#8a5530" />
          <stop offset="0.45" stopColor="#a8693b" />
          <stop offset="1" stopColor="#7d4a28" />
        </linearGradient>
        <radialGradient id="rv-lamp" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        id="rv-kidney"
        d="M120 90 C250 10 420 70 520 60 C640 48 760 0 880 70 C990 135 1000 300 940 420 C880 540 700 520 560 500 C420 480 300 560 160 500 C30 445 -10 170 120 90Z"
        fill="url(#rv-teak)"
      />
      <g fill="none" stroke="#5e341a" strokeOpacity="0.35" strokeWidth="2">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M60 ${130 + i * 52} C300 ${100 + i * 52} 640 ${170 + i * 50} 960 ${120 + i * 52}`} />
        ))}
      </g>
      <path
        d="M120 90 C250 10 420 70 520 60 C640 48 760 0 880 70 C990 135 1000 300 940 420 C880 540 700 520 560 500 C420 480 300 560 160 500 C30 445 -10 170 120 90Z"
        fill="url(#rv-lamp)"
        stroke="#4a2a14"
        strokeWidth="8"
      />
    </svg>
  )
}

interface BoardProps {
  state: GameState
  lastMove: LastMove | null
  legal: ReadonlySet<number>
  showMoves: boolean
  yourTurn: boolean
  cursor: number | null
  onFocusSquare: (square: number) => void
  onPlay: (square: number) => void
  ref: Ref<HTMLDivElement>
}

/** Where each disc came from on the latest move: the way it rolls over, and when. */
function flipOf(move: LastMove | null, square: number): { delay: number; ax: number; ay: number } | null {
  if (!move || !move.flipped.includes(square)) return null
  const dr = Math.sign(rowOf(square) - rowOf(move.square))
  const dc = Math.sign(colOf(square) - colOf(move.square))
  // Rolling away from the new disc: its near edge lifts and goes over.
  return { delay: flipDelay(move, square), ax: -dr, ay: dc }
}

function Board({ state, lastMove, legal, showMoves, yourTurn, cursor, onFocusSquare, onPlay, ref }: BoardProps) {
  const board = cells(state)
  const toPlay = state.current
  // The four discs in the middle drop in as the game starts.
  const [opening, setOpening] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setOpening(false), 900)
    return () => window.clearTimeout(t)
  }, [])
  // One square takes Tab; the arrow keys move between them.
  const tabStop = cursor ?? (legal.size ? Math.min(...legal) : 27)

  return (
    <div
      ref={ref}
      className={`rv-board${yourTurn ? '' : ' is-waiting'}`}
      role="group"
      aria-label="Reversi board"
      style={{ '--drop-ms': `${DROP_MS}ms`, '--flip-ms': `${FLIP_MS}ms` } as CSSProperties}
    >
      <div className="rv-board__files" aria-hidden="true">
        {[...FILES].map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
      <div className="rv-board__ranks" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`rv-pin rv-pin--${i}`} aria-hidden="true" />
      ))}
      <div className="rv-grid">
        {[18, 21, 42, 45].map((sq) => (
          <span key={sq} className="rv-dot" style={{ '--r': rowOf(sq), '--c': colOf(sq) } as CSSProperties} aria-hidden="true" />
        ))}
        {board.map((owner, sq) => {
          const playable = legal.has(sq)
          const name = squareName(sq)
          const label = owner !== null ? `${name}, ${COLOR_NAME[owner].toLowerCase()}` : playable ? `${name}, you can play here` : `${name}, empty`
          return (
            <button
              key={sq}
              data-square={sq}
              className={`rv-square${playable ? ' is-legal' : ''}${playable && showMoves ? ' is-marked' : ''}${cursor === sq ? ' is-cursor' : ''}`}
              data-to-play={toPlay}
              tabIndex={sq === tabStop ? 0 : -1}
              aria-label={label}
              aria-disabled={!yourTurn || !playable}
              onFocus={() => onFocusSquare(sq)}
              onClick={() => onPlay(sq)}
            >
              {owner !== null && (
                <Disc
                  key={`${sq}-${owner}`}
                  color={owner}
                  last={state.last === sq}
                  drop={lastMove?.square === sq}
                  flip={flipOf(lastMove, sq)}
                  opening={opening && !lastMove ? sq : null}
                />
              )}
              {owner === null && playable && <span className="rv-ghost" data-c={toPlay} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface DiscProps {
  color: Player
  last: boolean
  drop: boolean
  flip: { delay: number; ax: number; ay: number } | null
  /** At the start of a game, the square it drops onto. */
  opening: number | null
}

/**
 * A disc: two faces back to back. One that's just been turned shows its old
 * color until its moment comes, then rolls over to the new one.
 */
function Disc({ color, last, drop, flip, opening }: DiscProps) {
  const anim = flip ? 'flip' : drop ? 'drop' : opening !== null ? 'drop' : undefined
  const delay = flip ? flip.delay : opening !== null ? 150 + [27, 28, 36, 35].indexOf(opening) * 110 : 0
  const style = { '--delay': `${delay}ms`, ...(flip && { '--ax': flip.ax, '--ay': flip.ay }) } as CSSProperties
  return (
    <span className="rv-disc" data-anim={anim} style={style} aria-hidden="true">
      <span className="rv-disc__face" data-c={color}>
        {last && <span className="rv-last" />}
      </span>
      {flip && <span className="rv-disc__face rv-disc__face--back" data-c={other(color)} />}
    </span>
  )
}

/** "No move for White": over the board, once the discs from the move settle. */
function PassNotice({ notice, config }: { notice: Notice | null; config: MatchConfig }) {
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (!notice) return
    const show = window.setTimeout(() => setShown(notice.id), notice.delay)
    const hide = window.setTimeout(() => setShown(null), notice.delay + 2400)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [notice])
  if (!notice || shown !== notice.id) return null
  // Against the AI, your name is "You".
  const you = (p: Player) => config.mode === 'ai' && p === config.you
  const passer = notice.player
  const mover = other(passer)
  return (
    <div className="rv-notice" role="status">
      <span className="rv-notice__title">Pass</span>
      <span className="rv-notice__text">
        {config.names[passer]} {you(passer) ? 'have' : 'has'} no move. {config.names[mover]} {you(mover) ? 'go' : 'goes'} again.
      </span>
    </div>
  )
}

// ---- The terminal ----------------------------------------------------------------------

interface HudProps {
  config: MatchConfig
  state: GameState
  status: string
  help: string
  log: { id: number; mine: boolean; text: string }[]
  compact: boolean
  onShowResult: () => void
}

function Hud({ config, state, status, help, log, compact, onShowResult }: HudProps) {
  const { resign, leave, start } = useMatch.getState()
  const showMoves = useSave((s) => s.reversi.showMoves)
  const updateReversi = useSave((s) => s.updateReversi)
  const table3d = useSave((s) => s.settings.table3d)
  const updateSettings = useSave((s) => s.updateSettings)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // The menu belongs to the compact layout. Turning a tablet can leave it, and it stays closed.
  if (menuOpen && !compact) setMenuOpen(false)
  const closeMenu = () => {
    setMenuOpen(false)
    setConfirmLeave(false)
  }
  const logRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log, menuOpen])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const opponent = opponentById(config.opponentId ?? '')
  const [black, white] = discCount(state)
  const midGame = !state.over && config.mode === 'ai'
  const getUp = () => void navigate('/reversi', { during: midGame ? resign : leave })

  const moveLog = (
    <ol className="rv-hud__log" ref={logRef} aria-label="Move log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="rv-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
      </button>
      <button className="term-button" aria-pressed={showMoves} onClick={() => updateReversi({ showMoves: !showMoves })}>
        <span aria-hidden="true">{showMoves ? '[x]' : '[ ]'}</span> Show moves
      </button>
      <button className="term-button" aria-pressed={table3d} onClick={() => updateSettings({ table3d: !table3d })}>
        <span aria-hidden="true">{table3d ? '[x]' : '[ ]'}</span> 3D view
      </button>
      {state.over || !confirmLeave ? (
        <button className="term-button" onClick={state.over ? getUp : () => setConfirmLeave(true)}>
          Leave table
        </button>
      ) : (
        <button className="term-button" onClick={getUp}>
          {midGame ? 'Resign the game' : 'Leave for real'}
        </button>
      )}
    </div>
  )

  return (
    <aside className="rv-hud screen" aria-label="Game status">
      <div className="rv-hud__head">
        <p className="rv-hud__label term-dim">{config.mode === 'ai' ? `Reversi against ${opponent?.name}` : 'Reversi, hot-seat'}</p>
        <p className="rv-hud__score" aria-label={`Black ${black}, White ${white}`}>
          B {black} · W {white}
        </p>
      </div>
      <p className="rv-hud__status" aria-live="polite">
        {status}
      </p>
      <p className="rv-hud__help">{help}</p>
      {(state.over || compact) && (
        <div className="rv-hud__actions">
          {state.over && (
            <>
              <button className="term-button term-button--primary" onClick={() => start(config)}>
                Play again
              </button>
              <button className="term-button" onClick={onShowResult}>
                Result
              </button>
            </>
          )}
          {compact && (
            <button className="term-button rv-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
          )}
        </div>
      )}
      {!compact && moveLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="rv-overlay" role="dialog" aria-modal="true" aria-label="Table menu" onClick={closeMenu}>
          <div className="rv-menu screen" onClick={(e) => e.stopPropagation()}>
            {moveLog}
            {tableControls}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="rv-overlay" role="dialog" aria-modal="true" aria-label="Reversi rules" onClick={() => setShowRules(false)}>
          <div className="rv-card rv-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="rv-button rv-button--primary" autoFocus onClick={() => setShowRules(false)}>
              Back to the game
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

// ---- The end ----------------------------------------------------------------------------

function GameOver({ onLook }: { onLook: () => void }) {
  const { config, result, start, leave } = useMatch()
  if (!config || !result) return null
  const opponent = opponentById(config.opponentId ?? '')
  const hotseat = config.mode === 'hotseat'
  const won = !hotseat && result.winner === config.you
  let title: string
  if (result.winner === null) title = 'A draw'
  else if (hotseat) title = `${config.names[result.winner]} wins`
  else title = won ? 'You win' : `${opponent?.name ?? 'Your opponent'} wins`
  const quote = !hotseat && opponent ? (result.winner === null ? opponent.lines.draw : won ? opponent.lines.lose : opponent.lines.win) : null
  // The winner's count first.
  const first: Player = result.winner ?? 0

  return (
    <div className="rv-overlay" role="dialog" aria-modal="true" aria-labelledby="rv-gameover-title">
      <div className="rv-card rv-gameover">
        <h2 id="rv-gameover-title">{title}</h2>
        <p className="rv-gameover__score" aria-label={endLine(config, result.winner, result.score)}>
          <DiscIcon player={first} /> {result.score[first]}
          <span className="rv-gameover__dash">–</span>
          {result.score[other(first)]} <DiscIcon player={other(first)} />
        </p>
        {quote && (
          <blockquote>
            <p>“{quote}”</p>
            <footer>{opponent?.name}</footer>
          </blockquote>
        )}
        {result.unlocked && <p className="rv-gameover__unlock">{result.unlocked} is next on the ladder, and the board’s set up.</p>}
        <div className="rv-gameover__actions">
          <button className="rv-button rv-button--primary" onClick={() => start(config)} autoFocus>
            Play again
          </button>
          <button className="rv-button" onClick={onLook}>
            Look at the board
          </button>
          <button className="rv-button" onClick={() => void navigate('/reversi', { during: leave })}>
            Back to the lobby
          </button>
        </div>
      </div>
    </div>
  )
}

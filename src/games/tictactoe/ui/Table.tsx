import { type CSSProperties, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, randomSeed } from '../../../core/rng'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { thinkMove } from '../ai'
import { opponentById } from '../content'
import {
  type GameState,
  type Player,
  MARK,
  PLACE,
  cells,
  gridName,
  legalMoves,
  other,
  playableGrids,
  position,
  squareAt,
} from '../engine'
import { CoffeeCup, GridLines, Mark, MarkIcon, NeonSign, PieSlice, Strike, WaxFilter } from './Drawn'
import {
  BIG_MARK_MS,
  type LastMove,
  MARK_MS,
  type MatchConfig,
  type Remark,
  STRIKE_MS,
  type Series,
  endLine,
  lineText,
  settleTime,
  useMatch,
} from './match'
import { type Input, GAME, leaveOnline } from './online'
import { RulesText } from './Rules'
import { LinkBanner } from '../../../net/ui/LinkBanner'
import { useGameLink, useLink } from '../../../net/store'

/**
 * Phones and small windows get the compact table in tictactoe.css, whose
 * media queries match this one: the HUD keeps its move log and table
 * controls behind a Menu button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 520px)'

/** The grid lines drawing themselves as a game starts, before anyone moves. */
const SETUP_MS = 760
/** The AI's pause before its first move, while you settle in. */
const FIRST_MOVE_DELAY_MS = 1300
/** And after the pencil's done with the last move, so it looks like it's thinking. Classic answers at once otherwise. */
const THINK_MS = 420
/** How long a game-over card waits for the strike through the winning line. */
const GAME_OVER_DELAY_MS = 600

/** Number-pad keys to squares: 7 is the top left, 3 the bottom right. */
const KEYPAD: Record<string, number> = { '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5, '1': 6, '2': 7, '3': 8 }

export function Table() {
  const { gameId, config, state, lastMove } = useMatch()
  const play = useMatch((s) => s.play)

  // No game? Back to the lobby.
  useEffect(() => {
    if (!config || !state) navigate('/tictactoe')
  }, [config, state])

  const link = useGameLink(GAME)
  const banner = config?.mode === 'online' && <LinkBanner link={link} waitsForOthers onGone={() => void navigate('/tictactoe', { during: leaveOnline })} />

  // The AI moves once the pencil's down from the last move, thinking in slices so the table keeps moving.
  const aiRng = useRef(createRng(randomSeed()))
  useEffect(() => {
    if (!config || !state || config.mode !== 'ai' || state.over || state.current === config.you) return
    const profile = opponentById(config.opponentId ?? '')?.profile
    if (!profile) return
    let cancelled = false
    const delay = lastMove ? settleTime(lastMove) + THINK_MS : FIRST_MOVE_DELAY_MS
    const t = window.setTimeout(() => {
      void thinkMove(state, profile, aiRng.current, () => cancelled).then((move) => {
        if (!cancelled && move !== null) play(move)
      })
    }, delay)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [config, state, lastMove, play])

  if (!config || !state) return null
  return (
    <>
      <TableView key={gameId} gameId={gameId} config={config} state={state} />
      {banner}
    </>
  )
}

// ---------------------------------------------------------------------------------

/** How a square is named on the board: "Top left", or in Ultimate "Center grid, top left". */
function cellLabel(state: GameState, square: number): string {
  if (state.variant === 'classic') return cap(PLACE[square])
  return `${cap(gridName(Math.floor(square / 9)))}, ${PLACE[square % 9]}`
}

const cap = (text: string) => text[0].toUpperCase() + text.slice(1)

function TableView({ gameId, config, state }: { gameId: number; config: MatchConfig; state: GameState }) {
  const { lastMove, remark, log, result, series } = useMatch()
  const play = useMatch((s) => s.play)
  const hotseat = config.mode === 'hotseat'
  const online = config.mode === 'online'
  const ultimate = state.variant === 'ultimate'
  const link = useGameLink(GAME)
  // Online, a move counts once the table has it; one at a time.
  const [sent, setSent] = useState<number | null>(null)
  const waiting = online && sent === state.turn
  // The grid lines draw themselves before the first move can go down.
  const [setUp, setSetUp] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSetUp(true), SETUP_MS)
    playSfx('pencil-x')
    playSfx('pencil-x', { delay: 0.38 })
    return () => window.clearTimeout(t)
  }, [])
  const yourTurn = setUp && !state.over && !waiting && (hotseat || state.current === config.you)
  const legal = useMemo(() => new Set(yourTurn ? legalMoves(state) : []), [state, yourTurn])
  const compact = useMediaQuery(COMPACT_TABLE)

  // Against the AI and online, you sit at the bottom. At hot-seat, the first player does.
  const bottom: Player = hotseat ? (config.xPerson === 0 ? 0 : 1) : config.you
  const top = other(bottom)
  const opponent = opponentById(config.opponentId ?? '')

  // The keyboard cursor: shown once you use the keys, hidden again with Esc or a tap.
  const side = ultimate ? 9 : 3
  const [cursor, setCursor] = useState(() => (ultimate ? 40 : 4))
  const [cursorShown, setCursorShown] = useState(false)
  /** Ultimate, free to play anywhere: the grid picked by its key, waiting for the square's. */
  const [keyedGrid, setKeyedGrid] = useState<number | null>(null)
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
    setKeyedGrid(null)
    if (online) {
      if (!link || link.status !== 'open') {
        playSfx('error')
        return
      }
      setSent(state.turn)
      link.submit({ square } satisfies Input)
    } else play(square)
  }

  // The game-over card waits for the line to be struck through, and can be put away to look at the board.
  const [overShown, setOverShown] = useState(false)
  const [overDismissed, setOverDismissed] = useState(false)
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => setOverShown(true), settleTime(lastMove) + GAME_OVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [result, lastMove])

  // Keyboard: arrows move the cursor, Enter or Space plays it, and the number keys play squares as on a number pad.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role="dialog"]')) return
      const key = e.key.toLowerCase()
      const step: Record<string, [number, number]> = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] }
      if (step[key]) {
        const [dr, dc] = step[key]
        const { row, col } = position(state.variant, cursor)
        const next = squareAt(state.variant, Math.min(side - 1, Math.max(0, row + dr)), Math.min(side - 1, Math.max(0, col + dc)))
        setCursor(next)
        setCursorShown(true)
        if (boardRef.current?.contains(target)) boardRef.current.querySelector<HTMLElement>(`[data-square="${next}"]`)?.focus()
      } else if ((key === 'enter' || key === ' ') && cursorShown && !target.closest('button, a')) {
        tryPlay(cursor)
      } else if (key === 'escape') {
        setCursorShown(false)
        setKeyedGrid(null)
      } else if (key in KEYPAD) {
        const place = KEYPAD[key]
        if (!ultimate) {
          setCursor(place)
          tryPlay(place)
        } else if (state.forced !== null) {
          setCursor(state.forced * 9 + place)
          tryPlay(state.forced * 9 + place)
        } else if (keyedGrid === null) {
          if (!yourTurn || !playableGrids(state).includes(place)) playSfx('error')
          else setKeyedGrid(place)
        } else {
          setCursor(keyedGrid * 9 + place)
          tryPlay(keyedGrid * 9 + place)
        }
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const who = (p: Player) => (hotseat ? config.names[p] : p === config.you ? 'You' : (opponent?.name ?? config.names[p]))

  let status: string
  if (state.over) status = 'Game over'
  else if (hotseat) status = `${config.names[state.current]} to play`
  else if (yourTurn || waiting || (!setUp && state.current === config.you)) status = 'Your turn'
  else if (online) status = `${config.names[state.current]} to play`
  else status = `${opponent?.name ?? 'Your opponent'} is thinking…`

  let help = ''
  if (result?.resigned !== undefined) help = `${who(result.resigned)} ${result.resigned === config.you && !hotseat ? 'resign' : 'resigns'}.`
  else if (result) help = endLine(config, result.winner, state.line)
  else if (yourTurn && refused !== null) {
    const grid = Math.floor(refused / 9)
    help = cells(state)[refused] !== null
      ? 'That square’s taken. Pick an empty one.'
      : ultimate && state.grids[grid] !== null
        ? `${cap(gridName(grid))} is closed. Nobody plays there now.`
        : `You’re sent to ${gridName(state.forced ?? 0)}: play in the highlighted grid.`
  } else if (yourTurn) {
    const mark = MARK[state.current]
    const lead = hotseat ? `${config.names[state.current]} plays ${mark}.` : `You play ${mark}.`
    if (!ultimate) help = `${lead} Pick an empty square.${compact ? '' : ' Keys 1–9 work too, laid out like a number pad.'}`
    else if (state.forced !== null) help = `${lead} You’re sent to ${gridName(state.forced)}, highlighted.${compact ? '' : ' Keys 1–9 pick the square.'}`
    else if (keyedGrid !== null) help = `${lead} ${cap(gridName(keyedGrid))}: now a key for the square.`
    else help = `${lead} Play in any open grid.${compact ? '' : ' A key picks the grid, then another the square.'}`
  } else if (!state.over && ultimate) {
    help = state.forced !== null ? `${who(state.current)} ${state.current === config.you && !hotseat ? 'are' : 'is'} sent to ${gridName(state.forced)}.` : `${who(state.current)} can play in any open grid.`
  }

  return (
    <div className="tt-game">
      {/* Upright on a phone, the wall above the booth, with the neon on it. */}
      {compact && (
        <div className="tt-wall" aria-hidden="true">
          <NeonSign className="tt-wall__neon" />
        </div>
      )}
      <PlayerBar
        place="top"
        name={who(top)}
        player={top}
        active={!state.over && state.current === top}
        thinking={config.mode === 'ai' && !state.over && state.current === top && setUp}
        portrait={!hotseat && opponent ? { initials: opponent.initials, color: opponent.color } : null}
        remark={hotseat ? null : remark}
      />

      <div className="tt-stage">
        {!compact && <NeonSign className="tt-stage__neon" />}
        <div className="tt-plane" data-variant={state.variant}>
          <div className="tt-formica" aria-hidden="true" />
          <CoffeeCup className="tt-cup" />
          <PieSlice className="tt-pie" />
          <div className="tt-mat">
            <div className="tt-mat__print" aria-hidden="true">
              <span className="tt-mat__name">Starlite Diner</span>
              <span className="tt-mat__line">Pie à la mode · Coffee all night</span>
            </div>
            <Board
              ref={boardRef}
              gameId={gameId}
              state={state}
              lastMove={lastMove}
              legal={legal}
              yourTurn={yourTurn}
              keyedGrid={keyedGrid}
              cursor={cursorShown ? cursor : null}
              onFocusSquare={setCursor}
              onPlay={(sq) => {
                setCursorShown(false)
                tryPlay(sq)
              }}
            />
          </div>
        </div>
      </div>

      <PlayerBar
        place="bottom"
        name={who(bottom)}
        player={bottom}
        active={!state.over && state.current === bottom}
        thinking={false}
        portrait={null}
        remark={null}
      />

      <Hud config={config} state={state} status={status} help={help} log={log} series={series} compact={compact} onShowResult={() => setOverDismissed(false)} />

      {result && overShown && !overDismissed && <GameOver onLook={() => setOverDismissed(true)} />}
    </div>
  )
}

// ---- The players ------------------------------------------------------------------

interface BarProps {
  place: 'top' | 'bottom'
  name: string
  player: Player
  active: boolean
  thinking: boolean
  portrait: { initials: string; color: string } | null
  remark: Remark | null
}

function PlayerBar({ place, name, player, active, thinking, portrait, remark }: BarProps) {
  return (
    <div className={`tt-bar tt-bar--${place}${active ? ' is-active' : ''}`}>
      <div className="tt-bar__who">
        {portrait && (
          <span className="tt-portrait" style={{ background: portrait.color }} aria-hidden="true">
            {portrait.initials}
          </span>
        )}
        <span className="tt-bar__name">{name}</span>
        {thinking && (
          <span className="tt-bar__thinking" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        {portrait && <SpeechBubble name={name} remark={remark} />}
      </div>
      <div className="tt-bar__mark" role="img" aria-label={`Plays ${MARK[player]}`}>
        <MarkIcon player={player} />
      </div>
    </div>
  )
}

/** Long enough to read the line twice at a relaxed pace. */
const readingTime = (text: string) => Math.min(6000, Math.max(2600, 1600 + text.length * 55))

/** The opponent's latest remark, shown once the pencil's down and faded after a while. */
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
    <div className="tt-talk" aria-live="polite">
      {visible && (
        <p key={remark.id} className="tt-talk__bubble" style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          <span className="visually-hidden">{name} says: </span>
          {remark.text}
        </p>
      )}
    </div>
  )
}

// ---- The board ----------------------------------------------------------------------

interface BoardProps {
  gameId: number
  state: GameState
  lastMove: LastMove | null
  legal: ReadonlySet<number>
  yourTurn: boolean
  /** Ultimate: a grid picked by its key, waiting for the square. */
  keyedGrid: number | null
  cursor: number | null
  onFocusSquare: (square: number) => void
  onPlay: (square: number) => void
  ref: Ref<HTMLDivElement>
}

function Board({ gameId, state, lastMove, legal, yourTurn, keyedGrid, cursor, onFocusSquare, onPlay, ref }: BoardProps) {
  const board = cells(state)
  const ultimate = state.variant === 'ultimate'
  // Each mark's shape comes from the game and the square, so it keeps it.
  const seed = (square: number) => gameId * 131 + square
  // One square takes Tab; the arrow keys move between them.
  const tabStop = cursor ?? (legal.size ? Math.min(...legal) : ultimate ? 40 : 4)
  const playable = new Set(state.over ? [] : playableGrids(state))
  // When the latest move's big mark and strike go down.
  const bigAt = MARK_MS
  const strikeAt = MARK_MS + (lastMove?.grid !== null && lastMove ? BIG_MARK_MS : 0)
  const fresh = (sq: number) => lastMove?.square === sq

  const cell = (sq: number) => {
    const owner = board[sq]
    const open = legal.has(sq)
    const name = cellLabel(state, sq)
    const label = owner !== null ? `${name}, ${MARK[owner]}` : open ? `${name}, you can play here` : `${name}, empty`
    return (
      <button
        key={sq}
        data-square={sq}
        className={`tt-cell${open ? ' is-open' : ''}${cursor === sq ? ' is-cursor' : ''}${ultimate && state.last === sq ? ' is-last' : ''}`}
        tabIndex={sq === tabStop ? 0 : -1}
        aria-label={label}
        aria-disabled={!yourTurn || !open}
        onFocus={() => onFocusSquare(sq)}
        onClick={() => onPlay(sq)}
      >
        {owner !== null && <Mark key={`${sq}-${owner}`} player={owner} seed={seed(sq)} draw={fresh(sq) ? 0 : null} />}
        {owner === null && open && <Mark player={state.current} seed={seed(sq)} className="tt-ghost" />}
      </button>
    )
  }

  return (
    <div
      ref={ref}
      className={`tt-board tt-board--${state.variant}${yourTurn ? '' : ' is-waiting'}`}
      role="group"
      aria-label="Tic-Tac-Toe board"
      data-to-play={state.current}
      style={{ '--mark-ms': `${MARK_MS}ms`, '--big-ms': `${BIG_MARK_MS}ms`, '--strike-ms': `${STRIKE_MS}ms` } as CSSProperties}
    >
      <WaxFilter />
      <GridLines seed={gameId * 7} className="tt-lines tt-lines--big" draw={state.turn === 0} />
      {ultimate ? (
        <div className="tt-grids">
          {Array.from({ length: 9 }, (_, g) => {
            const owner = state.grids[g]
            const status = owner === null ? (playable.has(g) ? (keyedGrid === g || state.forced === g ? 'forced' : 'open') : 'idle') : owner === 'draw' ? 'full' : 'won'
            return (
              <div key={g} className="tt-grid" data-status={status} data-free={state.forced === null && !state.over ? '' : undefined} role="group" aria-label={`${cap(gridName(g))}${owner === null ? '' : owner === 'draw' ? ', full' : `, won by ${MARK[owner]}`}`}>
                <GridLines seed={gameId * 7 + g + 1} className="tt-lines tt-lines--small" draw={state.turn === 0} />
                <div className="tt-cells">{Array.from({ length: 9 }, (_, c) => cell(g * 9 + c))}</div>
                {owner !== null && owner !== 'draw' && (
                  <Mark key={`big-${g}`} player={owner} seed={seed(100 + g)} draw={lastMove?.grid === g ? bigAt : null} className="tt-mark--big" />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="tt-cells tt-cells--classic">{Array.from({ length: 9 }, (_, sq) => cell(sq))}</div>
      )}
      {state.line && state.winner !== null && <Strike key={`strike-${state.turn}`} line={state.line} player={state.winner} seed={gameId} at={lastMove?.line ? strikeAt : 0} />}
    </div>
  )
}

// ---- The terminal ----------------------------------------------------------------------

/** "You 2 · Bev Kowalski 1 · 1 drawn" for the sitting so far. */
function seriesText(config: MatchConfig, series: Series | null): string {
  if (!series) return ''
  const name = (i: 0 | 1) => (config.mode !== 'hotseat' && i === 0 ? 'You' : series.people[i])
  return `${name(0)} ${series.wins[0]} · ${name(1)} ${series.wins[1]}${series.draws ? ` · ${series.draws} drawn` : ''}`
}

interface HudProps {
  config: MatchConfig
  state: GameState
  status: string
  help: string
  log: { id: number; mine: boolean; text: string }[]
  series: Series | null
  compact: boolean
  onShowResult: () => void
}

function Hud({ config, state, status, help, log, series, compact, onShowResult }: HudProps) {
  const { resign, leave, again } = useMatch.getState()
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
  const online = config.mode === 'online'
  const midGame = !state.over && config.mode !== 'hotseat'
  const game = state.variant === 'classic' ? 'Tic-Tac-Toe' : 'Ultimate'
  const getUp = () => {
    if (online) {
      if (midGame) currentLink()?.submit({ resign: true } satisfies Input)
      void navigate('/tictactoe', { during: leaveOnline })
    } else void navigate('/tictactoe', { during: midGame ? resign : leave })
  }
  const playAgain = () => (online ? currentLink()?.submit({ again: true } satisfies Input) : again())

  const moveLog = (
    <ol className="tt-hud__log" ref={logRef} aria-label="Move log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="tt-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
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
    <aside className="tt-hud screen" aria-label="Game status">
      <div className="tt-hud__head">
        <p className="tt-hud__label term-dim">
          {config.mode === 'ai' ? `${game} against ${opponent?.name}` : online ? `${game} online with ${config.names[other(config.you)]}` : `${game}, hot-seat`}
        </p>
        <p className="tt-hud__score">{seriesText(config, series)}</p>
      </div>
      <p className="tt-hud__status" aria-live="polite">
        {status}
      </p>
      <p className="tt-hud__help">{help}</p>
      {(state.over || compact) && (
        <div className="tt-hud__actions">
          {state.over && (
            <>
              <button className="term-button term-button--primary" onClick={playAgain}>
                Play again
              </button>
              <button className="term-button" onClick={onShowResult}>
                Result
              </button>
            </>
          )}
          {compact && (
            <button className="term-button tt-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
          )}
        </div>
      )}
      {!compact && moveLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="tt-overlay" role="dialog" aria-modal="true" aria-label="Table menu" onClick={closeMenu}>
          <div className="tt-menu screen" onClick={(e) => e.stopPropagation()}>
            {moveLog}
            {tableControls}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="tt-overlay" role="dialog" aria-modal="true" aria-label="Tic-Tac-Toe rules" onClick={() => setShowRules(false)}>
          <div className="tt-card tt-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="tt-button tt-button--primary" autoFocus onClick={() => setShowRules(false)}>
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
  const { config, state, result, series, again, leave } = useMatch()
  if (!config || !result) return null
  const opponent = opponentById(config.opponentId ?? '')
  const hotseat = config.mode === 'hotseat'
  const online = config.mode === 'online'
  const won = !hotseat && result.winner === config.you
  let title: string
  if (result.winner === null) title = config.variant === 'classic' ? 'Cat’s game' : 'A draw'
  else if (hotseat) title = `${config.names[result.winner]} wins`
  else title = won ? 'You win' : `${opponent?.name ?? config.names[result.winner]} wins`
  const resigned = result.resigned === undefined ? null : result.resigned === config.you && !hotseat ? 'You resigned.' : `${config.names[result.resigned]} resigned.`
  const quote = !hotseat && opponent ? (result.winner === null ? opponent.lines.draw : won ? opponent.lines.lose : opponent.lines.win) : null

  return (
    <div className="tt-overlay" role="dialog" aria-modal="true" aria-labelledby="tt-gameover-title">
      <div className="tt-card tt-gameover">
        <div className="tt-gameover__marks" aria-hidden="true">
          {result.winner === null ? (
            <>
              <MarkIcon player={0} />
              <MarkIcon player={1} />
            </>
          ) : (
            <MarkIcon player={result.winner} />
          )}
        </div>
        <h2 id="tt-gameover-title">{title}</h2>
        <p className="tt-gameover__line">{resigned ?? (result.winner === null ? (config.variant === 'classic' ? 'Nobody got three in a row.' : 'Every grid is settled, and nobody has three in a row.') : `${cap(lineText(config.variant, state?.line ?? null))}.`)}</p>
        {series && <p className="tt-gameover__series">{seriesText(config, series)}</p>}
        {quote && (
          <blockquote>
            <p>“{quote}”</p>
            <footer>{opponent?.name}</footer>
          </blockquote>
        )}
        {result.unlocked && <p className="tt-gameover__unlock">{result.unlocked} is next on the ladder, and has a stool saved for you.</p>}
        <div className="tt-gameover__actions">
          <button className="tt-button tt-button--primary" onClick={() => (online ? currentLink()?.submit({ again: true } satisfies Input) : again())} autoFocus>
            Play again
          </button>
          <button className="tt-button" onClick={onLook}>
            Look at the board
          </button>
          <button className="tt-button" onClick={() => void navigate('/tictactoe', { during: online ? leaveOnline : leave })}>
            Back to the lobby
          </button>
        </div>
      </div>
    </div>
  )
}

/** The online table, read outside of rendering. */
function currentLink() {
  const link = useLink.getState().link
  return link?.game === GAME ? link : null
}

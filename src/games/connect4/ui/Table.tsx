import { type CSSProperties, type Ref, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, randomSeed } from '../../../core/rng'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { chooseMove } from '../ai'
import { opponentById } from '../content'
import {
  CHECKERS,
  COLOR_NAME,
  COLS,
  type GameState,
  type Player,
  ROWS,
  colOf,
  columnName,
  describeLine,
  isLegal,
  other,
  rowOf,
  squareOf,
  winningSquares,
} from '../engine'
import { CheckerIcon } from './CheckerIcon'
import {
  BOUNCE_MS,
  HOVER_ROWS,
  type LastMove,
  type MatchConfig,
  RELEASE_MS,
  type Release,
  type Remark,
  endLine,
  fallRows,
  fallTime,
  settleTime,
  useMatch,
} from './match'
import { type Input, GAME, leaveOnline } from './online'
import { RulesText } from './Rules'
import { Awning, Backdrop } from './Scenery'
import { LinkBanner } from '../../../net/ui/LinkBanner'
import { useGameLink, useLink } from '../../../net/store'

/**
 * Phones and small windows get the compact table in connect4.css, whose
 * media queries match this one: the HUD keeps its move log and table
 * controls behind a Menu button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 520px)'

/** The AI's pause before its first move, while you settle in. */
const FIRST_MOVE_DELAY_MS = 1300
/** And after the last checker lands, so it looks like it's thinking. */
const THINK_MS = 380
/** How long a game-over card waits for the lights to come up on the winning four. */
const GAME_OVER_DELAY_MS = 1100

export function Table() {
  const { gameId, config, state, lastMove, release } = useMatch()
  const play = useMatch((s) => s.play)

  // No game? Back to the lobby.
  useEffect(() => {
    if (!config || !state) navigate('/connect4')
  }, [config, state])

  const link = useGameLink(GAME)
  const banner = config?.mode === 'online' && <LinkBanner link={link} waitsForOthers onGone={() => void navigate('/connect4', { during: leaveOnline })} />

  // The AI drops once the last checker has landed, or the rack has emptied for a new game.
  const aiRng = useRef(createRng(randomSeed()))
  useEffect(() => {
    if (!config || !state || config.mode !== 'ai' || state.over || state.current === config.you) return
    const profile = opponentById(config.opponentId ?? '')?.profile
    if (!profile) return
    const delay = lastMove ? settleTime(lastMove) + THINK_MS : FIRST_MOVE_DELAY_MS + (release ? RELEASE_MS : 0)
    const t = window.setTimeout(() => play(chooseMove(state, profile, aiRng.current)), delay)
    return () => window.clearTimeout(t)
  }, [config, state, lastMove, release, play])

  if (!config || !state) return null
  return (
    <>
      <TableView key={gameId} config={config} state={state} />
      {banner}
    </>
  )
}

// ---------------------------------------------------------------------------------

function TableView({ config, state }: { config: MatchConfig; state: GameState }) {
  const { lastMove, remark, log, result, release } = useMatch()
  const play = useMatch((s) => s.play)
  const threatsOn = useSave((s) => s.connect4.threats)
  const hotseat = config.mode === 'hotseat'
  const online = config.mode === 'online'
  const link = useGameLink(GAME)
  const compact = useMediaQuery(COMPACT_TABLE)

  // The last game's checkers are still falling out of the rack.
  const [releasing, setReleasing] = useState(release !== null)
  useEffect(() => {
    if (!releasing) return
    const t = window.setTimeout(() => setReleasing(false), RELEASE_MS)
    return () => window.clearTimeout(t)
  }, [releasing])

  // Online, a drop counts once the table has it; one at a time.
  const [sent, setSent] = useState<number | null>(null)
  const waiting = online && sent === state.turn
  const yourTurn = !state.over && !waiting && !releasing && (hotseat || state.current === config.you)

  // Against the AI, you're at the bottom. At hot-seat, Red is.
  const bottom: Player = hotseat ? 0 : config.you
  const top = other(bottom)
  const opponent = opponentById(config.opponentId ?? '')

  // The column the waiting checker hangs over: where you point, or where the keys put it.
  const [cursor, setCursor] = useState(3)
  const [cursorShown, setCursorShown] = useState(false)
  const [refused, setRefused] = useState<number | null>(null)
  const rackRef = useRef<HTMLDivElement>(null)

  const tryDrop = (col: number) => {
    if (!yourTurn) return
    setCursor(col)
    if (!isLegal(state, col)) {
      playSfx('error')
      setRefused(col)
      return
    }
    setRefused(null)
    if (online) {
      if (!link || link.status !== 'open') {
        playSfx('error')
        return
      }
      setSent(state.turn)
      link.submit({ col } satisfies Input)
    } else play(col)
  }

  // The game-over card waits for the winning four to light up, and can be put away to look at the rack.
  const [overShown, setOverShown] = useState(false)
  const [overDismissed, setOverDismissed] = useState(false)
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => setOverShown(true), settleTime(lastMove) + (result.line ? GAME_OVER_DELAY_MS : 500))
    return () => window.clearTimeout(t)
  }, [result, lastMove])

  // Keyboard: arrows move the checker along the top, Enter, Space or Down drops it, 1–7 drop straight into a column.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role="dialog"]')) return
      const key = e.key.toLowerCase()
      if (key === 'arrowleft' || key === 'arrowright') {
        const next = Math.min(COLS - 1, Math.max(0, cursor + (key === 'arrowleft' ? -1 : 1)))
        setCursor(next)
        setCursorShown(true)
        setRefused(null)
        if (rackRef.current?.contains(target)) rackRef.current.querySelector<HTMLElement>(`[data-col="${next}"]`)?.focus()
      } else if ((key === 'enter' || key === ' ' || key === 'arrowdown') && !target.closest('button:not([data-col]), a')) {
        setCursorShown(true)
        tryDrop(cursor)
      } else if (key === 'escape') {
        setCursorShown(false)
      } else if (/^[1-7]$/.test(key)) {
        setCursorShown(true)
        tryDrop(Number(key) - 1)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const left = useMemo(() => {
    const dropped: [number, number] = [0, 0]
    for (const owner of state.board) if (owner !== null) dropped[owner]++
    return [CHECKERS - dropped[0], CHECKERS - dropped[1]] as [number, number]
  }, [state.board])
  const who = (p: Player) => (hotseat ? config.names[p] : p === config.you ? 'You' : (opponent?.name ?? config.names[p] ?? COLOR_NAME[p]))

  let status: string
  if (state.over) status = 'Game over'
  else if (hotseat) status = `${config.names[state.current]} to play`
  else if (state.current === config.you) status = 'Your turn'
  else if (online) status = `${config.names[state.current]} to play`
  else status = `${opponent?.name ?? 'Your opponent'} is thinking…`

  let help = ''
  if (result?.resigned !== undefined) help = `${who(result.resigned)} ${result.resigned === config.you && !hotseat ? 'resign' : 'resigns'}.`
  else if (result) help = endLine(config, result.winner, result.line)
  else if (yourTurn && refused !== null) help = `${columnName(refused).replace('c', 'C')} is full. Pick another.`
  else if (yourTurn) {
    const color = COLOR_NAME[state.current].toLowerCase()
    const how = compact ? 'Tap a column to drop a checker.' : 'Click a column, or use the arrow keys and Enter, or 1 to 7.'
    const rings = threatsOn ? ' Rings mark the holes that would make four.' : ''
    help = hotseat ? `${COLOR_NAME[state.current]} to drop. ${how}${rings}` : `You play ${color}. ${how}${rings}`
  }

  return (
    <div className={`c4-game${result?.line ? ' is-won' : ''}`}>
      {/* Upright on a phone, the awning and the sky above the booth. */}
      {compact && (
        <div className="c4-wall" aria-hidden="true">
          <Backdrop className="c4-wall__view" />
        </div>
      )}
      <Awning className="c4-game__awning" lit={!!result?.line} />
      <PlayerBar
        place="top"
        name={who(top)}
        player={top}
        left={left[top]}
        active={!state.over && state.current === top}
        thinking={config.mode === 'ai' && !state.over && state.current === top && !releasing}
        portrait={!hotseat && opponent ? { initials: opponent.initials, color: opponent.color } : null}
        remark={hotseat ? null : remark}
      />

      <div className="c4-stage">
        {!compact && <Backdrop className="c4-stage__view" />}
        <Rack
          ref={rackRef}
          state={state}
          lastMove={lastMove}
          release={releasing ? release : null}
          yourTurn={yourTurn}
          toPlay={state.current}
          cursor={cursor}
          cursorShown={cursorShown}
          threats={threatsOn && !state.over}
          onPoint={(col) => setCursor(col)}
          onDrop={(col) => {
            setCursorShown(false)
            tryDrop(col)
          }}
        />
      </div>

      <PlayerBar
        place="bottom"
        name={who(bottom)}
        player={bottom}
        left={left[bottom]}
        active={!state.over && state.current === bottom}
        thinking={false}
        portrait={null}
        remark={null}
      />

      <Hud config={config} state={state} left={left} status={status} help={help} log={log} compact={compact} onShowResult={() => setOverDismissed(false)} />

      {result && overShown && !overDismissed && <GameOver onLook={() => setOverDismissed(true)} />}
    </div>
  )
}

// ---- The players ------------------------------------------------------------------

interface BarProps {
  place: 'top' | 'bottom'
  name: string
  player: Player
  /** Checkers still to drop. */
  left: number
  active: boolean
  thinking: boolean
  portrait: { initials: string; color: string } | null
  remark: Remark | null
}

function PlayerBar({ place, name, player, left, active, thinking, portrait, remark }: BarProps) {
  return (
    <div className={`c4-bar c4-bar--${place}${active ? ' is-active' : ''}`}>
      <div className="c4-bar__who">
        {portrait && (
          <span className="c4-portrait" style={{ background: portrait.color }} aria-hidden="true">
            {portrait.initials}
          </span>
        )}
        <span className="c4-bar__name">{name}</span>
        {thinking && (
          <span className="c4-bar__thinking" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        {portrait && <SpeechBubble name={name} remark={remark} />}
      </div>
      <div className="c4-bar__count" aria-label={`${COLOR_NAME[player]}: ${left} ${left === 1 ? 'checker' : 'checkers'} left`}>
        <CheckerIcon player={player} />
        <span className="c4-bar__number">{left}</span>
      </div>
    </div>
  )
}

/** Long enough to read the line twice at a relaxed pace. */
const readingTime = (text: string) => Math.min(6000, Math.max(2600, 1600 + text.length * 55))

/** The opponent's latest remark, shown once the checker lands and faded after a while. */
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
    <div className="c4-talk" aria-live="polite">
      {visible && (
        <p key={remark.id} className="c4-talk__bubble" style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          <span className="visually-hidden">{name} says: </span>
          {remark.text}
        </p>
      )}
    </div>
  )
}

// ---- The rack -------------------------------------------------------------------------

/** The plastic frame around the holes, in pitches (the distance from one hole to the next). */
const PAD = 0.32
/** The face, in hundredths of a pitch, for drawing it. */
const FACE_W = Math.round((COLS + PAD * 2) * 100)
const FACE_H = Math.round((ROWS + PAD * 2) * 100)
const HOLE_R = 40
const holeX = (col: number) => PAD * 100 + 50 + col * 100
const holeY = (row: number) => PAD * 100 + 50 + (ROWS - 1 - row) * 100

/** Where a checker sits on the rack, in pitches from its bottom left. */
const at = (col: number, row: number): CSSProperties => ({ '--c': col, '--r': row }) as CSSProperties

interface RackProps {
  state: GameState
  lastMove: LastMove | null
  release: Release | null
  yourTurn: boolean
  toPlay: Player
  cursor: number
  cursorShown: boolean
  threats: boolean
  onPoint: (col: number) => void
  onDrop: (col: number) => void
  ref: Ref<HTMLDivElement>
}

/** How many checkers are in a column, for a column's name. */
function columnLabel(state: GameState, col: number): string {
  const inIt = Array.from({ length: state.heights[col] }, (_, row) => COLOR_NAME[state.board[squareOf(col, row)]!].toLowerCase())
  const room = ROWS - state.heights[col]
  const contents = inIt.length ? `${inIt.join(', ')} from the bottom` : 'empty'
  return `${columnName(col).replace('c', 'C')}, ${contents}, ${room ? `room for ${room}` : 'full'}`
}

function Rack({ state, lastMove, release, yourTurn, toPlay, cursor, cursorShown, threats, onPoint, onDrop, ref }: RackProps) {
  const win = new Set(state.line ?? [])
  const marks = useMemo(
    () => (threats ? ([0, 1] as Player[]).flatMap((p) => winningSquares(state, p).map((sq) => ({ sq, p }))) : []),
    [threats, state],
  )

  return (
    <div
      className={`c4-figure${yourTurn ? '' : ' is-waiting'}`}
      style={{ '--pad': PAD, '--hover-rows': HOVER_ROWS, '--bounce-ms': `${BOUNCE_MS}ms`, '--release-ms': `${RELEASE_MS}ms` } as CSSProperties}
    >
      <div className="c4-counter" aria-hidden="true" />
      <div className="c4-rack" ref={ref} role="group" aria-label="Connect Four rack">
        <RackStand />
        <div className="c4-rack__back" aria-hidden="true">
          <RackFace back />
        </div>
        <div className="c4-slots" aria-hidden="true">
          {state.board.map((owner, sq) =>
            owner === null ? null : (
              <Checker
                key={sq}
                col={colOf(sq)}
                row={rowOf(sq)}
                color={owner}
                drop={lastMove !== null && lastMove.col === colOf(sq) && lastMove.row === rowOf(sq)}
                last={state.last === sq && !state.over}
                win={win.has(sq)}
              />
            ),
          )}
          {release?.board.map((owner, sq) =>
            owner === null ? null : <Checker key={`out-${release.id}-${sq}`} col={colOf(sq)} row={rowOf(sq)} color={owner} release />,
          )}
          {marks.map(({ sq, p }) => (
            <span key={`${p}-${sq}`} className="c4-threat" data-c={p} style={at(colOf(sq), rowOf(sq))} />
          ))}
        </div>
        <div className="c4-rack__face" aria-hidden="true">
          <RackFace />
        </div>
        {[...win].map((sq) => (
          <span key={sq} className="c4-ring" style={{ ...at(colOf(sq), rowOf(sq)), '--k': [...win].indexOf(sq) } as CSSProperties} aria-hidden="true" />
        ))}
        <div className={`c4-slider${release ? ' is-pulled' : ''}`} aria-hidden="true">
          <span className="c4-slider__tab" />
        </div>
        {yourTurn && <span className="c4-hover" data-c={toPlay} style={{ '--c': cursor } as CSSProperties} aria-hidden="true" />}
        <div className="c4-columns">
          {Array.from({ length: COLS }, (_, col) => {
            const open = state.heights[col] < ROWS
            return (
              <button
                key={col}
                data-col={col}
                className={`c4-column${open ? ' is-open' : ''}${yourTurn && cursorShown && cursor === col ? ' is-cursor' : ''}`}
                style={{ '--c': col } as CSSProperties}
                tabIndex={col === cursor ? 0 : -1}
                aria-label={columnLabel(state, col)}
                aria-disabled={!yourTurn || !open}
                onPointerEnter={(e) => e.pointerType === 'mouse' && onPoint(col)}
                onFocus={() => onPoint(col)}
                onClick={() => onDrop(col)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface CheckerProps {
  col: number
  row: number
  color: Player
  /** Just dropped: it falls from over the rack and bounces. */
  drop?: boolean
  last?: boolean
  win?: boolean
  /** The last game's, falling out of the bottom as the slider's pulled. */
  release?: boolean
}

function Checker({ col, row, color, drop = false, last = false, win = false, release = false }: CheckerProps) {
  const style = {
    ...at(col, row),
    ...(drop && { '--fall': fallRows(row), '--fall-ms': `${fallTime(row)}ms` }),
    // Out of the bottom: the bottom row goes first, and the columns follow each other along the slider.
    ...(release && { '--delay': `${110 + col * 45 + row * 30}ms`, '--drop-to': row + 2.6 }),
  } as CSSProperties
  return (
    <span className={`c4-checker${win ? ' is-win' : ''}`} data-c={color} data-anim={release ? 'release' : drop ? 'drop' : undefined} style={style}>
      {last && <span className="c4-last" />}
    </span>
  )
}

/** The front of the rack: blue plastic with a hole for every checker. The back, in the 3D view, is the same seen from behind. */
function RackFace({ back = false }: { back?: boolean }) {
  const id = back ? 'c4-back' : 'c4-face'
  return (
    <svg viewBox={`0 0 ${FACE_W} ${FACE_H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor={back ? '#2a63bd' : '#4a8ef0'} />
          <stop offset="0.5" stopColor={back ? '#1b4c9c' : '#2468d4'} />
          <stop offset="1" stopColor={back ? '#123570' : '#1a4fa8'} />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.18" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-holes`} maskUnits="userSpaceOnUse" x="0" y="0" width={FACE_W} height={FACE_H}>
          <rect width={FACE_W} height={FACE_H} rx="26" fill="white" />
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <circle key={i} cx={holeX(i % COLS)} cy={holeY(Math.floor(i / COLS))} r={HOLE_R} fill="black" />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${id}-holes)`}>
        <rect width={FACE_W} height={FACE_H} rx="26" fill={`url(#${id}-blue)`} />
        <rect width={FACE_W} height={FACE_H} rx="26" fill={`url(#${id}-sheen)`} />
        {/* Each hole's molded rim: lit from above, shadowed below. */}
        {Array.from({ length: COLS * ROWS }, (_, i) => {
          const cx = holeX(i % COLS)
          const cy = holeY(Math.floor(i / COLS))
          return (
            <g key={i}>
              <circle cx={cx} cy={cy + 2.5} r={HOLE_R + 3} fill="none" stroke="#0c2a5e" strokeOpacity="0.55" strokeWidth="5" />
              <circle cx={cx} cy={cy - 2} r={HOLE_R + 4} fill="none" stroke="#9cc4ff" strokeOpacity="0.4" strokeWidth="2.5" />
            </g>
          )
        })}
        <rect x="3" y="3" width={FACE_W - 6} height={FACE_H - 6} rx="24" fill="none" stroke="#0d2c63" strokeWidth="6" />
        <rect x="9" y="9" width={FACE_W - 18} height={FACE_H - 18} rx="19" fill="none" stroke="#8fbaff" strokeOpacity="0.35" strokeWidth="2" />
      </g>
    </svg>
  )
}

/** The legs the rack stands on, splayed out onto the counter. */
function RackStand() {
  const w = FACE_W + 80
  return (
    <svg className="c4-stand" viewBox={`0 0 ${w} 170`} aria-hidden="true">
      <defs>
        <linearGradient id="c4-leg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#123a80" />
          <stop offset="0.5" stopColor="#2d6fd6" />
          <stop offset="1" stopColor="#123a80" />
        </linearGradient>
      </defs>
      {[0, 1].map((side) => {
        const x = side === 0 ? 40 : w - 40
        const out = side === 0 ? -1 : 1
        return (
          <g key={side}>
            <path d={`M${x - 16} 0 H${x + 16} L${x + 16 + out * 6} 140 H${x - 16 + out * 6}Z`} fill="url(#c4-leg)" stroke="#0b2552" strokeWidth="3" />
            <path d={`M${x - 46} 170 Q${x - 40} 132 ${x} 132 Q${x + 40} 132 ${x + 46} 170Z`} fill="#1f5fc8" stroke="#0b2552" strokeWidth="3" />
          </g>
        )
      })}
    </svg>
  )
}

// ---- The terminal ----------------------------------------------------------------------

interface HudProps {
  config: MatchConfig
  state: GameState
  left: [number, number]
  status: string
  help: string
  log: { id: number; mine: boolean; text: string }[]
  compact: boolean
  onShowResult: () => void
}

function Hud({ config, state, left, status, help, log, compact, onShowResult }: HudProps) {
  const { resign, leave, start } = useMatch.getState()
  const threats = useSave((s) => s.connect4.threats)
  const updateConnect4 = useSave((s) => s.updateConnect4)
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
  const getUp = () => {
    if (online) {
      if (midGame) currentLink()?.submit({ resign: true } satisfies Input)
      void navigate('/connect4', { during: leaveOnline })
    } else void navigate('/connect4', { during: midGame ? resign : leave })
  }
  const again = () => (online ? currentLink()?.submit({ again: true } satisfies Input) : start(config))

  const moveLog = (
    <ol className="c4-hud__log" ref={logRef} aria-label="Move log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="c4-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
      </button>
      <button className="term-button" aria-pressed={threats} onClick={() => updateConnect4({ threats: !threats })}>
        <span aria-hidden="true">{threats ? '[x]' : '[ ]'}</span> Threats
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
    <aside className="c4-hud screen" aria-label="Game status">
      <div className="c4-hud__head">
        <p className="c4-hud__label term-dim">
          {config.mode === 'ai' ? `Connect Four against ${opponent?.name}` : online ? `Connect Four online with ${config.names[other(config.you)]}` : 'Connect Four, hot-seat'}
        </p>
        <p className="c4-hud__score" aria-label={`Checkers left: Red ${left[0]}, Yellow ${left[1]}`}>
          R {left[0]} · Y {left[1]}
        </p>
      </div>
      <p className="c4-hud__status" aria-live="polite">
        {status}
      </p>
      <p className="c4-hud__help">{help}</p>
      {(state.over || compact) && (
        <div className="c4-hud__actions">
          {state.over && (
            <>
              <button className="term-button term-button--primary" onClick={again}>
                Play again
              </button>
              <button className="term-button" onClick={onShowResult}>
                Result
              </button>
            </>
          )}
          {compact && (
            <button className="term-button c4-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
          )}
        </div>
      )}
      {!compact && moveLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="c4-overlay" role="dialog" aria-modal="true" aria-label="Table menu" onClick={closeMenu}>
          <div className="c4-menu screen" onClick={(e) => e.stopPropagation()}>
            {moveLog}
            {tableControls}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="c4-overlay" role="dialog" aria-modal="true" aria-label="Connect Four rules" onClick={() => setShowRules(false)}>
          <div className="c4-card c4-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="c4-button c4-button--primary" autoFocus onClick={() => setShowRules(false)}>
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
  const online = config.mode === 'online'
  const won = !hotseat && result.winner === config.you
  let title: string
  if (result.winner === null) title = 'A draw'
  else if (hotseat) title = `${config.names[result.winner]} wins`
  else title = won ? 'You win' : `${opponent?.name ?? config.names[result.winner]} wins`
  const resigned = result.resigned === undefined ? null : result.resigned === config.you ? 'You resigned.' : `${config.names[result.resigned]} resigned.`
  const quote = !hotseat && opponent ? (result.winner === null ? opponent.lines.draw : won ? opponent.lines.lose : opponent.lines.win) : null
  const how = result.line ? `Four ${describeLine(result.line)}.` : result.resigned === undefined ? 'The rack is full, and nobody made four.' : null

  return (
    <div className="c4-overlay" role="dialog" aria-modal="true" aria-labelledby="c4-gameover-title">
      <div className="c4-card c4-gameover">
        {result.winner !== null && (
          <span className="c4-gameover__checker" aria-hidden="true">
            <CheckerIcon player={result.winner} />
          </span>
        )}
        <h2 id="c4-gameover-title">{title}</h2>
        {how && <p className="c4-gameover__how">{how}</p>}
        {resigned && <p>{resigned}</p>}
        {quote && (
          <blockquote>
            <p>“{quote}”</p>
            <footer>{opponent?.name}</footer>
          </blockquote>
        )}
        {result.unlocked && <p className="c4-gameover__unlock">{result.unlocked} is next on the ladder, and the rack’s set up.</p>}
        <div className="c4-gameover__actions">
          <button
            className="c4-button c4-button--primary"
            onClick={() => (online ? currentLink()?.submit({ again: true } satisfies Input) : start(config))}
            autoFocus
          >
            Play again
          </button>
          <button className="c4-button" onClick={onLook}>
            Look at the rack
          </button>
          <button className="c4-button" onClick={() => void navigate('/connect4', { during: online ? leaveOnline : leave })}>
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

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { navigate } from '../../../navigation'
import { useGameLink } from '../../../net/store'
import { LinkBanner } from '../../../net/ui/LinkBanner'
import { useSave } from '../../../store/save'
import { Chip } from '../../blackjack/ui/Chip'
import { aboutSpot, edgeOf, formatEdge, paysText, spotName, wheelById } from '../content'
import { type Pocket, type Spot, type TableState, type WheelKind, betOn, colorOf, onLayout, pocketName, spotInfo } from '../engine'
import { Felt, type Hand } from './Felt'
import { geometry, insideBetsOn } from './layout'
import { GAME, checksumAfter, leaveOnline } from './online'
import { RulesText } from './Rules'
import { type Remark, SEAT_COLORS, type SeatRemark, pocketCall, useSession } from './session'
import { Wheel } from './Wheel'

/**
 * Phones and small windows get the compact table in roulette.css, whose
 * media queries match this one: the HUD keeps its log and table controls
 * behind a Menu button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 520px)'

/** Held upright, a phone gets the tall layout beside the wheel (layout.ts). Keep in step with roulette.css. */
const TALL_TABLE = '(max-width: 900px) and (orientation: portrait)'

/** A mouse can hit the lines between numbers. A finger gets the chooser instead. */
const PRECISE = '(hover: hover) and (pointer: fine)'

export function Table() {
  const { sitting, state, stakes, online, spin } = useSession()
  const link = useGameLink(GAME)

  // No seat? Back to the lobby.
  useEffect(() => {
    if (!state || !stakes) navigate('/roulette')
  }, [state, stakes])

  // Online: play everyone's bets and spins as they come, once the ball is at rest.
  const waiting = online?.queue.length ?? 0
  useEffect(() => {
    if (online) useSession.getState().pump(checksumAfter(link))
  }, [state, spin, waiting, online, link])

  if (!state || !stakes) return null
  return (
    <>
      <TableView key={sitting} />
      {online && <LinkBanner link={link} waitsForOthers={false} onGone={() => void navigate('/roulette', { during: leaveOnline })} />}
    </>
  )
}

function TableView() {
  const { state, stakes, call, settled, spin, chip, takingDown, seats, talk, online, focus } = useSession()
  const caps = useSave((s) => s.wallet.caps)
  const guide = useSave((s) => s.roulette.guide)
  const { spinWheel, pickChip, setTakingDown, clear, rebet, bet, takeDown, setFocus } = useSession.getState()
  const s = state!
  const rolling = !!spin && !spin.landed
  const tall = useMediaQuery(TALL_TABLE)
  const precise = useMediaQuery(PRECISE)
  const geo = geometry(s.wheel, tall ? 'tall' : 'wide')
  const [choosing, setChoosing] = useState<Pocket | null>(null)

  // Keyboard: 1–4 pick a chip, T takes bets down, S or Space spins, Backspace clears, B rebets.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role="dialog"]')) return
      const key = e.key.toLowerCase()
      const chips = stakes!.chips
      if (key === 's' || (key === ' ' && !target.closest('button'))) spinWheel()
      else if (Number(key) >= 1 && Number(key) <= chips.length) pickChip(chips[Number(key) - 1])
      else if (key === 't') setTakingDown(!useSession.getState().takingDown)
      else if (key === 'backspace') clear()
      else if (key === 'b') rebet()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const me = online?.me ?? 0
  const mine: Hand = { key: 'you', color: SEAT_COLORS[me], bets: s.bets }
  const others: Hand[] = online
    ? online.players.flatMap((p, seat) => (p ? [{ key: `p${seat}`, color: SEAT_COLORS[seat], bets: p.state.bets }] : []))
    : seats.flatMap((seat) => (seat ? [{ key: seat.regular.id, color: seat.regular.color, bets: seat.state.bets }] : []))
  const lit = useMemo(() => new Set(focus ? (spotInfo(s.wheel, focus)?.numbers ?? []) : []), [focus, s.wheel])
  const advised = useMemo(() => new Set(guide && s.wheel === 'french' && !takingDown ? ['red', 'black', 'odd', 'even', 'low', 'high'] : []), [guide, s.wheel, takingDown])
  const place = (spot: Spot) => (takingDown ? takeDown(spot) : bet(spot))

  return (
    <div className={`rl-game${takingDown ? ' is-taking-down' : ''}`} data-wheel={s.wheel}>
      <div className="rl-board">
        <CroupierBar name={stakes!.croupier.name} call={call} table={stakes!.name} wheel={s.wheel} limits={stakes!.limits} />

        <div className="rl-stage">
          <div className="rl-plane" data-orientation={geo.orientation} style={{ '--fw': geo.w, '--fh': geo.h } as CSSProperties}>
            <div className="rl-wheel-spot">
              <Wheel wheel={s.wheel} spin={spin} />
            </div>
            <div className="rl-side">
              <NumbersBoard history={s.history} rolling={rolling} />
              <Seats talk={talk} caps={caps} />
            </div>
            <div className="rl-felt-spot">
              <Felt
                wheel={s.wheel}
                geo={geo}
                mine={mine}
                others={others}
                settled={settled}
                dolly={spin?.landed ? spin.pocket : null}
                rolling={rolling}
                takingDown={takingDown}
                precise={precise}
                lit={lit}
                advised={advised}
                onBet={place}
                onFocus={setFocus}
                onChoose={(pocket) => {
                  if (rolling) return
                  setChoosing(pocket)
                }}
              />
            </div>
          </div>
        </div>

        <Controls state={s} chips={stakes!.chips} chip={chip} takingDown={takingDown} rolling={rolling} caps={caps} />
      </div>

      <Hud />

      {choosing !== null && (
        <Chooser
          pocket={choosing}
          state={s}
          takingDown={takingDown}
          onPick={(spot) => {
            place(spot)
            setChoosing(null)
          }}
          onFocus={setFocus}
          onClose={() => {
            setChoosing(null)
            setFocus(null)
          }}
        />
      )}
    </div>
  )
}

// ---- The croupier -----------------------------------------------------------------

function CroupierBar({ name, call, table, wheel, limits }: { name: string; call: Remark | null; table: string; wheel: WheelKind; limits: TableState['limits'] }) {
  return (
    <div className="rl-croupier-bar">
      <div className="rl-croupier-bar__who">
        <span className="rl-portrait" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            {/* The croupier's rake: a long handle and a flat blade. */}
            <path d="M8 34 L27 11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M21 6 L34 17" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="rl-croupier-bar__name">{name}</span>
        <SpeechBubble name={name} remark={call} className="rl-talk--croupier" />
      </div>
      <div className="rl-placard" aria-label={`${table}, ${wheelById(wheel).name} wheel: inside bets from ${limits.insideMin}, outside from ${limits.outsideMin}`}>
        <span className="rl-placard__table">
          {table} · {wheelById(wheel).name}
        </span>
        <span className="rl-placard__limits">
          {limits.insideMin}–{limits.straightMax.toLocaleString()} <span className="rl-placard__sep">|</span> {limits.outsideMin}–{limits.outsideMax.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

/** Long enough to read the line twice at a relaxed pace. */
const readingTime = (text: string) => Math.min(6000, Math.max(2400, 1500 + text.length * 55))

/** The latest remark, shown after its delay and faded after a while. A newer one replaces it. */
function SpeechBubble({ name, remark, className }: { name: string; remark: Remark | null; className: string }) {
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
    <div className={`rl-talk ${className}`} aria-live="polite">
      {visible && (
        <p key={remark.id} className="rl-talk__bubble" style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          <span className="visually-hidden">{name} says: </span>
          {remark.text}
        </p>
      )}
    </div>
  )
}

// ---- The board of numbers, and the seats --------------------------------------------

/** The board by the wheel that lights up the latest numbers: reds to one side, blacks to the other, zeros in the middle. */
function NumbersBoard({ history, rolling }: { history: readonly Pocket[]; rolling: boolean }) {
  // The number in the air isn't on the board until the ball settles.
  const shown = history.slice(rolling ? 1 : 0, (rolling ? 1 : 0) + 12)
  return (
    <div className="rl-numbers">
      <p className="rl-numbers__title" aria-hidden="true">
        Last numbers
      </p>
      {shown.length === 0 ? (
        <p className="rl-numbers__empty">No spins yet</p>
      ) : (
        <ol className="rl-numbers__list" aria-label="Latest numbers, newest first">
          {shown.map((p, i) => (
            <li key={history.length - i - (rolling ? 1 : 0)} data-color={colorOf(p)} aria-label={pocketCall(p)}>
              {pocketName(p)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** The plates at the seats: yours with your caps, the regulars' with their stacks, friends online with theirs. */
function Seats({ talk, caps }: { talk: SeatRemark | null; caps: number }) {
  const { seats, online } = useSession()
  const you = (
    <div key="you" className="rl-plate is-you" style={{ '--c': SEAT_COLORS[online?.me ?? 0] } as CSSProperties}>
      <span className="rl-plate__chip" aria-hidden="true" />
      <span className="rl-plate__name">You{online?.done ? ' ✓' : ''}</span>
      <span className="rl-plate__stack">
        {caps.toLocaleString()}
        <span className="visually-hidden"> caps</span>
      </span>
    </div>
  )
  if (online) {
    return (
      <div className="rl-seats" aria-label="At the wheel">
        {you}
        {online.players.map((p, seat) =>
          p ? (
            <div key={`p${seat}`} className={`rl-plate is-player${p.done ? ' is-done' : ''}`} style={{ '--c': SEAT_COLORS[seat] } as CSSProperties} title={`${p.name}${p.done ? ', done betting' : ''}`}>
              <span className="rl-plate__chip" aria-hidden="true" />
              <span className="rl-plate__name">
                {p.name}
                {p.done && <span aria-label=", done betting"> ✓</span>}
              </span>
              <span className="rl-plate__stack">
                {onLayout(p.state.bets).toLocaleString()}
                <span className="visually-hidden"> caps on the layout</span>
              </span>
            </div>
          ) : null,
        )}
      </div>
    )
  }
  const plates = seats.map((seat, i) =>
    seat ? (
      // Keyed by who's there, so a newcomer's plate arrives with them.
      <div key={seat.regular.id} className="rl-plate" style={{ '--c': seat.regular.color } as CSSProperties} title={`${seat.regular.name}: ${seat.stack.toLocaleString()} caps, and ${onLayout(seat.state.bets).toLocaleString()} on the layout`}>
        <span className="rl-plate__chip" aria-hidden="true" />
        <span className="rl-plate__name">
          <span className="rl-plate__full">{seat.regular.name}</span>
          <span className="rl-plate__short" aria-hidden="true">
            {seat.regular.short}
          </span>
        </span>
        <span className="rl-plate__stack">
          {(seat.stack + onLayout(seat.state.bets)).toLocaleString()}
          <span className="visually-hidden"> caps</span>
        </span>
        <SpeechBubble name={seat.regular.name} remark={talk?.seat === i ? talk : null} className="rl-talk--seat" />
      </div>
    ) : (
      <div key={`empty-${i}`} className="rl-plate is-empty" aria-hidden="true">
        <span className="rl-plate__name">Empty seat</span>
      </div>
    ),
  )
  return (
    <div className="rl-seats" aria-label="At the wheel">
      {plates[0]}
      {plates[1]}
      {you}
      {plates[2]}
    </div>
  )
}

// ---- Picking a bet by tap --------------------------------------------------------------

interface ChooserProps {
  pocket: Pocket
  state: TableState
  takingDown: boolean
  onPick: (spot: Spot) => void
  onFocus: (spot: Spot | null) => void
  onClose: () => void
}

/** Every inside bet on a number, for a finger that can't hit the lines: tap one to put your chip there, or take it down. */
function Chooser({ pocket, state, takingDown, onPick, onFocus, onClose }: ChooserProps) {
  const all = insideBetsOn(state.wheel, pocket)
  const spots = takingDown ? all.filter((spot) => betOn(state, spot) > 0) : all
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const name = pocketName(pocket)
  return (
    <div className="rl-overlay rl-overlay--sheet" role="dialog" aria-modal="true" aria-label={`${takingDown ? 'Take down' : 'Bets on'} ${name}`} onClick={onClose}>
      <div className="rl-panel rl-chooser" onClick={(e) => e.stopPropagation()}>
        <div className="rl-chooser__head">
          <h2>
            <span className="rl-chooser__number" data-color={colorOf(pocket)}>
              {name}
            </span>
            {takingDown ? 'Take down' : 'Bets on'} {name}
          </h2>
          <button className="rl-button rl-chooser__close" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        {spots.length === 0 ? (
          <p className="rl-ink-dim">You have nothing on {name}’s bets to take down.</p>
        ) : (
          <ul className="rl-chooser__list">
            {spots.map((spot) => {
              const yours = betOn(state, spot)
              const info = spotInfo(state.wheel, spot)!
              return (
                <li key={spot}>
                  <button
                    className="rl-chooser__bet"
                    data-spot={spot}
                    onPointerEnter={() => onFocus(spot)}
                    onFocus={() => onFocus(spot)}
                    onClick={() => onPick(spot)}
                  >
                    <span className="rl-chooser__name">{info.kind === 'straight' ? 'Straight up' : spotName(state.wheel, spot)}</span>
                    <span className="rl-chooser__pays">{paysText(state.wheel, spot)}</span>
                    {yours > 0 && <span className="rl-chooser__yours">{yours.toLocaleString()} on it</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---- Your rail --------------------------------------------------------------------------

interface ControlsProps {
  state: TableState
  chips: readonly number[]
  chip: number
  takingDown: boolean
  rolling: boolean
  caps: number
}

function Controls({ state, chips, chip, takingDown, rolling, caps }: ControlsProps) {
  const { pickChip, setTakingDown, clear, rebet, spinWheel, notDone, spinNow, lost, online, stakes } = useSession()
  const down = onLayout(state.bets)
  const min = stakes!.limits.insideMin
  const link = useGameLink(GAME)

  if (online?.done) {
    const waiting = online.players.flatMap((p) => (p && !p.done ? [p.name] : []))
    return (
      <div className="rl-controls rl-controls--waiting">
        <p className="rl-controls__ask" aria-live="polite">
          {rolling ? 'No more bets.' : down ? `Your ${down.toLocaleString()} caps are down.` : 'You’re sitting this spin out.'}
          {!rolling && waiting.length > 0 && ` Waiting for ${listNames(waiting)}.`}
        </p>
        {!rolling && (
          <div className="rl-controls__buttons">
            <button className="rl-button" onClick={notDone}>
              Change my bets
            </button>
            {link?.host && waiting.length > 0 && (
              <button className="rl-button rl-button--primary" onClick={spinNow}>
                Spin without them
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (caps < min && down === 0 && !online && !rolling) {
    return (
      <div className="rl-controls rl-controls--broke">
        <p>
          The smallest bet here is {min} caps and you have {caps}. Try a lower limit, or claim a refill from the hub menu once you’re under 50.
        </p>
        <button className="rl-button" onClick={() => void navigate('/roulette', { during: useSession.getState().leave })}>
          Back to the tables
        </button>
      </div>
    )
  }

  return (
    <div className="rl-controls">
      <div className="rl-rack" role="radiogroup" aria-label="Chips">
        {chips.map((value, i) => (
          <button
            key={value}
            role="radio"
            aria-checked={!takingDown && chip === value}
            className="rl-rack__chip"
            onClick={() => pickChip(value)}
            aria-label={`Bet with ${value} chips (key ${i + 1})`}
            title={`Bet with ${value}s (key ${i + 1})`}
          >
            <Chip value={value} />
          </button>
        ))}
        <button role="radio" aria-checked={takingDown} className="rl-rack__down" onClick={() => setTakingDown(!takingDown)} title="Take bets down (key T)">
          <span className="wide-only">Take down</span>
          <span className="narrow-only">Down</span>
        </button>
      </div>
      <div className="rl-bet" aria-live="polite">
        <span className="rl-bet__label">On the layout</span>
        <span className="rl-bet__amount">{down.toLocaleString()}</span>
      </div>
      <div className="rl-controls__buttons">
        <button className="rl-button" onClick={clear} disabled={rolling || down === 0} title="Take everything down (Backspace)">
          Clear
        </button>
        <button className="rl-button" onClick={rebet} disabled={rolling || lost.length === 0} title="Put back what the last spin took (B)">
          Rebet
        </button>
        <button className="rl-button rl-button--primary rl-button--spin" onClick={spinWheel} disabled={rolling} aria-describedby="rl-help">
          {online ? 'Done betting' : 'Spin'} <span className="rl-key">S</span>
        </button>
      </div>
    </div>
  )
}

const listNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

// ---- The terminal -------------------------------------------------------------------------

/** What the guide says about a bet, or about the wheel you're at. */
function guideText(wheel: WheelKind, focus: Spot | null, compact: boolean): string {
  if (focus && spotInfo(wheel, focus)) {
    const head = `${spotName(wheel, focus)}: pays ${paysText(wheel, focus)}, house edge ${formatEdge(edgeOf(wheel, focus))}.`
    return compact ? head : `${head} ${aboutSpot(wheel, focus)}`
  }
  if (wheel === 'french') return 'La partage halves the house edge on the even chances: 1.35% on red or black, odd or even, high or low. Everything else costs 2.70%.'
  if (wheel === 'american') return 'Every bet here costs 5.26%, and the top line 7.89%. A single-zero wheel costs half as much.'
  return 'Every bet on a single-zero wheel costs the same, 2.70%, so bet what you like the look of.'
}

function Hud() {
  const { state, log, spin, focus, notice, leave, online } = useSession()
  const guide = useSave((s) => s.roulette.guide)
  const updateRoulette = useSave((s) => s.updateRoulette)
  const table3d = useSave((s) => s.settings.table3d)
  const updateSettings = useSave((s) => s.updateSettings)
  const [showRules, setShowRules] = useState(false)
  const compact = useMediaQuery(COMPACT_TABLE)
  const precise = useMediaQuery(PRECISE)
  const [menuOpen, setMenuOpen] = useState(false)
  // The menu belongs to the compact layout. Turning a tablet can leave it, and it stays closed.
  if (menuOpen && !compact) setMenuOpen(false)
  const closeMenu = () => setMenuOpen(false)
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
  const s = state!
  const rolling = !!spin && !spin.landed
  const down = onLayout(s.bets)
  const tap = precise ? 'Click' : 'Tap'

  let status: string
  if (rolling) status = s.wheel === 'french' ? 'Rien ne va plus' : 'No more bets'
  else if (spin) status = pocketCall(spin.pocket)
  else status = s.wheel === 'french' ? 'Faites vos jeux' : 'Place your bets'

  let help = ''
  if (notice) help = notice.text
  else if (rolling) help = 'The ball is rolling.'
  else if (guide) help = guideText(s.wheel, focus, compact)
  else help = precise ? `${tap} a chip, then a number or a line between numbers. Spin when your bets are down.` : `${tap} a chip, then an outside bet, or a number for the bets on it. Spin when your bets are down.`

  const getUp = () => void navigate('/roulette', { during: online ? leaveOnline : leave })

  const tableLog = (
    <ol className="rl-hud__log" ref={logRef} aria-label="Table log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="rl-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
      </button>
      <button className="term-button" aria-pressed={guide} onClick={() => updateRoulette({ guide: !guide })}>
        <span aria-hidden="true">{guide ? '[x]' : '[ ]'}</span> Guide
      </button>
      <button className="term-button" aria-pressed={table3d} onClick={() => updateSettings({ table3d: !table3d })}>
        <span aria-hidden="true">{table3d ? '[x]' : '[ ]'}</span> 3D view
      </button>
      <button className="term-button" onClick={getUp}>
        Leave table
      </button>
    </div>
  )

  return (
    <aside className="rl-hud screen" aria-label="Game status">
      <div className="rl-hud__head">
        <p className="term-dim">
          Roulette{online ? ' online' : ''}, {wheelById(s.wheel).name} wheel
        </p>
        {down > 0 && <p className="rl-hud__stake">On the layout {down.toLocaleString()}</p>}
      </div>
      <p className="rl-hud__status" aria-live="polite">
        {status}
      </p>
      <p className="rl-hud__help" id="rl-help" role={notice ? 'status' : undefined}>
        {help}
      </p>
      {!compact && down > 0 && !rolling && <p className="rl-hud__note">Leaving hands back everything on the layout.</p>}
      {compact && (
        <button className="term-button rl-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          Menu
        </button>
      )}
      {!compact && tableLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="rl-overlay" role="dialog" aria-modal="true" aria-label="Table menu" onClick={closeMenu}>
          <div className="rl-menu screen" onClick={(e) => e.stopPropagation()}>
            {tableLog}
            {tableControls}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="rl-overlay" role="dialog" aria-modal="true" aria-label="Roulette rules" onClick={() => setShowRules(false)}>
          <div className="rl-panel rl-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="rl-button rl-button--primary" autoFocus onClick={() => setShowRules(false)}>
              Back to the game
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

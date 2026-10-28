import { type CSSProperties, Fragment, type ReactNode, type RefObject, createContext, memo, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { createRng } from '../../../core/rng'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { breakdown } from '../../blackjack/ui/chips'
import { Chip } from '../../blackjack/ui/Chip'
import { aboutSpot, edgeOf, formatEdge, paysText, spotName, unitsText } from '../content'
import {
  type BetSpot,
  type Dice,
  type TableEvent,
  type TableState,
  activeSpots,
  betOn,
  canBet,
  canTakeDown,
  isWorking,
  maxBet,
  onLayout,
  oddsOf,
  spotInfo,
  total,
} from '../engine'
import { Felt } from './Felt'
import { type Layout, type Point, type Shape, WIDE_LAYOUT, ZONE_SPOTS, tallLayout } from './layout'
import { RulesText } from './Rules'
import { type RailRemark, type RailSeat, type Remark, type Settled, forfeitOf, needsLineBet, useSession } from './session'

/**
 * Phones and small windows get the compact table in craps.css, whose media
 * queries match this one: the HUD keeps its log and table controls behind a
 * Menu button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 520px)'

/** Held upright, a phone gets the tall layout (layout.ts). Keep in step with craps.css. */
const TALL_TABLE = '(max-width: 900px) and (orientation: portrait)'

/** The layout's shape and where everything sits on it, for every piece on the felt. */
const LayoutContext = createContext<Layout>(WIDE_LAYOUT)
const useLayout = () => useContext(LayoutContext)

/** An element's height over its width, kept up to date as it resizes. */
function useAspect(ref: RefObject<HTMLElement | null>): number {
  const [aspect, setAspect] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => el.clientWidth > 0 && setAspect(el.clientHeight / el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return aspect
}

export function Table() {
  const { sitting, state, stakes } = useSession()

  // No seat? Back to the lobby.
  useEffect(() => {
    if (!state || !stakes) navigate('/craps')
  }, [state, stakes])

  if (!state || !stakes) return null
  return <TableView key={sitting} />
}

function TableView() {
  const { state, stakes, call, settled, dice, chip, takingDown, rail, talk } = useSession()
  const caps = useSave((s) => s.wallet.caps)
  const guide = useSave((s) => s.craps.guide)
  const { roll, pickChip, setTakingDown, clear, rebet } = useSession.getState()
  const s = state!
  const rolling = !!dice && !dice.landed

  // Keyboard: 1–4 pick a chip, T takes bets down, R or Space rolls, Backspace clears, B rebets.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role="dialog"]')) return
      const key = e.key.toLowerCase()
      const chips = stakes!.chips
      if (key === 'r' || (key === ' ' && !target.closest('button'))) roll()
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

  const stageRef = useRef<HTMLDivElement>(null)
  const aspect = useAspect(stageRef)
  const tall = useMediaQuery(TALL_TABLE)
  const layout = tall ? tallLayout(aspect * 1000) : WIDE_LAYOUT
  const { shape } = layout

  return (
    <div className={`cr-game${takingDown ? ' is-taking-down' : ''}`}>
      <div className="cr-board">
        <StickmanBar name={stakes!.stickman.name} call={call} limits={`${stakes!.limits.min} to ${stakes!.limits.max.toLocaleString()} caps`} table={stakes!.name} />

        <div className="cr-stage" ref={stageRef}>
          <div
            className="cr-felt"
            role="region"
            aria-label="Craps layout"
            data-shape={shape.name}
            style={{ '--felt-h': shape.h, '--scale': layout.scale, '--d': shape.chipD, '--die': shape.dieD } as CSSProperties}
          >
            <LayoutContext.Provider value={layout}>
              <Felt shape={shape} />
              <Zones state={s} rolling={rolling} guide={guide} takingDown={takingDown} />
              <Chips state={s} settled={settled} rolling={rolling} takingDown={takingDown} />
              {settled && <Ghosts key={`ghosts-${settled.id}`} settled={settled} />}
              <Puck point={s.point} />
              <RailPlates rail={rail} talk={talk} caps={caps} />
              {dice && <ThrownDice key={`dice-${dice.id}`} id={dice.id} dice={dice.dice} />}
              {settled && dice?.landed && burstFor(settled) && <ResultBurst key={`burst-${settled.id}`} net={settled.net} />}
            </LayoutContext.Provider>
          </div>
        </div>

        <Controls state={s} chips={stakes!.chips} chip={chip} takingDown={takingDown} rolling={rolling} caps={caps} min={stakes!.limits.min} />
      </div>

      <Hud />
    </div>
  )
}

// ---- The stickman ------------------------------------------------------------

function StickmanBar({ name, call, limits, table }: { name: string; call: Remark | null; limits: string; table: string }) {
  return (
    <div className="cr-stick-bar">
      <div className="cr-stick-bar__who">
        <span className="cr-portrait" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            {/* The stick: a bent cane for pulling the dice back. */}
            <path d="M8 34 L28 8 Q31 4 34 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
        <span className="cr-stick-bar__name">{name}</span>
        <SpeechBubble name={name} remark={call} className="cr-talk--stick" />
      </div>
      <div className="cr-placard" aria-label={`${table}: bets from ${limits}`}>
        <span className="cr-placard__table">{table}</span>
        <span className="cr-placard__limits">{limits}</span>
      </div>
    </div>
  )
}

/** Long enough to read the line twice at a relaxed pace. */
const readingTime = (text: string) => Math.min(6000, Math.max(2400, 1500 + text.length * 55))

/** The latest remark, shown after its delay and faded after a while. A newer one replaces it. */
function SpeechBubble({ name, remark, className, style }: { name: string; remark: Remark | null; className: string; style?: CSSProperties }) {
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
    <div className={`cr-talk ${className}`} style={style} aria-live="polite">
      {visible && (
        <p key={remark.id} className="cr-talk__bubble" style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          <span className="visually-hidden">{name} says: </span>
          {remark.text}
        </p>
      )}
    </div>
  )
}

// ---- Bets on the layout ----------------------------------------------------------

/** Absolute position on the felt, in felt units. */
const at = (p: Point): CSSProperties => ({ '--x': p.x, '--y': p.y }) as CSSProperties

/** How far something travels to get here from `from`, in the felt's frame. */
const from = (p: Point, origin: Point, name = 'f'): CSSProperties => ({ [`--${name}x`]: origin.x - p.x, [`--${name}y`]: origin.y - p.y }) as CSSProperties

/** The bet the guide lights up: the pass line to start, then full odds behind it. */
function advised(state: TableState): BetSpot | null {
  if (state.point === null) return needsLineBet(state) ? 'pass' : null
  if (betOn(state, 'pass') > 0 && betOn(state, 'pass-odds') < maxBet(state, 'pass-odds')) return 'pass-odds'
  return null
}

/** The bet areas: a tap adds your chip, or takes the bet down. */
const Zones = memo(function Zones({ state, rolling, guide, takingDown }: { state: TableState; rolling: boolean; guide: boolean; takingDown: boolean }) {
  const { zoneOf } = useLayout()
  const { bet, takeDown, setFocus } = useSession.getState()
  const best = guide && !takingDown ? advised(state) : null
  return (
    <>
      {ZONE_SPOTS.map((spot) => {
        const r = zoneOf(spot)!
        const amount = betOn(state, spot)
        const open = takingDown ? canTakeDown(state, spot) : canBet(state, spot)
        const off = amount > 0 && !isWorking(state, spot)
        return (
          <button
            key={spot}
            className={`cr-zone${open ? ' is-open' : ''}${best === spot ? ' is-advised' : ''}`}
            data-spot={spot}
            style={{ '--x': r.x, '--y': r.y, '--w': r.w, '--h': r.h } as CSSProperties}
            aria-disabled={rolling || !open}
            aria-label={`${spotName(spot)}, pays ${paysText(spot, state.point)}${amount ? `. ${amount.toLocaleString()} caps on it${off ? ', off this roll' : ''}` : ''}`}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setFocus(spot)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setFocus(null)}
            onFocus={() => setFocus(spot)}
            onClick={() => {
              if (rolling) return
              if (takingDown) takeDown(spot)
              else bet(spot)
            }}
          />
        )
      })}
    </>
  )
})

/** A stack of chips on the felt, the biggest at the bottom. */
function Stack({ amount, place, className = '', style, children }: { amount: number; place: Point; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const chips = breakdown(amount).slice(0, 10)
  return (
    <div className={`cr-stack ${className}`} style={{ ...at(place), ...style }} aria-hidden="true">
      {chips.map((value, i) => (
        <div key={i} className="cr-stack__chip" style={{ '--i': i } as CSSProperties}>
          <Chip value={value} />
        </div>
      ))}
      {children}
    </div>
  )
}

/**
 * Your chips on the layout. A come bet that just travelled slides over from
 * the come box. Chips on a travelled come bet are a button of their own:
 * tap them for odds, or to take the bet (or its odds) down.
 */
const Chips = memo(function Chips({ state, settled, rolling, takingDown }: { state: TableState; settled: Settled | null; rolling: boolean; takingDown: boolean }) {
  const { chipsAt } = useLayout()
  const { bet, takeDown, setFocus } = useSession.getState()
  const moved = new Map((settled?.events ?? []).flatMap((e) => (e.type === 'moved' ? [[e.to, e.from] as const] : [])))
  return (
    <>
      {activeSpots(state.bets).map((spot) => {
        const amount = betOn(state, spot)
        const place = chipsAt(spot)
        const off = !isWorking(state, spot)
        const came = moved.get(spot)
        const { kind, number } = spotInfo(spot)
        const stack = (
          <Stack
            key={spot}
            amount={amount}
            place={place}
            className={`${came ? 'is-moved' : ''}${off ? ' is-off' : ''}`}
            style={came ? from(place, chipsAt(came)) : undefined}
          >
            {off && <span className="cr-stack__off">Off</span>}
          </Stack>
        )
        if (kind !== 'come-point' && kind !== 'dont-come-point') return stack
        // Tap a travelled bet: odds go behind it, or in take-down mode its odds (a come bet) or the bet itself (a don't) come down.
        const odds = oddsOf(spot)!
        const target: BetSpot = takingDown ? (kind === 'come-point' ? odds : spot) : odds
        const open = takingDown ? canTakeDown(state, target) : canBet(state, target) && betOn(state, target) < maxBet(state, target)
        const what = kind === 'come-point' ? `Your come bet on the ${number}` : `Your don’t come bet on the ${number}`
        return (
          <button
            key={spot}
            className={`cr-chips-tap${open ? ' is-open' : ''}`}
            style={{ ...at(place), ...(came ? from(place, chipsAt(came)) : {}) } as CSSProperties}
            aria-disabled={rolling || !open}
            aria-label={`${what}, ${amount.toLocaleString()} caps${betOn(state, odds) ? ` with ${betOn(state, odds).toLocaleString()} in odds` : ''}. ${takingDown ? (kind === 'come-point' ? 'Take the odds down' : 'Take it down') : kind === 'come-point' ? 'Add odds' : 'Lay odds'}`}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setFocus(spot)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setFocus(null)}
            onFocus={() => setFocus(spot)}
            onClick={() => {
              if (rolling) return
              if (takingDown) takeDown(target)
              else bet(target)
            }}
          >
            {stack}
          </button>
        )
      })}
    </>
  )
})

/**
 * What the last roll did to your chips, played out on the felt: winnings
 * pushed out from the bank and back to your rail with any bet that comes
 * down with them, lost bets swept to the bank, odds that were off handed back.
 */
function Ghosts({ settled }: { settled: Settled }) {
  const { chipsAt, shape } = useLayout()
  const d = shape.chipD
  return (
    <>
      {settled.events.map((e: TableEvent, i) => {
        if (e.type === 'won') {
          const place = chipsAt(e.spot)
          const beside = { x: place.x + d * 0.95, y: place.y + d * 0.1 }
          return (
            <Fragment key={i}>
              <Stack amount={e.paid} place={beside} className="is-paid" style={{ ...from(beside, shape.house), ...from(beside, shape.rail, 'r') }} />
              {!e.stays && <Stack amount={e.bet} place={place} className="is-back" style={from(place, shape.rail, 'r')} />}
            </Fragment>
          )
        }
        if (e.type === 'lost') {
          const place = chipsAt(e.spot)
          return <Stack key={i} amount={e.bet} place={place} className="is-taken" style={from(place, shape.house, 'r')} />
        }
        if (e.type === 'returned') {
          const place = chipsAt(e.spot)
          return <Stack key={i} amount={e.bet} place={place} className="is-back" style={from(place, shape.rail, 'r')} />
        }
        return null
      })}
    </>
  )
}

/** The puck: black side up and OFF in the Don't Come bar, white side up and ON on the point. */
function Puck({ point }: { point: TableState['point'] }) {
  const { puckAt } = useLayout()
  return (
    <div className={`cr-puck${point === null ? ' is-off' : ' is-on'}`} style={at(puckAt(point))} aria-label={point === null ? 'The puck is off: the next roll is a come-out' : `The puck is on the ${point}`} role="img">
      {point === null ? 'OFF' : 'ON'}
    </div>
  )
}

/**
 * Brass name plates on the rail: yours with your caps, and the regulars'
 * with theirs. A regular's remarks rise from their plate.
 */
function RailPlates({ rail, talk, caps }: { rail: (RailSeat | null)[]; talk: RailRemark | null; caps: number }) {
  const { shape } = useLayout()
  return (
    <>
      <div className="cr-plate is-you" style={at(shape.you)}>
        <span className="cr-plate__name">You</span>
        <span className="cr-plate__stack">
          {caps.toLocaleString()}
          <span className="visually-hidden"> caps</span>
        </span>
      </div>
      {rail.map((seat, i) =>
        seat ? (
          // Keyed by who's there, so a newcomer's plate arrives with them.
          <Fragment key={seat.regular.id}>
            <div className="cr-plate" style={at(shape.seats[i])} title={`${seat.regular.name}: ${seat.stack.toLocaleString()} caps`}>
              <span className="cr-portrait-dot" style={{ background: seat.regular.color }} aria-hidden="true" />
              <span className="cr-plate__name">
                <span className="cr-plate__full">{seat.regular.name}</span>
                <span className="cr-plate__short" aria-hidden="true">
                  {seat.regular.short}
                </span>
              </span>
              <span className="cr-plate__stack">
                {seat.stack.toLocaleString()}
                <span className="visually-hidden"> caps</span>
              </span>
            </div>
            <SpeechBubble name={seat.regular.name} remark={talk?.seat === i ? talk : null} className={`cr-talk--seat cr-talk--s${i}`} style={at(shape.seats[i])} />
          </Fragment>
        ) : null,
      )}
    </>
  )
}

/** Whether a roll's result is worth showing: you won or lost on it, or a barred 12 was all that happened. A wash shows nothing. */
function burstFor({ net, decided, events }: Settled): boolean {
  if (!decided) return false
  if (net !== 0) return true
  return !events.some((e) => e.type === 'won' || e.type === 'lost')
}

/** Your result for the roll, rising off the felt. */
function ResultBurst({ net }: { net: number }) {
  const { shape } = useLayout()
  const place = { x: shape.come.x + shape.come.w * 0.4, y: shape.come.y + shape.come.h / 2 }
  return (
    <div className={`cr-burst${net > 0 ? ' is-up' : net < 0 ? ' is-down' : ''}`} style={at(place)} aria-hidden="true">
      {net > 0 ? `+${net.toLocaleString()}` : net < 0 ? `−${(-net).toLocaleString()}` : 'Push'}
    </div>
  )
}

// ---- The dice -------------------------------------------------------------------

/** How a cube turns to show each face on top (face 1 starts on top; see .cr-die__face in craps.css). */
const FACE_UP: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
}

interface Flight {
  rest: Point
  start: Point
  wall: Point
  hop: Point
  spinZ: number
}

/** Where a throw goes: out of your hand, off the wall, and to rest in the open felt. Decided by the roll's number, so it's the same on every redraw. */
function flight(id: number, die: 0 | 1, shape: Shape): Flight {
  const r = createRng(Math.imul(id + 1, 2654435761) + die * 7919)
  const { landing, wall, launch, dieD } = shape
  const half = landing.w / 2
  // One die in each half of the landing area, so they never land on each other.
  const restX = landing.x + die * half + dieD * 0.8 + r() * (half - dieD * 1.6)
  const rest = { x: restX, y: landing.y + dieD * 0.6 + r() * Math.max(0, landing.h - dieD * 1.2) }
  const hitX = rest.x + (r() - 0.5) * dieD * 3
  const hit = { x: hitX, y: wall.y + wall.h + dieD * 0.55 }
  const hop = { x: (hit.x + rest.x) / 2 + (r() - 0.5) * dieD, y: hit.y + (rest.y - hit.y) * 0.65 }
  const start = { x: launch.x + (die === 0 ? -1 : 1) * dieD * 0.7, y: launch.y }
  return { rest, start, wall: hit, hop, spinZ: Math.round(r() * 360) }
}

function ThrownDice({ id, dice }: { id: number; dice: Dice }) {
  const { shape } = useLayout()
  return (
    <div className="cr-dice" role="img" aria-label={`Dice: ${dice[0]} and ${dice[1]}, ${total(dice)}`}>
      {dice.map((value, i) => {
        const f = flight(id, i as 0 | 1, shape)
        const turn = FACE_UP[value]
        return (
          <div
            key={i}
            className="cr-die"
            style={
              {
                ...at(f.rest),
                ...from(f.rest, f.start, 's'),
                ...from(f.rest, f.wall, 'w'),
                ...from(f.rest, f.hop, 'h'),
                '--fx': `${turn.x}deg`,
                '--fy': `${turn.y}deg`,
                '--rz': `${f.spinZ}deg`,
                '--delay': `${i * 35}ms`,
              } as CSSProperties
            }
          >
            <div className="cr-die__cube">
              {[1, 2, 3, 4, 5, 6].map((face) => (
                <div key={face} className="cr-die__face" data-face={face}>
                  <Pips value={face} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PIP_SPOTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
}

function Pips({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true">
      {PIP_SPOTS[value].map(([x, y], i) => (
        <circle key={i} cx={7.5 + x * 7.5} cy={7.5 + y * 7.5} r={value === 1 ? 4 : 3.1} />
      ))}
    </svg>
  )
}

// ---- Your rail --------------------------------------------------------------------

interface ControlsProps {
  state: TableState
  chips: readonly number[]
  chip: number
  takingDown: boolean
  rolling: boolean
  caps: number
  min: number
}

function Controls({ state, chips, chip, takingDown, rolling, caps, min }: ControlsProps) {
  const { pickChip, setTakingDown, clear, rebet, roll, lost } = useSession()
  const down = onLayout(state.bets)
  const removable = activeSpots(state.bets).some((spot) => canTakeDown(state, spot))
  const broke = needsLineBet(state) && caps < min

  if (broke && down === 0) {
    return (
      <div className="cr-controls cr-controls--broke">
        <p>
          You need {min} caps on the line to shoot at this table and you have {caps}. Try a lower limit, or claim a refill from the hub
          menu once you’re under 50.
        </p>
        <button className="cr-button" onClick={() => void navigate('/craps', { during: useSession.getState().leave })}>
          Back to the tables
        </button>
      </div>
    )
  }

  return (
    <div className="cr-controls">
      <div className="cr-rack" role="radiogroup" aria-label="Chips">
        {chips.map((value, i) => (
          <button
            key={value}
            role="radio"
            aria-checked={!takingDown && chip === value}
            className="cr-rack__chip"
            onClick={() => pickChip(value)}
            aria-label={`Bet with ${value} chips (key ${i + 1})`}
            title={`Bet with ${value}s (key ${i + 1})`}
          >
            <Chip value={value} />
          </button>
        ))}
        <button
          role="radio"
          aria-checked={takingDown}
          className="cr-rack__down"
          onClick={() => setTakingDown(!takingDown)}
          title="Take bets down (key T)"
        >
          <span className="wide-only">Take down</span>
          <span className="narrow-only">Down</span>
        </button>
      </div>
      <div className="cr-bet" aria-live="polite">
        <span className="cr-bet__label">On the layout</span>
        <span className="cr-bet__amount">{down.toLocaleString()}</span>
      </div>
      <div className="cr-controls__buttons">
        <button className="cr-button" onClick={clear} disabled={rolling || !removable} title="Take down every bet that can come down (Backspace)">
          Clear
        </button>
        <button className="cr-button" onClick={rebet} disabled={rolling || lost.length === 0} title="Put back what the last roll took (B)">
          Rebet
        </button>
        <button className="cr-button cr-button--primary cr-button--roll" onClick={roll} disabled={rolling} aria-describedby="cr-help">
          Roll <span className="cr-key">R</span>
        </button>
      </div>
    </div>
  )
}

// ---- The terminal -------------------------------------------------------------------

function statusOf(state: TableState, rolling: boolean): string {
  if (rolling) return 'Dice are out…'
  return state.point === null ? 'Coming out' : `The point is ${state.point}`
}

/** What the guide says about a bet, or the best play right now. */
function guideText(state: TableState, focus: BetSpot | null, compact: boolean): string {
  if (focus) {
    const name = spotName(focus)
    const edge = formatEdge(edgeOf(focus))
    const units = unitsText(focus, state.point)
    const head = `${name}: pays ${paysText(focus, state.point)}, house edge ${edge}.`
    return compact ? `${head}${units ? ` ${units}` : ''}` : `${head} ${aboutSpot(focus)}${units ? ` ${units}` : ''}`
  }
  const best = advised(state)
  if (best === 'pass') return 'Start on the pass line: at 1.41%, it’s the best bet you can make before there’s a point.'
  if (best === 'pass-odds') return `Take odds behind your line bet: true odds, with no house edge. Up to ${maxBet(state, 'pass-odds').toLocaleString()} on the ${state.point}.`
  if (state.point !== null) return 'Come bets with odds behind them are as good as the line. Place the 6 and 8 at 1.52%; the middle of the table costs far more.'
  return 'Roll when your bets are down.'
}

function RollHistory({ history }: { history: TableState['history'] }) {
  const recent = history.slice(0, 10)
  if (recent.length === 0) return null
  return (
    <ol className="cr-hud__rolls" aria-label="Latest rolls, newest first">
      {recent.map((d, i) => (
        <li key={history.length - i} data-seven={total(d) === 7 || undefined}>
          {total(d)}
        </li>
      ))}
    </ol>
  )
}

function Hud() {
  const { state, stakes, log, dice, focus, notice, leave } = useSession()
  const guide = useSave((s) => s.craps.guide)
  const updateCraps = useSave((s) => s.updateCraps)
  const table3d = useSave((s) => s.settings.table3d)
  const updateSettings = useSave((s) => s.updateSettings)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const compact = useMediaQuery(COMPACT_TABLE)
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
  const s = state!
  const rolling = !!dice && !dice.landed
  const down = onLayout(s.bets)
  const forfeit = forfeitOf(s)

  let help = ''
  if (notice) help = notice.text
  else if (guide) help = guideText(s, focus, compact)
  else if (needsLineBet(s)) help = `${compact ? 'Tap' : 'Click'} a chip, then the pass line or don’t pass. The shooter needs a line bet to come out.`
  else help = `${compact ? 'Tap' : 'Click'} a bet to put your chip down, then roll.`

  const getUp = () => void navigate('/craps', { during: leave })

  const tableLog = (
    <ol className="cr-hud__log" ref={logRef} aria-label="Table log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="cr-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
      </button>
      <button className="term-button" aria-pressed={guide} onClick={() => updateCraps({ guide: !guide })}>
        <span aria-hidden="true">{guide ? '[x]' : '[ ]'}</span> Guide
      </button>
      <button className="term-button" aria-pressed={table3d} onClick={() => updateSettings({ table3d: !table3d })}>
        <span aria-hidden="true">{table3d ? '[x]' : '[ ]'}</span> 3D view
      </button>
      {forfeit === 0 ? (
        <button className="term-button" onClick={getUp}>
          Leave table
        </button>
      ) : confirmLeave ? (
        <button className="term-button" onClick={getUp}>
          Forfeit {forfeit.toLocaleString()} caps
        </button>
      ) : (
        <button className="term-button" onClick={() => setConfirmLeave(true)}>
          Leave table
        </button>
      )}
    </div>
  )

  return (
    <aside className="cr-hud screen" aria-label="Game status">
      <div className="cr-hud__head">
        <p className="term-dim">Craps, {stakes!.name.toLowerCase()}</p>
        {down > 0 && <p className="cr-hud__stake">On the layout {down.toLocaleString()}</p>}
      </div>
      <p className="cr-hud__status" aria-live="polite">
        {statusOf(s, rolling)}
      </p>
      <p className="cr-hud__help" id="cr-help" role={notice ? 'status' : undefined}>
        {help}
      </p>
      <RollHistory history={s.history} />
      {confirmLeave && forfeit > 0 && !compact && (
        <p className="cr-hud__warn">Your line and come bets can’t come down: leaving loses them. Everything else comes back to you.</p>
      )}
      {compact && (
        <button className="term-button cr-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          Menu
        </button>
      )}
      {!compact && tableLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="cr-overlay" role="dialog" aria-modal="true" aria-label="Table menu" onClick={closeMenu}>
          <div className="cr-menu screen" onClick={(e) => e.stopPropagation()}>
            {tableLog}
            {tableControls}
            {confirmLeave && forfeit > 0 && <p className="cr-hud__warn">Your line and come bets can’t come down: leaving loses them.</p>}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="cr-overlay" role="dialog" aria-modal="true" aria-label="Craps rules" onClick={() => setShowRules(false)}>
          <div className="cr-panel cr-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="cr-button cr-button--primary" autoFocus onClick={() => setShowRules(false)}>
              Back to the game
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

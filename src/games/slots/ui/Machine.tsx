/**
 * A slot machine on the row: chrome and enamel, its name on the marquee
 * (with the jackpot meter on Moon Rocket), the paytable on the glass, three
 * reels behind the window, and on yours the meters, the buttons and the
 * handle. The machines either side of yours are the same cabinet, smaller,
 * with the player's plate instead of the controls.
 *
 * The reels are drums of 22 faces in CSS 3D (slots.css), turned by the
 * angles in reels.ts. Flat, they keep their drum, seen without perspective.
 */

import { type CSSProperties, type PointerEvent, type ReactNode, memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { payName, payPicture, payValue, SYMBOLS } from '../content'
import { type Rules, type Stops, type Strip, MAX_COINS, meterCaps } from '../engine'
import type { MachineId } from '../machines'
import { REEL_MS, idleStops, litReels, turnAngles } from './reels'
import type { Pull } from './session'
import { SymbolArt } from './Symbols'

// ---- The reels ------------------------------------------------------------------

interface Turn {
  /** The pull turning it. */
  id: number
  from: Stops
  to: Stops
  /** performance.now() at the pull. */
  at: number
  /** Already at rest when first drawn: no turning. */
  still: boolean
}

/** Follow a machine's pulls: each one turns the reels from wherever the last one left them. */
function useTurn(pull: Pull | null, idle: Stops): Turn | null {
  const [turn, setTurn] = useState<Turn | null>(null)
  if (pull && turn?.id !== pull.id) {
    setTurn({ id: pull.id, from: turn?.to ?? idle, to: pull.spin.stops, at: pull.at, still: pull.settled && turn === null })
  }
  return turn
}

const Face = memo(function Face({ symbol, index, lit }: { symbol: Strip[number]['symbol']; index: number; lit: boolean }) {
  return (
    <div className={`sl-face${lit ? ' is-lit' : ''}`} style={{ '--i': index } as CSSProperties} data-symbol={symbol}>
      <SymbolArt symbol={symbol} />
    </div>
  )
})

interface ReelProps {
  strip: Strip
  reel: number
  stop: number
  turn: Turn | null
  moving: boolean
  lit: boolean
}

/** One drum: its faces round it, turned to its stop, or turning there. */
function Reel({ strip, reel, stop, turn, moving, lit }: ReelProps) {
  const drum = useRef<HTMLDivElement>(null)
  const angles = turn ? turnAngles(turn.from[reel], turn.to[reel], reel) : null
  const style = {
    '--rest': `${stop * (360 / strip.length)}deg`,
    '--from': `${angles?.from ?? 0}deg`,
    '--to': `${angles?.to ?? 0}deg`,
    '--turn-ms': `${REEL_MS[reel]}ms`,
  } as CSSProperties
  // A machine that comes on screen mid-spin picks its reels up where they are, before they're painted.
  const id = turn?.id
  const at = turn?.at
  useLayoutEffect(() => {
    if (moving && at !== undefined) drum.current?.style.setProperty('--late', `${-Math.max(0, performance.now() - at)}ms`)
  }, [id, at, moving])
  return (
    <div className="sl-reel">
      <div className="sl-drum" ref={drum} style={style} data-moving={moving || undefined} key={turn?.id ?? 0}>
        {strip.map((s, i) => (
          <Face key={i} symbol={s.symbol} index={i} lit={lit && i === stop} />
        ))}
      </div>
    </div>
  )
}

interface WindowProps {
  rules: Rules
  pull: Pull | null
  /** Where the reels rest before the first pull. */
  seed: number
  /** Light the winning symbols once the reels stop. */
  showWin: boolean
}

/** The three reels behind the glass, with the pay line across them. */
export function ReelWindow({ rules, pull, seed, showWin }: WindowProps) {
  const idle = idleStopsFor(rules, seed)
  const turn = useTurn(pull, idle)
  const stops = turn?.to ?? idle
  const moving = !!turn && !turn.still && !!pull && !pull.settled
  const lit = pull?.settled && showWin ? litReels(rules, pull.spin) : [false, false, false]
  const label = moving ? 'The reels are turning.' : `On the line: ${stops.map((s, i) => SYMBOLS[rules.reels[i][s].symbol].name).join(', ')}.`
  return (
    <div className="sl-window" role="img" aria-label={label} data-won={(showWin && pull?.settled && !!pull.spin.win) || undefined}>
      {rules.reels.map((strip, reel) => (
        <Reel key={reel} strip={strip} reel={reel} stop={stops[reel]} turn={turn} moving={moving} lit={lit[reel]} />
      ))}
      <div className="sl-window__shade" aria-hidden="true" />
      <div className="sl-payline" aria-hidden="true" />
    </div>
  )
}

const idleCache = new Map<string, Stops>()
function idleStopsFor(rules: Rules, seed: number): Stops {
  const key = `${rules.coin}:${seed}`
  let stops = idleCache.get(key)
  if (!stops) idleCache.set(key, (stops = idleStops(rules, seed)))
  return stops
}

// ---- The marquee ----------------------------------------------------------------

/** The machine's name in lights, and Moon Rocket's meter under it. */
function Marquee({ name, meter, jackpot, small }: { name: string; meter: number | null; jackpot: boolean; small?: boolean }) {
  return (
    <div className="sl-topper" data-jackpot={jackpot || undefined}>
      <span className="sl-candle" aria-hidden="true" />
      <div className="sl-marquee">
        <span className="sl-marquee__name">{name}</span>
        {meter !== null && (
          <span className="sl-marquee__meter" aria-label={`Jackpot meter: ${meterCaps(meter).toLocaleString()} caps`}>
            {!small && <span className="sl-marquee__label">Jackpot</span>}
            <span className="sl-digits sl-digits--meter">{meterCaps(meter).toLocaleString()}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ---- The pay glass --------------------------------------------------------------

/** The paytable printed on the glass above the reels, in coins: the column for your bet bright, a winning line lit. */
function PayGlass({ rules, coins, lit }: { rules: Rules; coins: number; lit: number | null }) {
  return (
    <div className="sl-glass" role="table" aria-label="What each line pays, in coins">
      <div className="sl-glass__row sl-glass__row--head" role="row">
        <span role="columnheader" className="sl-glass__pays">
          Pays
        </span>
        {Array.from({ length: MAX_COINS }, (_, i) => (
          <span key={i} role="columnheader" data-current={coins === i + 1 || undefined}>
            {i + 1} coin{i ? 's' : ''}
          </span>
        ))}
      </div>
      {rules.pays.map((pay, i) => (
        <div key={i} className="sl-glass__row" role="row" data-lit={lit === i || undefined}>
          <span role="rowheader" className="sl-glass__pic" title={payName(pay)}>
            {payPicture(pay).map((symbol, k) => (
              <SymbolArt key={k} symbol={symbol} />
            ))}
            <span className="visually-hidden">{payName(pay)}</span>
          </span>
          {Array.from({ length: MAX_COINS }, (_, c) => (
            <span key={c} role="cell" data-current={coins === c + 1 || undefined} data-meter={pay.pays[c] === 'meter' || undefined}>
              {payValue(pay, c + 1)}
            </span>
          ))}
        </div>
      ))}
      {rules.wild && (
        <p className="sl-glass__note">
          <SymbolArt symbol={rules.wild.symbol} /> Wild: doubles a win, two quadruple it
        </p>
      )}
      {rules.progressive && <p className="sl-glass__note">Three coins win the meter</p>}
    </div>
  )
}

// ---- Meters ------------------------------------------------------------------------

function Meter({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={`sl-meter${className ? ` ${className}` : ''}`}>
      <span className="sl-meter__label">{label}</span>
      <span className="sl-digits">{value.toLocaleString()}</span>
    </div>
  )
}

/**
 * The winner-paid meter counting up a coin at a time, with a ding for each,
 * the way the credits rolled on the old machines. Bigger wins count faster.
 */
function useRollup(target: number, key: number | null): number {
  const [shown, setShown] = useState<{ key: number | null; value: number }>({ key, value: target })
  useEffect(() => {
    if (key === null || target <= 0) return
    const ms = target <= 10 ? target * 140 : target <= 100 ? 1800 : target < 1000 ? 2600 : 4200
    const start = performance.now()
    let last = 0
    let lastDing = 0
    let frame = 0
    const step = (now: number) => {
      const value = Math.min(target, Math.floor(((now - start) / ms) * target))
      if (value > last && now - lastDing > 45) {
        playSfx('credit')
        lastDing = now
      }
      last = value
      setShown({ key, value })
      if (value < target) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [key, target])
  return shown.key === key ? shown.value : 0
}

// ---- The handle --------------------------------------------------------------------

/** The handle on the cabinet's side: click or tap it, or pull the knob down. */
function Handle({ pulls, onPull, disabled }: { pulls: number; onPull: () => void; disabled: boolean }) {
  const drag = useRef<{ y: number; done: boolean } | null>(null)
  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    drag.current = { y: e.clientY, done: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.done || e.clientY - d.y < 28) return
    d.done = true
    onPull()
  }
  return (
    <button
      className="sl-handle"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onClick={() => {
        // A drag already pulled it.
        if (drag.current?.done) {
          drag.current = null
          return
        }
        drag.current = null
        onPull()
      }}
      disabled={disabled}
      aria-label="Pull the handle"
      title="Pull the handle (S or Space)"
    >
      <span className="sl-handle__arm" key={pulls} data-pulled={pulls > 0 || undefined}>
        <span className="sl-handle__knob" />
      </span>
      <span className="sl-handle__hub" />
    </button>
  )
}

// ---- Your machine ------------------------------------------------------------------

interface YourMachineProps {
  id: MachineId
  name: string
  rules: Rules
  pull: Pull | null
  coins: number
  caps: number
  meter: number | null
  /** A jackpot is showing on this machine. */
  jackpot: boolean
  /** Your pull is on its way to the table and back. */
  waiting: boolean
  onBetOne: () => void
  onBetMax: () => void
  onPull: () => void
  /** Bumped by every pull you make, to swing the handle. */
  handlePulls: number
  children?: ReactNode
}

export function YourMachine(props: YourMachineProps) {
  const { id, name, rules, pull, coins, caps, meter, jackpot, waiting } = props
  const turning = waiting || (!!pull && !pull.settled)
  const won = pull?.settled ? pull.spin : null
  const paidCoins = won ? Math.floor(won.paid / rules.coin) : 0
  const rolled = useRollup(paidCoins, won && won.paid > 0 ? pull!.id : null)
  // The credits meter climbs with the winner-paid meter, though the caps are already yours.
  const unrolled = won ? won.paid - rolled * rules.coin : 0
  const credits = Math.max(0, Math.floor((caps - (rolled < paidCoins ? unrolled : 0)) / rules.coin))
  return (
    <section className="sl-cabinet is-yours" data-machine={id} aria-label={`Your machine: ${name}`}>
      <Marquee name={name} meter={meter} jackpot={jackpot} />
      <PayGlass rules={rules} coins={coins} lit={won?.win ? won.win.pay : null} />
      <div className="sl-window-frame">
        <ReelWindow rules={rules} pull={pull} seed={7} showWin />
      </div>
      <div className="sl-meters" aria-live="polite">
        <Meter label="Credits" value={credits} />
        <Meter label="Bet" value={coins} className="sl-meter--bet" />
        <Meter label="Winner paid" value={won ? rolled : 0} className="sl-meter--paid" />
      </div>
      <div className="sl-deck">
        <button className="sl-key-button" onClick={props.onBetOne} disabled={turning} title="Add a coin (B, or 1 to 3)">
          Bet one
        </button>
        <button className="sl-key-button" onClick={props.onBetMax} disabled={turning} title="Three coins, and spin (M)">
          Bet max
        </button>
        <button className="sl-key-button sl-key-button--spin" onClick={props.onPull} disabled={turning} aria-describedby="sl-help">
          Spin <span className="sl-key">S</span>
        </button>
      </div>
      <Handle pulls={props.handlePulls} onPull={props.onPull} disabled={turning} />
      {props.children}
    </section>
  )
}

// ---- A machine beside yours ------------------------------------------------------------

interface NeighborProps {
  id: MachineId
  name: string
  rules: Rules
  pull: Pull | null
  /** Coins in on their machine. */
  coins: number
  meter: number | null
  jackpot: boolean
  seed: number
  /** Their name plate. */
  plate: ReactNode
  empty?: boolean
}

export function NeighborMachine({ id, name, rules, pull, coins, meter, jackpot, seed, plate, empty }: NeighborProps) {
  const won = pull?.settled ? pull.spin : null
  return (
    <section className={`sl-cabinet is-neighbor${empty ? ' is-empty' : ''}`} data-machine={id}>
      <Marquee name={name} meter={meter} jackpot={jackpot} small />
      <div className="sl-neighbor-glass" aria-hidden="true">
        <PayGlass rules={rules} coins={coins} lit={won?.win ? won.win.pay : null} />
      </div>
      <div className="sl-window-frame">
        <ReelWindow rules={rules} pull={pull} seed={seed} showWin />
      </div>
      <span className="sl-handle sl-handle--still" aria-hidden="true">
        <span className="sl-handle__arm" key={pull?.id ?? 0} data-pulled={(pull && !pull.settled) || undefined}>
          <span className="sl-handle__knob" />
        </span>
        <span className="sl-handle__hub" />
      </span>
      {plate}
    </section>
  )
}

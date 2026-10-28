/**
 * The layout on the felt: the numbers, the zeros and the outside bets
 * printed in gold, with a button for every bet, everyone's chips in their
 * own colors, the dolly on the last number, and the payouts.
 *
 * Everything is placed in layout units from layout.ts (a number's box is
 * one unit square); roulette.css turns them into pixels with --u.
 */

import { type CSSProperties, type FocusEvent, Fragment, type PointerEvent, memo } from 'react'
import { paysText, spotName } from '../content'
import { type Bets, type Pocket, type Spot, type TableEvent, type WheelKind, activeSpots, colorOf, pocketName, spotInfo } from '../engine'
import { type Geometry, type Point, type Rect } from './layout'
import type { Settled } from './session'

/** Someone's chips on the layout, in their color. */
export interface Hand {
  key: string
  color: string
  bets: Bets
}

interface Props {
  wheel: WheelKind
  geo: Geometry
  /** Your chips. */
  mine: Hand
  /** Everyone else's: the regulars, or friends online. */
  others: Hand[]
  settled: Settled | null
  /** Where the ball came to rest, for the dolly. Null while it's rolling. */
  dolly: Pocket | null
  rolling: boolean
  takingDown: boolean
  /** Bets on the lines can be clicked: a mouse. On a touch screen, tapping a number opens the chooser instead. */
  precise: boolean
  /** Numbers to light: what the bet you're pointing at covers. */
  lit: ReadonlySet<Pocket>
  /** Bets the guide lights up. */
  advised: ReadonlySet<Spot>
  onBet: (spot: Spot) => void
  onFocus: (spot: Spot | null) => void
  /** Open the chooser on a number. */
  onChoose: (pocket: Pocket) => void
}

/** Absolute position on the felt, in layout units. */
const at = (p: Point): CSSProperties => ({ '--x': p.x, '--y': p.y }) as CSSProperties
const box = (r: Rect): CSSProperties => ({ '--x': r.x, '--y': r.y, '--w': r.w, '--h': r.h }) as CSSProperties
/** Just above a point, clear of the dolly. */
const above = (p: Point): Point => ({ x: p.x, y: p.y - 0.6 })
/** How far something travels to get here from `origin`, in layout units. */
const from = (p: Point, origin: Point, name = 'f'): CSSProperties => ({ [`--${name}x`]: origin.x - p.x, [`--${name}y`]: origin.y - p.y }) as CSSProperties

export function Felt(props: Props) {
  const { wheel, geo, mine, others, settled, dolly, rolling, takingDown, precise, lit, advised, onBet, onFocus, onChoose } = props
  const amountOn = (spot: Spot) => mine.bets[spot] ?? 0
  const label = (spot: Spot) => {
    const mineOn = amountOn(spot)
    return `${spotName(wheel, spot)}, pays ${paysText(wheel, spot)}${mineOn ? `. ${mineOn.toLocaleString()} caps of yours on it` : ''}`
  }
  const pointer = (spot: Spot) => ({
    onPointerEnter: (e: PointerEvent) => e.pointerType === 'mouse' && onFocus(spot),
    onPointerLeave: (e: PointerEvent) => e.pointerType === 'mouse' && onFocus(null),
    // A keyboard's focus, not the focus a tap leaves behind.
    onFocus: (e: FocusEvent) => e.currentTarget.matches(':focus-visible') && onFocus(spot),
  })
  const open = (spot: Spot) => (takingDown ? amountOn(spot) > 0 : true)

  return (
    <div className="rl-felt" role="region" aria-label="Roulette layout" data-orientation={geo.orientation} style={{ '--fw': geo.w, '--fh': geo.h } as CSSProperties}>
      <FeltArt wheel={wheel} geo={geo} />

      {geo.cells.map(({ pocket, rect }) => {
        const spot = `straight-${pocketName(pocket)}`
        return (
          <button
            key={spot}
            className={`rl-cell${lit.has(pocket) ? ' is-lit' : ''}${open(spot) ? ' is-open' : ''}`}
            data-spot={spot}
            data-color={colorOf(pocket)}
            style={box(rect)}
            aria-disabled={rolling || undefined}
            aria-haspopup={precise ? undefined : 'dialog'}
            aria-label={precise ? label(spot) : `${pocketName(pocket)}, ${colorOf(pocket)}. Bets on ${pocketName(pocket)}`}
            {...pointer(spot)}
            onClick={() => {
              if (rolling) return
              if (precise) onBet(spot)
              else onChoose(pocket)
            }}
            onKeyDown={(e) => {
              // Shift+Enter offers every bet on the number, as a tap does.
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                onChoose(pocket)
              }
            }}
            onContextMenu={(e) => {
              if (!precise) return
              e.preventDefault()
              onChoose(pocket)
            }}
          />
        )
      })}

      {geo.boxes.map(({ spot, rect }) => (
        <button
          key={spot}
          className={`rl-box${advised.has(spot) ? ' is-advised' : ''}${open(spot) ? ' is-open' : ''}`}
          data-spot={spot}
          style={box(rect)}
          aria-disabled={rolling || undefined}
          aria-label={label(spot)}
          {...pointer(spot)}
          onClick={() => !rolling && onBet(spot)}
        />
      ))}

      {precise &&
        geo.zones.map(({ spot, rect }) => (
          <button
            key={spot}
            className={`rl-zone${open(spot) ? ' is-open' : ''}`}
            data-spot={spot}
            style={box(rect)}
            tabIndex={-1}
            aria-disabled={rolling || undefined}
            aria-label={label(spot)}
            {...pointer(spot)}
            onClick={() => !rolling && onBet(spot)}
          />
        ))}

      {others.map((hand, j) => (
        <Stacks key={hand.key} hand={hand} geo={geo} nudge={j + 1} />
      ))}
      <Stacks hand={mine} geo={geo} nudge={0} labelled />

      {dolly !== null && <Dolly key={`dolly-${settled?.id ?? 0}`} place={geo.chipAt(`straight-${pocketName(dolly)}`)} />}
      {settled && dolly !== null && <Ghosts key={`ghosts-${settled.id}`} settled={settled} geo={geo} mine={mine.color} />}
      {settled?.decided && dolly !== null && <Burst key={`burst-${settled.id}`} net={settled.net} place={above(geo.chipAt(`straight-${pocketName(dolly)}`))} />}
    </div>
  )
}

/** The printed layout: red and black boxes in a gold frame, the zeros in green, the outside bets on the felt. */
const FeltArt = memo(function FeltArt({ wheel, geo }: { wheel: WheelKind; geo: Geometry }) {
  const french = wheel === 'french'
  const OUTSIDE_LABEL: Record<string, string> = french
    ? { 'dozen-1': '12 P', 'dozen-2': '12 M', 'dozen-3': '12 D', low: 'Manque', even: 'Pair', odd: 'Impair', high: 'Passe' }
    : { 'dozen-1': '1st 12', 'dozen-2': '2nd 12', 'dozen-3': '3rd 12', low: '1 to 18', even: 'Even', odd: 'Odd', high: '19 to 36' }
  const tall = geo.orientation === 'tall'
  return (
    <svg className="rl-felt__art" viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
      {geo.cells.map(({ pocket, rect }) => (
        <g key={pocket}>
          <rect className="rl-art__cell" data-color={colorOf(pocket)} x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
          <text
            className="rl-art__number"
            x={rect.x + rect.w / 2}
            y={rect.y + rect.h / 2}
            // Across the table, the zeros read along their long side.
            transform={!tall && pocket === 0 && wheel !== 'american' ? `rotate(-90 ${rect.x + rect.w / 2} ${rect.y + rect.h / 2})` : undefined}
          >
            {pocketName(pocket)}
          </text>
        </g>
      ))}
      {geo.boxes.map(({ spot, rect }) => {
        const cx = rect.x + rect.w / 2
        const cy = rect.y + rect.h / 2
        const kind = spotInfo(wheel, spot)!.kind
        const sideways = tall && kind !== 'column'
        return (
          <g key={spot}>
            <rect className="rl-art__box" x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
            {kind === 'red' || kind === 'black' ? (
              <path
                className="rl-art__diamond"
                data-color={kind}
                d={
                  sideways
                    ? `M${cx} ${cy - 0.62}L${cx + 0.27} ${cy}L${cx} ${cy + 0.62}L${cx - 0.27} ${cy}Z`
                    : `M${cx - 0.62} ${cy}L${cx} ${cy - 0.27}L${cx + 0.62} ${cy}L${cx} ${cy + 0.27}Z`
                }
              />
            ) : (
              <text className={`rl-art__label${kind === 'column' ? ' is-column' : ''}`} x={cx} y={cy} transform={sideways ? `rotate(-90 ${cx} ${cy})` : undefined}>
                {kind === 'column' ? '2 to 1' : OUTSIDE_LABEL[spot]}
              </text>
            )}
          </g>
        )
      })}
      <Emblem rect={geo.emblem} />
      {/* The frame: a gold rule round the layout. */}
      <rect className="rl-art__frame" x={0.06} y={0.06} width={geo.w - 0.12} height={geo.h - 0.12} rx={0.14} />
    </svg>
  )
})

/** The salon's mark in the spare corner: a gold fan over a monogram. */
function Emblem({ rect }: { rect: Rect }) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const r = Math.min(rect.w, rect.h) * 0.38
  return (
    <g className="rl-art__emblem">
      {Array.from({ length: 7 }, (_, i) => {
        const a = Math.PI + (i * Math.PI) / 6
        return <path key={i} d={`M${cx} ${cy}L${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`} />
      })}
      <path d={`M${cx - r * 0.55} ${cy}A${r * 0.55} ${r * 0.55} 0 0 1 ${cx + r * 0.55} ${cy}`} />
      <text x={cx} y={cy + r * 0.55}>
        R
      </text>
    </g>
  )
}

/** How many chips tall a stack is: one per doubling, a few at most. */
const chipsIn = (amount: number, base: number) => Math.max(1, Math.min(6, 1 + Math.floor(Math.log2(Math.max(1, amount / base)) / 1.4)))

/** One player's chips, a stack on each bet. Others' stacks sit a little to the side of yours, so both show. */
function Stacks({ hand, geo, nudge, labelled = false }: { hand: Hand; geo: Geometry; nudge: number; labelled?: boolean }) {
  const spots = activeSpots(hand.bets)
  const base = Math.min(...spots.map((s) => hand.bets[s] ?? 1))
  const shift = { x: nudge * 0.13, y: -nudge * 0.1 }
  return (
    <>
      {spots.map((spot) => {
        const amount = hand.bets[spot] ?? 0
        const p = geo.chipAt(spot)
        return <ChipStack key={spot} amount={amount} chips={chipsIn(amount, base)} color={hand.color} place={{ x: p.x + shift.x, y: p.y + shift.y }} label={labelled} className={labelled ? 'is-mine' : ''} />
      })}
    </>
  )
}

interface StackProps {
  amount: number
  chips: number
  color: string
  place: Point
  label?: boolean
  className?: string
  style?: CSSProperties
}

/** A stack of wheel chips: plain chips in a player's color, with the amount on top of yours. */
function ChipStack({ amount, chips, color, place, label = false, className = '', style }: StackProps) {
  return (
    <div className={`rl-stack ${className}`} style={{ ...at(place), '--c': color, ...style } as CSSProperties} aria-hidden="true">
      {Array.from({ length: chips }, (_, i) => (
        <div key={i} className="rl-chip" style={{ '--i': i } as CSSProperties}>
          {label && i === chips - 1 && <span className="rl-chip__amount">{amount >= 10_000 ? `${Math.round(amount / 1000)}K` : amount}</span>}
        </div>
      ))}
    </div>
  )
}

/** The dolly: a brass marker the croupier sets on the number that came up. */
function Dolly({ place }: { place: Point }) {
  return (
    <div className="rl-dolly" style={at(place)} aria-hidden="true">
      <svg viewBox="-10 -16 20 22">
        <ellipse cx="0" cy="3.5" rx="8" ry="2.6" fill="rgba(0, 0, 0, 0.4)" />
        <path d="M-6 2.5 Q0 4.8 6 2.5 L4 -2 Q0 -0.6 -4 -2Z" fill="url(#rl-dolly-brass)" />
        <path d="M-2.4 -2 L-1.6 -9 L1.6 -9 L2.4 -2Z" fill="url(#rl-dolly-brass)" />
        <circle cy="-11.5" r="3.6" fill="url(#rl-dolly-brass)" />
        <defs>
          <linearGradient id="rl-dolly-brass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1c0" />
            <stop offset="0.5" stopColor="#d8b058" />
            <stop offset="1" stopColor="#7a5517" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

/**
 * What the spin did to everyone's chips, played out on the felt: winnings
 * pushed out from the croupier beside each winning bet, and lost bets swept
 * back to the wheel. Yours carry on to your seat; la partage's half too.
 */
function Ghosts({ settled, geo, mine }: { settled: Settled; geo: Geometry; mine: string }) {
  const hands = [{ color: mine, events: settled.events, yours: true }, ...settled.others.map((o) => ({ ...o, yours: false }))]
  return (
    <>
      {hands.map((hand, h) =>
        hand.events.map((e: TableEvent, i) => {
          const key = `${h}-${i}`
          if (e.type === 'won') {
            const p = geo.chipAt(e.spot)
            const beside = { x: p.x + 0.36, y: p.y - 0.06 }
            return <ChipStack key={key} amount={e.paid} chips={Math.min(6, 2 + Math.floor(Math.log2(e.paid / e.bet + 1)))} color={hand.color} place={beside} className={hand.yours ? 'is-paid is-yours' : 'is-paid'} style={{ ...from(beside, geo.house), ...from(beside, geo.seat, 'r') }} />
          }
          if (e.type === 'lost' || e.type === 'halved') {
            const p = geo.chipAt(e.spot)
            return (
              <Fragment key={key}>
                <ChipStack amount={e.bet} chips={2} color={hand.color} place={p} className="is-taken" style={from(p, geo.house, 'r')} />
                {e.type === 'halved' && hand.yours && <ChipStack amount={e.back} chips={1} color={hand.color} place={p} className="is-back" style={from(p, geo.seat, 'r')} />}
              </Fragment>
            )
          }
          return null
        }),
      )}
    </>
  )
}

/** Your result for the spin, rising off the number. */
function Burst({ net, place }: { net: number; place: Point }) {
  return (
    <div className={`rl-burst${net > 0 ? ' is-up' : net < 0 ? ' is-down' : ''}`} style={at(place)} aria-hidden="true">
      {net > 0 ? `+${net.toLocaleString()}` : net < 0 ? `−${(-net).toLocaleString()}` : '±0'}
    </div>
  )
}

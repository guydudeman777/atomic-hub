import { type CSSProperties, type ReactNode, type RefObject, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Card, cardName } from '../../../core/cards'
import { PlayingCard } from '../../../components/PlayingCard'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { playSfx } from '../../../core/audio/sfx'
import { evaluate, scoreOf, valueOf } from '../../../core/poker'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { spoken } from '../banter'
import { type Table as TableInfo, YOUR_SEAT } from '../content'
import {
  type BetAction,
  type DrawState,
  DECK_SET,
  actor,
  betSize,
  betweenHands,
  legalActions,
  maxDiscards,
  owed,
  potTotal,
} from '../engine'
import { type DrawPlan, bookDraw } from '../strategy'
import { ChipStack } from './Chip'
import { Felt } from './Felt'
import { type Layout, type Pin, type Point, WIDE_LAYOUT, tallLayout } from './layout'
import { RulesText } from './Rules'
import { type Flight, type Move, type Occupant, type Remark, type Toss, useSession, yourStake, youreIn } from './session'

/**
 * Phones and small windows get the compact table in draw.css, whose media
 * queries match this one: the HUD keeps its log and table controls behind a
 * Menu button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 520px)'

/** Held upright, a phone gets the tall table (layout.ts). Keep in step with draw.css. */
const TALL_TABLE = '(max-width: 900px) and (orientation: portrait)'

/** The table's shape and where everything sits on it, for every piece on the felt. */
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

/** How long the dealer and the regulars take over each step, in ms. Quicker once you're out of the hand. */
function pace(state: DrawState, watching: boolean): number {
  switch (state.phase) {
    case 'dealing':
      return state.dealtCount === 0 ? 650 : 100
    case 'betting':
      return watching ? 420 : 700
    case 'drawing':
      return watching ? 500 : 800
    case 'showdown':
      return 900
    default:
      return 0
  }
}

export function Table() {
  const { sitting, state, table } = useSession()
  const step = useSession((s) => s.step)

  // No seat? Back to the lobby.
  useEffect(() => {
    if (!state || !table) navigate('/draw')
  }, [state, table])

  // The dealer and the regulars take their turns after a beat.
  useEffect(() => {
    if (!state) return
    const who = actor(state)
    if (who === null || who === YOUR_SEAT) return
    const t = window.setTimeout(step, pace(state, !youreIn(state)))
    return () => window.clearTimeout(t)
  }, [state, step])

  if (!state || !table) return null
  return <TableView key={sitting} />
}

// ---------------------------------------------------------------------------

function TableView() {
  const { state, table, seats, talk, call, result, flights, tosses, moves, marked, config } = useSession()
  const caps = useSave((s) => s.wallet.caps)
  const hints = useSave((s) => s.draw.hints)
  const { bet, deal, mark, draw, markOnly } = useSession.getState()
  // The shuffle as you sit down. (Deferred so a StrictMode double mount doesn't play it twice.)
  useEffect(() => {
    const t = window.setTimeout(() => playSfx('shuffle'), 200)
    return () => window.clearTimeout(t)
  }, [])

  const s = state!
  const n = s.seats.length
  const you = s.seats[YOUR_SEAT]
  const yourTurn = actor(s) === YOUR_SEAT
  const yourDraw = yourTurn && s.phase === 'drawing'
  const book = yourDraw && hints && you ? bookDraw(you.cards) : null
  const legal = new Set(yourTurn && s.phase === 'betting' ? legalActions(s).map((a) => a.type) : [])
  const between = betweenHands(s)

  // Keyboard: F C B R to bet, 1–5 pick cards, D draws, Enter deals or checks and calls, Backspace clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role="dialog"]')) return
      const key = e.key.toLowerCase()
      const onButton = !!target.closest('button')
      if (yourTurn && s.phase === 'betting') {
        if (key === 'f' && legal.has('fold')) bet('fold')
        else if (key === 'c' || (key === 'enter' && !onButton)) bet(legal.has('check') ? 'check' : 'call')
        else if ((key === 'b' || key === 'r') && (legal.has('bet') || legal.has('raise'))) bet(legal.has('bet') ? 'bet' : 'raise')
        else return
      } else if (yourDraw) {
        const k = Number(key)
        if (k >= 1 && k <= 5) mark(you!.cards[k - 1].id)
        else if (key === 'd' || (key === 'enter' && !onButton)) draw()
        else if (key === 'backspace') markOnly([])
        else return
      } else if (between && key === 'enter' && !onButton) deal()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The tall table is as deep as the stage is tall for its width. Tilted
  // (draw-3d.css), it stands a little shorter than it's deep, so the same depth fits.
  const stageRef = useRef<HTMLDivElement>(null)
  const aspect = useAspect(stageRef)
  const tall = useMediaQuery(TALL_TABLE)
  const layout = tall ? tallLayout(aspect * 1000) : WIDE_LAYOUT
  const { shape } = layout
  const speaker = talk && talk.seat !== 'dealer' ? seats[talk.seat] : null

  return (
    <div className="dw-game">
      <div className="dw-board">
        <DealerBar name={table!.dealer.name} call={call} table={table!} />

        <div className="dw-stage" ref={stageRef}>
          <div className="dw-felt" role="region" aria-label="Poker table" data-shape={shape.name} style={{ '--felt-h': shape.h, '--scale': layout.scale } as CSSProperties}>
            <LayoutContext.Provider value={layout}>
              <Felt shape={shape} />
              <Deck state={s} />
              <Pot state={s} />
              {s.seats.map((_, seat) => (
                <SeatView
                  key={seat}
                  seat={seat}
                  state={s}
                  occupant={seats[seat] ?? null}
                  move={moves[seat] ?? null}
                  caps={caps}
                  talk={talk?.seat === seat && !shape.talk ? talk : null}
                  open={seat !== YOUR_SEAT && !seats[seat] && (config?.opponents ?? 0) > 0}
                  marked={seat === YOUR_SEAT ? marked : []}
                  book={seat === YOUR_SEAT ? book : null}
                  onCard={yourDraw && seat === YOUR_SEAT ? mark : undefined}
                />
              ))}
              {flights.map((f) => (
                <FlyingChips key={f.id} flight={f} n={n} />
              ))}
              {tosses.map((t) => (
                <Tossed key={t.id} toss={t} n={n} />
              ))}
              {/* On the tall table the regulars' remarks go in the open felt, with the speaker's name. */}
              {shape.talk && (
                <SpeechBubble name={speaker?.regular.name ?? ''} remark={talk} className="dw-talk--table" style={at(shape.talk)} named />
              )}
              {result && between && <ResultBurst key={s.hand} committed={result.committed} won={result.won} />}
            </LayoutContext.Provider>
          </div>
        </div>

        <Controls state={s} table={table!} caps={caps} legal={legal} marked={marked} book={book} />
      </div>

      <Hud book={book} />
    </div>
  )
}

// ---- The dealer --------------------------------------------------------------

function DealerBar({ name, call, table }: { name: string; call: Remark | null; table: TableInfo }) {
  const { ante, small, big } = table.stakes
  return (
    <div className="dw-dealer-bar">
      <div className="dw-dealer-bar__who">
        <span className="dw-portrait dw-portrait--dealer" aria-hidden="true">
          {name.replace('Mr. ', '').slice(0, 1)}
        </span>
        <span className="dw-dealer-bar__name">{name}</span>
        <SpeechBubble name={name} remark={call} className="dw-talk--dealer" />
      </div>
      <div className="dw-placard" aria-label={`${table.name}: ante ${ante}, bets ${small} and ${big}`}>
        <span className="dw-placard__table">{table.name}</span>
        <span className="dw-placard__limits">
          {ante} · {small}/{big}
        </span>
      </div>
    </div>
  )
}

/** The deck by the pot, and the muck across from it. */
function Deck({ state }: { state: DrawState }) {
  const { shape } = useLayout()
  const mucked = state.discards.length + state.seats.reduce((k, s) => k + (s?.folded ? s.cards.length : 0), 0)
  const left = state.hand === 0 ? 52 : state.stock.length
  return (
    <>
      <div className="dw-deck" style={{ ...at(shape.deck), '--n': Math.ceil(left / 6) } as CSSProperties} title={`${left} cards in the deck`}>
        <PlayingCard faceDown set={DECK_SET} />
      </div>
      {mucked > 0 && !betweenHands(state) && (
        <div className="dw-muck" style={at(shape.muck)} title={`${mucked} cards in the muck`} aria-hidden="true">
          {Array.from({ length: Math.min(5, Math.ceil(mucked / 3)) }, (_, i) => (
            <div key={i} className="dw-muck__card" style={{ '--i': i } as CSSProperties}>
              <PlayingCard faceDown set={DECK_SET} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** What's in the middle: everything but this round's bets, which wait in front of each player. */
function Pot({ state }: { state: DrawState }) {
  const { shape } = useLayout()
  const paid = state.phase === 'complete' && state.payouts ? state.payouts.reduce((n, p) => n + p.amount, 0) : 0
  const middle = paid || potTotal(state) - state.seats.reduce((n, s) => n + (s?.inHand ? s.roundBet : 0), 0)
  if (state.hand === 0 || middle <= 0) return null
  return (
    <div className={`dw-pot${paid ? ' is-paid' : ''}`} style={at(shape.pot)}>
      <ChipStack amount={middle} className="dw-felt-stack" title={`Pot of ${middle} caps`} />
      <span className="dw-pot__label">Pot {middle.toLocaleString()}</span>
    </div>
  )
}

// ---- Seats -------------------------------------------------------------------------

interface SeatProps {
  seat: number
  state: DrawState
  occupant: Occupant | null
  move: Move | null
  caps: number
  talk: Remark | null
  /** An empty chair, waiting for someone new. */
  open: boolean
  /** Your cards picked to throw away. */
  marked: readonly string[]
  /** The book's draw, while it's yours and hints are on. */
  book: DrawPlan | null
  onCard?: (cardId: string) => void
}

function SeatView({ seat, state, occupant, move, caps, talk, open, marked, book, onCard }: SeatProps) {
  const { plateOf, betOf, buttonOf, cardOf, sideOf, handNameOf, drewOf } = useLayout()
  const n = state.seats.length
  const s = state.seats[seat]
  const you = seat === YOUR_SEAT
  const plate = plateOf(seat, n)
  const side = sideOf(seat, n)
  if (!s) {
    return open ? (
      <div className={`dw-plate is-open dw-plate--${side}`} data-hang={plate.hang} style={pinned(plate)}>
        <span className="dw-plate__name">Open seat</span>
      </div>
    ) : null
  }
  const name = you ? 'You' : (occupant?.regular.name ?? '')
  const acting = actor(state) === seat
  const won = state.payouts?.some((p) => p.seat === seat) ?? false
  const showing = s.inHand && !s.folded && s.cards.length === 5 && (s.shown || you)
  const value = showing ? valueOf(scoreOf(s.cards)) : null
  const label = value && (s.shown || you) ? spoken(value) : null
  const stack = you ? caps : s.stack

  return (
    <>
      {s.inHand &&
        s.cards.map((card, k) => (
          <TableCard
            key={card.id}
            card={card}
            place={cardOf(seat, n, k)}
            depth={k}
            you={you}
            faceDown={!you && !s.shown}
            folded={s.folded}
            marked={marked.includes(card.id)}
            keep={!!book && book.keep.includes(card)}
            onClick={onCard && !s.folded ? () => onCard(card.id) : undefined}
            index={k}
          />
        ))}
      {s.inHand && s.roundBet > 0 && <Stack amount={s.roundBet} place={betOf(seat, n)} from={landing(plate)} />}
      {state.hand > 0 && state.button === seat && (
        <div className="dw-dealer-chip" style={at(buttonOf(seat, n))} title="The button">
          D
        </div>
      )}
      {s.inHand && !s.folded && s.drew !== null && !you && (
        <div className="dw-drew" style={pinned(drewOf(seat, n))}>
          {s.drew === 0 ? 'Pat' : `Drew ${s.drew}`}
        </div>
      )}
      {label && !you && (
        <div className={`dw-hand-name${won ? ' is-won' : ''}`} data-hang={handNameOf(seat, n).hang} style={pinned(handNameOf(seat, n))}>
          {label}
        </div>
      )}
      <div
        key={occupant?.regular.id ?? 'you'}
        className={`dw-plate dw-plate--${side}${acting ? ' is-acting' : ''}${you ? ' is-you' : ''}${s.folded ? ' is-folded' : ''}${occupant?.leaving ? ' is-leaving' : ''}`}
        data-hang={plate.hang}
        style={pinned(plate)}
      >
        {!you && occupant && <span className="dw-portrait" style={{ background: occupant.regular.color }} aria-hidden="true" />}
        <span className="dw-plate__name">{name}</span>
        <span className="dw-plate__stack">
          {stack.toLocaleString()}
          <span className="visually-hidden"> caps</span>
        </span>
        {/* Your hand's name rides on your plate, clear of your cards. */}
        {you && label && <span className={`dw-plate__hand${won && s.shown ? ' is-won' : ''}`}>{label}</span>}
        {move && (
          <span key={move.id} className={`dw-move${move.tone ? ` is-${move.tone}` : ''}`}>
            {move.text}
          </span>
        )}
      </div>
      {!you && occupant && <SpeechBubble name={occupant.regular.name} remark={talk} className={`dw-talk--seat dw-talk--${side}`} style={pinned(plate)} />}
    </>
  )
}

// ---- Things on the felt -------------------------------------------------------------

/** Absolute position on the felt, in felt units. */
const at = (p: { x: number; y: number; rot?: number }): CSSProperties => ({ '--x': p.x, '--y': p.y, '--r': `${p.rot ?? 0}deg` }) as CSSProperties

/** A label's point and its offset from it, which grows with the cards (draw.css). */
const pinned = (p: Pin): CSSProperties => ({ ...at(p), '--dx': p.dx, '--dy': p.dy }) as CSSProperties

/** Roughly where a pinned label ends up, for things that travel to it. */
const landing = (p: Pin): Point => ({ x: p.x + p.dx, y: p.y + p.dy + (p.hang === 'below' ? 12 : 0) })

/** How far something travels to get here from `origin`, for animations in the felt's frame. */
const from = (p: Point, origin: Point): CSSProperties => ({ '--fx': origin.x - p.x, '--fy': origin.y - p.y }) as CSSProperties

interface CardProps {
  card: Card
  place: { x: number; y: number; rot: number }
  depth: number
  you: boolean
  faceDown: boolean
  /** Folded: the cards go to the muck. */
  folded: boolean
  /** Picked to throw away. */
  marked: boolean
  /** One the book keeps. */
  keep: boolean
  onClick?: () => void
  index: number
}

/**
 * A card on the felt. It slides out of the deck and turns over as it lands
 * if it's yours; the regulars' stay face down, with no face in the page,
 * until the showdown turns them.
 */
function TableCard({ card, place, depth, you, faceDown, folded, marked, keep, onClick, index }: CardProps) {
  const { shape, cardW } = useLayout()
  const muck = { '--mx': shape.muck.x - place.x, '--my': shape.muck.y - place.y } as CSSProperties
  const style = { ...at(place), ...from(place, shape.deck), ...muck, '--k': depth, '--w': cardW(you ? YOUR_SEAT : 1) } as CSSProperties
  const className = `dw-card${you ? ' is-yours' : ''}${folded ? ' is-folded' : ''}${marked ? ' is-marked' : ''}${keep ? ' is-keep' : ''}`
  const inner = (
    <div className="dw-flip">
      <div className="dw-flip__face">{faceDown ? null : <PlayingCard card={card} />}</div>
      <div className="dw-flip__back" aria-hidden={!faceDown}>
        <PlayingCard faceDown set={DECK_SET} />
      </div>
    </div>
  )
  if (onClick) {
    return (
      <button
        className={className}
        data-down={faceDown || undefined}
        style={style}
        onClick={onClick}
        aria-pressed={marked}
        aria-label={`Throw away the ${cardName(card)}`}
        title={`Key ${index + 1}`}
      >
        {inner}
        {marked && <span className="dw-card__tag">Discard</span>}
        {keep && !marked && <span className="dw-card__tag is-keep">Keep</span>}
      </button>
    )
  }
  return (
    <div className={className} data-down={faceDown || undefined} style={style}>
      {inner}
    </div>
  )
}

/** Chips on the felt, pushed out from the player's plate. */
function Stack({ amount, place, from: origin }: { amount: number; place: Point; from: Point }) {
  return <ChipStack amount={amount} className="dw-felt-stack is-pushed" style={{ ...at(place), ...from(place, origin) }} />
}

/** Bets swept into the pot, or a pot pushed to its winner. */
function FlyingChips({ flight, n }: { flight: Flight; n: number }) {
  const { shape, betOf, plateOf } = useLayout()
  // Antes go from the plate; bets from where they sat; the pot goes to the winner's plate.
  const origin = flight.from === 'pot' ? shape.pot : flight.delay === 0 ? landing(plateOf(flight.from, n)) : betOf(flight.from, n)
  const target = flight.to === 'pot' ? shape.pot : landing(plateOf(flight.to, n))
  return (
    <ChipStack
      amount={flight.amount}
      className="dw-felt-stack is-flying"
      style={{ ...at(target), ...from(target, origin), animationDelay: `${flight.delay}ms` } as CSSProperties}
    />
  )
}

/** Cards thrown away, sliding from where they were to the muck. */
function Tossed({ toss, n }: { toss: Toss; n: number }) {
  const { shape, cardOf, cardW } = useLayout()
  return (
    <>
      {toss.cards.map(({ card, slot }) => {
        const place = cardOf(toss.seat, n, slot)
        return (
          <div
            key={card.id}
            className="dw-card is-tossed"
            style={{ ...at(place), '--mx': shape.muck.x - place.x, '--my': shape.muck.y - place.y, '--k': slot, '--w': cardW(toss.seat) } as CSSProperties}
            aria-hidden="true"
          >
            <PlayingCard faceDown set={DECK_SET} />
          </div>
        )
      })}
    </>
  )
}

/** Your result for the hand, rising off your cards. */
function ResultBurst({ committed, won }: { committed: number; won: number }) {
  const net = won - committed
  const { shape } = useLayout()
  return (
    <div className={`dw-burst${net > 0 ? ' is-up' : net < 0 ? ' is-down' : ''}`} style={at({ x: shape.you.hand.x, y: shape.you.hand.y - shape.yourCardW * 0.4 })} aria-hidden="true">
      {net > 0 ? `+${net}` : net < 0 ? `−${-net}` : 'Even'}
    </div>
  )
}

// ---- Talk -------------------------------------------------------------------------

/** Long enough to read the line twice at a relaxed pace. */
const readingTime = (text: string) => Math.min(6000, Math.max(2400, 1500 + text.length * 55))

interface BubbleProps {
  name: string
  remark: Remark | null
  className: string
  style?: CSSProperties
  /** Show who's talking, for a bubble that isn't beside them. */
  named?: boolean
}

/** The latest remark, shown once the cards land and faded after a while. A newer one replaces it. */
function SpeechBubble({ name, remark, className, style, named = false }: BubbleProps) {
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
    <div className={`dw-talk ${className}`} style={style} aria-live="polite">
      {visible && (
        <p key={remark.id} className="dw-talk__bubble" style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          {named ? (
            <>
              <strong className="dw-talk__name">{name}</strong>
              <span className="visually-hidden"> says:</span>{' '}
            </>
          ) : (
            <span className="visually-hidden">{name} says: </span>
          )}
          {remark.text}
        </p>
      )}
    </div>
  )
}

// ---- Your controls -----------------------------------------------------------------

const COUNT = ['', 'one', 'two', 'three', 'four']

interface ControlsProps {
  state: DrawState
  table: TableInfo
  caps: number
  legal: Set<string>
  marked: readonly string[]
  book: DrawPlan | null
}

function Controls({ state, table, caps, legal, marked, book }: ControlsProps) {
  const { bet, deal, draw, markOnly, leave } = useSession.getState()
  const yourTurn = actor(state) === YOUR_SEAT
  const you = state.seats[YOUR_SEAT]

  if (betweenHands(state)) {
    if (caps < table.stakes.ante) {
      return (
        <div className="dw-controls dw-controls--broke">
          <p>You need {table.stakes.ante} caps to ante here and you have {caps}. Claim a refill from the hub menu once you’re under 50.</p>
          <button className="dw-button" onClick={() => void navigate('/draw', { during: leave })}>
            Back to the tables
          </button>
        </div>
      )
    }
    return (
      <div className="dw-controls">
        <p className="dw-controls__note">
          Ante {table.stakes.ante}. Bets {table.stakes.small}, then {table.stakes.big} after the draw.
        </p>
        <div className="dw-controls__buttons">
          <button className="dw-button dw-button--primary" onClick={() => deal()}>
            {state.hand === 0 ? 'Deal' : 'Deal the next hand'} <span className="dw-key">Enter</span>
          </button>
        </div>
      </div>
    )
  }

  if (!youreIn(state)) {
    return (
      <div className="dw-controls">
        <p className="dw-controls__note">You’re out of this hand. It plays out without you.</p>
      </div>
    )
  }

  if (state.phase === 'drawing' && yourTurn && you) {
    const n = marked.length
    const most = maxDiscards(you.cards)
    return (
      <div className="dw-controls">
        <p className="dw-controls__note">
          Tap the cards to throw away: up to three{most === 4 ? ', or four keeping your Ace' : ''}.
        </p>
        <div className="dw-controls__buttons">
          {book && (
            <button className="dw-button" onClick={() => markOnly(book.discard.map((c) => c.id))}>
              The book’s draw
            </button>
          )}
          <button className="dw-button dw-button--primary dw-button--draw" onClick={draw}>
            {n === 0 ? 'Stand pat' : `Draw ${COUNT[n]}`} <span className="dw-key">D</span>
          </button>
        </div>
      </div>
    )
  }

  const owe = yourTurn && state.phase === 'betting' ? owed(state, YOUR_SEAT) : 0
  const size = betSize(state)
  const level = state.bets * size + size
  const canFold = yourTurn && legal.has('fold')
  const raise: BetAction | null = legal.has('bet') ? 'bet' : legal.has('raise') ? 'raise' : null
  const allInCall = you && owe >= you.stack && owe > 0
  return (
    <div className="dw-controls">
      <div className="dw-controls__buttons dw-controls__buttons--bet">
        <button className="dw-button dw-button--bet" onClick={() => bet('fold')} disabled={!canFold}>
          Fold <span className="dw-key">F</span>
        </button>
        <button className="dw-button dw-button--bet" onClick={() => bet(legal.has('check') ? 'check' : 'call')} disabled={!yourTurn || state.phase !== 'betting'}>
          {!yourTurn || legal.has('check') ? 'Check' : allInCall ? `All in ${owe}` : `Call ${owe}`} <span className="dw-key">C</span>
        </button>
        <button className="dw-button dw-button--bet dw-button--primary" onClick={() => raise && bet(raise)} disabled={!raise}>
          {raise === 'raise' ? `Raise to ${Math.min(level, (you?.roundBet ?? 0) + (you?.stack ?? 0))}` : `Bet ${Math.min(size, you?.stack ?? size)}`} <span className="dw-key">{raise === 'raise' ? 'R' : 'B'}</span>
        </button>
      </div>
    </div>
  )
}

// ---- The terminal ------------------------------------------------------------------

function status(state: DrawState, seats: (Occupant | null)[], result: { committed: number; won: number } | null): string {
  const who = actor(state)
  const name = (seat: number) => seats[seat]?.regular.name ?? 'Someone'
  switch (state.phase) {
    case 'waiting':
      return 'Deal when you’re ready'
    case 'complete': {
      if (!result) return 'Deal when you’re ready'
      const net = result.won - result.committed
      if (net > 0) return `You win ${net} caps`
      if (net < 0) {
        const winner = state.payouts?.[0]?.seat
        return winner !== undefined && state.seats[YOUR_SEAT]?.folded ? `${name(winner)} takes the pot` : `You lose ${-net} caps`
      }
      return 'You break even'
    }
    case 'dealing':
      return 'Dealing…'
    case 'showdown':
      return 'Showdown'
    case 'betting': {
      if (who !== YOUR_SEAT) return `${name(who as number)} is thinking…`
      const owe = owed(state, YOUR_SEAT)
      return owe > 0 ? `${owe} to call` : 'Check or bet'
    }
    case 'drawing':
      return who === YOUR_SEAT ? 'Your draw' : `${name(who as number)} is drawing…`
  }
}

function Hud({ book }: { book: DrawPlan | null }) {
  const { state, table, seats, log, result, leave } = useSession()
  const hints = useSave((s) => s.draw.hints)
  const updateDraw = useSave((s) => s.updateDraw)
  const table3d = useSave((s) => s.settings.table3d)
  const updateSettings = useSave((s) => s.updateSettings)
  const caps = useSave((s) => s.wallet.caps)
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
  const inPot = yourStake(s)
  const you = s.seats[YOUR_SEAT]

  let help: ReactNode = ''
  const holding = you && youreIn(s) && you.cards.length === 5 ? spoken(evaluate(you.cards)) : null
  if (book) help = book.reason
  else if (actor(s) === YOUR_SEAT && s.phase === 'drawing') help = `You hold ${holding}. Pick the cards you don’t want; standing pat is drawing none.`
  else if (betweenHands(s) && caps < table!.stakes.ante) help = 'You’re out of caps for this table.'
  else if (betweenHands(s)) help = 'Your caps are your stack: you can’t lose more than you have.'
  else if (holding) help = `You hold ${holding}.${actor(s) === YOUR_SEAT && s.phase === 'betting' ? ` Pot ${potTotal(s)}.` : ''}`

  const getUp = () => void navigate('/draw', { during: leave })

  const tableLog = (
    <ol className="dw-hud__log" ref={logRef} aria-label="Table log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="dw-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
      </button>
      <button className="term-button" aria-pressed={hints} onClick={() => updateDraw({ hints: !hints })}>
        <span aria-hidden="true">{hints ? '[x]' : '[ ]'}</span> Hints
      </button>
      <button className="term-button" aria-pressed={table3d} onClick={() => updateSettings({ table3d: !table3d })}>
        <span aria-hidden="true">{table3d ? '[x]' : '[ ]'}</span> 3D view
      </button>
      {inPot === 0 ? (
        <button className="term-button" onClick={getUp}>
          Leave table
        </button>
      ) : confirmLeave ? (
        <button className="term-button" onClick={getUp}>
          Forfeit {inPot} caps
        </button>
      ) : (
        <button className="term-button" onClick={() => setConfirmLeave(true)}>
          Leave table
        </button>
      )}
    </div>
  )

  return (
    <aside className="dw-hud screen" aria-label="Game status">
      <div className="dw-hud__head">
        <p className="term-dim">Five-Card Draw, {table!.name.toLowerCase()}</p>
        {inPot > 0 && <p className="dw-hud__stake">In the pot {inPot}</p>}
      </div>
      <p className="dw-hud__status" aria-live="polite">
        {status(s, seats, result)}
      </p>
      <p className="dw-hud__help" id="dw-advice">
        {help}
      </p>
      {compact && (
        <button className="term-button dw-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          Menu
        </button>
      )}
      {!compact && tableLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="dw-overlay" role="dialog" aria-modal="true" aria-label="Table menu" onClick={closeMenu}>
          <div className="dw-menu screen" onClick={(e) => e.stopPropagation()}>
            {tableLog}
            {tableControls}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="dw-overlay" role="dialog" aria-modal="true" aria-label="Five-Card Draw rules" onClick={() => setShowRules(false)}>
          <div className="dw-panel dw-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="dw-button dw-button--primary" autoFocus onClick={() => setShowRules(false)}>
              Back to the game
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

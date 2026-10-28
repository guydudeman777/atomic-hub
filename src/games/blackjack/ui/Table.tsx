import { type CSSProperties, type RefObject, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Card } from '../../../core/cards'
import { PlayingCard } from '../../../components/PlayingCard'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { playSfx } from '../../../core/audio/sfx'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { useGameLink } from '../../../net/store'
import { LinkBanner } from '../../../net/ui/LinkBanner'
import {
  type Hand,
  type PlayerAction,
  type TableState,
  SHOE_SET,
  actor,
  cardsLeft,
  currentHand,
  dealerHasBlackjack,
  dealerShowing,
  discards,
  handTotal,
  insuranceCost,
  isBlackjack,
  legalActions,
  upCard,
} from '../engine'
import { ACTION_LABEL, basicStrategy, describeHand, describeUp, runningCount, trueCount } from '../strategy'
import { ChipStack, Chip } from './Chip'
import { Felt } from './Felt'
import { type Layout, type Place, SPOT_INDEXES, WIDE_LAYOUT, tallLayout } from './layout'
import { RulesText } from './Rules'
import { type Fx, type Human, type Occupant, type Remark, canBet, listNames, useSession, yourStake } from './session'
import { GAME, checksumAfter, leaveOnline, yourMoves } from './online'

/**
 * Phones and small windows get the compact table in blackjack.css, whose
 * media queries match this one: the HUD keeps its log and table controls
 * behind a Menu button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 520px)'

/** Held upright, a phone gets the tall table (layout.ts). Keep in step with blackjack.css. */
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

/** How long the dealer and the regulars take over each step, in ms. */
function pace(state: TableState): number {
  switch (state.phase) {
    case 'dealing':
      return state.dealer.length === 0 && state.spots.every((s) => s.hands.every((h) => h.cards.length === 0)) ? 500 : 260
    case 'peek':
      return 750
    case 'insurance':
      return 700
    case 'playing':
      return 850
    case 'dealer':
      return state.holeRevealed ? 800 : 650
    default:
      return 0
  }
}

export function Table() {
  const { sitting, state, stakes, me, humans, queue, config } = useSession()
  const step = useSession((s) => s.step)
  const link = useGameLink(GAME)

  // No seat? Back to the lobby.
  useEffect(() => {
    if (!state || !stakes) navigate('/blackjack')
  }, [state, stakes])

  // The dealer and the regulars take their turns after a beat. Players take theirs.
  useEffect(() => {
    if (!state) return
    const who = actor(state)
    if (who === null || who === me || (who !== 'dealer' && humans[who] && !humans[who].gone)) return
    const t = window.setTimeout(step, pace(state))
    return () => window.clearTimeout(t)
  }, [state, step, me, humans])

  // Online: play the other players' moves as the table gets to them.
  useEffect(() => {
    if (queue.length) useSession.getState().pump(checksumAfter(link))
  }, [state, queue, link])

  if (!state || !stakes) return null
  return (
    <>
      <TableView key={sitting} />
      {config?.online && <LinkBanner link={link} waitsForOthers={false} onGone={() => void navigate('/blackjack', { during: leaveOnline })} />}
    </>
  )
}

// ---------------------------------------------------------------------------

/** How long the table shakes under a fist. Keep in step with bj-slam in blackjack.css. */
const SLAM_MS = 650

/** The effect playing right now: it starts after its delay and lasts a moment. */
function usePlaying(fx: Fx | null): Fx | null {
  const [playing, setPlaying] = useState<Fx | null>(null)
  useEffect(() => {
    if (!fx) return
    const start = window.setTimeout(() => setPlaying(fx), fx.delay)
    const stop = window.setTimeout(() => setPlaying((now) => (now === fx ? null : now)), fx.delay + SLAM_MS)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(stop)
    }
  }, [fx])
  return playing
}

function TableView() {
  const { state, stakes, seats, talk, call, result, bet, fx, config, me, humans, ready } = useSession()
  const slam = usePlaying(fx)
  const caps = useSave((s) => s.wallet.caps)
  const coach = useSave((s) => s.blackjack.coach)
  const { addChip, clearBet } = useSession.getState()
  const { act, insure, deal } = yourMoves
  // The shuffle as you sit down. (Deferred so a StrictMode double mount doesn't play it twice.)
  useEffect(() => {
    const t = window.setTimeout(() => playSfx('shuffle'), 200)
    return () => window.clearTimeout(t)
  }, [])

  const s = state!
  const yourTurn = actor(s) === me
  const legal = new Set(yourTurn ? legalActions(s, caps).map((a) => (a.type === 'insurance' ? (a.take ? 'take' : 'decline') : a.type)) : [])
  const hand = yourTurn ? currentHand(s) : null
  const up = upCard(s)
  const advice: PlayerAction | null =
    hand && up ? basicStrategy(hand.cards, up, { canDouble: legal.has('double'), canSplit: legal.has('split') }) : null
  const betting = canBet(s)

  // Keyboard: H S D P to play, Y or N for insurance, chips 1–4, Enter deals, Backspace clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea, [role="dialog"]')) return
      const key = e.key.toLowerCase()
      const actions: Record<string, PlayerAction> = { h: 'hit', s: 'stand', d: 'double', p: 'split' }
      if (yourTurn && s.phase === 'playing' && actions[key]) act(actions[key])
      else if (yourTurn && s.phase === 'insurance' && (key === 'y' || key === 'i')) insure(true)
      else if (yourTurn && s.phase === 'insurance' && key === 'n') insure(false)
      else if (betting && key === 'enter' && !(e.target as HTMLElement).closest('button')) deal()
      else if (betting && key === 'backspace') clearBet()
      else if (betting && Number(key) >= 1 && Number(key) <= stakes!.chips.length) addChip(stakes!.chips[Number(key) - 1])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const occupied = SPOT_INDEXES.map((spot) => spot === me || !!seats[spot] || !!humans[spot])
  // The tall table is as deep as the stage is tall for its width. Tilted
  // (blackjack-3d.css), it's 4% wider than the stage and stands about 4%
  // shorter than it's deep, so the same depth fits.
  const stageRef = useRef<HTMLDivElement>(null)
  const aspect = useAspect(stageRef)
  const tall = useMediaQuery(TALL_TABLE)
  const layout = tall ? tallLayout(aspect * 1000) : WIDE_LAYOUT
  const { shape } = layout

  return (
    <div className="bj-game">
      <div className="bj-board">
        <DealerBar name={stakes!.dealer.name} call={call} limits={`${stakes!.limits.min} to ${stakes!.limits.max} caps`} table={stakes!.name} />

        <div className={`bj-stage${slam ? ' is-shaking' : ''}`} ref={stageRef}>
          <div
            className="bj-felt"
            role="region"
            aria-label="Blackjack table"
            data-shape={shape.name}
            style={{ '--felt-h': shape.h, '--scale': layout.scale } as CSSProperties}
          >
            <LayoutContext.Provider value={layout}>
            <Felt seats={occupied} layout={layout} />
            <Shoe state={s} />
            <DealerHand state={s} />
            {SPOT_INDEXES.map((spot) => (
              <SpotView
                key={spot}
                spot={spot}
                state={s}
                occupant={seats[spot]}
                human={spot === me ? null : (humans[spot] ?? null)}
                you={spot === me}
                pendingBet={betting ? (spot === me ? (ready[me] ?? bet) : (ready[spot] ?? 0)) : 0}
                activeHand={actor(s) === spot && s.phase === 'playing' ? (s.turn?.hand ?? null) : null}
                acting={actor(s) === spot}
                caps={caps}
                talk={talk?.spot === spot && !shape.talk ? talk : null}
                open={config?.mode === 'full' && spot !== me && !seats[spot] && !humans[spot]}
                slamming={slam?.spot === spot}
              />
            ))}
            {slam && <Impact key={slam.id} spot={slam.spot} />}
            {/* On the tall table the regulars' remarks go in the open felt, with the speaker's name. */}
            {shape.talk && (
              <SpeechBubble
                name={talk && talk.spot !== 'dealer' ? (seats[talk.spot]?.regular.name ?? '') : ''}
                remark={talk}
                className="bj-talk--table"
                style={at(shape.talk)}
                named
              />
            )}
            {result && betting && <ResultBurst staked={result.staked} returned={result.returned} spot={me} key={s.round} />}
            </LayoutContext.Provider>
          </div>
        </div>

        <Controls
          state={s}
          legal={legal}
          coach={coach}
          advice={advice}
          bet={bet}
          chips={stakes!.chips}
          min={stakes!.limits.min}
          max={stakes!.limits.max}
          caps={caps}
        />
      </div>

      <Hud advice={advice} hand={hand} />
    </div>
  )
}

// ---- The dealer --------------------------------------------------------------

function DealerBar({ name, call, limits, table }: { name: string; call: Remark | null; limits: string; table: string }) {
  return (
    <div className="bj-dealer-bar">
      <div className="bj-dealer-bar__who">
        <span className="bj-portrait bj-portrait--dealer" aria-hidden="true">
          {name.replace('Mr. ', '').slice(0, 1)}
        </span>
        <span className="bj-dealer-bar__name">{name}</span>
        <SpeechBubble name={name} remark={call} className="bj-talk--dealer" />
      </div>
      <div className="bj-placard" aria-label={`${table}: bets from ${limits}`}>
        <span className="bj-placard__table">{table}</span>
        <span className="bj-placard__limits">{limits}</span>
      </div>
    </div>
  )
}

function DealerHand({ state }: { state: TableState }) {
  const cards = state.dealer
  const showing = dealerShowing(state)
  const { dealerCard, shape, scale } = useLayout()
  const pos = dealerCard(0, cards.length)
  return (
    <>
      {cards.map((card, k) => (
        <TableCard key={card.id} card={card} place={dealerCard(k, cards.length)} depth={k} faceDown={k === 1 && !state.holeRevealed} />
      ))}
      {cards.length > 0 && (
        <Badge place={{ x: pos.x - shape.cardW / 2 - 24 * scale, y: pos.y + 14 * scale, rot: 0 }} tone={state.holeRevealed && showing.total > 21 ? 'bad' : undefined}>
          {state.holeRevealed && dealerHasBlackjack(state) ? 'BJ' : showing.total}
        </Badge>
      )}
    </>
  )
}

/** The shoe on the dealer's left and the discard tray on their right. */
function Shoe({ state }: { state: TableState }) {
  const { shape } = useLayout()
  const left = cardsLeft(state)
  const used = discards(state)
  return (
    <>
      <div className="bj-shoe" style={at(shape.shoe)} title={`${left} cards left in the shoe`}>
        <div className="bj-shoe__card">
          <PlayingCard faceDown set={SHOE_SET} />
        </div>
      </div>
      <div className="bj-discards" style={{ ...at(shape.discard), '--n': Math.min(24, Math.ceil(used / 6)) } as CSSProperties} title={`${used} cards in the discard tray`}>
        {used > 0 && (
          <div className="bj-discards__stack">
            <PlayingCard faceDown set={SHOE_SET} />
          </div>
        )}
      </div>
    </>
  )
}

// ---- Spots ---------------------------------------------------------------------

interface SpotProps {
  spot: number
  state: TableState
  occupant: Occupant | null
  /** Another player, at an online table. */
  human: Human | null
  you: boolean
  /** Your chips in the circle while you're betting. */
  pendingBet: number
  activeHand: number | null
  acting: boolean
  caps: number
  talk: Remark | null
  /** An empty seat at a full table, waiting for someone new. */
  open: boolean
  /** Their fist is coming down on the table. */
  slamming: boolean
}

function SpotView({ spot, state, occupant, human, you, pendingBet, activeHand, acting, caps, talk, open, slamming }: SpotProps) {
  const { hands, insurance } = state.spots[spot]
  const seated = you || occupant || human
  const n = hands.length
  const betting = canBet(state)
  const dealerBlackjack = state.holeRevealed && dealerHasBlackjack(state)
  // Insurance is settled at the peek: lost unless the dealer turns up a blackjack.
  const insurancePaid = !!insurance && dealerBlackjack
  const insuranceLost = !!insurance && !dealerBlackjack && ['playing', 'dealer', 'settled'].includes(state.phase)
  const name = you ? 'You' : (occupant?.regular.name ?? human?.name ?? '')
  const stack = you ? caps : occupant ? occupant.stack : null
  const { plateOf, inSpot, shape, scale } = useLayout()
  const plate = plateOf(spot)

  return (
    <>
      {hands.map((hand, h) => (
        <HandView key={h} spot={spot} hand={hand} h={h} n={n} active={activeHand === h} you={you} />
      ))}
      {/* Between rounds your chips wait in the circle, ready for the next deal. */}
      {betting && pendingBet > 0 && <Stack amount={pendingBet} place={inSpot(spot, 0, shape.circleY)} from={you ? undefined : 'player'} />}
      {!!insurance && (
        <>
          <Stack amount={insurance} place={inSpot(spot, -60 * scale, -6 * scale)} taken={insuranceLost} from="player" />
          {insurancePaid && <Stack amount={insurance * 2} place={inSpot(spot, -60 * scale, 26 * scale)} from="tray" />}
        </>
      )}
      {/* Keyed by who's sitting there, so a newcomer's plate arrives with them. */}
      {seated && (
        <div
          key={occupant?.regular.id ?? (human ? `player-${human.seat}` : 'you')}
          className={`bj-plate${acting ? ' is-acting' : ''}${you ? ' is-you' : ''}${human ? ' is-player' : ''}${occupant?.leaving || human?.gone ? ' is-leaving' : ''}${occupant?.leaving === 'kicked' ? ' is-kicked' : ''}${slamming ? ' is-slamming' : ''}`}
          style={at(plate)}
        >
          {!you && occupant && <span className="bj-portrait" style={{ background: occupant.regular.color }} aria-hidden="true" />}
          <span className="bj-plate__name">{name}</span>
          {stack !== null && (
            <span className="bj-plate__stack">
              {stack.toLocaleString()}
              <span className="visually-hidden"> caps</span>
            </span>
          )}
        </div>
      )}
      {open && (
        <div key="open" className="bj-plate is-open" style={at(plate)}>
          <span className="bj-plate__name">Open seat</span>
        </div>
      )}
      {!you && occupant && (
        <SpeechBubble name={occupant.regular.name} remark={talk} className={`bj-talk--seat bj-talk--s${spot}`} style={at(plate)} />
      )}
    </>
  )
}

const OUTCOME_LABEL: Record<NonNullable<Hand['outcome']>, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
}

function HandView({ spot, hand, h, n, active, you }: { spot: number; hand: Hand; h: number; n: number; active: boolean; you: boolean }) {
  const { handScale, handX, cardInHand, inSpot, shape, scale } = useLayout()
  const s = handScale(n)
  const hx = handX(h, n)
  const { total, soft } = handTotal(hand.cards)
  const base = hand.doubled ? hand.bet / 2 : hand.bet
  const lost = hand.outcome === 'lose' || hand.outcome === 'bust'
  const winnings = hand.outcome === 'blackjack' || hand.outcome === 'win' ? hand.payout - hand.bet : 0
  const first = cardInHand(spot, h, n, 0)
  const outcome = hand.outcome ?? (isBlackjack(hand) && hand.cards.length === 2 ? 'blackjack' : null)

  return (
    <>
      {active && <div className="bj-glow" style={{ ...at(first), '--s': s } as CSSProperties} aria-hidden="true" />}
      {hand.cards.map((card, k) => (
        <TableCard key={card.id} card={card} place={cardInHand(spot, h, n, k)} depth={k} scale={s} />
      ))}
      {/* Your first bet is already in the circle; everyone else's, and every split and double, gets pushed out from the rail. */}
      <Stack amount={base} place={inSpot(spot, hx, shape.circleY)} taken={lost} from={you && h === 0 ? undefined : 'player'} />
      {/* A double goes down beside the bet; winnings are paid just in front of it. */}
      {hand.doubled && <Stack amount={base} place={inSpot(spot, hx + 24 * s * scale, shape.circleY - 6 * scale)} taken={lost} from="player" />}
      {winnings > 0 && <Stack amount={winnings} place={inSpot(spot, hx - 6 * s * scale, shape.circleY + 30 * scale)} from="tray" />}
      {hand.cards.length >= 2 && (
        <Badge
          place={inSpot(spot, hx - (shape.cardW / 2) * s - 6 * scale, shape.cardW * 0.7 * s - 8 * scale)}
          tone={outcome === 'blackjack' || hand.outcome === 'win' ? 'good' : lost ? 'bad' : undefined}
        >
          {outcome ? OUTCOME_LABEL[outcome] : soft && total < 21 ? `${total - 10}/${total}` : total}
        </Badge>
      )}
    </>
  )
}

// ---- Things on the felt ----------------------------------------------------------

/** Where a fist hits the felt: two rings that spread out through it. */
function Impact({ spot }: { spot: number }) {
  const { circleOf } = useLayout()
  return <div className="bj-impact" style={at(circleOf(spot))} aria-hidden="true" />
}

/** Absolute position on the felt, in felt units. */
const at = (p: { x: number; y: number; rot?: number }): CSSProperties => ({ '--x': p.x, '--y': p.y, '--r': `${p.rot ?? 0}deg` }) as CSSProperties

/** How far something travels to get here from `from`, for animations in the felt's frame. */
const from = (p: { x: number; y: number }, origin: { x: number; y: number }): CSSProperties =>
  ({ '--fx': origin.x - p.x, '--fy': origin.y - p.y }) as CSSProperties

/**
 * A card on the felt. It slides out of the shoe and turns over as it lands;
 * the hole card stays face down, with no face in the page, until it's turned.
 */
function TableCard({ card, place, depth, scale = 1, faceDown = false }: { card: Card; place: Place; depth: number; scale?: number; faceDown?: boolean }) {
  const { shoe } = useLayout().shape
  return (
    <div
      className="bj-card"
      data-down={faceDown || undefined}
      style={{ ...at(place), ...from(place, shoe), '--k': depth, '--s': scale } as CSSProperties}
    >
      <div className="bj-flip">
        <div className="bj-flip__face">{faceDown ? null : <PlayingCard card={card} />}</div>
        <div className="bj-flip__back" aria-hidden={!faceDown}>
          <PlayingCard faceDown set={SHOE_SET} title={faceDown ? 'The dealer’s hole card, face down' : undefined} />
        </div>
      </div>
    </div>
  )
}

/**
 * Chips on the felt. `from` slides them in, from the player's rail or the
 * dealer's tray; `taken` sweeps them off to the tray.
 */
function Stack({ amount, place, from: origin, taken = false }: { amount: number; place: Place; from?: 'player' | 'tray'; taken?: boolean }) {
  // The player's rail is straight back from the chips, down the spot's own frame.
  const turn = (place.rot * Math.PI) / 180
  const { shape, scale } = useLayout()
  const rail = 120 * scale
  const start = origin === 'tray' ? shape.tray : { x: place.x - rail * Math.sin(turn), y: place.y + rail * Math.cos(turn) }
  return (
    <ChipStack
      amount={amount}
      className={`bj-felt-stack${origin ? ` is-from-${origin}` : ''}${taken ? ' is-taken' : ''}`}
      style={{ ...at(place), ...from(place, taken ? shape.tray : start) }}
    />
  )
}

function Badge({ place, tone, children }: { place: Place; tone?: 'good' | 'bad'; children: React.ReactNode }) {
  return (
    <div className={`bj-badge${tone ? ` is-${tone}` : ''}`} style={at(place)}>
      {children}
    </div>
  )
}

/** Your result for the round, rising off your cards. */
function ResultBurst({ staked, returned, spot }: { staked: number; returned: number; spot: number }) {
  const net = returned - staked
  const { inSpot, scale } = useLayout()
  const place = inSpot(spot, 0, -20 * scale)
  return (
    <div className={`bj-burst${net > 0 ? ' is-up' : net < 0 ? ' is-down' : ''}`} style={at(place)} aria-hidden="true">
      {net > 0 ? `+${net}` : net < 0 ? `−${-net}` : 'Push'}
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
    <div className={`bj-talk ${className}`} style={style} aria-live="polite">
      {visible && (
        <p key={remark.id} className={`bj-talk__bubble${remark.angry ? ' is-angry' : ''}`} style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          {named ? (
            <>
              <strong className="bj-talk__name">{name}</strong>
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

interface ControlsProps {
  state: TableState
  legal: Set<string>
  coach: boolean
  advice: PlayerAction | null
  bet: number
  chips: readonly number[]
  min: number
  max: number
  caps: number
}

const KEYS: Record<PlayerAction, string> = { hit: 'H', stand: 'S', double: 'D', split: 'P' }

function Controls({ state, legal, coach, advice, bet, chips, min, max, caps }: ControlsProps) {
  const { addChip, clearBet } = useSession.getState()
  const { act, insure, deal, dealNow } = yourMoves
  const { me, ready, humans, config } = useSession()
  const link = useGameLink(GAME)
  const yourTurn = actor(state) === me
  const online = !!config?.online

  if (canBet(state)) {
    // Online, once your bet's down you wait for the others.
    if (online && ready[me] !== null) {
      const waiting = humans.flatMap((h, spot) => (h && !h.gone && spot !== me && ready[spot] === null ? [h.name] : []))
      const host = link?.host
      return (
        <div className="bj-controls">
          <p className="bj-controls__ask">
            {ready[me] ? `Your bet of ${ready[me]} is down.` : 'You’re sitting this one out.'} Waiting for {listNames(waiting)} to bet.
          </p>
          {host && (
            <div className="bj-controls__buttons">
              <button className="bj-button" onClick={dealNow}>
                Deal without them
              </button>
            </div>
          )}
        </div>
      )
    }
    if (caps < min) {
      return (
        <div className="bj-controls bj-controls--broke">
          <p>
            You need {min} caps to play this table and you have {caps}. Try a lower limit, or claim a refill from the hub menu
            once you’re under 50.
          </p>
          {online ? (
            <button className="bj-button" onClick={() => deal(0)}>
              Sit this one out
            </button>
          ) : (
            <button className="bj-button" onClick={() => void navigate('/blackjack', { during: useSession.getState().leave })}>
              Back to the tables
            </button>
          )}
        </div>
      )
    }
    return (
      <div className="bj-controls">
        <div className="bj-rack" role="group" aria-label="Chips">
          {chips.map((value, i) => (
            <button
              key={value}
              className="bj-rack__chip"
              onClick={() => addChip(value)}
              disabled={bet + value > Math.min(max, caps) && bet >= Math.min(max, caps)}
              aria-label={`Add a ${value} chip (key ${i + 1})`}
              title={`Add ${value} (key ${i + 1})`}
            >
              <Chip value={value} />
            </button>
          ))}
        </div>
        <div className="bj-bet" aria-live="polite">
          <span className="bj-bet__label">Your bet</span>
          <span className="bj-bet__amount">{bet.toLocaleString()}</span>
          {bet > 0 && bet < min && <span className="bj-bet__note">Table minimum is {min}</span>}
        </div>
        <div className="bj-controls__buttons">
          <button className="bj-button" onClick={clearBet} disabled={bet === 0}>
            Clear
          </button>
          {online && (
            <button className="bj-button" onClick={() => deal(0)}>
              Sit out
            </button>
          )}
          <button className="bj-button bj-button--primary" onClick={() => deal()} disabled={bet < min || bet > caps}>
            Deal <span className="bj-key">Enter</span>
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === 'insurance') {
    const bet = state.spots[me].hands[0]?.bet ?? 0
    const blackjack = isBlackjack(state.spots[me].hands[0] ?? { cards: [], split: false })
    return (
      <div className="bj-controls">
        <p className="bj-controls__ask">
          {yourTurn
            ? blackjack
              ? 'You have blackjack against an Ace. Take even money, or play it out for 3 to 2?'
              : `The dealer shows an Ace. Insure your bet for ${insuranceCost(bet)} caps?`
            : 'Insurance is open.'}
        </p>
        <div className="bj-controls__buttons">
          <button className="bj-button" onClick={() => insure(true)} disabled={!yourTurn || !legal.has('take')}>
            {blackjack ? 'Even money' : `Insure for ${insuranceCost(bet)}`} <span className="bj-key">Y</span>
          </button>
          <button className={`bj-button${coach && yourTurn ? ' is-advised' : ''}`} onClick={() => insure(false)} disabled={!yourTurn}>
            {blackjack ? 'Play it out' : 'No insurance'} <span className="bj-key">N</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bj-controls">
      <div className="bj-controls__buttons bj-controls__buttons--play">
        {(['hit', 'stand', 'double', 'split'] as const).map((action) => (
          <button
            key={action}
            className={`bj-button bj-button--play${coach && advice === action ? ' is-advised' : ''}`}
            onClick={() => act(action)}
            disabled={!yourTurn || !legal.has(action)}
            aria-describedby={coach && advice === action ? 'bj-advice' : undefined}
          >
            {ACTION_LABEL[action]} <span className="bj-key">{KEYS[action]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- The terminal ------------------------------------------------------------------

function status(state: TableState, seats: (Occupant | null)[], humans: (Human | null)[], me: number, result: { staked: number; returned: number } | null): string {
  const who = actor(state)
  const name = (spot: number) => seats[spot]?.regular.name ?? humans[spot]?.name ?? 'Someone'
  switch (state.phase) {
    case 'betting':
      return 'Place your bet'
    case 'settled': {
      if (!result || !state.spots[me].hands.length) return 'Place your bet'
      const net = result.returned - result.staked
      if (state.spots[me].hands.some((h) => h.outcome === 'blackjack')) return `Blackjack! You win ${net}`
      return net > 0 ? `You win ${net} caps` : net < 0 ? `You lose ${-net} caps` : 'Push'
    }
    case 'dealing':
      return 'Dealing…'
    case 'insurance':
      return who === me ? 'Insurance?' : `${name(who as number)} is deciding on insurance…`
    case 'peek':
      return 'The dealer checks for blackjack…'
    case 'playing': {
      if (who !== me) return humans[who as number] ? `${name(who as number)}’s turn` : `${name(who as number)} is playing…`
      const hands = state.spots[me].hands
      const prefix = hands.length > 1 ? `Hand ${state.turn!.hand + 1} of ${hands.length}: ` : 'Your turn: '
      return `${prefix}${describeHand(hands[state.turn!.hand].cards)}`
    }
    case 'dealer':
      return 'The dealer plays'
  }
}

function Hud({ advice, hand }: { advice: PlayerAction | null; hand: Hand | null }) {
  const { state, stakes, seats, log, result, leave, me, humans, config } = useSession()
  const { coach, count } = useSave((s) => s.blackjack)
  const updateBlackjack = useSave((s) => s.updateBlackjack)
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
  const onTable = yourStake(s, me)
  const up = upCard(s)

  let help = ''
  if (coach && advice && hand && up) help = `The book says ${ACTION_LABEL[advice].toLowerCase()} on ${describeHand(hand.cards)} against ${describeUp(up)}.`
  else if (coach && s.phase === 'insurance' && actor(s) === me) help = 'The book never takes insurance.'
  else if (canBet(s) && caps < stakes!.limits.min) help = 'You’re out of caps for this table.'
  else if (canBet(s)) help = `${compact ? 'Tap' : 'Click'} chips to bet, then deal. Your bet stays up for the next round.`

  const decks = cardsLeft(s) / 52
  const tc = trueCount(s)

  const getUp = () => void navigate('/blackjack', { during: config?.online ? leaveOnline : leave })

  const tableLog = (
    <ol className="bj-hud__log" ref={logRef} aria-label="Table log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="bj-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
      </button>
      <button className="term-button" aria-pressed={coach} onClick={() => updateBlackjack({ coach: !coach })}>
        <span aria-hidden="true">{coach ? '[x]' : '[ ]'}</span> Coach
      </button>
      <button className="term-button" aria-pressed={count} onClick={() => updateBlackjack({ count: !count })}>
        <span aria-hidden="true">{count ? '[x]' : '[ ]'}</span> Count
      </button>
      <button className="term-button" aria-pressed={table3d} onClick={() => updateSettings({ table3d: !table3d })}>
        <span aria-hidden="true">{table3d ? '[x]' : '[ ]'}</span> 3D view
      </button>
      {onTable === 0 ? (
        <button className="term-button" onClick={getUp}>
          Leave table
        </button>
      ) : confirmLeave ? (
        <button className="term-button" onClick={getUp}>
          Forfeit {onTable} caps
        </button>
      ) : (
        <button className="term-button" onClick={() => setConfirmLeave(true)}>
          Leave table
        </button>
      )}
    </div>
  )

  return (
    <aside className="bj-hud screen" aria-label="Game status">
      <div className="bj-hud__head">
        <p className="term-dim">
          Blackjack{config?.online ? ' online' : ''}, {stakes!.name.toLowerCase()}
        </p>
        {onTable > 0 && <p className="bj-hud__stake">On the table {onTable}</p>}
      </div>
      <p className="bj-hud__status" aria-live="polite">
        {status(s, seats, humans, me, result)}
      </p>
      <p className="bj-hud__help" id="bj-advice">
        {help}
      </p>
      {count && (
        <p className="bj-hud__count" aria-label="Hi-Lo count">
          Running {formatCount(runningCount(s))}, true {formatCount(Math.round(tc * 10) / 10)}, {decks.toFixed(1)} decks left
        </p>
      )}
      {compact && (
        <button className="term-button bj-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          Menu
        </button>
      )}
      {!compact && tableLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="bj-overlay" role="dialog" aria-modal="true" aria-label="Table menu" onClick={closeMenu}>
          <div className="bj-menu screen" onClick={(e) => e.stopPropagation()}>
            {tableLog}
            {tableControls}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="bj-overlay" role="dialog" aria-modal="true" aria-label="Blackjack rules" onClick={() => setShowRules(false)}>
          <div className="bj-panel bj-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="bj-button bj-button--primary" autoFocus onClick={() => setShowRules(false)}>
              Back to the game
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

const formatCount = (n: number) => (n > 0 ? `+${n}` : String(n))

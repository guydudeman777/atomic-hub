import { useEffect, useMemo, useRef, useState } from 'react'
import { type Card, type Suit, SUIT_NAME, cardName } from '../../../core/cards'
import { playSfx } from '../../../core/audio/sfx'
import { createRng, randomSeed } from '../../../core/rng'
import { PlayingCard, SuitIcon } from '../../../components/PlayingCard'
import { navigate } from '../../../navigation'
import { chooseMove } from '../ai'
import { opponentById } from '../content'
import {
  type Caravan,
  type GameState,
  type Lane,
  type Move,
  type PlayerId,
  LANES,
  OPENING_HAND_SIZE,
  OPENING_TURNS,
  caravanHeading,
  caravanValue,
  isNumberCard,
  isOpening,
  isSold,
  laneOutcome,
  legalMoves,
  other,
} from '../engine'
import { LANE_NAMES, type MatchConfig, useMatch } from './match'
import { RulesText } from './Rules'

const AI_DELAY_MS = 750
/** The AI waits for the opening deal animation before its first move. */
const AI_FIRST_MOVE_DELAY_MS = 1800

const FACE_HELP: Record<string, string> = {
  J: 'Jacks remove a card and everything attached to it.',
  Q: 'Queens go on the last card of a caravan. They reverse its direction and change its suit.',
  K: 'Kings double the value of the card they’re played on.',
  JK: 'On an Ace, a Joker clears every other card of that suit. On 2–10, every other card of that value.',
}

export function Table() {
  const { gameId, config, state, log, recent, settlement } = useMatch()
  const play = useMatch((s) => s.play)

  // No match? Back to the lobby.
  useEffect(() => {
    if (!config || !state) navigate('/caravan')
  }, [config, state])

  // Let the AI move after a short beat.
  const aiRng = useRef(createRng(randomSeed()))
  useEffect(() => {
    if (!config || !state || config.mode !== 'ai' || state.winner !== null || state.current !== 1) return
    const profile = opponentById(config.opponentId ?? '')?.profile ?? { difficulty: 'normal', aggression: 1 }
    const delay = state.turn === 0 ? AI_FIRST_MOVE_DELAY_MS : AI_DELAY_MS
    const t = window.setTimeout(() => play(chooseMove(state, profile, aiRng.current)), delay)
    return () => window.clearTimeout(t)
  }, [config, state, play])

  if (!config || !state) return null
  return <TableView key={gameId} config={config} state={state} log={log} recent={recent} settled={!!settlement} />
}

interface ViewProps {
  config: MatchConfig
  state: GameState
  log: { id: number; player: PlayerId; text: string }[]
  recent: string[]
  settled: boolean
}

function TableView({ config, state, log, recent, settled }: ViewProps) {
  const play = useMatch((s) => s.play)
  const hotseat = config.mode === 'hotseat'
  // Hot-seat shows the table from the current player's seat; against the AI you're always seat 0.
  const viewer: PlayerId = hotseat ? state.current : 0
  const opponent = other(viewer)
  const myTurn = state.winner === null && state.current === viewer
  // Selection and disband confirmation belong to one game state; any move clears them.
  const [ui, setUi] = useState<{ for: GameState; selected: string | null; disband: Lane | null }>({ for: state, selected: null, disband: null })
  const selected = ui.for === state ? ui.selected : null
  const confirmDisband = ui.for === state ? ui.disband : null
  const setSelected = (id: string | null) => {
    if (id && id !== selected) playSfx('pick')
    setUi({ for: state, selected: id, disband: null })
  }
  // Hot-seat hides the table at the start of every turn until the next player is ready.
  const [revealedTurn, setRevealedTurn] = useState<number | null>(null)
  // The opening hands are dealt one card at a time when the table first appears.
  const [dealing, setDealing] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setDealing(false), 1800)
    return () => window.clearTimeout(t)
  }, [])
  // A shuffle, then the deal in step with the animation in caravan.css: your
  // cards from 480 ms and theirs from 535 ms, 110 ms apart. (Deferred so a
  // StrictMode double mount doesn't deal twice.)
  useEffect(() => {
    const t = window.setTimeout(() => {
      playSfx('shuffle')
      for (let k = 0; k < OPENING_HAND_SIZE; k++) {
        playSfx('deal', { delay: 0.48 + k * 0.11, pan: 0.1 })
        playSfx('deal', { delay: 0.535 + k * 0.11, pan: -0.1 })
      }
    })
    return () => window.clearTimeout(t)
  }, [])
  const handoff = hotseat && state.winner === null && revealedTurn !== state.turn

  const moves = useMemo(() => (myTurn ? legalMoves(state) : []), [state, myTurn])
  const playable = useMemo(() => new Set(moves.filter((m) => m.type === 'play').map((m) => (m as { cardId: string }).cardId)), [moves])
  const selectedMoves = moves.filter((m) => m.type !== 'disband' && m.cardId === selected)
  const laneTargets = new Set(selectedMoves.flatMap((m) => (m.type === 'play' && m.index === undefined ? [m.lane] : [])))
  const cardTargets = new Map<string, Move>()
  for (const m of selectedMoves) if (m.type === 'play' && m.index !== undefined) cardTargets.set(`${m.owner}-${m.lane}-${m.index}`, m)
  const discardMove = selectedMoves.find((m) => m.type === 'discard')
  const hand = state.players[viewer].hand
  const selectedCard = hand.find((c) => c.id === selected) ?? null

  const doPlay = (move: Move) => play(move)

  const onDisband = (lane: Lane) => {
    if (confirmDisband === lane) doPlay({ type: 'disband', lane })
    else setUi({ for: state, selected, disband: lane })
  }

  // Keyboard: 1–8 pick a card, D discards it, Esc cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn || handoff || settled) return
      const n = Number(e.key)
      if (n >= 1 && n <= hand.length) setSelected(hand[n - 1].id)
      else if (e.key === 'Escape') setSelected(null)
      else if ((e.key === 'd' || e.key === 'D') && discardMove) doPlay(discardMove)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const names = config.names
  const opening = isOpening(state, viewer)
  const placed = state.players[viewer].caravans.filter((c) => c.length > 0).length

  let status: string
  if (state.winner !== null) status = 'Game over'
  else if (!myTurn) status = hotseat ? `${names[state.current]}’s turn` : `${names[opponent]} is thinking…`
  else if (opening) status = `Opening: place a number card on each caravan (${Math.min(placed + 1, OPENING_TURNS)} of ${OPENING_TURNS})`
  else status = 'Your turn'

  let help: string
  if (!myTurn) help = ''
  else if (!selectedCard) help = opening ? 'Pick a number card from your hand.' : 'Pick a card from your hand, or disband one of your caravans.'
  else if (isNumberCard(selectedCard))
    help = laneTargets.size > 0 ? `${cardName(selectedCard)}: pick a highlighted caravan.` : `${cardName(selectedCard)} can’t go on any of your caravans right now.`
  else help = `${cardName(selectedCard)}. ${FACE_HELP[selectedCard.rank]} Pick a highlighted card.`

  return (
    <div className="cv-game">
      <div className="cv-board" aria-label="Caravan table">
        <PlayerBar
          name={names[opponent]}
          state={state}
          player={opponent}
          active={state.current === opponent && state.winner === null}
          setId={config.decks[opponent][0]?.set ?? 'standard'}
          dealing={dealing}
        />

        <div className="cv-row cv-row--top">
          {LANES.map((lane) => (
            <CaravanColumn
              key={lane}
              owner={opponent}
              lane={lane}
              caravan={state.players[opponent].caravans[lane]}
              recent={recent}
              cardTargets={cardTargets}
              onPlay={doPlay}
            />
          ))}
        </div>

        <div className="cv-row cv-plaques">
          {LANES.map((lane) => (
            <LanePlaque key={lane} state={state} lane={lane} viewer={viewer} names={names} hotseat={hotseat} />
          ))}
        </div>

        <div className="cv-row cv-row--mine">
          {LANES.map((lane) => (
            <CaravanColumn
              key={lane}
              owner={viewer}
              lane={lane}
              caravan={state.players[viewer].caravans[lane]}
              recent={recent}
              cardTargets={cardTargets}
              onPlay={doPlay}
              droppable={laneTargets.has(lane)}
              onDrop={() => {
                const m = selectedMoves.find((mv) => mv.type === 'play' && mv.index === undefined && mv.lane === lane)
                if (m) doPlay(m)
              }}
              disband={
                myTurn && !opening && state.players[viewer].caravans[lane].length > 0
                  ? { confirming: confirmDisband === lane, onClick: () => onDisband(lane) }
                  : undefined
              }
            />
          ))}
        </div>

        <div className="cv-hand-row">
          <div className={`cv-hand${dealing ? ' is-dealing' : ''}`} role="listbox" aria-label="Your hand">
            {hand.map((card, i) => {
              const usable = playable.has(card.id)
              return (
                <button
                  key={card.id}
                  role="option"
                  aria-selected={card.id === selected}
                  className={`cv-hand__card${card.id === selected ? ' is-selected' : ''}${myTurn && !usable ? ' is-dim' : ''}`}
                  style={{ '--k': i } as React.CSSProperties}
                  disabled={!myTurn}
                  onClick={() => setSelected(card.id === selected ? null : card.id)}
                  title={`${cardName(card)} (key ${i + 1})${myTurn && !usable ? '. No legal play right now, but you can discard it.' : ''}`}
                >
                  <PlayingCard card={card} faceDown={handoff} />
                </button>
              )
            })}
          </div>
          <div className="cv-pile" title="Cards left in your deck">
            <div className="cv-pile__card">
              <PlayingCard faceDown set={config.decks[viewer][0]?.set} />
            </div>
            <span>{state.players[viewer].deck.length} left</span>
          </div>
        </div>
      </div>

      <Hud
        config={config}
        status={status}
        help={help}
        log={log}
        canDiscard={!!discardMove}
        hasSelection={!!selected}
        onDiscard={() => discardMove && doPlay(discardMove)}
        onCancel={() => setSelected(null)}
        myTurn={myTurn}
      />

      {handoff && (
        <div className="cv-overlay cv-overlay--opaque" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
          <div className="cv-paper cv-handoff">
            <h2 id="handoff-title">Pass the device to {names[state.current]}</h2>
            <p>
              {names[other(state.current)]}, look away. The table stays hidden until {names[state.current]} is ready.
            </p>
            <button className="cv-button cv-button--primary" autoFocus onClick={() => setRevealedTurn(state.turn)}>
              I’m {names[state.current]}, show my hand
            </button>
          </div>
        </div>
      )}

      {settled && <GameOver />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function PlayerBar(props: { name: string; state: GameState; player: PlayerId; active: boolean; setId: string; dealing: boolean }) {
  const p = props.state.players[props.player]
  return (
    <div className={`cv-player-bar${props.active ? ' is-active' : ''}`}>
      <div className="cv-player-bar__who">
        <span className="cv-portrait" data-set={props.setId} aria-hidden="true">
          {props.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)}
        </span>
        <span className="cv-player-bar__name">{props.name}</span>
      </div>
      <div className={`cv-player-bar__hand${props.dealing ? ' is-dealing' : ''}`} aria-label={`${p.hand.length} cards in hand`}>
        {p.hand.map((c, i) => (
          <div key={c.id} className="cv-mini-back" style={{ '--k': i } as React.CSSProperties}>
            <PlayingCard faceDown set={props.setId} />
          </div>
        ))}
      </div>
      <span className="cv-player-bar__deck">Deck {p.deck.length}</span>
    </div>
  )
}

interface ColumnProps {
  owner: PlayerId
  lane: Lane
  caravan: Caravan
  recent: string[]
  cardTargets: Map<string, Move>
  onPlay: (m: Move) => void
  droppable?: boolean
  onDrop?: () => void
  disband?: { confirming: boolean; onClick: () => void }
}

function CaravanColumn({ owner, lane, caravan, recent, cardTargets, onPlay, droppable, onDrop, disband }: ColumnProps) {
  const n = caravan.length
  return (
    <div className="cv-col">
      <div
        className={`cv-caravan${droppable ? ' is-drop' : ''}`}
        style={{ '--n': n } as React.CSSProperties}
        onClick={droppable ? onDrop : undefined}
        role={droppable ? 'button' : undefined}
        tabIndex={droppable ? 0 : undefined}
        aria-label={droppable ? `Play on your ${LANE_NAMES[lane]} caravan` : undefined}
        onKeyDown={droppable ? (e) => (e.key === 'Enter' || e.key === ' ') && onDrop?.() : undefined}
      >
        {n === 0 && <div className="cv-empty">{droppable ? 'Play here' : ''}</div>}
        {caravan.map((placed, i) => {
          const target = cardTargets.get(`${owner}-${lane}-${i}`)
          return (
            <div
              key={placed.card.id}
              className={`cv-slot${target ? ' is-target' : ''}${recent.includes(placed.card.id) ? ' is-recent' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
              onClick={
                target
                  ? (e) => {
                      e.stopPropagation()
                      onPlay(target)
                    }
                  : undefined
              }
              role={target ? 'button' : undefined}
              tabIndex={target ? 0 : undefined}
              aria-label={target ? `Play on ${cardName(placed.card)}` : undefined}
              onKeyDown={target ? (e) => (e.key === 'Enter' || e.key === ' ') && onPlay(target) : undefined}
            >
              <PlayingCard card={placed.card} />
            </div>
          )
        })}
        {caravan.map((placed, i) =>
          placed.attached.map((a, j) => (
            <div
              key={a.id}
              className={`cv-attached${recent.includes(a.id) ? ' is-recent' : ''}`}
              style={{ '--i': i, '--j': j } as React.CSSProperties}
            >
              <PlayingCard card={a} />
            </div>
          )),
        )}
      </div>
      {disband && (
        <button
          className={`cv-disband${disband.confirming ? ' is-confirming' : ''}`}
          onClick={disband.onClick}
          aria-label={disband.confirming ? `Confirm disbanding your ${LANE_NAMES[lane]} caravan` : `Disband your ${LANE_NAMES[lane]} caravan`}
        >
          {disband.confirming ? 'Click again to disband' : 'Disband'}
        </button>
      )}
    </div>
  )
}

function Heading({ caravan }: { caravan: Caravan }) {
  const { direction, suit } = caravanHeading(caravan)
  if (caravan.length === 0) return <span className="cv-heading">empty</span>
  return (
    <span className="cv-heading" title={`${direction ? (direction === 'asc' ? 'Ascending' : 'Descending') : 'No direction yet'}, ${SUIT_NAME[suit as Suit]}`}>
      {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '–'} <SuitIcon suit={suit as Suit} />
    </span>
  )
}

function valueClass(v: number) {
  if (isSold(v)) return 'is-sold'
  if (v > 26) return 'is-over'
  return ''
}

function LanePlaque({ state, lane, viewer, names, hotseat }: { state: GameState; lane: Lane; viewer: PlayerId; names: [string, string]; hotseat: boolean }) {
  const theirs = state.players[other(viewer)].caravans[lane]
  const mine = state.players[viewer].caravans[lane]
  const tv = caravanValue(theirs)
  const mv = caravanValue(mine)
  const winner = laneOutcome(state, lane)
  const myName = hotseat ? names[viewer] : 'You'
  const theirName = hotseat ? names[other(viewer)] : 'They'
  const verdict = winner === null ? 'Open' : winner === viewer ? `${myName} ${hotseat ? 'leads' : 'lead'}` : `${theirName} ${hotseat ? 'leads' : 'lead'}`
  return (
    <div className={`cv-plaque${winner === viewer ? ' is-mine' : winner !== null ? ' is-theirs' : ''}`} aria-label={`${LANE_NAMES[lane]} lane: ${names[other(viewer)]} ${tv}, ${myName} ${mv}. ${verdict}.`}>
      <div className="cv-plaque__side">
        <span className={`cv-plaque__value ${valueClass(tv)}`}>{tv}</span>
        <Heading caravan={theirs} />
      </div>
      <span className="cv-plaque__verdict">{verdict}</span>
      <div className="cv-plaque__side">
        <span className={`cv-plaque__value ${valueClass(mv)}`}>{mv}</span>
        <Heading caravan={mine} />
      </div>
    </div>
  )
}

interface HudProps {
  config: MatchConfig
  status: string
  help: string
  log: { id: number; player: PlayerId; text: string }[]
  canDiscard: boolean
  hasSelection: boolean
  onDiscard: () => void
  onCancel: () => void
  myTurn: boolean
}

function Hud({ config, status, help, log, canDiscard, hasSelection, onDiscard, onCancel, myTurn }: HudProps) {
  const forfeit = useMatch((s) => s.forfeit)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])
  const opponent = opponentById(config.opponentId ?? '')

  return (
    <aside className="cv-hud screen" aria-label="Game status">
      <div className="cv-hud__head">
        <p className="cv-hud__label term-dim">{config.mode === 'ai' ? `Caravan against ${opponent?.name}` : 'Caravan, hot-seat'}</p>
        {config.wager > 0 && <p className="cv-hud__pot">Pot {config.wager * 2} caps</p>}
      </div>
      <p className="cv-hud__status" aria-live="polite">
        {status}
      </p>
      <p className="cv-hud__help">{help}</p>
      <div className="cv-hud__actions">
        <button className="term-button" disabled={!myTurn || !canDiscard} onClick={onDiscard}>
          Discard <span className="term-kbd">D</span>
        </button>
        <button className="term-button" disabled={!hasSelection} onClick={onCancel}>
          Cancel <span className="term-kbd">Esc</span>
        </button>
      </div>
      <ol className="cv-hud__log" ref={logRef} aria-label="Move log">
        {log.map((e) => (
          <li key={e.id} data-player={e.player}>
            {e.text}
          </li>
        ))}
      </ol>
      <div className="cv-hud__foot">
        <button className="term-button" onClick={() => setShowRules(true)}>
          Rules
        </button>
        {confirmLeave ? (
          <button
            className="term-button"
            onClick={() => void navigate('/caravan', { during: forfeit })}
          >
            {config.wager > 0 ? `Forfeit ${config.wager} caps` : 'Leave for real'}
          </button>
        ) : (
          <button className="term-button" onClick={() => setConfirmLeave(true)}>
            Leave table
          </button>
        )}
      </div>
      {showRules && (
        <div className="cv-overlay" role="dialog" aria-modal="true" aria-label="Caravan rules" onClick={() => setShowRules(false)}>
          <div className="cv-paper cv-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="cv-button cv-button--primary" autoFocus onClick={() => setShowRules(false)}>
              Back to the game
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

function GameOver() {
  const { config, settlement, start, leave } = useMatch()
  if (!config || !settlement) return null
  const opponent = opponentById(config.opponentId ?? '')
  const humanWon = config.mode === 'ai' && settlement.winner === 0
  const title = config.mode === 'hotseat' ? `${config.names[settlement.winner]} wins` : humanWon ? 'You win' : `${opponent?.name ?? 'Your opponent'} wins`
  const quote = opponent ? (humanWon ? opponent.lines.lose : opponent.lines.win) : null

  const rematch = () => {
    if (!start(config)) navigate('/caravan')
  }

  return (
    <div className="cv-overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
      <div className="cv-paper cv-gameover">
        <h2 id="gameover-title">{title}</h2>
        {quote && (
          <blockquote>
            <p>“{quote}”</p>
            <footer>{opponent?.name}</footer>
          </blockquote>
        )}
        {config.mode === 'ai' && config.wager > 0 && (
          <p className="cv-gameover__caps">{humanWon ? `+${config.wager} caps` : `−${config.wager} caps`}</p>
        )}
        {settlement.newCards.length > 0 && (
          <>
            <p>New cards for your collection:</p>
            <div className="cv-gameover__cards">
              {settlement.newCards.map((c: Card) => (
                <div key={c.id} className="cv-gameover__card">
                  <PlayingCard card={c} />
                </div>
              ))}
            </div>
          </>
        )}
        {settlement.bonusCaps > 0 && <p>You already own their whole set, so you got {settlement.bonusCaps} caps instead.</p>}
        <div className="cv-gameover__actions">
          <button className="cv-button cv-button--primary" onClick={rematch} autoFocus>
            Play again
          </button>
          <button
            className="cv-button"
            onClick={() => void navigate('/caravan', { during: leave })}
          >
            Back to the lobby
          </button>
        </div>
      </div>
    </div>
  )
}

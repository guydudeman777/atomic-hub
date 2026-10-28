import { useEffect, useRef, useState } from 'react'
import { PlayingCard } from '../../../components/PlayingCard'
import { playSfx } from '../../../core/audio/sfx'
import { Link } from '../../../router'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { OPPONENTS, type SavedDeck, deckCards, isUnlocked, setInfo } from '../content'
import { checkDeck } from '../engine'
import { type MatchConfig, useMatch } from './match'
import { GAME, SEATS, startOnline } from './online'
import { OnlinePanel } from '../../../net/ui/OnlinePanel'

const DIFFICULTY_LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const
const ONLINE_CLASSES = { card: 'cv-paper', button: 'cv-button', primary: 'cv-button cv-button--primary', field: 'cv-field', dim: 'cv-ink-dim' }

export function Lobby({ inviteCode = null }: { inviteCode?: string | null }) {
  const [mode, setMode] = useState<'ai' | 'hotseat' | 'online'>(inviteCode ? 'online' : 'ai')
  const inProgress = useMatch((s) => s.state !== null && s.state.winner === null && s.config?.mode !== 'online')

  return (
    <div className="cv-lobby">
      {inProgress && (
        <div className="cv-paper cv-resume">
          <p>You have a game in progress.</p>
          <Link to="/caravan/play" className="cv-button cv-button--primary">
            Return to the table
          </Link>
        </div>
      )}
      <div className="cv-tabs" role="tablist" aria-label="Opponent">
        <button role="tab" aria-selected={mode === 'ai'} className="cv-tab" onClick={() => setMode('ai')}>
          Against the AI
        </button>
        <button role="tab" aria-selected={mode === 'hotseat'} className="cv-tab" onClick={() => setMode('hotseat')}>
          Hot-seat
        </button>
        <button role="tab" aria-selected={mode === 'online'} className="cv-tab" onClick={() => setMode('online')}>
          Online
        </button>
      </div>
      {mode === 'ai' ? <AiSetup /> : mode === 'hotseat' ? <HotseatSetup /> : <OnlineSetup inviteCode={inviteCode} />}
    </div>
  )
}

function DeckPicker({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  const decks = useSave((s) => s.caravan.decks)
  return (
    <label className="cv-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {decks.map((d) => {
          const check = checkDeck(deckCards(d))
          return (
            <option key={d.id} value={d.id} disabled={!check.ok}>
              {d.name} ({d.cards.length} cards{check.ok ? '' : ', not ready'})
            </option>
          )
        })}
      </select>
    </label>
  )
}

function useDeck(id: string): SavedDeck {
  const decks = useSave((s) => s.caravan.decks)
  return decks.find((d) => d.id === id) ?? decks[0]
}

function AiSetup() {
  const beaten = useSave((s) => s.caravan.beaten)
  const caps = useSave((s) => s.wallet.caps)
  const activeDeckId = useSave((s) => s.caravan.activeDeckId)
  const setActiveDeck = useSave((s) => s.setActiveCaravanDeck)
  const start = useMatch((s) => s.start)

  const firstLocked = OPPONENTS.findIndex((_, i) => !isUnlocked(i, beaten))
  const [index, setIndex] = useState(() => Math.max(0, (firstLocked === -1 ? OPPONENTS.length : firstLocked) - 1))
  const opponent = OPPONENTS[index]
  const unlocked = isUnlocked(index, beaten)
  const maxWager = Math.min(opponent.maxWager, caps)
  const [wagerPick, setWager] = useState(0)
  const wager = Math.min(wagerPick, maxWager)
  const deck = useDeck(activeDeckId)
  const deckOk = checkDeck(deckCards(deck)).ok

  // On phones the ladder scrolls sideways; start with the chosen opponent in view.
  const ladderRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const ladder = ladderRef.current
    if (!ladder || ladder.scrollWidth <= ladder.clientWidth) return
    ladder.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
    // Only on arrival: after that the player scrolls it.
  }, [])

  const deal = () => {
    if (wager > useSave.getState().wallet.caps) {
      playSfx('error')
      return
    }
    const config: MatchConfig = {
      mode: 'ai',
      opponentId: opponent.id,
      wager,
      names: ['You', opponent.name],
      decks: [deckCards(deck), opponent.deck()],
    }
    playSfx('select')
    void navigate('/caravan/play', { during: () => start(config) })
  }

  return (
    <div className="cv-setup">
      <ol className="cv-ladder" aria-label="Opponents" ref={ladderRef}>
        {OPPONENTS.map((o, i) => {
          const open = isUnlocked(i, beaten)
          const wins = beaten[o.id] ?? 0
          return (
            <li key={o.id}>
              <button
                className={`cv-ladder__row${i === index ? ' is-active' : ''}${open ? '' : ' is-locked'}`}
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
              >
                <span className="cv-portrait" data-set={o.set} aria-hidden="true">
                  {open ? o.name.split(' ').map((w) => w[0]).join('').slice(0, 2) : '?'}
                </span>
                <span className="cv-ladder__name">{open ? o.name : 'Locked'}</span>
                <span className="cv-ladder__meta">
                  {open ? `${DIFFICULTY_LABEL[o.difficulty]}${wins ? `, beaten ${wins}×` : ''}` : `Beat ${OPPONENTS[i - 1].name} first`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <section className="cv-paper cv-opponent" aria-live="polite">
        {unlocked ? (
          <>
            <div className="cv-opponent__head">
              <span className="cv-portrait cv-portrait--big" data-set={opponent.set} aria-hidden="true">
                {opponent.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </span>
              <div>
                <h2>{opponent.name}</h2>
                <p className="cv-ink-dim">{DIFFICULTY_LABEL[opponent.difficulty]}</p>
              </div>
              <div className="cv-opponent__back" title={`${setInfo(opponent.set).name} deck`}>
                <PlayingCard faceDown set={opponent.set} />
              </div>
            </div>
            <p>{opponent.blurb}</p>
            <p className="cv-ink-dim">
              Plays the {setInfo(opponent.set).name} deck. Beat them to win {opponent.rewardCards} cards from it.
            </p>

            <div className="cv-opponent__form">
              <DeckPicker label="Your deck" value={deck.id} onChange={setActiveDeck} />
              <label className="cv-field">
                <span>
                  Wager <strong>{wager} caps</strong>
                  <span className="cv-ink-dim"> (they’ll match it, up to {opponent.maxWager})</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={maxWager}
                  step={maxWager >= 50 ? 10 : 1}
                  value={wager}
                  onChange={(e) => setWager(Number(e.target.value))}
                  disabled={maxWager === 0}
                />
              </label>
              {caps === 0 && <p className="cv-ink-dim">You’re out of caps, so this one’s for pride. Claim a refill from the hub menu.</p>}
              <button className="cv-button cv-button--primary cv-deal" onClick={deal} disabled={!deckOk}>
                Deal
              </button>
              {!deckOk && (
                <p className="cv-ink-dim">
                  That deck isn’t ready. <Link to="/caravan/decks">Fix it in the deck builder.</Link>
                </p>
              )}
              {wager > 0 && <p className="cv-ink-dim cv-note">Leaving the table early forfeits your wager.</p>}
            </div>
          </>
        ) : (
          <>
            <h2>Locked</h2>
            <p>Beat {OPPONENTS[index - 1].name} to take a seat at this table.</p>
          </>
        )}
      </section>
    </div>
  )
}

function HotseatSetup() {
  const decks = useSave((s) => s.caravan.decks)
  const start = useMatch((s) => s.start)
  const [names, setNames] = useState<[string, string]>(['Player 1', 'Player 2'])
  const [deckIds, setDeckIds] = useState<[string, string]>([decks[0].id, decks[0].id])
  const deckA = useDeck(deckIds[0])
  const deckB = useDeck(deckIds[1])
  const ready = checkDeck(deckCards(deckA)).ok && checkDeck(deckCards(deckB)).ok

  const deal = () => {
    const clean = names.map((n, i) => n.trim() || `Player ${i + 1}`) as [string, string]
    const config: MatchConfig = { mode: 'hotseat', wager: 0, names: clean, decks: [deckCards(deckA), deckCards(deckB)] }
    playSfx('select')
    void navigate('/caravan/play', { during: () => start(config) })
  }

  return (
    <section className="cv-paper cv-hotseat">
      <h2>Two players, one screen</h2>
      <p>Take turns at the same device. Between turns the table hides until the next player says they’re ready.</p>
      <div className="cv-hotseat__players">
        {[0, 1].map((i) => (
          <fieldset key={i} className="cv-hotseat__player">
            <legend>Seat {i + 1}</legend>
            <label className="cv-field">
              <span>Name</span>
              <input
                value={names[i]}
                maxLength={20}
                onChange={(e) => setNames((n) => (i === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
              />
            </label>
            <DeckPicker
              label="Deck"
              value={deckIds[i]}
              onChange={(id) => setDeckIds((d) => (i === 0 ? [id, d[1]] : [d[0], id]))}
            />
          </fieldset>
        ))}
      </div>
      <p className="cv-ink-dim">Both seats choose from the decks in your collection. Hot-seat games don’t use caps.</p>
      <button className="cv-button cv-button--primary cv-deal" onClick={deal} disabled={!ready}>
        Deal
      </button>
    </section>
  )
}

function OnlineSetup({ inviteCode }: { inviteCode: string | null }) {
  const activeDeckId = useSave((s) => s.caravan.activeDeckId)
  const setActiveDeck = useSave((s) => s.setActiveCaravanDeck)
  const deck = useDeck(activeDeckId)
  const deckOk = checkDeck(deckCards(deck)).ok
  return (
    <div className="cv-online">
      <section className="cv-paper cv-online__deck">
        <DeckPicker label="Your deck" value={deck.id} onChange={setActiveDeck} />
        {!deckOk && <p className="cv-ink-dim">That deck isn’t ready, so you’d bring the Wasteland Standard starter deck.</p>}
      </section>
      <OnlinePanel
        game={GAME}
        seats={SEATS}
        lateJoin={false}
        classes={ONLINE_CLASSES}
        inviteCode={inviteCode}
        tablePath="/caravan/play"
        seatLabel={(seat) => (seat === 0 ? 'Host' : 'Guest')}
        startable={(roster) => (roster.length >= 2 ? true : 'Waiting for someone to sit across from you.')}
        onStart={startOnline}
        note="Each of you plays your own deck. Online games don’t use caps or go on your record."
      />
    </div>
  )
}

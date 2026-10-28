import { useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { Link } from '../../../router'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { LEVEL_LABEL, OPPONENTS, isUnlocked } from '../content'
import type { Player, Variant } from '../engine'
import { MarkIcon } from './Drawn'
import { type MatchConfig, useMatch } from './match'
import { GAME, SEATS, startOnline } from './online'
import { OnlinePanel } from '../../../net/ui/OnlinePanel'

const ONLINE_CLASSES = { card: 'tt-card', button: 'tt-button', primary: 'tt-button tt-button--primary', field: 'tt-field', dim: 'tt-ink-dim' }

const VARIANTS: { id: Variant; name: string; blurb: string }[] = [
  { id: 'classic', name: 'Classic', blurb: 'The 3×3 everyone knows. Three in a row wins.' },
  { id: 'ultimate', name: 'Ultimate', blurb: 'Nine little grids in a big one. Where you play sends your opponent.' },
]

export function Lobby({ inviteCode = null }: { inviteCode?: string | null }) {
  const [mode, setMode] = useState<'ai' | 'hotseat' | 'online'>(inviteCode ? 'online' : 'ai')
  const inProgress = useMatch((s) => s.state !== null && !s.state.over && s.config?.mode !== 'online')
  const tab = (id: typeof mode, label: string) => (
    <button
      role="tab"
      aria-selected={mode === id}
      className="tt-tab"
      onClick={() => {
        setMode(id)
        playSfx('tick')
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="tt-lobby">
      {inProgress && (
        <div className="tt-card tt-resume">
          <p>You have a game in progress.</p>
          <Link to="/tictactoe/play" className="tt-button tt-button--primary">
            Back to the booth
          </Link>
        </div>
      )}
      <div className="tt-tabs" role="tablist" aria-label="Opponent">
        {tab('ai', 'Against the AI')}
        {tab('hotseat', 'Hot-seat')}
        {tab('online', 'Online')}
      </div>
      {mode === 'ai' ? <AiSetup /> : mode === 'hotseat' ? <HotseatSetup /> : <OnlineSetup inviteCode={inviteCode} />}
    </div>
  )
}

/** Classic or Ultimate, remembered for next time. */
function VariantPicker() {
  const variant = useSave((s) => s.tictactoe.variant)
  const update = useSave((s) => s.updateTicTacToe)
  return (
    <fieldset className="tt-variants">
      <legend>Game</legend>
      {VARIANTS.map((v) => (
        <label key={v.id} className={`tt-variant${variant === v.id ? ' is-picked' : ''}`}>
          <input
            type="radio"
            name="tt-variant"
            checked={variant === v.id}
            onChange={() => {
              update({ variant: v.id })
              playSfx('tick')
            }}
          />
          <span className="tt-variant__name">{v.name}</span>
          <span className="tt-variant__blurb">{v.blurb}</span>
        </label>
      ))}
    </fieldset>
  )
}

function AiSetup() {
  const beaten = useSave((s) => s.tictactoe.beaten)
  const variant = useSave((s) => s.tictactoe.variant)
  const start = useMatch((s) => s.start)
  const firstLocked = OPPONENTS.findIndex((_, i) => !isUnlocked(i, beaten))
  // Start on the toughest opponent you've opened up.
  const [index, setIndex] = useState(() => (firstLocked === -1 ? OPPONENTS.length : firstLocked) - 1)
  const [you, setYou] = useState<Player>(0)
  const opponent = OPPONENTS[index]
  const unlocked = isUnlocked(index, beaten)
  const wins = beaten[opponent.id] ?? 0
  const last = index === OPPONENTS.length - 1

  const sitDown = () => {
    if (!unlocked) {
      playSfx('error')
      return
    }
    const names: [string, string] = you === 0 ? ['You', opponent.name] : [opponent.name, 'You']
    const config: MatchConfig = { mode: 'ai', variant, opponentId: opponent.id, names, you, xPerson: you === 0 ? 0 : 1 }
    playSfx('select')
    void navigate('/tictactoe/play', { during: () => start(config) })
  }

  return (
    <div className="tt-setup">
      <ol className="tt-ladder" aria-label="Opponents">
        {OPPONENTS.map((o, i) => {
          const open = isUnlocked(i, beaten)
          const won = beaten[o.id] ?? 0
          return (
            <li key={o.id}>
              <button
                className={`tt-ladder__row${i === index ? ' is-active' : ''}${open ? '' : ' is-locked'}`}
                onClick={() => {
                  setIndex(i)
                  playSfx('tick')
                }}
                aria-pressed={i === index}
              >
                <span className="tt-portrait" style={{ background: open ? o.color : undefined }} aria-hidden="true">
                  {open ? o.initials : '?'}
                </span>
                <span className="tt-ladder__name">{open ? o.name : 'Locked'}</span>
                <span className="tt-ladder__meta">
                  {open ? `${LEVEL_LABEL[o.level]}${won ? `, beaten ${won}×` : ''}` : `Beat ${OPPONENTS[i - 1].name} first`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <section className="tt-card tt-opponent" aria-live="polite">
        {unlocked ? (
          <>
            <div className="tt-opponent__head">
              <span className="tt-portrait tt-portrait--big" style={{ background: opponent.color }} aria-hidden="true">
                {opponent.initials}
              </span>
              <div>
                <h2>{opponent.name}</h2>
                <p className="tt-ink-dim">
                  {LEVEL_LABEL[opponent.level]}
                  {wins ? `. You’ve beaten them ${wins === 1 ? 'once' : `${wins} times`}.` : ''}
                </p>
              </div>
            </div>
            <p>{opponent.blurb}</p>

            <VariantPicker />
            <fieldset className="tt-marks">
              <legend>You play</legend>
              {([0, 1] as const).map((p) => (
                <label key={p} className="tt-mark-choice">
                  <input type="radio" name="tt-mark" checked={you === p} onChange={() => setYou(p)} />
                  <MarkIcon player={p} />
                  {p === 0 ? 'X, moves first' : 'O'}
                </label>
              ))}
            </fieldset>
            <button className="tt-button tt-button--primary tt-start" onClick={sitDown}>
              Slide into the booth
            </button>
            {last && variant === 'classic' && (
              <p className="tt-ink-dim tt-note">Nobody beats perfect play at Classic. A cat’s game is a good night’s work.</p>
            )}
            {!last && !wins && <p className="tt-ink-dim tt-note">Beat {opponent.name} at either game to meet {OPPONENTS[index + 1].name}.</p>}
          </>
        ) : (
          <>
            <h2>Locked</h2>
            <p>Beat {OPPONENTS[index - 1].name}, at Classic or Ultimate, to get a game with this one.</p>
          </>
        )}
      </section>
    </div>
  )
}

function HotseatSetup() {
  const start = useMatch((s) => s.start)
  const variant = useSave((s) => s.tictactoe.variant)
  const [names, setNames] = useState<[string, string]>(['Player 1', 'Player 2'])

  const sitDown = () => {
    const clean = names.map((n, i) => n.trim() || `Player ${i + 1}`) as [string, string]
    const config: MatchConfig = { mode: 'hotseat', variant, names: clean, you: 0, xPerson: 0 }
    playSfx('select')
    void navigate('/tictactoe/play', { during: () => start(config) })
  }

  return (
    <section className="tt-card tt-hotseat">
      <h2>Two players, one placemat</h2>
      <p>Pass the grease pencil back and forth across the booth. X goes first, and you swap marks every game, so you both get a turn at going first.</p>
      <VariantPicker />
      <div className="tt-hotseat__players">
        {([0, 1] as const).map((p) => (
          <label key={p} className="tt-field">
            <span>
              <MarkIcon player={p} /> {p === 0 ? 'X in the first game' : 'O in the first game'}
            </span>
            <input
              value={names[p]}
              maxLength={20}
              onChange={(e) => setNames((n) => (p === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
            />
          </label>
        ))}
      </div>
      <p className="tt-ink-dim">Hot-seat games don’t go on your record.</p>
      <button className="tt-button tt-button--primary tt-start" onClick={sitDown}>
        Start the game
      </button>
    </section>
  )
}

function OnlineSetup({ inviteCode }: { inviteCode: string | null }) {
  const [mark, setMark] = useState<Player | 'random'>('random')
  const variant = useSave((s) => s.tictactoe.variant)
  return (
    <OnlinePanel
      game={GAME}
      seats={SEATS}
      lateJoin={false}
      classes={ONLINE_CLASSES}
      inviteCode={inviteCode}
      tablePath="/tictactoe/play"
      seatLabel={(seat) => (seat === 0 ? 'Host' : 'Guest')}
      startable={(roster) => (roster.length >= 2 ? true : 'Waiting for someone to slide into the booth.')}
      roomOptions={
        <>
          <VariantPicker />
          <fieldset className="tt-marks">
            <legend>You play</legend>
            {(['random', 0, 1] as const).map((p) => (
              <label key={p} className="tt-mark-choice">
                <input type="radio" name="tt-online-mark" checked={mark === p} onChange={() => setMark(p)} />
                {p === 'random' ? 'Toss for it' : <><MarkIcon player={p} /> {p === 0 ? 'X, moves first' : 'O'}</>}
              </label>
            ))}
          </fieldset>
        </>
      }
      onStart={(link) => startOnline(link, variant, mark)}
      note="Online games don’t go on your record. X and O swap every game."
    />
  )
}

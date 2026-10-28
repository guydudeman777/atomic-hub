import { useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { Link } from '../../../router'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { LEVEL_LABEL, OPPONENTS, isUnlocked } from '../content'
import type { Player } from '../engine'
import { CheckerIcon } from './CheckerIcon'
import { type MatchConfig, useMatch } from './match'
import { GAME, SEATS, startOnline } from './online'
import { OnlinePanel } from '../../../net/ui/OnlinePanel'

const ONLINE_CLASSES = { card: 'c4-card', button: 'c4-button', primary: 'c4-button c4-button--primary', field: 'c4-field', dim: 'c4-ink-dim' }

const COLOR_LABEL: Record<Player, string> = { 0: 'Red, drops first', 1: 'Yellow' }

export function Lobby({ inviteCode = null }: { inviteCode?: string | null }) {
  const [mode, setMode] = useState<'ai' | 'hotseat' | 'online'>(inviteCode ? 'online' : 'ai')
  const inProgress = useMatch((s) => s.state !== null && !s.state.over && s.config?.mode !== 'online')
  const pick = (next: typeof mode) => {
    setMode(next)
    playSfx('tick')
  }

  return (
    <div className="c4-lobby">
      {inProgress && (
        <div className="c4-card c4-resume">
          <p>You have a game in progress.</p>
          <Link to="/connect4/play" className="c4-button c4-button--primary">
            Back to the rack
          </Link>
        </div>
      )}
      <div className="c4-tabs" role="tablist" aria-label="Opponent">
        <button role="tab" aria-selected={mode === 'ai'} className="c4-tab" onClick={() => pick('ai')}>
          Against the AI
        </button>
        <button role="tab" aria-selected={mode === 'hotseat'} className="c4-tab" onClick={() => pick('hotseat')}>
          Hot-seat
        </button>
        <button role="tab" aria-selected={mode === 'online'} className="c4-tab" onClick={() => pick('online')}>
          Online
        </button>
      </div>
      {mode === 'ai' ? <AiSetup /> : mode === 'hotseat' ? <HotseatSetup /> : <OnlineSetup inviteCode={inviteCode} />}
    </div>
  )
}

function AiSetup() {
  const beaten = useSave((s) => s.connect4.beaten)
  const start = useMatch((s) => s.start)
  const firstLocked = OPPONENTS.findIndex((_, i) => !isUnlocked(i, beaten))
  // Start on the toughest opponent you've opened up.
  const [index, setIndex] = useState(() => (firstLocked === -1 ? OPPONENTS.length : firstLocked) - 1)
  const [you, setYou] = useState<Player>(0)
  const opponent = OPPONENTS[index]
  const unlocked = isUnlocked(index, beaten)
  const wins = beaten[opponent.id] ?? 0

  const sitDown = () => {
    if (!unlocked) {
      playSfx('error')
      return
    }
    const names: [string, string] = you === 0 ? ['You', opponent.name] : [opponent.name, 'You']
    const config: MatchConfig = { mode: 'ai', opponentId: opponent.id, names, you }
    playSfx('select')
    void navigate('/connect4/play', { during: () => start(config) })
  }

  return (
    <div className="c4-setup">
      <ol className="c4-ladder" aria-label="Opponents">
        {OPPONENTS.map((o, i) => {
          const open = isUnlocked(i, beaten)
          const won = beaten[o.id] ?? 0
          return (
            <li key={o.id}>
              <button
                className={`c4-ladder__row${i === index ? ' is-active' : ''}${open ? '' : ' is-locked'}`}
                onClick={() => {
                  setIndex(i)
                  playSfx('tick')
                }}
                aria-pressed={i === index}
              >
                <span className="c4-portrait" style={{ background: open ? o.color : undefined }} aria-hidden="true">
                  {open ? o.initials : '?'}
                </span>
                <span className="c4-ladder__name">{open ? o.name : 'Locked'}</span>
                <span className="c4-ladder__meta">
                  {open ? `${LEVEL_LABEL[o.level]}${won ? `, beaten ${won}×` : ''}` : `Beat ${OPPONENTS[i - 1].name} first`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <section className="c4-card c4-opponent" aria-live="polite">
        {unlocked ? (
          <>
            <div className="c4-opponent__head">
              <span className="c4-portrait c4-portrait--big" style={{ background: opponent.color }} aria-hidden="true">
                {opponent.initials}
              </span>
              <div>
                <h2>{opponent.name}</h2>
                <p className="c4-ink-dim">
                  {opponent.booth}. {LEVEL_LABEL[opponent.level]}
                  {wins ? `. You’ve beaten them ${wins === 1 ? 'once' : `${wins} times`}.` : '.'}
                </p>
              </div>
            </div>
            <p>{opponent.blurb}</p>

            <fieldset className="c4-colors">
              <legend>Your color</legend>
              {([0, 1] as const).map((p) => (
                <label key={p} className="c4-color">
                  <input type="radio" name="c4-color" checked={you === p} onChange={() => setYou(p)} />
                  <CheckerIcon player={p} />
                  {COLOR_LABEL[p]}
                </label>
              ))}
            </fieldset>
            <button className="c4-button c4-button--primary c4-start" onClick={sitDown}>
              Sit down
            </button>
            {index < OPPONENTS.length - 1 && !wins && (
              <p className="c4-ink-dim c4-note">Beat {opponent.name} to meet {OPPONENTS[index + 1].name}.</p>
            )}
          </>
        ) : (
          <>
            <h2>Locked</h2>
            <p>Beat {OPPONENTS[index - 1].name} to get a game with this one.</p>
          </>
        )}
      </section>
    </div>
  )
}

function HotseatSetup() {
  const start = useMatch((s) => s.start)
  const [names, setNames] = useState<[string, string]>(['Player 1', 'Player 2'])

  const sitDown = () => {
    const clean = names.map((n, i) => n.trim() || `Player ${i + 1}`) as [string, string]
    const config: MatchConfig = { mode: 'hotseat', names: clean, you: 0 }
    playSfx('select')
    void navigate('/connect4/play', { during: () => start(config) })
  }

  return (
    <section className="c4-card c4-hotseat">
      <h2>Two players, one rack</h2>
      <p>Stand at the booth together and take turns dropping. Nothing’s hidden in Connect Four, so nobody has to look away.</p>
      <div className="c4-hotseat__players">
        {([0, 1] as const).map((p) => (
          <label key={p} className="c4-field">
            <span>
              <CheckerIcon player={p} /> {COLOR_LABEL[p]}
            </span>
            <input
              value={names[p]}
              maxLength={20}
              onChange={(e) => setNames((n) => (p === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
            />
          </label>
        ))}
      </div>
      <p className="c4-ink-dim">Hot-seat games don’t go on your record.</p>
      <button className="c4-button c4-button--primary c4-start" onClick={sitDown}>
        Start the game
      </button>
    </section>
  )
}

function OnlineSetup({ inviteCode }: { inviteCode: string | null }) {
  const [color, setColor] = useState<Player | 'random'>('random')
  return (
    <OnlinePanel
      game={GAME}
      seats={SEATS}
      lateJoin={false}
      classes={ONLINE_CLASSES}
      inviteCode={inviteCode}
      tablePath="/connect4/play"
      seatLabel={(seat) => (seat === 0 ? 'Host' : 'Guest')}
      startable={(roster) => (roster.length >= 2 ? true : 'Waiting for someone to step up to the booth.')}
      roomOptions={
        <fieldset className="c4-colors">
          <legend>You play</legend>
          {(['random', 0, 1] as const).map((p) => (
            <label key={p} className="c4-color">
              <input type="radio" name="c4-online-color" checked={color === p} onChange={() => setColor(p)} />
              {p === 'random' ? 'Toss for it' : <><CheckerIcon player={p} /> {COLOR_LABEL[p]}</>}
            </label>
          ))}
        </fieldset>
      }
      onStart={(link) => startOnline(link, color)}
      note="Online games don’t go on your record. Colors swap every game."
    />
  )
}

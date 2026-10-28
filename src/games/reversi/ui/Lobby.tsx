import { useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { Link } from '../../../router'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { LEVEL_LABEL, OPPONENTS, isUnlocked } from '../content'
import type { Player } from '../engine'
import { DiscIcon } from './DiscIcon'
import { type MatchConfig, useMatch } from './match'
import { GAME, SEATS, startOnline } from './online'
import { OnlinePanel } from '../../../net/ui/OnlinePanel'

const ONLINE_CLASSES = { card: 'rv-card', button: 'rv-button', primary: 'rv-button rv-button--primary', field: 'rv-field', dim: 'rv-ink-dim' }

export function Lobby({ inviteCode = null }: { inviteCode?: string | null }) {
  const [mode, setMode] = useState<'ai' | 'hotseat' | 'online'>(inviteCode ? 'online' : 'ai')
  const inProgress = useMatch((s) => s.state !== null && !s.state.over && s.config?.mode !== 'online')

  return (
    <div className="rv-lobby">
      {inProgress && (
        <div className="rv-card rv-resume">
          <p>You have a game in progress.</p>
          <Link to="/reversi/play" className="rv-button rv-button--primary">
            Back to the board
          </Link>
        </div>
      )}
      <div className="rv-tabs" role="tablist" aria-label="Opponent">
        <button
          role="tab"
          aria-selected={mode === 'ai'}
          className="rv-tab"
          onClick={() => {
            setMode('ai')
            playSfx('tick')
          }}
        >
          Against the AI
        </button>
        <button
          role="tab"
          aria-selected={mode === 'hotseat'}
          className="rv-tab"
          onClick={() => {
            setMode('hotseat')
            playSfx('tick')
          }}
        >
          Hot-seat
        </button>
        <button
          role="tab"
          aria-selected={mode === 'online'}
          className="rv-tab"
          onClick={() => {
            setMode('online')
            playSfx('tick')
          }}
        >
          Online
        </button>
      </div>
      {mode === 'ai' ? <AiSetup /> : mode === 'hotseat' ? <HotseatSetup /> : <OnlineSetup inviteCode={inviteCode} />}
    </div>
  )
}

function AiSetup() {
  const beaten = useSave((s) => s.reversi.beaten)
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
    void navigate('/reversi/play', { during: () => start(config) })
  }

  return (
    <div className="rv-setup">
      <ol className="rv-ladder" aria-label="Opponents">
        {OPPONENTS.map((o, i) => {
          const open = isUnlocked(i, beaten)
          const won = beaten[o.id] ?? 0
          return (
            <li key={o.id}>
              <button
                className={`rv-ladder__row${i === index ? ' is-active' : ''}${open ? '' : ' is-locked'}`}
                onClick={() => {
                  setIndex(i)
                  playSfx('tick')
                }}
                aria-pressed={i === index}
              >
                <span className="rv-portrait" style={{ background: open ? o.color : undefined }} aria-hidden="true">
                  {open ? o.initials : '?'}
                </span>
                <span className="rv-ladder__name">{open ? o.name : 'Locked'}</span>
                <span className="rv-ladder__meta">
                  {open ? `${LEVEL_LABEL[o.level]}${won ? `, beaten ${won}×` : ''}` : `Beat ${OPPONENTS[i - 1].name} first`}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <section className="rv-card rv-opponent" aria-live="polite">
        {unlocked ? (
          <>
            <div className="rv-opponent__head">
              <span className="rv-portrait rv-portrait--big" style={{ background: opponent.color }} aria-hidden="true">
                {opponent.initials}
              </span>
              <div>
                <h2>{opponent.name}</h2>
                <p className="rv-ink-dim">
                  {LEVEL_LABEL[opponent.level]}
                  {wins ? `. You’ve beaten them ${wins === 1 ? 'once' : `${wins} times`}.` : ''}
                </p>
              </div>
            </div>
            <p>{opponent.blurb}</p>

            <fieldset className="rv-colors">
              <legend>Your color</legend>
              {([0, 1] as const).map((p) => (
                <label key={p} className="rv-color">
                  <input type="radio" name="rv-color" checked={you === p} onChange={() => setYou(p)} />
                  <DiscIcon player={p} />
                  {p === 0 ? 'Black, moves first' : 'White'}
                </label>
              ))}
            </fieldset>
            <button className="rv-button rv-button--primary rv-start" onClick={sitDown}>
              Sit down
            </button>
            {index < OPPONENTS.length - 1 && !wins && (
              <p className="rv-ink-dim rv-note">Beat {opponent.name} to meet {OPPONENTS[index + 1].name}.</p>
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
    void navigate('/reversi/play', { during: () => start(config) })
  }

  return (
    <section className="rv-card rv-hotseat">
      <h2>Two players, one board</h2>
      <p>Sit across the coffee table and take turns. There’s nothing hidden in Reversi, so nobody has to look away.</p>
      <div className="rv-hotseat__players">
        {([0, 1] as const).map((p) => (
          <label key={p} className="rv-field">
            <span>
              <DiscIcon player={p} /> {p === 0 ? 'Black, moves first' : 'White'}
            </span>
            <input
              value={names[p]}
              maxLength={20}
              onChange={(e) => setNames((n) => (p === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
            />
          </label>
        ))}
      </div>
      <p className="rv-ink-dim">Hot-seat games don’t go on your record.</p>
      <button className="rv-button rv-button--primary rv-start" onClick={sitDown}>
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
      tablePath="/reversi/play"
      seatLabel={(seat) => (seat === 0 ? 'Host' : 'Guest')}
      startable={(roster) => (roster.length >= 2 ? true : 'Waiting for someone to sit across from you.')}
      roomOptions={
        <fieldset className="rv-colors">
          <legend>You play</legend>
          {(['random', 0, 1] as const).map((p) => (
            <label key={p} className="rv-color">
              <input type="radio" name="rv-online-color" checked={color === p} onChange={() => setColor(p)} />
              {p === 'random' ? 'Toss for it' : <><DiscIcon player={p} /> {p === 0 ? 'Black, moves first' : 'White'}</>}
            </label>
          ))}
        </fieldset>
      }
      onStart={(link) => startOnline(link, color)}
      note="Online games don’t go on your record. Colors swap every game."
    />
  )
}

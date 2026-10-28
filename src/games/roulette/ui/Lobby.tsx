import { type CSSProperties, useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { navigate } from '../../../navigation'
import { OnlinePanel } from '../../../net/ui/OnlinePanel'
import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { STAKES, WHEELS, buyInOf, wheelById } from '../content'
import { type WheelKind, WHEEL_ORDER, colorOf } from '../engine'
import { REGULARS } from '../regulars'
import { GAME, SEATS, startOnline } from './online'
import { useSession } from './session'

const ONLINE_CLASSES = { card: 'rl-panel', button: 'rl-button', primary: 'rl-button rl-button--primary', field: 'rl-field', dim: 'rl-ink-dim' }

/** The wheel picked last, for this visit. */
let lastWheel: WheelKind = 'european'
let lastStakes = STAKES[0].id

export function Lobby({ inviteCode = null }: { inviteCode?: string | null }) {
  const [where, setWhere] = useState<'salon' | 'online'>(inviteCode ? 'online' : 'salon')
  return (
    <div className="rl-lobby">
      <div className="rl-tabs" role="tablist" aria-label="Where to play">
        <button
          role="tab"
          aria-selected={where === 'salon'}
          className="rl-tab"
          onClick={() => {
            setWhere('salon')
            playSfx('tick')
          }}
        >
          At the wheel
        </button>
        <button
          role="tab"
          aria-selected={where === 'online'}
          className="rl-tab"
          onClick={() => {
            setWhere('online')
            playSfx('tick')
          }}
        >
          Online
        </button>
      </div>
      {where === 'salon' ? <SalonSetup /> : <OnlineSetup inviteCode={inviteCode} />}
    </div>
  )
}

/** A little wheel for the picker: its pockets in their colors, round a brass hub. */
function WheelGlyph({ wheel }: { wheel: WheelKind }) {
  const order = WHEEL_ORDER[wheel]
  const step = (Math.PI * 2) / order.length
  const fill = { red: '#c62a35', black: '#1a1617', green: '#21905a' }
  return (
    <svg className="rl-glyph" viewBox="-50 -50 100 100" aria-hidden="true">
      <circle r="49" fill="#4a1a0c" stroke="#d6ad55" strokeWidth="2" />
      {order.map((pocket, i) => {
        const a0 = i * step - step / 2 - Math.PI / 2
        const a1 = a0 + step
        const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`
        return <path key={pocket} d={`M${p(42, a0)}A42 42 0 0 1 ${p(42, a1)}L${p(27, a1)}A27 27 0 0 0 ${p(27, a0)}Z`} fill={fill[colorOf(pocket)]} />
      })}
      <circle r="27" fill="#6e2f15" stroke="#d6ad55" strokeWidth="1.5" />
      <path d="M0 -20V20M-20 0H20" stroke="#d6ad55" strokeWidth="3" strokeLinecap="round" />
      <circle r="6" fill="#f0d590" />
    </svg>
  )
}

function WheelPicker({ wheel, onPick }: { wheel: WheelKind; onPick: (w: WheelKind) => void }) {
  return (
    <div className="rl-wheels" role="radiogroup" aria-label="Wheel">
      {WHEELS.map((w) => (
        <button
          key={w.id}
          role="radio"
          aria-checked={wheel === w.id}
          className="rl-wheel-pick"
          onClick={() => {
            onPick(w.id)
            playSfx('tick')
          }}
        >
          <WheelGlyph wheel={w.id} />
          <span className="rl-wheel-pick__name">{w.name}</span>
          <span className="rl-wheel-pick__blurb">{w.blurb}</span>
          <span className="rl-wheel-pick__edge">{w.edge}</span>
        </button>
      ))}
    </div>
  )
}

function SalonSetup() {
  const caps = useSave((s) => s.wallet.caps)
  const seated = useSession((s) => s.state !== null && s.online === null)
  const sit = useSession((s) => s.sit)
  const [wheel, setWheel] = useState<WheelKind>(lastWheel)
  const [stakesId, setStakes] = useState(lastStakes)
  const stakes = STAKES.find((s) => s.id === stakesId) ?? STAKES[0]
  const buyIn = buyInOf(stakes)
  const canSit = caps >= buyIn
  const pickWheel = (w: WheelKind) => {
    lastWheel = w
    setWheel(w)
  }

  const takeSeat = () => {
    if (!canSit) {
      playSfx('error')
      return
    }
    playSfx('select')
    void navigate('/roulette/play', { during: () => sit({ stakesId: stakes.id, wheel }) })
  }

  return (
    <>
      {seated && (
        <div className="rl-panel rl-resume">
          <p>Your chips are still on the {wheelById(useSession.getState().state!.wheel).name} layout.</p>
          <Link to="/roulette/play" className="rl-button rl-button--primary">
            Back to the wheel
          </Link>
        </div>
      )}

      <section className="rl-panel rl-lobby__section" aria-labelledby="rl-wheel-title">
        <h2 id="rl-wheel-title">Pick a wheel</h2>
        <WheelPicker wheel={wheel} onPick={pickWheel} />
      </section>

      <section className="rl-panel rl-lobby__section" aria-labelledby="rl-stakes-title">
        <h2 id="rl-stakes-title">Pick a table</h2>
        <div className="rl-stakes" role="radiogroup" aria-labelledby="rl-stakes-title">
          {STAKES.map((s) => {
            const short = caps < buyInOf(s)
            return (
              <button
                key={s.id}
                role="radio"
                aria-checked={stakes.id === s.id}
                className={`rl-stake${short ? ' is-short' : ''}`}
                onClick={() => {
                  lastStakes = s.id
                  setStakes(s.id)
                  playSfx('tick')
                }}
              >
                <span className="rl-stake__name">{s.name}</span>
                <span className="rl-stake__limits">
                  <span>Inside {s.limits.insideMin}–{s.limits.straightMax.toLocaleString()}</span>
                  <span>Outside {s.limits.outsideMin}–{s.limits.outsideMax.toLocaleString()}</span>
                </span>
                <span className="rl-stake__blurb">{s.blurb}</span>
                <span className="rl-stake__croupier">{short ? `You need ${buyInOf(s)} caps to sit here.` : `${s.croupier.name} is at the wheel.`}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="rl-lobby__go">
        <button className="rl-button rl-button--primary rl-button--big" onClick={takeSeat} disabled={!canSit || seated}>
          Take a seat
        </button>
        <p className="rl-ink-dim">
          {seated
            ? 'Pick up your chips from your table first.'
            : canSit
              ? `The ${wheelById(wheel).name} wheel at ${stakes.name === 'The Salon' ? 'the Salon' : `the ${stakes.name}`}. ${wheelById(wheel).edge}`
              : caps < 50
                ? 'You’re short on caps. Claim a refill from the hub menu.'
                : 'Pick a table you can cover.'}
        </p>
      </div>

      <section className="rl-panel rl-lobby__section rl-regulars" aria-labelledby="rl-regulars-title">
        <h2 id="rl-regulars-title">At the wheel</h2>
        <p className="rl-ink-dim">Three regulars sit in on any night, each with a system they swear by and chips of their own color. When one runs out of caps, someone else sits down.</p>
        <ul>
          {REGULARS.map((r) => (
            <li key={r.id}>
              <span className="rl-plate__chip" style={{ '--c': r.color } as CSSProperties} aria-hidden="true" />
              <span>
                <strong>{r.name}</strong> {r.blurb}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rl-panel rl-lobby__section rl-primer" aria-labelledby="rl-primer-title">
        <h2 id="rl-primer-title">New to the game?</h2>
        <ol>
          <li>
            <strong>Put a chip on red or black.</strong> Even money, and the simplest bet there is.
          </li>
          <li>
            <strong>Try a number straight up.</strong> It pays 35 to 1, and comes up about once in 37 spins.
          </li>
          <li>
            <strong>Spin.</strong> Winners are paid and stay up; losers are swept. Rebet puts them back.
          </li>
        </ol>
        <p className="rl-ink-dim">
          Every bet on a wheel costs much the same, so play what you enjoy. The French wheel’s la partage is the best deal in the house. <Link to="/roulette/bets">Every bet and its odds</Link>.
        </p>
      </section>
    </>
  )
}

function OnlineSetup({ inviteCode }: { inviteCode: string | null }) {
  const caps = useSave((s) => s.wallet.caps)
  const [stakesId, setStakes] = useState(lastStakes)
  const [wheel, setWheel] = useState<WheelKind>(lastWheel)
  const stakes = STAKES.find((s) => s.id === stakesId) ?? STAKES[0]
  return (
    <OnlinePanel
      game={GAME}
      seats={SEATS}
      lateJoin
      classes={ONLINE_CLASSES}
      inviteCode={inviteCode}
      tablePath="/roulette/play"
      seatLabel={(seat) => (seat === 0 ? 'Host' : `Seat ${seat + 1}`)}
      startable={() => (caps >= buyInOf(stakes) ? true : `You need ${buyInOf(stakes)} caps for ${stakes.name === 'The Salon' ? 'the Salon' : `the ${stakes.name}`}.`)}
      roomOptions={
        <div className="rl-room-options">
          <label className="rl-field">
            <span>Wheel</span>
            <select value={wheel} onChange={(e) => setWheel(e.target.value as WheelKind)}>
              {WHEELS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rl-field">
            <span>Table</span>
            <select value={stakesId} onChange={(e) => setStakes(e.target.value)}>
              {STAKES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, outside bets {s.limits.outsideMin}–{s.limits.outsideMax.toLocaleString()} caps
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      onStart={(link) => startOnline(link, stakesId, wheel)}
      note="Everyone bets their own caps on the same wheel, in their own chip color. The croupier spins once everyone’s done, and friends can sit down between spins, up to five at the wheel."
    />
  )
}

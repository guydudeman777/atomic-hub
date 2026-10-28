import { useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { Link } from '../../../router'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { REGULARS, STAKES, type TableMode } from '../content'
import { SPOT_INDEXES, WIDE_LAYOUT } from './layout'
import { useSession } from './session'

const MODES: { id: TableMode; name: string; blurb: string }[] = [
  {
    id: 'full',
    name: 'Full table',
    blurb: 'You in the middle seat with four regulars. They play their own way, bet their own caps, and have opinions about your hand.',
  },
  {
    id: 'heads-up',
    name: 'One on one',
    blurb: 'Just you and the dealer. Quicker rounds, nobody watching.',
  },
]

export function Lobby() {
  const caps = useSave((s) => s.wallet.caps)
  const seated = useSession((s) => s.state !== null)
  const sit = useSession((s) => s.sit)
  const [mode, setMode] = useState<TableMode>('full')
  const [stakesPick, setStakes] = useState(STAKES[0].id)
  const stakes = STAKES.find((s) => s.id === stakesPick) ?? STAKES[0]
  const canSit = caps >= stakes.limits.min

  const takeSeat = () => {
    if (!canSit) {
      playSfx('error')
      return
    }
    playSfx('select')
    void navigate('/blackjack/play', { during: () => sit({ mode, stakesId: stakes.id }) })
  }

  return (
    <div className="bj-lobby">
      {seated && (
        <div className="bj-panel bj-resume">
          <p>You still have a seat at the {useSession.getState().stakes?.name.toLowerCase()} table.</p>
          <Link to="/blackjack/play" className="bj-button bj-button--primary">
            Back to your seat
          </Link>
        </div>
      )}

      <section className="bj-panel bj-lobby__section" aria-labelledby="bj-mode-title">
        <h2 id="bj-mode-title">Who’s at the table</h2>
        <div className="bj-modes" role="radiogroup" aria-labelledby="bj-mode-title">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              className="bj-mode"
              onClick={() => {
                setMode(m.id)
                playSfx('tick')
              }}
            >
              <MiniTable full={m.id === 'full'} />
              <span className="bj-mode__name">{m.name}</span>
              <span className="bj-mode__blurb">{m.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="bj-panel bj-lobby__section" aria-labelledby="bj-stakes-title">
        <h2 id="bj-stakes-title">Pick a table</h2>
        <div className="bj-stakes" role="radiogroup" aria-labelledby="bj-stakes-title">
          {STAKES.map((s) => {
            const short = caps < s.limits.min
            return (
              <button
                key={s.id}
                role="radio"
                aria-checked={stakes.id === s.id}
                className={`bj-stake${short ? ' is-short' : ''}`}
                onClick={() => {
                  setStakes(s.id)
                  playSfx('tick')
                }}
              >
                <span className="bj-stake__sign">
                  <span className="bj-stake__name">{s.name}</span>
                  <span className="bj-stake__limits">
                    {s.limits.min}–{s.limits.max}
                  </span>
                </span>
                <span className="bj-stake__blurb">{s.blurb}</span>
                <span className="bj-stake__dealer">{short ? `You need ${s.limits.min} caps to sit here.` : `${s.dealer.name} is dealing.`}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="bj-lobby__go">
        <button className="bj-button bj-button--primary bj-button--big" onClick={takeSeat} disabled={!canSit || seated}>
          Take a seat
        </button>
        <p className="bj-ink-dim">
          {seated
            ? 'Get up from your table first.'
            : canSit
              ? `${mode === 'full' ? 'Full table' : 'One on one'} at the ${stakes.name.toLowerCase()} table, ${stakes.limits.min} to ${stakes.limits.max} caps a hand.`
              : caps < 50
                ? 'You’re short on caps. Claim a refill from the hub menu.'
                : 'Pick a table you can cover.'}
        </p>
      </div>

      {mode === 'full' && (
        <section className="bj-panel bj-lobby__section bj-regulars" aria-labelledby="bj-regulars-title">
          <h2 id="bj-regulars-title">The regulars</h2>
          <p className="bj-ink-dim">Four of them are at the table on any night. When one runs out of caps, someone else sits down.</p>
          <ul>
            {REGULARS.map((r) => (
              <li key={r.id}>
                <span className="bj-portrait" style={{ background: r.color }} aria-hidden="true" />
                <span>
                  <strong>{r.name}</strong> {r.blurb}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** The felt from above, with the seats that will be taken. */
function MiniTable({ full }: { full: boolean }) {
  return (
    <svg className="bj-mini" viewBox="0 0 1000 520" aria-hidden="true">
      <path d="M0 0 A500 500 0 0 0 1000 0 Z" fill="#3f1013" />
      <path d="M45 0 A455 455 0 0 0 955 0 Z" fill="#1f54a3" />
      <rect x="400" y="14" width="200" height="34" rx="6" fill="#1a1416" stroke="#b28a3e" strokeWidth="4" />
      {SPOT_INDEXES.map((spot) => {
        const c = WIDE_LAYOUT.circleOf(spot)
        const you = spot === 2
        const taken = you || full
        return (
          <circle
            key={spot}
            cx={c.x}
            cy={c.y}
            r={you ? 48 : 40}
            fill={you ? '#e3c26a' : taken ? '#f3ead6' : 'none'}
            stroke="#f3ead6"
            strokeOpacity={taken ? 1 : 0.45}
            strokeWidth="6"
          />
        )
      })}
    </svg>
  )
}

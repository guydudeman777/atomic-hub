import { useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { Link } from '../../../router'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { STAKES } from '../content'
import { useSession } from './session'

export function Lobby() {
  const caps = useSave((s) => s.wallet.caps)
  const seated = useSession((s) => s.state !== null)
  const sit = useSession((s) => s.sit)
  const [stakesPick, setStakes] = useState(STAKES[0].id)
  const stakes = STAKES.find((s) => s.id === stakesPick) ?? STAKES[0]
  const canSit = caps >= stakes.limits.min

  const takeSpot = () => {
    if (!canSit) {
      playSfx('error')
      return
    }
    playSfx('select')
    void navigate('/craps/play', { during: () => sit({ stakesId: stakes.id }) })
  }

  return (
    <div className="cr-lobby">
      {seated && (
        <div className="cr-panel cr-resume">
          <p>You still have chips on the {useSession.getState().stakes?.name.toLowerCase()} layout.</p>
          <Link to="/craps/play" className="cr-button cr-button--primary">
            Back to the rail
          </Link>
        </div>
      )}

      <section className="cr-panel cr-lobby__section" aria-labelledby="cr-stakes-title">
        <h2 id="cr-stakes-title">Pick a table</h2>
        <div className="cr-stakes" role="radiogroup" aria-labelledby="cr-stakes-title">
          {STAKES.map((s) => {
            const short = caps < s.limits.min
            return (
              <button
                key={s.id}
                role="radio"
                aria-checked={stakes.id === s.id}
                className={`cr-stake${short ? ' is-short' : ''}`}
                onClick={() => {
                  setStakes(s.id)
                  playSfx('tick')
                }}
              >
                <span className="cr-stake__sign">
                  <span className="cr-stake__name">{s.name}</span>
                  <span className="cr-stake__limits">
                    {s.limits.min}–{s.limits.max.toLocaleString()}
                  </span>
                  <span className="cr-stake__props">Props from {s.limits.propMin}</span>
                </span>
                <span className="cr-stake__blurb">{s.blurb}</span>
                <span className="cr-stake__dealer">{short ? `You need ${s.limits.min} caps to shoot here.` : `${s.stickman.name} is on the stick.`}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="cr-lobby__go">
        <button className="cr-button cr-button--primary cr-button--big" onClick={takeSpot} disabled={!canSit || seated}>
          Step up to the rail
        </button>
        <p className="cr-ink-dim">
          {seated
            ? 'Pick up your chips from your table first.'
            : canSit
              ? `The ${stakes.name.toLowerCase()} table: ${stakes.limits.min} to ${stakes.limits.max.toLocaleString()} caps on the line, and the dice are yours.`
              : caps < 50
                ? 'You’re short on caps. Claim a refill from the hub menu.'
                : 'Pick a table you can cover.'}
        </p>
      </div>

      <section className="cr-panel cr-lobby__section cr-primer" aria-labelledby="cr-primer-title">
        <h2 id="cr-primer-title">New to the game?</h2>
        <ol>
          <li>
            <strong>Bet the pass line</strong> and roll. 7 or 11 wins, 2, 3 or 12 loses, and anything else is your point.
          </li>
          <li>
            <strong>Take odds</strong> behind the line once there’s a point. They pay true odds: the only bet in the house with no
            edge.
          </li>
          <li>
            <strong>Keep rolling.</strong> The point wins, a 7 loses. Come bets do the same thing again while you wait.
          </li>
        </ol>
        <p className="cr-ink-dim">
          The guide at the table tells you what any bet pays and what it costs, and lights up the best one. <Link to="/craps/bets">Every bet and its odds</Link>.
        </p>
      </section>
    </div>
  )
}

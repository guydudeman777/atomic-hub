import { useEffect, useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { Link } from '../../../router'
import { navigate } from '../../../navigation'
import { useSave } from '../../../store/save'
import { warmPools } from '../ai'
import { MAX_OPPONENTS, REGULARS, TABLES } from '../content'
import { WIDE_LAYOUT } from './layout'
import { useSession } from './session'
import { GAME, SEATS, startOnline } from './online'
import { OnlinePanel } from '../../../net/ui/OnlinePanel'

const ONLINE_CLASSES = { card: 'dw-panel', button: 'dw-button', primary: 'dw-button dw-button--primary', field: 'dw-field', dim: 'dw-ink-dim' }

const SIZES = Array.from({ length: MAX_OPPONENTS }, (_, i) => i + 1)

const sizeName = (n: number) => (n === 1 ? 'Heads up' : n === MAX_OPPONENTS ? 'Full table' : `${n + 1} players`)

export function Lobby({ inviteCode = null }: { inviteCode?: string | null }) {
  const [where, setWhere] = useState<'saloon' | 'online'>(inviteCode ? 'online' : 'saloon')
  return (
    <div className="dw-lobby">
      <div className="dw-tabs" role="tablist" aria-label="Where to play">
        <button role="tab" aria-selected={where === 'saloon'} className="dw-tab" onClick={() => setWhere('saloon')}>
          In the saloon
        </button>
        <button role="tab" aria-selected={where === 'online'} className="dw-tab" onClick={() => setWhere('online')}>
          Online
        </button>
      </div>
      {where === 'saloon' ? <SaloonSetup /> : <OnlineSetup inviteCode={inviteCode} />}
    </div>
  )
}

function OnlineSetup({ inviteCode }: { inviteCode: string | null }) {
  const caps = useSave((s) => s.wallet.caps)
  const [tableId, setTable] = useState(TABLES[0].id)
  const [regulars, setRegulars] = useState(2)
  const table = TABLES.find((t) => t.id === tableId) ?? TABLES[0]
  useEffect(warmPools, [])
  return (
    <OnlinePanel
      game={GAME}
      seats={SEATS}
      lateJoin
      classes={ONLINE_CLASSES}
      inviteCode={inviteCode}
      tablePath="/draw/play"
      seatLabel={(seat) => `Chair ${seat + 1}`}
      startable={(roster) =>
        caps < table.minCaps
          ? `You need ${table.minCaps} caps for ${table.name.toLowerCase().startsWith('the') ? table.name.toLowerCase() : `the ${table.name.toLowerCase()} table`}.`
          : roster.length + regulars < 2
            ? 'Poker takes two. Wait for a friend, or let a regular sit in.'
            : true
      }
      roomOptions={
        <div className="dw-online-options">
          <label className="dw-field">
            <span>Table</span>
            <select value={tableId} onChange={(e) => setTable(e.target.value)}>
              {TABLES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}: ante {t.stakes.ante}, bets {t.stakes.small}/{t.stakes.big}
                </option>
              ))}
            </select>
          </label>
          <label className="dw-field">
            <span>Regulars sitting in</span>
            <select value={regulars} onChange={(e) => setRegulars(Number(e.target.value))}>
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'None, just us' : n}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      onStart={(link) => startOnline(link, tableId, regulars)}
      note="Everyone plays their own caps, and the hands you play go on your record. Friends can sit down between hands, up to six at the table."
    />
  )
}

function SaloonSetup() {
  const caps = useSave((s) => s.wallet.caps)
  const seated = useSession((s) => s.state !== null)
  const sit = useSession((s) => s.sit)
  const [opponents, setOpponents] = useState(3)
  const [tablePick, setTable] = useState(TABLES[0].id)
  const table = TABLES.find((t) => t.id === tablePick) ?? TABLES[0]
  const canSit = caps >= table.minCaps
  // The regulars' sense of the odds, dealt in the background while you choose.
  useEffect(warmPools, [])

  const takeSeat = () => {
    if (!canSit) {
      playSfx('error')
      return
    }
    playSfx('select')
    void navigate('/draw/play', { during: () => sit({ opponents, tableId: table.id }) })
  }

  return (
    <>
      {seated && (
        <div className="dw-panel dw-resume">
          <p>You still have a seat at {useSession.getState().table?.name.toLowerCase()}.</p>
          <Link to="/draw/play" className="dw-button dw-button--primary">
            Back to your seat
          </Link>
        </div>
      )}

      <section className="dw-panel dw-lobby__section" aria-labelledby="dw-size-title">
        <h2 id="dw-size-title">How many at the table</h2>
        <div className="dw-sizes" role="radiogroup" aria-labelledby="dw-size-title">
          {SIZES.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={opponents === n}
              className="dw-size"
              onClick={() => {
                setOpponents(n)
                playSfx('tick')
              }}
            >
              <MiniTable seats={n + 1} />
              <span className="dw-size__name">{sizeName(n)}</span>
              <span className="dw-size__count">
                You and {n} {n === 1 ? 'regular' : 'regulars'}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="dw-panel dw-lobby__section" aria-labelledby="dw-table-title">
        <h2 id="dw-table-title">Pick a table</h2>
        <div className="dw-tables" role="radiogroup" aria-labelledby="dw-table-title">
          {TABLES.map((t) => {
            const short = caps < t.minCaps
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={table.id === t.id}
                className={`dw-table-pick${short ? ' is-short' : ''}`}
                onClick={() => {
                  setTable(t.id)
                  playSfx('tick')
                }}
              >
                <span className="dw-table-pick__sign">
                  <span className="dw-table-pick__name">{t.name}</span>
                  <span className="dw-table-pick__limits">
                    {t.stakes.small}/{t.stakes.big}
                  </span>
                  <span className="dw-table-pick__ante">Ante {t.stakes.ante}</span>
                </span>
                <span className="dw-table-pick__blurb">{t.blurb}</span>
                <span className="dw-table-pick__dealer">{short ? `You need ${t.minCaps} caps to sit here.` : `${t.dealer.name} is dealing.`}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="dw-lobby__go">
        <button className="dw-button dw-button--primary dw-button--big" onClick={takeSeat} disabled={!canSit || seated}>
          Take a seat
        </button>
        <p className="dw-ink-dim">
          {seated
            ? 'Get up from your table first.'
            : canSit
              ? `${sizeName(opponents)} at ${table.name.toLowerCase().startsWith('the') ? table.name.toLowerCase() : `the ${table.name.toLowerCase()} table`}: ante ${table.stakes.ante}, bets ${table.stakes.small} and ${table.stakes.big}. Your caps are your stack.`
              : caps < 50
                ? 'You’re short on caps. Claim a refill from the hub menu.'
                : 'Pick a table you can cover.'}
        </p>
      </div>

      <section className="dw-panel dw-lobby__section dw-regulars" aria-labelledby="dw-regulars-title">
        <h2 id="dw-regulars-title">The regulars</h2>
        <p className="dw-ink-dim">Whoever’s around sits in. When one of them goes broke, somebody else takes the chair.</p>
        <ul>
          {REGULARS.map((r) => (
            <li key={r.id}>
              <span className="dw-portrait" style={{ background: r.color }} aria-hidden="true" />
              <span>
                <strong>{r.name}</strong> {r.blurb}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/** The table from above, with a chip for every chair. */
function MiniTable({ seats }: { seats: number }) {
  const { plateOf } = WIDE_LAYOUT
  return (
    <svg className="dw-mini" viewBox="-20 -20 1040 600" aria-hidden="true">
      <ellipse cx="500" cy="280" rx="500" ry="280" fill="#2e1a0f" />
      <ellipse cx="500" cy="280" rx="440" ry="225" fill="#2c6b38" />
      {Array.from({ length: seats }, (_, seat) => {
        const p = plateOf(seat, seats)
        return <circle key={seat} cx={p.x} cy={Math.min(530, p.y)} r={seat === 0 ? 62 : 52} fill={seat === 0 ? '#d9b45e' : '#efe3c4'} stroke="#1a0e07" strokeWidth="10" />
      })}
    </svg>
  )
}

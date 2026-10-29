import { type CSSProperties, useState } from 'react'
import { playSfx } from '../../../core/audio/sfx'
import { navigate } from '../../../navigation'
import { OnlinePanel } from '../../../net/ui/OnlinePanel'
import { Link } from '../../../router'
import { useSave } from '../../../store/save'
import { MACHINE_INFO, buyInOf, formatChance, machineInfo, payName, returnText } from '../content'
import { type SymbolId, MAX_COINS, meterCaps, meterReset } from '../engine'
import { MACHINES, type MachineId } from '../machines'
import { report } from '../odds'
import { REGULARS } from '../regulars'
import { GAME, SEATS, startOnline } from './online'
import { useSession } from './session'
import { SymbolArt } from './Symbols'

const ONLINE_CLASSES = { card: 'sl-panel', button: 'sl-button', primary: 'sl-button sl-button--primary', field: 'sl-field', dim: 'sl-ink-dim' }

/** The machine picked last, for this visit. */
let lastMachine: MachineId = 'caps'

/** What each machine shows on its little glass in the lobby. */
const GLYPH_LINE: Record<MachineId, readonly SymbolId[]> = {
  caps: ['cherry', 'cap', 'bell'],
  sevens: ['seven', 'atom', 'seven'],
  rocket: ['rocket', 'rocket', 'rocket'],
}

export function Lobby({ inviteCode = null }: { inviteCode?: string | null }) {
  const [where, setWhere] = useState<'row' | 'online'>(inviteCode ? 'online' : 'row')
  return (
    <div className="sl-lobby">
      <div className="sl-tabs" role="tablist" aria-label="Where to play">
        <button
          role="tab"
          aria-selected={where === 'row'}
          className="sl-tab"
          onClick={() => {
            setWhere('row')
            playSfx('tick')
          }}
        >
          On the row
        </button>
        <button
          role="tab"
          aria-selected={where === 'online'}
          className="sl-tab"
          onClick={() => {
            setWhere('online')
            playSfx('tick')
          }}
        >
          Online
        </button>
      </div>
      {where === 'row' ? <RowSetup /> : <OnlineSetup inviteCode={inviteCode} />}
    </div>
  )
}

/** A little cabinet for the picker: the machine's enamel, its name in lights and three symbols in the window. */
function MachineGlyph({ id }: { id: MachineId }) {
  return (
    <span className="sl-glyph" data-machine={id} aria-hidden="true">
      <span className="sl-glyph__top" />
      <span className="sl-glyph__window">
        {GLYPH_LINE[id].map((symbol, i) => (
          <span key={i} className="sl-glyph__reel">
            <SymbolArt symbol={symbol} />
          </span>
        ))}
      </span>
      <span className="sl-glyph__deck" />
    </span>
  )
}

function MachinePicker({ machine, onPick }: { machine: MachineId; onPick: (id: MachineId) => void }) {
  const caps = useSave((s) => s.wallet.caps)
  const saved = useSave((s) => s.slots.meter)
  return (
    <div className="sl-machines" role="radiogroup" aria-label="Machine">
      {MACHINE_INFO.map((m) => {
        const rules = MACHINES[m.id]
        const short = caps < buyInOf(m.id)
        const top = report(rules, MAX_COINS).pays[0]
        const reset = meterReset(rules)
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={machine === m.id}
            className={`sl-machine-pick${short ? ' is-short' : ''}`}
            data-machine={m.id}
            onClick={() => {
              onPick(m.id)
              playSfx('tick')
            }}
          >
            <MachineGlyph id={m.id} />
            <span className="sl-machine-pick__name">{m.name}</span>
            <span className="sl-machine-pick__coin">{m.coinText}</span>
            <span className="sl-machine-pick__blurb">{m.blurb}</span>
            <span className="sl-machine-pick__feel">{m.feel}</span>
            <span className="sl-machine-pick__return">{returnText(rules)}</span>
            <span className="sl-machine-pick__top">
              {payName(rules.pays[0])}: {formatChance(top.chance)}
              {reset !== null && <>. The meter’s at {meterCaps(Math.max(reset, saved ?? reset)).toLocaleString()} caps.</>}
            </span>
            {short && <span className="sl-machine-pick__short">You need {buyInOf(m.id)} caps for a coin here.</span>}
          </button>
        )
      })}
    </div>
  )
}

function RowSetup() {
  const caps = useSave((s) => s.wallet.caps)
  const seated = useSession((s) => s.machine !== null && s.online === null)
  const seatedAt = useSession((s) => s.machine)
  const sit = useSession((s) => s.sit)
  const [machine, setMachine] = useState<MachineId>(lastMachine)
  const info = machineInfo(machine)
  const canSit = caps >= buyInOf(machine)
  const pick = (id: MachineId) => {
    lastMachine = id
    setMachine(id)
  }

  const takeStool = () => {
    if (!canSit) {
      playSfx('error')
      return
    }
    playSfx('select')
    void navigate('/slots/play', { during: () => sit({ machine }) })
  }

  return (
    <>
      {seated && seatedAt && (
        <div className="sl-panel sl-resume">
          <p>You’re still sitting at {machineInfo(seatedAt).name}.</p>
          <Link to="/slots/play" className="sl-button sl-button--primary">
            Back to the machine
          </Link>
        </div>
      )}

      <section className="sl-panel sl-lobby__section" aria-labelledby="sl-machine-title">
        <h2 id="sl-machine-title">Pick a machine</h2>
        <MachinePicker machine={machine} onPick={pick} />
      </section>

      <div className="sl-lobby__go">
        <button className="sl-button sl-button--primary sl-button--big" onClick={takeStool} disabled={!canSit || seated}>
          Sit down
        </button>
        <p className="sl-ink-dim">
          {seated
            ? 'Get up from your machine first.'
            : canSit
              ? `${info.name}, ${info.coinText.toLowerCase()}. ${returnText(MACHINES[machine])}`
              : caps < 50
                ? 'You’re short on caps. Claim a refill from the hub menu.'
                : 'Pick a machine you can cover.'}
        </p>
      </div>

      <section className="sl-panel sl-lobby__section sl-regulars" aria-labelledby="sl-regulars-title">
        <h2 id="sl-regulars-title">On the row</h2>
        <p className="sl-ink-dim">Two regulars play the machines either side of yours, each with caps of their own and a way of playing they swear by. When one runs dry, someone else sits down.</p>
        <ul>
          {REGULARS.map((r) => (
            <li key={r.id}>
              <span className="sl-plate__dot" style={{ '--c': r.color } as CSSProperties} aria-hidden="true" />
              <span>
                <strong>{r.name}</strong> {r.blurb}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sl-panel sl-lobby__section sl-primer" aria-labelledby="sl-primer-title">
        <h2 id="sl-primer-title">New to slots?</h2>
        <ol>
          <li>
            <span>
              <strong>Start on Bottle Caps.</strong> A cap a coin, and a cherry anywhere on the line pays.
            </span>
          </li>
          <li>
            <span>
              <strong>Pick your coins.</strong> One to three a pull. On Atomic Sevens and Moon Rocket, three coins pay back a little more.
            </span>
          </li>
          <li>
            <span>
              <strong>Pull the handle.</strong> Only the middle row pays. The paytable is on the glass above the reels.
            </span>
          </li>
        </ol>
        <p className="sl-ink-dim">
          Every machine gives back about 95 caps of every 100 played, over the long run. <Link to="/slots/pays">Every paytable, and its odds</Link>.
        </p>
      </section>
    </>
  )
}

function OnlineSetup({ inviteCode }: { inviteCode: string | null }) {
  const caps = useSave((s) => s.wallet.caps)
  const [machine, setMachine] = useState<MachineId>(lastMachine)
  return (
    <OnlinePanel
      game={GAME}
      seats={SEATS}
      lateJoin
      classes={ONLINE_CLASSES}
      inviteCode={inviteCode}
      tablePath="/slots/play"
      seatLabel={(seat) => (seat === 0 ? 'Host' : `Machine ${seat + 1}`)}
      startable={() => (caps >= buyInOf(machine) ? true : `You need ${buyInOf(machine)} caps for a coin on ${machineInfo(machine).name}.`)}
      roomOptions={
        <div className="sl-room-options">
          <label className="sl-field">
            <span>Machines</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value as MachineId)}>
              {MACHINE_INFO.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}, {m.coinText.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      onStart={(link) => startOnline(link, machine)}
      note="Everyone plays their own caps on their own machine, side by side, and sees everyone’s reels. On Moon Rocket the whole row feeds one jackpot meter. Up to three of you; friends can sit down any time."
    />
  )
}

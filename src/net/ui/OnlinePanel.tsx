/**
 * The Online tab in a game's lobby: your name, hosting a table or joining
 * one by its code, and the room before the host starts. Each game passes its
 * own class names, so the panel wears that game's paper, felt or walnut.
 */

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { playSfx } from '../../core/audio/sfx'
import { navigate } from '../../navigation'
import { useSave } from '../../store/save'
import { cleanCode, inviteLink, spaced } from '../codes'
import type { Link, Member } from '../link'
import { type LinkSetup, useGameLink, useLink } from '../store'
import './online.css'

export interface OnlineClasses {
  card: string
  button: string
  primary: string
  field: string
  dim: string
}

export interface OnlinePanelProps {
  /** The game's route and room: `reversi`, `blackjack`. */
  game: string
  /** Seats, the host's included, and whether people can join after the start. */
  seats: number
  lateJoin: boolean
  classes: OnlineClasses
  /** A code from an invite link, to join straight away. */
  inviteCode?: string | null
  /** Shown above Host a table: what kind of table to open. */
  hostOptions?: ReactNode
  /** Shown to the host in the room, before the start. */
  roomOptions?: ReactNode
  /** What a seat is: "Black", "Seat 3". */
  seatLabel?: (seat: number) => string | null
  /** Whether the host can start with this roster, and if not, why not. */
  startable: (roster: Member[]) => true | string
  /** Deal everyone in. The game builds the setup and starts the link. */
  onStart: (link: Link) => void
  /** Before hosting: false (with a sound and a message of its own) if you can't open this table. */
  beforeHost?: () => boolean
  /** Before joining. */
  beforeJoin?: () => boolean
  /** Where the table is, for a game in progress. */
  tablePath: string
  /** Something to say about how the game counts online. */
  note?: ReactNode
}

export function OnlinePanel(props: OnlinePanelProps) {
  const { game, classes: c } = props
  const link = useGameLink(game)
  const opening = useLink((s) => s.opening)
  const error = useLink((s) => s.error)
  const setup: LinkSetup = { game, seats: props.seats, lateJoin: props.lateJoin }

  // An invite link joins as soon as the lobby opens, once.
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })
  const invited = useRef<string | null>(null)
  const { inviteCode } = props
  useEffect(() => {
    if (!inviteCode || invited.current === inviteCode) return
    invited.current = inviteCode
    const { game, seats, lateJoin, beforeJoin } = latest.current
    const current = useLink.getState().link
    if (current?.game === game && current.code === inviteCode && current.status !== 'closed') return
    if (beforeJoin && !beforeJoin()) return
    void useLink.getState().join(inviteCode, { game, seats, lateJoin })
  }, [inviteCode])

  if (opening) {
    return (
      <section className={`${c.card} net-panel`} aria-live="polite">
        <p>Opening a line…</p>
      </section>
    )
  }

  if (link?.status === 'closed') {
    return (
      <section className={`${c.card} net-panel`} role="alert">
        <h2>Off the line</h2>
        <p>{link.reason ?? 'You left the table.'}</p>
        <button className={c.primary} onClick={() => useLink.getState().dismiss()}>
          OK
        </button>
      </section>
    )
  }

  if (link) return <Room {...props} link={link} />

  return (
    <div className="net-setup">
      <NameField classes={c} />
      {error && (
        <p className={`${c.card} net-error`} role="alert">
          {error}
        </p>
      )}
      <section className={`${c.card} net-panel`}>
        <h2>Host a table</h2>
        {props.hostOptions}
        <p className={c.dim}>You get a code to send your friends. They join from this game’s Online tab, or straight from the link.</p>
        <button
          className={c.primary}
          onClick={() => {
            if (props.beforeHost && !props.beforeHost()) return
            playSfx('select')
            void useLink.getState().host(setup)
          }}
        >
          Host a table
        </button>
      </section>
      <JoinForm classes={c} onJoin={(code) => {
        if (props.beforeJoin && !props.beforeJoin()) return
        playSfx('select')
        void useLink.getState().join(code, setup)
      }} />
      {props.note && <p className={`${c.dim} net-note`}>{props.note}</p>}
    </div>
  )
}

function NameField({ classes: c }: { classes: OnlineClasses }) {
  const name = useSave((s) => s.settings.playerName)
  const update = useSave((s) => s.updateSettings)
  return (
    <label className={`${c.field} net-name`}>
      <span>Your name at the table</span>
      <input value={name} maxLength={20} placeholder="A stranger" autoComplete="nickname" onChange={(e) => update({ playerName: e.target.value })} />
    </label>
  )
}

function JoinForm({ classes: c, onJoin }: { classes: OnlineClasses; onJoin: (code: string) => void }) {
  const [typed, setTyped] = useState('')
  const [wrong, setWrong] = useState(false)
  const submit = () => {
    const code = cleanCode(typed)
    if (!code) {
      playSfx('error')
      setWrong(true)
      return
    }
    onJoin(code)
  }
  return (
    <section className={`${c.card} net-panel`}>
      <h2>Join a table</h2>
      <form
        className="net-join"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className={c.field}>
          <span>Table code</span>
          <input
            value={typed}
            maxLength={9}
            placeholder="K7Q-X2M"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={wrong || undefined}
            onChange={(e) => {
              setTyped(e.target.value)
              setWrong(false)
            }}
          />
        </label>
        <button className={c.button} type="submit">
          Join
        </button>
      </form>
      {wrong && <p className={c.dim} role="alert">A code is six letters and numbers, like K7Q-X2M.</p>}
    </section>
  )
}

function Room(props: OnlinePanelProps & { link: Link }) {
  const { link, classes: c, seatLabel } = props
  const leave = () => {
    playSfx('tick')
    useLink.getState().leave()
  }

  if (link.status === 'connecting') {
    return (
      <section className={`${c.card} net-panel`} aria-live="polite">
        <h2>Looking for table {spaced(link.code)}…</h2>
        <p className={c.dim}>Finding the host can take a few seconds.</p>
        <button className={c.button} onClick={leave}>
          Cancel
        </button>
      </section>
    )
  }

  if (link.started) {
    return (
      <section className={`${c.card} net-panel`}>
        <h2>Table {spaced(link.code)} is playing</h2>
        <p>You have a seat at it.</p>
        <div className="net-actions">
          <button className={c.primary} onClick={() => void navigate(props.tablePath)}>
            Back to the table
          </button>
          <button className={c.button} onClick={leave}>
            {link.host ? 'Close the table' : 'Leave'}
          </button>
        </div>
      </section>
    )
  }

  const startable = link.host ? props.startable(link.roster) : null
  const hostName = link.roster.find((m) => m.seat === 0)?.name ?? 'the host'
  return (
    <section className={`${c.card} net-panel net-room`}>
      <h2>{link.host ? 'Your table is open' : `At ${hostName}’s table`}</h2>
      <CodeCard link={link} classes={c} />
      <ol className="net-roster" aria-label="Players">
        {Array.from({ length: props.seats }, (_, seat) => {
          const member = link.roster.find((m) => m.seat === seat)
          const label = seatLabel?.(seat)
          return (
            <li key={seat} className={member ? 'is-taken' : 'is-open'}>
              {label && <span className={`${c.dim} net-roster__seat`}>{label}</span>}
              <span className="net-roster__name">
                {member ? member.name : 'Open seat'}
                {member && seat === link.seat && ' (you)'}
                {member && seat === 0 && seat !== link.seat && ' (host)'}
              </span>
            </li>
          )
        })}
      </ol>
      {link.host && props.roomOptions}
      {link.host ? (
        <>
          {startable !== true && <p className={c.dim}>{startable}</p>}
          <div className="net-actions">
            <button
              className={c.primary}
              disabled={startable !== true}
              onClick={() => {
                playSfx('select')
                props.onStart(link)
              }}
            >
              Start
            </button>
            <button className={c.button} onClick={leave}>
              Close the table
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={c.dim}>Waiting for {hostName} to start.</p>
          <div className="net-actions">
            <button className={c.button} onClick={leave}>
              Leave
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function CodeCard({ link, classes: c }: { link: Link; classes: OnlineClasses }) {
  const [copied, setCopied] = useState(false)
  const url = inviteLink(link.game, link.code)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      playSfx('tick')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      playSfx('error')
    }
  }
  return (
    <div className="net-code">
      <p className={c.dim}>Table code</p>
      <p className="net-code__value" aria-label={`Table code ${[...link.code].join(' ')}`}>
        {spaced(link.code)}
      </p>
      <div className="net-actions">
        <button className={c.button} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy invite link'}
        </button>
        {canShare && (
          <button className={c.button} onClick={() => void navigator.share({ title: 'Pull up a chair', url }).catch(() => {})}>
            Share
          </button>
        )}
      </div>
    </div>
  )
}

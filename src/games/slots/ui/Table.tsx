import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useMediaQuery } from '../../../components/useMediaQuery'
import { navigate } from '../../../navigation'
import { useGameLink } from '../../../net/store'
import { LinkBanner } from '../../../net/ui/LinkBanner'
import { useSave } from '../../../store/save'
import { CHANGE_GIRL } from '../calls'
import { formatChance, formatPercent, machineInfo, payName } from '../content'
import { type Rules, MAX_COINS, meterCaps } from '../engine'
import { MACHINES, type MachineId } from '../machines'
import { report, returnNow } from '../odds'
import { NeighborMachine, YourMachine } from './Machine'
import { GAME, checksumAfter, leaveOnline } from './online'
import { jackpotPending } from './reels'
import { RulesText } from './Rules'
import { type Player, type Pull, type Remark, SEAT_COLORS, useSession } from './session'
import { SymbolSprite } from './Symbols'

/**
 * Phones and small windows get the compact row in slots.css, whose media
 * queries match this one: the HUD keeps its log and controls behind a Menu
 * button.
 */
const COMPACT_TABLE = '(max-width: 900px), (max-height: 560px)'

export function Table() {
  const { sitting, machine, online } = useSession()
  const link = useGameLink(GAME)

  // No machine? Back to the lobby.
  useEffect(() => {
    if (!machine) navigate('/slots')
  }, [machine])

  // Online: play everyone's pulls as they come.
  const waiting = online?.queue.length ?? 0
  useEffect(() => {
    if (online) useSession.getState().pump(checksumAfter(link))
  }, [waiting, online, link])

  if (!machine) return null
  return (
    <>
      <TableView key={sitting} machine={machine} />
      {online && <LinkBanner link={link} waitsForOthers={false} onGone={() => void navigate('/slots', { during: leaveOnline })} />}
    </>
  )
}

/** The meter as the marquee shows it: held where it was while a jackpot's reels are still turning. */
function shownMeter(meter: number | null, pulls: (Pull | null)[]): number | null {
  for (const pull of pulls) {
    const pending = jackpotPending(pull)
    if (pending) return pending.paid * 100
  }
  return meter
}

function TableView({ machine }: { machine: MachineId }) {
  const { pull, coins, online, meter, waiting, call } = useSession()
  const caps = useSave((s) => s.wallet.caps)
  const { betOne, betMax, pullHandle, setCoins } = useSession.getState()
  const rules = MACHINES[machine]
  const info = machineInfo(machine)
  const [handlePulls, setHandlePulls] = useState(0)

  /** Pull, and swing the handle if the pull went through. */
  const pullNow = (max = false) => {
    const before = useSession.getState()
    if (max) betMax()
    else pullHandle()
    const after = useSession.getState()
    if (after.pulls !== before.pulls || (after.waiting && !before.waiting)) setHandlePulls((n) => n + 1)
  }

  // Keyboard: S or Space pulls, B adds a coin, 1–3 set the coins, M bets three and pulls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [role="dialog"]')) return
      if (e.repeat) return
      const key = e.key.toLowerCase()
      if (key === 's' || (key === ' ' && !target.closest('button'))) pullNow()
      else if (key === 'm') pullNow(true)
      else if (key === 'b') betOne()
      else if (Number(key) >= 1 && Number(key) <= MAX_COINS) setCoins(Number(key))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Online, your friends at the machines left and right of yours (sideOf in session.ts).
  const others = online ? online.players.flatMap((p, seat) => (p && seat !== online.me ? [p] : [])) : []
  const left = others[0] ?? null
  const right = others[1] ?? null
  const rowPulls = [pull, left?.pull ?? null, right?.pull ?? null]
  const shown = shownMeter(meter, rowPulls)
  const jackpotOn = (p: Pull | null) => !!p?.settled && p.spin.win?.pay === 0

  const neighbor = (who: Player | null, side: 0 | 1) => {
    const seed = 11 + side * 6
    return (
      <div className={`sl-spot sl-spot--${side === 0 ? 'left' : 'right'}`}>
        <NeighborMachine
          id={machine}
          name={info.name}
          rules={rules}
          pull={who?.pull ?? null}
          coins={who?.pull?.spin.coins ?? 1}
          meter={shown}
          jackpot={jackpotOn(who?.pull ?? null)}
          seed={seed}
          plate={who ? <Plate who={who} rules={rules} /> : <EmptyPlate />}
          empty={!who}
        />
      </div>
    )
  }

  return (
    <div className="sl-game" data-machine={machine}>
      <SymbolSprite />
      <div className="sl-floor">
        <AttendantBar call={call} name={info.name} coinText={info.coinText} />
        <div className="sl-stage">
          {/* Offline your machine has the row to itself: nothing beside it to draw or turn. */}
          <div className={online ? 'sl-row' : 'sl-row is-alone'}>
            {online && neighbor(left, 0)}
            <div className="sl-spot sl-spot--you">
              <YourMachine
                id={machine}
                name={info.name}
                rules={rules}
                pull={pull}
                coins={coins}
                caps={caps}
                meter={shown}
                jackpot={jackpotOn(pull)}
                waiting={waiting}
                onBetOne={betOne}
                onBetMax={() => pullNow(true)}
                onPull={() => pullNow()}
                handlePulls={handlePulls}
              />
            </div>
            {online && neighbor(right, 1)}
          </div>
        </div>
      </div>
      <Hud rules={rules} machine={machine} />
    </div>
  )
}

// ---- Dottie ---------------------------------------------------------------------

function AttendantBar({ call, name, coinText }: { call: Remark | null; name: string; coinText: string }) {
  return (
    <div className="sl-attendant">
      <div className="sl-attendant__who">
        <span className="sl-portrait" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            {/* Her coin changer: four tubes of caps on a belt. */}
            <rect x="7" y="12" width="26" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <path d="M13.5 12v20M20 12v20M26.5 12v20" stroke="currentColor" strokeWidth="2" />
            <path d="M4 16h4M32 16h4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="sl-attendant__name">{CHANGE_GIRL}</span>
        <SpeechBubble name={CHANGE_GIRL} remark={call} className="sl-talk--attendant" />
      </div>
      <div className="sl-placard" aria-label={`${name}, ${coinText.toLowerCase()}`}>
        <span className="sl-placard__machine">{name}</span>
        <span className="sl-placard__coin">{coinText}</span>
      </div>
    </div>
  )
}

/** Long enough to read the line twice at a relaxed pace. */
const readingTime = (text: string) => Math.min(6000, Math.max(2400, 1500 + text.length * 55))

/** The latest remark, shown after its delay and faded after a while. A newer one replaces it. */
function SpeechBubble({ name, remark, className }: { name: string; remark: Remark | null; className: string }) {
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (!remark) return
    const hold = readingTime(remark.text)
    const show = window.setTimeout(() => setShown(remark.id), remark.delay)
    const hide = window.setTimeout(() => setShown(null), remark.delay + hold + 300)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [remark])
  const visible = remark !== null && shown === remark.id
  return (
    <div className={`sl-talk ${className}`} aria-live="polite">
      {visible && (
        <p key={remark.id} className="sl-talk__bubble" style={{ '--hold': `${readingTime(remark.text)}ms` } as CSSProperties}>
          <span className="visually-hidden">{name} says: </span>
          {remark.text}
        </p>
      )}
    </div>
  )
}

// ---- Your friends' plates, online ----------------------------------------------------

/** A friend's plate: their name and how they're doing. */
function Plate({ who, rules }: { who: Player; rules: Rules }) {
  // A win in the air isn't counted until the reels stop.
  const net = who.net - (who.pull && !who.pull.settled ? who.pull.spin.paid : 0)
  return (
    <div className="sl-plate is-player" style={{ '--c': SEAT_COLORS[who.seat] } as CSSProperties} title={`${who.name}: ${net >= 0 ? 'up' : 'down'} ${Math.abs(net).toLocaleString()} caps`}>
      <span className="sl-plate__name">{who.name}</span>
      <span className="sl-plate__stack">
        {net > 0 ? '+' : net < 0 ? '−' : ''}
        {Math.abs(net).toLocaleString()}
        <span className="visually-hidden"> caps this sitting</span>
      </span>
      <Coins n={who.pull?.spin.coins ?? 0} />
      <span className="visually-hidden">{rules.coin} caps a coin</span>
    </div>
  )
}

/** Coins in, as lit pips. */
function Coins({ n }: { n: number }) {
  return (
    <span className="sl-plate__coins" aria-label={n ? `${n} coin${n > 1 ? 's' : ''} in` : undefined}>
      {Array.from({ length: MAX_COINS }, (_, i) => (
        <span key={i} data-on={i < n || undefined} />
      ))}
    </span>
  )
}

function EmptyPlate() {
  return (
    <div className="sl-plate is-empty">
      <span className="sl-plate__name">Open machine</span>
    </div>
  )
}

// ---- The terminal ---------------------------------------------------------------------

/** What the guide says: the machine's return, or about the win that just came up. */
function guideText(rules: Rules, machine: MachineId, coins: number, meter: number | null, lastPay: number | null, compact: boolean): string {
  const info = machineInfo(machine)
  const max = report(rules, MAX_COINS)
  const mine = report(rules, coins)
  if (lastPay !== null) {
    const pay = rules.pays[lastPay]
    const odds = report(rules, coins).pays[lastPay]
    return `${payName(pay)} comes up ${formatChance(odds.chance)} spins, and gives back ${formatPercent(odds.share)} of what’s played.`
  }
  if (rules.progressive && meter !== null) {
    const now = returnNow(rules, meter)
    const head = `The meter’s at ${meterCaps(meter).toLocaleString()}. Three coins pay back ${formatPercent(now)} right now.`
    if (compact) return head
    return coins < MAX_COINS ? `${head} One or two coins can’t win it: ${formatPercent(mine.total)}.` : `${head} Over the long run, ${formatPercent(max.total)}.`
  }
  if (Math.abs(mine.total - max.total) > 0.00005 && coins < MAX_COINS) {
    return `${info.name} pays back ${formatPercent(mine.total)} on ${coins === 1 ? 'one coin' : 'two coins'}, and ${formatPercent(max.total)} on three, which pay the bonus on the top award.`
  }
  const head = `${info.name} pays back ${formatPercent(mine.total)}. Something pays ${formatChance(mine.hit)} spins.`
  return compact ? head : `${head} The top award, ${payName(rules.pays[0]).toLowerCase()}, comes up ${formatChance(mine.pays[0].chance)}.`
}

function Hud({ rules, machine }: { rules: Rules; machine: MachineId }) {
  const { log, pull, notice, leave, online, coins, meter, net, waiting } = useSession()
  const guide = useSave((s) => s.slots.guide)
  const updateSlots = useSave((s) => s.updateSlots)
  const table3d = useSave((s) => s.settings.table3d)
  const updateSettings = useSave((s) => s.updateSettings)
  const [showRules, setShowRules] = useState(false)
  const compact = useMediaQuery(COMPACT_TABLE)
  const [menuOpen, setMenuOpen] = useState(false)
  // The menu belongs to the compact layout. Turning a tablet can leave it, and it stays closed.
  if (menuOpen && !compact) setMenuOpen(false)
  const closeMenu = () => setMenuOpen(false)
  const logRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log, menuOpen])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])
  const info = machineInfo(machine)
  const turning = waiting || (!!pull && !pull.settled)
  const settled = pull?.settled ? pull.spin : null

  let status: string
  if (turning) status = 'Reels turning'
  else if (settled?.win?.pay === 0) status = settled.win.meter ? 'Jackpot!' : 'Top award!'
  else if (settled?.win) status = `Winner: ${settled.paid.toLocaleString()} caps`
  else if (settled) status = 'No win'
  else status = 'Pull the handle'

  const caps = useSave((s) => s.wallet.caps)
  let help: string
  if (notice) help = notice.text
  else if (turning) help = 'Round they go.'
  else if (caps < rules.coin) help = `A coin here is ${rules.coin} caps, and you have ${caps}. Try a smaller machine, or claim a refill from the hub menu once you’re under 50.`
  else if (guide) help = guideText(rules, machine, coins, meter, settled?.win ? settled.win.pay : null, compact)
  else help = 'Bet one to three coins, then pull the handle or press Spin.'

  const getUp = () => void navigate('/slots', { during: online ? leaveOnline : leave })

  const tableLog = (
    <ol className="sl-hud__log" ref={logRef} aria-label="Machine log">
      {log.map((e) => (
        <li key={e.id} data-mine={e.mine || undefined}>
          {e.text}
        </li>
      ))}
    </ol>
  )
  const tableControls = (
    <div className="sl-hud__foot">
      <button
        className="term-button"
        onClick={() => {
          closeMenu()
          setShowRules(true)
        }}
      >
        Rules
      </button>
      <button className="term-button" aria-pressed={guide} onClick={() => updateSlots({ guide: !guide })}>
        <span aria-hidden="true">{guide ? '[x]' : '[ ]'}</span> Guide
      </button>
      <button className="term-button" aria-pressed={table3d} onClick={() => updateSettings({ table3d: !table3d })}>
        <span aria-hidden="true">{table3d ? '[x]' : '[ ]'}</span> 3D view
      </button>
      <button className="term-button" onClick={getUp}>
        Leave machine
      </button>
    </div>
  )

  return (
    <aside className="sl-hud screen" aria-label="Game status">
      <div className="sl-hud__head">
        <p className="term-dim">
          Slots{online ? ' online' : ''}, {info.name}
        </p>
        {net !== 0 && (
          <p className="sl-hud__net">
            {net > 0 ? 'Up' : 'Down'} {Math.abs(net).toLocaleString()}
          </p>
        )}
      </div>
      <p className="sl-hud__status" aria-live="polite">
        {status}
      </p>
      <p className="sl-hud__help" id="sl-help" role={notice ? 'status' : undefined}>
        {help}
      </p>
      {caps < rules.coin && !turning && !compact && (
        <button className="term-button sl-hud__broke" onClick={getUp}>
          Back to the machines
        </button>
      )}
      {compact && (
        <button className="term-button sl-hud__menu" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
          Menu
        </button>
      )}
      {!compact && tableLog}
      {!compact && tableControls}
      {menuOpen && (
        <div className="sl-overlay" role="dialog" aria-modal="true" aria-label="Machine menu" onClick={closeMenu}>
          <div className="sl-menu screen" onClick={(e) => e.stopPropagation()}>
            {tableLog}
            {tableControls}
            <button className="term-button term-button--primary" autoFocus onClick={closeMenu}>
              Back to the game
            </button>
          </div>
        </div>
      )}
      {showRules && (
        <div className="sl-overlay" role="dialog" aria-modal="true" aria-label="Slots rules" onClick={() => setShowRules(false)}>
          <div className="sl-panel sl-rules-modal" onClick={(e) => e.stopPropagation()}>
            <RulesText />
            <button className="sl-button sl-button--primary" autoFocus onClick={() => setShowRules(false)}>
              Back to the game
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

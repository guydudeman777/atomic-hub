import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entry } from '../../../net/link'
import { useSave } from '../../../store/save'
import type { Stops } from '../engine'
import { MACHINES } from '../machines'
import { REGULARS, freshMemory } from '../regulars'
import { type Input, SETTLE_MS, sendThrough, sideOf, useSession } from './session'

const setCaps = (n: number) => useSave.getState().adjustCaps(n - useSave.getState().wallet.caps)
const wallet = () => useSave.getState().wallet.caps

/** Moon Rocket's three rockets, and a line of blanks. */
const JACKPOT: Stops = [0, 0, 0]
const NOTHING: Stops = [1, 1, 1]

/** A row online where you're the guest in seat 1, with the host in seat 0: what you send waits until the host plays it back. */
function sitAsGuest(machine: 'caps' | 'rocket' = 'rocket') {
  const sent: Input[] = []
  sendThrough((input) => sent.push(input))
  useSession.getState().sit({ machine, online: { me: 1, host: false, players: [{ seat: 0, name: 'Hostess' }, { seat: 1, name: 'You' }] } })
  let seq = 0
  /** The host numbers what you sent, with anything else given, and plays it back to every row. */
  const playBack = (...others: Omit<Entry, 'seq'>[]) => {
    const entries: Entry[] = [...others, ...sent.splice(0).map((input) => ({ seat: 1, input }))].map((e) => ({ ...e, seq: seq++ }))
    useSession.getState().receive(entries)
    useSession.getState().pump()
  }
  return { sent, playBack }
}

beforeEach(() => {
  vi.useFakeTimers()
  useSave.getState().resetSave()
  // The session plays its sounds through the page; there's none here.
  useSave.getState().updateSettings({ sound: false })
  useSession.getState().leave()
  sendThrough(null)
})

afterEach(() => {
  useSession.getState().leave()
  vi.useRealTimers()
})

describe('at your machine', () => {
  it('takes the coins as the handle comes down, and pays the win when the reels stop', () => {
    setCaps(100)
    expect(useSession.getState().sit({ machine: 'caps' })).toBe(true)
    useSession.getState().setCoins(3)
    useSession.getState().pullHandle()
    const pull = useSession.getState().pull!
    expect(wallet()).toBe(97)
    expect(pull.settled).toBe(false)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(useSession.getState().pull?.settled).toBe(true)
    expect(wallet()).toBe(97 + pull.spin.paid)
    expect(useSave.getState().stats.slots.played).toBe(1)
    expect(useSession.getState().net).toBe(pull.spin.paid - 3)
  })

  it('won’t pull again while the reels are turning', () => {
    setCaps(100)
    useSession.getState().sit({ machine: 'caps' })
    useSession.getState().pullHandle()
    useSession.getState().pullHandle()
    expect(wallet()).toBe(99)
    expect(useSession.getState().pulls).toBe(1)
  })

  it('brings the bet down to what you can cover, and says so', () => {
    setCaps(12)
    useSession.getState().sit({ machine: 'sevens' })
    useSession.getState().setCoins(3)
    useSession.getState().pullHandle()
    expect(useSession.getState().coins).toBe(2)
    expect(useSession.getState().notice?.text).toMatch(/two coins/)
    expect(wallet()).toBe(12)
  })

  it('needs a coin’s worth of caps to sit down', () => {
    setCaps(20)
    expect(useSession.getState().sit({ machine: 'rocket' })).toBe(false)
    expect(useSession.getState().sit({ machine: 'sevens' })).toBe(true)
  })

  it('pays a pull still in the air when you get up', () => {
    setCaps(100)
    useSession.getState().sit({ machine: 'caps' })
    useSession.getState().pullHandle()
    const { paid } = useSession.getState().pull!.spin
    useSession.getState().leave()
    expect(wallet()).toBe(99 + paid)
  })
})

describe('the jackpot meter', () => {
  it('starts at the reset, grows with three-coin pulls, and is saved where the row leaves it', () => {
    setCaps(1000)
    useSession.getState().sit({ machine: 'rocket' })
    expect(useSession.getState().meter).toBe(10_000_000)
    useSession.getState().setCoins(3)
    useSession.getState().pullHandle()
    const meter = useSession.getState().meter!
    // 150, or back at the reset if that pull won it.
    expect([10_000_150, 10_000_000]).toContain(meter)
    expect(useSave.getState().slots.meter).toBe(meter)
    vi.advanceTimersByTime(SETTLE_MS)
    useSession.getState().leave()
    useSave.getState().updateSlots({ meter: 12_000_000 })
    useSession.getState().sit({ machine: 'rocket' })
    expect(useSession.getState().meter).toBe(12_000_000)
  })

  it('never starts below the reset, whatever the save says', () => {
    setCaps(1000)
    useSave.getState().updateSlots({ meter: 5 })
    useSession.getState().sit({ machine: 'rocket' })
    expect(useSession.getState().meter).toBe(10_000_000)
  })

  it('has no meter on the other machines', () => {
    useSession.getState().sit({ machine: 'sevens' })
    expect(useSession.getState().meter).toBeNull()
  })
})

describe('the regulars', () => {
  it('play their own machines on their own time, with their own caps', () => {
    setCaps(100)
    useSession.getState().sit({ machine: 'caps' })
    const seats = useSession.getState().seats
    expect(seats.filter(Boolean)).toHaveLength(2)
    const stacks = seats.map((s) => s!.stack)
    // Nobody waits for you: give them a minute and they've pulled.
    vi.advanceTimersByTime(60_000)
    const after = useSession.getState().seats
    expect(after.some((s, i) => s === null || s.pull !== null || s.stack !== stacks[i])).toBe(true)
    expect(after.filter((s) => s?.pull).length).toBeGreaterThan(0)
    expect(wallet()).toBe(100)
  })

  it('feed Moon Rocket’s meter too', () => {
    setCaps(1000)
    useSession.getState().sit({ machine: 'rocket' })
    // Dusty and Sailor Jim: three coins a pull, both of them.
    const rules = MACHINES.rocket
    const seat = (id: string) => {
      const regular = REGULARS.find((r) => r.id === id)!
      return { regular, stack: regular.bankroll * rules.coin, memory: freshMemory(regular, rules), pull: null, coins: 3 }
    }
    useSession.setState({ seats: [seat('dusty'), seat('jim')] })
    vi.advanceTimersByTime(30_000)
    const meter = useSession.getState().meter!
    // Each of their pulls adds 150, unless one of them won it.
    const pulls = useSession.getState().seats.reduce((n, s) => n + (s?.pull?.id ?? 0), 0)
    expect(pulls).toBeGreaterThan(2)
    const won = useSession.getState().seats.some((s) => s?.pull?.spin.win?.meter)
    if (!won) expect(meter).toBe(10_000_000 + pulls * 150)
    expect(useSave.getState().slots.meter).toBe(meter)
  })
})

describe('online', () => {
  it('sends your pull with its stops, and takes your coins only when the row plays it back', () => {
    setCaps(500)
    const { sent, playBack } = sitAsGuest('caps')
    useSession.getState().setCoins(2)
    useSession.getState().pullHandle()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'pull', n: 0, coins: 2 })
    expect(wallet()).toBe(500)
    expect(useSession.getState().waiting).toBe(true)
    // A second click before it comes back goes nowhere.
    useSession.getState().pullHandle()
    expect(sent).toHaveLength(1)
    sent[0] = { ...sent[0], stops: NOTHING }
    playBack()
    expect(wallet()).toBe(498)
    expect(useSession.getState().waiting).toBe(false)
    expect(useSession.getState().pull?.spin.line).toEqual(['blank', 'blank', 'blank'])
  })

  it('shares one meter: anyone’s three-coin pull feeds it, and anyone can win it', () => {
    setCaps(5000)
    const { sent, playBack } = sitAsGuest('rocket')
    expect(useSession.getState().meter).toBe(10_000_000)
    playBack({ seat: 0, input: { type: 'pull', n: 0, coins: 3, stops: NOTHING } satisfies Input })
    expect(useSession.getState().meter).toBe(10_000_150)
    useSession.getState().setCoins(3)
    useSession.getState().pullHandle()
    sent[0] = { ...sent[0], stops: JACKPOT }
    playBack()
    const mine = useSession.getState().pull!.spin
    expect(mine.paid).toBe(100_003)
    expect(useSession.getState().meter).toBe(10_000_000)
    // Paid when the reels stop.
    expect(wallet()).toBe(5000 - 75)
    vi.advanceTimersByTime(SETTLE_MS)
    expect(wallet()).toBe(5000 - 75 + 100_003)
  })

  it('drops a friend’s repeated pull, and one that isn’t on the reels', () => {
    setCaps(500)
    const { playBack } = sitAsGuest('caps')
    playBack(
      { seat: 0, input: { type: 'pull', n: 0, coins: 1, stops: NOTHING } satisfies Input },
      { seat: 0, input: { type: 'pull', n: 0, coins: 1, stops: NOTHING } satisfies Input },
      { seat: 0, input: { type: 'pull', n: 1, coins: 1, stops: [0, 0, 40] } },
      { seat: 0, input: { type: 'pull', n: 1, coins: 4, stops: NOTHING } },
    )
    const host = useSession.getState().online!.players[0]!
    expect(host.pulls).toBe(1)
    expect(host.net).toBe(-1)
  })

  it('plays the row’s past quietly when you catch up, without touching your caps', () => {
    setCaps(500)
    sendThrough(() => {})
    useSession.getState().sit({ machine: 'rocket', online: { me: 1, host: false, players: [{ seat: 0, name: 'Hostess' }, { seat: 1, name: 'You' }] } })
    useSession.getState().receive([
      { seq: 0, seat: 1, input: { type: 'pull', n: 0, coins: 3, stops: NOTHING } },
      { seq: 1, seat: 0, input: { type: 'pull', n: 0, coins: 3, stops: JACKPOT } },
      { seq: 2, seat: 1, input: { type: 'pull', n: 1, coins: 3, stops: NOTHING } },
    ])
    useSession.getState().catchUp()
    expect(wallet()).toBe(500)
    expect(useSession.getState().pulls).toBe(2)
    expect(useSession.getState().pull?.settled).toBe(true)
    expect(useSession.getState().meter).toBe(10_000_150)
    expect(useSession.getState().online!.players[0]!.net).toBe(100_000 + 3 - 75)
    expect(useSave.getState().slots.meter).toBeNull()
  })

  it('counts your pulls afresh when you sit back down after a reload', () => {
    setCaps(500)
    const { sent, playBack } = sitAsGuest('caps')
    playBack({ seat: 1, input: { type: 'pull', n: 0, coins: 1, stops: NOTHING } satisfies Input }, { seat: 1, input: { sys: 'leave' } }, { seat: 1, input: { sys: 'join', name: 'You' } })
    expect(useSession.getState().pulls).toBe(0)
    vi.advanceTimersByTime(SETTLE_MS)
    useSession.getState().pullHandle()
    expect(sent.at(-1)).toMatchObject({ n: 0 })
  })

  it('puts the friends either side of you in seat order, for their sounds as for their machines', () => {
    const players = [{ seat: 0 } as never, null, { seat: 2 } as never]
    expect(sideOf({ me: 1, players }, 0)).toBe(0)
    expect(sideOf({ me: 1, players }, 2)).toBe(1)
    expect(sideOf({ me: 0, players: [null, { seat: 1 } as never, { seat: 2 } as never] }, 1)).toBe(0)
    expect(sideOf({ me: 0, players: [null, { seat: 1 } as never, { seat: 2 } as never] }, 2)).toBe(1)
  })

  it('keeps the regulars home', () => {
    sitAsGuest('caps')
    expect(useSession.getState().seats.every((s) => s === null)).toBe(true)
  })
})

describe('the machines', () => {
  it('puts three rockets at the first stop of every Moon Rocket reel, for these tests', () => {
    expect(MACHINES.rocket.reels.map((r) => r[0].symbol)).toEqual(['rocket', 'rocket', 'rocket'])
    expect(MACHINES.rocket.reels.map((r) => r[1].symbol)).toEqual(['blank', 'blank', 'blank'])
  })
})

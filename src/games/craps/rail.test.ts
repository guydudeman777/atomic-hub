import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import { type Dice, type TableEvent, type TableState, apply, createTable, maxBet, onLayout, rollFor, summarize } from './engine'
import { MOMENTS, REGULARS, RailTalk, type RailStyle, type Talker, momentsOf, pickRegulars, railBets } from './rail'

const LIMITS = { min: 5, max: 200, propMin: 1 }

const byStyle = (style: RailStyle) => REGULARS.find((r) => r.style === style)!

/** One regular playing `rolls` rolls of the dice at seed `seed`, beside a table with no bets. */
function play(style: RailStyle, rolls: number, seed = 3, stack = 300) {
  let table = createTable({ limits: LIMITS, seed })
  let theirs = createTable({ limits: LIMITS, seed })
  let left = stack
  let net = 0
  for (let n = 0; n < rolls; n++) {
    for (const action of railBets(style, theirs, left)) {
      theirs = apply(theirs, action, left).state
      if (action.type === 'bet') left -= action.amount
    }
    const dice = rollFor(seed, n)
    table = apply(table, { type: 'roll', dice }).state
    const r = apply(theirs, { type: 'roll', dice })
    theirs = r.state
    const { back, paid, lost } = summarize(r.events)
    left += back
    net += paid - lost
  }
  return { table, theirs, left, net }
}

describe('the regulars’ betting', () => {
  it('puts the pass line down on the come-out, and full odds behind it on the point', () => {
    const comeOut = createTable({ limits: LIMITS, seed: 1 })
    expect(railBets('right', comeOut, 300)).toEqual([{ type: 'bet', spot: 'pass', amount: 5 }])
    const point = createTable({ limits: LIMITS, seed: 1, point: 6, bets: { pass: 5 } })
    const bets = railBets('right', point, 300)
    expect(bets).toContainEqual({ type: 'bet', spot: 'pass-odds', amount: maxBet(point, 'pass-odds') })
    expect(bets).toContainEqual({ type: 'bet', spot: 'come', amount: 5 })
  })

  it('bets the don’t and lays the odds', () => {
    expect(railBets('wrong', createTable({ limits: LIMITS, seed: 1 }), 300)).toEqual([{ type: 'bet', spot: 'dont-pass', amount: 5 }])
    const point = createTable({ limits: LIMITS, seed: 1, point: 4, bets: { 'dont-pass': 5 } })
    expect(railBets('wrong', point, 300)).toEqual([{ type: 'bet', spot: 'dont-pass-odds', amount: 30 }])
  })

  it('places the 6 and 8 in sixes, plays the hardways, and the field every roll', () => {
    const point = createTable({ limits: LIMITS, seed: 1, point: 5, bets: { pass: 5 } })
    expect(railBets('place', point, 300)).toEqual([
      { type: 'bet', spot: 'place-6', amount: 6 },
      { type: 'bet', spot: 'place-8', amount: 6 },
    ])
    expect(railBets('longshot', point, 300).map((a) => a.type === 'bet' && a.spot)).toEqual(['hard-4', 'hard-6', 'hard-8', 'hard-10'])
    expect(railBets('field', point, 300)).toEqual([{ type: 'bet', spot: 'field', amount: 5 }])
  })

  it('never bets more than they have, and takes what odds they can cover', () => {
    const point = createTable({ limits: LIMITS, seed: 1, point: 6, bets: { pass: 5 } })
    expect(railBets('right', point, 7)).toEqual([{ type: 'bet', spot: 'pass-odds', amount: 5 }])
    expect(railBets('right', createTable({ limits: LIMITS, seed: 1 }), 4)).toEqual([])
  })

  it('keep their table in step with yours, and every cap accounted for', () => {
    for (const style of ['right', 'wrong', 'place', 'longshot', 'field'] as const) {
      const { table, theirs, left, net } = play(style, 400, 11, 10_000)
      expect(theirs.point, style).toBe(table.point)
      expect(theirs.hand, style).toBe(table.hand)
      expect(left, style).toBeGreaterThanOrEqual(0)
      // In hand plus on the layout is the buy-in plus what they've won or lost.
      expect(left + onLayout(theirs.bets), style).toBe(10_000 + net)
    }
  })

  it('seats three different regulars a night', () => {
    const three = pickRegulars(createRng(5))
    expect(three).toHaveLength(3)
    expect(new Set(three.map((r) => r.id)).size).toBe(3)
  })

  it('gives every regular something to say on arrival and on leaving, and short names for small plates', () => {
    for (const r of REGULARS) {
      expect(r.lines.hello?.length, r.id).toBeGreaterThan(0)
      expect(r.lines.goodbye?.length, r.id).toBeGreaterThan(0)
      expect(r.name.startsWith(r.short) || r.name.endsWith(r.short), r.id).toBe(true)
      for (const moment of Object.keys(r.lines)) expect(MOMENTS).toContain(moment)
    }
  })
})

/** The events of rolling `dice` at a table with the point on `point`. */
function rolled(point: TableState['point'], dice: Dice, handRolls = 0): { events: TableEvent[]; after: TableState } {
  const table = { ...createTable({ limits: LIMITS, seed: 1, point }), handRolls }
  const r = apply(table, { type: 'roll', dice })
  return { events: r.events, after: r.state }
}

describe('what the rail talks about', () => {
  it('finds a seven-out, a point made and a hardway', () => {
    const out = rolled(6, [3, 4])
    expect(momentsOf(out.events, out.after, [], 5).map((f) => f.moment)).toEqual(['sevenOut'])
    const made = rolled(8, [4, 4])
    expect(momentsOf(made.events, made.after, [], 5).map((f) => f.moment)).toEqual(['pointMade', 'hardway'])
    const yo = rolled(null, [5, 6])
    expect(momentsOf(yo.events, yo.after, [], 5).map((f) => f.moment)).toEqual(['natural'])
  })

  it('notices a long hand every eight rolls', () => {
    const long = rolled(6, [2, 3], 7)
    expect(momentsOf(long.events, long.after, [], 5).map((f) => f.moment)).toContain('hotHand')
    const short = rolled(6, [2, 3], 3)
    expect(momentsOf(short.events, short.after, [], 5).map((f) => f.moment)).not.toContain('hotHand')
  })

  it('credits a big win to whoever won it', () => {
    const out = rolled(6, [3, 4])
    const big: TableEvent[] = [{ type: 'won', spot: 'dont-pass-odds', bet: 60, paid: 50, stays: false }]
    expect(momentsOf(out.events, out.after, [null, big], 5)).toContainEqual({ moment: 'myBigWin', seat: 1 })
  })
})

describe('rail talk', () => {
  const talkers: Talker[] = REGULARS.slice(0, 3).map((regular, seat) => ({ seat, regular }))

  it('always says hello, and doesn’t repeat a line until it has used them all', () => {
    const talk = new RailTalk(createRng(9))
    const doc = { seat: 0, regular: byStyle('right') }
    const hellos = Array.from({ length: doc.regular.lines.hello!.length }, () => talk.say(doc, 'hello'))
    expect(new Set(hellos).size).toBe(doc.regular.lines.hello!.length)
  })

  it('stays quiet a roll after a remark, and speaks up about most seven-outs', () => {
    let spoke = 0
    let twiceRunning = 0
    for (let seed = 0; seed < 200; seed++) {
      const talk = new RailTalk(createRng(seed))
      const first = talk.react([{ moment: 'sevenOut' }], talkers)
      const second = talk.react([{ moment: 'sevenOut' }], talkers)
      if (first) spoke++
      if (first && second) twiceRunning++
    }
    expect(spoke).toBeGreaterThan(80)
    expect(twiceRunning).toBe(0)
  })

  it('only lets a regular brag about their own win', () => {
    for (let seed = 0; seed < 50; seed++) {
      const said = new RailTalk(createRng(seed)).react([{ moment: 'myBigWin', seat: 2 }], talkers)
      if (said) expect(said.seat).toBe(2)
    }
  })
})

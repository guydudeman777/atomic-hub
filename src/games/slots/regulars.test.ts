import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import { helloCall, jackpotCall, winCall } from './calls'
import { MACHINE_INFO, formatChance, payName, payPicture, payValue, returnText } from './content'
import { type Rules, type Stops, type SymbolId, MAX_COINS, spin } from './engine'
import { MACHINES, MACHINE_IDS } from './machines'
import {
  DRY_RUN,
  DUE_AFTER,
  MOMENTS,
  REGULARS,
  type Regular,
  RowTalk,
  afterSpin,
  coinsFor,
  freshMemory,
  isClose,
  momentsOf,
  nextPullIn,
  pickRegulars,
} from './regulars'

const { caps, sevens, rocket } = MACHINES
const regular = (style: Regular['style']) => REGULARS.find((r) => r.style === style)!

/** Stops for a line, picking the stop of each symbol given, or the nth occurrence. */
function stopsFor(rules: Rules, line: readonly SymbolId[]): Stops {
  return line.map((symbol, i) => rules.reels[i].findIndex((s) => s.symbol === symbol)) as unknown as Stops
}

const lose = (rules: Rules, coins = 1) => spin(rules, stopsFor(rules, ['blank', 'blank', 'blank']), coins)
const win = (rules: Rules, coins = 1) => spin(rules, stopsFor(rules, ['cherry', 'blank', 'blank']), coins)

describe('the regulars', () => {
  it('has six, each with a style, a pace, a buy-in and a hello and goodbye', () => {
    expect(REGULARS).toHaveLength(6)
    expect(new Set(REGULARS.map((r) => r.id)).size).toBe(6)
    expect(new Set(REGULARS.map((r) => r.style)).size).toBe(6)
    for (const r of REGULARS) {
      expect(r.pace[0]).toBeLessThan(r.pace[1])
      expect(r.bankroll).toBeGreaterThan(50)
      expect(r.lines.hello?.length).toBeGreaterThan(0)
      expect(r.lines.goodbye?.length).toBeGreaterThan(0)
      for (const moment of Object.keys(r.lines)) expect(MOMENTS).toContain(moment)
    }
  })

  it('seats two of them for the night', () => {
    const two = pickRegulars(createRng(3))
    expect(two).toHaveLength(2)
    expect(two[0].id).not.toBe(two[1].id)
  })

  it('pulls at each one’s own pace', () => {
    const rng = createRng(8)
    for (const r of REGULARS) {
      for (let i = 0; i < 20; i++) {
        const ms = nextPullIn(r, rng)
        expect(ms).toBeGreaterThanOrEqual(r.pace[0] * 1000)
        expect(ms).toBeLessThanOrEqual(r.pace[1] * 1000)
      }
    }
  })

  it('plays one coin, three, or two, by style', () => {
    expect(coinsFor(regular('penny'), freshMemory(regular('penny'), caps), caps, 100)).toBe(1)
    expect(coinsFor(regular('max'), freshMemory(regular('max'), caps), caps, 100)).toBe(3)
    expect(coinsFor(regular('quick'), freshMemory(regular('quick'), caps), caps, 100)).toBe(2)
    // Three where there's a meter to win.
    expect(coinsFor(regular('jackpot'), freshMemory(regular('jackpot'), caps), caps, 100)).toBe(2)
    expect(coinsFor(regular('jackpot'), freshMemory(regular('jackpot'), rocket), rocket, 1000)).toBe(3)
  })

  it('holds a bet to what they can cover, and to nothing below a coin', () => {
    const max = regular('max')
    expect(coinsFor(max, freshMemory(max, sevens), sevens, 12)).toBe(2)
    expect(coinsFor(max, freshMemory(max, sevens), sevens, 4)).toBe(0)
  })

  it('rides a streak up a coin at a time, and drops back to one after a loss', () => {
    const r = regular('streak')
    let memory = freshMemory(r, caps)
    expect(memory.coins).toBe(1)
    memory = afterSpin(r, memory, win(caps), caps)
    expect(memory.coins).toBe(2)
    memory = afterSpin(r, memory, win(caps, 2), caps)
    memory = afterSpin(r, memory, win(caps, 3), caps)
    expect(memory.coins).toBe(MAX_COINS)
    memory = afterSpin(r, memory, lose(caps, 3), caps)
    expect(memory).toEqual({ dry: 1, coins: 1 })
  })

  it('goes to three coins once the machine is due, and back to one after a win', () => {
    const r = regular('due')
    let memory = freshMemory(r, caps)
    for (let i = 0; i < DUE_AFTER - 1; i++) memory = afterSpin(r, memory, lose(caps), caps)
    expect(coinsFor(r, memory, caps, 100)).toBe(1)
    memory = afterSpin(r, memory, lose(caps), caps)
    expect(coinsFor(r, memory, caps, 100)).toBe(3)
    memory = afterSpin(r, memory, win(caps, 3), caps)
    expect(coinsFor(r, memory, caps, 100)).toBe(1)
  })
})

describe('what the row talks about', () => {
  it('calls a top award a jackpot, and a win of 15 times the bet big', () => {
    const top = spin(caps, stopsFor(caps, ['cap', 'cap', 'cap']), 1)
    expect(momentsOf(caps, top, null, 0)).toEqual([{ moment: 'yourJackpot' }])
    expect(momentsOf(caps, top, 1, 0)).toEqual([{ moment: 'myJackpot', seat: 1 }])
    const bells = spin(caps, stopsFor(caps, ['can', 'can', 'can']), 2)
    expect(momentsOf(caps, bells, 0, 0)).toEqual([{ moment: 'myWin', seat: 0 }])
    expect(momentsOf(caps, win(caps), null, 0)).toEqual([])
  })

  it('notices a long dry run, every fifteen pulls', () => {
    expect(momentsOf(caps, lose(caps), 0, DRY_RUN)).toEqual([{ moment: 'dry', seat: 0 }])
    expect(momentsOf(caps, lose(caps), 0, DRY_RUN + 1)).toEqual([])
    expect(momentsOf(caps, lose(caps), 0, DRY_RUN * 2)).toEqual([{ moment: 'dry', seat: 0 }])
  })

  it('sees two top symbols on the line and the third just off it', () => {
    // The cap on reel 3 is at stop 0, so stop 1 has it just above the line.
    const close = spin(caps, [0, 0, 1], 1)
    expect(close.line).toEqual(['cap', 'cap', 'blank'])
    expect(isClose(caps, close)).toBe(true)
    expect(momentsOf(caps, close, null, 1)).toEqual([{ moment: 'close' }])
    expect(isClose(caps, spin(caps, [0, 0, 5], 1))).toBe(false)
    expect(isClose(caps, spin(caps, [0, 0, 0], 1))).toBe(false)
    expect(isClose(sevens, spin(sevens, [0, 21, 0], 1))).toBe(true)
  })
})

describe('the row’s talk', () => {
  const talkers = REGULARS.slice(0, 2).map((regular, seat) => ({ seat, regular }))

  it('always speaks up for a jackpot, from the one who hit it', () => {
    const talk = new RowTalk(createRng(1))
    const said = talk.react([{ moment: 'myJackpot', seat: 1 }], talkers, 10_000)
    expect(said?.seat).toBe(1)
    expect(REGULARS[1].lines.myJackpot).toContain(said?.text)
  })

  it('goes quiet for a while after a remark, less after a big moment', () => {
    const talk = new RowTalk(createRng(1))
    expect(talk.react([{ moment: 'myJackpot', seat: 0 }], talkers, 0)).not.toBeNull()
    expect(talk.react([{ moment: 'yourJackpot' }], talkers, 1000)).toBeNull()
    expect(talk.react([{ moment: 'yourJackpot' }], talkers, 3000)).not.toBeNull()
    expect(talk.react([{ moment: 'dry', seat: 0 }], talkers, 8000)).toBeNull()
  })

  it('fills in the caps won, and doesn’t repeat a line until it has used them all', () => {
    const talk = new RowTalk(createRng(4))
    const opal = REGULARS.find((r) => r.id === 'opal')!
    const lines = opal.lines.myWin!
    const said: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const s = talk.react([{ moment: 'myWin', seat: 0 }], [{ seat: 0, regular: { ...opal, chattiness: 10 } }], i * 10_000, 1250)
      said.push(s!.text)
    }
    expect(new Set(said).size).toBe(lines.length)
    expect(said.some((s) => s.includes('1,250 caps'))).toBe(true)
  })

  it('says hello and goodbye whenever asked', () => {
    const talk = new RowTalk(createRng(2))
    for (const regular of REGULARS) {
      expect(regular.lines.hello).toContain(talk.say({ seat: 0, regular }, 'hello', 0))
      expect(regular.lines.goodbye).toContain(talk.say({ seat: 0, regular }, 'goodbye', 0))
    }
  })
})

describe('the glass and the change girl', () => {
  it('names every pay the way the glass reads', () => {
    expect(caps.pays.map(payName)).toEqual([
      'Three bottle caps',
      'Three bells',
      'Three cherries',
      'Three horseshoes',
      'Three tin cans',
      'Any three junk',
      'Any two cherries',
      'Any cherry',
    ])
    expect(sevens.pays.map(payName).slice(5)).toEqual(['Any three bars', 'Any two atoms', 'Any atom'])
    expect(payValue(rocket.pays[0], 3)).toBe('Jackpot')
    expect(payValue(rocket.pays[0], 1)).toBe('1,000')
    expect(payPicture(caps.pays[6])).toEqual(['cherry', 'cherry', 'any'])
    expect(payPicture(sevens.pays[5])).toEqual(['bar2', 'bar3', 'bar1'])
    expect(payPicture(caps.pays[0])).toEqual(['cap', 'cap', 'cap'])
  })

  it('describes every machine', () => {
    expect(MACHINE_INFO.map((m) => m.id)).toEqual([...MACHINE_IDS])
    expect(returnText(caps)).toBe('Pays back 94.96%, however many coins.')
    expect(returnText(rocket)).toBe('Pays back 95.07% on three coins, 92.05% on fewer.')
    expect(formatChance(1 / 32_768)).toBe('1 in 32,768')
    expect(formatChance(1 / 3.71)).toBe('1 in 3.7')
  })

  it('has the change girl greet you at every machine and call the winners', () => {
    const rng = createRng(6)
    for (const id of MACHINE_IDS) expect(helloCall(id, rng)).toMatch(/hon|sugar/)
    expect(winCall(null, 1500, rng)).toContain('1,500')
    expect(winCall('Dusty Wade', 300, rng)).toContain('Dusty Wade')
    expect(jackpotCall('Moon Rocket', null, 123_456, rng)).toContain('123,456')
  })
})

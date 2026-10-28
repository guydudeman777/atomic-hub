import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import { noMoreBets, numberWord, placeBets, resultCall } from './calls'
import { DOUBLE_ZERO, type Limits, type TableState, type WheelKind, apply, createTable, onLayout, summarize } from './engine'
import { REGULARS, type Regular, WheelTalk, afterSpin, colorRun, freshMemory, momentsOf, planBets } from './regulars'

const LIMITS: Limits = { insideMin: 1, outsideMin: 5, straightMax: 25, outsideMax: 250 }
const table = (wheel: WheelKind = 'european', history: number[] = []): TableState => createTable({ wheel, limits: LIMITS, history })
const regular = (id: string): Regular => REGULARS.find((r) => r.id === id)!

/** The bets a regular's plan comes to, by spot. */
function planned(id: string, state: TableState, stack = 1000, step = 0) {
  const { actions, memory } = planBets(regular(id), state, stack, { step })
  let s = state
  for (const a of actions) s = apply(s, a, stack).state
  return { bets: s.bets, step: memory.step }
}

describe('the regulars’ systems', () => {
  it('doubles on red after every loss, and starts again when the doubling outgrows the table', () => {
    expect(planned('duval', table()).bets).toEqual({ red: 5 })
    expect(planned('duval', table(), 1000, 3).bets).toEqual({ red: 40 })
    // 5 × 2⁶ is 320, over the 250 maximum.
    expect(planned('duval', table(), 1000, 6)).toEqual({ bets: { red: 5 }, step: 0 })
    // Or over what's left in front of him.
    expect(planned('duval', table(), 30, 3)).toEqual({ bets: { red: 5 }, step: 0 })
    const m = regular('duval')
    expect(afterSpin(m, { step: 2 }, -20)).toEqual({ step: 3 })
    expect(afterSpin(m, { step: 2 }, 20)).toEqual({ step: 0 })
  })

  it('climbs the Fibonacci sequence on black, and steps two back after a win', () => {
    expect(planned('kranz', table(), 1000, 4).bets).toEqual({ black: 25 })
    const k = regular('kranz')
    expect(afterSpin(k, { step: 4 }, -25)).toEqual({ step: 5 })
    expect(afterSpin(k, { step: 4 }, 25)).toEqual({ step: 2 })
    expect(afterSpin(k, { step: 1 }, 5)).toEqual({ step: 0 })
  })

  it('bets the Contessa’s three numbers straight up', () => {
    expect(planned('lucia', table()).bets).toEqual({ 'straight-7': 2, 'straight-11': 2, 'straight-23': 2 })
  })

  it('spreads Mr. Sterling’s 14, 5 and 1 units over high, the six line and zero', () => {
    expect(planned('sterling', table()).bets).toEqual({ high: 14, 'line-13': 5, 'straight-0': 1 })
    const grand = createTable({ wheel: 'french', limits: { insideMin: 5, outsideMin: 25, straightMax: 100, outsideMax: 1000 } })
    expect(planned('sterling', grand).bets).toEqual({ high: 70, 'line-13': 25, 'straight-0': 5 })
  })

  it('follows the hot numbers, and the dozens the last number missed', () => {
    expect(planned('mimi', table('american', [DOUBLE_ZERO, 4, DOUBLE_ZERO, 9, 30])).bets).toEqual({ 'straight-00': 2, 'straight-4': 2, 'straight-9': 2 })
    expect(planned('mimi', table()).bets).toEqual({ 'straight-17': 2 })
    expect(planned('ashby', table('european', [14])).bets).toEqual({ 'dozen-1': 5, 'dozen-3': 5 })
    expect(planned('ashby', table('european', [0])).bets).toEqual({ 'dozen-2': 5, 'dozen-3': 5 })
  })

  it('puts the French wheel’s even chances down in twos', () => {
    expect(planned('duval', table('french')).bets).toEqual({ red: 6 })
  })

  it('bets nothing it can’t cover', () => {
    for (const r of REGULARS) {
      const { actions } = planBets(r, table(), 3, freshMemory())
      let s = table()
      for (const a of actions) s = apply(s, a, 3).state
      expect(onLayout(s.bets), r.name).toBeLessThanOrEqual(3)
    }
  })

  it('every regular can buy in and play a night through the engine', () => {
    for (const r of REGULARS) {
      const rng = createRng(r.id.length * 31)
      let stack = r.bankroll * LIMITS.outsideMin
      let memory = freshMemory()
      let state = table('french')
      for (let spin = 0; spin < 200; spin++) {
        const plan = planBets(r, { ...state, bets: {} }, stack, memory)
        let s: TableState = { ...state, bets: {} }
        for (const a of plan.actions) {
          s = apply(s, a, stack).state
          stack -= a.type === 'bet' ? a.amount : 0
        }
        if (plan.actions.length === 0) break
        const pocket = Math.floor(rng() * 37)
        const { state: after, events } = apply(s, { type: 'spin', pocket })
        const { paid, lost, back } = summarize(events)
        stack += paid + back + onLayout(after.bets)
        memory = afterSpin(r, plan.memory, paid - lost)
        state = after
        expect(stack, r.name).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('what the table talks about', () => {
  it('counts a run of one color, broken by a zero', () => {
    expect(colorRun([1, 3, 5, 7, 2])).toBe(4)
    expect(colorRun([0, 1, 3])).toBe(0)
    expect(colorRun([])).toBe(0)
  })

  it('names your number, theirs, a zero and a repeat, most notable first', () => {
    let state = table('european', [0])
    const mine = apply(createTable({ wheel: 'european', limits: LIMITS, bets: { 'straight-0': 1 } }), { type: 'spin', pocket: 0 }).events
    const theirs = apply(createTable({ wheel: 'european', limits: LIMITS, bets: { 'straight-0': 2, red: 10 } }), { type: 'spin', pocket: 0 }).events
    state = apply(state, { type: 'spin', pocket: 0 }).state
    expect(momentsOf(state, [null, theirs], mine, 5).map((f) => `${f.moment}${f.seat ?? ''}`)).toEqual(['yourNumber', 'myNumber1', 'bigWin1', 'zero', 'repeat'])
  })

  it('takes turns, fills in the number, and keeps quiet after an ordinary remark', () => {
    const talk = new WheelTalk(createRng(3))
    const after = apply(table(), { type: 'spin', pocket: 23 }).state
    const lucia = { seat: 0, regular: { ...regular('lucia'), chattiness: 100 } }
    const said = talk.react([{ moment: 'myNumber', seat: 0 }], [lucia], after)
    expect(said?.seat).toBe(0)
    expect(said?.text).toMatch(/23/)
    // A repeat is a small moment: it waits two spins after a remark.
    expect(talk.react([{ moment: 'repeat' }], [lucia], after)).toBeNull()
    expect(talk.react([{ moment: 'repeat' }], [lucia], after)).toBeNull()
    expect(talk.react([{ moment: 'repeat' }], [lucia], after)?.text).toMatch(/23/)
  })

  it('has a hello and a goodbye for everyone, and lines for each moment they’re in', () => {
    const talk = new WheelTalk(createRng(9))
    for (const [seat, r] of REGULARS.entries()) {
      expect(talk.say({ seat, regular: r }, 'hello'), r.name).toBeTruthy()
      expect(talk.say({ seat, regular: r }, 'goodbye'), r.name).toBeTruthy()
      for (const lines of Object.values(r.lines)) expect(lines!.length).toBeGreaterThan(0)
    }
    expect(new Set(REGULARS.map((r) => r.color)).size).toBe(REGULARS.length)
  })
})

describe('the croupier', () => {
  it('calls the number with its even chances', () => {
    expect(resultCall(17, 'european')).toBe('Seventeen, black, odd, low.')
    expect(resultCall(32, 'american')).toBe('Thirty-two, red, even, high.')
    expect(resultCall(DOUBLE_ZERO, 'american')).toBe('Double zero, green.')
    expect(resultCall(0, 'european')).toBe('Zero, green.')
  })

  it('calls the French wheel in French, la partage and all', () => {
    expect(resultCall(17, 'french')).toBe('Dix-sept, noir, impair et manque.')
    expect(resultCall(21, 'french')).toBe('Vingt et un, rouge, impair et passe.')
    expect(resultCall(0, 'french')).toBe('Zéro. Partage sur les chances simples.')
    const rng = createRng(1)
    expect(placeBets('fr', rng)).toMatch(/Faites vos jeux/)
    expect(noMoreBets('fr', rng)).toMatch(/Rien ne va plus/)
    expect(noMoreBets('en', rng)).toMatch(/No more bets/)
  })

  it('has a word for every number', () => {
    for (let n = 0; n <= 36; n++) {
      expect(numberWord(n)).toBeTruthy()
      expect(numberWord(n, 'fr')).toBeTruthy()
    }
  })
})

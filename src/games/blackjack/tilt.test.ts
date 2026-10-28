import { describe, expect, it } from 'vitest'
import { type Rng, createRng } from '../../core/rng'
import { botAction, botBet, freshMemory, remember } from './bots'
import { REGULARS, type Regular, regularById } from './content'
import { type Hand, actor, apply, createTable, dealerHasBlackjack } from './engine'
import { type Mood, type RoundFeeling, type Scene, calmMood, headline, moodAfter, sceneAfter, sting, vacancyRounds } from './tilt'

const hand = (extra: Partial<Hand> = {}): Hand => ({ cards: [], bet: 10, doubled: false, split: false, done: true, outcome: 'lose', payout: 0, ...extra })

/** An rng that returns these numbers in turn, then repeats the last. */
const rolls = (...values: number[]): Rng => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

const hothead = { slam: 1, curse: 1, quit: 1 }
const feeling = (extra: Partial<RoundFeeling> = {}): RoundFeeling => ({
  temper: hothead,
  mood: { losses: 1, slams: 0 },
  sting: 0.6,
  down: 0,
  hotBet: false,
  ...extra,
})

describe('a sting', () => {
  it('is nothing on a win or a push, and worse for doubles, dealer blackjacks and streaks', () => {
    expect(sting([hand({ outcome: 'win' })], 10, 0, false)).toBe(0)
    expect(sting([hand({ outcome: 'push' })], 0, 2, false)).toBe(0)
    const plain = sting([hand()], -10, 1, false)
    expect(plain).toBeCloseTo(0.35)
    expect(sting([hand({ doubled: true, bet: 20 })], -20, 1, false)).toBeGreaterThan(plain)
    expect(sting([hand()], -10, 1, true)).toBeGreaterThan(plain)
    expect(sting([hand()], -10, 4, false)).toBeCloseTo(0.65)
    expect(sting([hand({ split: true })], -20, 9, true)).toBe(1)
  })

  it('counts losses in a row, and a win clears them', () => {
    let mood: Mood = calmMood()
    for (const net of [-5, -5, 0, -5]) mood = moodAfter(mood, net)
    expect(mood.losses).toBe(3)
    expect(moodAfter(mood, 5).losses).toBe(0)
  })
})

describe('a scene', () => {
  it('never comes from a calm regular or a round that didn’t hurt', () => {
    expect(sceneAfter(feeling({ temper: { slam: 0, curse: 0, quit: 0 } }), rolls(0))).toBeNull()
    expect(sceneAfter(feeling({ sting: 0 }), rolls(0))).toBeNull()
  })

  it('is a slam, then a curse, as the roll goes up', () => {
    expect(sceneAfter(feeling(), rolls(0))).toEqual({ kind: 'slam' })
    expect(sceneAfter(feeling(), rolls(0.3))).toEqual({ kind: 'curse' })
    expect(sceneAfter(feeling(), rolls(0.9))).toBeNull()
  })

  it('gets you walked out on the third slam, and maybe the second', () => {
    expect(sceneAfter(feeling({ mood: { losses: 1, slams: 2 } }), rolls(0))).toEqual({ kind: 'kicked', why: 'slamming' })
    expect(sceneAfter(feeling({ mood: { losses: 1, slams: 1 } }), rolls(0, 0.1))).toEqual({ kind: 'kicked', why: 'slamming' })
    expect(sceneAfter(feeling({ mood: { losses: 1, slams: 1 } }), rolls(0, 0.9))).toEqual({ kind: 'slam' })
  })

  it('can be storming off after a run of losses or half the buy-in gone', () => {
    const quitter = { slam: 0.5, curse: 1, quit: 1 }
    expect(sceneAfter(feeling({ temper: quitter, mood: { losses: 3, slams: 0 } }), rolls(0, 0.9))).toEqual({ kind: 'quit', slam: false })
    expect(sceneAfter(feeling({ down: 0.6 }), rolls(0, 0))).toEqual({ kind: 'quit', slam: true })
    expect(sceneAfter(feeling({ mood: { losses: 2, slams: 0 } }), rolls(0.9))).toBeNull()
  })

  it('brings the pit boss for a counter betting big, win or lose', () => {
    expect(sceneAfter(feeling({ hotBet: true, sting: 0 }), rolls(0))).toEqual({ kind: 'kicked', why: 'counting' })
  })

  it('goes to the most dramatic one when several regulars react', () => {
    const scenes: { spot: number; scene: Scene }[] = [
      { spot: 0, scene: { kind: 'curse' } },
      { spot: 1, scene: { kind: 'quit', slam: false } },
      { spot: 3, scene: { kind: 'slam' } },
    ]
    expect(headline(scenes)?.spot).toBe(1)
    expect(headline([])).toBeNull()
  })

  it('leaves a seat empty for one to three rounds', () => {
    const rng = createRng(4)
    const gaps = new Set(Array.from({ length: 200 }, () => vacancyRounds(rng)))
    expect([...gaps].sort()).toEqual([1, 2, 3])
  })
})

describe('the regulars’ tempers', () => {
  it('come with lines for everything they might do', () => {
    for (const r of REGULARS) {
      const { lines } = r.banter
      if (r.temper.slam > 0) expect(lines.mySlam?.length, `${r.name} slams`).toBeGreaterThan(0)
      if (r.temper.slam > 0 || r.style.betting === 'spread') expect(lines.kickedOut?.length, `${r.name} gets thrown out`).toBeGreaterThan(0)
      if (r.temper.quit > 0) expect(lines.rageQuit?.length, `${r.name} storms off`).toBeGreaterThan(0)
      if (r.temper.curse > 0) expect(lines.myCurse?.length, `${r.name} swears`).toBeGreaterThan(0)
    }
  })

  /** Scenes per 100 rounds for one regular playing alone, rejoining with a fresh buy-in after leaving. */
  function scenes(r: Regular, rounds: number) {
    const rng = createRng(7)
    const min = 5
    const buyIn = r.bankroll * min
    let state = createTable({ spots: 1, limits: { min, max: 100 }, seed: 3 })
    let memory = freshMemory()
    let mood = calmMood()
    let stack = buyIn
    const counts = { slam: 0, curse: 0, quit: 0, slamming: 0, counting: 0 }
    for (let i = 0; i < rounds; i++) {
      const bet = botBet(r.style, memory, state, stack) || ((stack = buyIn), botBet(r.style, freshMemory(), state, stack))
      stack -= bet
      state = apply(state, { type: 'deal', bets: [bet] }).state
      let net = 0
      while (state.phase !== 'settled') {
        const res = apply(state, actor(state) === 'dealer' ? { type: 'next' } : botAction(r.style, state, stack), stack)
        for (const e of res.events) {
          if (e.type === 'staked') stack -= e.amount
          if (e.type === 'settled') {
            stack += e.results[0].returned
            net = e.results[0].returned - e.results[0].staked
          }
        }
        state = res.state
      }
      memory = remember(bet, net)
      mood = moodAfter(mood, net)
      const hurt = sting(state.spots[0].hands, net, mood.losses, dealerHasBlackjack(state))
      const scene = sceneAfter({ temper: r.temper, mood, sting: hurt, down: Math.max(0, (buyIn - stack) / buyIn), hotBet: r.style.betting === 'spread' && bet >= min * 6 }, rng)
      if (!scene) continue
      if (scene.kind === 'kicked') counts[scene.why]++
      else counts[scene.kind]++
      if (scene.kind === 'slam' || (scene.kind === 'kicked' && scene.why === 'slamming')) mood = { ...mood, slams: mood.slams + 1 }
      if (scene.kind === 'quit' || scene.kind === 'kicked') {
        stack = buyIn
        mood = calmMood()
        memory = freshMemory()
      }
    }
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v * 100) / rounds])) as typeof counts
  }

  it('make a scene now and then, not every hand', { timeout: 60_000 }, () => {
    const sal = scenes(regularById('sal')!, 2000)
    expect(sal.slam).toBeGreaterThan(2)
    expect(sal.slam).toBeLessThan(10)
    expect(sal.curse).toBeLessThan(12)
    expect(sal.counting).toBe(0)

    const pearl = scenes(regularById('pearl')!, 2000)
    expect(pearl.slam + pearl.slamming + pearl.quit).toBe(0)
    expect(pearl.curse).toBeGreaterThan(0)

    // The counter only ever leaves when the pit boss asks him to.
    const grey = scenes(regularById('grey')!, 2000)
    expect(grey.counting).toBeGreaterThan(0)
    expect(grey.slam + grey.slamming + grey.quit).toBe(0)
  })
})

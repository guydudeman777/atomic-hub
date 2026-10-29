import { describe, expect, it } from 'vitest'
import { createRng } from '../../core/rng'
import { helloCall, jackpotCall, winCall } from './calls'
import { MACHINE_INFO, formatChance, payName, payPicture, payValue, returnText } from './content'
import { MACHINES, MACHINE_IDS } from './machines'

const { caps, sevens, rocket } = MACHINES

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
    expect(winCall(1500, rng)).toContain('1,500')
    expect(jackpotCall('Moon Rocket', null, 123_456, rng)).toContain('123,456')
    expect(jackpotCall('Moon Rocket', 'Guesty', 123_456, rng)).toContain('Guesty')
  })
})

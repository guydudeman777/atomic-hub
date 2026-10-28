/**
 * The stickman's calls: what every roll is, said the way it's said at a
 * Vegas table. "Yo-leven!", "Six, the hard way", "Seven out, line away".
 *
 * Pure apart from the rng, which only picks between ways of saying the
 * same thing.
 */

import { type Rng, pick } from '../../core/rng'
import { type TableEvent, isHard } from './engine'

const NAME: Record<number, string> = { 4: 'Four', 5: 'Five', 6: 'Six', 8: 'Eight', 9: 'Nine', 10: 'Ten' }

/** A point number as it's called: "Six the hard way" or "Six, easy six". Five and nine are never hard. */
function numberCall(total: number, hard: boolean): string {
  const name = NAME[total]
  if (total === 5) return 'Five, no field five'
  if (total === 9) return 'Nine, center field nine'
  if (hard) return total === 4 ? 'Four the hard way, little Joe' : `${name} the hard way`
  return `${name}, easy ${name.toLowerCase()}`
}

/** The call for one roll, from its events. */
export function stickmanCall(events: readonly TableEvent[], rng: Rng): string | null {
  const rolled = events.find((e) => e.type === 'rolled')
  if (!rolled || rolled.type !== 'rolled') return null
  const { dice, total, comeOut } = rolled
  const hard = isHard(dice)
  const change = events.find((e) => e.type === 'point-set' || e.type === 'point-made' || e.type === 'seven-out')

  if (change?.type === 'seven-out') {
    return pick(['Seven out! Line away, pay the don’ts.', 'Seven, seven out. Take the line, pay the don’t.', 'Seven out. New shooter coming out.'], rng)
  }
  if (change?.type === 'point-made') {
    return pick([`Winner! ${numberCall(total, hard)}. Pay the line!`, `${numberCall(total, hard)}, winner on the pass line!`], rng)
  }
  if (change?.type === 'point-set') {
    return pick([`${numberCall(total, hard)}. The point is ${total}, mark it!`, `${numberCall(total, hard)}. Puck’s on the ${total}.`], rng)
  }

  if (comeOut) {
    switch (total) {
      case 7:
        return pick(['Seven, front line winner! Pay the line, take the don’t.', 'Seven, a natural! Winner on the pass line.'], rng)
      case 11:
        return pick(['Yo-leven! Front line winner.', 'Eleven, yo! Pay the line.'], rng)
      case 2:
        return pick(['Aces! Craps two, line away.', 'Snake eyes, craps. Take the line.'], rng)
      case 3:
        return pick(['Ace-deuce, craps three. Line away.', 'Three craps three, take the line.'], rng)
      case 12:
        return pick(['Boxcars! Craps twelve, bar the don’t.', 'Twelve, midnight. Craps, the don’t pushes.'], rng)
    }
  }

  switch (total) {
    case 2:
      return pick(['Aces, two craps two. Field pays double.', 'Snake eyes! Double in the field.'], rng)
    case 3:
      return pick(['Three, ace-deuce. Field roll.', 'Ace-deuce, three in the field.'], rng)
    case 11:
      return pick(['Yo-leven! Field and the yo.', 'Eleven, yo! Pay the field.'], rng)
    case 12:
      return pick(['Twelve, boxcars! Field pays triple.', 'Midnight! Boxcars, triple in the field.'], rng)
    default:
      return `${numberCall(total, hard)}.`
  }
}

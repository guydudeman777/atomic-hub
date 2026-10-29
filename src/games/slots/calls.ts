/**
 * The change girl's calls. Dottie walks the row with a coin belt and a
 * tray: she says hello as you sit down, calls the jackpots and the big
 * winners so the whole floor knows, and now and then sings out for change.
 *
 * Pure apart from the rng, which only picks between ways of saying the
 * same thing.
 */

import { type Rng, pick } from '../../core/rng'
import type { MachineId } from './machines'

export const CHANGE_GIRL = 'Dottie'

const HELLO: Record<MachineId, readonly string[]> = {
  caps: [
    'Evening, hon. Bottle Caps is a cap a coin. Holler if you need change.',
    'Welcome to the row, sugar. The cherries pay on their own on this one.',
    'Hi, hon. Easy machine, this one. Lots of little wins.',
  ],
  sevens: [
    'Evening, hon. Atomic Sevens, five caps a coin. Watch for the atoms: they double everything.',
    'Welcome, sugar. Two atoms on a line and it pays four times. Good luck.',
    'Hi, hon. Three coins pays the bonus on three atoms, just so you know.',
  ],
  rocket: [
    'Evening, hon. Moon Rocket, 25 a coin. Three coins to win the meter.',
    'Welcome, sugar. That meter up top? Three rockets on three coins takes the lot.',
    'Hi, hon. Big machine, this one. Hang on to your hat.',
  ],
}

/** As you sit down. */
export const helloCall = (machine: MachineId, rng: Rng): string => pick(HELLO[machine], rng)

/** A big win: yours, or someone's down the row. */
export function winCall(who: string | null, caps: number, rng: Rng): string {
  const amount = caps.toLocaleString()
  if (who === null) return pick([`Winner! ${amount} caps. Nice pull, hon.`, `Ooh, winner on your machine! ${amount}!`, `There it is! ${amount} caps for you, sugar.`], rng)
  return pick([`Winner down the row! ${amount} for ${who}.`, `${who} hits for ${amount}!`], rng)
}

/** A top award, called for the whole floor. */
export function jackpotCall(machineName: string, who: string | null, caps: number, rng: Rng): string {
  const amount = caps.toLocaleString()
  if (who === null) return pick([`Jackpot on ${machineName}! ${amount} caps! Don’t you move, hon.`, `Jackpot! Jackpot on ${machineName}! ${amount} caps, sugar!`], rng)
  return pick([`Jackpot on ${machineName}! ${amount} caps for ${who}!`, `Jackpot down the row! ${who}, ${amount} caps!`], rng)
}

/** Every so often, walking by. */
export const changeCall = (rng: Rng): string => pick(['Change! Who needs change?', 'Change, change! Caps for coins!', 'Change girl! Anybody?'], rng)

/** Walking by Moon Rocket with the meter high: the floor likes to know. */
export const meterCall = (caps: number): string => `That meter’s at ${caps.toLocaleString()} caps, folks. Somebody’s taking it home.`

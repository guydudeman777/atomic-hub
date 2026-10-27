/**
 * Seeded pseudo-random number generation.
 *
 * Every game takes an `Rng` instead of calling Math.random directly, so a
 * seed reproduces a whole game exactly (tests, bug reports, replays).
 */

export type Rng = () => number

/** mulberry32: small, fast, good enough for card games. Returns [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh seed for a new game when no seed is requested. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

/** Integer in [0, maxExclusive). */
export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[randInt(rng, items.length)]
}

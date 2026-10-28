/**
 * Reversi bitboards: the board as two 64-bit sets of squares, one per
 * color, each held in two 32-bit halves (`lo` for squares 0–31, `hi` for
 * 32–63). Square `row * 8 + col`, a1 is square 0 and h8 square 63.
 *
 * JavaScript has no fast 64-bit integers (BigInt allocates on every
 * operation), so these work on pairs of plain numbers and hand results back
 * through `out` rather than allocating. The engine and the AI share them;
 * the AI calls them millions of times a move.
 */

/** Where two-word results land. Read both halves before the next call. */
export const out = { lo: 0, hi: 0 }

/** Every square except file a, in either half: no wrapping onto the next row going east. */
const NOT_A = 0xfefefefe | 0
/** Every square except file h: no wrapping going west. */
const NOT_H = 0x7f7f7f7f
const ALL = -1

/**
 * The eight directions as a shift and an edge mask for the squares a step
 * can land on: east is +1, south (down the board, toward row 8) is +8.
 */
const SHIFT = [1, 9, 8, 7, 1, 9, 8, 7] as const
const LEFT = [true, true, true, true, false, false, false, false] as const
const MASK = [NOT_A, NOT_A, ALL, NOT_H, NOT_H, NOT_H, ALL, NOT_A] as const
/** Each direction's step, as rows and columns. */
export const STEP: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
]

export function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  x = (x + (x >>> 4)) & 0x0f0f0f0f
  return Math.imul(x, 0x01010101) >>> 24
}

export const count = (lo: number, hi: number) => popcount(lo) + popcount(hi)

/** Whether square `sq` is in the set. */
export const has = (lo: number, hi: number, sq: number) => (sq < 32 ? (lo >>> sq) & 1 : (hi >>> (sq - 32)) & 1) === 1

/** The lowest square in a non-empty set. */
export const lowest = (lo: number, hi: number) => (lo !== 0 ? 31 - Math.clz32(lo & -lo) : 63 - Math.clz32(hi & -hi))

/**
 * The squares the side with discs `p` can play against `o`: empty, and
 * with a line of `o`'s discs running from them to one of `p`'s.
 */
export function moves(pLo: number, pHi: number, oLo: number, oHi: number): void {
  const emptyLo = ~(pLo | oLo)
  const emptyHi = ~(pHi | oHi)
  let rLo = 0
  let rHi = 0
  for (let d = 0; d < 8; d++) {
    const n = SHIFT[d]
    const m = MASK[d]
    const mLo = oLo & m
    const mHi = oHi & m
    let tLo: number
    let tHi: number
    if (LEFT[d]) {
      tLo = (pLo << n) & mLo
      tHi = ((pHi << n) | (pLo >>> (32 - n))) & mHi
      for (let k = 0; k < 5; k++) {
        const sLo = tLo << n
        const sHi = (tHi << n) | (tLo >>> (32 - n))
        tLo |= sLo & mLo
        tHi |= sHi & mHi
      }
      rLo |= (tLo << n) & m & emptyLo
      rHi |= ((tHi << n) | (tLo >>> (32 - n))) & m & emptyHi
    } else {
      tLo = ((pLo >>> n) | (pHi << (32 - n))) & mLo
      tHi = (pHi >>> n) & mHi
      for (let k = 0; k < 5; k++) {
        const sLo = (tLo >>> n) | (tHi << (32 - n))
        const sHi = tHi >>> n
        tLo |= sLo & mLo
        tHi |= sHi & mHi
      }
      rLo |= ((tLo >>> n) | (tHi << (32 - n))) & m & emptyLo
      rHi |= (tHi >>> n) & m & emptyHi
    }
  }
  out.lo = rLo
  out.hi = rHi
}

/** Every square next to an empty one, in any direction: where the frontier is. */
export function bordering(emptyLo: number, emptyHi: number): void {
  let rLo = 0
  let rHi = 0
  for (let d = 0; d < 8; d++) {
    const n = SHIFT[d]
    const m = MASK[d]
    if (LEFT[d]) {
      rLo |= (emptyLo << n) & m
      rHi |= ((emptyHi << n) | (emptyLo >>> (32 - n))) & m
    } else {
      rLo |= ((emptyLo >>> n) | (emptyHi << (32 - n))) & m
      rHi |= (emptyHi >>> n) & m
    }
  }
  out.lo = rLo
  out.hi = rHi
}

/**
 * The discs of `o` that `p` turns over by playing on `sq`, in every
 * direction. Empty when the square doesn't flank anything.
 */
export function flips(pLo: number, pHi: number, oLo: number, oHi: number, sq: number): void {
  let rLo = 0
  let rHi = 0
  const startLo = sq < 32 ? 1 << sq : 0
  const startHi = sq < 32 ? 0 : 1 << (sq - 32)
  for (let d = 0; d < 8; d++) {
    const n = SHIFT[d]
    const m = MASK[d]
    let fLo = 0
    let fHi = 0
    let xLo = startLo
    let xHi = startHi
    for (;;) {
      let sLo: number
      let sHi: number
      if (LEFT[d]) {
        sLo = (xLo << n) & m
        sHi = ((xHi << n) | (xLo >>> (32 - n))) & m
      } else {
        sLo = ((xLo >>> n) | (xHi << (32 - n))) & m
        sHi = (xHi >>> n) & m
      }
      if ((sLo & oLo) | (sHi & oHi)) {
        fLo |= sLo
        fHi |= sHi
        xLo = sLo
        xHi = sHi
        continue
      }
      if ((sLo & pLo) | (sHi & pHi)) {
        rLo |= fLo
        rHi |= fHi
      }
      break
    }
  }
  out.lo = rLo
  out.hi = rHi
}

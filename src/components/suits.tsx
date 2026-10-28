/**
 * Suit symbols in a 20-unit box, filled with the current fill. Shared by the
 * playing cards and the hub's glyphs.
 */

import type { ReactNode } from 'react'
import type { Suit } from '../core/cards'

const SUIT_PATH: Record<Suit, ReactNode> = {
  H: <path d="M10 18.5C10 18.5 1 12.4 1 6.6 1 3.6 3.3 1.5 5.9 1.5c1.9 0 3.3 1 4.1 2.6.8-1.6 2.2-2.6 4.1-2.6 2.6 0 4.9 2.1 4.9 5.1 0 5.8-9 11.9-9 11.9z" />,
  D: <path d="M10 1l7.6 9L10 19 2.4 10z" />,
  S: (
    <path d="M10 1S1.5 7.4 1.5 11.9c0 2.6 2 4.3 4.1 4.3 1.6 0 2.8-.8 3.6-1.9-.2 1.9-1 3.5-2.7 4.7h7c-1.7-1.2-2.5-2.8-2.7-4.7.8 1.1 2 1.9 3.6 1.9 2.1 0 4.1-1.7 4.1-4.3C18.5 7.4 10 1 10 1z" />
  ),
  C: (
    <>
      <circle cx="10" cy="5.6" r="4.3" />
      <circle cx="5" cy="11.4" r="4.3" />
      <circle cx="15" cy="11.4" r="4.3" />
      <path d="M8.8 11c0 3.4-.6 5.9-2.6 8h7.6c-2-2.1-2.6-4.6-2.6-8z" />
    </>
  ),
}

export function SuitPath({ suit }: { suit: Suit }) {
  return SUIT_PATH[suit]
}

export function SuitGlyph({ suit, x, y, size, flip = false }: { suit: Suit; x: number; y: number; size: number; flip?: boolean }) {
  const s = size / 20
  const transform = flip
    ? `translate(${x + size / 2} ${y + size / 2}) rotate(180) translate(${-size / 2} ${-size / 2}) scale(${s})`
    : `translate(${x} ${y}) scale(${s})`
  return <g transform={transform}>{SUIT_PATH[suit]}</g>
}

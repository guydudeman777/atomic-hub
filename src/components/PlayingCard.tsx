/**
 * SVG playing cards. Faces share one design; each collectible set gets its
 * own back and an accent color on the face frame. Caravan's face cards name
 * what they do; the casino deck's are plain court cards.
 */

import { type ReactNode, memo, useId } from 'react'
import { type Card, type NumberRank, type Suit, cardName, isNumberRank, isRed, pipValue } from '../core/cards'

const W = 100
const H = 140

const SET_ACCENT: Record<string, string> = {
  standard: '#6b7445',
  rust: '#a4532a',
  bloom: '#5f7d4a',
  neon: '#d43d8c',
  atomic: '#2a7a7e',
  gold: '#b48a2a',
  vegas: '#a3202a',
}

/** Sets whose court cards don't carry Caravan's effect labels. */
const PLAIN_FACES = new Set(['vegas'])

const accentOf = (set: string) => SET_ACCENT[set] ?? '#6b7445'

// ---- Suits ------------------------------------------------------------------

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

function SuitGlyph({ suit, x, y, size, flip = false }: { suit: Suit; x: number; y: number; size: number; flip?: boolean }) {
  const s = size / 20
  const transform = flip
    ? `translate(${x + size / 2} ${y + size / 2}) rotate(180) translate(${-size / 2} ${-size / 2}) scale(${s})`
    : `translate(${x} ${y}) scale(${s})`
  return <g transform={transform}>{SUIT_PATH[suit]}</g>
}

// ---- Number card pips -------------------------------------------------------

const L = 35
const C = 50
const R = 65
const T = 36
const B = 104
const M = 70
const Q1 = 58.7
const Q3 = 81.3
const PIPS: Record<number, [number, number][]> = {
  2: [[C, T], [C, B]],
  3: [[C, T], [C, M], [C, B]],
  4: [[L, T], [R, T], [L, B], [R, B]],
  5: [[L, T], [R, T], [C, M], [L, B], [R, B]],
  6: [[L, T], [R, T], [L, M], [R, M], [L, B], [R, B]],
  7: [[L, T], [R, T], [C, 53], [L, M], [R, M], [L, B], [R, B]],
  8: [[L, T], [R, T], [C, 53], [L, M], [R, M], [C, 87], [L, B], [R, B]],
  9: [[L, T], [R, T], [L, Q1], [R, Q1], [C, M], [L, Q3], [R, Q3], [L, B], [R, B]],
  10: [[L, T], [R, T], [C, 47.3], [L, Q1], [R, Q1], [L, Q3], [R, Q3], [C, 92.7], [L, B], [R, B]],
}

function Pips({ rank, suit }: { rank: NumberRank; suit: Suit }) {
  const value = pipValue(rank)
  if (value === 1) return <SuitGlyph suit={suit} x={W / 2 - 19} y={H / 2 - 19} size={38} />
  const size = 14
  return (
    <>
      {PIPS[value].map(([x, y], i) => (
        <SuitGlyph key={i} suit={suit} x={x - size / 2} y={y - size / 2} size={size} flip={y > 72} />
      ))}
    </>
  )
}

// ---- Face cards and Jokers --------------------------------------------------

/** Each face card shows what it does in Caravan; plain sets show a star instead. */
function FaceEmblem({ card, accent }: { card: Card; accent: string }) {
  const letter = card.rank === 'JK' ? '' : card.rank
  const plain = PLAIN_FACES.has(card.set)
  return (
    <g>
      <rect x="22" y="24" width="56" height="92" rx="3" fill={accent} fillOpacity="0.14" stroke={accent} strokeWidth="1.5" />
      {card.suit && (
        <>
          <SuitGlyph suit={card.suit} x={26} y={28} size={10} />
          <SuitGlyph suit={card.suit} x={64} y={102} size={10} flip />
        </>
      )}
      {card.rank === 'JK' ? (
        <g fill="none" stroke="currentColor" strokeWidth="2.2">
          <ellipse cx="50" cy="62" rx="20" ry="7" />
          <ellipse cx="50" cy="62" rx="20" ry="7" transform="rotate(60 50 62)" />
          <ellipse cx="50" cy="62" rx="20" ry="7" transform="rotate(-60 50 62)" />
          <circle cx="50" cy="62" r="3.5" fill="currentColor" />
        </g>
      ) : (
        <text x="50" y={plain ? 84 : 78} textAnchor="middle" fontFamily="VT323, monospace" fontSize={plain ? 60 : 52} fill="currentColor">
          {letter}
        </text>
      )}
      {plain ? <path d={starburst(50, 40, 7, 2.2, 4)} fill={accent} /> : <EffectGlyph rank={card.rank} />}
    </g>
  )
}

function EffectGlyph({ rank }: { rank: Card['rank'] }) {
  const label: Record<string, string> = { J: 'REMOVE', Q: 'REVERSE', K: 'DOUBLE', JK: 'JOKER' }
  return (
    <text x="50" y="96" textAnchor="middle" fontFamily="'Share Tech Mono', monospace" fontSize="8" letterSpacing="0.8" fill="currentColor">
      {label[rank]}
    </text>
  )
}

/** A star with `points` long rays, as an SVG path. */
function starburst(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const d: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI * i) / points - Math.PI / 2
    d.push(`${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return `${d.join('')}Z`
}

// ---- Backs ------------------------------------------------------------------

function Back({ set, uid }: { set: string; uid: string }) {
  const frame = <rect x="6" y="6" width={W - 12} height={H - 12} rx="5" fill="none" strokeWidth="1.5" />
  switch (set) {
    case 'rust':
      return (
        <>
          <defs>
            <pattern id={`${uid}r`} width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="#7d3f1f" />
              <path d="M0 0H20M0 0V20" stroke="#5a2b14" strokeWidth="2" />
              <circle cx="4" cy="4" r="1.6" fill="#c07a4d" />
            </pattern>
          </defs>
          <rect width={W} height={H} rx="7" fill={`url(#${uid}r)`} />
          <g stroke="#e3b38a">{frame}</g>
          <circle cx="50" cy="70" r="15" fill="#5a2b14" stroke="#e3b38a" strokeWidth="2" />
          <path d="M43 70h14M50 63v14" stroke="#e3b38a" strokeWidth="3" />
        </>
      )
    case 'bloom':
      return (
        <>
          <rect width={W} height={H} rx="7" fill="#6f8360" />
          <g stroke="#efe6c8">{frame}</g>
          <g fill="#efe6c8" stroke="none">
            {Array.from({ length: 8 }, (_, i) => (
              <ellipse key={i} cx="50" cy="56" rx="5" ry="13" transform={`rotate(${i * 45} 50 70)`} />
            ))}
          </g>
          <circle cx="50" cy="70" r="6" fill="#d98a5c" />
          <g fill="#efe6c8">
            {[20, 80].map((x) => [20, 120].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" />))}
          </g>
        </>
      )
    case 'neon':
      return (
        <>
          <rect width={W} height={H} rx="7" fill="#22102c" />
          <rect x="7" y="7" width={W - 14} height={H - 14} rx="5" fill="none" stroke="#ff4fa3" strokeWidth="2" />
          <rect x="12" y="12" width={W - 24} height={H - 24} rx="4" fill="none" stroke="#46e9ff" strokeWidth="1.5" />
          <path
            d="M50 46l6.5 15.5 16.5 1.3-12.6 10.8 3.9 16.2L50 81.2l-14.3 8.6 3.9-16.2L27 62.8l16.5-1.3z"
            fill="none"
            stroke="#ffe066"
            strokeWidth="2"
          />
        </>
      )
    case 'atomic':
      return (
        <>
          <rect width={W} height={H} rx="7" fill="#1d5559" />
          <g stroke="#e9dfc0">{frame}</g>
          <g fill="none" stroke="#e9dfc0" strokeWidth="2">
            <ellipse cx="50" cy="70" rx="28" ry="10" />
            <ellipse cx="50" cy="70" rx="28" ry="10" transform="rotate(60 50 70)" />
            <ellipse cx="50" cy="70" rx="28" ry="10" transform="rotate(-60 50 70)" />
          </g>
          <circle cx="50" cy="70" r="4.5" fill="#f0a64a" />
        </>
      )
    case 'gold':
      return (
        <>
          <defs>
            <pattern id={`${uid}g`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="14" height="14" fill="#3b2a12" />
              <path d="M0 0H14M0 0V14" stroke="#8d6a26" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} rx="7" fill={`url(#${uid}g)`} />
          <g stroke="#d6a93c">{frame}</g>
          <path d="M50 48l16 22-16 22-16-22z" fill="#3b2a12" stroke="#d6a93c" strokeWidth="2.5" />
          <path d="M50 58l8 12-8 12-8-12z" fill="#d6a93c" />
        </>
      )
    case 'vegas':
      // A casino deck: white border, red lattice, a gold starburst in a medallion.
      return (
        <>
          <defs>
            <pattern id={`${uid}v`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="9" height="9" fill="#8c1b24" />
              <path d="M0 0H9M0 0V9" stroke="#b9343d" strokeWidth="1.1" />
            </pattern>
          </defs>
          <rect width={W} height={H} rx="7" fill="#f3ead6" />
          <rect x="6" y="6" width={W - 12} height={H - 12} rx="4" fill={`url(#${uid}v)`} />
          <rect x="10" y="10" width={W - 20} height={H - 20} rx="3" fill="none" stroke="#f3ead6" strokeWidth="1.2" />
          <circle cx="50" cy="70" r="17" fill="#6a1219" stroke="#e3c26a" strokeWidth="1.6" />
          <path d={starburst(50, 70, 13, 4, 8)} fill="#e3c26a" />
          <circle cx="50" cy="70" r="2.6" fill="#6a1219" />
        </>
      )
    default:
      return (
        <>
          <defs>
            <pattern id={`${uid}s`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="12" height="12" fill="#4b5233" />
              <path d="M0 6H12" stroke="#5d6640" strokeWidth="2" />
            </pattern>
          </defs>
          <rect width={W} height={H} rx="7" fill={`url(#${uid}s)`} />
          <g stroke="#d9cfa8">{frame}</g>
          <circle cx="50" cy="70" r="16" fill="#3a3f27" stroke="#d9cfa8" strokeWidth="2" />
          <path d="M50 58l3.5 8.2 8.9.8-6.8 5.8 2.1 8.7-7.7-4.6-7.7 4.6 2.1-8.7-6.8-5.8 8.9-.8z" fill="#d9cfa8" />
        </>
      )
  }
}

// ---- Card -------------------------------------------------------------------

export interface PlayingCardProps {
  card?: Card
  /** Show the back. When `card` is omitted, `set` picks the back. */
  faceDown?: boolean
  set?: string
  className?: string
  title?: string
}

export const PlayingCard = memo(function PlayingCard({ card, faceDown, set, className, title }: PlayingCardProps) {
  const uid = useId().replace(/:/g, '')
  const backSet = card?.set ?? set ?? 'standard'
  const showBack = faceDown || !card
  const label = showBack ? 'Face-down card' : cardName(card)

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={title ?? label}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {showBack ? (
        <>
          <Back set={backSet} uid={uid} />
          <rect width={W} height={H} rx="7" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
        </>
      ) : (
        <Face card={card} />
      )}
    </svg>
  )
})

function CornerIndex({ corner, suit }: { corner: string; suit: Suit | null }) {
  return (
    <>
      <text x="6.5" y="21" fontFamily="VT323, monospace" fontSize={corner.length > 1 ? 19 : 23} letterSpacing="-0.5">
        {corner}
      </text>
      {suit && <SuitGlyph suit={suit} x={7} y={24.5} size={10.5} />}
    </>
  )
}

function Face({ card }: { card: Card }) {
  const accent = accentOf(card.set)
  const ink = isRed(card.suit) ? 'var(--card-red, #a3291f)' : 'var(--card-ink, #1f1b16)'
  const color = card.rank === 'JK' ? (card.id.endsWith('2') ? 'var(--card-red, #a3291f)' : 'var(--card-ink, #1f1b16)') : ink
  const corner = card.rank === 'JK' ? 'JK' : card.rank

  return (
    <g color={color} fill="currentColor">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="7" fill="var(--card-face, #f3e9d2)" stroke="var(--card-edge, #cdbb92)" />
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="5" fill="none" stroke={accent} strokeOpacity="0.55" strokeWidth="1" />
      <CornerIndex corner={corner} suit={card.suit} />
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <CornerIndex corner={corner} suit={card.suit} />
      </g>
      {isNumberRank(card.rank) && card.suit ? <Pips rank={card.rank} suit={card.suit} /> : <FaceEmblem card={card} accent={accent} />}
      {/* Set marker, so mixed-set decks are easy to tell apart. */}
      <path d={`M50 ${H - 12}l4 4-4 4-4-4z`} fill={accent} />
    </g>
  )
}

/** A suit symbol sized to the surrounding text. */
export function SuitIcon({ suit, label }: { suit: Suit; label?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="currentColor"
      style={{ verticalAlign: '-0.12em' }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {SUIT_PATH[suit]}
    </svg>
  )
}

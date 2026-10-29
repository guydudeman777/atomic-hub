/**
 * The symbols on the reels, drawn once each in SVG and shared through a
 * sprite: the reels, the pay glass, the paytables and the lobby all point
 * at these with <use>. Each is drawn in a 100 by 100 box, with a dark
 * outline so it reads small and on any reel paper.
 */

import { memo } from 'react'
import type { SymbolId } from '../engine'

const INK = '#1d1915'

/** A crimped edge: points round a circle, in and out. */
function crimp(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const points: string[] = []
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (i * Math.PI) / teeth
    points.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return points.join(' ')
}

/** A five-pointed star. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    points.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return points.join(' ')
}

const ART: Record<Exclude<SymbolId, 'blank'>, () => React.ReactElement> = {
  cap: () => (
    <>
      <polygon points={crimp(50, 50, 45, 40, 21)} fill="#c9ccd1" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="35" fill="#c3202d" stroke={INK} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="28" fill="none" stroke="#f3e7cf" strokeWidth="3" />
      <polygon points={star(50, 51, 19, 8)} fill="#f6efe0" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M27 33a30 30 0 0 1 22-12" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  bell: () => (
    <>
      <path d="M50 12c-4 0-6 3-6 6v2c-14 4-22 16-22 32v14l-8 10h72l-8-10V52c0-16-8-28-22-32v-2c0-3-2-6-6-6z" fill="#f2c03c" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M31 50c0-12 6-21 15-24" fill="none" stroke="#fff4c8" strokeWidth="4" strokeLinecap="round" />
      <path d="M14 76h72" stroke={INK} strokeWidth="2.6" />
      <path d="M22 70h56" stroke="#b9851c" strokeWidth="3" />
      <circle cx="50" cy="84" r="7" fill="#b9851c" stroke={INK} strokeWidth="2.4" />
    </>
  ),
  shoe: () => (
    <>
      <path
        d="M20 16h18v38c0 9 5 16 12 16s12-7 12-16V16h18v38c0 20-13 34-30 34S20 74 20 54z"
        fill="#9aa3ad"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M26 20v34c0 15 10 27 24 27" fill="none" stroke="#e3e8ed" strokeWidth="3.5" strokeLinecap="round" />
      {[
        [29, 26],
        [29, 42],
        [33, 60],
        [71, 26],
        [71, 42],
        [67, 60],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 2.5} y={y - 3.5} width="5" height="7" rx="1" fill={INK} />
      ))}
      <path d="M20 16h18M62 16h18" stroke="#6f7781" strokeWidth="4" />
    </>
  ),
  can: () => (
    <>
      <path d="M24 22v56c0 6 12 10 26 10s26-4 26-10V22" fill="#b8bec5" stroke={INK} strokeWidth="2.6" />
      <path d="M24 34h52v36H24z" fill="#2f6fb5" />
      <path d="M24 42h52M24 62h52" stroke="#f3e7cf" strokeWidth="3" />
      <ellipse cx="50" cy="52" rx="13" ry="7" fill="#e3b23c" stroke={INK} strokeWidth="1.8" />
      <path d="M24 22v56c0 6 12 10 26 10s26-4 26-10V22" fill="none" stroke={INK} strokeWidth="2.6" />
      <ellipse cx="50" cy="22" rx="26" ry="9" fill="#d9dde1" stroke={INK} strokeWidth="2.6" />
      <ellipse cx="50" cy="22" rx="20" ry="6" fill="none" stroke="#8d949b" strokeWidth="1.6" />
      {/* Rust, and a dent. */}
      <path d="M62 76c4 1 8-1 10-4l1 5c-3 3-7 4-11 3z" fill="#9a5426" opacity=".85" />
      <path d="M30 70c3-3 7-3 9 0" fill="none" stroke="#7d8790" strokeWidth="2" />
      <path d="M29 30v42" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  cherry: () => (
    <>
      <path d="M33 62C38 42 46 26 60 14M67 66c-2-18-4-34-7-52" fill="none" stroke="#3f7a2b" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 14c8-6 20-6 26 2-8 6-18 6-26-2z" fill="#58a83a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="70" r="17" fill="#c41f2e" stroke={INK} strokeWidth="2.6" />
      <circle cx="68" cy="72" r="17" fill="#d92a38" stroke={INK} strokeWidth="2.6" />
      <circle cx="26" cy="64" r="4.5" fill="#fff" fillOpacity=".7" />
      <circle cx="62" cy="66" r="4.5" fill="#fff" fillOpacity=".7" />
    </>
  ),
  atom: () => (
    <>
      <circle cx="50" cy="50" r="44" fill="#173a4a" stroke={INK} strokeWidth="2.5" />
      <g fill="none" stroke="#5ff0e0" strokeWidth="3.4">
        <ellipse cx="50" cy="50" rx="36" ry="13" />
        <ellipse cx="50" cy="50" rx="36" ry="13" transform="rotate(60 50 50)" />
        <ellipse cx="50" cy="50" rx="36" ry="13" transform="rotate(-60 50 50)" />
      </g>
      <circle cx="50" cy="50" r="10" fill="#ff6a3d" stroke={INK} strokeWidth="2" />
      <circle cx="47" cy="47" r="3" fill="#ffd2b8" />
      {[
        [86, 50],
        [32, 19],
        [32, 81],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill="#fff6b0" stroke={INK} strokeWidth="1.5" />
      ))}
    </>
  ),
  seven: () => (
    <>
      <path d="M24 18h56v13L52 88H33l27-54H24z" fill="#1d4f9c" transform="translate(4 4)" />
      <path d="M22 16h56v13L50 86H31l27-54H22z" fill="#e0262f" stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M27 21h46" stroke="#ff9c9f" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  bar1: () => <Bars count={1} />,
  bar2: () => <Bars count={2} />,
  bar3: () => <Bars count={3} />,
  rocket: () => (
    <>
      <path d="M50 70c-6 8-8 16-6 24 3-4 4-6 6-6s3 2 6 6c2-8 0-16-6-24z" fill="#ffb02e" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 76c-2 4-3 8-2 12l2-2 2 2c1-4 0-8-2-12z" fill="#fff1a8" />
      <path d="M36 54L20 72l2 6 18-8zM64 54l16 18-2 6-18-8z" fill="#d6262f" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M50 6C36 20 34 44 38 72h24c4-28 2-52-12-66z" fill="#dfe4e9" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M50 6c-5 5-8 10-10 16h20c-2-6-5-11-10-16z" fill="#d6262f" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="50" cy="40" r="8" fill="#5bc7e8" stroke={INK} strokeWidth="2.6" />
      <circle cx="48" cy="38" r="2.5" fill="#fff" />
      <path d="M50 64v12" stroke={INK} strokeWidth="2.4" />
      <path d="M43 24c-3 12-3 28-1 44" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  saucer: () => (
    <>
      <path d="M30 44c0-14 9-22 20-22s20 8 20 22z" fill="#9fe7f0" fillOpacity=".9" stroke={INK} strokeWidth="2.6" />
      <path d="M38 38c1-6 5-10 10-11" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="50" cy="54" rx="44" ry="14" fill="#c7ced6" stroke={INK} strokeWidth="2.6" />
      <ellipse cx="50" cy="50" rx="30" ry="6" fill="#e9edf1" />
      {[18, 34, 50, 66, 82].map((x, i) => (
        <circle key={x} cx={x} cy={i === 0 || i === 4 ? 55 : 57} r="3.6" fill={i % 2 === 0 ? '#ffd23f' : '#ff5d73'} stroke={INK} strokeWidth="1.4" />
      ))}
      <path d="M36 70l-6 14M64 70l6 14M50 70v16" stroke="#7ee8b0" strokeWidth="2.4" strokeLinecap="round" strokeOpacity=".8" />
    </>
  ),
  robot: () => (
    <>
      <path d="M50 8v12" stroke={INK} strokeWidth="2.6" />
      <circle cx="50" cy="8" r="5" fill="#ff5d73" stroke={INK} strokeWidth="2" />
      <rect x="26" y="20" width="48" height="36" rx="5" fill="#b8c3cc" stroke={INK} strokeWidth="2.6" />
      <rect x="18" y="30" width="8" height="14" rx="2" fill="#8d99a3" stroke={INK} strokeWidth="2" />
      <rect x="74" y="30" width="8" height="14" rx="2" fill="#8d99a3" stroke={INK} strokeWidth="2" />
      <circle cx="40" cy="35" r="7" fill="#ffe36b" stroke={INK} strokeWidth="2.2" />
      <circle cx="60" cy="35" r="7" fill="#ffe36b" stroke={INK} strokeWidth="2.2" />
      <circle cx="40" cy="35" r="2.5" fill={INK} />
      <circle cx="60" cy="35" r="2.5" fill={INK} />
      <path d="M38 48h24" stroke={INK} strokeWidth="2.4" />
      <path d="M42 46v4M47 46v4M52 46v4M57 46v4" stroke={INK} strokeWidth="1.6" />
      <rect x="30" y="58" width="40" height="30" rx="4" fill="#9eaab4" stroke={INK} strokeWidth="2.6" />
      <circle cx="42" cy="70" r="5" fill="#5bc7e8" stroke={INK} strokeWidth="1.8" />
      <rect x="52" y="65" width="12" height="4" rx="1" fill="#ff5d73" stroke={INK} strokeWidth="1.2" />
      <rect x="52" y="73" width="12" height="4" rx="1" fill="#7ee8b0" stroke={INK} strokeWidth="1.2" />
      <path d="M31 24v28" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  raygun: () => (
    <>
      <path d="M30 56l-8 28h14l8-26z" fill="#c03a2b" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M14 40c0-10 8-16 18-16h30l12 8v18l-12 8H32c-10 0-18-8-18-18z" fill="#dfe4e9" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M74 34h10v14H74z" fill="#9aa3ad" stroke={INK} strokeWidth="2.2" />
      <path d="M84 30l6 11-6 11" fill="#5ff0e0" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      {[40, 50, 60].map((x) => (
        <path key={x} d={`M${x} 22v40`} stroke="#d6262f" strokeWidth="4.5" />
      ))}
      {[40, 50, 60].map((x) => (
        <path key={x} d={`M${x} 22v40`} fill="none" stroke={INK} strokeWidth="1" strokeOpacity=".5" />
      ))}
      <path d="M18 34c2-4 6-6 12-6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 46c-4 8-10 12-12 12M16 40c-6 0-10-2-12-6" stroke="#ffb02e" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  planet: () => (
    <>
      <path d="M8 62c10 8 38 2 62-12s34-28 22-34" fill="none" stroke="#f0b04a" strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="50" r="27" fill="#8b5ec9" stroke={INK} strokeWidth="2.6" />
      <path d="M26 42c14 4 30 2 46-6M25 54c16 4 34 0 50-8" fill="none" stroke="#b28ae6" strokeWidth="4" strokeLinecap="round" />
      <path d="M36 32c4-4 10-6 15-6" fill="none" stroke="#e4d4ff" strokeWidth="3" strokeLinecap="round" />
      {/* The front of the ring, over the planet. */}
      <path d="M22 66c14 2 34-4 52-16" fill="none" stroke="#f0b04a" strokeWidth="7" strokeLinecap="round" />
      <path d="M22 66c14 2 34-4 52-16" fill="none" stroke="#ffe2a0" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
}

/** Black bars with BAR on them: one, two or three stacked. */
function Bars({ count }: { count: number }) {
  const h = 20
  const gap = 5
  const top = 50 - (count * h + (count - 1) * gap) / 2
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const y = top + i * (h + gap)
        return (
          <g key={i}>
            <rect x="12" y={y} width="76" height={h} rx="3" fill="#1b1918" stroke="#e8e2d0" strokeWidth="2" />
            <text x="50" y={y + h / 2 + 6.2} textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontWeight="900" fontSize="17" letterSpacing="3" fill="#f6efe0">
              BAR
            </text>
          </g>
        )
      })}
    </>
  )
}

const DRAWN = Object.keys(ART) as Exclude<SymbolId, 'blank'>[]

/** Every symbol, once, for the rest of the page to <use>. */
export const SymbolSprite = memo(function SymbolSprite() {
  return (
    <svg className="sl-sprite" aria-hidden="true" focusable="false">
      <defs>
        {DRAWN.map((id) => {
          const Art = ART[id]
          return (
            <symbol key={id} id={`sl-sym-${id}`} viewBox="0 0 100 100">
              <Art />
            </symbol>
          )
        })}
      </defs>
    </svg>
  )
})

/** One symbol, drawn from the sprite. A blank is nothing at all. */
export function SymbolArt({ symbol, className }: { symbol: SymbolId | 'any'; className?: string }) {
  if (symbol === 'blank') return null
  if (symbol === 'any') {
    return (
      <svg className={`sl-symbol sl-symbol--any${className ? ` ${className}` : ''}`} viewBox="0 0 100 100" aria-hidden="true">
        <text x="50" y="62" textAnchor="middle" fontSize="34" fill="currentColor">
          any
        </text>
      </svg>
    )
  }
  return (
    <svg className={`sl-symbol${className ? ` ${className}` : ''}`} viewBox="0 0 100 100" aria-hidden="true">
      <use href={`#sl-sym-${symbol}`} />
    </svg>
  )
}

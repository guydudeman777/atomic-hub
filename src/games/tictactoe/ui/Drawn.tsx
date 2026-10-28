/**
 * Everything drawn in grease pencil on the placemat, and the things on the
 * table around it. Marks and lines wobble a little, the way a hand draws
 * them: each one takes its shape from a seed, so it stays the same shape
 * for the rest of the game. Strokes that are being drawn trace themselves
 * in (stroke-dashoffset over pathLength 1, in tictactoe.css).
 */

import type { CSSProperties } from 'react'
import { createRng } from '../../../core/rng'
import type { Player } from '../engine'

type Pt = readonly [number, number]

/** A smooth path through points (Catmull-Rom, as cubic Béziers). */
function smooth(points: readonly Pt[]): string {
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

/** A slightly bowed stroke from one point to another, as a hand draws a straight line. */
function bowed(from: Pt, to: Pt, bow: number, r: () => number): string {
  const [x1, y1] = from
  const [x2, y2] = to
  const len = Math.hypot(x2 - x1, y2 - y1)
  const nx = -(y2 - y1) / len
  const ny = (x2 - x1) / len
  const points: Pt[] = [0, 0.33, 0.66, 1].map((t, i) => {
    const sway = Math.sin(t * Math.PI) * bow + (i > 0 && i < 3 ? (r() - 0.5) * bow * 0.6 : 0)
    return [x1 + (x2 - x1) * t + nx * sway, y1 + (y2 - y1) * t + ny * sway]
  })
  return smooth(points)
}

const seeded = (seed: number) => createRng(Math.imul(seed + 1, 2654435761))

/** The paths of a mark in a 100×100 box: an X's two strokes, or an O's one loop. */
function markPaths(player: Player, seed: number): string[] {
  const r = seeded(seed)
  const j = (n: number) => (r() - 0.5) * n
  if (player === 0) {
    return [
      bowed([22 + j(8), 21 + j(8)], [79 + j(8), 80 + j(8)], j(10), r),
      bowed([79 + j(8), 22 + j(8)], [22 + j(8), 79 + j(8)], j(10), r),
    ]
  }
  // Started near the top and drawn round anticlockwise, overlapping a little where it closes.
  const cx = 50 + j(4)
  const cy = 51 + j(4)
  const rx = 28 + j(5)
  const ry = 30 + j(5)
  const start = -Math.PI / 2 - 0.35 + j(0.5)
  const sweep = Math.PI * 2 + 0.5 + j(0.3)
  const phase = r() * Math.PI * 2
  const steps = 18
  const points: Pt[] = Array.from({ length: steps + 1 }, (_, k) => {
    const t = k / steps
    const a = start - sweep * t
    const s = 1 + 0.045 * Math.sin(3 * a + phase) + t * 0.07
    return [cx + Math.cos(a) * rx * s, cy + Math.sin(a) * ry * s]
  })
  return [smooth(points)]
}

interface MarkProps {
  player: Player
  seed: number
  /** Trace it in, starting this many ms from now. */
  draw?: number | null
  className?: string
}

/** A mark in grease pencil. Being drawn, an X's second stroke follows its first. */
export function Mark({ player, seed, draw = null, className = '' }: MarkProps) {
  const paths = markPaths(player, seed)
  return (
    <svg className={`tt-mark ${className}`} data-c={player} data-draw={draw === null ? undefined : ''} viewBox="0 0 100 100" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} pathLength={1} style={draw === null ? undefined : ({ '--at': `${draw + (player === 0 ? i * 190 : 0)}ms`, '--len': player === 0 ? '150ms' : '340ms' } as CSSProperties)} />
      ))}
    </svg>
  )
}

/** A small, steady mark for labels and scores. */
export function MarkIcon({ player }: { player: Player }) {
  return (
    <svg className="tt-mark-icon" data-c={player} viewBox="0 0 100 100" aria-hidden="true">
      {player === 0 ? <path d="M24 24 L76 76 M76 24 L24 76" /> : <ellipse cx="50" cy="50" rx="28" ry="30" />}
    </svg>
  )
}

/** The four lines of a 3×3, drawn freehand across a 300×300 box: two down, then two across. */
function gridPaths(seed: number, inset = 8): string[] {
  const r = seeded(seed)
  const j = (n: number) => (r() - 0.5) * n
  const near = inset + j(6)
  const far = 300 - inset + j(6)
  return [
    bowed([100 + j(6), near], [100 + j(6), far], j(8), r),
    bowed([200 + j(6), near], [200 + j(6), far], j(8), r),
    bowed([near, 100 + j(6)], [far, 100 + j(6)], j(8), r),
    bowed([near, 200 + j(6)], [far, 200 + j(6)], j(8), r),
  ]
}

/** When each of a grid's four lines starts, as the game sets up. In step with the two pencil-x sounds that play under them. */
const GRID_LINE_AT = [0, 190, 380, 570]

export function GridLines({ seed, className, draw }: { seed: number; className: string; draw: boolean }) {
  return (
    <svg className={className} viewBox="0 0 300 300" preserveAspectRatio="none" data-draw={draw ? '' : undefined} aria-hidden="true">
      {gridPaths(seed).map((d, i) => (
        <path key={i} d={d} pathLength={1} style={draw ? ({ '--at': `${GRID_LINE_AT[i]}ms`, '--len': '150ms' } as CSSProperties) : undefined} />
      ))}
    </svg>
  )
}

/** The stroke through a winning three: from the first square (or grid) to the last, run on past both. */
export function Strike({ line, player, seed, at }: { line: readonly number[]; player: Player; seed: number; at: number }) {
  const r = seeded(seed)
  const center = (i: number): Pt => [(i % 3) * 100 + 50, Math.floor(i / 3) * 100 + 50]
  const a = center(line[0])
  const b = center(line[2])
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  const over = 38 / len
  const from: Pt = [a[0] - dx * over + (r() - 0.5) * 8, a[1] - dy * over + (r() - 0.5) * 8]
  const to: Pt = [b[0] + dx * over + (r() - 0.5) * 8, b[1] + dy * over + (r() - 0.5) * 8]
  return (
    <svg className="tt-strike" data-c={player} viewBox="0 0 300 300" aria-hidden="true">
      <path d={bowed(from, to, (r() - 0.5) * 12, r)} pathLength={1} style={{ '--at': `${at}ms`, '--len': '480ms' } as CSSProperties} />
    </svg>
  )
}

/** The grease pencil's waxy edge, shared by every stroke on the placemat. */
export function WaxFilter() {
  return (
    <svg className="tt-defs" width="0" height="0" aria-hidden="true">
      <filter id="tt-wax" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feComponentTransfer in="grain" result="speckle">
          <feFuncA type="discrete" tableValues="1 1 1 0.55 1 1 0.7 1" />
        </feComponentTransfer>
        <feComposite in="rough" in2="speckle" operator="in" />
      </filter>
    </svg>
  )
}

// ---- On the table ----------------------------------------------------------------------

/** A cup of diner coffee on its saucer, seen from above, with a spoon. */
export function CoffeeCup({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="tt-coffee" cx="45%" cy="42%" r="60%">
          <stop offset="0" stopColor="#6b3d1f" />
          <stop offset="0.7" stopColor="#3d200d" />
          <stop offset="1" stopColor="#25130a" />
        </radialGradient>
        <radialGradient id="tt-china" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9d3c4" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="108" rx="92" ry="90" fill="rgba(0,0,0,0.25)" />
      <circle cx="100" cy="100" r="90" fill="url(#tt-china)" stroke="#bdb6a6" strokeWidth="2" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="#c62f3a" strokeWidth="3" opacity="0.7" />
      <path d="M150 140 L186 182" stroke="#9aa0a6" strokeWidth="9" strokeLinecap="round" />
      <path d="M150 140 L186 182" stroke="#e4e8ec" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="146" cy="134" rx="11" ry="8" fill="#c3c8cd" transform="rotate(48 146 134)" />
      <rect x="30" y="88" width="30" height="20" rx="10" fill="url(#tt-china)" stroke="#bdb6a6" strokeWidth="2" />
      <circle cx="100" cy="98" r="56" fill="url(#tt-china)" stroke="#bdb6a6" strokeWidth="2" />
      <circle cx="100" cy="98" r="46" fill="url(#tt-coffee)" />
      <ellipse cx="86" cy="84" rx="14" ry="6" fill="rgba(255,240,220,0.22)" transform="rotate(-30 86 84)" />
      <g className="tt-steam" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="4" strokeLinecap="round">
        <path d="M88 86 q-8 -14 0 -26 t0 -26" />
        <path d="M110 90 q8 -14 0 -26 t0 -26" />
      </g>
    </svg>
  )
}

/** A slice of cherry pie on a plate, with a fork. */
export function PieSlice({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 220 220" aria-hidden="true">
      <defs>
        <radialGradient id="tt-plate" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d6cfbf" />
        </radialGradient>
        <linearGradient id="tt-crust" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2c47a" />
          <stop offset="1" stopColor="#c98a3c" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="118" rx="104" ry="102" fill="rgba(0,0,0,0.25)" />
      <circle cx="110" cy="110" r="102" fill="url(#tt-plate)" stroke="#bdb6a6" strokeWidth="2" />
      <circle cx="110" cy="110" r="80" fill="none" stroke="#5aa69a" strokeWidth="3" opacity="0.6" />
      {/* The slice: a wedge with a crimped crust along its back and cherries showing through the lattice. */}
      <path d="M58 150 L160 60 Q176 96 162 132 Q150 160 120 170 Z" fill="#a3172a" />
      <g stroke="url(#tt-crust)" strokeWidth="9" strokeLinecap="round">
        <path d="M84 128 L148 92" />
        <path d="M100 146 L156 116" />
        <path d="M96 108 L134 152" />
        <path d="M118 92 L152 140" />
      </g>
      <path d="M160 60 Q176 96 162 132 Q150 160 120 170" fill="none" stroke="url(#tt-crust)" strokeWidth="16" strokeLinecap="round" />
      <path d="M58 150 L160 60" fill="none" stroke="#e0a95a" strokeWidth="5" strokeLinecap="round" />
      <circle cx="112" cy="124" r="6" fill="#d3263c" />
      <circle cx="132" cy="108" r="5" fill="#d3263c" />
      <g stroke="#9aa0a6" strokeWidth="6" strokeLinecap="round">
        <path d="M40 80 L92 40" />
      </g>
      <g stroke="#c3c8cd" strokeWidth="2.4" strokeLinecap="round">
        <path d="M92 40 L108 26 M95 44 L111 30 M89 36 L105 22" />
      </g>
    </svg>
  )
}

/**
 * The Starlite Diner's neon: the name in pink script, a star, and "open
 * all night" in blue. It hums, and now and then a tube catches.
 */
export function NeonSign({ className }: { className?: string }) {
  return (
    <div className={`tt-neon ${className ?? ''}`} aria-hidden="true">
      <svg className="tt-neon__star" viewBox="-12 -12 24 24">
        <path d="M0-11L2.6-3.6 10.5-3.4 4.2 1.4 6.5 9 0 4.5-6.5 9-4.2 1.4-10.5-3.4-2.6-3.6Z" />
      </svg>
      <span className="tt-neon__name">Starlite</span>
      <span className="tt-neon__open">Open all night</span>
    </div>
  )
}

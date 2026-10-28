/**
 * The table itself, as one SVG under everything else: blue felt with the
 * house rules printed in gold, a wooden racetrack, the oxblood leather rail,
 * the dealer's chip tray, and a betting circle at every spot.
 */

import { memo } from 'react'
import { FELT_H, FELT_W, RADIUS, SPOT_INDEXES, TRAY, circleOf } from './layout'

const CX = FELT_W / 2

/** A circular arc around the dealer, left to right along the bottom, for text to follow. */
function arc(r: number, halfAngle: number): string {
  const a = (halfAngle * Math.PI) / 180
  const x1 = CX - r * Math.sin(a)
  const x2 = CX + r * Math.sin(a)
  const y = r * Math.cos(a)
  return `M${x1.toFixed(1)} ${y.toFixed(1)} A${r} ${r} 0 0 0 ${x2.toFixed(1)} ${y.toFixed(1)}`
}

/** The half circle out to radius `r`, closed along the dealer's edge. */
const half = (r: number) => `M${CX - r} 0 A${r} ${r} 0 0 0 ${CX + r} 0 Z`

/** The dealer's chip tray: columns of chips lying on their sides, seen from above. */
const TRAY_COLUMNS = ['#e0a52a', '#5a2a86', '#202027', '#202027', '#1d7444', '#1d7444', '#b3262c', '#b3262c', '#ebe4d2']

export const Felt = memo(function Felt({ seats }: { seats: readonly boolean[] }) {
  const trayW = 250
  const colW = trayW / TRAY_COLUMNS.length
  return (
    <svg className="bj-felt__art" viewBox={`0 0 ${FELT_W} ${FELT_H}`} aria-hidden="true">
      <defs>
        <radialGradient id="bj-felt-light" cx="50%" cy="34%" r="70%">
          <stop offset="0" stopColor="#2d68bf" />
          <stop offset="0.55" stopColor="#1f54a3" />
          <stop offset="1" stopColor="#123a7a" />
        </radialGradient>
        <linearGradient id="bj-leather" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a1a1d" />
          <stop offset="1" stopColor="#2c0a0d" />
        </linearGradient>
        <filter id="bj-nap" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0.05  0 0 0 0 0.15  0 0 0 0.35 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="bj-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#000" floodOpacity="0.6" />
        </filter>
        <path id="bj-arc-pays" d={arc(196, 70)} />
        <path id="bj-arc-dealer" d={arc(232, 60)} />
        <path id="bj-arc-insurance" d={arc(282, 52)} />
      </defs>

      {/* Leather rail with its stitching, a wooden racetrack, then the felt. */}
      <path d={half(500)} fill="url(#bj-leather)" filter="url(#bj-shadow)" />
      <path d={half(492)} fill="none" stroke="#e8d3b0" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="5 5" />
      <path d={half(470)} fill="#6b3f1f" />
      <path d={half(466)} fill="none" stroke="#9b6534" strokeWidth="2" />
      <path d={half(RADIUS.felt)} fill="url(#bj-felt-light)" />
      <path d={half(RADIUS.felt)} fill="#fff" filter="url(#bj-nap)" />
      <path d={half(RADIUS.felt)} fill="none" stroke="#0c2a5c" strokeWidth="3" />

      {/* The dealer's edge, with the chip tray let into it. */}
      <rect x="0" y="0" width={FELT_W} height="8" fill="#2c0a0d" />
      <g transform={`translate(${TRAY.x - trayW / 2} ${TRAY.y - 18})`}>
        <rect x="-6" y="-4" width={trayW + 12} height="44" rx="5" fill="#1a1416" stroke="#b28a3e" strokeWidth="1.5" />
        {TRAY_COLUMNS.map((color, i) => (
          <g key={i} transform={`translate(${i * colW} 0)`}>
            <rect x="2" y="0" width={colW - 4} height="36" rx="3" fill={color} />
            {Array.from({ length: 9 }, (_, k) => (
              <rect key={k} x="2" y={k * 4} width={colW - 4} height="1.2" fill="#000" opacity="0.28" />
            ))}
            <rect x="2" y="0" width={(colW - 4) * 0.35} height="36" rx="2" fill="#fff" opacity="0.12" />
          </g>
        ))}
      </g>

      {/* The printing. */}
      <g fill="#e3c26a" fontFamily="Limelight, serif" textAnchor="middle">
        <text fontSize="31" letterSpacing="3">
          <textPath href="#bj-arc-pays" startOffset="50%">
            BLACKJACK PAYS 3 TO 2
          </textPath>
        </text>
        <text fontSize="15" letterSpacing="1.5" opacity="0.92">
          <textPath href="#bj-arc-dealer" startOffset="50%">
            Dealer must stand on all 17s
          </textPath>
        </text>
        <path d={arc(262, 54)} fill="none" stroke="#e3c26a" strokeWidth="1.5" opacity="0.8" />
        <path d={arc(296, 50)} fill="none" stroke="#e3c26a" strokeWidth="1.5" opacity="0.8" />
        <text fontSize="16" letterSpacing="4" opacity="0.9">
          <textPath href="#bj-arc-insurance" startOffset="50%">
            INSURANCE PAYS 2 TO 1
          </textPath>
        </text>
      </g>

      {/* A betting circle at every spot; empty seats are fainter. */}
      {SPOT_INDEXES.map((spot) => {
        const c = circleOf(spot)
        return (
          <g key={spot} opacity={seats[spot] ? 1 : 0.45}>
            <circle cx={c.x} cy={c.y} r="34" fill="none" stroke="#f3ead6" strokeOpacity="0.75" strokeWidth="2.2" />
            <circle cx={c.x} cy={c.y} r="28" fill="none" stroke="#e3c26a" strokeOpacity="0.55" strokeWidth="1" />
          </g>
        )
      })}
    </svg>
  )
})

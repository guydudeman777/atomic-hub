/**
 * The table itself, as one SVG under everything else: a padded leather
 * rail with its stitching, a polished wooden edge, and green baize lit by
 * the lamp overhead, with the betting line and the house's name printed in
 * gold. It draws whichever shape the layout has: the wide oval or the tall
 * one.
 */

import { memo } from 'react'
import { type Axes, FELT_W, type Shape } from './layout'

const CX = FELT_W / 2

/** An ellipse round the middle of the table. */
const oval = (shape: Shape, { rx, ry }: Axes) => ({ cx: CX, cy: shape.h / 2, rx, ry })

/** The top or bottom half of an ellipse round the pot, left to right, for text to follow. */
function arc(shape: Shape, { rx, ry }: Axes, top: boolean): string {
  const y = shape.pot.y
  return top ? `M${CX - rx} ${y} A${rx} ${ry} 0 0 1 ${CX + rx} ${y}` : `M${CX - rx} ${y} A${rx} ${ry} 0 0 0 ${CX + rx} ${y}`
}

export const Felt = memo(function Felt({ shape }: { shape: Shape }) {
  const line = { rx: shape.bets.rx + 70 * (shape.cardW / 54), ry: shape.bets.ry + 62 * (shape.cardW / 54) }
  const tall = shape.name === 'tall'
  return (
    <svg className="dw-felt__art" viewBox={`0 0 ${FELT_W} ${shape.h}`} aria-hidden="true">
      <defs>
        <radialGradient id="dw-baize" cx="50%" cy="42%" r="62%">
          <stop offset="0" stopColor="#3f8a4c" />
          <stop offset="0.5" stopColor="#2c6b38" />
          <stop offset="1" stopColor="#173f22" />
        </radialGradient>
        <linearGradient id="dw-leather" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a2c1a" />
          <stop offset="0.5" stopColor="#2e1a0f" />
          <stop offset="1" stopColor="#1a0e07" />
        </linearGradient>
        <linearGradient id="dw-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a5428" />
          <stop offset="0.5" stopColor="#6b3d1b" />
          <stop offset="1" stopColor="#4e2b12" />
        </linearGradient>
        <filter id="dw-nap" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9" result="noise" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0.06  0 0 0 0 0  0 0 0 0.32 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="dw-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="16" stdDeviation="16" floodColor="#000" floodOpacity="0.65" />
        </filter>
        <path id="dw-arc-name" d={arc(shape, shape.print, true)} />
        <path id="dw-arc-game" d={arc(shape, { rx: shape.print.rx + 6, ry: shape.print.ry + 8 }, false)} />
      </defs>

      {/* The padded rail, tufted with buttons and stitched; the wooden edge; the baize. */}
      <ellipse {...oval(shape, shape.rail)} fill="url(#dw-leather)" filter="url(#dw-shadow)" />
      <ellipse {...oval(shape, { rx: shape.rail.rx - 4, ry: shape.rail.ry - 4 })} fill="none" stroke="#6b4429" strokeOpacity="0.5" strokeWidth="2" />
      <ellipse {...oval(shape, shape.stitch)} fill="none" stroke="#d9c39a" strokeOpacity="0.32" strokeWidth="1.3" strokeDasharray="5 5" />
      <ellipse {...oval(shape, shape.wood)} fill="url(#dw-wood)" />
      <ellipse {...oval(shape, { rx: shape.wood.rx - 5, ry: shape.wood.ry - 5 })} fill="none" stroke="#b07a45" strokeOpacity="0.6" strokeWidth="2" />
      <ellipse {...oval(shape, shape.felt)} fill="url(#dw-baize)" />
      <ellipse {...oval(shape, shape.felt)} fill="#fff" filter="url(#dw-nap)" />
      <ellipse {...oval(shape, shape.felt)} fill="none" stroke="#0f2c17" strokeWidth="3" />

      {/* The betting line: bets go down inside it. */}
      <ellipse {...oval(shape, line)} cy={shape.h / 2 + (tall ? 0 : 10)} fill="none" stroke="#d9b45e" strokeOpacity="0.45" strokeWidth="1.6" strokeDasharray="10 7" />

      {/* The house's name over the pot, the game under it. */}
      <g fill="#d9b45e" fontFamily="Rye, Georgia, serif" textAnchor="middle" opacity="0.5">
        <text fontSize={tall ? 40 : 30} letterSpacing="3">
          <textPath href="#dw-arc-name" startOffset="50%">
            THE GOLDEN SPUR
          </textPath>
        </text>
        <text fontSize={tall ? 22 : 15} letterSpacing="2" opacity="0.85">
          <textPath href="#dw-arc-game" startOffset="50%">
            Five-card draw · Ante · Fixed limit
          </textPath>
        </text>
      </g>
    </svg>
  )
})

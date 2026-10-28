/**
 * The layout itself, as one SVG under everything else: green felt printed
 * in white, gold and red, the mahogany rail, and the rubber pyramids along
 * the far wall that every throw has to hit. It draws whichever shape the
 * layout has: the wide one-end layout or the tall column.
 */

import { memo } from 'react'
import { HARD_NUMBERS, POINTS, type PointNumber } from '../engine'
import { FELT_W, type Rect, type Shape } from './layout'

const INK = '#f4efe2'
const GOLD = '#f2cd5c'
const RED = '#e2383f'
const DECO = 'Limelight, serif'

const LABEL: Record<PointNumber, string> = { 4: '4', 5: '5', 6: 'SIX', 8: '8', 9: 'NINE', 10: '10' }

/** A die face, `size` across, its top-left corner at (x, y). */
export function DieFace({ x, y, size, value, fill = INK, pip = '#123d22' }: { x: number; y: number; size: number; value: number; fill?: string; pip?: string }) {
  const r = size * 0.1
  const at = (p: number) => size * (0.25 + 0.25 * p)
  const spots: [number, number][] = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  }[value] as [number, number][]
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={size} height={size} rx={size * 0.18} fill={fill} />
      {spots.map(([px, py], i) => (
        <circle key={i} cx={at(px)} cy={at(py)} r={r} fill={pip} />
      ))}
    </g>
  )
}

/** Two dice side by side, centred on (cx, cy). */
function Pair({ cx, cy, size, a, b, fill, pip }: { cx: number; cy: number; size: number; a: number; b: number; fill?: string; pip?: string }) {
  const gap = size * 0.2
  return (
    <>
      <DieFace x={cx - size - gap / 2} y={cy - size / 2} size={size} value={a} fill={fill} pip={pip} />
      <DieFace x={cx + gap / 2} y={cy - size / 2} size={size} value={b} fill={fill} pip={pip} />
    </>
  )
}

const box = (r: Rect, stroke = INK, width = 2.4) => (
  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(8, r.h * 0.12)} fill="none" stroke={stroke} strokeWidth={width} />
)

/** Text that fits its width: `size` unless that's too wide for `maxW` at about 0.62 em a letter. */
function fit(text: string, size: number, maxW: number, spacing = 0): number {
  const per = 0.62 + spacing / size
  return Math.min(size, maxW / Math.max(1, text.length * per))
}

export const Felt = memo(function Felt({ shape }: { shape: Shape }) {
  const tall = shape.name === 'tall'
  const { felt, wall } = shape
  return (
    <svg className="cr-felt__art" viewBox={`0 0 ${FELT_W} ${shape.h}`} aria-hidden="true">
      <defs>
        <radialGradient id="cr-felt-light" cx="45%" cy="40%" r="75%">
          <stop offset="0" stopColor="#1c8a4a" />
          <stop offset="0.55" stopColor="#13703a" />
          <stop offset="1" stopColor="#0b4f28" />
        </radialGradient>
        <linearGradient id="cr-mahogany" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6e2a17" />
          <stop offset="0.5" stopColor="#4a170b" />
          <stop offset="1" stopColor="#2c0c05" />
        </linearGradient>
        <filter id="cr-nap" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9" result="noise" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0.08  0 0 0 0 0.02  0 0 0 0.32 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="cr-shadow" x="-5%" y="-5%" width="110%" height="115%">
          <feDropShadow dx="0" dy="12" stdDeviation="12" floodColor="#000" floodOpacity="0.6" />
        </filter>
        {/* The far wall: rubber pyramids, lit from above. */}
        <pattern id="cr-pyramids" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#26221f" />
          <path d="M0 0 L9 9 L0 18Z" fill="#3a3430" />
          <path d="M0 0 L18 0 L9 9Z" fill="#4d4640" />
          <path d="M18 0 L18 18 L9 9Z" fill="#1d1a17" />
          <path d="M0 18 L18 18 L9 9Z" fill="#141210" />
        </pattern>
      </defs>

      {/* The rail around the tub, the felt, and the wall. */}
      <rect x="0" y="0" width={FELT_W} height={shape.h} rx="34" fill="url(#cr-mahogany)" filter="url(#cr-shadow)" />
      <rect x="9" y="9" width={FELT_W - 18} height={shape.h - 18} rx="26" fill="none" stroke="#a5552f" strokeOpacity="0.55" strokeWidth="2" />
      <rect x={felt.x} y={felt.y} width={felt.w} height={felt.h} rx="14" fill="url(#cr-felt-light)" />
      <rect x={felt.x} y={felt.y} width={felt.w} height={felt.h} rx="14" fill="#fff" filter="url(#cr-nap)" />
      <rect x={wall.x} y={wall.y} width={wall.w} height={wall.h} fill="url(#cr-pyramids)" />
      <rect x={wall.x} y={wall.y + wall.h} width={wall.w} height="5" fill="#000" opacity="0.28" />
      <rect x={felt.x} y={felt.y} width={felt.w} height={felt.h} rx="14" fill="none" stroke="#06341a" strokeWidth="3" />

      <g fontFamily={DECO} textAnchor="middle" dominantBaseline="central">
        {/* Printed along the landing, where the dice come to rest. */}
        <text
          x={shape.landing.x + shape.landing.w / 2}
          y={shape.landing.y + shape.landing.h * 0.55}
          fontSize={fit('DICE MUST HIT THE BACK WALL', shape.landing.h * 0.26, shape.landing.w * 0.8, 6)}
          letterSpacing="6"
          fill={GOLD}
          opacity="0.32"
        >
          DICE MUST HIT THE BACK WALL
        </text>
        <Numbers shape={shape} />
        <DontComeBar r={shape.dontComeBar} tall={tall} />
        <g>
          {box(shape.come)}
          <text
            x={shape.come.x + shape.come.w * (tall ? 0.4 : 0.42)}
            y={shape.come.y + shape.come.h / 2}
            fontSize={fit('COME', shape.come.h * 0.62, shape.come.w * 0.5, 8)}
            letterSpacing="8"
            fill={RED}
            stroke="#5b0c10"
            strokeWidth="1.2"
          >
            COME
          </text>
        </g>
        <Field r={shape.field} />
        <g>
          {box(shape.dontPass)}
          <text x={shape.dontPass.x + shape.dontPass.w * 0.36} y={shape.dontPass.y + shape.dontPass.h / 2} fontSize={shape.dontPass.h * 0.46} letterSpacing="3" fill={INK}>
            DON’T PASS BAR
          </text>
          <Pair cx={shape.dontPass.x + shape.dontPass.w * 0.36 + shape.dontPass.h * 3.9} cy={shape.dontPass.y + shape.dontPass.h / 2} size={shape.dontPass.h * 0.5} a={6} b={6} />
        </g>
        <OddsBox r={shape.layOdds} label="LAY" />
        <g>
          {box(shape.passLine, INK, 3)}
          <text x={shape.passLine.x + shape.passLine.w * 0.36} y={shape.passLine.y + shape.passLine.h / 2} fontSize={fit('PASS LINE', shape.passLine.h * 0.6, shape.passLine.w * 0.58, 10)} letterSpacing="10" fill={INK}>
            PASS LINE
          </text>
        </g>
        <OddsBox r={shape.passOdds} label="ODDS" />
        <Props shape={shape} />
      </g>
    </svg>
  )
})

function Numbers({ shape }: { shape: Shape }) {
  return (
    <>
      {POINTS.map((n) => {
        const r = shape.numbers[n]
        const strip = r.y + r.h * 0.32
        const label = LABEL[n]
        const size = label.length > 2 ? fit(label, r.h * 0.3, r.w * 0.86, 2) : Math.min(r.h * 0.4, r.w * 0.5)
        return (
          <g key={n}>
            {box(r)}
            {/* The don't come strip along the top of each box. */}
            <path d={`M${r.x} ${strip}H${r.x + r.w}`} stroke={INK} strokeOpacity="0.55" strokeWidth="1.4" />
            <text x={r.x + r.w / 2} y={r.y + r.h * 0.5} fontSize={size} letterSpacing={label.length > 2 ? 2 : 0} fill={INK}>
              {label}
            </text>
          </g>
        )
      })}
    </>
  )
}

function DontComeBar({ r, tall }: { r: Rect; tall: boolean }) {
  const die = Math.min(r.w * 0.24, r.h * 0.2)
  if (tall) {
    return (
      <g>
        {box(r)}
        <text x={r.x + r.w / 2} y={r.y + r.h * 0.19} fontSize={fit('DON’T COME', r.h * 0.18, r.w * 0.86, 1)} letterSpacing="1" fill={INK}>
          DON’T COME
        </text>
        <text x={r.x + r.w * 0.36} y={r.y + r.h * 0.42} fontSize={r.h * 0.15} letterSpacing="2" fill={INK}>
          BAR
        </text>
        <Pair cx={r.x + r.w * 0.64} cy={r.y + r.h * 0.42} size={die * 0.8} a={6} b={6} />
      </g>
    )
  }
  // Up the side of the come box, read from the bottom.
  const cx = r.x + r.w / 2
  const cy = r.y + r.h * 0.56
  return (
    <g>
      {box(r)}
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        <text x={cx} y={cy - r.w * 0.16} fontSize={r.w * 0.22} letterSpacing="2" fill={INK}>
          DON’T COME
        </text>
        <text x={cx - r.w * 0.28} y={cy + r.w * 0.2} fontSize={r.w * 0.2} letterSpacing="2" fill={INK}>
          BAR
        </text>
        <Pair cx={cx + r.w * 0.32} cy={cy + r.w * 0.2} size={r.w * 0.2} a={6} b={6} />
      </g>
    </g>
  )
}

function Field({ r }: { r: Rect }) {
  const numbers = [2, 3, 4, 9, 10, 11, 12]
  const rowY = r.y + r.h * 0.34
  const span = r.w * 0.86
  const step = span / (numbers.length - 1)
  const size = Math.min(r.h * 0.3, step * 0.5)
  return (
    <g>
      {box(r)}
      {numbers.map((n, i) => {
        const x = r.x + (r.w - span) / 2 + i * step
        const ring = n === 2 || n === 12
        return (
          <g key={n}>
            {ring && <circle cx={x} cy={rowY} r={size * 0.82} fill="none" stroke={GOLD} strokeWidth="2" />}
            <text x={x} y={rowY} fontSize={size} fill={GOLD}>
              {n}
            </text>
            {i < numbers.length - 1 && <circle cx={x + step / 2} cy={rowY} r={size * 0.08} fill={GOLD} />}
          </g>
        )
      })}
      <text x={r.x + r.w * 0.42} y={r.y + r.h * 0.74} fontSize={fit('FIELD', r.h * 0.34, r.w * 0.3, 10)} letterSpacing="10" fill={GOLD}>
        FIELD
      </text>
      <text x={r.x + r.w * 0.12} y={r.y + r.h * 0.76} fontSize={Math.min(r.h * 0.13, r.w * 0.024)} letterSpacing="1" fill={GOLD} opacity="0.9">
        2 PAYS DOUBLE
      </text>
      <text x={r.x + r.w * 0.68} y={r.y + r.h * 0.76} fontSize={Math.min(r.h * 0.13, r.w * 0.024)} letterSpacing="1" fill={GOLD} opacity="0.9">
        12 PAYS TRIPLE
      </text>
    </g>
  )
}

function OddsBox({ r, label }: { r: Rect; label: string }) {
  return (
    <g>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(8, r.h * 0.12)} fill="#000" fillOpacity="0.14" stroke={INK} strokeWidth="2" strokeDasharray="6 4" />
      <text x={r.x + r.w / 2} y={r.y + r.h * 0.3} fontSize={fit(label, r.h * 0.3, r.w * 0.8, 2)} letterSpacing="2" fill={INK} opacity="0.85">
        {label}
      </text>
    </g>
  )
}

/** The proposition bets: red-edged boxes with the dice that win them and what they pay. */
function Props({ shape }: { shape: Shape }) {
  const prop = (r: Rect, title: string, pays: string, dice?: [number, number]) => {
    const die = Math.min(r.h * 0.26, r.w * 0.2)
    return (
      <g>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="8" fill="#5b0c10" fillOpacity="0.28" stroke={RED} strokeWidth="2.4" />
        {dice ? (
          <>
            <Pair cx={r.x + r.w / 2} cy={r.y + r.h * 0.3} size={die} a={dice[0]} b={dice[1]} fill="#fbf7ee" pip="#a3121a" />
            <text x={r.x + r.w / 2} y={r.y + r.h * 0.62} fontSize={fit(title, r.h * 0.16, r.w * 0.9)} fill={INK} opacity="0.9">
              {title}
            </text>
          </>
        ) : (
          <text x={r.x + r.w / 2} y={r.y + r.h * 0.34} fontSize={fit(title, r.h * 0.3, r.w * 0.86, 2)} letterSpacing="2" fill={RED}>
            {title}
          </text>
        )}
        <text x={r.x + r.w / 2} y={r.y + r.h * (dice ? 0.83 : 0.72)} fontSize={fit(pays, r.h * (dice ? 0.16 : 0.24), r.w * 0.8)} fill={GOLD}>
          {pays}
        </text>
      </g>
    )
  }
  const hard: Record<number, [number, number]> = { 4: [2, 2], 6: [3, 3], 8: [4, 4], 10: [5, 5] }
  return (
    <>
      {prop(shape.props['any-seven'], 'ANY SEVEN', '4 TO 1')}
      {HARD_NUMBERS.map((n) => (
        <g key={n}>{prop(shape.hard[n], `HARD ${n}`, n === 4 || n === 10 ? '7 TO 1' : '9 TO 1', hard[n])}</g>
      ))}
      {prop(shape.props.aces, 'ACES', '30 TO 1', [1, 1])}
      {prop(shape.props.yo, 'YO', '15 TO 1', [5, 6])}
      {prop(shape.props.boxcars, 'BOXCARS', '30 TO 1', [6, 6])}
      {prop(shape.props['any-craps'], 'ANY CRAPS', '7 TO 1')}
    </>
  )
}

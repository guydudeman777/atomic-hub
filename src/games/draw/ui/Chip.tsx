/**
 * The saloon's clay chips, drawn as SVG: bone, red, blue, green, black and
 * brass, each with notched inlays around the edge and its value stamped in
 * the middle.
 */

import { type CSSProperties, memo } from 'react'
import { breakdown } from './chips'

const COLORS: Record<number, { base: string; inlay: string; ink: string }> = {
  1: { base: '#e9dfc7', inlay: '#7a3b26', ink: '#5a2a18' },
  5: { base: '#a3302a', inlay: '#efe3c4', ink: '#efe3c4' },
  10: { base: '#2c4d86', inlay: '#efe3c4', ink: '#efe3c4' },
  25: { base: '#2f6b3a', inlay: '#efe3c4', ink: '#efe3c4' },
  100: { base: '#24201c', inlay: '#c9a456', ink: '#e8d3a0' },
  500: { base: '#c9a456', inlay: '#3b2412', ink: '#3b2412' },
}

export const Chip = memo(function Chip({ value }: { value: number }) {
  const c = COLORS[value] ?? COLORS[1]
  return (
    <svg viewBox="0 0 40 40" className="dw-chip-svg" aria-hidden="true">
      <circle cx="20" cy="20" r="19.5" fill={c.base} />
      {/* Eight notched inlays round the edge. */}
      <g fill={c.inlay}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="18" y="1" width="4" height="6" rx="0.6" transform={`rotate(${i * 45} 20 20)`} />
        ))}
      </g>
      <circle cx="20" cy="20" r="12.4" fill="none" stroke={c.inlay} strokeOpacity="0.7" strokeWidth="1" />
      <circle cx="20" cy="20" r="11" fill="rgba(0, 0, 0, 0.08)" />
      <text x="20" y="24" textAnchor="middle" fontFamily="Rye, Georgia, serif" fontSize={value >= 100 ? 10 : 12} fill={c.ink}>
        {value}
      </text>
      <circle cx="20" cy="20" r="19.5" fill="none" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1" />
    </svg>
  )
})

/** More than this and a stack shows its bottom chips only. */
const MAX_SHOWN = 10

export interface StackProps {
  amount: number
  className?: string
  style?: CSSProperties
  title?: string
}

/** A stack of chips, the biggest at the bottom. Each chip sits a little higher than the last. */
export function ChipStack({ amount, className, style, title }: StackProps) {
  const chips = breakdown(amount).slice(0, MAX_SHOWN)
  return (
    <div className={`dw-stack${className ? ` ${className}` : ''}`} style={style} role="img" aria-label={title ?? `${amount} caps`}>
      {chips.map((value, i) => (
        <div key={i} className="dw-stack__chip" style={{ '--i': i } as CSSProperties}>
          <Chip value={value} />
        </div>
      ))}
    </div>
  )
}

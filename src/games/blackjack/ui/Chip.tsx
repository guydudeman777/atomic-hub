/**
 * Casino chips in caps, drawn as SVG: the house colors, edge spots and an
 * inlay with the value.
 */

import { type CSSProperties, memo } from 'react'
import { breakdown } from './chips'

const COLORS: Record<number, { base: string; spot: string; ink: string }> = {
  1: { base: '#ebe4d2', spot: '#2c5aa0', ink: '#24497f' },
  5: { base: '#b3262c', spot: '#f3ead6', ink: '#f3ead6' },
  25: { base: '#1d7444', spot: '#f3ead6', ink: '#f3ead6' },
  100: { base: '#202027', spot: '#f3ead6', ink: '#f3ead6' },
  500: { base: '#5a2a86', spot: '#e3c26a', ink: '#f3ead6' },
  1000: { base: '#e0a52a', spot: '#202027', ink: '#202027' },
}

const label = (value: number) => (value >= 1000 ? `${value / 1000}K` : String(value))

export const Chip = memo(function Chip({ value }: { value: number }) {
  const c = COLORS[value] ?? COLORS[1]
  return (
    <svg viewBox="0 0 40 40" className="bj-chip-svg" aria-hidden="true">
      <circle cx="20" cy="20" r="19.5" fill={c.base} />
      {/* Six edge spots, then the inlay ring and the value. */}
      <circle cx="20" cy="20" r="16.5" fill="none" stroke={c.spot} strokeWidth="5" strokeDasharray="7.6 9.68" transform="rotate(-15 20 20)" />
      <circle cx="20" cy="20" r="12.6" fill={c.base} stroke={c.ink} strokeOpacity="0.55" strokeWidth="0.8" strokeDasharray="1.6 1.4" />
      <circle cx="20" cy="20" r="10.6" fill="rgba(255, 255, 255, 0.1)" />
      <text x="20" y="24.2" textAnchor="middle" fontFamily="Limelight, serif" fontSize={value >= 100 ? 10.5 : 12} fill={c.ink}>
        {label(value)}
      </text>
      <circle cx="20" cy="20" r="19.5" fill="none" stroke="rgba(0, 0, 0, 0.35)" strokeWidth="1" />
    </svg>
  )
})

/** More than this and a stack shows its bottom chips only. */
const MAX_SHOWN = 12

export interface StackProps {
  amount: number
  className?: string
  style?: CSSProperties
  title?: string
}

/** A stack of chips on the felt, the biggest at the bottom. Each chip sits a little higher than the last. */
export function ChipStack({ amount, className, style, title }: StackProps) {
  const chips = breakdown(amount).slice(0, MAX_SHOWN)
  return (
    <div className={`bj-stack${className ? ` ${className}` : ''}`} style={style} role="img" aria-label={title ?? `${amount} caps`}>
      {chips.map((value, i) => (
        <div key={i} className="bj-stack__chip" style={{ '--i': i } as CSSProperties}>
          <Chip value={value} />
        </div>
      ))}
    </div>
  )
}

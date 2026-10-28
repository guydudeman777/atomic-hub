/**
 * The wheel: a mahogany bowl with a polished track for the ball, brass
 * deflectors on the apron, and the rotor of numbered pockets turning in the
 * middle, with its brass turret. Everything is drawn here in SVG; the
 * spinning is CSS (roulette.css), from the angles in spin.ts.
 */

import { type CSSProperties, memo, useState } from 'react'
import { type WheelKind, WHEEL_ORDER, colorOf, pocketName } from '../engine'
import { type Spin, SPIN_MS } from './session'
import { type Frame, ROTOR_MS, frameFor } from './spin'

const POCKET_FILL = { red: '#b3202c', black: '#151213', green: '#1b7a48' }
const RING_FILL = { red: '#c62a35', black: '#1d191b', green: '#21905a' }

/** A point at radius `r`, `deg` clockwise from the top. */
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return `${(r * Math.sin(a)).toFixed(3)} ${(-r * Math.cos(a)).toFixed(3)}`
}

/** A wedge of a ring between two angles. */
const wedge = (inner: number, outer: number, from: number, to: number) =>
  `M${polar(outer, from)}A${outer} ${outer} 0 0 1 ${polar(outer, to)}L${polar(inner, to)}A${inner} ${inner} 0 0 0 ${polar(inner, from)}Z`

interface Props {
  wheel: WheelKind
  spin: Spin | null
}

export function Wheel({ wheel, spin }: Props) {
  // A new spin starts from wherever the rotor was when the ball went. One that had already landed when the wheel was drawn is shown at rest.
  const [frame, setFrame] = useState<Frame | null>(null)
  if (spin && frame?.id !== spin.id) setFrame(frameFor(wheel, spin.id, spin.pocket, frame, spin.at, spin.landed && frame === null))
  const moving = !!frame && !frame.still
  const style = {
    '--spin-ms': `${SPIN_MS}ms`,
    '--rotor-ms': `${ROTOR_MS}ms`,
    '--rotor-from': `${frame?.rotorFrom ?? 0}deg`,
    '--rotor-to': `${frame?.rotorTo ?? 0}deg`,
    '--ball-from': `${frame?.ballFrom ?? 0}deg`,
    '--ball-to': `${frame?.ballTo ?? 0}deg`,
  } as CSSProperties
  return (
    <div className="rl-wheel" style={style} role="img" aria-label={spin ? (spin.landed ? `The wheel. The ball is in ${pocketName(spin.pocket)}.` : 'The wheel, spinning.') : 'The wheel.'}>
      <Bowl />
      <div className="rl-rotor" key={frame?.id ?? 0} data-moving={moving || undefined}>
        <Rotor wheel={wheel} />
        {frame && (
          <div className="rl-ball-orbit" data-moving={moving || undefined}>
            <div className="rl-ball" data-moving={moving || undefined} />
          </div>
        )}
      </div>
      <div className="rl-wheel__shine" aria-hidden="true" />
    </div>
  )
}

/** The bowl the rotor turns in: rim, ball track, and the apron with its deflectors. */
const Bowl = memo(function Bowl() {
  return (
    <svg className="rl-wheel__bowl" viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="rl-rim" cx="50%" cy="38%" r="62%">
          <stop offset="0.7" stopColor="#6a2a17" />
          <stop offset="0.9" stopColor="#4a1a0c" />
          <stop offset="1" stopColor="#2a0e06" />
        </radialGradient>
        <radialGradient id="rl-track" cx="50%" cy="40%" r="55%">
          <stop offset="0.75" stopColor="#8e4b24" />
          <stop offset="0.86" stopColor="#c0783e" />
          <stop offset="0.95" stopColor="#7c3c1b" />
        </radialGradient>
        <radialGradient id="rl-apron" cx="50%" cy="45%" r="50%">
          <stop offset="0.7" stopColor="#24120b" />
          <stop offset="1" stopColor="#3f2113" />
        </radialGradient>
        <linearGradient id="rl-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a6" />
          <stop offset="0.45" stopColor="#d6ad55" />
          <stop offset="1" stopColor="#7d5a1d" />
        </linearGradient>
      </defs>
      <circle r="99.5" fill="url(#rl-rim)" />
      <circle r="97" fill="none" stroke="url(#rl-brass)" strokeWidth="1.4" />
      <circle r="95" fill="url(#rl-track)" />
      {/* The track's wall catches the light. */}
      <circle r="94" fill="none" stroke="rgba(255, 230, 190, 0.25)" strokeWidth="0.8" />
      <circle r="82.5" fill="url(#rl-apron)" />
      <circle r="82.5" fill="none" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1" />
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          d={i % 2 === 0 ? 'M0 -81.5 L1.8 -78.2 L0 -75 L-1.8 -78.2Z' : 'M0 -80.2 L3 -78.2 L0 -76.2 L-3 -78.2Z'}
          fill="url(#rl-brass)"
          stroke="#5e4214"
          strokeWidth="0.3"
          transform={`rotate(${i * 45 + 22.5})`}
        />
      ))}
    </svg>
  )
})

/** The rotor: pockets, the ring of numbers, and the turret in the middle. */
const Rotor = memo(function Rotor({ wheel }: { wheel: WheelKind }) {
  const order = WHEEL_ORDER[wheel]
  const step = 360 / order.length
  return (
    <svg className="rl-rotor__art" viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="rl-cone" cx="46%" cy="40%" r="60%">
          <stop offset="0" stopColor="#a3582c" />
          <stop offset="0.55" stopColor="#6e2f15" />
          <stop offset="1" stopColor="#3b1709" />
        </radialGradient>
        <linearGradient id="rl-turret" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0bd" />
          <stop offset="0.5" stopColor="#d9b25c" />
          <stop offset="1" stopColor="#80591b" />
        </linearGradient>
      </defs>
      <circle r="74.6" fill="#c9a24a" />
      {order.map((pocket, i) => {
        const from = i * step - step / 2
        const to = i * step + step / 2
        const color = colorOf(pocket)
        return (
          <g key={pocket}>
            <path d={wedge(63.5, 73.8, from, to)} fill={RING_FILL[color]} />
            <path d={wedge(49.5, 63, from, to)} fill={POCKET_FILL[color]} />
            <text className="rl-rotor__number" transform={`rotate(${i * step}) translate(0 -66.2)`} textAnchor="middle" fontSize={pocketName(pocket).length > 1 ? 6.2 : 6.8}>
              {pocketName(pocket)}
            </text>
          </g>
        )
      })}
      {/* Brass frets between the pockets, and the rings that hold them. */}
      <g stroke="#e3c172" strokeWidth="0.7">
        {order.map((_, i) => (
          <path key={i} d={`M${polar(49.5, i * step + step / 2)}L${polar(73.8, i * step + step / 2)}`} />
        ))}
      </g>
      <circle r="63.2" fill="none" stroke="#e3c172" strokeWidth="0.9" />
      <circle r="49.5" fill="none" stroke="#e3c172" strokeWidth="1.2" />
      {/* Inside each pocket, a shadow at its far wall. */}
      <circle r="56.2" fill="none" stroke="rgba(0, 0, 0, 0.28)" strokeWidth="6" />
      <circle r="49" fill="url(#rl-cone)" />
      {/* The cone's veneer, in eight leaves. */}
      <g stroke="rgba(30, 10, 3, 0.45)" strokeWidth="0.6">
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M${polar(16, i * 45)}L${polar(48.5, i * 45)}`} />
        ))}
      </g>
      <g fill="url(#rl-turret)" stroke="#6a4813" strokeWidth="0.5">
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <rect x="-2.2" y="-36" width="4.4" height="30" rx="2" />
            <circle cy="-37" r="4.2" />
          </g>
        ))}
        <circle r="12" />
        <circle r="6.5" fill="#fff3c8" />
      </g>
    </svg>
  )
})

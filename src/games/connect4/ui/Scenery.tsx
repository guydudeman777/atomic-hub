/**
 * The boardwalk at dusk, drawn in code: the ferris wheel turning over the
 * pier, the sea behind it, and the striped awning and bulbs over the booth.
 */

import type { CSSProperties } from 'react'

const SPOKES = 12

/** The ferris wheel, slowly turning, its cars hanging level. Bulbs on the rim twinkle in turn. */
export function FerrisWheel({ className }: { className?: string }) {
  return (
    <svg className={`c4-ferris ${className ?? ''}`} viewBox="-60 -60 120 140" aria-hidden="true">
      {/* The A-frame it turns on. */}
      <g stroke="#2a1b3d" strokeWidth="3.4" strokeLinecap="round">
        <line x1="0" y1="0" x2="-30" y2="76" />
        <line x1="0" y1="0" x2="30" y2="76" />
        <line x1="-36" y1="76" x2="36" y2="76" />
      </g>
      <g className="c4-ferris__wheel">
        <circle r="50" fill="none" stroke="#2a1b3d" strokeWidth="3" />
        <circle r="44" fill="none" stroke="#2a1b3d" strokeWidth="1.4" />
        {Array.from({ length: SPOKES }, (_, i) => {
          const a = (i / SPOKES) * Math.PI * 2
          return <line key={i} x1="0" y1="0" x2={50 * Math.cos(a)} y2={50 * Math.sin(a)} stroke="#2a1b3d" strokeWidth="1.2" />
        })}
        {Array.from({ length: SPOKES * 2 }, (_, i) => {
          const a = (i / (SPOKES * 2)) * Math.PI * 2
          return <circle key={i} className="c4-ferris__bulb" cx={50 * Math.cos(a)} cy={50 * Math.sin(a)} r="2.1" style={{ animationDelay: `${(i % 6) * -0.35}s` }} />
        })}
        {Array.from({ length: SPOKES / 2 }, (_, i) => {
          const a = (i / (SPOKES / 2)) * 360
          return (
            <g key={i} transform={`rotate(${a}) translate(50 0)`}>
              {/* Each car counter-turns, so it hangs level as the wheel goes round. */}
              <g className="c4-ferris__car" style={{ '--a': `${a}deg` } as CSSProperties}>
                <path d="M-6 2 H6 L5 10 H-5Z" fill={['#e0563b', '#f2c94c', '#3d7fe6'][i % 3]} stroke="#2a1b3d" strokeWidth="1" />
                <line x1="0" y1="0" x2="0" y2="2" stroke="#2a1b3d" strokeWidth="1" />
              </g>
            </g>
          )
        })}
        <circle r="5" fill="#2a1b3d" />
      </g>
    </svg>
  )
}

/** The view out past the booth: the sea, the pier and the wheel against the sunset. */
export function Backdrop({ className }: { className?: string }) {
  return (
    <div className={`c4-backdrop ${className ?? ''}`} aria-hidden="true">
      <svg className="c4-backdrop__sea" viewBox="0 0 1000 120" preserveAspectRatio="none">
        <rect y="0" width="1000" height="120" fill="#22305f" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M0 ${18 + i * 22} q25 -5 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0`} fill="none" stroke="#f5a65b" strokeOpacity={0.28 - i * 0.05} strokeWidth="2" />
        ))}
        {/* The pier, out into the water on its pilings. */}
        <rect x="620" y="14" width="380" height="7" fill="#1a1530" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={630 + i * 32} y="20" width="4" height="40" fill="#1a1530" />
        ))}
      </svg>
      <FerrisWheel className="c4-backdrop__wheel" />
      {/* A roller coaster's hump against the sky. */}
      <svg className="c4-backdrop__coaster" viewBox="0 0 300 100" preserveAspectRatio="none">
        <path d="M0 96 C40 96 60 10 100 10 C140 10 150 70 180 70 C210 70 220 30 250 30 C275 30 285 96 300 96" fill="none" stroke="#2a1b3d" strokeWidth="4" />
        {Array.from({ length: 14 }, (_, i) => (
          <line key={i} x1={10 + i * 21} y1="100" x2={10 + i * 21} y2={[90, 60, 28, 14, 18, 44, 66, 70, 52, 36, 32, 50, 76, 94][i]} stroke="#2a1b3d" strokeWidth="2" />
        ))}
      </svg>
    </div>
  )
}

/** The booth's striped awning, scalloped along its edge, with a string of bulbs under it. */
export function Awning({ className, lit = false }: { className?: string; lit?: boolean }) {
  return (
    <div className={`c4-awning ${lit ? 'is-lit' : ''} ${className ?? ''}`} aria-hidden="true">
      <div className="c4-awning__cloth" />
      <div className="c4-bulbs">
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="c4-bulb" style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
    </div>
  )
}

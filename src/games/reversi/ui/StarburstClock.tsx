/**
 * The starburst clock on the den wall, keeping real time: brass rays
 * around a teal face, and two black hands.
 */

import { useNow } from '../../../hub/useNow'

const RAYS = 24

export function StarburstClock({ className }: { className?: string }) {
  const now = new Date(useNow(true, 20_000))
  const minutes = now.getMinutes()
  const hours = (now.getHours() % 12) + minutes / 60
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <svg className={className} viewBox="-50 -50 100 100" role="img" aria-label={`A starburst clock on the wall. It’s ${time}.`}>
      <g stroke="#c9a24a" strokeLinecap="round">
        {Array.from({ length: RAYS }, (_, i) => {
          const long = i % 2 === 0
          const a = (i / RAYS) * Math.PI * 2
          const r1 = 18
          const r2 = long ? 47 : 36
          return (
            <g key={i}>
              <line x1={r1 * Math.cos(a)} y1={r1 * Math.sin(a)} x2={r2 * Math.cos(a)} y2={r2 * Math.sin(a)} strokeWidth={long ? 2.2 : 1.4} />
              {long && <circle cx={r2 * Math.cos(a)} cy={r2 * Math.sin(a)} r="2.3" fill="#e3a92f" stroke="none" />}
            </g>
          )
        })}
      </g>
      <circle r="17" fill="#2f9a96" stroke="#c9a24a" strokeWidth="2" />
      {[0, 3, 6, 9].map((h) => (
        <circle key={h} cx={13 * Math.sin((h / 12) * Math.PI * 2)} cy={-13 * Math.cos((h / 12) * Math.PI * 2)} r="1.4" fill="#f4ead2" />
      ))}
      <g stroke="#1b1a1f" strokeLinecap="round">
        <line x1="0" y1="2" x2="0" y2="-9" strokeWidth="2.6" transform={`rotate(${hours * 30})`} />
        <line x1="0" y1="3" x2="0" y2="-14" strokeWidth="1.6" transform={`rotate(${minutes * 6})`} />
      </g>
      <circle r="2" fill="#e2622b" />
    </svg>
  )
}

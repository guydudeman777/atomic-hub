/**
 * Line-art glyphs drawn in phosphor, one per kind of game.
 */

import type { GameInfo } from './games'

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

export function GameIcon({ icon, size = 120 }: { icon: GameInfo['icon']; size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" {...common}>
      {GLYPHS[icon]}
    </svg>
  )
}

const card = (x: number, y: number, rot: number, key?: string) => (
  <g key={key} transform={`rotate(${rot} ${x + 18} ${y + 25})`}>
    <rect x={x} y={y} width="36" height="50" rx="4" />
  </g>
)

const GLYPHS: Record<GameInfo['icon'], React.ReactNode> = {
  caravan: (
    <>
      {[16, 48, 80].map((x) =>
        [0, 1, 2].map((i) => <rect key={`${x}-${i}`} x={x} y={14 + i * 16} width="26" height="36" rx="3" />),
      )}
      <path d="M10 90 H110" strokeDasharray="4 6" />
      {[16, 48, 80].map((x) => (
        <rect key={`b${x}`} x={x} y="96" width="26" height="14" rx="3" />
      ))}
    </>
  ),
  cards: (
    <>
      {card(24, 34, -14, 'a')}
      {card(42, 30, 0, 'b')}
      {card(60, 34, 14, 'c')}
      <path d="M60 46 l6 10 -6 10 -6 -10z" />
    </>
  ),
  chip: (
    <>
      <circle cx="60" cy="60" r="38" />
      <circle cx="60" cy="60" r="24" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <path key={a} d="M60 22 v10" transform={`rotate(${a} 60 60)`} />
      ))}
    </>
  ),
  dice: (
    <>
      <rect x="18" y="38" width="44" height="44" rx="6" transform="rotate(-12 40 60)" />
      <rect x="58" y="34" width="44" height="44" rx="6" transform="rotate(10 80 56)" />
      <circle cx="40" cy="60" r="2.5" fill="currentColor" />
      <circle cx="70" cy="46" r="2.5" fill="currentColor" />
      <circle cx="88" cy="64" r="2.5" fill="currentColor" />
    </>
  ),
  wheel: (
    <>
      <circle cx="60" cy="60" r="40" />
      <circle cx="60" cy="60" r="12" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M60 20 V48" transform={`rotate(${i * 30} 60 60)`} />
      ))}
    </>
  ),
  reels: (
    <>
      <rect x="14" y="28" width="92" height="64" rx="6" />
      <path d="M44 28 V92 M76 28 V92" />
      <path d="M22 60 h14 M54 52 l6 16 6 -16 M86 52 v16" />
    </>
  ),
  grid: (
    <>
      <rect x="20" y="20" width="80" height="80" />
      {[40, 60, 80].map((p) => (
        <path key={p} d={`M${p} 20 V100 M20 ${p} H100`} />
      ))}
      <circle cx="30" cy="30" r="6" />
      <circle cx="70" cy="70" r="6" fill="currentColor" />
    </>
  ),
  discs: (
    <>
      <rect x="18" y="22" width="84" height="76" rx="6" />
      {[38, 60, 82].map((x) => [44, 76].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="9" />))}
    </>
  ),
  ships: (
    <>
      <path d="M18 70 H102 L92 86 H28z" />
      <path d="M40 70 V52 H70 V70 M54 52 V38" />
      <path d="M12 98 q12 -6 24 0 t24 0 t24 0 t24 0" />
    </>
  ),
  xo: (
    <>
      <path d="M46 22 V98 M74 22 V98 M22 46 H98 M22 74 H98" />
      <path d="M28 28 l12 12 M40 28 l-12 12" />
      <circle cx="88" cy="88" r="7" />
      <circle cx="60" cy="60" r="7" />
    </>
  ),
}

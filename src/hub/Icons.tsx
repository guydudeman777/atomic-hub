/**
 * Line-art glyphs drawn in phosphor, one per game.
 */

import { Fragment, type ReactNode, useId } from 'react'
import type { Suit } from '../core/cards'
import { SuitGlyph } from '../components/suits'
import type { GameInfo } from './games'

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

export function GameIcon({ icon, size = 120 }: { icon: GameInfo['icon']; size?: number }) {
  const id = useId()
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" {...common}>
      {GLYPHS[icon](id)}
    </svg>
  )
}

interface Layer {
  /** The silhouette, drawn as an outline. Leave its fill and stroke unset: it also masks the layers behind. */
  outline: ReactNode
  detail?: ReactNode
}

/**
 * Overlapping shapes, back to front. Each is hidden where the ones in front
 * of it lie, with a small gap, so stacked outlines read as solid cards.
 */
function Stack({ id, layers }: { id: string; layers: Layer[] }) {
  return layers.map((layer, i) => {
    const front = layers.slice(i + 1)
    const mask = `${id}-${i}`
    return (
      <Fragment key={i}>
        {front.length > 0 && (
          <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
            <rect width="120" height="120" fill="white" />
            <g fill="black" stroke="black" strokeWidth="9">
              {front.map((f, j) => (
                <Fragment key={j}>{f.outline}</Fragment>
              ))}
            </g>
          </mask>
        )}
        <g mask={front.length > 0 ? `url(#${mask})` : undefined}>
          {layer.outline}
          {layer.detail}
        </g>
      </Fragment>
    )
  })
}

interface CardSpec {
  /** Centre. */
  x: number
  y: number
  w: number
  h: number
  /** Degrees clockwise, about `pivot` (the centre by default). */
  turn?: number
  pivot?: [number, number]
  /** Drawn from the card's top-left corner. */
  detail?: ReactNode
}

function card({ x, y, w, h, turn = 0, pivot = [x, y], detail }: CardSpec): Layer {
  const transform = `rotate(${turn} ${pivot[0]} ${pivot[1]}) translate(${x - w / 2} ${y - h / 2})`
  return {
    outline: <rect transform={transform} width={w} height={h} rx={Math.min(4, w / 6)} />,
    detail: detail && <g transform={transform}>{detail}</g>,
  }
}

/** A solid suit symbol centred on (x, y). */
const pip = (suit: Suit, x: number, y: number, size: number) => (
  <g fill="currentColor" stroke="none">
    <SuitGlyph suit={suit} x={x - size / 2} y={y - size / 2} size={size} />
  </g>
)

/** A playing card's back: a border, and a lozenge unless another card hides most of it. */
const cardBack = (w: number, h: number, lozenge = true) => (
  <g strokeWidth="2">
    <rect x="5" y="5" width={w - 10} height={h - 10} rx="2" />
    {lozenge && <path d={`M${w / 2} 13 L${w - 12} ${h / 2} L${w / 2} ${h - 13} L12 ${h / 2}z`} />}
  </g>
)

const GLYPHS: Record<GameInfo['icon'], (id: string) => ReactNode> = {
  caravan: () => (
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
  // The ace of spades and a black jack: the hand the game is named for.
  blackjack: (id) => (
    <Stack
      id={id}
      layers={[
        card({
          x: 42, y: 55, w: 50, h: 70, turn: -14,
          detail: (
            <>
              <path d="M8 6 H14.5 M12 6 V15 A3.5 3.5 0 0 1 5 15" strokeWidth="2.5" />
              {pip('S', 9.5, 25, 7)}
              <rect x="17" y="9" width="27" height="52" rx="2" strokeWidth="2" />
            </>
          ),
        }),
        card({
          x: 76, y: 64, w: 50, h: 70, turn: 10,
          detail: (
            <>
              {[0, 180].map((r) => (
                <g key={r} transform={`rotate(${r} 25 35)`}>
                  <path d="M5.5 17 L9.5 5.5 L13.5 17 M7 13 H12" strokeWidth="2.5" />
                  {pip('S', 9.5, 24, 6)}
                </g>
              ))}
              {pip('S', 25, 35, 24)}
            </>
          ),
        }),
      ]}
    />
  ),
  // Two hole cards, face down, and a stack of chips.
  holdem: (id) => (
    <Stack
      id={id}
      layers={[
        card({ x: 32, y: 54, w: 40, h: 56, turn: -16, detail: cardBack(40, 56, false) }),
        card({ x: 54, y: 58, w: 40, h: 56, turn: 4, detail: cardBack(40, 56) }),
        {
          outline: <path d="M71 60 A17 6 0 0 1 105 60 V92 A17 6 0 0 1 71 92z" />,
          detail: (
            <>
              {[60, 68, 76, 84].map((y) => (
                <path key={y} d={`M71 ${y} A17 6 0 0 0 105 ${y}`} />
              ))}
              <ellipse cx="88" cy="60" rx="9" ry="3" strokeWidth="2" />
            </>
          ),
        },
      ]}
    />
  ),
  // A fanned hand with one card lifted out to throw away.
  draw: (id) => (
    <Stack
      id={id}
      layers={(['S', 'H', 'C', 'D', 'S'] as const).map((suit, i) =>
        card({
          x: 60, y: i === 2 ? 46 : 58, w: 32, h: 46, turn: (i - 2) * 16, pivot: [60, 106],
          detail: (
            <>
              {pip(suit, 7.5, 9, 7)}
              {i === 4 && pip(suit, 16, 24, 14)}
            </>
          ),
        }),
      )}
    />
  ),
  // Klondike: the stock and foundations, and the tableau stepping down.
  solitaire: (id) => {
    const col = (i: number) => 21 + i * 26
    const suits = ['S', 'H', 'C', 'D'] as const
    return (
      <>
        <rect x={col(0) - 11} y="12" width="22" height="30" rx="3.7" />
        <rect x={col(0) - 7} y="16" width="14" height="22" rx="1.5" strokeWidth="2" />
        <rect x={col(2) - 11} y="12" width="22" height="30" rx="3.7" />
        {pip('H', col(2), 27, 10)}
        <rect x={col(3) - 11} y="12" width="22" height="30" rx="3.7" strokeWidth="2" strokeDasharray="3 4" />
        {suits.map((suit, i) => (
          <Stack
            key={suit}
            id={`${id}t${i}`}
            layers={Array.from({ length: i + 1 }, (_, j) =>
              card({ x: col(i), y: 65 + j * 8, w: 22, h: 30, detail: j === i && pip(suit, 11, 15, 10) }),
            )}
          />
        ))}
      </>
    )
  },
  // A dealt hand on the machine's screen, and the hold buttons under it.
  videopoker: () => (
    <>
      <rect x="10" y="22" width="100" height="56" rx="6" />
      {(['S', 'H', 'S', 'D', 'C'] as const).map((suit, i) => {
        const x = 24 + i * 18
        const held = i === 0 || i === 2
        return (
          <Fragment key={i}>
            <rect x={x - 7} y="39" width="14" height="22" rx="2.5" />
            {pip(suit, x, 50, 8)}
            <rect x={x - 6} y="87" width="12" height="8" rx="2" fill={held ? 'currentColor' : 'none'} />
          </Fragment>
        )
      })}
    </>
  ),
  dice: () => (
    <>
      <rect x="18" y="38" width="44" height="44" rx="6" transform="rotate(-12 40 60)" />
      <rect x="58" y="34" width="44" height="44" rx="6" transform="rotate(10 80 56)" />
      <circle cx="40" cy="60" r="2.5" fill="currentColor" />
      <circle cx="70" cy="46" r="2.5" fill="currentColor" />
      <circle cx="88" cy="64" r="2.5" fill="currentColor" />
    </>
  ),
  wheel: () => (
    <>
      <circle cx="60" cy="60" r="40" />
      <circle cx="60" cy="60" r="12" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M60 20 V48" transform={`rotate(${i * 30} 60 60)`} />
      ))}
    </>
  ),
  // A one-armed bandit showing three sevens.
  slots: () => (
    <>
      <path d="M22 36 Q53 14 84 36" />
      <rect x="15" y="36" width="76" height="62" rx="6" />
      <rect x="23" y="46" width="60" height="28" rx="3" />
      <path d="M43 46 V74 M63 46 V74" />
      {[33, 53, 73].map((x) => (
        <path key={x} d={`M${x - 5} 53 H${x + 5} L${x - 1} 67`} />
      ))}
      <rect x="35" y="84" width="36" height="6" rx="2" />
      <path d="M91 70 H100 V32" />
      <circle cx="100" cy="26" r="6" fill="currentColor" />
    </>
  ),
  // One disc away from four on the diagonal.
  connect4: () => {
    // Rows top to bottom: 0 empty, 1 and 2 the two players' discs.
    const board = [
      [0, 0, 0, 0, 0],
      [0, 0, 1, 2, 0],
      [0, 1, 2, 2, 0],
      [1, 2, 2, 1, 0],
    ]
    const cx = (c: number) => 31 + c * 14.5
    const cy = (r: number) => 48 + r * 14.5
    return (
      <>
        <rect x="19" y="38" width="82" height="64" rx="4" />
        <path d="M23 102 L16 110 M97 102 L104 110 M10 110 H24 M96 110 H110" />
        {board.map((row, r) =>
          row.map((disc, c) => (
            <Fragment key={`${r}${c}`}>
              <circle cx={cx(c)} cy={cy(r)} r="5" fill={disc === 1 ? 'currentColor' : 'none'} strokeWidth={disc ? 3 : 2} strokeOpacity={disc ? 1 : 0.5} />
              {disc === 2 && <circle cx={cx(c)} cy={cy(r)} r="1.6" fill="currentColor" stroke="none" />}
            </Fragment>
          )),
        )}
        <circle cx={cx(3)} cy="24" r="5" fill="currentColor" />
      </>
    )
  },
  // Dark squares shaded, so the board can't be mistaken for Reversi's.
  grid: () => (
    <>
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) =>
          (r + c) % 2 === 1 && <rect key={`${r}${c}`} x={20 + c * 20} y={20 + r * 20} width="20" height="20" fill="currentColor" fillOpacity="0.25" stroke="none" />,
        ),
      )}
      <rect x="20" y="20" width="80" height="80" />
      {[
        [50, 30],
        [30, 50],
      ].map(([x, y]) => (
        <Fragment key={`${x}${y}`}>
          <circle cx={x} cy={y} r="7" />
          <circle cx={x} cy={y} r="3" strokeWidth="2" />
        </Fragment>
      ))}
      <circle cx="90" cy="70" r="7" fill="currentColor" />
      <circle cx="70" cy="90" r="7" fill="currentColor" />
    </>
  ),
  // The four discs every game starts from.
  reversi: () => (
    <>
      <rect x="20" y="20" width="80" height="80" />
      {[40, 60, 80].map((p) => (
        <path key={p} d={`M${p} 20 V100 M20 ${p} H100`} strokeWidth="2" />
      ))}
      <circle cx="50" cy="50" r="8" fill="currentColor" />
      <circle cx="70" cy="50" r="8" />
      <circle cx="50" cy="70" r="8" />
      <circle cx="70" cy="70" r="8" fill="currentColor" />
    </>
  ),
  ships: () => (
    <>
      <path d="M18 70 H102 L92 86 H28z" />
      <path d="M40 70 V52 H70 V70 M54 52 V38" />
      <path d="M12 98 q12 -6 24 0 t24 0 t24 0 t24 0" />
    </>
  ),
  xo: () => (
    <>
      <path d="M46 22 V98 M74 22 V98 M22 46 H98 M22 74 H98" />
      <path d="M28 28 l12 12 M40 28 l-12 12" />
      <circle cx="88" cy="88" r="7" />
      <circle cx="60" cy="60" r="7" />
    </>
  ),
}

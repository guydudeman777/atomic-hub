/**
 * Tic-Tac-Toe rules engine, for Classic and Ultimate.
 *
 * Pure and framework-free, like the other games' engines: the UI, the AI
 * and the tests drive a game through `legalMoves` and `apply`. State is
 * immutable. Each small grid's marks are a 9-bit mask per player, so a
 * line of three is one table lookup; `cells` gives the board as a plain
 * array for drawing.
 *
 * Rules
 * - Classic: a 3×3 grid. X moves first, then the players take turns
 *   putting their mark in an empty square. Three in a row, across, down
 *   or diagonally, wins. A full grid with no three in a row is a draw, a
 *   cat's game.
 * - Ultimate: nine small grids laid out in a big 3×3. X moves first, in
 *   any square of any small grid.
 * - Where you play in a small grid sends your opponent to the matching
 *   grid of the big one: play the top right square and they must play in
 *   the top right grid. If that grid is already won or full, they may
 *   play in any open grid instead.
 * - Three in a row in a small grid wins that grid, and it closes: nobody
 *   plays in it again. A small grid that fills up with no three in a row
 *   counts for nobody.
 * - Three small grids in a row on the big grid wins the game. When every
 *   small grid is won or full and nobody has a line of three, it's a draw.
 *
 * Squares are numbered 0 to 8 across and down from the top left. In
 * Ultimate a square is `grid * 9 + square`, with the grids numbered the
 * same way.
 */

export type Player = 0 | 1
export const X: Player = 0
export const O: Player = 1
export const MARK: Record<Player, 'X' | 'O'> = { 0: 'X', 1: 'O' }

export const other = (p: Player): Player => (p === 0 ? 1 : 0)

export type Variant = 'classic' | 'ultimate'

/** What became of a small grid: won by a player, full with no line ('draw'), or still open (null). */
export type GridOwner = Player | 'draw' | null

export interface GameState {
  readonly variant: Variant
  /** X's marks, then O's: a 9-bit mask for each small grid. Classic has one grid. */
  readonly marks: readonly [readonly number[], readonly number[]]
  /** What became of each small grid. In Classic, the one grid is settled when the game is. */
  readonly grids: readonly GridOwner[]
  readonly current: Player
  /** Ultimate: the grid the player to move is sent to, or null to play in any open grid. Always null in Classic. */
  readonly forced: number | null
  readonly over: boolean
  /** Set when the game is over; null for a draw. */
  readonly winner: Player | null
  /** The winning three, top left first: squares in Classic, grids in Ultimate. */
  readonly line: readonly number[] | null
  /** Marks made so far. */
  readonly turn: number
  /** Where the last mark went. */
  readonly last: number | null
}

export type GameEvent =
  | { readonly type: 'placed'; readonly player: Player; readonly square: number }
  /** Ultimate: a small grid won with three in a row, its squares top left first. */
  | { readonly type: 'grid-won'; readonly player: Player; readonly grid: number; readonly line: readonly number[] }
  /** Ultimate: a small grid filled with no three in a row. It counts for nobody. */
  | { readonly type: 'grid-full'; readonly grid: number }
  /** Ultimate: where the next player has to play, or null for anywhere open. */
  | { readonly type: 'sent'; readonly player: Player; readonly grid: number | null }
  | { readonly type: 'ended'; readonly winner: Player | null; readonly line: readonly number[] | null }

/** The eight lines of three in a 3×3, top left first. */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export const LINE_MASKS: readonly number[] = LINES.map(([a, b, c]) => (1 << a) | (1 << b) | (1 << c))

export const FULL = 0b111_111_111

/** For each 9-bit mask, the first line of three in it, or -1. */
export const LINE_IN: Int8Array = (() => {
  const table = new Int8Array(512).fill(-1)
  for (let mask = 0; mask < 512; mask++) {
    const i = LINE_MASKS.findIndex((line) => (mask & line) === line)
    table[mask] = i
  }
  return table
})()

/** How many squares or grids a variant has. */
export const SIZE: Record<Variant, number> = { classic: 9, ultimate: 81 }

export const gridOf = (variant: Variant, square: number) => (variant === 'classic' ? 0 : Math.floor(square / 9))
export const cellOf = (variant: Variant, square: number) => (variant === 'classic' ? square : square % 9)

/** Where a square is drawn: row and column on the 3×3, or the 9×9 in Ultimate. */
export function position(variant: Variant, square: number): { row: number; col: number } {
  if (variant === 'classic') return { row: Math.floor(square / 3), col: square % 3 }
  const g = Math.floor(square / 9)
  const c = square % 9
  return { row: Math.floor(g / 3) * 3 + Math.floor(c / 3), col: (g % 3) * 3 + (c % 3) }
}

/** The square drawn at a row and column. */
export function squareAt(variant: Variant, row: number, col: number): number {
  if (variant === 'classic') return row * 3 + col
  const g = Math.floor(row / 3) * 3 + Math.floor(col / 3)
  return g * 9 + (row % 3) * 3 + (col % 3)
}

/** Each of the nine places in a 3×3, for the log and the board's labels. */
export const PLACE = ['top left', 'top middle', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'] as const

/** "the center", "the top left grid": a place said in a sentence. */
export const placeName = (i: number) => `the ${PLACE[i]}`

/** "the top right" in Classic, "the top right of the center grid" in Ultimate. */
export function squareName(variant: Variant, square: number): string {
  if (variant === 'classic') return placeName(square)
  return `${placeName(square % 9)} of ${gridName(Math.floor(square / 9))}`
}

/** "the center grid". */
export const gridName = (grid: number) => `${placeName(grid)} grid`

const bit = (i: number) => 1 << i

export function createGame(variant: Variant = 'classic'): GameState {
  const grids = variant === 'classic' ? 1 : 9
  return {
    variant,
    marks: [Array<number>(grids).fill(0), Array<number>(grids).fill(0)],
    grids: Array<GridOwner>(grids).fill(null),
    current: X,
    forced: null,
    over: false,
    winner: null,
    line: null,
    turn: 0,
    last: null,
  }
}

/** The squares in a mask, lowest first. */
export function bitsOf(mask: number): number[] {
  const out: number[] = []
  for (let i = 0; i < 9; i++) if (mask & bit(i)) out.push(i)
  return out
}

const popcount = (mask: number) => {
  let n = 0
  for (let m = mask; m; m &= m - 1) n++
  return n
}

/** What a small grid's marks make of it. */
function ownerOf(x: number, o: number): GridOwner {
  if (LINE_IN[x] >= 0) return X
  if (LINE_IN[o] >= 0) return O
  return (x | o) === FULL ? 'draw' : null
}

/** The big grid's lines, as masks of the grids each player has won. */
export function wonGrids(state: GameState, player: Player): number {
  let mask = 0
  state.grids.forEach((owner, g) => {
    if (owner === player) mask |= bit(g)
  })
  return mask
}

/**
 * A position from a picture of the board, for tests and puzzles: rows of
 * `x`, `o` and `.`, top row first, as drawn (nine rows of nine in
 * Ultimate). Whitespace is ignored. X is to move when the marks are even.
 * In Ultimate, `forced` says which grid the player to move is sent to.
 */
export function fromDiagram(diagram: string, { forced = null, last = null }: { forced?: number | null; last?: number | null } = {}): GameState {
  const marks = diagram.replace(/\s+/g, '')
  if (marks.length !== 9 && marks.length !== 81) throw new Error(`A board has 9 or 81 squares, not ${marks.length}`)
  const variant: Variant = marks.length === 9 ? 'classic' : 'ultimate'
  let state = createGame(variant)
  const xs = [...state.marks[0]]
  const os = [...state.marks[1]]
  let count = 0
  for (let i = 0; i < marks.length; i++) {
    const { row, col } = variant === 'classic' ? { row: Math.floor(i / 3), col: i % 3 } : { row: Math.floor(i / 9), col: i % 9 }
    const sq = squareAt(variant, row, col)
    const g = gridOf(variant, sq)
    const c = cellOf(variant, sq)
    if (marks[i] === 'x') xs[g] |= bit(c)
    else if (marks[i] === 'o') os[g] |= bit(c)
    else continue
    count++
  }
  const grids = xs.map((x, g) => ownerOf(x, os[g]))
  state = {
    ...state,
    marks: [xs, os],
    grids: variant === 'classic' ? [null] : grids,
    current: count % 2 === 0 ? X : O,
    forced: variant === 'ultimate' && forced !== null && grids[forced] === null ? forced : null,
    turn: count,
    last,
  }
  return settle(state)
}

/** Over or not, and who won: for a position put together by hand. */
function settle(state: GameState): GameState {
  if (state.variant === 'classic') {
    const [x, o] = [state.marks[0][0], state.marks[1][0]]
    const owner = ownerOf(x, o)
    if (owner === null) return state
    const winner = owner === 'draw' ? null : owner
    const line = winner === null ? null : LINES[LINE_IN[winner === X ? x : o]]
    return { ...state, over: true, winner, line, grids: [owner], forced: null }
  }
  for (const p of [X, O] as const) {
    const i = LINE_IN[wonGrids(state, p)]
    if (i >= 0) return { ...state, over: true, winner: p, line: LINES[i], forced: null }
  }
  if (state.grids.every((g) => g !== null)) return { ...state, over: true, winner: null, line: null, forced: null }
  return state
}

/** The open squares of one grid. */
const emptiesOf = (state: GameState, grid: number) => FULL & ~(state.marks[0][grid] | state.marks[1][grid])

/** Who's in each square, by square number. */
export function cells(state: GameState): (Player | null)[] {
  return Array.from({ length: SIZE[state.variant] }, (_, sq) => {
    const g = gridOf(state.variant, sq)
    const c = bit(cellOf(state.variant, sq))
    return state.marks[0][g] & c ? X : state.marks[1][g] & c ? O : null
  })
}

/** The grids the player to move may play in: the one they're sent to, or every open one. */
export function playableGrids(state: GameState): number[] {
  if (state.over) return []
  if (state.forced !== null) return [state.forced]
  return state.grids.flatMap((owner, g) => (owner === null ? [g] : []))
}

/** The squares the player to move can play, lowest first. None once the game is over. */
export function legalMoves(state: GameState): number[] {
  const moves: number[] = []
  for (const g of playableGrids(state)) {
    for (const c of bitsOf(emptiesOf(state, g))) moves.push(state.variant === 'classic' ? c : g * 9 + c)
  }
  return moves.sort((a, b) => a - b)
}

export function isLegal(state: GameState, square: number): boolean {
  if (state.over || !Number.isInteger(square) || square < 0 || square >= SIZE[state.variant]) return false
  const g = gridOf(state.variant, square)
  if (state.grids[g] !== null) return false
  if (state.forced !== null && state.forced !== g) return false
  return (emptiesOf(state, g) & bit(cellOf(state.variant, square))) !== 0
}

/** Put the mark of the player to move on `square`. Throws on an illegal move. */
export function apply(state: GameState, square: number): { state: GameState; events: GameEvent[] } {
  if (!isLegal(state, square)) throw new Error(`Illegal move: ${square}`)
  const { variant } = state
  const player = state.current
  const g = gridOf(variant, square)
  const c = cellOf(variant, square)
  const mine = [...state.marks[player]]
  mine[g] |= bit(c)
  const marks: [readonly number[], readonly number[]] = player === X ? [mine, state.marks[1]] : [state.marks[0], mine]
  const events: GameEvent[] = [{ type: 'placed', player, square }]
  const base = { ...state, marks, turn: state.turn + 1, last: square }

  if (variant === 'classic') {
    const owner = ownerOf(marks[0][0], marks[1][0])
    if (owner === null) return { state: { ...base, current: other(player) }, events }
    const winner = owner === 'draw' ? null : owner
    const line = winner === null ? null : LINES[LINE_IN[mine[0]]]
    events.push({ type: 'ended', winner, line })
    return { state: { ...base, grids: [owner], over: true, winner, line }, events }
  }

  // Ultimate: settle the small grid, then the big one.
  const grids = [...state.grids]
  const owner = ownerOf(marks[0][g], marks[1][g])
  if (owner === player) {
    grids[g] = player
    events.push({ type: 'grid-won', player, grid: g, line: LINES[LINE_IN[mine[g]]].map((i) => g * 9 + i) })
  } else if (owner === 'draw') {
    grids[g] = 'draw'
    events.push({ type: 'grid-full', grid: g })
  }
  const next: GameState = { ...base, grids, current: other(player), forced: null }
  const big = LINE_IN[wonGrids(next, player)]
  if (big >= 0) {
    const line = LINES[big]
    events.push({ type: 'ended', winner: player, line })
    return { state: { ...next, over: true, winner: player, line }, events }
  }
  if (grids.every((o) => o !== null)) {
    events.push({ type: 'ended', winner: null, line: null })
    return { state: { ...next, over: true, winner: null, line: null }, events }
  }
  const forced = grids[c] === null ? c : null
  events.push({ type: 'sent', player: other(player), grid: forced })
  return { state: { ...next, forced }, events }
}

/**
 * The lines a player is one mark from: two of theirs and the third open.
 * Returns the squares (Classic) or grids (Ultimate) that would complete
 * them, without repeats.
 */
export function threats(state: GameState, player: Player): number[] {
  const open = new Set<number>()
  if (state.variant === 'classic') {
    const mine = state.marks[player][0]
    const empty = emptiesOf(state, 0)
    for (const line of LINE_MASKS) {
      if (popcount(mine & line) === 2 && (empty & line) !== 0) open.add(bitsOf(empty & line)[0])
    }
  } else {
    const mine = wonGrids(state, player)
    let free = 0
    state.grids.forEach((owner, g) => {
      if (owner === null) free |= bit(g)
    })
    for (const line of LINE_MASKS) {
      if (popcount(mine & line) === 2 && (free & line) !== 0) open.add(bitsOf(free & line)[0])
    }
  }
  return [...open].sort((a, b) => a - b)
}

/** Squares or grids won so far: X's, then O's. */
export function gridsWon(state: GameState): [number, number] {
  return [popcount(wonGrids(state, X)), popcount(wonGrids(state, O))]
}

/**
 * Connect Four rules engine.
 *
 * Pure and framework-free, like Reversi's: the UI, the AI and the tests
 * drive a game through `legalMoves` and `apply`. State is immutable. The
 * board is a plain array here, for clarity; the AI keeps its own bitboards
 * (ai.ts) and is checked against this engine.
 *
 * Rules
 * - A rack of 7 columns and 6 rows, standing upright. Columns are numbered
 *   1 to 7 from the left, rows 1 to 6 from the bottom.
 * - Red drops first, then the players take turns. Each player has 21
 *   checkers.
 * - A move drops one checker into a column that isn't full. It falls to the
 *   lowest empty hole in that column.
 * - Four of your checkers in a straight line (across, up and down, or on a
 *   diagonal) wins at once. A move that makes more than one line, or a line
 *   of five or more, still wins just the once.
 * - If all 42 holes fill without a line of four, the game is a draw.
 */

export type Player = 0 | 1
export const RED: Player = 0
export const YELLOW: Player = 1
export const COLOR_NAME: Record<Player, string> = { 0: 'Red', 1: 'Yellow' }

export const other = (p: Player): Player => (p === 0 ? 1 : 0)

export const COLS = 7
export const ROWS = 6
export const CELLS = COLS * ROWS
/** Each player's checkers. */
export const CHECKERS = CELLS / 2

/** Squares are numbered across each row from the left, bottom row first: row 1 is 0–6. */
export const squareOf = (col: number, row: number) => row * COLS + col
export const colOf = (sq: number) => sq % COLS
export const rowOf = (sq: number) => Math.floor(sq / COLS)

/** "column 4", for a column index. */
export const columnName = (col: number) => `column ${col + 1}`

export interface GameState {
  /** Who's in each hole, bottom row first. */
  readonly board: readonly (Player | null)[]
  /** Checkers in each column. */
  readonly heights: readonly number[]
  readonly current: Player
  /** Someone made four, or the rack is full. */
  readonly over: boolean
  /** Set when the game is over; null for a draw. */
  readonly winner: Player | null
  /** The winning checkers, every line of four or more through the last one. */
  readonly line: readonly number[] | null
  /** Checkers dropped so far. */
  readonly turn: number
  /** Where the last checker landed. */
  readonly last: number | null
}

export type GameEvent =
  | { readonly type: 'dropped'; readonly player: Player; readonly col: number; readonly row: number }
  /** The game is over: `line` holds the winning checkers, or it's null for a full rack. */
  | { readonly type: 'ended'; readonly winner: Player | null; readonly line: readonly number[] | null }

export function createGame(): GameState {
  return {
    board: Array.from({ length: CELLS }, () => null),
    heights: Array.from({ length: COLS }, () => 0),
    current: RED,
    over: false,
    winner: null,
    line: null,
    turn: 0,
    last: null,
  }
}

/** The four directions a line can run: across, up, and the two diagonals. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

const inside = (col: number, row: number) => col >= 0 && col < COLS && row >= 0 && row < ROWS

/**
 * The squares in lines of four or more through `square` for `player`, as if
 * `player` had a checker there. Empty if there aren't any.
 */
function linesThrough(board: readonly (Player | null)[], square: number, player: Player): number[] {
  const col = colOf(square)
  const row = rowOf(square)
  const found = new Set<number>()
  for (const [dc, dr] of DIRECTIONS) {
    const run = [square]
    for (const sign of [1, -1]) {
      let c = col + dc * sign
      let r = row + dr * sign
      while (inside(c, r) && board[squareOf(c, r)] === player) {
        run.push(squareOf(c, r))
        c += dc * sign
        r += dr * sign
      }
    }
    if (run.length >= 4) for (const sq of run) found.add(sq)
  }
  return [...found].sort((a, b) => a - b)
}

/**
 * A position from a picture of the rack, for tests and puzzles: six rows of
 * seven, top row first, `x` for red, `o` for yellow, `.` for empty.
 * Whitespace is ignored. Checkers can't float, and the side to move follows
 * from the counts: Red when they're level.
 */
export function fromDiagram(diagram: string): GameState {
  const cells = diagram.replace(/\s+/g, '')
  if (cells.length !== CELLS) throw new Error(`A rack has ${CELLS} holes, not ${cells.length}`)
  const board: (Player | null)[] = Array.from({ length: CELLS }, () => null)
  const heights = Array.from({ length: COLS }, () => 0)
  let red = 0
  let yellow = 0
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = cells[(ROWS - 1 - row) * COLS + col]
      if (ch === '.') continue
      if (ch !== 'x' && ch !== 'o') throw new Error(`Unknown checker "${ch}"`)
      if (heights[col] !== row) throw new Error(`A checker floats in ${columnName(col)}`)
      board[squareOf(col, row)] = ch === 'x' ? RED : YELLOW
      heights[col]++
      if (ch === 'x') red++
      else yellow++
    }
  }
  if (red !== yellow && red !== yellow + 1) throw new Error(`${red} red and ${yellow} yellow can’t happen: Red drops first`)
  const state: GameState = { board, heights, current: red === yellow ? RED : YELLOW, over: false, winner: null, line: null, turn: red + yellow, last: null }
  for (let sq = 0; sq < CELLS; sq++) {
    const owner = board[sq]
    if (owner === null) continue
    const line = linesThrough(board, sq, owner)
    if (line.length) return { ...state, over: true, winner: owner, line }
  }
  return state.turn === CELLS ? { ...state, over: true } : state
}

/** Where a checker dropped in `col` would land, or null if the column is full. */
export function landingRow(state: GameState, col: number): number | null {
  const h = state.heights[col]
  return h < ROWS ? h : null
}

/** The columns the player to move can drop into, left to right. None once the game is over. */
export function legalMoves(state: GameState): number[] {
  if (state.over) return []
  return state.heights.flatMap((h, col) => (h < ROWS ? [col] : []))
}

export function isLegal(state: GameState, col: number): boolean {
  return !state.over && Number.isInteger(col) && col >= 0 && col < COLS && state.heights[col] < ROWS
}

/** Drop a checker in `col` for the player to move. Throws on an illegal move. */
export function apply(state: GameState, col: number): { state: GameState; events: GameEvent[] } {
  if (!isLegal(state, col)) {
    const why = state.over ? 'the game is over' : Number.isInteger(col) && col >= 0 && col < COLS ? `${columnName(col)} is full` : `there’s no column ${col}`
    throw new Error(`Illegal move: ${why}`)
  }
  const player = state.current
  const row = state.heights[col]
  const square = squareOf(col, row)
  const board = state.board.slice()
  board[square] = player
  const heights = state.heights.slice()
  heights[col]++
  const turn = state.turn + 1
  const events: GameEvent[] = [{ type: 'dropped', player, col, row }]
  const line = linesThrough(board, square, player)
  let next: GameState = { board, heights, current: other(player), over: false, winner: null, line: null, turn, last: square }
  if (line.length) {
    next = { ...next, over: true, winner: player, line }
    events.push({ type: 'ended', winner: player, line })
  } else if (turn === CELLS) {
    next = { ...next, over: true }
    events.push({ type: 'ended', winner: null, line: null })
  }
  return { state: next, events }
}

/**
 * The empty holes where a checker of `player`'s would make four, whether or
 * not a checker can reach them yet: that player's threats.
 */
export function winningSquares(state: GameState, player: Player): number[] {
  const squares: number[] = []
  for (let sq = 0; sq < CELLS; sq++) {
    if (state.board[sq] === null && linesThrough(state.board, sq, player).length) squares.push(sq)
  }
  return squares
}

/** The holes a checker can drop into right now: the lowest empty one in each column. */
export function openSquares(state: GameState): number[] {
  return state.heights.flatMap((h, col) => (h < ROWS ? [squareOf(col, h)] : []))
}

/** How a line of four runs, for the log: "across the bottom row", "up column 3", "on a diagonal". */
export function describeLine(line: readonly number[]): string {
  const cols = new Set(line.map(colOf))
  const rows = new Set(line.map(rowOf))
  if (rows.size === 1 && cols.size === line.length) {
    const row = rowOf(line[0])
    return row === 0 ? 'across the bottom row' : row === ROWS - 1 ? 'across the top row' : `across row ${row + 1}`
  }
  if (cols.size === 1) return `up ${columnName(colOf(line[0]))}`
  // Diagonals, or more than one line made at once.
  if (cols.size === line.length && rows.size === line.length) return 'on a diagonal'
  return 'two ways at once'
}

/**
 * Every game in the hub, in the order the menu lists them.
 * `ready: false` games appear in the menu as in development.
 */

export type Category = 'cards' | 'casino' | 'board'

export interface GameInfo {
  id: string
  name: string
  category: Category
  blurb: string
  modes: string
  ready: boolean
  path: string
  icon:
    | 'caravan' | 'blackjack' | 'holdem' | 'draw' | 'solitaire' | 'videopoker' | 'wheel' | 'dice' | 'slots'
    | 'connect4' | 'grid' | 'reversi' | 'ships' | 'xo'
}

/** `short` labels the tabs on phones, where the full labels don't fit in a row. */
export const CATEGORIES: { id: Category; label: string; short: string }[] = [
  { id: 'cards', label: 'Card tables', short: 'Cards' },
  { id: 'casino', label: 'Casino floor', short: 'Casino' },
  { id: 'board', label: 'Board games', short: 'Board' },
]

export const GAMES: readonly GameInfo[] = [
  {
    id: 'caravan', name: 'Caravan', category: 'cards', ready: true, path: '/caravan', icon: 'caravan',
    modes: 'Against the AI, hot-seat, or online',
    blurb: 'Build three caravans worth 21 to 26 and outbid your rival on at least two. Win cards from five opponents and build your own deck.',
  },
  {
    id: 'blackjack', name: 'Blackjack', category: 'cards', ready: true, path: '/blackjack', icon: 'blackjack',
    modes: 'A full table of regulars, one on one with the dealer, or online with friends',
    blurb: 'Blue felt, a six-deck shoe and caps on the line. Dealer stands on soft 17, blackjack pays 3 to 2, and a coach knows the book.',
  },
  {
    id: 'holdem', name: 'Texas Hold’em', category: 'cards', ready: false, path: '/holdem', icon: 'holdem',
    modes: '2–6 seats, AI or hot-seat',
    blurb: 'No-limit Hold’em with blinds and side pots against bots with their own personalities.',
  },
  {
    id: 'draw', name: 'Five-Card Draw', category: 'cards', ready: true, path: '/draw', icon: 'draw',
    modes: 'Heads up, up to five saloon regulars, or online with friends',
    blurb: 'Ante up, draw up to three, and bet it all on what you kept. Fixed limit, in a back room where the regulars bluff.',
  },
  {
    id: 'solitaire', name: 'Solitaire', category: 'cards', ready: false, path: '/solitaire', icon: 'solitaire',
    modes: 'Solo',
    blurb: 'Klondike, draw one or three, with undo and optional Vegas scoring in caps.',
  },
  {
    id: 'videopoker', name: 'Video Poker', category: 'casino', ready: false, path: '/videopoker', icon: 'videopoker',
    modes: 'Solo',
    blurb: 'Jacks or Better on a full-pay table. Hold, draw, collect.',
  },
  {
    id: 'roulette', name: 'Roulette', category: 'casino', ready: true, path: '/roulette', icon: 'wheel',
    modes: 'Against the house, with regulars at the table, or online with friends',
    blurb: 'A European, French or American wheel with every inside and outside bet, in a gilded salon on the Riviera.',
  },
  {
    id: 'craps', name: 'Craps', category: 'casino', ready: true, path: '/craps', icon: 'dice',
    modes: 'Against the house, with the dice in your hand and three regulars at the rail, or online with friends',
    blurb: 'Pass line, come bets, full odds, place bets, the field and the hardways, on a green felt layout under the marquee lights.',
  },
  {
    id: 'slots', name: 'Slots', category: 'casino', ready: false, path: '/slots', icon: 'slots',
    modes: 'Solo',
    blurb: 'Three reels of wasteland junk with a published paytable.',
  },
  {
    id: 'connect4', name: 'Connect Four', category: 'board', ready: true, path: '/connect4', icon: 'connect4',
    modes: 'Four opponents on a ladder, hot-seat, or online',
    blurb: 'Drop checkers, line up four. In the big blue rack at the end of the boardwalk midway.',
  },
  {
    id: 'checkers', name: 'Checkers', category: 'board', ready: false, path: '/checkers', icon: 'grid',
    modes: 'Against the AI or hot-seat',
    blurb: 'American rules: forced captures, multi-jumps and kings.',
  },
  {
    id: 'reversi', name: 'Reversi', category: 'board', ready: true, path: '/reversi', icon: 'reversi',
    modes: 'Four opponents on a ladder, hot-seat, or online',
    blurb: 'Flank and flip. Corners win games. On a walnut board in an atomic-age den.',
  },
  {
    id: 'battleship', name: 'Battleship', category: 'board', ready: false, path: '/battleship', icon: 'ships',
    modes: 'Against the AI or hot-seat',
    blurb: 'Hide your fleet, then hunt theirs.',
  },
  {
    id: 'tictactoe', name: 'Tic-Tac-Toe', category: 'board', ready: true, path: '/tictactoe', icon: 'xo',
    modes: 'Four opponents on a ladder, hot-seat, or online',
    blurb: 'Classic 3×3, or Ultimate on a 9×9 board, in grease pencil on a placemat at the Starlite Diner.',
  },
]

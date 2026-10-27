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
  icon: 'caravan' | 'cards' | 'chip' | 'dice' | 'wheel' | 'reels' | 'grid' | 'discs' | 'ships' | 'xo'
}

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'cards', label: 'Card tables' },
  { id: 'casino', label: 'Casino floor' },
  { id: 'board', label: 'Board games' },
]

export const GAMES: readonly GameInfo[] = [
  {
    id: 'caravan', name: 'Caravan', category: 'cards', ready: true, path: '/caravan', icon: 'caravan',
    modes: 'Against the AI or hot-seat',
    blurb: 'Build three caravans worth 21 to 26 and outbid your rival on at least two. Win cards from five opponents and build your own deck.',
  },
  {
    id: 'blackjack', name: 'Blackjack', category: 'cards', ready: true, path: '/blackjack', icon: 'cards',
    modes: 'A full table of regulars, or one on one with the dealer',
    blurb: 'Blue felt, a six-deck shoe and caps on the line. Dealer stands on soft 17, blackjack pays 3 to 2, and a coach knows the book.',
  },
  {
    id: 'holdem', name: 'Texas Hold’em', category: 'cards', ready: false, path: '/holdem', icon: 'chip',
    modes: '2–6 seats, AI or hot-seat',
    blurb: 'No-limit Hold’em with blinds and side pots against bots with their own personalities.',
  },
  {
    id: 'draw', name: 'Five-Card Draw', category: 'cards', ready: false, path: '/draw', icon: 'cards',
    modes: '2–6 seats, AI or hot-seat',
    blurb: 'Ante up, draw up to three, and bet it all on what you kept.',
  },
  {
    id: 'solitaire', name: 'Solitaire', category: 'cards', ready: false, path: '/solitaire', icon: 'cards',
    modes: 'Solo',
    blurb: 'Klondike, draw one or three, with undo and optional Vegas scoring in caps.',
  },
  {
    id: 'videopoker', name: 'Video Poker', category: 'casino', ready: false, path: '/videopoker', icon: 'reels',
    modes: 'Solo',
    blurb: 'Jacks or Better on a full-pay table. Hold, draw, collect.',
  },
  {
    id: 'roulette', name: 'Roulette', category: 'casino', ready: false, path: '/roulette', icon: 'wheel',
    modes: 'Against the house',
    blurb: 'Single-zero wheel with every inside and outside bet.',
  },
  {
    id: 'craps', name: 'Craps', category: 'casino', ready: false, path: '/craps', icon: 'dice',
    modes: 'Against the house',
    blurb: 'Pass line, come bets, odds and the field.',
  },
  {
    id: 'slots', name: 'Slots', category: 'casino', ready: false, path: '/slots', icon: 'reels',
    modes: 'Solo',
    blurb: 'Three reels of wasteland junk with a published paytable.',
  },
  {
    id: 'connect4', name: 'Connect Four', category: 'board', ready: false, path: '/connect4', icon: 'discs',
    modes: 'Against the AI or hot-seat',
    blurb: 'Drop discs, line up four.',
  },
  {
    id: 'checkers', name: 'Checkers', category: 'board', ready: false, path: '/checkers', icon: 'grid',
    modes: 'Against the AI or hot-seat',
    blurb: 'American rules: forced captures, multi-jumps and kings.',
  },
  {
    id: 'reversi', name: 'Reversi', category: 'board', ready: false, path: '/reversi', icon: 'discs',
    modes: 'Against the AI or hot-seat',
    blurb: 'Flank and flip. Corners win games.',
  },
  {
    id: 'battleship', name: 'Battleship', category: 'board', ready: false, path: '/battleship', icon: 'ships',
    modes: 'Against the AI or hot-seat',
    blurb: 'Hide your fleet, then hunt theirs.',
  },
  {
    id: 'tictactoe', name: 'Tic-Tac-Toe', category: 'board', ready: false, path: '/tictactoe', icon: 'xo',
    modes: 'Against the AI or hot-seat',
    blurb: 'Classic 3×3, or Ultimate on a 9×9 board.',
  },
]

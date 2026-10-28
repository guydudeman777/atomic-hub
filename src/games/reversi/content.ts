/**
 * Reversi content: the opponent ladder. Each one plays to their own
 * profile (ai.ts) and talks their own way (banter.ts). Beat one to unlock
 * the next.
 */

import type { AiProfile } from './ai'
import type { Banter } from './banter'

export type Level = 'easy' | 'normal' | 'hard' | 'expert'

export const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard', expert: 'Expert' }

export interface Opponent {
  id: string
  name: string
  /** Two letters for the portrait. */
  initials: string
  /** Portrait color. */
  color: string
  blurb: string
  level: Level
  profile: AiProfile
  /** What they say when the game ends. */
  lines: { win: string; lose: string; draw: string }
  banter: Banter
}

export const OPPONENTS: readonly Opponent[] = [
  {
    id: 'buddy',
    name: 'Buddy Novak',
    initials: 'BN',
    color: '#e2622b',
    blurb: 'The paperboy from down the street. Grabs every disc he can reach and never once looks at the corners.',
    level: 'easy',
    profile: { judge: 'greedy', depth: 1, timeMs: 100, endgame: 0, noise: 1.5, blunder: 0.12 },
    lines: {
      win: 'Gee whiz, I won! Wait till I tell my mom.',
      lose: 'Aw, nuts. Best two out of three?',
      draw: 'A tie? Is that even allowed?',
    },
    banter: {
      chattiness: 1.2,
      lines: {
        hello: ['Swell! I’ll take whatever color you don’t want.', 'My dad says I’m a natural. Let’s go!', 'I gotta be home by supper, so let’s play fast.'],
        youTookCorner: ['Hey, I was gonna go there.', 'What’s so great about {square} anyway?', 'Corners, corners. Everybody wants a corner.'],
        iTookCorner: ['Ha! Got a corner. Is that good?', 'I’ll take {square}, thank you very much.', 'Lookit me, I’m in the corner.'],
        youPassed: ['You’re stuck? Ha! My turn again!', 'No moves? Gosh, that’s rough.', 'Two turns in a row for Buddy!'],
        iPassed: ['Huh. I can’t go anywhere.', 'Pass, I guess. That’s a dumb rule.', 'How’d you do that? I got nothing.'],
        youSwept: ['Hey! Put those back!', 'Holy cow, that’s a lot of flipping.', 'Aw, you got a whole bunch.'],
        iSwept: ['Look at ’em all flip! Neato!', 'Wowee, that’s like six!', 'Flip, flip, flip, flip!'],
        youPlayed: ['Hmm. Okay.', 'Is that a good one?'],
        iPlayed: ['I’ll go here. No, here.', 'Easy peasy.'],
      },
    },
  },
  {
    id: 'marge',
    name: 'Aunt Marge',
    initials: 'AM',
    color: '#2f9a96',
    blurb: 'Plays every Sunday after the pot roast, with the radio on. She knows the corners are good and keeps her eye on them.',
    level: 'normal',
    profile: { judge: 'positional', depth: 2, timeMs: 150, endgame: 6, noise: 12, blunder: 0.04 },
    lines: {
      win: 'Oh, that was fun, dear. Have another cookie.',
      lose: 'Well, aren’t you clever! Your uncle never beats me.',
      draw: 'Even-steven. Just like the cake slices.',
    },
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Sit down, dear. Do you want black or white? I don’t mind.', 'Mind the coasters. Now, let’s have a game.', 'Your uncle’s asleep in his chair, so it’s just us.'],
        youTookCorner: ['Ooh, you found the corner. Good for you.', 'Now that’s what I call a move.', 'Well, there goes {square}. Shame.'],
        iTookCorner: ['I’ll just tuck into {square}, if you don’t mind.', 'Corners are like the good china, dear. Keep them.', 'There. Nice and snug in the corner.'],
        youPassed: ['Nowhere to go? Take your time. I’ll go again.', 'Oh dear, you’re all boxed in.', 'My turn again, then. Don’t sulk.'],
        iPassed: ['Hm, nothing for me. Your go, dear.', 'I’m all out of moves. Isn’t that something.', 'You’ve got me cornered. I pass.'],
        youSwept: ['My, my. That’s quite a haul.', 'Goodness, look at them all go.', 'You’re flipping my discs like pancakes.'],
        iSwept: ['Oh, look at that. A whole row.', 'That’s a nice batch, isn’t it.', 'Like flipping flapjacks.'],
        youPlayed: ['Mm-hm.', 'Interesting choice, dear.'],
        iPlayed: ['Let’s see now.', 'This one, I think.'],
      },
    },
  },
  {
    id: 'fairbanks',
    name: 'Mr. Fairbanks',
    initials: 'HF',
    color: '#4d6d9a',
    blurb: 'The accountant next door. Counts every move you have and makes sure you have fewer, then closes the books on the corners.',
    level: 'hard',
    profile: { judge: 'full', depth: 2, timeMs: 200, endgame: 8, noise: 10, blunder: 0.03 },
    lines: {
      win: 'The figures never lie. Good evening.',
      lose: 'A clerical error on my part. Well played.',
      draw: 'Balanced to the penny. How satisfying.',
    },
    banter: {
      chattiness: 0.8,
      lines: {
        hello: ['Good evening. I’ve sharpened my pencil.', 'Shall we? I have the evening blocked out.', 'Black moves first. It’s in the regulations.'],
        youTookCorner: ['Hm. {square}. I’ll make a note of that.', 'An asset I had hoped to acquire.', 'That corner was on my books.'],
        iTookCorner: ['{square}. A sound long-term investment.', 'Corners don’t depreciate.', 'I’ll be holding that one to maturity.'],
        youPassed: ['You appear to be out of options.', 'No moves. Your account is overdrawn.', 'I’ll take that turn, since you aren’t using it.'],
        iPassed: ['I have no move. Proceed.', 'A temporary shortfall. Go ahead.', 'Nothing in the ledger for me. Your turn.'],
        youSwept: ['That’s a sizable transfer.', 'Discs are a poor measure of wealth, you know.', 'Spend them while you can.'],
        iSwept: ['A modest windfall.', 'The numbers rarely stay this lopsided.', 'Carry the six.'],
        youPlayed: ['Noted.', 'Hm.'],
        iPlayed: ['Accounted for.', 'As projected.'],
      },
    },
  },
  {
    id: 'lund',
    name: 'Dr. Ida Lund',
    initials: 'IL',
    color: '#8a3f7a',
    blurb: 'A physicist from the laboratory up on the hill. She reads the board ten moves deep and has solved the ending before you’ve noticed it started.',
    level: 'expert',
    profile: { judge: 'full', depth: 10, timeMs: 260, endgame: 14, noise: 0, blunder: 0 },
    lines: {
      win: 'A predictable result, I’m afraid. Come back soon.',
      lose: 'Remarkable. I’ll have to check my calculations.',
      draw: 'Perfect equilibrium. How elegant.',
    },
    banter: {
      chattiness: 0.7,
      lines: {
        hello: ['Good evening. I find this game soothing after work.', 'Sixty-four squares, two colors. Beautifully simple.', 'Please, go ahead and think. I don’t mind waiting.'],
        youTookCorner: ['{square}. Correct.', 'You’ve been reading up. Good.', 'Ah. I had hoped you wouldn’t see that.'],
        iTookCorner: ['{square}, thank you.', 'The corners decide it, more often than not.', 'Stable as lead.'],
        youPassed: ['No legal moves. That was rather the point.', 'You’ll find nothing there. I go again.', 'Mobility, you see. You’ve run out of it.'],
        iPassed: ['A pass. Interesting.', 'You’ve squeezed me. Well done.', 'Nothing for me. Carry on.'],
        youSwept: ['Many discs. Not necessarily a good thing.', 'Count them later. Count moves now.', 'Enjoy them.'],
        iSwept: ['That couldn’t be helped.', 'Too many, really. Never mind.', 'The board tips.'],
        youPlayed: ['Hm.', 'I see.'],
        iPlayed: ['Mm.', 'There.'],
      },
    },
  },
]

export const opponentById = (id: string): Opponent | undefined => OPPONENTS.find((o) => o.id === id)

/** The first opponent is always open; each after that once you've beaten the one before. */
export function isUnlocked(index: number, beaten: Readonly<Record<string, number>>): boolean {
  return index === 0 || (beaten[OPPONENTS[index - 1].id] ?? 0) > 0
}

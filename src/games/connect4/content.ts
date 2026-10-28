/**
 * Connect Four content: the opponent ladder, four folks who work the
 * boardwalk midway. Each one plays to their own profile (ai.ts) and talks
 * their own way (banter.ts). Beat one to unlock the next.
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
  /** Where on the midway they work. */
  booth: string
  blurb: string
  level: Level
  profile: AiProfile
  /** What they say when the game ends. */
  lines: { win: string; lose: string; draw: string }
  banter: Banter
}

export const OPPONENTS: readonly Opponent[] = [
  {
    id: 'skeeter',
    name: 'Skeeter Malone',
    initials: 'SM',
    color: '#e0802a',
    booth: 'The ring toss',
    blurb: 'Minds the ring toss for his uncle and sneaks off to play whenever the boss isn’t looking. Drops checkers wherever his hand happens to be.',
    level: 'easy',
    profile: { depth: 2, timeMs: 80, endgame: 0, noise: 40, blunder: 0.15 },
    lines: {
      win: 'I won! I won! Hey, Uncle Gus, I won!',
      lose: 'Aw, rats. You want a ring toss? On the house.',
      draw: 'Nobody won? That’s no fun.',
    },
    banter: {
      chattiness: 1.2,
      lines: {
        hello: ['Hiya! Wanna play? I’ll be whatever color you don’t want.', 'Quick, before my uncle sees I left the booth.', 'I’m real good at this. Mostly.'],
        youBlocked: ['Hey! I was gonna go there!', 'Aw, you saw that one.', 'How’d you know?'],
        iBlocked: ['Nope! Not on my watch.', 'Ha! Blocked ya.', 'I saw that one. I’m not a baby.'],
        youThreat: ['Uh oh. Is that three?', 'Wait, wait, lemme look.', 'Gee, that’s a lot of yours in a row.'],
        iThreat: ['Lookit! Three in a row!', 'One more in column {column} and I win. I think.', 'Ooh, I’m gonna get you now.'],
        youCenter: ['The middle? Everybody always goes in the middle.', 'Why’s everybody like the middle so much?'],
        iCenter: ['Middle’s mine!', 'Plop. Right in the middle.'],
        youPlayed: ['Hmm.', 'Okay, okay.'],
        iPlayed: ['Here goes nothing.', 'Eeny, meeny, miny… there.'],
      },
    },
  },
  {
    id: 'mabel',
    name: 'Mabel Pruitt',
    initials: 'MP',
    color: '#d9569a',
    booth: 'The cotton-candy cart',
    blurb: 'Spins cotton candy at the cart by the carousel and plays between customers, sugar on her fingers. She blocks what she sees coming.',
    level: 'normal',
    profile: { depth: 4, timeMs: 120, endgame: 0, noise: 14, blunder: 0.04 },
    lines: {
      win: 'There now, sugar. Have a cone on me.',
      lose: 'Well, aren’t you a sharp one! Take a pink one for the road.',
      draw: 'All filled up and nobody won. Like my cart on a Sunday.',
    },
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Sit down, sugar. Mind the sticky bits.', 'Slow night at the cart. Let’s have a game.', 'I’ll play you till the next customer comes along.'],
        youBlocked: ['Oh, you spotted that. Shame.', 'Well, phooey. That was my good one.', 'Right where I wanted to go, too.'],
        iBlocked: ['Not so fast, dear.', 'I saw you lining those up.', 'Nice try, sugar.'],
        youThreat: ['My, that’s a nice little row you’ve got.', 'I see what you’re up to.', 'Hmm. I’ll have to watch that.'],
        iThreat: ['Three of mine, all in a row. Mind that.', 'Better keep an eye on column {column}, dear.', 'There. Your move, sugar.'],
        youCenter: ['The middle. Somebody raised you right.', 'Straight down the middle, like a good cone.'],
        iCenter: ['I always start in the middle. It’s the sweet spot.', 'Middle for me, thank you.'],
        youPlayed: ['Mm-hm.', 'Take your time.'],
        iPlayed: ['Let’s see now…', 'This one.'],
      },
    },
  },
  {
    id: 'vic',
    name: 'Vic Sharpe',
    initials: 'VS',
    color: '#3f8f5a',
    booth: 'Guess your weight',
    blurb: 'The pitchman at the guess-your-weight stand. He reads people for a living, and reads the rack two threats ahead.',
    level: 'hard',
    profile: { depth: 8, timeMs: 200, endgame: 12, noise: 4, blunder: 0.01 },
    lines: {
      win: 'Step right up, folks, and see the champ! That’s me.',
      lose: 'Well, I’ll be. Nobody beats Vic. Don’t tell the crowd.',
      draw: 'A tie! The house keeps its money, and so do you.',
    },
    banter: {
      chattiness: 0.9,
      lines: {
        hello: ['Step right up! Four in a row wins the big bear. Nobody wins the big bear.', 'You look like a thinker. I can always tell.', 'Ladies and gentlemen, we have a challenger!'],
        youBlocked: ['Ooh, the challenger’s got eyes!', 'You saw it. Lucky guess, friend.', 'Somebody’s played this before.'],
        iBlocked: ['Not tonight, friend.', 'I had you pegged from the start.', 'Close, but no cigar.'],
        youThreat: ['Now that’s a threat. I respect a threat.', 'The challenger’s cooking!', 'Hm. You’re better than you look.'],
        iThreat: ['Keep your eye on column {column}, folks!', 'That’s what we in the business call a setup.', 'Tick, tock, friend.'],
        youCenter: ['Center column. A pro move.', 'Right down the middle. Smart money.'],
        iCenter: ['The middle, where the money is.', 'Center column. Old Vic never misses it.'],
        youPlayed: ['Mm.', 'Interesting.'],
        iPlayed: ['And there it goes.', 'Watch closely now.'],
      },
    },
  },
  {
    id: 'zora',
    name: 'Madame Zora',
    initials: 'MZ',
    color: '#7a46b0',
    booth: 'The fortune teller’s tent',
    blurb: 'Reads palms in the purple tent past the funhouse. She sees every way the rack can fill, and she’s seen how your game ends.',
    level: 'expert',
    profile: { depth: 42, timeMs: 350, endgame: 24, noise: 0, blunder: 0 },
    lines: {
      win: 'As the cards foretold. Cross my palm on your way out.',
      lose: 'The spirits were… unclear tonight. Remarkable.',
      draw: 'Neither of us, then. The cards said as much.',
    },
    banter: {
      chattiness: 0.7,
      lines: {
        hello: ['Sit, sit. I knew you were coming.', 'The crystal is cloudy tonight. Let us play anyway.', 'Red or yellow? It makes no difference to the spirits.'],
        youBlocked: ['Ah. You saw it too.', 'The spirits favor you, for now.', 'Hmm. Not in this future, then.'],
        iBlocked: ['I saw that move before you did.', 'No, dear. Not there.', 'The future doesn’t go that way.'],
        youThreat: ['A threat. Interesting.', 'You are learning. Good.', 'I see it. I saw it an hour ago.'],
        iThreat: ['Look to column {column}.', 'It is written.', 'The lines are drawing together.'],
        youCenter: ['The center. Of course.', 'The middle column. Every fate begins there.'],
        iCenter: ['The center, always.', 'Here, where the lines meet.'],
        youPlayed: ['Mm.', 'I see.'],
        iPlayed: ['There.', 'So.'],
      },
    },
  },
]

export const opponentById = (id: string): Opponent | undefined => OPPONENTS.find((o) => o.id === id)

/** The first opponent is always open; each after that once you've beaten the one before. */
export function isUnlocked(index: number, beaten: Readonly<Record<string, number>>): boolean {
  return index === 0 || (beaten[OPPONENTS[index - 1].id] ?? 0) > 0
}

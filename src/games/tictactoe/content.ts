/**
 * Tic-Tac-Toe content: the regulars at the Starlite Diner, from the
 * paperboy to the old man at the end of the counter. Each one plays to
 * their own profile (ai.ts) and talks their own way (banter.ts). Beat one,
 * at either game, to get a game with the next.
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
    id: 'skip',
    name: 'Skip Dawson',
    initials: 'SD',
    color: '#d08a17',
    blurb: 'Delivers the evening edition and spends his tips on a malted. Plays fast, talks faster, and forgets to look where you’re going.',
    level: 'easy',
    profile: {
      classic: { seesWin: 0.8, seesBlock: 0.5, lapse: 1 },
      ultimate: { playouts: 150, timeMs: 400, smart: false, blunder: 0.25 },
    },
    lines: {
      win: 'Ha! Wait till the guys on my route hear about this!',
      lose: 'Aw, nuts. Double or nothing? I’ve got a nickel.',
      draw: 'Cat’s game! Hey, how come it’s called that?',
    },
    banter: {
      chattiness: 1.2,
      lines: {
        hello: ['Hey! You want X or O? Doesn’t matter, I’ll win anyway.', 'I got ten minutes before my route. Let’s play!', 'Gimme the grease pencil. No, wait, you go.'],
        youForked: ['Hey, two ways? That’s not fair!', 'Wait, which one do I block?', 'Aw, jeez. You got me coming and going.'],
        iForked: ['Two ways to win! Did I do that on purpose? Sure!', 'Look at that, I got two lines going!', 'Ha! Block that, and that!'],
        youBlocked: ['Hey, I was gonna go there!', 'Aw, you saw it.', 'Rats. I almost had you.'],
        iBlocked: ['Nope! Saw that one coming.', 'Not on my watch, pal.', 'Ha, blocked ya!'],
        youTookGrid: ['Hey, that one was mine!', 'Aw, you got {grid}.', 'Okay, okay, you can have that one.'],
        iTookGrid: ['I got {grid}! Is that good?', 'Three in a row! I win! Wait, there’s more?', 'Mine, mine, mine.'],
        youThreatened: ['Uh oh.', 'Hang on, lemme look.', 'Hmm. That’s two of yours.'],
        iThreatened: ['Two in a row! Ha!', 'I’m gonna get three, just watch.', 'Look at me go!'],
        youGotFree: ['Wait, you can go anywhere now? Since when?', 'Aw, I sent you to a full one, huh?', 'Oops. Go wherever, I guess.'],
        iGotFree: ['I can go anywhere? Swell!', 'Free country! I’ll go… here.', 'Ooh, so many choices.'],
        youPlayed: ['Huh. Okay.', 'Is that a good one?'],
        iPlayed: ['I’ll go here. No, here.', 'Easy peasy.'],
      },
    },
  },
  {
    id: 'bev',
    name: 'Bev Kowalski',
    initials: 'BK',
    color: '#cf5c86',
    blurb: 'Has worked the counter since the place opened. Plays between refills with the coffee pot in her other hand, and sees more than she lets on.',
    level: 'normal',
    profile: {
      classic: { seesWin: 1, seesBlock: 0.85, lapse: 0.4 },
      ultimate: { playouts: 1000, timeMs: 600, smart: false, blunder: 0.08 },
    },
    lines: {
      win: 'That’s the game, sugar. More coffee?',
      lose: 'Well, look at you. Pie’s on the house.',
      draw: 'Cat’s game. The cat always wins in here.',
    },
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Scoot in, hon. I’ve got five minutes before the supper rush.', 'Coffee’s fresh. You want X or O? I don’t mind.', 'Let me just set the pot down. Okay, go ahead.'],
        youForked: ['Well, aren’t you a sly one.', 'Two ways at once? Somebody’s been practicing.', 'Oh, you rascal.'],
        iForked: ['Two ways to win, sugar. Pick one.', 'Fifteen years of slow nights, hon. I know this one.', 'Mm-hm. You see what I did there?'],
        youBlocked: ['Oh, you caught that. Good for you.', 'Well, darn.', 'Nothing gets past you, does it?'],
        iBlocked: ['Not so fast, hon.', 'I saw that from the kitchen.', 'Uh-uh. Not today.'],
        youTookGrid: ['There goes {grid}. Shame.', 'All right, you can keep that one.', 'Nicely done, sugar.'],
        iTookGrid: ['I’ll just tuck {grid} in my apron, thanks.', 'That one’s mine, hon.', 'Three in a row, like plates on my arm.'],
        youThreatened: ['Hm. I see you.', 'Two in a row, is it?', 'Don’t think I didn’t notice that.'],
        iThreatened: ['Watch that line, hon.', 'Two in a row. Your move.', 'Better look sharp, sugar.'],
        youGotFree: ['Oh, I sent you to a closed one. Go where you like.', 'Anywhere you want, hon. My mistake.', 'Well, the whole menu’s open for you now.'],
        iGotFree: ['Anywhere I like? Don’t mind if I do.', 'Oh, you’ve let me loose now.', 'The whole board? Thank you, sugar.'],
        youPlayed: ['Mm-hm.', 'Interesting.'],
        iPlayed: ['Let’s see now.', 'This one, I think.'],
      },
    },
  },
  {
    id: 'gus',
    name: 'Gus Petrakis',
    initials: 'GP',
    color: '#3d7c6c',
    blurb: 'Runs the grill like a battleship and plays the same way: fast, loud and right nearly every time. He’ll leave a burger on the griddle to finish a game.',
    level: 'hard',
    profile: {
      classic: { seesWin: 1, seesBlock: 1, lapse: 0.15 },
      ultimate: { playouts: 5000, timeMs: 900, smart: true, blunder: 0.02 },
    },
    lines: {
      win: 'Order up! Better luck next time, friend.',
      lose: 'Hah! You beat Gus. I put your picture by the register.',
      draw: 'Even. Like a good grilled cheese, both sides the same.',
    },
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Gus has two minutes. The fries can wait.', 'Sit, sit. You go first, Gus is generous.', 'I play this game since I was a boy in Thessaloniki. You ready?'],
        youForked: ['Opa! Where you learn that?', 'Two lines. Gus is in trouble.', 'Ach. You got me in the pan.'],
        iForked: ['Two ways! Order up!', 'Gus cooks two dishes at once, no problem.', 'Now you see. Gus is the chef.'],
        youBlocked: ['Hah, you see it. Smart.', 'Okay, okay. Not that way.', 'You watch the grill, I see.'],
        iBlocked: ['No, no, no. Gus sees everything.', 'Ha! Not on my griddle.', 'You think Gus doesn’t look?'],
        youTookGrid: ['{grid}, gone. Like the meatloaf on Tuesday.', 'Okay. That one you can have.', 'Hm. Gus is not happy.'],
        iTookGrid: ['{grid} is Gus’s. Order up!', 'Flip it, plate it, done.', 'One more for the chef.'],
        youThreatened: ['Gus sees you.', 'Two in a row. I know, I know.', 'Hm. Careful, friend.'],
        iThreatened: ['Two for Gus. You see it?', 'Hot plate, friend. Watch your hands.', 'One more and I win.'],
        youGotFree: ['Ach, Gus sent you to a full one.', 'Go anywhere. Gus makes a mistake once a year.', 'Okay, the whole kitchen is yours.'],
        iGotFree: ['Anywhere? Gus says thank you.', 'You let the chef loose. Bad idea.', 'Hah, the whole menu!'],
        youPlayed: ['Mm.', 'Okay.'],
        iPlayed: ['Bang.', 'There.'],
      },
    },
  },
  {
    id: 'whitlock',
    name: 'Ambrose Whitlock',
    initials: 'AW',
    color: '#4a5a88',
    blurb:
      'Has sat at the end of the counter since the diner was a lunch wagon, and has never lost a game of Classic. Nobody can: perfect play always holds a draw, and he plays nothing else. Hold him to a cat’s game and he’ll tip his hat. To beat him, you’ll need Ultimate.',
    level: 'expert',
    profile: {
      classic: { seesWin: 1, seesBlock: 1, lapse: 0 },
      ultimate: { playouts: 30000, timeMs: 1500, smart: true, blunder: 0 },
    },
    lines: {
      win: 'Sixty years at this counter. Don’t take it hard.',
      lose: 'Well, I’ll be. First time since Coolidge. Shake my hand.',
      draw: 'A cat’s game, and a well-played one. That’s the best anybody does.',
    },
    banter: {
      chattiness: 0.8,
      lines: {
        hello: ['Pull up a stool. I’ve got all night and a bottomless cup.', 'I learned this game on a troop ship in nineteen and eighteen. Your move.', 'Mind the pie, it’s mine. Now, X or O?'],
        youForked: ['My, my. Haven’t seen that in years.', 'Two ways. Well, I’ll be.', 'You’ve been studying, haven’t you.'],
        iForked: ['Two ways. That’s the whole trick.', 'There it is. Saw it coming since your first mark.', 'One of those lines is mine. Pick.'],
        youBlocked: ['Correct.', 'Good. You’re paying attention.', 'Ah. I’d hoped you’d miss that.'],
        iBlocked: ['No, I don’t think so.', 'Not that one.', 'You’ll have to do better than that.'],
        youTookGrid: ['{grid}. Fair enough.', 'Well taken.', 'Hm. That one’ll matter.'],
        iTookGrid: ['{grid}, thank you.', 'That one’s spoken for.', 'Mark it down.'],
        youThreatened: ['I see it.', 'Mm-hm.', 'Patience. I see it.'],
        iThreatened: ['Two in a row. Mind it.', 'Your move. Make it a good one.', 'There’s a hole in your fence, friend.'],
        youGotFree: ['Go anywhere you please. I meant to do that.', 'The run of the board. Use it well.', 'Go on, then.'],
        iGotFree: ['Anywhere at all? Kind of you.', 'You’ve turned me loose. Pity.', 'Ah. Thank you.'],
        youPlayed: ['Hm.', 'I see.'],
        iPlayed: ['Mm.', 'There.'],
      },
    },
  },
]

export const opponentById = (id: string): Opponent | undefined => OPPONENTS.find((o) => o.id === id)

/** The first opponent is always open; each after that once you've beaten the one before, at either game. */
export function isUnlocked(index: number, beaten: Readonly<Record<string, number>>): boolean {
  return index === 0 || (beaten[OPPONENTS[index - 1].id] ?? 0) > 0
}

/**
 * Blackjack content: the tables, their dealers, and the regulars who play
 * at them.
 */

import { type Rng, shuffle } from '../../core/rng'
import type { Banter } from './banter'
import type { BotStyle } from './bots'
import type { Limits } from './engine'
import type { Temper } from './tilt'

export interface Stakes {
  id: string
  name: string
  blurb: string
  limits: Limits
  /** Chip values in the rack, smallest first. */
  chips: readonly number[]
  dealer: Dealer
}

export interface Dealer {
  name: string
  /** What they say as you sit down. */
  hello: readonly string[]
}

export const STAKES: readonly Stakes[] = [
  {
    id: 'low',
    name: 'Low limit',
    blurb: 'The friendly table by the lounge. Good for learning, and for stretching a stack.',
    limits: { min: 5, max: 100 },
    chips: [1, 5, 25, 100],
    dealer: { name: 'Dot', hello: ['Evening, hon. Bets in the circle when you’re ready.', 'Pull up a stool. Five caps gets you in.', 'Welcome to the lounge table. Good luck tonight.'] },
  },
  {
    id: 'main',
    name: 'Main floor',
    blurb: 'Under the big chandelier, where most of the caps change hands.',
    limits: { min: 25, max: 500 },
    chips: [5, 25, 100, 500],
    dealer: { name: 'Vera', hello: ['Good evening. Table minimum is twenty-five.', 'Welcome to the main floor. Place your bets.', 'Evening. Cards are fresh and so is the coffee.'] },
  },
  {
    id: 'high',
    name: 'High limit',
    blurb: 'Behind the velvet rope. Quiet, carpeted, and very expensive.',
    limits: { min: 100, max: 2000 },
    chips: [25, 100, 500, 1000],
    dealer: { name: 'Mr. Silk', hello: ['Good evening. The salon is yours.', 'Welcome. One hundred to two thousand, as posted.', 'A pleasure. Shall we begin?'] },
  },
]

export const stakesById = (id: string): Stakes => STAKES.find((s) => s.id === id) ?? STAKES[0]

export type TableMode = 'full' | 'heads-up'

/** Five spots on the felt. You sit in the middle one; first base is spot 0, on your right. */
export const SPOTS = 5
export const YOUR_SPOT = 2

export interface Regular {
  id: string
  name: string
  blurb: string
  style: BotStyle
  /** Buy-in, in table minimums. */
  bankroll: number
  /** Portrait color. */
  color: string
  /** How they take a beating (tilt.ts). */
  temper: Temper
  banter: Banter
}

export const REGULARS: readonly Regular[] = [
  {
    id: 'quill',
    name: 'Professor Quill',
    blurb: 'Taught probability before the bombs. Plays every hand by the book, and will tell you which page.',
    style: { play: 'book', betting: 'flat', insurance: 'never', unit: 2 },
    bankroll: 60,
    color: '#4a5a8a',
    temper: { slam: 0, curse: 0.35, quit: 0 },
    banter: {
      chattiness: 1.1,
      lines: {
        hello: ['Ah, a new student. Sit, sit.', 'Good evening. Mind the math and the math minds you.', 'Splendid. I do prefer a full table.'],
        goodbye: ['The variance, it seems, has spoken. Good night.', 'Even the book has bad nights. Farewell.'],
        myCurse: ['Oh, bollocks.', 'Well, that’s statistically shit.', 'Damn and blast.', 'Bugger. Correct play, though.'],
        dealerBlackjack: ['A one in twenty-one chance. Every time.', 'Nothing to be done about that one.'],
        yourBustCard: ['Statistically defensible. Emotionally, less so.', 'Hm. That one would have broken her.'],
        yourSplitTens: ['Splitting twenty? I’ll pretend I didn’t see that.', 'My dear, that is a twenty. You had a twenty.', 'Page one of the book: never split tens.'],
        myBlackjack: ['Three to two. The sweetest ratio there is.', 'Expected, eventually.'],
        yourBlackjack: ['Well dealt.', 'Three to two. Lovely.'],
        dealerBust: ['And that is why we stand on stiffs against a six.', 'The house edge, briefly suspended.'],
        dealerDrewOut: ['She’ll bust about four times in ten from there. Not this time.', 'Unlucky. The numbers were with us.'],
        myDoubleWon: ['Eleven against a five. Textbook.', 'The book pays, if you let it.'],
        yourDoubleWon: ['A well-timed double. Excellent.', 'Correct and profitable. My favorite kind of play.'],
        myDoubleLost: ['Correct play. Incorrect card.', 'Still the right double. I’d make it again.'],
        shuffle: ['A fresh shoe. Fifty-two times six possibilities.', 'Reshuffled. The slate is clean.'],
        myBust: ['Hitting was still correct.', 'Sixteen against a ten. A tragedy either way.'],
        yourBust: ['It happens to the best of us.', 'Hm. The right hit, though.'],
      },
    },
  },
  {
    id: 'lou',
    name: 'Lucky Lou',
    blurb: 'Rubs a bent bottle cap before every hand. Never hits a twelve. Always takes insurance.',
    style: { play: 'never-bust', betting: 'flat', insurance: 'always', unit: 1 },
    bankroll: 40,
    color: '#3d7a4c',
    temper: { slam: 0.65, curse: 0.85, quit: 0.35 },
    banter: {
      chattiness: 1.3,
      lines: {
        hello: ['Hey, new blood! Rub the cap for luck.', 'Sit down, sit down. This seat’s been warm all night.', 'You feel lucky? I feel lucky.'],
        goodbye: ['That’s it, cap’s gone cold. I’m out.', 'Gotta go see a guy about a horseshoe. Later.'],
        mySlam: ['Son of a bitch!', 'Are you fucking kidding me?!', 'God damn it, every single time!', 'This cap is a fucking liar!'],
        myCurse: ['Shit.', 'Aw, hell.', 'Damn cap’s gone cold.', 'Oh, come the fuck on.'],
        rageQuit: ['That’s it. This shoe is fucking cursed. I’m out.', 'Screw this table. No offense, hon.', 'I’m gonna go find a slot machine that loves me.'],
        kickedOut: ['Hey! Hands off! I’m a paying customer!', 'Okay, okay, I’m going! Jeez!', 'You’ll regret this when my luck turns!'],
        dealerBlackjack: ['Aw, come on! I insured it and everything.', 'I knew it. I could feel it in my cap.'],
        yourBustCard: ['You took the dealer’s bust card!', 'Pal. Pal! That was her card! She was gonna bust!', 'Why’d you hit that? That card was hers!'],
        yourSplitTens: ['You’re splitting tens? You’re gonna jinx the whole table!', 'Oh no. Oh no no no. Not the tens.'],
        myBlackjack: ['Ha! The cap never lies!', 'Blackjack, baby! Rub it for luck!'],
        yourBlackjack: ['Now that’s a hand! Rub the cap!', 'See? This table’s hot!'],
        dealerBust: ['Bust! Bust! Everybody gets paid!', 'Told ya! Never hit, let her bust!', 'That’s how we do it!'],
        dealerDrewOut: ['Unbelievable. Every time.', 'She’s got a horseshoe in that shoe.'],
        myDoubleWon: ['Doubled and delivered!', 'Pay the man!'],
        yourDoubleWon: ['Look at you, doubling down!', 'Big money!'],
        myDoubleLost: ['That’s the last time I double. Till next time.', 'Ugh. Should’ve rubbed the cap twice.'],
        shuffle: ['New shoe! Lucky shoe, I can feel it.', 'Fresh cards. Rub the cap, everybody.'],
        myBust: ['How’d I bust? I never bust!', 'That ain’t supposed to happen.'],
        yourBust: ['Ooh. Shoulda stayed, pal.', 'See, that’s why I never hit.'],
      },
    },
  },
  {
    id: 'dixie',
    name: 'Dixie Rae',
    blurb: 'Sings in the lounge between sets. Doubles anything that moves and lets her wins ride.',
    style: { play: 'wild', betting: 'parlay', insurance: 'even-money', unit: 2 },
    bankroll: 50,
    color: '#a8385f',
    temper: { slam: 0.3, curse: 0.6, quit: 0.15 },
    banter: {
      chattiness: 1.2,
      lines: {
        hello: ['Well, hey there, sugar. Room for one more.', 'Ooh, company! Deal us in, darlin’.', 'Second set’s not till midnight. Let’s play.'],
        goodbye: ['That’s my cue, darlings. Kisses.', 'Back to the stage before I lose my shoes, too.'],
        mySlam: ['Son of a BITCH, sugar!', 'Well, shit! Somebody get me a drink!', 'Oh, hell no, darlin’.'],
        myCurse: ['Well, damn.', 'Shit on a shingle.', 'Ain’t that a bitch.'],
        rageQuit: ['I’ve got a set to sing, and this table’s a goddamn funeral.', 'I’m off, darlings. This dealer’s colder than my ex.'],
        kickedOut: ['I can walk myself out, thank you, sugar!', 'Watch the dress! This is sequins!'],
        dealerBlackjack: ['Well, isn’t she the belle of the ball.', 'Rude!'],
        yourBustCard: ['Sugar, I think that one was meant for her.', 'Oh, honey. That was her bust card.'],
        yourSplitTens: ['Now that’s my kind of crazy!', 'Splitting tens? Darling, marry me.'],
        myBlackjack: ['Blackjack! Let it ride!', 'Ooh, somebody buy me a drink!'],
        yourBlackjack: ['Look at you, sugar!', 'Ooh, blackjack! Lucky lucky.'],
        dealerBust: ['Whoo! Drinks are on the house!', 'Bust! Now that’s music.'],
        dealerDrewOut: ['Well, that’s just mean.', 'She draws like she sings. Too well.'],
        myDoubleWon: ['Double or nothing, and it’s double!', 'Mama needs new shoes!'],
        yourDoubleWon: ['That’s how you do it, darlin’!', 'Ooh, brave and paid.'],
        myDoubleLost: ['Easy come, easy go, sugar.', 'Worth it.'],
        shuffle: ['Fresh deck, fresh start!', 'New shoe. I love new shoes.'],
        myBust: ['Oopsie.', 'Well, that was a little much.'],
        yourBust: ['Aw, sugar.', 'Next one’s yours, darlin’.'],
      },
    },
  },
  {
    id: 'grey',
    name: 'Mr. Grey',
    blurb: 'Says little, tips nothing, and bets big when the shoe turns his way. The pit boss keeps an eye on him.',
    style: { play: 'counter', betting: 'spread', insurance: 'count', unit: 1 },
    bankroll: 100,
    color: '#5c5f66',
    temper: { slam: 0, curse: 0.1, quit: 0 },
    banter: {
      chattiness: 0.55,
      lines: {
        hello: ['Evening.', 'Mm.', 'Don’t mind me.'],
        goodbye: ['Bad shoe. Goodnight.', 'Coloring up.'],
        myCurse: ['Shit.', 'Hm. Damn.'],
        kickedOut: ['Fine. I was leaving anyway.', 'Give my regards to the pit boss.', 'Bad shoe anyway.'],
        dealerBlackjack: ['Mm.', 'Expected.'],
        yourSplitTens: ['Bold.', 'Hm.'],
        myBlackjack: ['Good.', 'Thank you.'],
        dealerBust: ['Good.'],
        myDoubleWon: ['Fine.'],
        hotShoe: ['Feels like a good shoe.', 'I like this shoe.', 'Getting interesting.'],
        shuffle: ['Fresh shoe. Of course.', 'Right when it got good.'],
      },
    },
  },
  {
    id: 'sal',
    name: 'Big Sal',
    blurb: 'Owns half a junkyard and plays like the dealer: draws to seventeen, never doubles, bets heavy.',
    style: { play: 'mimic', betting: 'flat', insurance: 'never', unit: 4 },
    bankroll: 80,
    color: '#8a5a2b',
    temper: { slam: 0.85, curse: 0.75, quit: 0.25 },
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Make room, make room. Sal’s here.', 'Who ordered the big money?', 'Dealer, sweetheart, cards. Now.'],
        goodbye: ['Eh, I got more at the yard. See ya.', 'This table’s rigged. I’m goin’ to the bar.'],
        mySlam: ['Oh, for fuck’s sake!', 'Who the hell shuffled this shit?', 'Un-fucking-believable!', 'Goddamn rigged piece of shit table!'],
        myCurse: ['Bullshit.', 'Hell of a way to run a casino.', 'Son of a bitch.'],
        rageQuit: ['I’m takin’ my money to a real casino.', 'This place is a fuckin’ joke. I’m gone.'],
        kickedOut: ['You know who I am? I own half the scrap in this town!', 'Fine! I’ll buy this dump and fire all of you!', 'Get your hands off the suit!'],
        dealerBlackjack: ['Unbelievable. I want a new dealer.', 'Get the pit boss over here.'],
        yourBustCard: ['You took her card, kid. Learn the game.'],
        yourSplitTens: ['Kid, you got money to burn, huh?', 'Ha! Now I seen everything.'],
        myBlackjack: ['That’s right. Pay me.', 'Blackjack. Like I planned it.'],
        yourBlackjack: ['Not bad, kid.'],
        dealerBust: ['That’s more like it.', 'Pay up, pay up.'],
        dealerDrewOut: ['Oh, come on.', 'Every time with this one.'],
        myDoubleLost: ['See? This is why I don’t double.'],
        yourDoubleWon: ['Lucky.', 'Beginner’s luck, kid.'],
        shuffle: ['About time.'],
        myBust: ['Eh, it’s only caps.', 'The dealer would’ve hit it too.'],
        yourBust: ['Ha!', 'Too greedy, kid.'],
      },
    },
  },
  {
    id: 'pearl',
    name: 'Granny Pearl',
    blurb: 'Plays the minimum, insures everything, and never doubles. “Greedy,” she says.',
    style: { play: 'timid', betting: 'flat', insurance: 'always', unit: 1 },
    bankroll: 50,
    color: '#7d6a9a',
    temper: { slam: 0, curse: 0.3, quit: 0 },
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Oh, how nice. Sit by me, dear.', 'Hello, sweetie. Have a butterscotch.', 'My late husband played this very table, you know.'],
        goodbye: ['That’s my pension for the week. Goodnight, dears.', 'Time for my program. Be good, now.'],
        myCurse: ['Well, shit.', 'Oh, horseshit.', 'Fiddle-fucking-sticks. Pardon me, dears.', 'Well, I’ll be goddamned.'],
        dealerBlackjack: ['Good thing I insured, dear.', 'Oh, my.'],
        yourBustCard: ['Oh, sweetie. I think that was her card.'],
        yourSplitTens: ['Oh dear. Are you sure, sweetie?', 'My Harold used to do that. Once.'],
        myBlackjack: ['Oh! Is that a good one?', 'Well, would you look at that.'],
        yourBlackjack: ['Oh, well done, dear!', 'Lucky duck!'],
        dealerBust: ['Oh, good!', 'Everybody wins! How nice.'],
        dealerDrewOut: ['Oh, that’s a shame.', 'Well, that’s not very nice.'],
        yourDoubleWon: ['Oh, how exciting!', 'You’re braver than me, dear.'],
        shuffle: ['Ooh, I like the shuffling part.'],
        myBust: ['Oh, fiddlesticks.'],
        yourBust: ['Oh, poor thing.', 'There, there.'],
      },
    },
  },
  {
    id: 'martin',
    name: 'Martin Gale',
    blurb: 'Has a system. He doubles his bet after every loss. It works right up until it doesn’t.',
    style: { play: 'book', betting: 'martingale', insurance: 'never', unit: 1 },
    bankroll: 64,
    color: '#2f7680',
    temper: { slam: 0.5, curse: 0.6, quit: 0.25 },
    banter: {
      chattiness: 1.15,
      lines: {
        hello: ['Evening! Ask me about my system.', 'Don’t worry, I can’t lose. It’s math.', 'Ah, perfect. I’m due a win.'],
        goodbye: ['The system was fine. The table was wrong.', 'Ran out of doubling room. Next time.'],
        mySlam: ['That’s mathematically impossible! God damn it!', 'The system doesn’t account for this shit!', 'Six in a row?! Fuck!'],
        myCurse: ['Shit. Double it.', 'Damn it. Fine. Double again.', 'Hell. Still within the system.'],
        rageQuit: ['The system is fine. You people are the fucking problem.', 'I’m going to find a table that respects math.'],
        kickedOut: ['You can’t throw out a man with a system!', 'This is persecution of mathematics!'],
        dealerBlackjack: ['That’s fine. I’ll just double.', 'Doesn’t matter. Double it up.'],
        yourBustCard: ['Interesting choice. Statistically.'],
        yourSplitTens: ['Variance! I love it.', 'Bold. Not in the system, but bold.'],
        myBlackjack: ['See? The system works!', 'And we’re back.'],
        yourBlackjack: ['Nice! Now don’t change your bet.'],
        dealerBust: ['And that’s all my losses back.', 'System says: collect.'],
        dealerDrewOut: ['Fine. Double it.', 'Just means a bigger win next hand.'],
        myDoubleLost: ['No problem. Double again.'],
        yourDoubleWon: ['Ooh, that’s a nice side system.'],
        shuffle: ['A new shoe. My system loves a new shoe.'],
        myBust: ['Next bet’s bigger. That’s the beauty of it.'],
        yourBust: ['Double your bet next hand. Trust me.'],
      },
    },
  },
]

export const regularById = (id: string): Regular | undefined => REGULARS.find((r) => r.id === id)

/** Who's at the table when you sit down: four regulars, at random. */
export function seatRegulars(rng: Rng, count = 4): Regular[] {
  return shuffle(REGULARS, rng).slice(0, count)
}

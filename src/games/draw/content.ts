/**
 * Five-Card Draw content: the tables, their house dealers, and the regulars
 * who play in the back room.
 */

import { type Rng, shuffle } from '../../core/rng'
import type { Style } from './ai'
import type { Banter } from './banter'
import type { Stakes } from './engine'

export interface Table {
  id: string
  name: string
  blurb: string
  stakes: Stakes
  /** Caps you need to sit down: enough for a few hands. */
  minCaps: number
  dealer: Dealer
}

export interface Dealer {
  name: string
  /** What they say as you sit down. */
  hello: readonly string[]
}

export const TABLES: readonly Table[] = [
  {
    id: 'penny',
    name: 'Penny ante',
    blurb: 'The table by the stove, for ranch hands and anyone learning. Small pots, long nights.',
    stakes: { ante: 1, small: 2, big: 4 },
    minCaps: 20,
    dealer: { name: 'Hattie', hello: ['Evening, sugar. One cap to ante.', 'Pull up a chair. Stove’s warm and the cards are honest.', 'Welcome in. Antes in the middle when you’re ready.'] },
  },
  {
    id: 'backroom',
    name: 'The back room',
    blurb: 'Behind the bar, past the piano. Where the regulars play for real caps.',
    stakes: { ante: 5, small: 10, big: 20 },
    minCaps: 100,
    dealer: { name: 'Ike', hello: ['Ante’s five. Ten and twenty.', 'Evening. Mind the spittoon.', 'Have a seat. House takes nothing but your company.'] },
  },
  {
    id: 'cattlemen',
    name: 'The cattlemen’s game',
    blurb: 'Upstairs, by invitation. Herds have changed hands at this table.',
    stakes: { ante: 25, small: 50, big: 100 },
    minCaps: 500,
    dealer: { name: 'Mr. Ashby', hello: ['Good evening. Twenty-five to ante, fifty and a hundred.', 'Welcome upstairs. Shall we?', 'A pleasure. The cards are new tonight.'] },
  },
]

export const tableById = (id: string): Table => TABLES.find((t) => t.id === id) ?? TABLES[0]

/** Seats at the table: yours and up to five regulars. You're always seat 0. */
export const YOUR_SEAT = 0
export const MAX_OPPONENTS = 5

export interface Regular {
  id: string
  name: string
  blurb: string
  style: Style
  /** Buy-in, in big bets. */
  bankroll: number
  /** Portrait color. */
  color: string
  banter: Banter
}

export const REGULARS: readonly Regular[] = [
  {
    id: 'mae',
    name: 'Widow Mae',
    blurb: 'Buried two husbands and a bank manager. Plays only good cards, and bets them hard.',
    style: { tight: 0.72, aggression: 0.85, bluff: 0.07, slowplay: 0.08, draw: 'book', patBluff: 0.08 },
    bankroll: 50,
    color: '#5b4a6e',
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Evening. Sit, if you’re sitting.', 'Fresh money. How nice.', 'Deal me in, Ike. I feel like widowing someone.'],
        goodbye: ['That’s enough charity for one night.', 'I’ll be back for it. I always am.'],
        myBadBeat: ['Well. That stung.', 'Two pair and nothing to show for it.', 'Hm. Shuffle them better next time.'],
        caughtBluffing: ['Worth a try.', 'You had it. Good for you.'],
        myBigPot: ['That’ll do.', 'Stack it up, Ike.', 'Thank you, gentlemen.'],
        yourBigPot: ['Not bad, newcomer.', 'Enjoy it. It’s mine next hand.'],
        myBluff: ['Thank you kindly.', 'Sensible of you all.'],
        capped: ['Now we’re playing.', 'Cap it, then.'],
        yourPat: ['Pat? Bold.', 'Standing pat. Either you have it or you want me to think so.'],
        yourFour: ['Four cards. There’s an Ace in there, I suppose.'],
      },
    },
  },
  {
    id: 'eli',
    name: 'Preacher Eli',
    blurb: 'Folds and folds and folds, then turns over a full house. Never bluffs. Says it’s a sin.',
    style: { tight: 0.95, aggression: 0.3, bluff: 0, slowplay: 0.1, draw: 'book', patBluff: 0 },
    bankroll: 40,
    color: '#2f3a4a',
    banter: {
      chattiness: 0.9,
      lines: {
        hello: ['Bless this table.', 'Evening, friend. Play honest.', 'The Lord giveth. I just fold a lot.'],
        goodbye: ['The collection plate is empty. Goodnight.', 'I shall pray on it.'],
        myBadBeat: ['The Lord tests us.', 'Patience. Patience.', 'A humbling.'],
        myBigPot: ['Praise be.', 'Patience is rewarded.', 'The meek, the earth, and so on.'],
        yourBigPot: ['Well played, friend.', 'The cards were with you.'],
        capped: ['Gentlemen. Moderation.', 'Such passion.'],
        yourPat: ['Pat. I believe you.', 'Hm. Pat.'],
        yourFour: ['Faith is drawing four.'],
      },
    },
  },
  {
    id: 'dutch',
    name: 'Dutch Hendry',
    blurb: 'Raises on anything, bluffs on nothing, and laughs either way. Runs the freight wagons, and the table.',
    style: { tight: 0.12, aggression: 0.95, bluff: 0.32, slowplay: 0, draw: 'book', patBluff: 0.3 },
    bankroll: 60,
    color: '#8c3b24',
    banter: {
      chattiness: 1.3,
      lines: {
        hello: ['Ha! More meat for the wagon.', 'Sit down, sit down! I raise.', 'New face. Let’s see how much you’ve got.'],
        goodbye: ['Busted! Ha! Worth every cap.', 'Somebody owes me a drink. Everybody owes me a drink.'],
        myBadBeat: ['Ah, hell! Again!', 'Two pair! TWO PAIR! Damn it.', 'Son of a gun. Deal.'],
        caughtBluffing: ['Ha! You got me.', 'Had to try. Had to!', 'Nothing. I had nothing. Ha!'],
        myBigPot: ['Ha! Push it here!', 'That’s how the wagon rolls!', 'Pay the freight, boys!'],
        yourBigPot: ['Look at you! Ha!', 'Lucky. Lucky, lucky.'],
        myBluff: ['Smart folks, all of you.', 'Wouldn’t you like to know.'],
        capped: ['Cap it! Cap it!', 'Now we’re talking!', 'Ha! Raise! Oh. That’s the cap.'],
        yourPat: ['Pat! I don’t believe a word of it.', 'Pat, huh? I’m calling anyway.'],
        yourFour: ['Four cards! Ha! Brave.', 'Four! Hoping for a miracle?'],
      },
    },
  },
  {
    id: 'rosie',
    name: 'Rosie Two-Guns',
    blurb: 'Calls everything, chases every straight, and swears she can feel the cards. Sometimes she can.',
    style: { tight: 0.05, aggression: 0.15, bluff: 0.02, slowplay: 0, draw: 'longshot', patBluff: 0 },
    bankroll: 35,
    color: '#b5546a',
    banter: {
      chattiness: 1.2,
      lines: {
        hello: ['Howdy! Deal me in, I’m feeling it tonight.', 'Room for one more gun?', 'Hey there, handsome table.'],
        goodbye: ['Well, shoot. Out of bullets.', 'That’s me cleaned out. Y’all be good.'],
        myBadBeat: ['Oh, come ON!', 'I had two pair! Two!', 'That’s just rude.'],
        myBigPot: ['Yeehaw!', 'Told y’all I could feel it!', 'Gimme gimme gimme.'],
        yourBigPot: ['Ooh, look at you go!', 'Now that’s a pot!'],
        capped: ['Whoo! Somebody’s got something!', 'I call! I always call.'],
        yourPat: ['Pat! Ooh, scary.', 'I don’t care, I’m calling.'],
        yourFour: ['Four! Now you’re playing like me!', 'Four cards, honey? I like your style.'],
      },
    },
  },
  {
    id: 'silas',
    name: 'Silas Pike',
    blurb: 'Undertaker. Checks his big hands and waits for you to bet into him. Patient as a pine box.',
    style: { tight: 0.6, aggression: 0.5, bluff: 0.05, slowplay: 0.7, draw: 'book', patBluff: 0.04 },
    bankroll: 45,
    color: '#3d4a3b',
    banter: {
      chattiness: 0.7,
      lines: {
        hello: ['Evening.', 'Don’t mind me. I’m only measuring.', 'Sit. Everyone sits eventually.'],
        goodbye: ['I’ll see you all again. Professionally.', 'Goodnight.'],
        myBadBeat: ['Hm. Unfortunate.', 'The cards giveth.'],
        caughtBluffing: ['Hm.'],
        myBigPot: ['Mm.', 'Thank you.', 'Right on time.'],
        yourBigPot: ['Enjoy it while it lasts.'],
        myBluff: ['Hm.'],
        capped: ['Mm. Lively.'],
        yourPat: ['Pat. Interesting.'],
      },
    },
  },
  {
    id: 'larkin',
    name: 'Kid Larkin',
    blurb: 'Nineteen, quick on the draw and quicker with a bluff. Keeps an Ace with his pairs. Stands pat on air.',
    style: { tight: 0.35, aggression: 0.7, bluff: 0.2, slowplay: 0.05, draw: 'kicker', patBluff: 0.4 },
    bankroll: 30,
    color: '#a07a2a',
    banter: {
      chattiness: 1.15,
      lines: {
        hello: ['Evenin’, folks. I’m the fastest hand in the territory.', 'Deal me in. I’m feeling dangerous.', 'Hope you brought more than you can lose.'],
        goodbye: ['Ah, hell. I’ll be back with more.', 'That’s it, I’m tapped. Next time, though.'],
        myBadBeat: ['That ain’t fair!', 'You gotta be kidding me.', 'Aw, nuts.'],
        caughtBluffing: ['Worth a shot.', 'Next time you won’t call.', 'Aw, I was so sure you’d fold.'],
        myBigPot: ['Fastest hand in the territory!', 'Told ya! Told ya!', 'Ha! Read ’em and weep.'],
        yourBigPot: ['Beginner’s luck.', 'Lucky draw, that’s all.'],
        myBluff: ['Easiest money in the West.', 'Smart. Real smart.'],
        capped: ['Let’s dance!', 'Cap it, I ain’t scared.'],
        yourPat: ['Pat? Pfft. I stand pat on nothing all the time.', 'Sure you do.'],
        yourFour: ['Four? Ha!'],
      },
    },
  },
  {
    id: 'colonel',
    name: 'The Colonel',
    blurb: 'Lost an arm at a battle nobody remembers. Plays a sound, steady game, and tells you about it.',
    style: { tight: 0.55, aggression: 0.62, bluff: 0.1, slowplay: 0.15, draw: 'book', patBluff: 0.1 },
    bankroll: 55,
    color: '#5d6b3a',
    banter: {
      chattiness: 1.05,
      lines: {
        hello: ['At ease. Take a seat.', 'Another recruit. Splendid.', 'Evening. I’ll be dealing out lessons.'],
        goodbye: ['A tactical retreat. Goodnight.', 'The field is yours. For now.'],
        myBadBeat: ['Outflanked.', 'Hm. A strategic setback.', 'Damn and blast.'],
        caughtBluffing: ['A feint. You saw through it.', 'Well spotted, soldier.'],
        myBigPot: ['Victory.', 'As planned.', 'The spoils of war.'],
        yourBigPot: ['Well fought.', 'A fine campaign, soldier.'],
        myBluff: ['Discretion. Well chosen.', 'You live to fight another hand.'],
        capped: ['Now it’s a battle.', 'Steady, steady.'],
        yourPat: ['Standing pat. A bold position.', 'Dug in, are we?'],
        yourFour: ['Four cards. A cavalry charge.'],
      },
    },
  },
]

export const regularById = (id: string): Regular | undefined => REGULARS.find((r) => r.id === id)

/** Who's at the table when you sit down: `count` regulars, at random. */
export function seatRegulars(rng: Rng, count: number): Regular[] {
  return shuffle(REGULARS, rng).slice(0, count)
}

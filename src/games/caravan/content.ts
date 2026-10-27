/**
 * Caravan content: collectible card sets, the opponent ladder and rewards.
 */

import { type Card, fullSet, isNumberRank, parseCardId } from '../../core/cards'
import { type Rng, shuffle } from '../../core/rng'
import type { AiProfile } from './ai'
import type { Banter } from './banter'

export interface CardSetInfo {
  id: string
  name: string
  blurb: string
}

export const CARD_SETS: readonly CardSetInfo[] = [
  { id: 'standard', name: 'Wasteland Standard', blurb: 'Olive-drab backs. Every caravaneer starts with one.' },
  { id: 'rust', name: 'Rust Belt', blurb: 'Riveted scrap-metal backs from the salvage yards.' },
  { id: 'bloom', name: 'Desert Bloom', blurb: 'Sage-green backs with a cactus flower.' },
  { id: 'neon', name: 'Neon Strip', blurb: 'Hot pink and cyan, straight off a casino floor.' },
  { id: 'atomic', name: 'Atomic Age', blurb: 'Teal backs with orbiting electrons.' },
  { id: 'gold', name: "Prospector's Gold", blurb: 'Gold filigree. Rarely seen, never sold cheap.' },
]

export const setInfo = (id: string): CardSetInfo => CARD_SETS.find((s) => s.id === id) ?? CARD_SETS[0]

export const STARTER_SET = 'standard'

export interface Opponent {
  id: string
  name: string
  blurb: string
  difficulty: AiProfile['difficulty']
  profile: AiProfile
  set: string
  /** Most caps they'll put on the table. */
  maxWager: number
  /** New cards from their set you earn for a win. */
  rewardCards: number
  deck: () => Card[]
  lines: { win: string; lose: string }
  /** What they say about the game as it goes. */
  banter: Banter
}

export const OPPONENTS: readonly Opponent[] = [
  {
    id: 'dusty',
    name: 'Dusty Pete',
    blurb: 'Hauls scrap between outposts. Plays slow and builds his own caravans.',
    difficulty: 'easy',
    profile: { difficulty: 'easy', aggression: 0.1 },
    set: 'rust',
    maxWager: 50,
    rewardCards: 3,
    deck: () => fullSet('rust').filter((c) => c.rank !== 'JK' && c.rank !== 'K'),
    lines: { win: "Well, I'll be. Beginner's luck runs out eventually.", lose: 'Good game, partner. Take these, they rattle less in your pack.' },
    banter: {
      chattiness: 1.1,
      lines: {
        hello: ['Pull up a crate, partner. Mind the splinters.', 'Ain’t had company at this table since the dust storm.', 'Go easy on an old hauler, now.'],
        youTookMine: ['Hey now, I was fond of that one.', 'Well, shoot. There goes my {card}.', 'Ow. That’s gonna leave a dent.'],
        iTookYours: ['Sorry, partner. Nothin’ personal.', 'Oops. Was that one important?', 'Your {card} fell off the back of the wagon.'],
        youBustedMine: ['Now that’s just mean, loadin’ me up like that.', 'Too heavy! My brahmin’s sittin’ down.'],
        iBustedYours: ['Heh. Packed you a little heavy there.', 'That one won’t make it up the hill.'],
        youNearWin: ['Uh oh. Pete’s in trouble.', 'You’re makin’ this old hauler sweat.'],
        iNearWin: ['Well, would you look at that. Two of ’em!', 'Don’t tell me Pete’s winnin’.'],
        youBusted: ['Easy there, you overloaded the brahmin.', 'Whoa, that one’s spillin’ over the sides.'],
        youSold: ['That’ll fetch a fair price.', 'Huh. Nice haul you got there.'],
        iSold: ['That’ll sell at the next outpost.', 'Look at that. Pete’s got a real caravan.'],
        youDisbanded: ['Startin’ over? Smart, sometimes.', 'Scrappin’ it, huh? I do that with toasters.'],
        iDisbanded: ['That one had a busted axle anyhow.', 'Back to the scrap pile with you.'],
        youDiscarded: ['Didn’t like that one?', 'Toss it on the scrap pile.'],
        iDiscarded: ['Don’t need that rattlin’ around.', 'Nope, not that one.'],
        youPlayed: ['Hm. Hadn’t thought of that.', 'Steady goin’.'],
        iPlayed: ['Slow and easy.', 'Just stackin’ scrap.'],
      },
    },
  },
  {
    id: 'mari',
    name: 'Mari Vance',
    blurb: 'Runs water to the outlying farms. Careful, patient, hard to rattle.',
    difficulty: 'normal',
    profile: { difficulty: 'normal', aggression: 0.7 },
    set: 'bloom',
    maxWager: 100,
    rewardCards: 4,
    deck: () => fullSet('bloom').filter((c) => c.rank !== 'JK'),
    lines: { win: 'Slow and steady fills the canteen.', lose: 'Fair and square. These are yours.' },
    banter: {
      chattiness: 0.75,
      lines: {
        hello: ['Sit. The water’s free, the cards aren’t.', 'Take your time. I always do.', 'Long road out here. Let’s play.'],
        youTookMine: ['Hm. I’ll rebuild.', 'Bold. I’ll remember that.', 'My {card}. That was a good one.'],
        iTookYours: ['Sorry. Can’t let that one through.', 'The farms need that more than you do.', 'Your {card} took a wrong turn.'],
        youBustedMine: ['You’d rather sink me than outrun me. Noted.', 'Too much weight. Clever.'],
        iBustedYours: ['A little extra weight. Let’s see you carry it.', 'Hard to haul that much.'],
        youNearWin: ['Don’t count your canteens yet.', 'Two lanes. Careful now.'],
        iNearWin: ['Two down. Steady now.', 'Almost home.'],
        youBusted: ['Too much, too fast.', 'Happens to everyone once.'],
        youSold: ['That one’s sold. Good haul.', 'Neat work.'],
        iSold: ['{value}. That’ll hold.', 'Full canteen.'],
        youDisbanded: ['Starting over takes patience. Good.', 'Sometimes the road washes out.'],
        iDisbanded: ['That route’s dried up.', 'Back to the well.'],
        youDiscarded: ['Patience. I like it.', 'Saving something?'],
        iDiscarded: ['Not this one.', 'No use for that.'],
        youPlayed: ['Mm.', 'Steady.'],
        iPlayed: ['One step at a time.', 'Slow and steady.'],
      },
    },
  },
  {
    id: 'sully',
    name: 'Slick Sully',
    blurb: 'A card sharp from the casino strip who never met a Jack he didn’t like.',
    difficulty: 'normal',
    profile: { difficulty: 'normal', aggression: 1.3 },
    set: 'neon',
    maxWager: 200,
    rewardCards: 4,
    deck: () => fullSet('neon'),
    lines: { win: 'House always wins, friend.', lose: 'Huh. Nobody walks out of my game with my cards. Until now.' },
    banter: {
      chattiness: 1.35,
      lines: {
        hello: ['Pull up a stool, sucker. I mean, friend.', 'Ante up. Sully’s feeling lucky tonight.', 'Watch the cards, not my hands.'],
        youTookMine: ['Hey! I’m the one who plays Jacks around here.', 'That’s cold. I respect it.', 'My {card}! You’ll pay for that.'],
        iTookYours: ['Snip snip!', 'Your {card}? Never heard of it.', 'Jack-pot!'],
        youBustedMine: ['Pumping me past the limit? Dirty. I love it.', 'Too rich for my blood!'],
        iBustedYours: ['Oops, made you too rich!', 'A little gift from the house.'],
        youNearWin: ['Two lanes? Don’t get cocky, kid.', 'Lucky streak. They always end.'],
        iNearWin: ['Two down. Want to fold now and save time?', 'Smell that? That’s winning.'],
        youBusted: ['Ooh, bust! The house thanks you.', 'Somebody can’t count.'],
        youSold: ['Cute caravan. Shame if something happened to it.', 'Sold, huh? For now.'],
        iSold: ['Sold! House rules.', '{value}, baby.'],
        youDisbanded: ['Folding already?', 'Run, rabbit, run.'],
        iDisbanded: ['Reshuffling the odds.', 'That one was a decoy anyway.'],
        youDiscarded: ['Bluffing, or just bad cards?', 'Don’t like your hand? Join the club.'],
        iDiscarded: ['Nothing up my sleeve. Promise.', 'Didn’t need it.'],
        youPlayed: ['That all you got?', 'Yawn.'],
        iPlayed: ['Watch and learn.', 'Easy money.'],
      },
    },
  },
  {
    id: 'atwood',
    name: 'Professor Atwood',
    blurb: 'Counts every card that hits the table and rarely miscounts.',
    difficulty: 'hard',
    profile: { difficulty: 'hard', aggression: 1 },
    set: 'atomic',
    maxWager: 300,
    rewardCards: 5,
    deck: () => fullSet('atomic'),
    lines: { win: 'The probabilities were always in my favor.', lose: 'Remarkable. I shall have to revise my models.' },
    banter: {
      chattiness: 1,
      lines: {
        hello: ['Shall we begin? I already have.', 'A fresh sample. Excellent.', 'Do try to be unpredictable.'],
        youTookMine: ['Unexpected. Adjusting the model.', 'My {card}. Regrettable, but within error bars.', 'Hm. I hadn’t weighted that.'],
        iTookYours: ['Your {card} was a statistical liability.', 'Correcting an outlier.', 'Removed. Do keep up.'],
        youBustedMine: ['Doubling past twenty-six. Crude, but effective.', 'Over tolerance. Well played.'],
        iBustedYours: ['Your caravan now exceeds tolerances.', 'Twenty-six is the limit, as you know.'],
        youNearWin: ['Two lanes. The variance favors you, briefly.', 'A temporary deviation.'],
        iNearWin: ['Two lanes. The probabilities converge.', 'As modeled.'],
        youBusted: ['Over twenty-six. Arithmetic is unforgiving.', 'A rounding error, perhaps?'],
        youSold: ['{value}. A respectable figure.', 'Sold. Noted.'],
        iSold: ['{value}. Within the optimal range.', 'Sold, on schedule.'],
        youDisbanded: ['Cutting your losses. Statistically sound.', 'A reset. Interesting.'],
        iDisbanded: ['A controlled reset.', 'That line of inquiry is closed.'],
        youDiscarded: ['Interesting discard. Noted.', 'That tells me something.'],
        iDiscarded: ['Expected value: negative. Discarded.', 'Superfluous.'],
        youPlayed: ['As predicted.', 'Hm. Plausible.'],
        iPlayed: ['Proceeding as modeled.', 'Next variable.'],
      },
    },
  },
  {
    id: 'prospector',
    name: 'The Prospector',
    blurb: 'Sits at the far table and has never lost there. Bring a good deck.',
    difficulty: 'hard',
    profile: { difficulty: 'hard', aggression: 1.15 },
    set: 'gold',
    maxWager: 500,
    rewardCards: 6,
    deck: () => fullSet('gold'),
    lines: { win: 'Plenty more fools where you came from.', lose: 'Forty years at this table. Take the gold, you earned it.' },
    banter: {
      chattiness: 0.7,
      lines: {
        hello: ['Sit. Don’t talk.', 'Another one. Sit down.', 'Deal.'],
        youTookMine: ['Hmph. Lucky.', 'You’ll want to watch yourself.', 'That {card} was worth more than you.'],
        iTookYours: ['Mine now.', 'Dig deeper next time.', 'Your {card}. Gone.'],
        youBustedMine: ['Cute trick. Seen it a thousand times.', 'Hmph.'],
        iBustedYours: ['Too heavy to haul. Pity.', 'Greed’ll sink you.'],
        youNearWin: ['Forty years. You’re not the first to get this far.', 'Don’t smile yet.'],
        iNearWin: ['Almost done here.', 'One more.'],
        youBusted: ['Greed. Seen it ruin better than you.', 'Too much.'],
        youSold: ['Don’t spend it yet.', 'Hm.'],
        iSold: ['Gold.', '{value}. Pays.'],
        youDisbanded: ['Running scared?', 'Bad claim?'],
        iDisbanded: ['Dead claim.', 'Played out.'],
        youDiscarded: ['Hm.', 'Fool’s gold?'],
        iDiscarded: ['Fool’s gold.', 'Worthless.'],
        youPlayed: ['Go on.', 'Hm.'],
        iPlayed: ['Patience.', 'Slow digging.'],
      },
    },
  },
]

export const opponentById = (id: string): Opponent | undefined => OPPONENTS.find((o) => o.id === id)

/** An opponent unlocks once you've beaten the one before them. */
export function isUnlocked(index: number, beaten: Record<string, number>): boolean {
  return index === 0 || (beaten[OPPONENTS[index - 1].id] ?? 0) > 0
}

/** Up to `count` random cards from `set` the player doesn't own yet. */
export function drawUnowned(set: string, owned: ReadonlySet<string>, count: number, rng: Rng): Card[] {
  return shuffle(
    fullSet(set).filter((c) => !owned.has(c.id)),
    rng,
  ).slice(0, count)
}

/** Caps paid instead of each reward card when the set is already complete. */
export const DUPLICATE_BONUS_CAPS = 25

export const PACK_SIZE = 5
export const PACK_PRICE = 150

/** Sets the Trader sells packs for: those whose owner you've beaten. */
export function traderSets(beaten: Record<string, number>): CardSetInfo[] {
  const sets = OPPONENTS.filter((o) => (beaten[o.id] ?? 0) > 0).map((o) => o.set)
  return CARD_SETS.filter((s) => sets.includes(s.id))
}

export interface SavedDeck {
  id: string
  name: string
  cards: string[]
}

export const STARTER_DECK: SavedDeck = {
  id: 'starter',
  name: 'Starter deck',
  cards: fullSet(STARTER_SET).map((c) => c.id),
}

export const deckCards = (deck: SavedDeck): Card[] => deck.cards.map(parseCardId)

/** Sort order for showing cards: by set, suit, then rank. */
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JK']
const SUIT_ORDER = ['S', 'H', 'D', 'C', null]
export function compareCards(a: Card, b: Card): number {
  const setOrder = CARD_SETS.findIndex((s) => s.id === a.set) - CARD_SETS.findIndex((s) => s.id === b.set)
  if (setOrder !== 0) return setOrder
  const suit = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit)
  if (suit !== 0) return suit
  return RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank) || a.id.localeCompare(b.id)
}

export const isFace = (c: Card) => !isNumberRank(c.rank)

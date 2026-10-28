/**
 * The croupier's calls: bets open, bets closed, and where the ball landed,
 * said the way it's said at the wheel. At the French wheel they're in
 * French: "Faites vos jeux", "Rien ne va plus", "Dix-sept, noir, impair et
 * manque".
 *
 * Pure apart from the rng, which only picks between ways of saying the
 * same thing.
 */

import { type Rng, pick } from '../../core/rng'
import { DOUBLE_ZERO, type Pocket, type WheelKind, colorOf, isZero } from './engine'

export type Language = 'en' | 'fr'

export const languageOf = (wheel: WheelKind): Language => (wheel === 'french' ? 'fr' : 'en')

const EN = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
  'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one', 'Twenty-two', 'Twenty-three', 'Twenty-four',
  'Twenty-five', 'Twenty-six', 'Twenty-seven', 'Twenty-eight', 'Twenty-nine', 'Thirty', 'Thirty-one', 'Thirty-two', 'Thirty-three',
  'Thirty-four', 'Thirty-five', 'Thirty-six',
]

const FR = [
  'Zéro', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix', 'Onze', 'Douze', 'Treize', 'Quatorze', 'Quinze',
  'Seize', 'Dix-sept', 'Dix-huit', 'Dix-neuf', 'Vingt', 'Vingt et un', 'Vingt-deux', 'Vingt-trois', 'Vingt-quatre', 'Vingt-cinq',
  'Vingt-six', 'Vingt-sept', 'Vingt-huit', 'Vingt-neuf', 'Trente', 'Trente et un', 'Trente-deux', 'Trente-trois', 'Trente-quatre',
  'Trente-cinq', 'Trente-six',
]

/** A pocket in words: "Seventeen", "Double zero", "Dix-sept". */
export const numberWord = (pocket: Pocket, language: Language = 'en'): string =>
  pocket === DOUBLE_ZERO ? 'Double zero' : (language === 'fr' ? FR : EN)[pocket]

/** Bets are open. */
export function placeBets(language: Language, rng: Rng): string {
  return language === 'fr'
    ? pick(['Faites vos jeux.', 'Faites vos jeux, mesdames et messieurs.', 'Messieurs, faites vos jeux.'], rng)
    : pick(['Place your bets, please.', 'Place your bets.', 'Bets, please, ladies and gentlemen.'], rng)
}

/** The ball's away, and bets are closed. */
export function noMoreBets(language: Language, rng: Rng): string {
  return language === 'fr' ? pick(['Rien ne va plus.', 'Les jeux sont faits. Rien ne va plus.'], rng) : pick(['No more bets.', 'No more bets, please.'], rng)
}

/**
 * Where the ball landed, with its even chances: "Seventeen, black, odd,
 * low." The French call names them the French way, "Dix-sept, noir, impair
 * et manque", and a zero there calls la partage.
 */
export function resultCall(pocket: Pocket, wheel: WheelKind): string {
  const language = languageOf(wheel)
  if (isZero(pocket)) {
    if (language === 'fr') return 'Zéro. Partage sur les chances simples.'
    return `${numberWord(pocket)}, green.`
  }
  const red = colorOf(pocket) === 'red'
  const odd = pocket % 2 === 1
  const low = pocket <= 18
  if (language === 'fr') {
    return `${numberWord(pocket, 'fr')}, ${red ? 'rouge' : 'noir'}, ${odd ? 'impair' : 'pair'} et ${low ? 'manque' : 'passe'}.`
  }
  return `${numberWord(pocket)}, ${red ? 'red' : 'black'}, ${odd ? 'odd' : 'even'}, ${low ? 'low' : 'high'}.`
}

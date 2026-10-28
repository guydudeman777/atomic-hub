import { type Rank, type Suit, makeCard } from '../../../core/cards'
import { PlayingCard } from '../../../components/PlayingCard'
import { type Category, CATEGORY_NAME } from '../../../core/poker'
import { Link } from '../../../router'
import { DECK_SET } from '../engine'

export function RulesText() {
  return (
    <div className="dw-rules">
      <h2>How to play</h2>
      <p>
        Five cards each, one chance to change some of them, and two rounds of betting. The best hand at the showdown takes the
        pot; the <Link to="/draw/rankings">hand rankings</Link> say what beats what.
      </p>

      <h3>A hand</h3>
      <ul>
        <li>Everyone antes. The deal starts on the button’s left and goes round, one card at a time, five each, face down.</li>
        <li>
          The first round of betting starts on the button’s left, at the small bet. You can <strong>check</strong>,{' '}
          <strong>bet</strong>, <strong>call</strong>, <strong>raise</strong> or <strong>fold</strong>. Anyone may bet on anything;
          if everyone checks, the hand goes to the draw anyway.
        </li>
        <li>
          The draw: in turn, throw away up to three cards and you’re dealt as many new ones, or four if the card you keep is an
          Ace. Keeping all five is standing pat. Everyone sees how many cards you take.
        </li>
        <li>The second round of betting, at the big bet, twice the small.</li>
        <li>The showdown: every hand still in turns face up, and the best five cards win.</li>
        <li>If everyone else folds, you take the pot without showing your hand.</li>
      </ul>

      <h3>This table’s rules</h3>
      <ul>
        <li>Fixed limit: a bet and three raises a round, each one the size of that round’s bet.</li>
        <li>The button moves one seat to the left after every hand, so the deal goes round.</li>
        <li>
          Your caps are your stack: antes and bets come out of them as you make them, and a pot you win comes straight back. You
          can’t lose more than you have. Short of a call, you’re all in for what’s left, and what you can’t match goes into a
          side pot you can’t win.
        </li>
        <li>An all-in short of a full raise doesn’t reopen the betting: anyone who has already acted can only call it or fold.</li>
        <li>Split pots are shared evenly; an odd cap goes to the first winner on the button’s left.</li>
        <li>Getting up in the middle of a hand forfeits what you’ve put in the pot.</li>
      </ul>

      <h3>Hints</h3>
      <p>
        With hints on, the cards the book keeps are marked before your draw, with the reason in the terminal, and the log notes it
        when you draw differently. The book stands pat on a straight or better, keeps trips, two pair, any pair, and four to a
        flush or an open-ended straight, and otherwise keeps an Ace, or the two highest cards.
      </p>

      <h3>Keys</h3>
      <dl className="dw-rules__keys">
        <dt>F C</dt>
        <dd>Fold, check or call</dd>
        <dt>B R</dt>
        <dd>Bet or raise</dd>
        <dt>1 2 3 4 5</dt>
        <dd>Pick a card to throw away</dd>
        <dt>D</dt>
        <dd>Draw, or stand pat</dd>
        <dt>Enter</dt>
        <dd>Deal; check or call; draw</dd>
        <dt>Backspace</dt>
        <dd>Keep every card again</dd>
      </dl>
    </div>
  )
}

/** Every hand, best first: an example, and how often five cards fresh off the deck make one. */
const RANKINGS: { category: Category; example: string; count: number; note: string }[] = [
  { category: 'royal-flush', example: 'AS KS QS JS 10S', count: 4, note: 'Ace to Ten, all one suit.' },
  { category: 'straight-flush', example: '9H 8H 7H 6H 5H', count: 36, note: 'Five in a row, all one suit.' },
  { category: 'four-of-a-kind', example: '9C 9S 9H 9D KC', count: 624, note: 'Four cards of one rank.' },
  { category: 'full-house', example: 'KC KS KH 7D 7C', count: 3744, note: 'Three of a kind and a pair. The three decide it.' },
  { category: 'flush', example: 'AD JD 8D 6D 2D', count: 5108, note: 'Five of one suit. The highest card decides it, then the next.' },
  { category: 'straight', example: '10C 9S 8H 7D 6C', count: 10200, note: 'Five in a row. Ace plays high or low: A-2-3-4-5 is the lowest.' },
  { category: 'three-of-a-kind', example: '4C 4S 4H KD 2C', count: 54912, note: 'Three cards of one rank.' },
  { category: 'two-pair', example: 'KC KS 7H 7D 2C', count: 123552, note: 'The higher pair decides it, then the lower, then the odd card.' },
  { category: 'pair', example: 'JC JS 7H 5D 2C', count: 1098240, note: 'Two cards of one rank, then the rest in order.' },
  { category: 'high-card', example: 'AC JS 7H 5D 2C', count: 1302540, note: 'Nothing made. Highest card first.' },
]

const HANDS = 2598960

const odds = (count: number) => {
  const one = HANDS / count
  return one >= 10 ? `1 in ${Math.round(one).toLocaleString()}` : `1 in ${one.toFixed(1)}`
}

export function HandRankings() {
  return (
    <div className="dw-rankings">
      <h2>Hand rankings</h2>
      <p>
        Best first. Suits are all equal: two hands that differ only by suit split the pot. The odds are for five cards fresh off
        the deck, before the draw.
      </p>
      <ol className="dw-rankings__list">
        {RANKINGS.map((r) => (
          <li key={r.category} className="dw-ranking">
            <div className="dw-ranking__cards" aria-hidden="true">
              {r.example.split(' ').map((code) => (
                <div key={code} className="dw-ranking__card">
                  <PlayingCard card={makeCard(DECK_SET, code.slice(0, -1) as Rank, code.slice(-1) as Suit)} />
                </div>
              ))}
            </div>
            <div className="dw-ranking__text">
              <h3>{CATEGORY_NAME[r.category]}</h3>
              <p>{r.note}</p>
            </div>
            <p className="dw-ranking__odds">
              {odds(r.count)}
              <span className="visually-hidden"> hands dealt</span>
            </p>
          </li>
        ))}
      </ol>
      <p className="dw-ink-dim">
        Counted over all {HANDS.toLocaleString()} five-card hands by the same evaluator the table uses.
      </p>
    </div>
  )
}

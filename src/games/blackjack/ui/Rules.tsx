import { HARD, PAIRS, type Play, SOFT, UP_CARDS } from '../strategy'

export function RulesText() {
  return (
    <div className="bj-rules">
      <h2>How to play</h2>
      <p>
        Beat the dealer by finishing closer to 21 without going over. Number cards count their value, tens and face cards count
        10, and an Ace counts 11 unless that would put you over, when it counts 1. A hand with an Ace counting 11 is soft: one
        more card can’t bust it.
      </p>

      <h3>A round</h3>
      <ul>
        <li>Put your chips in the circle and deal. Everyone gets two cards face up; the dealer takes one up and one face down.</li>
        <li>Two cards worth 21 is a blackjack. It pays 3 to 2 and beats any other 21.</li>
        <li>
          Play goes around from the dealer’s left, which is your right. On your turn you can <strong>hit</strong> (take a card),{' '}
          <strong>stand</strong>, <strong>double</strong> your bet on your first two cards for exactly one more card, or{' '}
          <strong>split</strong> a pair into two hands, each with its own bet.
        </li>
        <li>Go over 21 and you bust: the bet is lost at once, whatever the dealer does later.</li>
        <li>Then the dealer turns over the hole card and draws to 17. Win and you’re paid even money; a tie is a push and your bet comes back.</li>
      </ul>

      <h3>Insurance</h3>
      <p>
        When the dealer shows an Ace, you can insure your hand for half your bet. If the dealer has blackjack, insurance pays 2
        to 1, which makes up for the hand you lose. With a blackjack of your own, insuring is called even money: you’re paid 1
        to 1 whatever the dealer has. In the long run insurance loses, unless you know the shoe is full of tens.
      </p>

      <h3>This table’s rules</h3>
      <ul>
        <li>Six decks, reshuffled when the cut card comes out, about three quarters of the way through the shoe.</li>
        <li>The dealer checks for blackjack under an Ace or a ten, so you never lose a double or a split to one.</li>
        <li>The dealer stands on all 17s, soft 17 included.</li>
        <li>Double on any first two cards, and after splitting. Any two ten-value cards are a pair.</li>
        <li>Split up to four hands. Split Aces get one card each and can’t be split again, and 21 there isn’t a blackjack.</li>
        <li>No surrender. Blackjack pays 3 to 2, rounded down to whole caps.</li>
      </ul>

      <h3>Coach and count</h3>
      <p>
        With the coach on, the terminal shows the basic strategy play for your hand and lights its button, and notes it in the
        log when you play differently. Count shows the Hi-Lo count: +1 for every 2 to 6 seen, −1 for every ten and Ace. The true
        count is that per deck left in the shoe; the higher it climbs, the better your odds.
      </p>

      <h3>Keys</h3>
      <dl className="bj-rules__keys">
        <dt>H S D P</dt>
        <dd>Hit, stand, double, split</dd>
        <dt>Y N</dt>
        <dd>Insurance yes or no</dd>
        <dt>1 2 3 4</dt>
        <dd>Add a chip</dd>
        <dt>Enter</dt>
        <dd>Deal</dd>
        <dt>Backspace</dt>
        <dd>Clear your bet</dd>
      </dl>
    </div>
  )
}

const PLAY_NAME: Record<Play, string> = { H: 'Hit', S: 'Stand', P: 'Split', D: 'Double, or hit', Ds: 'Double, or stand' }

const UP_LABEL = (u: (typeof UP_CARDS)[number]) => (u === 11 ? 'A' : String(u))

function ChartTable({ caption, rows }: { caption: string; rows: [string, Play[]][] }) {
  return (
    <table className="bj-chart">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="visually-hidden">Your hand, against the dealer’s</span>
          </th>
          {UP_CARDS.map((u) => (
            <th key={u} scope="col">
              {UP_LABEL(u)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, plays]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {plays.map((play, i) => (
              <td key={i} data-play={play} title={`${label} against ${UP_LABEL(UP_CARDS[i])}: ${PLAY_NAME[play]}`}>
                {play}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The basic strategy chart for this table, drawn from the same data the coach uses. */
export function StrategyChart() {
  const hard: [string, Play[]][] = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8].map((t) => [t === 17 ? '17+' : t === 8 ? '5–8' : String(t), HARD[t]])
  const soft: [string, Play[]][] = [20, 19, 18, 17, 16, 15, 14, 13].map((t) => [`A,${t - 11}`, SOFT[t]])
  const pairs: [string, Play[]][] = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((v) => [v === 11 ? 'A,A' : v === 10 ? '10,10' : `${v},${v}`, PAIRS[v]])
  return (
    <div className="bj-strategy">
      <h2>Basic strategy</h2>
      <p>
        The best play for every hand, for this table’s rules: six decks, dealer stands on soft 17, double after split. Find your
        hand down the side and the dealer’s up card across the top. Played perfectly, it leaves the house an edge of about 0.4%.
      </p>
      <ul className="bj-chart-legend" aria-label="Key">
        {(['H', 'S', 'D', 'Ds', 'P'] as const).map((play) => (
          <li key={play}>
            <span data-play={play}>{play}</span> {PLAY_NAME[play]}
          </li>
        ))}
      </ul>
      <div className="bj-strategy__charts">
        <ChartTable caption="Hard totals" rows={hard} />
        <ChartTable caption="Soft totals" rows={soft} />
        <ChartTable caption="Pairs" rows={pairs} />
      </div>
      <p className="bj-ink-dim">
        Pairs you don’t split (tens, 5s, and the rest where the chart says H or S) play as their total. Never take insurance.
      </p>
    </div>
  )
}

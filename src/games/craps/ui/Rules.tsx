import { edgeOf, formatEdge, paysText } from '../content'
import type { BetSpot } from '../engine'

export function RulesText() {
  return (
    <div className="cr-rules">
      <h2>How to play</h2>
      <p>
        You’re the shooter. Put your chips on the layout, then roll two dice down the table. They have to hit the far wall. Most
        bets are about one thing: whether the shooter’s point comes again before a 7.
      </p>

      <h3>The come-out and the point</h3>
      <ul>
        <li>
          The first roll of a hand is the <strong>come-out</strong>. A 7 or 11 wins on the pass line. A 2, 3 or 12 is craps, and the
          pass line loses.
        </li>
        <li>
          Any other number (4, 5, 6, 8, 9 or 10) becomes the <strong>point</strong>. The puck turns over to ON and goes on that
          number.
        </li>
        <li>
          Now the shooter rolls until the point comes again, which wins the pass line, or a 7, which loses it. That’s a{' '}
          <strong>seven-out</strong>, and the next roll is a new come-out.
        </li>
        <li>The shooter needs a bet on the pass line or don’t pass to come out.</li>
      </ul>

      <h3>The bets</h3>
      <ul>
        <li>
          <strong>Pass line</strong> bets with the shooter, at even money. Once there’s a point it can’t come down.{' '}
          <strong>Don’t pass</strong> bets against: it wins on 2 or 3 and on a seven-out, and a 12 on the come-out is a push.
        </li>
        <li>
          <strong>Odds</strong> go behind a line bet once there’s a point, up to 3 times it on 4 and 10, 4 times on 5 and 9, and 5
          times on 6 and 8. They pay true odds, so the house has no edge on them at all. Laid odds behind a don’t bet go up to 6
          times it.
        </li>
        <li>
          <strong>Come</strong> and <strong>don’t come</strong> are line bets made while there’s a point. The next roll is their
          own come-out, and a point number moves them to that number’s box. Tap a come bet on its number to take odds behind it.
          Odds on come bets are off on the come-out; laid odds on don’t come bets always work.
        </li>
        <li>
          <strong>Field</strong> is one roll: 3, 4, 9, 10 and 11 pay even money, 2 pays double and 12 pays triple. 5, 6, 7 and 8
          lose.
        </li>
        <li>
          <strong>Place bets</strong> on a number win every time it rolls before a 7, and stay up: 9 to 5 on 4 and 10, 7 to 5 on
          5 and 9, 7 to 6 on 6 and 8. They’re off on the come-out.
        </li>
        <li>
          <strong>Hardways</strong> win when 4, 6, 8 or 10 rolls as a pair, and lose to a 7 or the number rolled any other way.
          Off on the come-out.
        </li>
        <li>
          <strong>One-roll bets</strong> on the right of the layout are decided on the next roll: any seven, any craps, eleven
          (yo), and aces or boxcars.
        </li>
      </ul>

      <h3>At this table</h3>
      <ul>
        <li>
          A winning bet stays up, and its winnings come back to your rail. Come bets and odds come back with their winnings, once
          they’re decided.
        </li>
        <li>
          Bets go down in units that pay whole caps, the way a dealer asks for them: place bets on 6 and 8 in sixes, on the other
          numbers in fives; odds on 5 and 9 in twos and on 6 and 8 in fives; laid odds in twos, threes or sixes. Push out a chip
          that doesn’t fit and the dealer rounds the bet up.
        </li>
        <li>
          Line, come, field and place bets start at the table minimum. Hardways and one-roll bets start lower. No bet but odds can
          go over the table maximum.
        </li>
        <li>Anything but a pass line bet with a point, or a come bet on its number, can come down. Leaving the table loses those.</li>
      </ul>

      <h3>Keys</h3>
      <dl className="cr-rules__keys">
        <dt>R or Space</dt>
        <dd>Roll</dd>
        <dt>1 2 3 4</dt>
        <dd>Pick a chip</dd>
        <dt>T</dt>
        <dd>Take bets down instead</dd>
        <dt>Backspace</dt>
        <dd>Take down everything that can come down</dd>
        <dt>B</dt>
        <dd>Rebet what the last roll took</dd>
      </dl>
    </div>
  )
}

interface Row {
  name: string
  spot: BetSpot
  /** For odds: the point they're behind. */
  point?: 4 | 5 | 6 | 8 | 9 | 10
  note: string
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Line and come bets',
    rows: [
      { name: 'Pass line', spot: 'pass', note: 'Can’t come down once there’s a point.' },
      { name: 'Don’t pass', spot: 'dont-pass', note: '12 on the come-out is a push.' },
      { name: 'Come', spot: 'come', note: 'Travels to its number.' },
      { name: 'Don’t come', spot: 'dont-come', note: '12 is a push.' },
    ],
  },
  {
    title: 'Odds',
    rows: [
      { name: 'Odds on 4 or 10', spot: 'pass-odds', point: 4, note: 'Up to 3× the line bet.' },
      { name: 'Odds on 5 or 9', spot: 'pass-odds', point: 5, note: 'Up to 4×, in twos.' },
      { name: 'Odds on 6 or 8', spot: 'pass-odds', point: 6, note: 'Up to 5×, in fives.' },
      { name: 'Laid against 4 or 10', spot: 'dont-pass-odds', point: 4, note: 'Up to 6×, in twos.' },
      { name: 'Laid against 5 or 9', spot: 'dont-pass-odds', point: 5, note: 'Up to 6×, in threes.' },
      { name: 'Laid against 6 or 8', spot: 'dont-pass-odds', point: 6, note: 'Up to 6×, in sixes.' },
    ],
  },
  {
    title: 'Field and place bets',
    rows: [
      { name: 'Field', spot: 'field', note: 'One roll.' },
      { name: 'Place 6 or 8', spot: 'place-6', note: 'In sixes. Off on the come-out.' },
      { name: 'Place 5 or 9', spot: 'place-5', note: 'In fives. Off on the come-out.' },
      { name: 'Place 4 or 10', spot: 'place-4', note: 'In fives. Off on the come-out.' },
    ],
  },
  {
    title: 'The middle of the table',
    rows: [
      { name: 'Hard 6 or 8', spot: 'hard-6', note: 'Off on the come-out.' },
      { name: 'Hard 4 or 10', spot: 'hard-4', note: 'Off on the come-out.' },
      { name: 'Any seven', spot: 'any-seven', note: 'One roll.' },
      { name: 'Any craps', spot: 'any-craps', note: 'One roll: 2, 3 or 12.' },
      { name: 'Eleven (yo)', spot: 'yo', note: 'One roll.' },
      { name: 'Aces or boxcars', spot: 'aces', note: 'One roll: 2, or 12.' },
    ],
  },
]

/** Every bet with what it pays and its house edge, worked out exactly through the same engine the table plays (odds.ts). */
export function BetsTable() {
  return (
    <div className="cr-bets">
      <h2>Bets and odds</h2>
      <p>
        What every bet on the layout pays, and what it costs you in the long run: the house edge, the share of each bet the house
        keeps on average once it’s decided. Each one is worked out exactly, from all 36 ways the dice can land, by the same rules
        the table plays.
      </p>
      <p>The best bets are the line, come bets, and the odds behind them. The further toward the middle of the table, the worse it gets.</p>
      <div className="cr-bets__tables">
        {GROUPS.map((g) => (
          <table key={g.title} className="cr-odds">
            <caption>{g.title}</caption>
            <thead>
              <tr>
                <th scope="col">Bet</th>
                <th scope="col">Pays</th>
                <th scope="col">House edge</th>
                <th scope="col" className="cr-odds__note">
                  <span className="visually-hidden">Notes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((row) => {
                const edge = row.point === undefined ? edgeOf(row.spot) : 0
                return (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    <td>{paysText(row.spot, row.point ?? null)}</td>
                    <td data-edge={edge === 0 ? 'none' : edge < 0.02 ? 'low' : edge < 0.05 ? 'mid' : 'high'}>{formatEdge(edge)}</td>
                    <td className="cr-odds__note">{row.note}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  )
}

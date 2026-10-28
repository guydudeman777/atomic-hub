import { Link } from '../../../router'
import { WHEELS, edgeOf, formatEdge, paysText } from '../content'
import type { Spot, WheelKind } from '../engine'

/** The rules, written for someone who's never played. */
export function RulesText() {
  return (
    <div className="rl-rules">
      <h2>How to play Roulette</h2>
      <p>
        The croupier spins the wheel one way and sends a small ball round its rim the other. Before it settles in one of the
        numbered pockets, you put chips on the numbers you think it’ll find, or on groups of them. The fewer numbers a bet covers,
        the more it pays.
      </p>

      <h3>The wheels</h3>
      <ul>
        <li>
          <strong>European:</strong> 37 pockets, 1 to 36 and a single zero. Red and black take turns around the wheel; the zero is
          green.
        </li>
        <li>
          <strong>French:</strong> the same wheel, with <em>la partage</em>. When the ball lands on zero, bets on red or black, odd
          or even, 1 to 18 or 19 to 36 lose only half: the other half comes back to you. At this wheel those bets go down in twos,
          and the croupier calls the game in French.
        </li>
        <li>
          <strong>American:</strong> 38 pockets, with a double zero (00) as well as the zero. The second green pocket doubles the
          house’s share.
        </li>
      </ul>

      <h3>Inside bets</h3>
      <p>Chips on the numbers themselves, or on the lines between them.</p>
      <ul>
        <li>
          <strong>Straight up:</strong> one number, zero included. Pays 35 to 1.
        </li>
        <li>
          <strong>Split:</strong> two numbers side by side, on the line between them. 17 to 1.
        </li>
        <li>
          <strong>Street:</strong> a row of three, on the row’s outside edge. 11 to 1. A <strong>trio</strong> is zero and two
          numbers beside it, where they meet.
        </li>
        <li>
          <strong>Corner:</strong> four numbers, on the point where they meet. 8 to 1. On a single-zero layout the{' '}
          <strong>first four</strong>, 0, 1, 2 and 3, pays the same.
        </li>
        <li>
          <strong>Six line:</strong> two rows, on the outside edge where they meet. 5 to 1. On the American layout the{' '}
          <strong>top line</strong>, 0, 00, 1, 2 and 3, pays 6 to 1, and costs more than any other bet in the house.
        </li>
      </ul>

      <h3>Outside bets</h3>
      <ul>
        <li>
          <strong>Dozens:</strong> 1 to 12, 13 to 24 or 25 to 36. <strong>Columns:</strong> one of the three lines along the layout,
          bet in the box marked 2 to 1 at its end. Both pay 2 to 1.
        </li>
        <li>
          <strong>Even chances:</strong> red or black, odd or even, 1 to 18 or 19 to 36. Even money.
        </li>
        <li>Zero isn’t red or black, odd or even, high or low: it loses every outside bet, but for la partage.</li>
      </ul>

      <h3>At the table</h3>
      <ul>
        <li>
          Pick a chip from the rack, then put it on the layout. With a mouse, click a number for straight up, or a line or corner
          between numbers for the bets there. On a touch screen, tap a number and pick from the bets on it.
        </li>
        <li>Your chips are gold. The regulars at the wheel each have a color of their own, as wheel chips do.</li>
        <li>
          Each bet has a minimum and a maximum, posted on the croupier’s sign: inside bets from the first figure, outside bets from
          the second. An inside bet can take the straight-up maximum for each number it covers.
        </li>
        <li>A winning bet is paid and stays where it is for the next spin. Losing bets are swept away. Rebet puts them back.</li>
        <li>Anything can come down until the ball is spun, and getting up hands all of it back.</li>
      </ul>

      <h3>Keys</h3>
      <dl className="rl-rules__keys">
        <dt>1–4</dt>
        <dd>Pick a chip</dd>
        <dt>S or Space</dt>
        <dd>Spin (online, say you’re done betting)</dd>
        <dt>T</dt>
        <dd>Take bets down</dd>
        <dt>B</dt>
        <dd>Rebet</dd>
        <dt>Backspace</dt>
        <dd>Clear the layout</dd>
        <dt>Shift+Enter</dt>
        <dd>On a number: every bet on it. Right-clicking it does the same.</dd>
      </dl>
    </div>
  )
}

/** One row of the odds table: a bet, and a spot that stands for it on each wheel (null where the wheel hasn't got it). */
interface Row {
  name: string
  spots: Record<WheelKind, Spot | null>
  note?: string
}

const same = (spot: Spot): Record<WheelKind, Spot> => ({ european: spot, french: spot, american: spot })

const ROWS: Row[] = [
  { name: 'Straight up', spots: same('straight-17'), note: 'One number.' },
  { name: 'Split', spots: same('split-17-20'), note: 'Two numbers.' },
  { name: 'Street or trio', spots: same('street-16'), note: 'Three numbers.' },
  { name: 'Corner', spots: same('corner-16-17-19-20'), note: 'Four numbers.' },
  { name: 'First four', spots: { european: 'first-four', french: 'first-four', american: null }, note: '0, 1, 2, 3. Single zero only.' },
  { name: 'Top line', spots: { european: null, french: null, american: 'top-line' }, note: '0, 00, 1, 2, 3. American only.' },
  { name: 'Six line', spots: same('line-16'), note: 'Six numbers.' },
  { name: 'Dozen or column', spots: same('dozen-2'), note: 'Twelve numbers.' },
  { name: 'Even chances', spots: same('red'), note: 'Red or black, odd or even, 1–18 or 19–36.' },
]

const WHEEL_IDS: WheelKind[] = ['european', 'french', 'american']

/** Every bet with what it pays and its house edge on each wheel, worked out exactly through the same engine the table plays (odds.ts). */
export function BetsTable() {
  return (
    <div className="rl-bets">
      <h2>Bets and odds</h2>
      <p>
        What every bet pays, and what it costs you in the long run: the house edge, the share of each bet the house keeps on
        average. Each figure is worked out exactly, pocket by pocket, by the same rules the table plays.
      </p>
      <p>
        On a single-zero wheel every bet costs the same. La partage halves it on the even chances, and the double zero doubles it
        on everything. <Link to="/roulette/rules">How to play</Link>.
      </p>
      <div className="rl-bets__scroll">
        <table className="rl-odds">
          <thead>
            <tr>
              <th scope="col">Bet</th>
              <th scope="col">Pays</th>
              {WHEEL_IDS.map((w) => (
                <th key={w} scope="col">
                  {WHEELS.find((x) => x.id === w)!.name}
                </th>
              ))}
              <th scope="col" className="rl-odds__note">
                <span className="visually-hidden">Notes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const any = WHEEL_IDS.map((w) => row.spots[w]).find((s) => s !== null)!
              const wheel = WHEEL_IDS.find((w) => row.spots[w] !== null)!
              return (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{paysText(wheel, any)}</td>
                  {WHEEL_IDS.map((w) => {
                    const spot = row.spots[w]
                    if (!spot) return <td key={w} className="rl-ink-dim">—</td>
                    const edge = edgeOf(w, spot)
                    return (
                      <td key={w} data-edge={edge < 0.02 ? 'low' : edge < 0.04 ? 'mid' : 'high'}>
                        {formatEdge(edge)}
                      </td>
                    )
                  })}
                  <td className="rl-odds__note">{row.note}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

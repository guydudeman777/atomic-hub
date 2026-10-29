import { Link } from '../../../router'
import { MACHINE_INFO, SYMBOLS, formatChance, formatPercent, payName, payPicture, payValue } from '../content'
import { MAX_COINS, REEL_NUMBERS } from '../engine'
import { MACHINES } from '../machines'
import { report } from '../odds'
import { SymbolArt } from './Symbols'

/** The rules, written for someone who's never pulled a handle. */
export function RulesText() {
  return (
    <div className="sl-rules">
      <h2>How to play Slots</h2>
      <p>
        Put in one, two or three coins and pull the handle, or press Spin. The three reels turn and stop one after another, left to
        right. If the symbols on the pay line, the middle row in the window, make a line on the paytable, the machine pays.
      </p>

      <h3>The machines</h3>
      <ul>
        <li>
          <strong>Bottle Caps</strong>, a cap a coin: scrap-heap junk and cherries. A cherry anywhere on the line pays, and so does any
          mix of three junk symbols. It pays the same for every coin, so one coin or three gives back the same share.
        </li>
        <li>
          <strong>Atomic Sevens</strong>, five caps a coin: sevens and bars. The atom is wild: it stands in for any symbol on a line and
          doubles the pay, and two atoms pay four times over. Three atoms pay their own award, with a bonus for three coins.
        </li>
        <li>
          <strong>Moon Rocket</strong>, 25 caps a coin: rockets, saucers and robots. Three rockets on three coins win the jackpot meter,
          which starts at 100,000 caps and grows by 2% of every three-coin bet on the row: yours, and online, your friends’ too. With
          one or two coins, three rockets pay 1,000 or 2,000 coins instead.
        </li>
      </ul>

      <h3>Coins and credits</h3>
      <ul>
        <li>Each machine shows your caps as credits: how many of its coins you could play. Bet one adds a coin, round to three and back.</li>
        <li>Every pay is so many coins for each coin played, but for the top award: three coins pay a bonus on Atomic Sevens, and win the meter on Moon Rocket.</li>
        <li>Only the highest win on the line is paid. Wins go straight onto your credits, counted up on the winner-paid meter.</li>
      </ul>

      <h3>Inside the reels</h3>
      <ul>
        <li>
          Each reel has 22 stops, a symbol and then a blank all the way round. Behind each reel are 64 numbers, and every stop owns a few
          of them. A pull draws one number for each reel, and the reel stops where its number says.
        </li>
        <li>
          Every machine’s top symbol owns 2 of a reel’s 64 numbers, so three of them come up once in 32,768 pulls. The blanks either side
          of it own more, which is why the top symbol so often shows just above or below the line. Only the line pays.
        </li>
        <li>
          Every pull is drawn fresh. A machine is never due, hot or cold, whatever anyone tells you. The{' '}
          <Link to="/slots/pays">paytables</Link> list every stop and its numbers, and what each machine gives back.
        </li>
      </ul>

      <h3>On the row</h3>
      <ul>
        <li>Online, up to two friends play the machines either side of yours, with caps of their own, each at their own pace.</li>
        <li>Dottie, the change girl, walks the row and calls the big winners. Each pull goes on your record, with what it won or lost.</li>
        <li>Getting up mid-spin is fine: the reels finish and anything they win is paid.</li>
      </ul>

      <h3>Keys</h3>
      <dl className="sl-rules__keys">
        <dt>S or Space</dt>
        <dd>Spin</dd>
        <dt>1–3</dt>
        <dd>Coins</dd>
        <dt>B</dt>
        <dd>Bet one more coin</dd>
        <dt>M</dt>
        <dd>Bet max, three coins, and spin</dd>
      </dl>
    </div>
  )
}

/** Every machine's paytable, with how often each line comes up and what it gives back, worked out exactly from the reels (odds.ts). */
export function PaysTable() {
  return (
    <div className="sl-pays">
      <h2>Paytables</h2>
      <p>
        What every line pays on each machine, in coins, how often it comes up on a three-coin pull, and its share of what the machine
        gives back. Every figure is worked out exactly, from every way the reels can stop, by the same rules the machines play.
      </p>
      <p>
        Every machine gives back about 95% on three coins. Bottle Caps pays small and often, Moon Rocket big and rarely.{' '}
        <Link to="/slots/rules">How to play</Link>.
      </p>
      {MACHINE_INFO.map((info) => {
        const rules = MACHINES[info.id]
        const max = report(rules, MAX_COINS)
        return (
          <section key={info.id} className="sl-pays__machine" data-machine={info.id} aria-labelledby={`sl-pays-${info.id}`}>
            <h3 id={`sl-pays-${info.id}`}>
              {info.name} <span className="sl-ink-dim">{info.coinText.toLowerCase()}</span>
            </h3>
            <div className="sl-pays__scroll">
              <table className="sl-paytable">
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    {Array.from({ length: MAX_COINS }, (_, i) => (
                      <th key={i} scope="col" className="sl-num">
                        {i + 1} coin{i ? 's' : ''}
                      </th>
                    ))}
                    <th scope="col" className="sl-num">
                      Comes up
                    </th>
                    <th scope="col" className="sl-num">
                      Gives back
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rules.pays.map((pay, i) => (
                    <tr key={i}>
                      <th scope="row">
                        <span className="sl-pays__pic" aria-hidden="true">
                          {payPicture(pay).map((symbol, k) => (
                            <SymbolArt key={k} symbol={symbol} />
                          ))}
                        </span>
                        {payName(pay)}
                      </th>
                      {Array.from({ length: MAX_COINS }, (_, c) => (
                        <td key={c} className="sl-num">
                          {payValue(pay, c + 1)}
                        </td>
                      ))}
                      <td className="sl-num">{formatChance(max.pays[i].chance)}</td>
                      <td className="sl-num">{formatPercent(max.pays[i].share)}</td>
                    </tr>
                  ))}
                  {max.meter > 0 && (
                    <tr>
                      <th scope="row">To the meter, of every three-coin bet</th>
                      <td colSpan={MAX_COINS + 1} />
                      <td className="sl-num">{formatPercent(max.meter)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Something pays</th>
                    <td colSpan={MAX_COINS} />
                    <td className="sl-num">{formatChance(max.hit)}</td>
                    <td />
                  </tr>
                  <tr>
                    <th scope="row">Pays back</th>
                    {Array.from({ length: MAX_COINS }, (_, c) => (
                      <td key={c} className="sl-num sl-pays__total">
                        {formatPercent(report(rules, c + 1).total)}
                      </td>
                    ))}
                    <td />
                    <td className="sl-num sl-pays__total">{formatPercent(max.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {rules.wild && (
              <p className="sl-ink-dim">
                The atom stands in for any symbol in a line of three, doubling it; two atoms quadruple it. Three atoms pay their own award.
              </p>
            )}
            {rules.progressive && (
              <p className="sl-ink-dim">
                The jackpot is counted at its reset, {rules.progressive.reset.toLocaleString()} caps, in the figures above; 2% of every
                three-coin bet goes onto the meter on top. The higher the meter, the more three coins give back.
              </p>
            )}
            <details className="sl-strips">
              <summary>The reel strips</summary>
              <p className="sl-ink-dim">Every stop, top to bottom, and how many of the reel’s {REEL_NUMBERS} numbers land on it.</p>
              <div className="sl-strips__reels">
                {rules.reels.map((strip, reel) => (
                  <ol key={reel} className="sl-strip" aria-label={`Reel ${reel + 1}`}>
                    {strip.map((stop, i) => (
                      <li key={i} data-blank={stop.symbol === 'blank' || undefined}>
                        <span className="sl-strip__pic" aria-hidden="true">
                          <SymbolArt symbol={stop.symbol} />
                        </span>
                        <span className="sl-strip__name">{SYMBOLS[stop.symbol].name}</span>
                        <span className="sl-strip__weight">{stop.weight}</span>
                      </li>
                    ))}
                  </ol>
                ))}
              </div>
            </details>
          </section>
        )
      })}
    </div>
  )
}

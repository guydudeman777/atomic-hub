/** The rules, written for someone who's never played. */
export function RulesText() {
  return (
    <div className="c4-rules">
      <h2>How to play Connect Four</h2>
      <p>
        Two players, red and yellow, take turns dropping checkers into a rack that stands upright. Line up four of yours in a row,
        across, up and down, or on a diagonal, and you win.
      </p>

      <h3>The rack</h3>
      <p>
        Seven columns, numbered 1 to 7 from the left, and six rows. Each player has 21 checkers. Red drops first, then the players
        take turns.
      </p>

      <h3>A move</h3>
      <ul>
        <li>Drop one checker into any column that isn’t full. It falls to the lowest empty hole.</li>
        <li>
          <strong>Four in a row</strong> of your color wins at once: four across a row, four up a column, or four along either
          diagonal.
        </li>
        <li>If all 42 holes fill up and nobody has four, the game is a draw.</li>
      </ul>

      <h3>A few tips</h3>
      <ul>
        <li>
          <strong>The middle column</strong> takes part in more lines than any other. Start there, and keep a presence in it.
        </li>
        <li>
          Before every drop, look for a hole where your opponent would make four. If one is open, fill it. Then check you’re not
          dropping just under one, which would hand it to them.
        </li>
        <li>
          Two threats at once can’t both be blocked. Three in a row with both ends open, or two threats stacked one above the
          other, wins.
        </li>
        <li>
          Late in the game, which row a threat is on matters. Red does best with threats on odd rows (1, 3 and 5 from the
          bottom), Yellow on even ones, because of how the last columns fill up.
        </li>
      </ul>

      <h3>Keys</h3>
      <dl className="c4-rules__keys">
        <dt>← →</dt>
        <dd>Move the checker along the top of the rack</dd>
        <dt>Enter, Space or ↓</dt>
        <dd>Drop it</dd>
        <dt>1–7</dt>
        <dd>Drop straight into that column</dd>
        <dt>Esc</dt>
        <dd>Hide the column highlight</dd>
      </dl>
    </div>
  )
}

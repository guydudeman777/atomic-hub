/** The rules, written for someone who's never played. */
export function RulesText() {
  return (
    <div className="rv-rules">
      <h2>How to play Reversi</h2>
      <p>
        Two players, one black and one white, take turns putting discs on an 8×8 board. Trap your opponent’s discs between
        yours and they turn over to your color. When the board is full, or nobody can move, whoever has more discs showing
        wins.
      </p>

      <h3>Setting up</h3>
      <p>
        Four discs start in the middle: white on d4 and e5, black on d5 and e4. Columns are lettered a to h from the left and
        rows numbered 1 to 8 from the top. Black moves first.
      </p>

      <h3>A move</h3>
      <ul>
        <li>
          Put a disc on an empty square so that it <strong>flanks</strong> at least one straight line of your opponent’s discs,
          with one of your own at the far end. Lines run across, up and down, and diagonally.
        </li>
        <li>Every line you flank turns over at once, in all eight directions. The discs that turn don’t turn any others.</li>
        <li>A move that doesn’t flank anything isn’t allowed, however good the square looks.</li>
      </ul>

      <h3>Passing and the end</h3>
      <ul>
        <li>If you have no move, you pass and your opponent goes again. You can’t pass while you have a move.</li>
        <li>
          When neither player can move, the game is over. That’s usually a full board, but it can come early, with squares
          still empty or one color wiped out.
        </li>
        <li>
          Most discs wins. Empty squares left at the end go to the winner, so a 40–20 finish with four squares empty
          scores 44–20. Equal counts are a draw.
        </li>
      </ul>

      <h3>A few tips</h3>
      <ul>
        <li>
          <strong>Corners</strong> can never be turned, and the discs that grow along the edges from them are just as safe.
          Take them when you can.
        </li>
        <li>
          The squares next to an empty corner, b2 and its mirror images most of all, tend to hand that corner to your
          opponent. Stay off them until the corner is taken.
        </li>
        <li>
          More discs early isn’t better. What matters is having moves to choose from while your opponent runs short, until
          they have to play where you want them to.
        </li>
      </ul>

      <h3>Keys</h3>
      <dl className="rv-rules__keys">
        <dt>Arrow keys</dt>
        <dd>Move around the board</dd>
        <dt>Enter or Space</dt>
        <dd>Play the square you’re on</dd>
        <dt>A–H, then 1–8</dt>
        <dd>Play a square by name: D then 3 plays d3</dd>
        <dt>Esc</dt>
        <dd>Hide the cursor</dd>
      </dl>
    </div>
  )
}

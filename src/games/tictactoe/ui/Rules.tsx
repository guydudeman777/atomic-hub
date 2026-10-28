/** The rules, written for someone who's never played Ultimate. */
export function RulesText() {
  return (
    <div className="tt-rules">
      <h2>How to play Tic-Tac-Toe</h2>
      <p>
        Two players, X and O, take turns marking squares on a grid. Get three of your marks in a row, across, down or
        diagonally, and you win. X always goes first.
      </p>

      <h3>Classic</h3>
      <ul>
        <li>A 3×3 grid. On your turn, put your mark in any empty square.</li>
        <li>Three in a row wins. If the grid fills up with no three in a row, it’s a draw: a cat’s game.</li>
        <li>
          Played well by both sides, every game of Classic is a cat’s game. Wins come from mistakes, so the trick is to give
          your opponent chances to make them.
        </li>
      </ul>

      <h3>Ultimate</h3>
      <ul>
        <li>Nine small grids, laid out in a big 3×3. X starts in any square of any grid.</li>
        <li>
          <strong>Where you play sends your opponent.</strong> The square you mark in a small grid picks the grid of the big
          one where your opponent has to play next. Mark the top right square, and they play in the top right grid. That
          grid is highlighted on the board.
        </li>
        <li>
          Three in a row in a small grid wins it, and a big mark goes over it. Nobody plays in a grid once it’s won. A
          small grid that fills up with no three in a row counts for nobody.
        </li>
        <li>
          If you’re sent to a grid that’s won or full, you can play in <strong>any open grid</strong> instead. Try not to
          hand your opponent that freedom.
        </li>
        <li>
          Win three small grids in a row on the big grid to win the game. If every grid is settled and nobody has three in a
          row, it’s a draw.
        </li>
      </ul>

      <h3>A few tips</h3>
      <ul>
        <li>
          In Classic, a <strong>fork</strong> wins: two lines of two at once, and your opponent can only block one. Corners
          make the most of them.
        </li>
        <li>
          In Ultimate, every square is also a move on the big grid. Before you mark one, look at the grid it sends your
          opponent to, and what they could do there.
        </li>
        <li>Winning a small grid early isn’t worth much if it lets your opponent play anywhere they like.</li>
      </ul>

      <h3>Keys</h3>
      <dl className="tt-rules__keys">
        <dt>1–9</dt>
        <dd>
          Mark a square, laid out like a number pad: 7 is the top left, 5 the center and 3 the bottom right. In Ultimate,
          the square in the grid you’re sent to, or if you can play anywhere, first the grid and then the square.
        </dd>
        <dt>Arrow keys</dt>
        <dd>Move around the board</dd>
        <dt>Enter or Space</dt>
        <dd>Mark the square you’re on</dd>
        <dt>Esc</dt>
        <dd>Hide the cursor</dd>
      </dl>
    </div>
  )
}

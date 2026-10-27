import { MIN_DECK_SIZE, MIN_NUMBER_CARDS } from '../engine'

/** The rules, written for someone who's never played. */
export function RulesText() {
  return (
    <div className="cv-rules">
      <h2>How to play Caravan</h2>
      <p>
        You and your opponent each build three caravans: piles of number cards that face each other across the table.
        Get a caravan worth <strong>21 to 26</strong> and it’s sold. Beat the caravan across from it and that lane is
        yours. Win two of the three lanes to win the game.
      </p>

      <h3>Setting up</h3>
      <p>
        Both players draw eight cards. On each of your first three turns you must place a number card (Ace to 10) on one of
        your empty caravans. No face cards or discards until all three are started.
      </p>

      <h3>Your turn</h3>
      <p>After the opening, do exactly one of these. Playing or discarding draws you a new card, so your hand stays at five while your deck lasts.</p>
      <ul>
        <li>Play a card from your hand.</li>
        <li>Discard a card from your hand.</li>
        <li>Disband one of your caravans, throwing away every card in it. You don’t draw after disbanding.</li>
      </ul>

      <h3>Number cards</h3>
      <p>
        Number cards only go on your own caravans. Aces count 1, everything else counts its number. The second card sets the
        caravan’s direction: higher means it’s ascending (▲), lower means descending (▼). After that, each card must keep
        going the same way, unless it matches the suit of the caravan’s last card, which lets it go either way. You can
        never play the same value twice in a row.
      </p>

      <h3>Face cards</h3>
      <p>Face cards attach to a number card on any caravan, yours or your opponent’s.</p>
      <dl className="cv-rules__faces">
        <dt>Jack</dt>
        <dd>Removes that card, along with anything attached to it.</dd>
        <dt>Queen</dt>
        <dd>Goes on the last card of a caravan. Reverses the direction and changes the suit to the Queen’s.</dd>
        <dt>King</dt>
        <dd>Doubles that card’s value. A second King doubles it again.</dd>
        <dt>Joker</dt>
        <dd>
          On an Ace: removes every other number card of that suit from the whole table. On a 2–10: removes every other card
          of that value from the whole table.
        </dd>
      </dl>

      <h3>Winning</h3>
      <p>
        A lane goes to whoever has the higher sold caravan in it, or the only sold one. A tie keeps the lane open. The game
        ends the moment all three lanes are decided, and whoever holds two or more wins. If you start your turn with no cards
        left in your hand and deck, you lose.
      </p>

      <h3>Decks</h3>
      <p>
        Decks need at least {MIN_DECK_SIZE} cards, including at least {MIN_NUMBER_CARDS} number cards, and can hold one copy of
        each card. Cards from different sets count as different cards, so a deck can mix sets.
      </p>
    </div>
  )
}

# The Atomic Hub: plan

A browser game hub for desktops and phones in a retro-futurist wasteland style. Single-player against AI, local hot-seat, and online tables with friends.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Vite + React + TypeScript web app in this repo, deployed to GitHub Pages |
| Opponents | Computer AI, local hot-seat (pass-the-device screens for hidden hands), and online with friends |
| Online | Peer to peer, still with no server: Trystero over public Nostr relays to introduce browsers, WebRTC between them. The host numbers every input and each browser replays them through the same seeded engine. Not cheat-proof: every browser holds the whole game |
| Style | Phosphor terminal hub (green or amber) inside a riveted casing. Each game gets its own table: Caravan is a lamp-lit wooden table, Blackjack a blue felt table on a 1950s casino floor, Five-Card Draw a green baize table in a saloon’s back room, Craps a green felt pit under marquee lights, Reversi a walnut board in an atomic-age den, Connect Four a big blue rack in a booth on a boardwalk midway, Tic-Tac-Toe grease pencil on a placemat at a roadside diner |
| Layout | Desktop and phone. Each game's table has a compact layout for phones, held upright or sideways |
| Economy | Shared caps balance, 500 to start. Refill to 500 when below 50 caps, at most once every 10 minutes |
| Art and sound | All original and generated in code: SVG cards, Web Audio effects. No Fallout logos or assets |

## Games

| Game | Opponents | Default rules | AI | Status |
| --- | --- | --- | --- | --- |
| Caravan | AI, hot-seat | Full New Vegas rules, collection and deck builder | Simulates possible hidden hands, 3 levels | **Done (phase 1)** |
| Blackjack | vs dealer: full table with 4 bots, or one on one | 6-deck shoe, dealer stands on soft 17, 3:2, double after split, split to 4 hands, insurance | Dealer follows fixed rules; 7 bots with their own play and betting styles, one a card counter; basic strategy coach | **Done (phase 2)** |
| Texas Hold’em | 2–6 seats, any mix | No-limit, blinds, side pots, caps buy-in | Simulated win odds + pot odds + personalities | Planned |
| Five-Card Draw | Heads up or 1–5 regulars | Ante, fixed limit, draw up to 3 (4 with an Ace), side pots | Equity from how hands finish by cards drawn, bets read as strength, 7 styles; book-draw hints | **Done (phase 3)** |
| Video Poker | Solo | Jacks or Better 9/6, 1–5 coins | Optional hold advisor | Planned |
| Solitaire | Solo | Klondike draw 1/3, undo, Vegas scoring in caps | Hint | Planned |
| Connect Four | AI ladder of 4, hot-seat | 7×6 | Alpha-beta on bitboards with a transposition table, judging threats on the rows each side wants; exact solve near the end (24 holes) | **Done (phase 2)** |
| Checkers | AI, hot-seat | American rules: forced captures, multi-jumps, kings, draw after 40 moves with no capture | Minimax search | Planned |
| Reversi | AI ladder of 4, hot-seat | 8×8, tournament rules, empties to the winner | Alpha-beta on bitboards weighing corners, stability, mobility, frontier and X/C-squares; exact endgame solve (8–14 empties) | **Done (phase 4)** |
| Battleship | AI, hot-seat | 10×10, ships of 5-4-3-3-2 | Hunt/target guided by where ships can fit | Planned |
| Tic-Tac-Toe | AI ladder of 4, hot-seat | Classic 3×3 and Ultimate 9×9 | Classic solved exactly, with trap-setting among drawing moves; Ultimate by Monte Carlo tree search, 150 to 30,000 playouts | **Done (phase 2)** |
| Roulette | vs house | European by default, American toggle | — | Planned |
| Craps | vs house, 3 regulars at the rail | Pass/Don’t Pass, Come/Don’t Come, 3-4-5× odds, Field (2× and 3×), Place, Hardways, one-roll bets; dealer units so every payout is whole caps | House edges worked out exactly through the engine; 5 regulars with their own betting styles | **Done (phase 5)** |
| Slots | Solo | 3 reels, published paytable, ~95% payback checked by a test | — | Planned |

## Phases (one PR each)

0. **Foundation.** Project setup, hub screen, theme, caps/records/settings saving, SVG cards, seeded RNG, CI and Pages deploy. *Done, shipped with phase 1.*
1. **Caravan.** Rules engine, AI, opponent ladder, collection, deck builder, Trader, hot-seat. *Done.*
2. **Blackjack, Connect Four, Tic-Tac-Toe.** *Done.*
3. **Poker.** Video Poker, Five-Card Draw and Hold’em, all sharing one hand evaluator (`src/core/poker.ts`). *Five-Card Draw and the evaluator done.*
4. **Reversi, Checkers, Battleship.** *Reversi done.*
5. **Solitaire, Roulette, Craps, Slots.** *Craps done.*
6. **Polish.** Animations, achievements, accessibility pass. (Phone layouts aren't saved for this phase: the hub and Caravan have them, and each new game ships with its own.)

## Testing approach

- Unit tests for every rules engine. The poker hand evaluator is checked against all 2,598,960 five-card hands.
- Casino payback checked by exact math: Video Poker’s return with perfect play, Roulette’s house edge, the Slots paytable, and every Craps bet’s house edge (played through the engine against all 36 rolls). Blackjack's basic strategy is checked by self-play against the published house edge.
- AI strength measured by self-play, with each deal played from both seats.
- Playwright smoke tests for each game route, on a desktop and on a touch phone.

# The Atomic Hub: plan

A desktop-first browser game hub in a retro-futurist wasteland style. Single-player against AI plus local hot-seat. No online multiplayer for now.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Vite + React + TypeScript web app in this repo, deployed to GitHub Pages |
| Opponents | Computer AI and local hot-seat (pass-the-device screens for hidden hands) |
| Style | Phosphor terminal hub (green or amber) inside a riveted casing. Each game gets its own table: Caravan is a lamp-lit wooden table |
| Layout | Desktop-first. Phones may need to be turned sideways |
| Economy | Shared caps balance, 500 to start. Refill to 500 when below 50 caps, at most once every 10 minutes |
| Art and sound | All original and generated in code: SVG cards, Web Audio effects. No Fallout logos or assets |

## Games

| Game | Opponents | Default rules | AI | Status |
| --- | --- | --- | --- | --- |
| Caravan | AI, hot-seat | Full New Vegas rules, collection and deck builder | Simulates possible hidden hands, 3 levels | **Done (phase 1)** |
| Blackjack | vs dealer, 1–3 seats | 6-deck shoe, dealer stands on soft 17, 3:2, double after split, split to 4 hands, insurance | Dealer follows fixed rules; strategy coach | Planned |
| Texas Hold’em | 2–6 seats, any mix | No-limit, blinds, side pots, caps buy-in | Simulated win odds + pot odds + personalities | Planned |
| Five-Card Draw | 2–6 seats | Ante, fixed-limit, draw up to 3 (4 with an Ace) | Hand strength + draw odds | Planned |
| Video Poker | Solo | Jacks or Better 9/6, 1–5 coins | Optional hold advisor | Planned |
| Solitaire | Solo | Klondike draw 1/3, undo, Vegas scoring in caps | Hint | Planned |
| Connect Four | AI, hot-seat | 7×6 | Minimax search | Planned |
| Checkers | AI, hot-seat | American rules: forced captures, multi-jumps, kings, draw after 40 moves with no capture | Minimax search | Planned |
| Reversi | AI, hot-seat | 8×8 | Minimax that values corners and move options | Planned |
| Battleship | AI, hot-seat | 10×10, ships of 5-4-3-3-2 | Hunt/target guided by where ships can fit | Planned |
| Tic-Tac-Toe | AI, hot-seat | 3×3 and Ultimate 9×9 | Perfect play / MCTS | Planned |
| Roulette | vs house | European by default, American toggle | — | Planned |
| Craps | vs house | Pass/Don’t Pass, Come/Don’t Come, Odds, Field, Place | — | Planned |
| Slots | Solo | 3 reels, published paytable, ~95% payback checked by a test | — | Planned |

## Phases (one PR each)

0. **Foundation.** Project setup, hub screen, theme, caps/records/settings saving, SVG cards, seeded RNG, CI and Pages deploy. *Done, shipped with phase 1.*
1. **Caravan.** Rules engine, AI, opponent ladder, collection, deck builder, Trader, hot-seat. *Done.*
2. **Blackjack, Connect Four, Tic-Tac-Toe.**
3. **Poker.** Video Poker, then Five-Card Draw, then Hold’em, all sharing one hand evaluator.
4. **Reversi, Checkers, Battleship.**
5. **Solitaire, Roulette, Craps, Slots.**
6. **Polish.** Animations, achievements, phone layouts, accessibility pass.

## Testing approach

- Unit tests for every rules engine. The poker hand evaluator will be checked against all 2,598,960 five-card hands.
- Casino payback checked by exact math: Video Poker’s return with perfect play, Roulette’s house edge, the Slots paytable.
- AI strength measured by self-play, with each deal played from both seats.
- Playwright smoke tests for each game route.

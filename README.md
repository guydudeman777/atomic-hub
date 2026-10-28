# The Atomic Hub

A retro-futurist game hub for the browser: a phosphor-green terminal menu leading to card tables, a casino floor and board games. Plays on desktops and phones, with no server and no accounts. Your caps, records and cards live in your browser and can be exported as a save file.

**Playable now:**
- Caravan, the card game from Fallout: New Vegas, against five AI opponents or a friend in hot-seat mode, with a card collection and deck builder.
- Blackjack at a blue-felt Vegas table, with a full table of regulars or one on one with the dealer, and a basic strategy coach.

**On the way:** Texas Hold’em, Five-Card Draw, Solitaire, Video Poker, Roulette, Craps, Slots, Connect Four, Checkers, Reversi, Battleship and Tic-Tac-Toe. See [docs/PLAN.md](docs/PLAN.md).

## Running it

```sh
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (rules engines, AI, caps, save file) |
| `npm run test:e2e` | Playwright smoke tests against a production build, on a desktop and a touch phone |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build into `dist/` |

### Deploying

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages. Turn it on once under **Settings → Pages → Build and deployment → Source: GitHub Actions**. Don’t pick *Deploy from a branch*: that publishes the raw source instead of the build, and games open to a blank page. The site uses hash URLs (`#/caravan`), so it works from any Pages path.

## How it’s built

- **Vite + React + TypeScript**, Zustand for the saved state, a tiny hash router, Vitest and Playwright.
- **Rules are plain TypeScript.** Each game’s engine (`engine.ts`) has no React in it: create a game, list legal moves, apply a move. The UI and the AI both drive games through that interface, which is what makes the rules testable.
- **Seeded randomness** (`src/core/rng.ts`) so any game can be replayed from its seed.
- **3D tables** are CSS 3D transforms, not WebGL. Caravan's play area tilts away from you in perspective, and cards land from the player's side and turn over as they're dealt and played (`src/games/caravan/caravan-3d.css`). The Blackjack felt tilts the same way, with chip stacks that rise off it (`src/games/blackjack/blackjack-3d.css`). It's on by default; switch to the flat view in Settings or with *3D view* at the table.
- **Phones** get their own layouts rather than a shrunken desktop. Each table has a compact layout for phones and small windows (in Caravan's, `caravan.css`, under *The table on phones and small windows*):
  - Held upright, the opponent, board and HUD stack. Held sideways, the board fills the left and the opponent and HUD share a column on the right, with your hand hanging off the bottom edge.
  - Cards are sized from the screen so three caravans fit across and both rows have room to grow. When your hand doesn't fit, its cards overlap and you tap the strip you can see.
  - The move log, rules, 3D switch and *Leave table* sit behind a *Menu* button.
  - Held upright, the Blackjack table becomes a deep half ellipse that fills the screen, with the spots down its sides and cards about 1.7 times the size. Its depth fits the phone (`tallShape` in `src/games/blackjack/ui/layout.ts`). Held sideways, it's the usual half circle with its cards and chips grown against the felt, and the HUD takes a column on the right. The log and table controls go behind *Menu* there too (`blackjack.css`, under *The table on phones and small windows*).
  - The hub menu opens a game with a second tap. Hover effects only apply where there's a mouse, so nothing sticks after a tap, and layouts keep clear of notches and the home indicator.
  - Added to a home screen, the hub opens full screen (`public/manifest.webmanifest`).
- **Screen transitions** are CSS animations driven by `src/navigation.ts`. Entering a game powers the terminal off and lights the table's lamp; leaving reverses it. They can be turned off in Settings and are skipped when the system asks for reduced motion.
- **Everything is drawn in code.** Cards, chips and the Blackjack felt are SVG, all audio is synthesized with Web Audio, and fonts (VT323, Share Tech Mono, and Limelight for the casino) are bundled from Fontsource. There are no third-party image or audio assets. The PNG app icons in `public/` are rendered from `favicon.svg` by `scripts/render-icons.mjs`.
- **Sound** (`src/core/audio/`): warm card whooshes and landings, clay chips clacking, a small radio band playing generative swing, waltz and blues tunes (`score.ts` holds the music theory, and is unit tested), and saloon chatter from formant-synthesized voices. The terminal hears the saloon through a wall; at a table you're in the room. Repeated notes, phrases and applause are recorded once and replayed for the rest of the visit, which keeps the CPU cost low; at most two recordings are made at a time, so making them never starves the speakers. Music and chatter are scheduled three seconds ahead, so a busy moment (a hard opponent thinking on a phone) doesn't leave a gap, and if the page falls further behind the band picks up on the next bar rather than playing everything it missed at once.

```
src/
  core/            cards, seeded RNG, caps rules
  core/audio/      mixer, sound effects, radio music, crowd chatter
  store/           the persistent save (caps, settings, records, collection)
  hub/             terminal menu, records, settings, boot screen
  components/      shared UI (SVG playing cards)
  games/caravan/   engine.ts, ai.ts, banter.ts, content.ts (sets, opponents), ui/
  games/blackjack/ engine.ts, strategy.ts, bots.ts, banter.ts, content.ts (tables, regulars), ui/
e2e/               Playwright smoke tests (smoke.spec.ts on a desktop, phone.spec.ts on a phone)
scripts/           render-icons.mjs: the PNG app icons from favicon.svg
```

### Caps

Every gambling game shares one caps balance. You start with 500. If you drop below 50 you can claim a refill back to 500, at most once every 10 minutes. The timer is saved, so reloading doesn’t reset it.

### Caravan

- **Rules:** Fallout: New Vegas rules. The full text is in the game under *How to play* and in the header of `src/games/caravan/engine.ts`. Two details where implementations differ:
  - Queens can only be played on the last card of a caravan.
  - A player who starts their turn with no cards left loses.
- **AI:** the AI never peeks at your hand. It re-deals the cards it can’t see into a set of possible hands and scores its moves across all of them. Hard also looks ahead to your best reply. Self-play results (each deal played from both seats):
  - Normal beats Easy about 80% of the time.
  - Hard beats Normal about 63% of the time. Caravan is luck-heavy, so that's a real edge.
- **Table talk:** each opponent greets you and now and then remarks on your plays and their own, in a speech bubble by their name. Big moments, like a Jack on someone's caravan or a lane pushed over 26, usually get a line; ordinary plays rarely do. Nobody talks two turns running. `banter.ts` decides when they speak; their lines are in `content.ts`.
- **Collection:**
  - You start with the 54-card Wasteland Standard set.
  - Beating each of the five opponents wins cards from their set and unlocks the next opponent.
  - The Trader sells packs from sets whose owner you've beaten.
  - Decks need at least 30 cards, including at least 12 number cards, with one copy of each card.

### Blackjack

- **Rules:** a six-deck shoe with the cut card a deck and a half from the back. Dealer stands on soft 17 and checks for blackjack under an Ace or a ten. Blackjack pays 3 to 2, rounded down to whole caps. Double on any first two cards and after splitting; split any pair (two ten-value cards count) up to four hands; split Aces get one card each. Insurance pays 2 to 1. No surrender. The full text is under *How to play*, and in the header of `src/games/blackjack/engine.ts`.
- **Tables:** you always sit in the middle of five spots. *Full table* puts four regulars around you; *One on one* is just you and the dealer. Pick low limit (5–100 caps), main floor (25–500) or high limit (100–2,000). Caps go on the felt when you bet, so leaving mid-round forfeits them, as in Caravan.
- **The regulars:** seven of them, four at the table at a time (`content.ts`). Each has their own play and betting style (`bots.ts`): perfect basic strategy, a Hi-Lo card counter who bets up when the count is high, a never-bust player, one who plays like the dealer, a reckless doubler, a timid one, and a martingale bettor. They have their own caps; when one goes broke they get up, and someone else sits down. Self-play, flat betting (each over 200,000 rounds unless noted):
  - Basic strategy loses 0.40% of what it bets over 2 million rounds, the published house edge for these rules.
  - Playing like the dealer loses about 5.7%, never busting about 4.8%.
  - The counter, betting 1 to 8 units with the count, comes out about 0.4% ahead.
- **Coach and count:** the coach lights the basic strategy play for your hand and notes in the log when you play something else. *Count* shows the Hi-Lo running and true counts. The full chart is on the *Strategy chart* page, drawn from the same data the coach uses (`strategy.ts`).
- **Table talk:** the regulars say hello, cheer a dealer bust, groan at a dealer blackjack, and have opinions about you splitting tens or taking the dealer's bust card. `banter.ts` decides who speaks and when; the dealer calls insurance, the peek and their total.
- **Tempers** (`tilt.ts`): every loss stings, more for a lost double or split, a dealer blackjack or a run of losses. Depending on their temper, a regular may swear about it (uncensored), slam the table so it shakes and the chips jump, or storm off. Slam it too often and security walks them out; bet like a card counter and the pit boss has a word. At most one scene a round, the most dramatic. An emptied seat stays open for one to three rounds before someone new sits down. In self-play, Big Sal, the worst of them, slams the table about 5 times in 100 rounds; Granny Pearl only ever swears.

## Credits

Caravan’s rules come from *Fallout: New Vegas* (Obsidian Entertainment / Bethesda Softworks). This is a fan project with original art, names and code, and it isn’t affiliated with or endorsed by either company.

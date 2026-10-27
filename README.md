# The Atomic Hub

A retro-futurist game hub for the browser: a phosphor-green terminal menu leading to card tables, a casino floor and board games. Desktop-first, no server, no accounts. Your caps, records and cards live in your browser and can be exported as a save file.

**Playable now:** Caravan, the card game from Fallout: New Vegas, against five AI opponents or a friend in hot-seat mode, with a card collection and deck builder.

**On the way:** Blackjack, Texas Hold’em, Five-Card Draw, Solitaire, Video Poker, Roulette, Craps, Slots, Connect Four, Checkers, Reversi, Battleship and Tic-Tac-Toe. See [docs/PLAN.md](docs/PLAN.md).

## Running it

```sh
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (rules engines, AI, caps, save file) |
| `npm run test:e2e` | Playwright smoke tests against a production build |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build into `dist/` |

### Deploying

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages. Turn it on once under **Settings → Pages → Build and deployment → Source: GitHub Actions**. Don’t pick *Deploy from a branch*: that publishes the raw source instead of the build, and games open to a blank page. The site uses hash URLs (`#/caravan`), so it works from any Pages path.

## How it’s built

- **Vite + React + TypeScript**, Zustand for the saved state, a tiny hash router, Vitest and Playwright.
- **Rules are plain TypeScript.** Each game’s engine (`engine.ts`) has no React in it: create a game, list legal moves, apply a move. The UI and the AI both drive games through that interface, which is what makes the rules testable.
- **Seeded randomness** (`src/core/rng.ts`) so any game can be replayed from its seed.
- **3D tables** are CSS 3D transforms, not WebGL. Caravan's play area tilts away from you in perspective, and cards land from the player's side and turn over as they're dealt and played (`src/games/caravan/caravan-3d.css`). It's on by default; switch to the flat view in Settings or with *3D view* at the table.
- **Screen transitions** are CSS animations driven by `src/navigation.ts`. Entering a game powers the terminal off and lights the table's lamp; leaving reverses it. They can be turned off in Settings and are skipped when the system asks for reduced motion.
- **Everything is drawn in code.** Cards are SVG, all audio is synthesized with Web Audio, and fonts (VT323, Share Tech Mono) are bundled from Fontsource. There are no third-party image or audio assets.
- **Sound** (`src/core/audio/`): warm card whooshes and landings, a small radio band playing generative swing, waltz and blues tunes (`score.ts` holds the music theory, and is unit tested), and saloon chatter from formant-synthesized voices. The terminal hears the saloon through a wall; at a table you're in the room. Repeated notes and phrases are recorded once and replayed, which keeps the CPU cost low.

```
src/
  core/            cards, seeded RNG, caps rules
  core/audio/      mixer, sound effects, radio music, crowd chatter
  store/           the persistent save (caps, settings, records, collection)
  hub/             terminal menu, records, settings, boot screen
  components/      shared UI (SVG playing cards)
  games/caravan/   engine.ts, ai.ts, banter.ts, content.ts (sets, opponents), ui/
e2e/               Playwright smoke tests
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

## Credits

Caravan’s rules come from *Fallout: New Vegas* (Obsidian Entertainment / Bethesda Softworks). This is a fan project with original art, names and code, and it isn’t affiliated with or endorsed by either company.

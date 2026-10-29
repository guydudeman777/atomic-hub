# The Atomic Hub

A retro-futurist game hub for the browser: a phosphor-green terminal menu leading to card tables, a casino floor and board games. Plays on desktops and phones, with no server and no accounts. Your caps, records and cards live in your browser and can be exported as a save file. Every game can also be played online with friends: one of you hosts a table and sends the others its code.

**Playable now:**
- Caravan, the card game from Fallout: New Vegas, against five AI opponents or a friend in hot-seat mode, with a card collection and deck builder.
- Blackjack at a blue-felt Vegas table, with a full table of regulars or one on one with the dealer, and a basic strategy coach.
- Five-Card Draw in a saloon’s back room, fixed limit, heads up or against up to five regulars who bluff.
- Craps on a green felt Vegas layout, with the dice in your hand, every standard bet, and regulars betting along at the rail.
- Roulette in a gilded Riviera salon, on a European, French or American wheel, with every inside and outside bet and three regulars playing their systems.
- Slots on Rocket Row, a neon slot parlor on the edge of the desert: three chrome one-armed bandits, from wasteland junk and cherries to a moon rocket chasing a progressive jackpot, with every paytable published.
- Reversi on a walnut board in an atomic-age den, against a ladder of four opponents or a friend in hot-seat mode.
- Connect Four at a booth on a boardwalk midway, against a ladder of four carnival folks or a friend in hot-seat mode.
- Tic-Tac-Toe in a booth at the Starlite Diner, Classic or Ultimate, against a ladder of four regulars or a friend in hot-seat mode.

**On the way:** Texas Hold’em, Solitaire, Video Poker, Checkers and Battleship. See [docs/PLAN.md](docs/PLAN.md).

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

## Playing online

Every game has an **Online** tab in its lobby. One player hosts a table and gets a six-character code (K7Q-X2M) and an invite link (`#/reversi/join/K7QX2M`); the others type the code in or follow the link. Your name at the table is set there too, and saved.

- **Reversi, Connect Four, Tic-Tac-Toe and Caravan:** two players. In Reversi and Connect Four the host picks the colors, which swap every game. In Tic-Tac-Toe the host picks Classic or Ultimate and who plays X, and X and O swap every game. In Caravan each of you brings your own active deck. Getting up mid-game resigns. If a player's connection drops, the game waits for them to come back to their seat. These don't use caps or go on your record.
- **Blackjack:** up to five players, each in their own spot, with regulars in the empty ones if the host wants. The deal goes out once everyone has bet (or sat out), or when the host deals without the stragglers.
- **Five-Card Draw:** up to six, plus as many regulars as the host picks. Everyone sees the table from their own chair, with only their own cards face up. A hand is dealt once everyone has asked in.
- **Craps:** up to four at the rail, betting on the same dice. The shooter keeps the dice until they seven out, then they go round the table.
- **Roulette:** up to five at one wheel, each betting their own caps in their own chip color. The croupier spins once everyone has said they're done, or when the host spins without the stragglers. The host's browser picks the pocket and sends it with the spin, so nobody can read the next number off a seed. The regulars stay home online: every browser would seat different ones, and their chips sit on the layout.
- **Slots:** up to three at machines side by side, on the machine the host picks. Nobody waits for anybody: each pull goes out with its stops, picked by the browser that pulled, and everyone sees everyone's reels turn. On Moon Rocket the whole row feeds one jackpot meter, and anyone can win it. The online meter starts at its reset and leaves your saved one alone.

At the card tables, in Craps, at Roulette and on the slot row everyone plays their own caps, and the hands go on their own record. Friends can join between rounds and leave at any time.

**How it works** (`src/net/`):

- **No server.** Browsers find each other through public Nostr relays ([Trystero](https://github.com/dmotz/trystero)), and the game itself runs over WebRTC data channels straight between them. The code is the room's password, so the relays only see encrypted handshakes. Trystero is only loaded when someone goes online.
- **The table link** (`link.ts`): the host numbers every input (a move, a bet, a throw, someone joining or leaving) and passes it to everyone. Every game is seeded, so each browser plays the same inputs through the same engine and ends up at the same table. The host sends only the setup (seed, stakes, seats) and the inputs, never the state.
- **Each game's `ui/online.ts`** turns the setup into a sitting and its inputs into moves. The card tables queue inputs until their table is ready for them: a decision waits for that hand's turn, a bet for the round to finish. Each input says when it was made, so a repeated click whose moment has passed is dropped the same way everywhere.
- **Catching up:** anyone joining late, or coming back after a reload, gets the setup and every input so far, and plays them through quietly, without touching their caps.
- **Checksums:** guests send the host a checksum of their table after each input, and a guest whose table has drifted is told to rejoin.
- **Limits:** every browser holds the whole seeded game, so someone poking around in devtools could see hidden cards. That's fine among friends, but it isn't cheat-proof. A few strict networks (some offices and mobile carriers) can't connect two browsers directly without a TURN relay, which the hub doesn't run.
- **Testing:** `?net=local` in the address swaps the relays for a BroadcastChannel between tabs of one browser. The end-to-end tests use it to seat two or three tabs at one table (`e2e/online.spec.ts`, and the Connect Four, Tic-Tac-Toe, Roulette and Slots specs), and it's handy for trying a table out alone.

## How it’s built

- **Vite + React + TypeScript**, Zustand for the saved state, a tiny hash router, Vitest and Playwright.
- **Rules are plain TypeScript.** Each game’s engine (`engine.ts`) has no React in it: create a game, list legal moves, apply a move. The UI and the AI both drive games through that interface, which is what makes the rules testable.
- **Seeded randomness** (`src/core/rng.ts`) so any game can be replayed from its seed.
- **3D tables** are CSS 3D transforms, not WebGL. Caravan's play area tilts away from you in perspective, and cards land from the player's side and turn over as they're dealt and played (`src/games/caravan/caravan-3d.css`). The Blackjack and Five-Card Draw felts tilt the same way, with chip stacks that rise off them (`blackjack-3d.css`, `draw-3d.css`). The Craps dice are 3D cubes thrown from your rail: they hit the rubber-pyramid wall in time with their sound and tumble onto the seeded result (`craps.css`, `craps-3d.css`). Reversi's discs drop onto the felt, and the ones they flank roll over in 3D, ring by ring outward from the move, lifting as they turn; in the flat view they flip in place (`reversi.css`). The Connect Four rack stands upright on the booth's counter with its front and back faces apart, and checkers fall between them under gravity and bounce as they land (`connect4-3d.css`). The roulette wheel and its felt share one tilted plane: the wheel turns one way and the ball the other, slowing until it drops, clatters off the deflectors and settles in the pocket the spin chose (`roulette.css`). Tic-Tac-Toe's placemat lies on the diner table in perspective, beside a cup and a slice of pie that stand up off the Formica, and every grid line and mark draws itself in grease pencil (`tictactoe.css`). Each slot reel is a drum of 22 faces that jerks back as the handle comes down, turns backwards through a few whole turns, overshoots as the brake catches and settles onto its stop, the three one after another (`slots.css`); online, your friends' machines either side of yours run away down the row, and the handle swings down toward you (`slots-3d.css`). It's on by default; switch to the flat view in Settings or with *3D view* at the table.
- **Phones** get their own layouts rather than a shrunken desktop. Each table has a compact layout for phones and small windows (in Caravan's, `caravan.css`, under *The table on phones and small windows*):
  - Held upright, the opponent, board and HUD stack. Held sideways, the board fills the left and the opponent and HUD share a column on the right, with your hand hanging off the bottom edge.
  - Cards are sized from the screen so three caravans fit across and both rows have room to grow. When your hand doesn't fit, its cards overlap and you tap the strip you can see.
  - The move log, rules, 3D switch and *Leave table* sit behind a *Menu* button.
  - Held upright, the Blackjack table becomes a deep half ellipse that fills the screen, with the spots down its sides and cards about 1.7 times the size. Its depth fits the phone (`tallShape` in `src/games/blackjack/ui/layout.ts`). Held sideways, it's the usual half circle with its cards and chips grown against the felt, and the HUD takes a column on the right. The log and table controls go behind *Menu* there too (`blackjack.css`, under *The table on phones and small windows*).
  - The Five-Card Draw felt becomes a tall oval held upright (`tallShape` in `src/games/draw/ui/layout.ts`), and the wide Craps layout re-lays into a tall column with bets big enough to tap (`tallShape` in `src/games/craps/ui/layout.ts`). Held upright, the roulette layout turns to run down the screen beside the wheel, as you'd see it from the end of the table (`src/games/roulette/ui/layout.ts`), and tapping a number offers every bet on it, so splits and corners don't need a fingertip on a line. The Reversi board, the Connect Four rack and the Tic-Tac-Toe placemat stay as big as fits, either way up, with the wall above them taking any room left over when the phone's upright. Held upright, your slot machine fills the screen, under a strip of your friends' plates and reels online; held sideways, it lies on its side with the paytable beside the reels (`slots.css`).
  - The hub menu opens a game with a second tap. Hover effects only apply where there's a mouse, so nothing sticks after a tap, and layouts keep clear of notches and the home indicator.
  - Added to a home screen, the hub opens full screen (`public/manifest.webmanifest`).
- **Screen transitions** are CSS animations driven by `src/navigation.ts`. Entering a game powers the terminal off and lights the table's lamp; leaving reverses it. They can be turned off in Settings and are skipped when the system asks for reduced motion.
- **Everything is drawn in code.** Cards, chips and the Blackjack felt are SVG, all audio is synthesized with Web Audio, and fonts (VT323 and Share Tech Mono for the terminal; Limelight for the casino, Monoton for its craps marquee, Rye for the saloon, Righteous for the den, Poiret One for the salon, Bungee for the midway, Pacifico for the diner and Atomic Age for the slot parlor) are bundled from Fontsource. There are no third-party image or audio assets. The PNG app icons in `public/` are rendered from `favicon.svg` by `scripts/render-icons.mjs`.
- **Sound** (`src/core/audio/`): warm card whooshes and landings, clay chips clacking, dice skipping down the felt and cracking off the wall, a roulette ball whirring round the track and rattling into its pocket, board discs set down and turned over, plastic checkers clacking into the rack and clattering out of it, grease pencil scratching a placemat, a slot handle's ratchet and spring, reels whirring and clunking to a stop one by one, credits dinging up and the jackpot bell, a small radio band playing generative swing, waltz and blues tunes (`score.ts` holds the music theory, and is unit tested), and saloon chatter from formant-synthesized voices. The terminal hears the saloon through a wall; at a table you're in the room. Repeated notes, phrases and applause are recorded once and replayed for the rest of the visit, which keeps the CPU cost low; at most two recordings are made at a time, so making them never starves the speakers. Music and chatter are scheduled three seconds ahead, so a busy moment (a hard opponent thinking on a phone) doesn't leave a gap, and if the page falls further behind the band picks up on the next bar rather than playing everything it missed at once.

```
src/
  core/            cards, seeded RNG, caps rules, poker hand evaluator (poker.ts)
  net/             online tables: transports (Nostr, local), the table link, the Online tab
  core/audio/      mixer, sound effects, radio music, crowd chatter
  store/           the persistent save (caps, settings, records, collection)
  hub/             terminal menu, records, settings, boot screen
  components/      shared UI (SVG playing cards)
  games/caravan/   engine.ts, ai.ts, banter.ts, content.ts (sets, opponents), ui/
  games/blackjack/ engine.ts, strategy.ts, bots.ts, banter.ts, content.ts (tables, regulars), ui/
  games/draw/      engine.ts, strategy.ts, ai.ts, banter.ts, content.ts (tables, regulars), ui/
  games/craps/     engine.ts, odds.ts (exact house edges), calls.ts (the stickman), rail.ts (the regulars), content.ts (tables, bet guide), ui/
  games/roulette/  engine.ts, odds.ts (exact house edges), calls.ts (the croupier), regulars.ts (systems and talk), content.ts (wheels, tables, bet guide), ui/
  games/slots/     engine.ts, machines.ts (reel strips and paytables), odds.ts (exact returns), calls.ts (the change girl), content.ts, ui/
  games/reversi/   bits.ts, engine.ts, ai.ts, banter.ts, content.ts (opponents), ui/
  games/connect4/  engine.ts, ai.ts, banter.ts, content.ts (opponents), ui/
  games/tictactoe/ engine.ts, ai.ts, banter.ts, content.ts (opponents), ui/
e2e/               Playwright smoke tests: smoke.spec.ts and <game>.spec.ts on a desktop, phone.spec.ts and <game>.phone.spec.ts on a phone
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

### Five-Card Draw

- **Rules:** one deck, shuffled fresh every hand. Everyone antes and gets five cards from the button’s left. A betting round at the small bet, then one draw: up to three cards, or four keeping an Ace. Then a round at the big bet (twice the small) and the showdown. Fixed limit, a bet and three raises a round. No openers: anyone may bet, and if everyone checks the hand still goes to the draw. All-ins and side pots are handled; an all-in short of a full raise doesn’t reopen the betting, and an odd cap in a split pot goes to the first winner left of the button. The full text is under *How to play*, and in the header of `src/games/draw/engine.ts`.
- **Hands:** `src/core/poker.ts` ranks any five cards and names them (“Two pair, Kings and Sevens”). Video Poker and Hold’em will share it. It’s checked against all 2,598,960 five-card hands, category by category.
- **Tables:** heads up, or with up to five regulars. Pick penny ante (ante 1, bets 2 and 4), the back room (5, 10 and 20; needs 100 caps) or the cattlemen’s game (25, 50 and 100; needs 500). Your caps are your stack: antes and bets leave your wallet as you make them, so getting up mid-hand forfeits only what’s in the pot. Each hand you play goes on the record.
- **The regulars:** seven of them (`content.ts`), each with a style in `ai.ts`: tightness, aggression, bluffing, sandbagging and draw habits. Widow Mae plays tight and aggressive and Preacher Eli is a rock. Dutch Hendry is a maniac, and Rosie Two-Guns calls everything and chases inside straights. Silas Pike sandbags, Kid Larkin keeps a kicker and stands pat on air, and the Colonel plays steady. Nobody sees a hidden card: they judge a hand from how finished hands usually come out by how many cards each player drew, and read every bet and raise as strength. When one goes broke, someone else sits down after a hand or three. Self-play:
  - Heads up, each deal from both seats, 100,000 hands each: a steady by-the-book player beats Dutch by 8.4 big bets per 100 hands, Rosie by 5.6, Kid Larkin by 2.5 and the Colonel by 1.5. It breaks even with Silas (+0.4) and loses narrowly to Widow Mae (−1.0) and Preacher Eli (−1.8), who only put caps in with the goods.
  - Six-handed, 60,000 hands with everyone rotated through every seat: Widow Mae +2.8, the steady player +2.2, Silas +1.8, Eli −1.2, Rosie −2.2, Dutch −3.3.
- **Hints:** before your draw the book’s keepers are marked on your cards, with the reason in the terminal, and the log notes it when you draw differently (`strategy.ts`). The book stands pat on a straight or better and keeps trips or two pair; then four to a straight flush, a pair of Jacks or better, four to a flush, a small pair, then an open-ended straight draw. Otherwise it keeps an Ace and draws four, or the two highest and draws three.
- **Table talk:** the regulars say hello and goodbye, groan at a bad beat with two pair or better, own up when a bluff gets called, crow over big pots, and needle you for standing pat or drawing four. They never give away a hand they didn’t show. The dealer calls the draw, the cap and who takes the pot (`banter.ts`).

### Craps

- **Rules:** one end of a Las Vegas table, and you’re the shooter. On the come-out, 7 or 11 wins the pass line and 2, 3 or 12 loses. Any other number is the point, which has to roll again before a 7. As in Vegas, the shooter needs a pass line or don’t pass bet to come out. The full text is under *How to play*, and in the header of `src/games/craps/engine.ts`.
- **Bets:**
  - Pass and Don’t Pass (bar 12), Come and Don’t Come, with odds behind any of them at 3-4-5×, or laid up to 6×.
  - The Field: 2 pays double, 12 pays triple.
  - Place 4 to 10, paying 9 to 5, 7 to 5 and 7 to 6, off on the come-out.
  - Hardways at 7 or 9 to 1, and the one-roll bets: any seven 4 to 1, any craps 7 to 1, yo 15 to 1, aces and boxcars 30 to 1.
  - Bets go down in the units a dealer asks for, so every payout is whole caps: the 6 and 8 are placed in sixes, for example. A chip that doesn’t fit is rounded up, and the dealer says so.
  - Pass line bets with a point and come bets on their numbers can’t come down; everything else can.
- **House edges:** worked out exactly in `odds.ts` by playing each bet through the engine against all 36 rolls until it’s decided, and tested against the published figures. Pass and come 1.41%, don’t pass and don’t come 1.36%, the field 2.78%, place 6 and 8 1.52%, 5 and 9 4.00%, 4 and 10 6.67%, odds nothing at all. Hard 6 and 8 9.09%, hard 4 and 10 11.11%, any seven 16.67%, any craps and yo 11.11%, aces and boxcars 13.89%. The *Bets and odds* page shows the same numbers.
- **Tables:** low limit (5 to 200 caps, propositions from 1), the main pit (25 to 1,000, propositions from 5) or high limit (100 to 3,000, propositions from 25). Caps go on the layout when you bet. Getting up hands back every bet that can come down and forfeits the rest. Every roll that decides one of your bets goes on the record, with that roll’s net caps.
- **Guide:** says what any bet pays and its house edge as you point at or tap it, and lights up the pass line, then full odds behind it.
- **The stickman and the rail:** the stickman calls every roll (“Yo-leven!”, “Six the hard way”, “Seven out, line away”). Three of five regulars play beside you (`rail.ts`), each betting their own caps on your dice through the same engine: Doc takes full odds, Lou bets the don’t, Rosa places the 6 and 8, Spike plays the hardways and Bea plays the field. They talk about points made, seven-outs, long hands and hardways, and when one goes broke someone else steps up. The crowd cheers a point made and groans at a seven-out.

### Roulette

- **Rules:** three wheels. The European wheel has 37 pockets and a single zero. The French wheel is the same wheel with la partage: when the ball finds zero, even-money bets lose only half, so they go down in twos and the half is whole caps. The American wheel has 38 pockets, with a double zero. Winning bets are paid and stay up; losing ones are swept. Any bet can come down until the spin. The full text is under *How to play*, and in the header of `src/games/roulette/engine.ts`.
- **Bets:**
  - Straight up 35 to 1, split 17, street 11, corner 8, six line 5, dozens and columns 2 to 1, and even money on red or black, odd or even, 1 to 18 or 19 to 36.
  - Around the zero on a single-zero layout: the 0/1, 0/2 and 0/3 splits, the trios 0/1/2 and 0/2/3, and the first four at 8 to 1. On the American layout: the 0/00, 0/1, 0/2, 00/2 and 00/3 splits, the trios 0/1/2, 0/00/2 and 00/2/3, and the top line at 6 to 1.
  - A mouse can click the lines between numbers. On a touch screen, tapping a number offers every bet on it; right-click or Shift+Enter does the same on a desktop.
- **House edges:** worked out exactly in `odds.ts` by playing each bet through the engine against every pocket, and tested against the published figures. Every European bet costs 2.70%. On the French wheel the even chances cost 1.35% and the rest 2.70%. On the American wheel every bet costs 5.26%, and the top line 7.89%. The *Bets and odds* page shows the same numbers.
- **Tables:** the Salon (inside bets 1 to 25 a number, outside 5 to 250), the Grand Salon (5 to 100, and 25 to 1,000) or the Salon Privé (25 to 500, and 100 to 5,000), each with its own croupier and chips. An inside bet takes the straight-up maximum for each number it covers. Caps go on the layout when you bet, and getting up hands everything back. Every spin you had bets on goes on the record, with its net caps.
- **Guide:** says what any bet pays and its house edge as you point at or tap it. At the French wheel it lights up the even chances.
- **The croupier and the regulars:** the croupier calls each number with its even chances (“Seventeen, black, odd, low”), and at the French wheel calls the game in French (“Dix-sept, noir, impair et manque”, “Rien ne va plus”). Three of six regulars sit in, each with their own caps and chip color (`regulars.ts`): Monsieur Duval doubles up on red after every loss, Contessa Lucia bets 7, 11 and 23 straight up, Professor Kranz climbs the Fibonacci sequence on black, Mr. Sterling plays the Bond spread, Mimi Laurent bets the last three numbers, and Colonel Ashby takes the two dozens the last number missed. They talk about their numbers, zeros, repeats and streaks. One who goes broke leaves, and someone else sits down a few spins later. The crowd cheers a straight-up hit.

### Slots

- **Rules:** three reels and one pay line, the middle row. You play one, two or three coins a pull, and every pay is so many coins for each coin played, but for the top award. Only the highest win on the line is paid. The full text is under *How to play*, and in the header of `src/games/slots/engine.ts`.
- **The reels:** each has 22 stops, a symbol and then a blank all the way round, as on the old mechanical reels. Behind each reel are 64 numbers, and every stop owns a few of them: a pull draws a number for each reel and stops it there. That's the virtual reel every machine has used since the 1980s. Every machine's top symbol owns 2 of a reel's 64, so three of them come up once in 32,768 pulls, and the blanks either side own more, which is why it so often shows just off the line. The paytable page lists every stop and its numbers (`machines.ts`).
- **The machines:**
  - *Bottle Caps*, a cap a coin: tin cans, horseshoes, bells and bottle caps, and cherries. A cherry anywhere on the line pays, and so does any three junk. A straight multiplier: 94.96% back for one coin or three, and something pays one pull in 3.7.
  - *Atomic Sevens*, five caps a coin: sevens and bars round a wild atom that stands in for any symbol on a line and doubles it, or quadruples it two at a time. Three atoms pay 1,000, 2,000 or 4,000 coins, so three coins return 95.01% and one or two 93.99%. A hit every 7.4 pulls.
  - *Moon Rocket*, 25 caps a coin: rockets, saucers, robots, ray guns and ringed planets. Three rockets on three coins win the jackpot meter, which starts at 100,000 caps and grows by 2% of every three-coin bet on the row, your friends' included online; one or two coins win 1,000 or 2,000 coins instead. Three coins return 93.07% with the jackpot at its reset, plus the 2% to the meter: 95.07%. One or two coins return 92.05%. A hit every 9.2 pulls. The meter is saved where you leave it, and once it passes about 270,000 caps, three coins return more than they cost.
- **Returns:** worked out exactly in `odds.ts`, from every way the reels can stop, weighted by their numbers, through the engine's own paytable, and checked in the tests against a count of all 22³ stops and a long run of real pulls. The *Paytables* page shows each line's odds and its share of the return.
- **Guide:** says what the machine gives back and how often it pays, what the line you just hit comes up and is worth, and on Moon Rocket what three coins return with the meter where it is.
- **Dottie:** Dottie the change girl says hello, calls the big winners and the jackpots for the whole floor, and now and then sings out for change. Offline you have the row to yourself: there are no machines beside yours to draw, which keeps the table light on slower laptops and Chromebooks. Every pull of yours goes on the record, with what it won or lost.

### Reversi

- **Rules:** tournament rules on an 8×8 board. White starts on d4 and e5, Black on d5 and e4, and Black moves first. A move must flank at least one line, and every flanked line turns, in all eight directions. You pass only when you have no move. The game ends when neither side can move, and any empty squares go to the winner. The full text is under *How to play*, and in the header of `src/games/reversi/engine.ts`.
- **The engine:** bitboards held as two 32-bit halves (`bits.ts`), checked against a plain square-by-square version over hundreds of random games.
- **Opponents:** four of them, each unlocked by beating the one before. Buddy Novak counts discs and nothing else. Aunt Marge plays by a table of square values. Mr. Fairbanks and Dr. Ida Lund weigh corners, stable edges, mobility, frontier, and the X- and C-squares next to empty corners, with weights tuned by self-play. Their search is alpha-beta, deepening until its time is up (a quarter of a second at most); Fairbanks solves the last 8 squares exactly and Lund the last 14. Self-play, 50 openings each played from both colors:
  - Aunt Marge beats Buddy 94.5% of the time.
  - Mr. Fairbanks beats Aunt Marge 86.5% of the time.
  - Dr. Lund beat Mr. Fairbanks in all 100 games. She’s the last rung.
- **Hot-seat:** two named players at one board. Nothing in Reversi is hidden, so there’s no handoff screen. Against the AI you choose your color, and the game goes on your record; leaving early counts as a loss. Hot-seat games don’t.
- **On the board:** *Show moves* marks the squares you can play, and the last disc played wears an orange pip. A pass is announced over the board, and the AI waits until you’ve read it. Arrow keys and Enter play, or type a square’s name, such as D then 3.
- **Table talk:** each opponent has lines for a corner taken, a pass, a sweep of six or more discs, and now and then an ordinary move. Nobody talks two moves running. `banter.ts` decides when they speak; their lines are in `content.ts`.

### Connect Four

- **Rules:** a 7×6 rack standing upright, with 21 checkers each. Red drops first, and a checker falls to the lowest empty hole in its column. Four in a row across, up or on a diagonal wins at once, and a full rack with no four is a draw. The full text is under *How to play*, and in the header of `src/games/connect4/engine.ts`.
- **The AI:** negamax with alpha-beta on bitboards, in Pascal Pons's 49-bit layout kept as two 32-bit halves.
  - In every position it takes a win if there is one, blocks if it must, and never drops just under a hole the other side wins with.
  - Positions are judged by each side's threats. A threat on the rows a player wants for the endgame (odd rows for Red, even for Yellow) counts double, and checkers near the middle count a little.
  - A transposition table carries over from move to move. The search deepens until its time budget runs out, and a search that reaches a full rack is an exact solve, checked against brute force in the tests.
- **Opponents:** four of them, each unlocked by beating the one before. Skeeter Malone from the ring toss looks two moves ahead and often drops at random. Mabel Pruitt from the cotton-candy cart looks four ahead, and Vic Sharpe, the guess-your-weight pitchman, eight. Madame Zora the fortune teller searches as deep as 350 ms allows (13 plies from the opening on a desktop) and solves the last 24 holes. Self-play, all 49 two-move openings, each played from both colors:
  - Mabel beats Skeeter 86.2% of the time.
  - Vic beats Mabel 85.7% of the time.
  - Madame Zora beats Vic 89.3% of the time.
- **On the rack:** a checker waits over the column you point at. Click or tap a column, use ← → and Enter (or ↓), or press 1–7. The winning four light up and the bulbs along the awning chase. *Threats* marks every hole that would make four, in the color of whoever it's for. At *Play again* the slider is pulled and the last game's checkers fall out of the bottom. Against the AI the game goes on your record, and leaving early counts as a loss. Hot-seat games don't.
- **Table talk:** each opponent has lines for a win blocked, a new threat, the middle of the bottom row, and now and then an ordinary drop. Nobody talks two moves running. `banter.ts` decides when they speak; their lines are in `content.ts`.

### Tic-Tac-Toe

- **Rules:** Classic is the 3×3: three in a row wins, and a full grid with no line is a cat’s game. Ultimate is nine small grids in a big 3×3. The square you mark sends your opponent to the matching grid; if that grid is won or full, they may play in any open grid instead. Three in a row wins a small grid, a full one counts for nobody, and three small grids in a row wins the game. X always moves first. The full text is under *How to play*, and in the header of `src/games/tictactoe/engine.ts`.
- **Opponents:** four regulars, each unlocked by beating the one before at either game: Skip Dawson the paperboy, Bev Kowalski the waitress, Gus Petrakis the short-order cook, and Ambrose Whitlock at the end of the counter.
  - Classic is solved exactly (`ai.ts`). Whitlock plays it perfectly, and among the moves that draw he picks the one that leaves you the most ways to go wrong, so nobody beats him there. The others miss wins or blocks now and then, or play without looking.
  - Ultimate is played by Monte Carlo tree search, from 150 random playouts a move (Skip) to 30,000 smarter ones (Whitlock), capped at a second and a half. It thinks in short slices, so the table keeps moving.
  - Self-play, half the games from each side. Classic, 2,000 games each: Bev beats Skip 68% of the time and loses 8%; Gus beats Bev 24% and draws 71%; Whitlock never loses, and draws 92% against Gus. Ultimate, 100 games each: Bev beats Skip 91% of the time, Gus beats Bev 90%, and Whitlock beats Gus 81%, with 15 draws.
- **On the table:** the grid draws itself on the placemat at the start of each game, then every mark, with a waxy scratch. The winning three is struck through in the winner's pencil, and a won small grid gets one big mark. In Ultimate the grid you're sent to is run over with a highlighter. Keys 1–9 play as on a number pad (7 is the top left); in Ultimate a key picks the square in the grid you're sent to, or the grid and then the square when you're free. Arrow keys and Enter work too. The plates keep score for the sitting. Against the AI you keep your mark from game to game, and each game goes on your record; at hot-seat, X and O swap.
- **Table talk:** each regular has lines for a fork, a block, a threat, a small grid won and being sent anywhere. Nobody talks two moves running. `banter.ts` decides when they speak; their lines are in `content.ts`.

## Credits

Caravan’s rules come from *Fallout: New Vegas* (Obsidian Entertainment / Bethesda Softworks). This is a fan project with original art, names and code, and it isn’t affiliated with or endorsed by either company.

# Architecture

How the dashboard, the game server and the bots fit together. Setup, the bot protocol and configuration are covered in the [README](README.md).

## Components

```
Dashboard (Next.js :3001)
  │  REST: upload/list/delete bots      Socket.IO: new_match → MATCH_UPDATE (to the starting socket only)
  ▼
Server (Node.js :3000, listens on 127.0.0.1 by default)
  ├── bots/botStore.js      bot registry, saved to runtime/bots/bots.json
  ├── bots/cppBotRunner.js  validate → include check (-M) → compile → warm-up run
  ├── bots/sandbox.js       sandbox-exec (macOS) / bwrap (Linux) + ulimits
  ├── match/matchRunner.js  runs N hands, emits updates
  └── game/                 Texas Hold'em rules (pokerGame.js), hand evaluation, deck
  │
  │  one process per decision: JSON state on stdin → JSON action on stdout (500 ms)
  ▼
Compiled C++ bot binaries (sandboxed)
```

The standalone C++ engine in the repo root is a separate terminal game. The server doesn't use it.

## Game engine (`server/game/pokerGame.js`)

- **Seating:** players with 0 chips sit out. The button moves to the next player who still has chips.
- **Blinds:** posted from the stack into `currentBet`. The pot holds only chips from finished streets, so nothing is counted twice.
- **Betting round:** a queue of players who still need to act. A full raise puts every other active player back in the queue. A short all-in only adds players who haven't matched it. The round ends when the queue is empty or one player remains.
- **Showdown:** `buildPots` splits each player's total contribution into a main pot and side pots. Each pot goes to the best hand among the players eligible for it. Odd chips go to the first winner left of the button.

`server/test/pokerGame.test.js` covers these rules. It includes a fuzz test that plays about 2,000 random hands across 2–9 player tables and checks that chips are never created or lost.

## Bot pipeline

1. **Validate:** extension, size, `int main`, and a blocklist of dangerous constructs (checked after joining lines split with `\`).
2. **Include check:** `-M -MF` dependency output. Every file must be the bot itself or live in the compiler's system include dirs.
3. **Compile** in a temporary job directory, inside the sandbox, with CPU and memory limits. Compiler errors have local paths removed and are truncated.
4. **Warm up:** run the bot once so slow first-launch checks don't count against its first in-game decision.
5. **Run:** each decision spawns the sandboxed binary with an empty environment, a 500 ms timeout and a 4 KB output cap. Anything other than a valid action counts as a fold.

## Strategy builder (`dashboard/app/builder`)

A drag-and-drop editor at `/builder` for players who don't write C++. A strategy is a graph of question blocks (yes/no) and move blocks. `dashboard/lib/strategy.js` holds:

- **`decide`:** walks the graph in JS for the "try a hand" panel and highlights the path taken.
- **`generateCpp`:** emits one C++ function per reachable block plus a fixed hand-analysis prelude, then uploads it through `POST /api/bots` like any other bot. Block params are whitelisted before they reach the source.

The JS `analyze` and the C++ prelude implement the same hand reading (starting-hand tier, made hand, draws, rough equity) and must change together. Open branches fall back to check / fold. The graph is saved in `localStorage`.

## Two arena modes

`dashboard/lib/api.js` picks the mode from `NEXT_PUBLIC_API_URL`:

- **Server** (set, as in `dashboard/.env.development`): the C++ arena described above, with uploads, compiling and matches on the game server.
- **Browser** (unset, as in the public build): matches run on the page via `lib/localArena.js`, which drives the same engine (`server/game`, imported through `experimental.externalDir`) with builder strategies as the players. Bots are the house bots (the builder templates) plus strategies the visitor saved, kept in their browser's localStorage (`lib/myBots.js`). No visitor code runs anywhere, and there is no backend to host.

## Multiplayer tables (`dashboard/app/table`, `dashboard/worker`)

`/table` is regular Hold'em between people. Opening a table makes an 8-character code; the invite link is `/table?room=<code>`. Tables are private: whoever opens one chooses a PIN (4–12 letters or digits), and a socket receives nothing, not even the seat list, until it sends that PIN. The link finds the table; the PIN, sent separately, gets you in. After 10 wrong PINs in 10 minutes the table refuses all PINs for the rest of that window; people already in stay connected. Up to six seats; the first person seated is the host, who sets stack and blinds, deals, pauses and starts rematches.

- **`worker/pokerTable.js`** is a Durable Object, one per code (`idFromName`). It runs `server/game` with each player's `getAction` waiting on their WebSocket, so the deck and hole cards exist only there. Every socket gets its own view: your cards, everyone else's only via the showdown event.
- **Seats** are claimed with a random token kept in the browser's localStorage (with the PIN, so returning players aren't asked again), so a refresh or dropped connection takes the same seat back. New seats open only between games.
- **Between hands** the result shows for 12 s, or until every seat clicks "next hand". There's no hand limit: a game runs until one player has every chip.
- **Rematch:** when a game ends, every screen shows the last hand and a rematch button. Anyone seated can ask; once every seat has, stacks reset and the next game deals immediately.
- **Hand reading** (`lib/hands.js`): names hands in words, explains each result ("two pair beats a pair", kickers, split and side pots) using the engine's own evaluator, and finds your best five cards. It drives the "why" box after every hand (arena too) and the hand guide sidebar (`components/HandGuide.js`).
- **Sound** (`lib/sounds.js`): effects synthesised with Web Audio, so no audio files. They're triggered by new log events, your turn and incoming chat; muting is saved per browser.
- **Deleting:** any seated player can delete the table when no game is running (lobby or game over; pause first mid-game). The object wipes its storage with `deleteAll()`, tells everyone with the PIN who deleted it, and closes every socket; each browser drops its saved PIN and seat token for that code. The code then opens as a brand-new table.
- **Persistence:** seats, chips, button, hand count and chat are saved after every hand. Sockets use `accept()`, not hibernation, because a hand in progress is an in-memory promise; if the object restarts, the hand in progress is lost and the table reopens paused at the last finished hand.
- **`worker/index.js`** routes `/api/table/<code>/ws` (same-origin upgrades only) to the object; `run_worker_first: ["/api/*"]` keeps every other path on static assets.

Every page shares `components/NavBar.js`, mounted in the root layout.

Test locally with `npx next build && npx wrangler dev`: `next dev` has no Worker, so tables don't connect there.

## Hosting at bevishnu.com/poker

`npm run build:site` (in `dashboard/`) builds a browser-mode static export into `dashboard/out/` with `BASE_PATH=/poker`; `npm run deploy` builds and uploads it as the `poker-dashboard` Worker (`dashboard/wrangler.jsonc`). The same Worker hosts the multiplayer Durable Objects. That Worker has no public URL of its own: the bevishnu.com Worker (separate repo) forwards `/poker/*` to it through a service binding with the prefix stripped, so deploy this Worker first.

- `public/_headers` sets the security headers (CSP, HSTS, nosniff, frame and permissions policies) and caches `/_next/static/*` forever (the filenames are content-hashed).
- JetBrains Mono comes from `next/font` and is bundled at build time, so the page makes no third-party requests and the CSP can stay `'self'`. `'unsafe-inline'` scripts are needed for Next's inline bootstrap in a static export.
- Plain `<img>` paths go through `lib/asset.js` to pick up the base path; `next/link` adds it itself.

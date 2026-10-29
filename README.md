# Poker Tourney

**A Texas Hold'em platform for building and pitting C++ poker bots—with a standalone engine, Node.js game server, and real-time web dashboard.**

---

## What This Is

- **Standalone C++ engine** — Full Texas Hold'em in the terminal; text-based commands for AI or human play.
- **Web platform** — Upload C++ bots via the dashboard, run multi-bot matches, and watch live tables over Socket.IO.
- **Bot protocol** — Bots talk JSON over stdin/stdout: one line in (game state), one line out (action). No networking, no threads—just a single executable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard (Next.js, port 3001)                                 │
│  • Create/edit/delete C++ bots   • Start matches   • Live view   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP + Socket.IO
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Server (Node.js, port 3000)                                    │
│  • REST API for bots & matches   • Compiles C++   • Runs games   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ spawn + stdin/stdout
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  C++ Bot Executables (one per bot)                              │
│  stdin: one JSON line (state)  →  stdout: one JSON line (action) │
└─────────────────────────────────────────────────────────────────┘
```

The **C++ engine** in the repo root (`poker_engine.exe` / `./poker_engine`) is separate: it’s for local, interactive or scripted play and doesn’t use the server.

---

## Features

| Area | Details |
|------|--------|
| **Game** | Texas Hold'em: blinds, pre-flop → flop → turn → river, full hand evaluation, side pots, all-in. |
| **Hand eval** | All 21 five-card combinations from 7 cards; standard high-hand ranking. |
| **Bots** | C++ only (for the web platform). Upload source; the server compiles and runs it inside an OS sandbox where available (see [Security](#security)). |
| **Matches** | 2–9 bots, configurable hands (10–10,000), blinds, and starting stack. Live updates over Socket.IO. |
| **Standalone** | CLI engine for testing strategies or driving with your own AI via the text protocol. |

---

## Prerequisites

- **Node.js** (v18+) — for server and dashboard.
- **C++ compiler** — for building the standalone engine and for the server to compile uploaded bots:
  - **Windows:** MinGW-w64 (e.g. via [MSYS2](https://www.msys2.org/) or [winlibs](https://winlibs.com/)); ensure `g++` is on `PATH`.
  - **Linux/macOS:** `g++` or `clang++` with C++17.

---

## Quick Start

### 1. Run the web platform (server + dashboard)

**Terminal 1 — API and game server (port 3000):**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 — Dashboard (port 3001):**
```bash
cd dashboard
npm install
npm run dev
```

- Open **http://localhost:3001** for the UI.
- API base: **http://localhost:3000** (e.g. `GET /api/bots`, `POST /api/matches/run`).
- Uploaded bots are saved to `server/runtime/bots/` and survive restarts.

**Tests:**
```bash
cd server && npm test   # game engine: betting rules, side pots, chip conservation fuzz test
make test               # standalone C++ hand evaluator
```

Create bots in the dashboard (paste C++ source), then start a match with 2+ bots. You’ll see live chip counts and table updates.

### 2. (Optional) Build and run the standalone C++ engine

**Windows:**
```cmd
build.bat
poker_engine.exe
```
Clean: `clean.bat`

**Linux/macOS:**
```bash
make
./poker_engine
```

The standalone engine uses a **text command** protocol (see below), not the JSON stdin/stdout bot protocol used by the server.

---

## Project Structure

```
poker_tourney/
├── server/                    # Node.js game server & bot runner
│   ├── server.js               # Express + Socket.IO, REST API
│   ├── game/                   # Poker logic (JS)
│   │   ├── card.js
│   │   ├── handEvaluator.js
│   │   └── pokerGame.js
│   ├── bots/
│   │   ├── botStore.js         # Bot registry, persisted to runtime/bots/bots.json
│   │   ├── cppBotRunner.js     # Validate, compile & run C++ bots (stdin/stdout)
│   │   └── sandbox.js          # OS sandbox (sandbox-exec / bubblewrap) + resource limits
│   ├── match/
│   │   └── matchRunner.js      # Run multi-hand matches
│   ├── test/                   # node --test suite for the engine
│   └── runtime/bots/          # Compiled bot binaries, source & bots.json (generated)
├── dashboard/                 # Next.js app (port 3001)
│   ├── app/
│   ├── components/             # BotUploadPanel, LiveTable, Leaderboard, etc.
│   └── ...
├── samples/                   # Example C++ bots (for web platform)
│   ├── calling_station.cpp
│   ├── tight_aggressive.cpp
│   ├── pot_odds_bot.cpp
│   ├── mdf_bot.cpp
│   └── gto_balanced.cpp
├── card.cpp / card.h          # Standalone engine: cards & deck
├── hand_evaluator.cpp / .h    # Standalone engine: hand ranking
├── player.cpp / player.h      # Standalone engine: player base
├── poker_game.cpp / .h       # Standalone engine: game loop
├── main.cpp                   # Standalone engine entry
├── tests/                     # Standalone engine tests (make test)
├── Makefile
└── build.bat / clean.bat / run.bat
```

---

## Standalone C++ Engine (CLI)

The engine in the repo root is for local play. It’s **not** used by the web server.

### Commands (when it’s your turn)

| Command | Description |
|--------|-------------|
| `fold` | Fold your hand. |
| `call` | Match the current bet. |
| `check` | Pass (only when no bet to call). |
| `raise <amount>` | Raise by that amount (e.g. `raise 100`). |
| `all-in` / `allin` | Bet entire stack. |

### Card format

- One card: rank + suit, e.g. `Ah` (ace of hearts), `Kd`, `Tc`, `2s`.
- Ranks: `2`–`9`, `T`, `J`, `Q`, `K`, `A`.

### Hand ranking (high to low)

1. Straight Flush  
2. Four of a Kind  
3. Full House  
4. Flush  
5. Straight  
6. Three of a Kind  
7. Two Pair  
8. Pair  
9. High Card  

The engine evaluates all 21 five-card combinations from your 7 cards and uses the best hand.

---

## Writing C++ Bots (Web Platform)

Bots used by the **server** must follow the **stdin/stdout JSON protocol**. The server compiles your single-file C++ and runs it once per action; no persistent process.

### Protocol

- **Input:** Exactly one line on stdin — a JSON object with the current state.
- **Output:** Exactly one line on stdout — a JSON object with your action.

**Input (server → bot):**
- `stage` — `"pre-flop"` \| `"flop"` \| `"turn"` \| `"river"` \| `"showdown"`
- `pot` — total pot (including current round bets)
- `currentBet` — current bet to match
- `minRaise` — minimum raise amount
- `toCall` — amount you need to put in to call
- `myChips` — your stack
- `myCards` — array of strings, e.g. `["Ah","Kd"]`
- `communityCards` — e.g. `["Js","Th","3c"]`
- `opponents` — array of `{ name, chips, currentBet, allIn }`

**Output (bot → server):**
- `action` — one of: `"fold"`, `"check"`, `"call"`, `"raise"`, `"all-in"` (or `"allin"`)
- `amount` — required only for `"raise"` (integer): how much to raise **by**, on top of calling. It is **not** the total bet.
  For example, with `currentBet: 40`, `toCall: 40` and `{"action":"raise","amount":60}`, you put in 100 and the bet becomes 100.

Example response: `{"action":"call"}` or `{"action":"raise","amount":80}`

How the server interprets actions:
- A raise below `minRaise` is raised to `minRaise`. A raise you can't afford becomes all-in.
- `call` with nothing to call counts as `check`; `check` when there *is* something to call counts as a **fold**.
- Invalid output, a crash, or no answer within the timeout counts as a **fold**.
- Players who run out of chips sit out. All-ins create side pots: you can only win from each opponent as much as you put in.

### Sample bots

- **`samples/calling_station.cpp`** — Checks when possible, otherwise calls.
- **`samples/tight_aggressive.cpp`** — Tight range, raises when in hand.
- **`samples/pot_odds_bot.cpp`** — Simple pot-odds / equity-based decisions.
- **`samples/mdf_bot.cpp`** — Minimum defense frequency style.
- **`samples/gto_balanced.cpp`** — More balanced strategy.

Copy or adapt these; they’re valid for upload to the dashboard (single file, `int main()`, one JSON line out).

### Constraints (server)

- Single C++17 source file; must define `int main()`.
- Max length ~120 KB of code.
- Must write exactly one JSON line to stdout.
- Only standard library / system headers may be `#include`d.
- No: `system()`, `popen()`, `exec*`, `fork`, `syscall`, `dlopen`, inline `asm`, token pasting (`##`), `#embed`, `__has_include`, `<thread>`, `<future>`, `<filesystem>`, `<windows.h>`, sockets.
- Action timeout 500 ms per decision; compile timeout 20 s.

---

## Security

The server compiles and runs code uploaded by other people, so it uses several layers of protection:

1. **Source checks:** a blocklist of dangerous APIs and preprocessor tricks. This is easy to get around on its own, so the layers below are what actually protect the host.
2. **Include allowlist:** the compiler's dependency output (`-M`) must list only the bot's own file and system headers. This stops `#include "/etc/passwd"`-style leaks through compile errors.
3. **OS sandbox** for both compiling and running bots:
   - **macOS:** `sandbox-exec`. No network, no file writes, and reads limited to the toolchain and system libraries.
   - **Linux:** [bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`), if installed. All namespaces are unshared (no network), and only `/usr` and `/lib*` are mounted, read-only.
   - **Windows, or Linux without `bwrap`:** no sandbox. A warning is printed at startup.
4. **Resource limits:** CPU time (`ulimit -t`) and, on Linux, memory (`ulimit -v`). Bots also get an empty environment and capped output.
5. **Network exposure:** the server listens on `127.0.0.1` by default. CORS only allows the dashboard origin. Setting `API_TOKEN` requires a token for all uploads, deletes and matches.

For a public deployment, set `BOT_SANDBOX=required` and `API_TOKEN`, and preferably run the whole server in a container or VM as well.

### Configuration

| Variable | Where | Default | Meaning |
|---|---|---|---|
| `PORT` | server | `3000` | HTTP port |
| `HOST` | server | `127.0.0.1` | Interface to listen on (`0.0.0.0` exposes it to your network) |
| `API_TOKEN` | server | *(unset)* | When set, uploads/updates/deletes, matches and socket connections need `Authorization: Bearer <token>` |
| `CORS_ORIGIN` | server | `http://localhost:3001,http://127.0.0.1:3001` | Comma-separated origins allowed to call the API |
| `BOT_SANDBOX` | server | `auto` | `auto` (use if available), `required` (refuse to start without one), `off` |
| `CXX` | server | `g++` (Xcode `clang++` on macOS) | Compiler used for bots |
| `BOT_STORE_FILE` | server | `server/runtime/bots/bots.json` | Where bot metadata is saved |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` | dashboard | `http://localhost:3000` | Server address |
| `NEXT_PUBLIC_API_TOKEN` | dashboard | *(unset)* | Must match `API_TOKEN`. Anyone who can open the dashboard can see it. |

---

## API Summary (Server)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bots` | List all bots. |
| GET | `/api/bots/constraints` | Get C++ bot constraints (limits, protocol). |
| GET | `/api/bots/:id` | Get one bot. |
| POST | `/api/bots` | Create bot: `{ name, code, filename? }`. |
| PUT | `/api/bots/:id` | Update bot. |
| DELETE | `/api/bots/:id` | Delete bot. |
| POST | `/api/matches/run` | Run match: `{ botIds[], numHands?, smallBlind?, bigBlind?, startingChips? }`. |

POST/PUT/DELETE and match runs require `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is set.

**Socket.IO (from dashboard):**
- Connect with `auth: { token }` when `API_TOKEN` is set.
- Emit `new_match` with `{ botIds, numHands, smallBlind, bigBlind, startingChips }`; the ack returns `{ matchId }` or `{ error }`.
- Listen for `MATCH_UPDATE` for live hand-by-hand and final results. These are sent only to the socket that started the match. Other sockets can subscribe with `watch_match(matchId)`.

---

## Game Flow (Texas Hold'em)

1. Blinds posted (small, big). Heads-up, the button posts the small blind, acts first pre-flop and last after the flop.  
2. Hole cards dealt (2 per player).  
3. Pre-flop betting.  
4. Flop (3 community cards) + betting.  
5. Turn (4th card) + betting.  
6. River (5th card) + betting.  
7. Showdown — best 5-card hand wins; side pots if all-ins.

---

## License & Contributing

This project is provided as-is for education and development. To contribute: change the relevant part (engine, server, or dashboard), test (e.g. run a match with sample bots), and update this README if you add features or change setup.

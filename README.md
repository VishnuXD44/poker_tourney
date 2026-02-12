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
| **Bots** | C++ only (for the web platform). Upload source; server compiles and runs with strict sandbox (no threads, no system calls, no network). |
| **Matches** | 2–9 bots, configurable hands (10–500), blinds, and starting stack. Live updates over Socket.IO. |
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
│   │   ├── botStore.js         # In-memory bot registry
│   │   ├── cppBotRunner.js     # Compile & run C++ bots (stdin/stdout)
│   │   └── ...
│   ├── match/
│   │   └── matchRunner.js      # Run multi-hand matches
│   └── runtime/bots/          # Compiled bot binaries & source (generated)
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
├── Makefile
├── build.bat / clean.bat / run.bat
└── public/                    # Static assets for server
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
- `amount` — required only for `"raise"` (integer)

Example response: `{"action":"call"}` or `{"action":"raise","amount":80}`

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
- No: `system()`, `popen()`, `exec*`, `fork`, `<thread>`, `<future>`, `<filesystem>`, `<windows.h>`, sockets.
- Action timeout ~500 ms per decision; compile timeout ~12 s.

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

**Socket.IO (from dashboard):**
- Emit `new_match` with `{ botIds, numHands, smallBlind, bigBlind, startingChips }`.
- Listen for `MATCH_UPDATE` for live hand-by-hand and final results.

---

## Game Flow (Texas Hold'em)

1. Blinds posted (small, big).  
2. Hole cards dealt (2 per player).  
3. Pre-flop betting.  
4. Flop (3 community cards) + betting.  
5. Turn (4th card) + betting.  
6. River (5th card) + betting.  
7. Showdown — best 5-card hand wins; side pots if all-ins.

---

## License & Contributing

This project is provided as-is for education and development. To contribute: change the relevant part (engine, server, or dashboard), test (e.g. run a match with sample bots), and update this README if you add features or change setup.

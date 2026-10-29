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

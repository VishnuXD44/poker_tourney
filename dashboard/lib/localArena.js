/**
 * Runs a match entirely in the browser: the same engine the server uses (server/game),
 * with builder strategies deciding each move instead of compiled C++ binaries.
 * Emits the same MATCH_UPDATE / MATCH_END payloads as server/match/matchRunner.js.
 */
import { createGame, addPlayer, playHand, getChipCounts, getActivePlayers } from "../../server/game/pokerGame.js";
import { decide } from "./strategy";

// Same limits as server/match/matchRunner.js.
const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, parseInt(value, 10) || fallback));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Engine-facing action for one game state. */
function strategyAction(graph) {
  return (state) => {
    const { action, amount } = decide(graph, state);
    return action === "raise" ? { action, amount } : { action };
  };
}

/**
 * bots: [{ id, name, graph }]. Resolves when the match ends or `signal` aborts.
 * Hands are spaced out by `delayMs` so the table can be watched live.
 */
export async function runLocalMatch(bots, options, onUpdate, signal) {
  if (!Array.isArray(bots) || bots.length < 2 || bots.length > 9) {
    onUpdate({ type: "MATCH_ERROR", error: "Need 2–9 bots" });
    return;
  }
  const numHands = clamp(options.numHands, 10, 500, 50);
  const smallBlind = clamp(options.smallBlind, 1, 100000, 10);
  const bigBlind = clamp(options.bigBlind, smallBlind, 100000, 20);
  const startingChips = clamp(options.startingChips, 100, 1000000, 1000);
  const delayMs = options.delayMs ?? 180;

  const game = createGame(smallBlind, bigBlind, startingChips);
  const seen = new Map();
  for (const bot of bots) {
    // Logs and showdowns refer to players by name, so seat names must be unique.
    const n = (seen.get(bot.name) || 0) + 1;
    seen.set(bot.name, n);
    addPlayer(game, bot.id, n > 1 ? `${bot.name} #${n}` : bot.name, strategyAction(bot.graph));
  }

  const matchId = `local-${Date.now().toString(36)}`;
  let handNumber = 0;
  while (handNumber < numHands && getActivePlayers(game) >= 2) {
    if (signal?.aborted) return;
    game.handLog = [];
    await playHand(game);
    handNumber++;
    onUpdate({
      type: "MATCH_UPDATE",
      matchId,
      handNumber,
      chipCounts: getChipCounts(game),
      lastHandEvents: game.handLog,
      communityCards: game.communityCards.map((c) => c.str),
    });
    await sleep(delayMs);
  }
  if (signal?.aborted) return;

  const chipCounts = getChipCounts(game);
  const winner = [...chipCounts].sort((a, b) => b.chips - a.chips)[0];
  onUpdate({ type: "MATCH_END", matchId, numHandsPlayed: handNumber, chipCounts, winner: winner?.name ?? null });
}

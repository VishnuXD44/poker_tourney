import { createGame, addPlayer, playHand, getChipCounts, getActivePlayers } from '../game/pokerGame.js';
import { getBot } from '../bots/botStore.js';
import { createGetActionFromCppExecutable } from '../bots/cppBotRunner.js';

const DEFAULT_SB = 10;
const DEFAULT_BB = 20;
const DEFAULT_CHIPS = 1000;
const MIN_HANDS = 10;
const MAX_HANDS = 10000;
const MIN_BOTS = 2;
const MAX_BOTS = 9;
const MAX_STARTING_CHIPS = 1000000;
const MAX_BLIND = 100000;

let concurrentMatches = 0;
const MAX_CONCURRENT_MATCHES = 5;

export function getConcurrentMatchCount() {
  return concurrentMatches;
}

export async function runMatch(botIds, options = {}) {
  if (concurrentMatches >= MAX_CONCURRENT_MATCHES) {
    return { error: 'Too many matches running; try again shortly' };
  }

  const numHands = Math.min(MAX_HANDS, Math.max(MIN_HANDS, parseInt(options.numHands, 10) || 50));
  const smallBlind = Math.min(MAX_BLIND, Math.max(1, parseInt(options.smallBlind, 10) || DEFAULT_SB));
  const bigBlind = Math.min(MAX_BLIND, Math.max(smallBlind, parseInt(options.bigBlind, 10) || DEFAULT_BB));
  const startingChips = Math.min(MAX_STARTING_CHIPS, Math.max(100, parseInt(options.startingChips, 10) || DEFAULT_CHIPS));

  if (!Array.isArray(botIds) || botIds.length < MIN_BOTS || botIds.length > MAX_BOTS) {
    return { error: `Need ${MIN_BOTS}–${MAX_BOTS} bot ids` };
  }

  const bots = [];
  for (const id of botIds) {
    const bot = getBot(String(id));
    if (!bot) return { error: `Bot not found: ${id}` };
    if (bot.language !== 'cpp') return { error: `Bot "${bot.name}" is not a C++ bot` };
    if (!bot.binaryPath) return { error: `Bot "${bot.name}" has no compiled executable` };
    bots.push(bot);
  }

  concurrentMatches++;
  try {
    const game = createGame(smallBlind, bigBlind, startingChips);
    for (const bot of bots) {
      const getAction = createGetActionFromCppExecutable(bot.binaryPath);
      addPlayer(game, bot.id, bot.name, getAction);
    }

    const handLogs = [];
    let handNumber = 0;
    const matchId = options.matchId || `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : () => {};

    while (handNumber < numHands) {
      const active = getActivePlayers(game);
      if (active < 2) break;
      game.handLog = [];
      await playHand(game);
      handLogs.push({ hand: handNumber + 1, events: [...game.handLog] });
      handNumber++;
      const chipCountsNow = getChipCounts(game);
      onUpdate({
        type: 'MATCH_UPDATE',
        matchId,
        handNumber,
        chipCounts: chipCountsNow,
        lastHandEvents: game.handLog,
        communityCards: game.communityCards?.map(c => c.str) || []
      });
      // Yield so the event loop can flush socket updates and the UI can repaint
      await new Promise((r) => setImmediate(r));
    }

    const chipCounts = getChipCounts(game);
    const winner = chipCounts.length === 1
      ? chipCounts[0]
      : [...chipCounts].sort((a, b) => b.chips - a.chips)[0];
    const result = {
      botIds,
      numHandsPlayed: handNumber,
      chipCounts,
      winner: winner?.name ?? null,
      handLogs
    };
    onUpdate({ type: 'MATCH_END', matchId, ...result });
    return result;
  } finally {
    concurrentMatches--;
  }
}

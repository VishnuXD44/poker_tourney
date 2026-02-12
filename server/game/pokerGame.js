import { Deck, cardToString } from './card.js';
import { evaluateHand, compareHands, HAND_NAMES } from './handEvaluator.js';

const STAGE_STR = { PRE_FLOP: 'pre-flop', FLOP: 'flop', TURN: 'turn', RIVER: 'river', SHOWDOWN: 'showdown' };

export function createGame(smallBlind, bigBlind, startingChips) {
  return {
    smallBlind,
    bigBlind,
    startingChips,
    players: [],
    deck: null,
    communityCards: [],
    pot: 0,
    currentBet: 0,
    minRaise: bigBlind,
    dealerButton: 0,
    stage: 'PRE_FLOP',
    handLog: []
  };
}

export function addPlayer(game, id, name, getAction) {
  game.players.push({
    id,
    name,
    chips: game.startingChips,
    holeCards: [],
    currentBet: 0,
    folded: false,
    allIn: false,
    getAction
  });
}

function dealHoleCards(game) {
  for (let i = 0; i < 2; i++) {
    for (const p of game.players) {
      if (!p.folded) p.holeCards.push(game.deck.deal());
    }
  }
}

function collectBets(game) {
  for (const p of game.players) {
    game.pot += p.currentBet;
    p.currentBet = 0;
  }
}

function resetBets(game) {
  for (const p of game.players) {
    p.currentBet = 0;
    p.folded = false;
    p.allIn = false;
    p.holeCards = [];
  }
  game.currentBet = 0;
}

function findNextActive(game, from) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = game.players[idx];
    if (!p.folded && !p.allIn) return idx;
  }
  return -1;
}

function buildStateForPlayer(game, playerIndex) {
  const p = game.players[playerIndex];
  const toCall = Math.max(0, game.currentBet - p.currentBet);
  const totalPot = game.pot + game.players.reduce((s, x) => s + x.currentBet, 0);
  return {
    stage: STAGE_STR[game.stage],
    pot: totalPot,
    currentBet: game.currentBet,
    minRaise: game.minRaise,
    toCall,
    myChips: p.chips,
    myCards: p.holeCards.map(c => c.str),
    communityCards: game.communityCards.map(c => c.str),
    opponents: game.players
      .filter((_, i) => i !== playerIndex && !game.players[i].folded)
      .map(o => ({ name: o.name, chips: o.chips, currentBet: o.currentBet, allIn: o.allIn }))
  };
}

function parseBotAction(raw) {
  if (!raw || typeof raw !== 'object') return { action: 'fold' };
  const a = (raw.action || raw).toString().toLowerCase().trim();
  const amount = typeof raw.amount === 'number' ? raw.amount : parseInt(raw.amount, 10) || 0;
  if (a === 'fold') return { action: 'fold' };
  if (a === 'check') return { action: 'check' };
  if (a === 'call') return { action: 'call' };
  if (a === 'all-in' || a === 'allin') return { action: 'all-in' };
  if (a === 'raise') return { action: 'raise', amount };
  return { action: 'fold' };
}

async function bettingRound(game, startIndex, log) {
  let current = startIndex;
  let lastRaiser = -1;
  let playersActed = 0;
  let activeCount = game.players.filter(p => !p.folded && !p.allIn).length;
  if (activeCount <= 1) {
    collectBets(game);
    return game.players.filter(p => !p.folded).length;
  }

  while (true) {
    if (game.players[current].folded || game.players[current].allIn) {
      current = findNextActive(game, current);
      if (current === -1) break;
      continue;
    }
    const p = game.players[current];
    const toCall = Math.max(0, game.currentBet - p.currentBet);
    const state = buildStateForPlayer(game, current);
    let rawAction;
    try {
      rawAction = await Promise.resolve(p.getAction(state));
      // Brief yield so event loop can process I/O (socket flush, etc.)
      await new Promise((r) => setImmediate(r));
    } catch (err) {
      log.push({ type: 'error', player: p.name, message: err.message });
      rawAction = { action: 'fold' };
    }
    const act = parseBotAction(rawAction);

    if (act.action === 'fold') {
      p.folded = true;
      log.push({ type: 'action', player: p.name, action: 'fold' });
      activeCount = game.players.filter(x => !x.folded && !x.allIn).length;
      if (activeCount <= 1) break;
      current = findNextActive(game, current);
      if (current === -1) break;
      playersActed++;
      continue;
    }

    if (act.action === 'check') {
      if (toCall > 0) {
        p.folded = true;
        log.push({ type: 'action', player: p.name, action: 'fold', reason: 'invalid check' });
        activeCount--;
      } else {
        log.push({ type: 'action', player: p.name, action: 'check' });
      }
    } else if (act.action === 'call') {
      const betAmount = Math.min(p.chips, toCall);
      p.chips -= betAmount;
      p.currentBet += betAmount;
      if (p.chips === 0) p.allIn = true;
      log.push({ type: 'action', player: p.name, action: 'call', amount: betAmount });
    } else if (act.action === 'raise') {
      const raiseBy = Math.max(game.minRaise, act.amount || game.minRaise);
      const totalToPut = toCall + raiseBy;
      const actualBet = Math.min(p.chips, totalToPut);
      p.chips -= actualBet;
      p.currentBet += actualBet;
      if (p.chips === 0) p.allIn = true;
      if (p.currentBet > game.currentBet) {
        game.currentBet = p.currentBet;
        game.minRaise = raiseBy;
        lastRaiser = current;
        playersActed = 0;
      }
      log.push({ type: 'action', player: p.name, action: 'raise', amount: p.currentBet });
    } else if (act.action === 'all-in') {
      const allInAmount = p.chips;
      p.chips = 0;
      p.currentBet += allInAmount;
      p.allIn = true;
      if (p.currentBet > game.currentBet) {
        const raiseAmount = p.currentBet - game.currentBet;
        game.currentBet = p.currentBet;
        if (raiseAmount >= game.minRaise) {
          game.minRaise = raiseAmount;
          lastRaiser = current;
          playersActed = 0;
        }
      }
      log.push({ type: 'action', player: p.name, action: 'all-in', amount: allInAmount });
    }

    playersActed++;
    const allMatched = game.players.every(x => x.folded || x.allIn || x.currentBet === game.currentBet);
    activeCount = game.players.filter(x => !x.folded && !x.allIn).length;
    if (activeCount <= 1) break;
    if (allMatched && playersActed >= activeCount) break;
    current = findNextActive(game, current);
    if (current === -1) break;
  }

  collectBets(game);
  for (const p of game.players) p.currentBet = 0;
  return game.players.filter(p => !p.folded).length;
}

function dealFlop(game) {
  game.deck.deal();
  for (let i = 0; i < 3; i++) game.communityCards.push(game.deck.deal());
  game.stage = 'FLOP';
}

function dealTurn(game) {
  game.deck.deal();
  game.communityCards.push(game.deck.deal());
  game.stage = 'TURN';
}

function dealRiver(game) {
  game.deck.deal();
  game.communityCards.push(game.deck.deal());
  game.stage = 'RIVER';
}

function determineWinners(game) {
  const active = game.players.map((p, i) => ({ p, i })).filter(({ p }) => !p.folded);
  if (active.length === 1) return active.map(({ i }) => i);
  const evaluated = active.map(({ p, i }) => {
    const all = [...p.holeCards, ...game.communityCards];
    const hv = evaluateHand(all);
    return { i, hv, name: p.name, handName: HAND_NAMES[hv.rank] };
  });
  let best = evaluated[0].hv;
  for (const e of evaluated) {
    if (compareHands(e.hv, best) > 0) best = e.hv;
  }
  const winners = evaluated.filter(e => compareHands(e.hv, best) === 0).map(e => e.i);
  game.handLog.push({ type: 'showdown', hands: evaluated, winners: winners.map(i => game.players[i].name) });
  return winners;
}

function distributePot(game, winnerIndices) {
  if (winnerIndices.length === 0) return;
  const amount = Math.floor(game.pot / winnerIndices.length);
  for (const i of winnerIndices) {
    game.players[i].chips += amount;
    game.handLog.push({ type: 'win', player: game.players[i].name, amount });
  }
  game.pot = 0;
}

export async function playHand(game) {
  game.communityCards = [];
  game.deck = new Deck();
  game.deck.shuffle();
  game.stage = 'PRE_FLOP';
  resetBets(game);
  game.minRaise = game.bigBlind;

  const n = game.players.length;
  const sb = (game.dealerButton + 1) % n;
  const bb = (game.dealerButton + 2) % n;
  const firstAct = (game.dealerButton + 3) % n;

  const sbPay = Math.min(game.players[sb].chips, game.smallBlind);
  const bbPay = Math.min(game.players[bb].chips, game.bigBlind);
  game.players[sb].chips -= sbPay;
  game.players[sb].currentBet = sbPay;
  game.players[bb].chips -= bbPay;
  game.players[bb].currentBet = bbPay;
  game.currentBet = Math.max(sbPay, bbPay);
  game.pot = sbPay + bbPay;

  dealHoleCards(game);
  game.handLog.push({ type: 'hand_start', dealer: game.players[game.dealerButton].name, sb: game.players[sb].name, bb: game.players[bb].name });

  let active = await bettingRound(game, firstAct, game.handLog);
  if (active > 1) {
    dealFlop(game);
    game.currentBet = 0;
    game.handLog.push({ type: 'street', street: 'flop', cards: game.communityCards.map(c => c.str) });
    active = await bettingRound(game, (game.dealerButton + 1) % n, game.handLog);
  }
  if (active > 1) {
    dealTurn(game);
    game.currentBet = 0;
    game.handLog.push({ type: 'street', street: 'turn', cards: game.communityCards.map(c => c.str) });
    active = await bettingRound(game, (game.dealerButton + 1) % n, game.handLog);
  }
  if (active > 1) {
    dealRiver(game);
    game.currentBet = 0;
    game.handLog.push({ type: 'street', street: 'river', cards: game.communityCards.map(c => c.str) });
    active = await bettingRound(game, (game.dealerButton + 1) % n, game.handLog);
  }

  game.stage = 'SHOWDOWN';
  const winners = determineWinners(game);
  distributePot(game, winners);
  game.dealerButton = (game.dealerButton + 1) % n;
  return game.handLog;
}

export function getChipCounts(game) {
  return game.players.map(p => ({ id: p.id, name: p.name, chips: p.chips }));
}

export function getActivePlayers(game) {
  return game.players.filter(p => p.chips > 0).length;
}

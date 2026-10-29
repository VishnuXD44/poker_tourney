import { Deck } from './card.js';
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
    handsPlayed: 0,
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
    currentBet: 0, // chips put in during the current street
    totalBet: 0, // chips put in during the whole hand (used for side pots)
    folded: false,
    allIn: false,
    sittingOut: false,
    getAction
  });
}

const inHand = (p) => !p.sittingOut && !p.folded;
const canAct = (p) => inHand(p) && !p.allIn;

/** Next seat after `from` (exclusive) whose player matches `pred`; -1 if none. */
function nextSeat(game, from, pred) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (pred(game.players[idx], idx)) return idx;
  }
  return -1;
}

/** Move up to `amount` chips from a player's stack into their current bet. Returns chips moved. */
function putChips(p, amount) {
  const put = Math.max(0, Math.min(p.chips, amount));
  p.chips -= put;
  p.currentBet += put;
  p.totalBet += put;
  if (p.chips === 0) p.allIn = true;
  return put;
}

function dealHoleCards(game, firstSeat) {
  const n = game.players.length;
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) {
      const p = game.players[(firstSeat + k) % n];
      if (!p.sittingOut) p.holeCards.push(game.deck.deal());
    }
  }
}

function collectBets(game) {
  for (const p of game.players) {
    game.pot += p.currentBet;
    p.currentBet = 0;
  }
  game.currentBet = 0;
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
      .filter((o, i) => i !== playerIndex && inHand(o))
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

/**
 * Applies a bet that raised game.currentBet. A full raise reopens the action for everyone;
 * a short all-in raise only requires players who have not matched it to act again.
 */
function applyRaise(game, idx, needsAction) {
  const p = game.players[idx];
  const raiseBy = p.currentBet - game.currentBet;
  game.currentBet = p.currentBet;
  const fullRaise = raiseBy >= game.minRaise;
  if (fullRaise) game.minRaise = raiseBy;
  game.players.forEach((o, i) => {
    if (i !== idx && canAct(o) && (fullRaise || o.currentBet < game.currentBet)) needsAction.add(i);
  });
}

async function bettingRound(game, firstIndex, log) {
  const players = game.players;
  const actors = players.filter(canAct);
  const stillIn = players.filter(inHand).length;
  // Nothing to bet on: hand is decided, or at most one player can act and owes nothing.
  if (stillIn <= 1 || actors.length === 0 ||
      (actors.length === 1 && actors[0].currentBet >= game.currentBet)) {
    collectBets(game);
    return stillIn;
  }

  const needsAction = new Set();
  players.forEach((p, i) => { if (canAct(p)) needsAction.add(i); });

  let current = canAct(players[firstIndex]) ? firstIndex : nextSeat(game, firstIndex, canAct);
  while (needsAction.size > 0 && current !== -1) {
    const p = players[current];
    needsAction.delete(current);
    const toCall = Math.max(0, game.currentBet - p.currentBet);

    let rawAction;
    try {
      rawAction = await Promise.resolve(p.getAction(buildStateForPlayer(game, current)));
      // Brief yield so event loop can process I/O (socket flush, etc.)
      await new Promise((r) => setImmediate(r));
    } catch (err) {
      log.push({ type: 'error', player: p.name, message: err.message });
      rawAction = { action: 'fold' };
    }
    let act = parseBotAction(rawAction);

    // Normalise actions that don't fit the situation.
    if (act.action === 'call' && toCall === 0) act = { action: 'check' };
    if (act.action === 'raise') {
      const raiseBy = Math.max(game.minRaise, Math.floor(act.amount) || 0);
      if (toCall + raiseBy >= p.chips) act = { action: 'all-in' };
      else act = { action: 'raise', amount: raiseBy };
    }

    if (act.action === 'fold') {
      p.folded = true;
      log.push({ type: 'action', player: p.name, action: 'fold' });
    } else if (act.action === 'check') {
      if (toCall > 0) {
        p.folded = true;
        log.push({ type: 'action', player: p.name, action: 'fold', reason: 'invalid check' });
      } else {
        log.push({ type: 'action', player: p.name, action: 'check' });
      }
    } else if (act.action === 'call') {
      const put = putChips(p, toCall);
      log.push({ type: 'action', player: p.name, action: 'call', amount: put });
    } else if (act.action === 'raise') {
      putChips(p, toCall + act.amount);
      applyRaise(game, current, needsAction);
      log.push({ type: 'action', player: p.name, action: 'raise', amount: p.currentBet });
    } else if (act.action === 'all-in') {
      const put = putChips(p, p.chips);
      if (p.currentBet > game.currentBet) applyRaise(game, current, needsAction);
      log.push({ type: 'action', player: p.name, action: 'all-in', amount: put });
    }

    if (players.filter(inHand).length <= 1) break;
    // Players who went all-in or folded since being queued can no longer act.
    for (const i of needsAction) if (!canAct(players[i])) needsAction.delete(i);
    current = nextSeat(game, current, (_, i) => needsAction.has(i));
  }

  collectBets(game);
  return players.filter(inHand).length;
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

/**
 * Splits the hand's contributions into a main pot and side pots.
 * Each pot lists the players still in the hand who are eligible to win it.
 */
export function buildPots(players) {
  const levels = [...new Set(players.map(p => p.totalBet).filter(b => b > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  let carry = 0;
  for (const level of levels) {
    const amount = carry + players.reduce((s, p) => s + Math.min(p.totalBet, level) - Math.min(p.totalBet, prev), 0);
    const eligible = players.map((p, i) => i).filter(i => inHand(players[i]) && players[i].totalBet >= level);
    prev = level;
    carry = 0;
    const last = pots[pots.length - 1];
    if (eligible.length === 0) {
      // Only folded players contributed this much: the chips go to the neighbouring pot.
      if (last) last.amount += amount;
      else carry = amount;
    } else if (last && last.eligible.join() === eligible.join()) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return pots;
}

function awardPots(game) {
  const players = game.players;
  const n = players.length;
  const remaining = players.map((p, i) => i).filter(i => inHand(players[i]));

  if (remaining.length === 1) {
    const w = players[remaining[0]];
    w.chips += game.pot;
    game.handLog.push({ type: 'win', player: w.name, amount: game.pot });
    game.pot = 0;
    return;
  }

  const values = new Map();
  for (const i of remaining) {
    const hv = evaluateHand([...players[i].holeCards, ...game.communityCards]);
    values.set(i, hv);
  }
  game.handLog.push({
    type: 'showdown',
    hands: remaining.map(i => ({
      i,
      name: players[i].name,
      cards: players[i].holeCards.map(c => c.str),
      hv: values.get(i),
      handName: HAND_NAMES[values.get(i).rank]
    })),
    winners: []
  });
  const showdown = game.handLog[game.handLog.length - 1];

  const pots = buildPots(players);
  pots.forEach((pot, potIndex) => {
    let best = null;
    for (const i of pot.eligible) {
      if (!best || compareHands(values.get(i), best) > 0) best = values.get(i);
    }
    // Winners ordered from the first seat left of the button, who receives any odd chips.
    const winners = pot.eligible
      .filter(i => compareHands(values.get(i), best) === 0)
      .sort((a, b) => ((a - game.dealerButton - 1 + n) % n) - ((b - game.dealerButton - 1 + n) % n));
    const share = Math.floor(pot.amount / winners.length);
    let oddChips = pot.amount - share * winners.length;
    for (const i of winners) {
      const amount = share + (oddChips-- > 0 ? 1 : 0);
      players[i].chips += amount;
      game.handLog.push({ type: 'win', player: players[i].name, amount, pot: potIndex === 0 ? 'main' : `side ${potIndex}` });
      if (!showdown.winners.includes(players[i].name)) showdown.winners.push(players[i].name);
    }
  });
  game.pot = 0;
}

export async function playHand(game) {
  const players = game.players;
  const n = players.length;
  game.communityCards = [];
  game.deck = new Deck();
  game.deck.shuffle();
  game.stage = 'PRE_FLOP';
  game.pot = 0;
  game.currentBet = 0;
  game.minRaise = game.bigBlind;
  for (const p of players) {
    p.holeCards = [];
    p.currentBet = 0;
    p.totalBet = 0;
    p.folded = false;
    p.allIn = false;
    p.sittingOut = p.chips <= 0;
  }

  const live = (p) => !p.sittingOut;
  if (players.filter(live).length < 2) return game.handLog;

  // The button moves to the next player who still has chips.
  if (game.handsPlayed > 0 || !live(players[game.dealerButton])) {
    game.dealerButton = nextSeat(game, game.handsPlayed > 0 ? game.dealerButton : game.dealerButton - 1, live);
  }
  const button = game.dealerButton;
  const headsUp = players.filter(live).length === 2;

  // Heads-up: the button posts the small blind, acts first pre-flop and last after the flop.
  const sb = headsUp ? button : nextSeat(game, button, live);
  const bb = nextSeat(game, sb, live);
  const preflopFirst = nextSeat(game, bb, live);
  const postflopFirst = nextSeat(game, button, live);

  const sbPay = putChips(players[sb], game.smallBlind);
  const bbPay = putChips(players[bb], game.bigBlind);
  game.currentBet = Math.max(sbPay, bbPay);

  dealHoleCards(game, sb);
  game.handLog.push({ type: 'hand_start', dealer: players[button].name, sb: players[sb].name, bb: players[bb].name });

  let active = await bettingRound(game, preflopFirst, game.handLog);
  const streets = [['flop', dealFlop], ['turn', dealTurn], ['river', dealRiver]];
  for (const [street, deal] of streets) {
    if (active <= 1) break;
    deal(game);
    game.minRaise = game.bigBlind;
    game.handLog.push({ type: 'street', street, cards: game.communityCards.map(c => c.str) });
    active = await bettingRound(game, postflopFirst, game.handLog);
  }

  game.stage = 'SHOWDOWN';
  awardPots(game);
  game.handsPlayed++;
  return game.handLog;
}

export function getChipCounts(game) {
  return game.players.map(p => ({ id: p.id, name: p.name, chips: p.chips }));
}

export function getActivePlayers(game) {
  return game.players.filter(p => p.chips > 0).length;
}

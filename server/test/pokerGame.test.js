import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, addPlayer, playHand, buildPots } from '../game/pokerGame.js';
import { evaluateHand, compareHands } from '../game/handEvaluator.js';
import { parseCard, Deck } from '../game/card.js';

const totalChips = (g) => g.players.reduce((s, p) => s + p.chips, 0) + g.pot;
const caller = async (s) => ({ action: s.toCall > 0 ? 'call' : 'check' });

function makeGame(stacks, bots, { sb = 10, bb = 20 } = {}) {
  const g = createGame(sb, bb, 1000);
  stacks.forEach((chips, i) => {
    const name = String.fromCharCode(65 + i);
    addPlayer(g, name, name, bots[i] || caller);
    g.players[i].chips = chips;
  });
  return g;
}

test('blinds are not double counted', async () => {
  const g = makeGame([1000, 1000, 1000], []);
  await playHand(g);
  assert.equal(totalChips(g), 3000);
});

test('player facing an all-in gets to respond', async () => {
  const asked = [];
  const g = makeGame([1000, 1000], [
    async (s) => { asked.push(['A', s.toCall]); return { action: 'all-in' }; },
    async (s) => { asked.push(['B', s.toCall]); return { action: s.toCall > 0 ? 'call' : 'check' }; },
  ]);
  await playHand(g);
  assert.ok(asked.some(([who, toCall]) => who === 'B' && toCall === 980), JSON.stringify(asked));
  assert.deepEqual(g.players.map(p => p.chips).sort((a, b) => a - b), [0, 2000]);
});

test('busted players are not dealt in and cannot win', async () => {
  let asked = false;
  const g = makeGame([1000, 1000, 0], [caller, caller, async () => { asked = true; return { action: 'call' }; }]);
  await playHand(g);
  assert.equal(asked, false);
  assert.equal(g.players[2].chips, 0);
  assert.equal(g.players[2].holeCards.length, 0);
  assert.equal(totalChips(g), 2000);
});

test('heads-up: button posts small blind, acts first pre-flop and last post-flop', async () => {
  const order = [];
  const bot = (name) => async (s) => { order.push([s.stage, name]); return { action: s.toCall > 0 ? 'call' : 'check' }; };
  const g = makeGame([1000, 1000], [bot('A'), bot('B')]);
  await playHand(g);
  const start = g.handLog.find(e => e.type === 'hand_start');
  assert.equal(start.dealer, start.sb);
  const firstOn = (stage) => order.find(([s]) => s === stage)[1];
  assert.equal(firstOn('pre-flop'), start.dealer);
  assert.notEqual(firstOn('flop'), start.dealer);
});

test('player who already acted does not get an extra turn after a fold', async () => {
  const counts = { A: 0, B: 0, C: 0 };
  const g = makeGame([1000, 1000, 1000], [
    async (s) => { if (s.stage === 'flop') counts.A++; return { action: s.toCall > 0 ? 'call' : 'check' }; },
    async (s) => { if (s.stage === 'flop') counts.B++; return { action: s.toCall > 0 ? 'call' : 'check' }; },
    async (s) => { if (s.stage === 'flop') { counts.C++; return { action: 'fold' }; } return { action: s.toCall > 0 ? 'call' : 'check' }; },
  ]);
  await playHand(g);
  // Button is A, so B, C, A act on the flop; C's fold must not give anyone a second action.
  assert.deepEqual(counts, { A: 1, B: 1, C: 1 });
});

test('side pots: short all-in can only win what it covered', () => {
  const players = [
    { totalBet: 100, folded: false, sittingOut: false },
    { totalBet: 500, folded: false, sittingOut: false },
    { totalBet: 500, folded: false, sittingOut: false },
    { totalBet: 20, folded: true, sittingOut: false },
  ];
  assert.deepEqual(buildPots(players), [
    { amount: 320, eligible: [0, 1, 2] },
    { amount: 800, eligible: [1, 2] },
  ]);
});

test('side pots: short stack winning showdown only gets main pot', async () => {
  const g = makeGame([100, 1000, 1000], [
    async () => ({ action: 'all-in' }),
    async (s) => ({ action: s.toCall > 0 ? 'call' : 'check' }),
    async () => ({ action: 'all-in' }),
  ]);
  // Rig the deck so A has aces and wins, B beats C for the side pot.
  const cards = ['As', 'Kd', '2c', 'Ah', 'Kc', '3d', 'Xx', 'Qs', '7h', '8d', 'Xx', '9c', 'Xx', 'Jh']
    .map(s => (s === 'Xx' ? { rank: 2, suit: 'x', str: '2x' } : { ...parseCard(s), str: s }));
  g.dealerButton = 2; // SB = A, BB = B, C acts first
  const origShuffle = Deck.prototype.shuffle;
  Deck.prototype.shuffle = function () { this.cards = cards.concat(this.cards); this.index = 0; };
  try {
    await playHand(g);
  } finally {
    Deck.prototype.shuffle = origShuffle;
  }
  // Main pot 300 to A; B and C each put in 1000 total, B wins side pot of 1800.
  assert.equal(g.players[0].chips, 300);
  assert.equal(g.players[1].chips, 1800);
  assert.equal(g.players[2].chips, 0);
});

test('fuzz: chips are conserved and never negative across random play', async () => {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const randomBot = async (s) => {
    const r = rand();
    if (r < 0.15) return { action: 'fold' };
    if (r < 0.3) return { action: 'check' };
    if (r < 0.6) return { action: 'call' };
    if (r < 0.9) return { action: 'raise', amount: Math.floor(rand() * 200) };
    if (r < 0.95) return { action: 'all-in' };
    return { action: 'nonsense' };
  };
  for (let gameNo = 0; gameNo < 40; gameNo++) {
    const n = 2 + (gameNo % 8);
    const g = makeGame(Array.from({ length: n }, () => 50 + Math.floor(rand() * 1000)), Array(n).fill(randomBot));
    const start = totalChips(g);
    for (let h = 0; h < 60 && g.players.filter(p => p.chips > 0).length >= 2; h++) {
      g.handLog = [];
      await playHand(g);
      assert.equal(totalChips(g), start, `game ${gameNo} hand ${h}`);
      assert.equal(g.pot, 0);
      for (const p of g.players) assert.ok(p.chips >= 0 && Number.isInteger(p.chips));
    }
  }
});

test('hand evaluator ranks high-card hands by kickers', () => {
  const hand = (s) => evaluateHand(s.split(' ').map(parseCard));
  assert.ok(compareHands(hand('Ah Kd 9c 7s 3h 2d 4c'), hand('Ah Qd 9c 7s 3h 2d 4c')) > 0);
  assert.ok(compareHands(hand('Ah 2h 3d 4c 5s 9d Jc'), hand('Kh Qd Jc 9s 7h 3d 2c')) > 0); // wheel beats high card
});

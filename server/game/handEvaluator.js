const HAND_RANK = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8
};

function getRankCounts(cards) {
  const counts = Array(15).fill(0);
  for (const c of cards) counts[c.rank]++;
  return counts;
}

function isFlush(cards) {
  const s = cards[0].suit;
  return cards.every(c => c.suit === s);
}

function isStraight(cards) {
  const vals = cards.map(c => c.rank).sort((a, b) => b - a);
  let straight = true;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== vals[i - 1] - 1) { straight = false; break; }
  }
  if (straight) return [vals[0]];
  if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) return [5];
  return null;
}

function checkStraightFlush(cards) {
  if (!isFlush(cards)) return null;
  const high = isStraight(cards);
  return high ? { rank: HAND_RANK.STRAIGHT_FLUSH, tiebreakers: high } : null;
}

function checkFourOfAKind(cards) {
  const counts = getRankCounts(cards);
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) {
      const kickers = cards.filter(c => c.rank !== r).map(c => c.rank).sort((a, b) => b - a);
      return { rank: HAND_RANK.FOUR_OF_A_KIND, tiebreakers: [r, kickers[0] || 0] };
    }
  }
  return null;
}

function checkFullHouse(cards) {
  const counts = getRankCounts(cards);
  let three = -1, two = -1;
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 3 && three === -1) three = r;
    else if (counts[r] >= 2 && two === -1) two = r;
  }
  if (three !== -1 && two !== -1) return { rank: HAND_RANK.FULL_HOUSE, tiebreakers: [three, two] };
  return null;
}

function checkFlush(cards) {
  if (!isFlush(cards)) return null;
  const vals = cards.map(c => c.rank).sort((a, b) => b - a);
  return { rank: HAND_RANK.FLUSH, tiebreakers: vals };
}

function checkStraight(cards) {
  const high = isStraight(cards);
  return high ? { rank: HAND_RANK.STRAIGHT, tiebreakers: high } : null;
}

function checkThreeOfAKind(cards) {
  const counts = getRankCounts(cards);
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 3) {
      const kickers = cards.filter(c => c.rank !== r).map(c => c.rank).sort((a, b) => b - a);
      return { rank: HAND_RANK.THREE_OF_A_KIND, tiebreakers: [r, kickers[0] || 0, kickers[1] || 0] };
    }
  }
  return null;
}

function checkTwoPair(cards) {
  const counts = getRankCounts(cards);
  const pairs = [];
  for (let r = 14; r >= 2; r--) if (counts[r] === 2) pairs.push(r);
  if (pairs.length >= 2) {
    const kickers = cards.filter(c => c.rank !== pairs[0] && c.rank !== pairs[1]).map(c => c.rank).sort((a, b) => b - a);
    return { rank: HAND_RANK.TWO_PAIR, tiebreakers: [pairs[0], pairs[1], kickers[0] || 0] };
  }
  return null;
}

function checkPair(cards) {
  const counts = getRankCounts(cards);
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 2) {
      const kickers = cards.filter(c => c.rank !== r).map(c => c.rank).sort((a, b) => b - a);
      return { rank: HAND_RANK.PAIR, tiebreakers: [r, kickers[0] || 0, kickers[1] || 0, kickers[2] || 0] };
    }
  }
  return null;
}

function checkHighCard(cards) {
  const vals = cards.map(c => c.rank).sort((a, b) => b - a);
  return { rank: HAND_RANK.HIGH_CARD, tiebreakers: vals };
}

function choose5(arr) {
  const out = [];
  const n = arr.length;
  function rec(start, picked) {
    if (picked.length === 5) return out.push([...picked]);
    for (let i = start; i < n; i++) rec(i + 1, [...picked, arr[i]]);
  }
  rec(0, []);
  return out;
}

export function evaluateHand(cards) {
  if (cards.length < 5) throw new Error('Need at least 5 cards');
  const combos = cards.length === 5 ? [cards] : choose5(cards);
  let best = { rank: -1, tiebreakers: [] };
  const checks = [checkStraightFlush, checkFourOfAKind, checkFullHouse, checkFlush, checkStraight, checkThreeOfAKind, checkTwoPair, checkPair, checkHighCard];
  for (const hand of combos) {
    let hv = null;
    for (const fn of checks) {
      hv = fn(hand);
      if (hv) break;
    }
    if (!hv) hv = checkHighCard(hand);
    if (hv.rank > best.rank || (hv.rank === best.rank && compareTiebreakers(hv.tiebreakers, best.tiebreakers) > 0)) best = hv;
  }
  return best;
}

function compareTiebreakers(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function compareHands(h1, h2) {
  if (h1.rank !== h2.rank) return h1.rank - h2.rank;
  return compareTiebreakers(h1.tiebreakers, h2.tiebreakers);
}

export const HAND_NAMES = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

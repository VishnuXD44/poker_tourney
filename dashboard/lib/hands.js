/**
 * Plain-English hand reading for people learning the game: names a hand ("two pair, kings
 * and fours"), explains why one hand beat another, and finds a player's best five cards.
 * Uses the engine's evaluator so the explanation always agrees with who was paid.
 */
import { evaluateHand, compareHands } from "../../server/game/handEvaluator.js";
import { parseCard } from "../../server/game/card.js";

const WORD = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "jack", 12: "queen", 13: "king", 14: "ace" };
const PLURAL = { 2: "twos", 3: "threes", 4: "fours", 5: "fives", 6: "sixes", 7: "sevens", 8: "eights", 9: "nines", 10: "tens", 11: "jacks", 12: "queens", 13: "kings", 14: "aces" };
const ORDINAL = ["highest", "second", "third", "fourth", "fifth"];

export const word = (r) => WORD[r] || "?";
export const plural = (r) => PLURAL[r] || "?";

/** Best to worst, with the engine rank each row matches. Royal flush is a straight flush to the ace. */
export const RANKINGS = [
  { key: "royal", rank: 8, name: "royal flush", example: ["As", "Ks", "Qs", "Js", "Ts"], about: "A, K, Q, J, 10, all one suit. Unbeatable." },
  { key: "sflush", rank: 8, name: "straight flush", example: ["9h", "8h", "7h", "6h", "5h"], about: "Five in a row, all one suit." },
  { key: "quads", rank: 7, name: "four of a kind", example: ["Qc", "Qd", "Qh", "Qs", "4d"], about: "Four cards of the same rank." },
  { key: "boat", rank: 6, name: "full house", example: ["Jd", "Jh", "Js", "8c", "8s"], about: "Three of a kind plus a pair." },
  { key: "flush", rank: 5, name: "flush", example: ["Ad", "Jd", "8d", "5d", "2d"], about: "Any five of one suit, not in a row." },
  { key: "straight", rank: 4, name: "straight", example: ["Tc", "9d", "8h", "7s", "6c"], about: "Five in a row, mixed suits. A can be low (A-2-3-4-5)." },
  { key: "trips", rank: 3, name: "three of a kind", example: ["7c", "7d", "7s", "Kh", "2c"], about: "Three cards of the same rank." },
  { key: "twopair", rank: 2, name: "two pair", example: ["Ks", "Kd", "4c", "4h", "9s"], about: "Two different pairs." },
  { key: "pair", rank: 1, name: "pair", example: ["Ac", "Ad", "Jh", "6s", "3c"], about: "Two cards of the same rank." },
  { key: "high", rank: 0, name: "high card", example: ["Ah", "Qc", "9d", "5s", "3h"], about: "Nothing matches; your highest card plays." },
];

/** Which RANKINGS row a hand value belongs to. */
export function rankingKey(hv) {
  if (!hv) return null;
  if (hv.rank === 8) return hv.tiebreakers[0] === 14 ? "royal" : "sflush";
  return RANKINGS.find((r) => r.rank === hv.rank)?.key ?? null;
}

/** "pair of kings", "full house, threes full of jacks", "flush, ace high"... */
export function describeHand(hv) {
  if (!hv) return "";
  const [a, b] = hv.tiebreakers;
  switch (hv.rank) {
    case 0: return `${word(a)} high`;
    case 1: return `pair of ${plural(a)}`;
    case 2: return `two pair, ${plural(a)} and ${plural(b)}`;
    case 3: return `three ${plural(a)}`;
    case 4: return `straight, ${word(a)} high`;
    case 5: return `flush, ${word(a)} high`;
    case 6: return `full house, ${plural(a)} full of ${plural(b)}`;
    case 7: return `four ${plural(a)}`;
    case 8: return a === 14 ? "royal flush" : `straight flush, ${word(a)} high`;
    default: return "";
  }
}

/** describeHand with an article where English wants one: "a pair of kings", "three kings". */
export function aHand(hv) {
  const d = describeHand(hv);
  return [1, 4, 5, 6, 8].includes(hv?.rank) ? `a ${d}` : d;
}

// How many leading tiebreakers make up the hand itself; the rest are kickers.
const CORE = { 0: 0, 1: 1, 2: 2, 3: 1, 4: 1, 5: 0, 6: 2, 7: 1, 8: 1 };
const A_RANK = ["high card", "a pair", "two pair", "three of a kind", "a straight", "a flush", "a full house", "four of a kind", "a straight flush"];

/** Why `win` beats `lose` (both { name, hv }), as one sentence. */
function beats(win, lose) {
  const w = win.hv, l = lose.hv;
  if (w.rank !== l.rank) {
    return `${win.name}'s ${describeHand(w)} beats ${lose.name}'s ${describeHand(l)}: ${A_RANK[w.rank]} ranks above ${A_RANK[l.rank]}.`;
  }
  const i = w.tiebreakers.findIndex((x, k) => x !== (l.tiebreakers[k] || 0));
  const wc = w.tiebreakers[i], lc = l.tiebreakers[i];
  if (i < CORE[w.rank]) {
    if (w.rank === 2 && i === 1) return `Both have two pair with ${plural(w.tiebreakers[0])} on top; ${win.name}'s ${plural(wc)} beat ${lose.name}'s ${plural(lc)}.`;
    if (w.rank === 6 && i === 1) return `Both have ${plural(w.tiebreakers[0])} full; ${win.name}'s pair of ${plural(wc)} beats ${lose.name}'s ${plural(lc)}.`;
    return `${win.name}'s ${describeHand(w)} beats ${lose.name}'s ${describeHand(l)}: same kind of hand, higher cards.`;
  }
  if (w.rank === 0 || w.rank === 5) {
    const both = w.rank === 0 ? "Neither player made a pair" : "Both have a flush";
    return `${both}; ${win.name} wins on the ${ORDINAL[i]} card, ${word(wc)} against ${word(lc)}.`;
  }
  return `Both have ${aHand(w)}; ${win.name}'s ${word(wc)} kicker (the best leftover card) beats ${lose.name}'s ${word(lc)}.`;
}

/**
 * One line per hand explaining who won and why, from the engine's events.
 * Handles wins by folding, ties (split pots) and side pots won by someone else.
 */
export function explainHand(events) {
  const wins = events.filter((ev) => ev.type === "win");
  if (!wins.length) return [];
  const showdown = events.find((ev) => ev.type === "showdown");
  if (!showdown) return [`${wins[0].player} wins ${wins[0].amount.toLocaleString()} because everyone else folded.`];

  const hands = showdown.hands.filter((h) => h.hv);
  const byName = new Map(hands.map((h) => [h.name, h]));
  const winners = showdown.winners.map((n) => byName.get(n)).filter(Boolean);
  const top = winners.reduce((best, h) => (!best || compareHands(h.hv, best.hv) > 0 ? h : best), null);
  const tied = winners.filter((h) => compareHands(h.hv, top.hv) === 0);
  const losers = hands.filter((h) => !showdown.winners.includes(h.name));
  const lines = [];

  if (tied.length > 1) {
    lines.push(`Split pot: ${tied.map((h) => h.name).join(" and ")} both have ${aHand(top.hv)}, exactly the same five cards in rank.`);
  } else if (losers.length) {
    const bestLoser = losers.reduce((best, h) => (compareHands(h.hv, best.hv) > 0 ? h : best));
    lines.push(beats(top, bestLoser));
  } else {
    lines.push(`${top.name} wins with ${aHand(top.hv)}.`);
  }
  // Someone with a worse hand can still win a side pot the better hand wasn't in.
  for (const h of winners) {
    if (compareHands(h.hv, top.hv) < 0) lines.push(`${h.name} takes a side pot ${top.name} wasn't in, with ${aHand(h.hv)}.`);
  }
  return lines;
}

const toCards = (strs) => (strs || []).map((s) => ({ ...parseCard(s), str: s })).filter((c) => c.rank && c.suit);

/** The best hand from your cards and the board: { hv, best: five card strings or null }. */
export function bestHand(holeStrs, boardStrs) {
  const cards = toCards([...(holeStrs || []), ...(boardStrs || [])]);
  if (cards.length < 2) return null;
  if (cards.length < 5) {
    // Before the flop: a pocket pair or your high cards.
    const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
    const hv = ranks[0] === ranks[1] ? { rank: 1, tiebreakers: [ranks[0]] } : { rank: 0, tiebreakers: ranks };
    return { hv, best: null };
  }
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const hv = evaluateHand(five);
            if (!best || compareHands(hv, best.hv) > 0) best = { hv, best: five.map((x) => x.str) };
          }
  return best;
}

/** Starting-hand strength for two hole cards, with a short beginner tip. Matches the builder's tiers. */
export function startingHand(holeStrs) {
  const [x, y] = toCards(holeStrs);
  if (!x || !y) return null;
  const a = Math.max(x.rank, y.rank), b = Math.min(x.rank, y.rank);
  const suited = x.suit === y.suit;
  const label = `${a === b ? `pocket ${plural(a)}` : `${word(a)}-${word(b)}`}${a !== b ? (suited ? " suited" : " offsuit") : ""}`;
  if ((a === b && a >= 11) || (a === 14 && b === 13)) return { tier: 3, label, strength: "premium", tip: "One of the best starts. Raise." };
  if ((a === b && a >= 7) || (a === 14 && b >= 10) || (a === 13 && b >= 11)) return { tier: 2, label, strength: "strong", tip: "Good hand. Raising or calling a raise is fine." };
  if (a === b || a === 14 || b >= 10 || (suited && a - b <= 2 && b >= 5))
    return { tier: 1, label, strength: "playable", tip: "Worth seeing a cheap flop; careful against big raises." };
  return { tier: 0, label, strength: "weak", tip: "Usually fold to a raise; check if it's free." };
}

/** Flush and straight draws (one card away), after the flop and before the river. */
export function draws(holeStrs, boardStrs) {
  const board = toCards(boardStrs);
  if (board.length < 3 || board.length > 4) return [];
  const all = [...toCards(holeStrs), ...board];
  const out = [];
  for (const suit of "hdcs") if (all.filter((c) => c.suit === suit).length === 4) out.push("flush draw: one more of that suit makes a flush");
  const has = new Set(all.map((c) => c.rank));
  if (has.has(14)) has.add(1);
  for (let lo = 1; lo <= 10; lo++) {
    let n = 0;
    for (let r = lo; r < lo + 5; r++) if (has.has(r)) n++;
    if (n === 4) {
      out.push("straight draw: one card away from five in a row");
      break;
    }
  }
  return out;
}

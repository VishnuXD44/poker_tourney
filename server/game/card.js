const SUITS = ['h', 'd', 'c', 's'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 12=Q, 13=K, 14=A
const RANK_STR = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function cardToString(rank, suit) {
  return RANK_STR[rank] + suit;
}

export function parseCard(str) {
  const r = str.slice(0, -1);
  const s = str.slice(-1);
  const rankMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return { rank: rankMap[r], suit: s };
}

export class Deck {
  constructor() {
    this.cards = [];
    for (const s of SUITS) {
      for (const r of RANKS) {
        this.cards.push({ rank: r, suit: s, str: cardToString(r, s) });
      }
    }
    this.index = 0;
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.index = 0;
  }

  deal() {
    if (this.index >= this.cards.length) throw new Error('Deck empty');
    return this.cards[this.index++];
  }

  reset() {
    this.index = 0;
    this.cards = [];
    for (const s of SUITS) {
      for (const r of RANKS) {
        this.cards.push({ rank: r, suit: s, str: cardToString(r, s) });
      }
    }
  }
}

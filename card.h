#ifndef CARD_H
#define CARD_H

#include <string>
#include <vector>

enum class Suit { HEARTS, DIAMONDS, CLUBS, SPADES };
enum class Rank { TWO = 2, THREE, FOUR, FIVE, SIX, SEVEN, EIGHT, NINE, TEN, JACK, QUEEN, KING, ACE };

class Card {
private:
    Rank rank;
    Suit suit;

public:
    Card(Rank r, Suit s);
    
    Rank getRank() const { return rank; }
    Suit getSuit() const { return suit; }
    int getValue() const { return static_cast<int>(rank); }
    
    std::string toString() const;
    bool operator==(const Card& other) const;
    bool operator<(const Card& other) const;
};

class Deck {
private:
    std::vector<Card> cards;
    size_t currentCard;

public:
    Deck();
    void shuffle();
    Card dealCard();
    void reset();
    size_t cardsRemaining() const { return cards.size() - currentCard; }
};

#endif

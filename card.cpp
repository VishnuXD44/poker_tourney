#include "card.h"
#include <algorithm>
#include <random>
#include <chrono>
#include <sstream>

Card::Card(Rank r, Suit s) : rank(r), suit(s) {}

std::string Card::toString() const {
    std::string rankStr;
    switch (rank) {
        case Rank::TWO: rankStr = "2"; break;
        case Rank::THREE: rankStr = "3"; break;
        case Rank::FOUR: rankStr = "4"; break;
        case Rank::FIVE: rankStr = "5"; break;
        case Rank::SIX: rankStr = "6"; break;
        case Rank::SEVEN: rankStr = "7"; break;
        case Rank::EIGHT: rankStr = "8"; break;
        case Rank::NINE: rankStr = "9"; break;
        case Rank::TEN: rankStr = "T"; break;
        case Rank::JACK: rankStr = "J"; break;
        case Rank::QUEEN: rankStr = "Q"; break;
        case Rank::KING: rankStr = "K"; break;
        case Rank::ACE: rankStr = "A"; break;
    }
    
    std::string suitStr;
    switch (suit) {
        case Suit::HEARTS: suitStr = "h"; break;
        case Suit::DIAMONDS: suitStr = "d"; break;
        case Suit::CLUBS: suitStr = "c"; break;
        case Suit::SPADES: suitStr = "s"; break;
    }
    
    return rankStr + suitStr;
}

bool Card::operator==(const Card& other) const {
    return rank == other.rank && suit == other.suit;
}

bool Card::operator<(const Card& other) const {
    return getValue() < other.getValue();
}

Deck::Deck() : currentCard(0) {
    for (int s = 0; s < 4; s++) {
        for (int r = 2; r <= 14; r++) {
            cards.push_back(Card(static_cast<Rank>(r), static_cast<Suit>(s)));
        }
    }
}

void Deck::shuffle() {
    unsigned seed = std::chrono::system_clock::now().time_since_epoch().count();
    std::shuffle(cards.begin(), cards.end(), std::default_random_engine(seed));
    currentCard = 0;
}

Card Deck::dealCard() {
    if (currentCard >= cards.size()) {
        throw std::runtime_error("No more cards in deck");
    }
    return cards[currentCard++];
}

void Deck::reset() {
    currentCard = 0;
}

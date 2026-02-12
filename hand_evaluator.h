#ifndef HAND_EVALUATOR_H
#define HAND_EVALUATOR_H

#include "card.h"
#include <vector>
#include <string>

enum class HandRank {
    HIGH_CARD = 0,
    PAIR = 1,
    TWO_PAIR = 2,
    THREE_OF_A_KIND = 3,
    STRAIGHT = 4,
    FLUSH = 5,
    FULL_HOUSE = 6,
    FOUR_OF_A_KIND = 7,
    STRAIGHT_FLUSH = 8
};

struct HandValue {
    HandRank rank;
    std::vector<int> tiebreakers;
    
    HandValue(HandRank r, const std::vector<int>& tb) : rank(r), tiebreakers(tb) {}
    
    bool operator>(const HandValue& other) const;
    bool operator<(const HandValue& other) const;
    std::string toString() const;
};

class HandEvaluator {
public:
    static HandValue evaluateHand(const std::vector<Card>& cards);
    
private:
    static bool isFlush(const std::vector<Card>& cards);
    static bool isStraight(const std::vector<Card>& cards, std::vector<int>& straightHigh);
    static HandValue checkStraightFlush(const std::vector<Card>& cards);
    static HandValue checkFourOfAKind(const std::vector<Card>& cards);
    static HandValue checkFullHouse(const std::vector<Card>& cards);
    static HandValue checkFlush(const std::vector<Card>& cards);
    static HandValue checkStraight(const std::vector<Card>& cards);
    static HandValue checkThreeOfAKind(const std::vector<Card>& cards);
    static HandValue checkTwoPair(const std::vector<Card>& cards);
    static HandValue checkPair(const std::vector<Card>& cards);
    static HandValue checkHighCard(const std::vector<Card>& cards);
    
    static std::vector<int> getRankCounts(const std::vector<Card>& cards);
};

#endif

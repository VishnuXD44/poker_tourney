#include "hand_evaluator.h"
#include <algorithm>
#include <map>
#include <stdexcept>
#include <string>

bool HandValue::operator>(const HandValue& other) const {
    if (rank != other.rank) {
        return rank > other.rank;
    }
    for (size_t i = 0; i < tiebreakers.size() && i < other.tiebreakers.size(); i++) {
        if (tiebreakers[i] != other.tiebreakers[i]) {
            return tiebreakers[i] > other.tiebreakers[i];
        }
    }
    return false;
}

bool HandValue::operator<(const HandValue& other) const {
    return other > *this;
}

std::string HandValue::toString() const {
    switch (rank) {
        case HandRank::HIGH_CARD: return "High Card";
        case HandRank::PAIR: return "Pair";
        case HandRank::TWO_PAIR: return "Two Pair";
        case HandRank::THREE_OF_A_KIND: return "Three of a Kind";
        case HandRank::STRAIGHT: return "Straight";
        case HandRank::FLUSH: return "Flush";
        case HandRank::FULL_HOUSE: return "Full House";
        case HandRank::FOUR_OF_A_KIND: return "Four of a Kind";
        case HandRank::STRAIGHT_FLUSH: return "Straight Flush";
        default: return "Unknown";
    }
}

HandValue HandEvaluator::evaluateHand(const std::vector<Card>& cards) {
    if (cards.size() < 5) {
        throw std::runtime_error("Need at least 5 cards to evaluate");
    }
    
    // Check all possible 5-card combinations and return the best
    HandValue bestValue(HandRank::HIGH_CARD, {});
    bool haveBest = false;

    // For 7 cards, check all C(7,5) = 21 combinations
    std::vector<int> indices(cards.size());
    for (size_t i = 0; i < indices.size(); i++) indices[i] = i;
    
    std::vector<bool> selector(cards.size(), false);
    std::fill(selector.begin(), selector.begin() + 5, true);
    
    do {
        std::vector<Card> hand;
        for (size_t i = 0; i < cards.size(); i++) {
            if (selector[i]) hand.push_back(cards[i]);
        }
        
        HandValue hv = checkStraightFlush(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkFourOfAKind(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkFullHouse(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkFlush(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkStraight(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkThreeOfAKind(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkTwoPair(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkPair(hand);
        if (hv.rank == HandRank::HIGH_CARD) hv = checkHighCard(hand);
        
        // Seed with the first combination: an empty tiebreaker list would make every
        // high-card hand compare equal to it.
        if (!haveBest || hv > bestValue) {
            bestValue = hv;
            haveBest = true;
        }
    } while (std::prev_permutation(selector.begin(), selector.end()));
    
    return bestValue;
}

bool HandEvaluator::isFlush(const std::vector<Card>& cards) {
    Suit firstSuit = cards[0].getSuit();
    for (const auto& card : cards) {
        if (card.getSuit() != firstSuit) return false;
    }
    return true;
}

bool HandEvaluator::isStraight(const std::vector<Card>& cards, std::vector<int>& straightHigh) {
    std::vector<int> values;
    for (const auto& card : cards) {
        values.push_back(card.getValue());
    }
    std::sort(values.begin(), values.end(), std::greater<int>());
    
    // Check for regular straight
    bool straight = true;
    for (size_t i = 1; i < values.size(); i++) {
        if (values[i] != values[i-1] - 1) {
            straight = false;
            break;
        }
    }
    
    if (straight) {
        straightHigh.push_back(values[0]);
        return true;
    }
    
    // Check for A-2-3-4-5 (wheel)
    if (values[0] == 14 && values[1] == 5 && values[2] == 4 && 
        values[3] == 3 && values[4] == 2) {
        straightHigh.push_back(5); // In a wheel, 5 is the high card
        return true;
    }
    
    return false;
}

HandValue HandEvaluator::checkStraightFlush(const std::vector<Card>& cards) {
    std::vector<int> straightHigh;
    if (isFlush(cards) && isStraight(cards, straightHigh)) {
        return HandValue(HandRank::STRAIGHT_FLUSH, straightHigh);
    }
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkFourOfAKind(const std::vector<Card>& cards) {
    std::vector<int> counts = getRankCounts(cards);
    
    for (int rank = 14; rank >= 2; rank--) {
        if (counts[rank] == 4) {
            std::vector<int> kickers;
            for (const auto& card : cards) {
                if (card.getValue() != rank) {
                    kickers.push_back(card.getValue());
                }
            }
            std::sort(kickers.begin(), kickers.end(), std::greater<int>());
            
            std::vector<int> tiebreakers = {rank};
            if (!kickers.empty()) tiebreakers.push_back(kickers[0]);
            
            return HandValue(HandRank::FOUR_OF_A_KIND, tiebreakers);
        }
    }
    
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkFullHouse(const std::vector<Card>& cards) {
    std::vector<int> counts = getRankCounts(cards);
    
    int threeRank = -1;
    int pairRank = -1;
    
    for (int rank = 14; rank >= 2; rank--) {
        if (counts[rank] == 3 && threeRank == -1) {
            threeRank = rank;
        } else if (counts[rank] >= 2 && pairRank == -1) {
            pairRank = rank;
        }
    }
    
    if (threeRank != -1 && pairRank != -1) {
        return HandValue(HandRank::FULL_HOUSE, {threeRank, pairRank});
    }
    
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkFlush(const std::vector<Card>& cards) {
    if (isFlush(cards)) {
        std::vector<int> values;
        for (const auto& card : cards) {
            values.push_back(card.getValue());
        }
        std::sort(values.begin(), values.end(), std::greater<int>());
        return HandValue(HandRank::FLUSH, values);
    }
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkStraight(const std::vector<Card>& cards) {
    std::vector<int> straightHigh;
    if (isStraight(cards, straightHigh)) {
        return HandValue(HandRank::STRAIGHT, straightHigh);
    }
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkThreeOfAKind(const std::vector<Card>& cards) {
    std::vector<int> counts = getRankCounts(cards);
    
    for (int rank = 14; rank >= 2; rank--) {
        if (counts[rank] == 3) {
            std::vector<int> kickers;
            for (const auto& card : cards) {
                if (card.getValue() != rank) {
                    kickers.push_back(card.getValue());
                }
            }
            std::sort(kickers.begin(), kickers.end(), std::greater<int>());
            
            std::vector<int> tiebreakers = {rank};
            for (size_t i = 0; i < std::min(size_t(2), kickers.size()); i++) {
                tiebreakers.push_back(kickers[i]);
            }
            
            return HandValue(HandRank::THREE_OF_A_KIND, tiebreakers);
        }
    }
    
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkTwoPair(const std::vector<Card>& cards) {
    std::vector<int> counts = getRankCounts(cards);
    
    std::vector<int> pairs;
    for (int rank = 14; rank >= 2; rank--) {
        if (counts[rank] == 2) {
            pairs.push_back(rank);
        }
    }
    
    if (pairs.size() >= 2) {
        std::vector<int> kickers;
        for (const auto& card : cards) {
            if (card.getValue() != pairs[0] && card.getValue() != pairs[1]) {
                kickers.push_back(card.getValue());
            }
        }
        std::sort(kickers.begin(), kickers.end(), std::greater<int>());
        
        std::vector<int> tiebreakers = {pairs[0], pairs[1]};
        if (!kickers.empty()) tiebreakers.push_back(kickers[0]);
        
        return HandValue(HandRank::TWO_PAIR, tiebreakers);
    }
    
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkPair(const std::vector<Card>& cards) {
    std::vector<int> counts = getRankCounts(cards);
    
    for (int rank = 14; rank >= 2; rank--) {
        if (counts[rank] == 2) {
            std::vector<int> kickers;
            for (const auto& card : cards) {
                if (card.getValue() != rank) {
                    kickers.push_back(card.getValue());
                }
            }
            std::sort(kickers.begin(), kickers.end(), std::greater<int>());
            
            std::vector<int> tiebreakers = {rank};
            for (size_t i = 0; i < std::min(size_t(3), kickers.size()); i++) {
                tiebreakers.push_back(kickers[i]);
            }
            
            return HandValue(HandRank::PAIR, tiebreakers);
        }
    }
    
    return HandValue(HandRank::HIGH_CARD, {});
}

HandValue HandEvaluator::checkHighCard(const std::vector<Card>& cards) {
    std::vector<int> values;
    for (const auto& card : cards) {
        values.push_back(card.getValue());
    }
    std::sort(values.begin(), values.end(), std::greater<int>());
    
    return HandValue(HandRank::HIGH_CARD, values);
}

std::vector<int> HandEvaluator::getRankCounts(const std::vector<Card>& cards) {
    std::vector<int> counts(15, 0);
    for (const auto& card : cards) {
        counts[card.getValue()]++;
    }
    return counts;
}

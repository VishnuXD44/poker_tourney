// Standalone engine tests. Run with: make test
#include "../hand_evaluator.h"
#include <iostream>

static int failures = 0;

static void expect(bool cond, const char* what) {
    if (!cond) {
        std::cerr << "FAIL: " << what << std::endl;
        failures++;
    }
}

int main() {
    using R = Rank;
    using S = Suit;
    std::vector<Card> aceHigh = {Card(R::ACE, S::HEARTS), Card(R::KING, S::DIAMONDS), Card(R::NINE, S::CLUBS),
                                 Card(R::SEVEN, S::SPADES), Card(R::THREE, S::HEARTS), Card(R::TWO, S::DIAMONDS), Card(R::FOUR, S::CLUBS)};
    std::vector<Card> queenKicker = {Card(R::ACE, S::HEARTS), Card(R::QUEEN, S::DIAMONDS), Card(R::NINE, S::CLUBS),
                                     Card(R::SEVEN, S::SPADES), Card(R::THREE, S::HEARTS), Card(R::TWO, S::DIAMONDS), Card(R::FOUR, S::CLUBS)};
    HandValue a = HandEvaluator::evaluateHand(aceHigh);
    HandValue b = HandEvaluator::evaluateHand(queenKicker);
    expect(a.rank == HandRank::HIGH_CARD, "A-K-9-7-4 is high card");
    expect(!a.tiebreakers.empty(), "high card hand has tiebreakers");
    expect(a > b, "A-K high beats A-Q high");
    expect(!(b > a), "A-Q high does not beat A-K high");

    std::vector<Card> pairOfTwos = {Card(R::TWO, S::HEARTS), Card(R::TWO, S::DIAMONDS), Card(R::NINE, S::CLUBS),
                                    Card(R::SEVEN, S::SPADES), Card(R::THREE, S::HEARTS), Card(R::FIVE, S::DIAMONDS), Card(R::JACK, S::CLUBS)};
    expect(HandEvaluator::evaluateHand(pairOfTwos) > a, "pair beats high card");

    if (failures == 0) std::cout << "All engine tests passed" << std::endl;
    return failures == 0 ? 0 : 1;
}

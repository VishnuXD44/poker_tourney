#ifndef POKER_GAME_H
#define POKER_GAME_H

#include "card.h"
#include "player.h"
#include "hand_evaluator.h"
#include <vector>
#include <string>
#include <memory>

enum class GameStage {
    PRE_FLOP,
    FLOP,
    TURN,
    RIVER,
    SHOWDOWN
};

class PokerGame {
private:
    std::vector<std::shared_ptr<Player>> players;
    Deck deck;
    std::vector<Card> communityCards;
    int pot;
    int currentBet;
    int minRaise;
    int dealerButton;
    int smallBlind;
    int bigBlind;
    GameStage stage;
    
    void dealHoleCards();
    void dealFlop();
    void dealTurn();
    void dealRiver();
    void collectBets();
    void resetBets();
    int bettingRound(int startingPlayer);
    int findNextActivePlayer(int current);
    std::vector<int> determineWinners();
    void distributePot(const std::vector<int>& winners);
    std::string getGameStateString(int playerIndex);
    
public:
    PokerGame(int sb, int bb);
    
    void addPlayer(std::shared_ptr<Player> player);
    void playHand();
    void removePlayer(int index);
    
    std::string getCommunityCardsString() const;
    int getPot() const { return pot; }
    const std::vector<Card>& getCommunityCards() const { return communityCards; }
    
    void printGameState() const;
};

#endif

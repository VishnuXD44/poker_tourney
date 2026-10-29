#include "poker_game.h"
#include <iostream>
#include <algorithm>
#include <sstream>

PokerGame::PokerGame(int sb, int bb) 
    : pot(0), currentBet(0), minRaise(bb), dealerButton(0), 
      smallBlind(sb), bigBlind(bb), stage(GameStage::PRE_FLOP) {}

void PokerGame::addPlayer(std::shared_ptr<Player> player) {
    players.push_back(player);
}

void PokerGame::removePlayer(int index) {
    if (index >= 0 && index < players.size()) {
        players.erase(players.begin() + index);
    }
}

std::string PokerGame::getCommunityCardsString() const {
    std::stringstream ss;
    ss << "Community Cards: ";
    for (const auto& card : communityCards) {
        ss << card.toString() << " ";
    }
    return ss.str();
}

void PokerGame::printGameState() const {
    std::cout << "\n" << std::string(60, '-') << std::endl;
    std::cout << "POT: " << pot << std::endl;
    std::cout << getCommunityCardsString() << std::endl;
    std::cout << "Current Bet: " << currentBet << std::endl;
    std::cout << "\nPlayers:" << std::endl;
    for (const auto& player : players) {
        std::cout << "  " << player->toString() << std::endl;
    }
    std::cout << std::string(60, '-') << std::endl;
}

std::string PokerGame::getGameStateString(int playerIndex) {
    std::stringstream ss;
    
    ss << "\n--- POKER GAME STATE ---\n";
    ss << "Stage: ";
    switch (stage) {
        case GameStage::PRE_FLOP: ss << "Pre-Flop"; break;
        case GameStage::FLOP: ss << "Flop"; break;
        case GameStage::TURN: ss << "Turn"; break;
        case GameStage::RIVER: ss << "River"; break;
        case GameStage::SHOWDOWN: ss << "Showdown"; break;
    }
    ss << "\n";

    int totalPot = pot;
    for (const auto& p : players) totalPot += p->getCurrentBet();
    ss << "Pot: " << totalPot << "\n";
    ss << "Current Bet: " << currentBet << "\n";
    
    if (!communityCards.empty()) {
        ss << "Community Cards: ";
        for (const auto& card : communityCards) {
            ss << card.toString() << " ";
        }
        ss << "\n";
    }
    
    ss << "\nOpponents:\n";
    for (size_t i = 0; i < players.size(); i++) {
        if (i != playerIndex && !players[i]->hasFolded()) {
            ss << "  " << players[i]->getName() 
               << " [Chips: " << players[i]->getChips() 
               << ", Bet: " << players[i]->getCurrentBet() << "]";
            if (players[i]->isAllIn()) ss << " ALL-IN";
            ss << "\n";
        }
    }
    
    return ss.str();
}

void PokerGame::dealHoleCards() {
    for (int i = 0; i < 2; i++) {
        for (auto& player : players) {
            if (!player->hasFolded()) {
                player->addCard(deck.dealCard());
            }
        }
    }
}

void PokerGame::dealFlop() {
    deck.dealCard(); // Burn card
    for (int i = 0; i < 3; i++) {
        communityCards.push_back(deck.dealCard());
    }
    stage = GameStage::FLOP;
}

void PokerGame::dealTurn() {
    deck.dealCard(); // Burn card
    communityCards.push_back(deck.dealCard());
    stage = GameStage::TURN;
}

void PokerGame::dealRiver() {
    deck.dealCard(); // Burn card
    communityCards.push_back(deck.dealCard());
    stage = GameStage::RIVER;
}

void PokerGame::collectBets() {
    for (auto& player : players) {
        pot += player->getCurrentBet();
    }
}

void PokerGame::resetBets() {
    for (auto& player : players) {
        player->resetForNewRound();
    }
    currentBet = 0;
}

int PokerGame::findNextActivePlayer(int current) {
    int next = (current + 1) % players.size();
    int searched = 0;
    
    while (searched < players.size()) {
        if (!players[next]->hasFolded() && !players[next]->isAllIn()) {
            return next;
        }
        next = (next + 1) % players.size();
        searched++;
    }
    
    return -1; // No active players
}

int PokerGame::bettingRound(int startingPlayer) {
    int currentPlayer = startingPlayer;
    int lastRaiser = -1;
    int activePlayers = 0;
    
    // Count active players
    for (const auto& player : players) {
        if (!player->hasFolded() && !player->isAllIn()) {
            activePlayers++;
        }
    }
    
    if (activePlayers <= 1) {
        return activePlayers;
    }
    
    bool bettingComplete = false;
    int playersActed = 0;
    
    while (!bettingComplete) {
        if (players[currentPlayer]->hasFolded() || players[currentPlayer]->isAllIn()) {
            currentPlayer = findNextActivePlayer(currentPlayer);
            if (currentPlayer == -1) break;
            continue;
        }
        
        int callAmount = currentBet - players[currentPlayer]->getCurrentBet();
        if (callAmount < 0) callAmount = 0;
        std::string gameState = getGameStateString(currentPlayer);
        
        Action action = players[currentPlayer]->getAction(gameState, currentBet, minRaise, pot);
        
        std::cout << "\n" << players[currentPlayer]->getName() << " ";
        
        switch (action.type) {
            case PlayerAction::FOLD:
                std::cout << "folds" << std::endl;
                activePlayers--;
                break;
                
            case PlayerAction::CHECK:
                if (callAmount == 0) {
                    std::cout << "checks" << std::endl;
                } else {
                    std::cout << "Invalid action. Must call or fold. Folding..." << std::endl;
                    activePlayers--;
                }
                break;
                
            case PlayerAction::CALL:
                if (callAmount > 0) {
                    int betAmount = players[currentPlayer]->bet(callAmount);
                    std::cout << "calls " << betAmount << std::endl;
                    if (betAmount < callAmount) {
                        std::cout << players[currentPlayer]->getName() << " is all-in!" << std::endl;
                    }
                } else {
                    std::cout << "checks" << std::endl;
                }
                break;
                
            case PlayerAction::RAISE:
                {
                    int raiseBy = action.amount;
                    if (raiseBy < minRaise) {
                        std::cout << "(raise below minimum of " << minRaise << ", raising the minimum) ";
                        raiseBy = minRaise;
                    }
                    players[currentPlayer]->bet(callAmount + raiseBy);
                    std::cout << "raises to " << players[currentPlayer]->getCurrentBet() << std::endl;
                    if (players[currentPlayer]->isAllIn()) {
                        std::cout << players[currentPlayer]->getName() << " is all-in!" << std::endl;
                    }

                    // A short all-in still raises the bet to match, but only a full raise reopens betting.
                    if (players[currentPlayer]->getCurrentBet() > currentBet) {
                        int raisedBy = players[currentPlayer]->getCurrentBet() - currentBet;
                        currentBet = players[currentPlayer]->getCurrentBet();
                        if (raisedBy >= minRaise) {
                            minRaise = raisedBy;
                            lastRaiser = currentPlayer;
                            playersActed = 0;
                        }
                    }
                }
                break;
                
            case PlayerAction::ALL_IN:
                {
                    int allInAmount = players[currentPlayer]->getChips();
                    players[currentPlayer]->bet(allInAmount);
                    std::cout << "goes all-in with " << allInAmount << std::endl;
                    
                    if (players[currentPlayer]->getCurrentBet() > currentBet) {
                        int raiseAmount = players[currentPlayer]->getCurrentBet() - currentBet;
                        currentBet = players[currentPlayer]->getCurrentBet();
                        if (raiseAmount >= minRaise) {
                            minRaise = raiseAmount;
                            lastRaiser = currentPlayer;
                            playersActed = 0;
                        }
                    }
                }
                break;
        }
        
        playersActed++;
        
        // Check if betting round is complete
        bool allMatched = true;
        int activeCount = 0;
        for (const auto& player : players) {
            if (!player->hasFolded() && !player->isAllIn()) {
                activeCount++;
                if (player->getCurrentBet() != currentBet) {
                    allMatched = false;
                }
            }
        }
        
        if (activePlayers <= 1 || (allMatched && playersActed >= activeCount)) {
            bettingComplete = true;
        } else {
            currentPlayer = findNextActivePlayer(currentPlayer);
            if (currentPlayer == -1) {
                bettingComplete = true;
            }
        }
    }
    
    collectBets();
    for (auto& p : players) p->clearCurrentBet();

    // Count remaining active players
    activePlayers = 0;
    for (const auto& player : players) {
        if (!player->hasFolded()) {
            activePlayers++;
        }
    }
    
    return activePlayers;
}

std::vector<int> PokerGame::determineWinners() {
    std::vector<int> activePlayers;
    
    for (size_t i = 0; i < players.size(); i++) {
        if (!players[i]->hasFolded()) {
            activePlayers.push_back(i);
        }
    }
    
    if (activePlayers.size() == 1) {
        return activePlayers;
    }
    
    // Evaluate hands
    std::vector<std::pair<int, HandValue>> hands;
    for (int idx : activePlayers) {
        std::vector<Card> allCards = players[idx]->getHoleCards();
        allCards.insert(allCards.end(), communityCards.begin(), communityCards.end());
        
        HandValue hv = HandEvaluator::evaluateHand(allCards);
        hands.push_back({idx, hv});
        
        std::cout << players[idx]->getName() << " has " << hv.toString() 
                  << " with cards: ";
        for (const auto& card : players[idx]->getHoleCards()) {
            std::cout << card.toString() << " ";
        }
        std::cout << std::endl;
    }
    
    // Find best hand
    HandValue bestHand = hands[0].second;
    for (const auto& hand : hands) {
        if (hand.second > bestHand) {
            bestHand = hand.second;
        }
    }
    
    // Find all players with best hand (for split pots)
    std::vector<int> winners;
    for (const auto& hand : hands) {
        if (!(hand.second < bestHand) && !(bestHand < hand.second)) {
            winners.push_back(hand.first);
        }
    }
    
    return winners;
}

void PokerGame::distributePot(const std::vector<int>& winners) {
    if (winners.empty()) return;
    
    int winAmount = pot / winners.size();
    
    std::cout << "\n*** WINNER";
    if (winners.size() > 1) std::cout << "S";
    std::cout << " ***" << std::endl;
    
    for (int winnerIdx : winners) {
        players[winnerIdx]->addChips(winAmount);
        std::cout << players[winnerIdx]->getName() << " wins " << winAmount << " chips!" << std::endl;
    }
    
    pot = 0;
}

void PokerGame::playHand() {
    std::cout << "\n\n" << std::string(70, '=') << std::endl;
    std::cout << "NEW HAND" << std::endl;
    std::cout << std::string(70, '=') << std::endl;
    
    // Reset for new hand
    communityCards.clear();
    deck.reset();
    deck.shuffle();
    stage = GameStage::PRE_FLOP;
    
    for (auto& player : players) {
        player->resetForNewRound();
    }
    
    currentBet = 0;
    minRaise = bigBlind;
    
    // Post blinds
    int sbPlayer = (dealerButton + 1) % players.size();
    int bbPlayer = (dealerButton + 2) % players.size();
    
    std::cout << "\n" << players[sbPlayer]->getName() << " posts small blind: " << smallBlind << std::endl;
    players[sbPlayer]->bet(smallBlind);
    
    std::cout << players[bbPlayer]->getName() << " posts big blind: " << bigBlind << std::endl;
    players[bbPlayer]->bet(bigBlind);
    currentBet = bigBlind;
    
    // Deal hole cards
    dealHoleCards();
    
    // Pre-flop betting
    std::cout << "\n--- PRE-FLOP ---" << std::endl;
    int activePlayers = bettingRound((dealerButton + 3) % players.size());
    
    if (activePlayers > 1) {
        // Flop
        dealFlop();
        std::cout << "\n--- FLOP ---" << std::endl;
        std::cout << getCommunityCardsString() << std::endl;
        currentBet = 0;
        activePlayers = bettingRound((dealerButton + 1) % players.size());
    }
    
    if (activePlayers > 1) {
        // Turn
        dealTurn();
        std::cout << "\n--- TURN ---" << std::endl;
        std::cout << getCommunityCardsString() << std::endl;
        currentBet = 0;
        activePlayers = bettingRound((dealerButton + 1) % players.size());
    }
    
    if (activePlayers > 1) {
        // River
        dealRiver();
        std::cout << "\n--- RIVER ---" << std::endl;
        std::cout << getCommunityCardsString() << std::endl;
        currentBet = 0;
        activePlayers = bettingRound((dealerButton + 1) % players.size());
    }
    
    // Showdown
    stage = GameStage::SHOWDOWN;
    std::cout << "\n--- SHOWDOWN ---" << std::endl;
    std::cout << getCommunityCardsString() << std::endl;
    
    std::vector<int> winners = determineWinners();
    distributePot(winners);
    
    // Move dealer button
    dealerButton = (dealerButton + 1) % players.size();
    
    // Show chip counts
    std::cout << "\n--- CHIP COUNTS ---" << std::endl;
    for (const auto& player : players) {
        std::cout << player->getName() << ": " << player->getChips() << std::endl;
    }
}

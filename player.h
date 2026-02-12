#ifndef PLAYER_H
#define PLAYER_H

#include "card.h"
#include <string>
#include <vector>

enum class PlayerAction {
    FOLD,
    CALL,
    RAISE,
    CHECK,
    ALL_IN
};

struct Action {
    PlayerAction type;
    int amount;
    
    Action(PlayerAction t, int a = 0) : type(t), amount(a) {}
};

class Player {
protected:
    std::string name;
    int chips;
    std::vector<Card> holeCards;
    int currentBet;
    bool folded;
    bool allIn;

public:
    Player(const std::string& n, int c);
    virtual ~Player() {}
    
    // Getters
    std::string getName() const { return name; }
    int getChips() const { return chips; }
    const std::vector<Card>& getHoleCards() const { return holeCards; }
    int getCurrentBet() const { return currentBet; }
    bool hasFolded() const { return folded; }
    bool isAllIn() const { return allIn; }
    
    // Setters
    void addCard(const Card& card) { holeCards.push_back(card); }
    void clearCards() { holeCards.clear(); }
    void resetForNewRound();
    void clearCurrentBet() { currentBet = 0; }

    // Chip management
    void addChips(int amount) { chips += amount; }
    int bet(int amount);
    
    // Pure virtual function for AI agents to implement
    virtual Action getAction(const std::string& gameState, int currentBet, int minRaise, int pot) = 0;
    
    // Get string representation of player state
    std::string toString() const;
};

// Interface for external AI agents (text-based communication)
class AIPlayer : public Player {
public:
    AIPlayer(const std::string& n, int c) : Player(n, c) {}
    
    // This method will be overridden by specific AI implementations
    virtual Action getAction(const std::string& gameState, int currentBet, int minRaise, int pot) override;
    
protected:
    // Parse text commands from AI: "fold", "call", "check", "raise 100", "all-in"
    Action parseCommand(const std::string& command);
};

#endif

#include "player.h"
#include <iostream>
#include <sstream>
#include <algorithm>

Player::Player(const std::string& n, int c) 
    : name(n), chips(c), currentBet(0), folded(false), allIn(false) {}

void Player::resetForNewRound() {
    holeCards.clear();
    currentBet = 0;
    folded = false;
    allIn = false;
}

int Player::bet(int amount) {
    if (amount >= chips) {
        // All-in
        int betAmount = chips;
        chips = 0;
        currentBet += betAmount;
        allIn = true;
        return betAmount;
    }
    
    chips -= amount;
    currentBet += amount;
    return amount;
}

std::string Player::toString() const {
    std::stringstream ss;
    ss << name << " [Chips: " << chips << ", Bet: " << currentBet << "]";
    if (folded) ss << " FOLDED";
    if (allIn) ss << " ALL-IN";
    return ss.str();
}

Action AIPlayer::getAction(const std::string& gameState, int currentBet, int minRaise, int pot) {
    std::cout << "\n" << std::string(60, '=') << std::endl;
    std::cout << "GAME STATE FOR " << name << std::endl;
    std::cout << std::string(60, '=') << std::endl;
    std::cout << gameState << std::endl;
    int toCall = currentBet - this->currentBet;
    if (toCall < 0) toCall = 0;
    std::cout << "Current bet to call: " << toCall << std::endl;
    std::cout << "Minimum raise: " << minRaise << std::endl;
    std::cout << "Pot size: " << pot << std::endl;
    std::cout << "Your chips: " << chips << std::endl;
    std::cout << "Your cards: ";
    for (const auto& card : holeCards) {
        std::cout << card.toString() << " ";
    }
    std::cout << std::endl;
    std::cout << std::string(60, '=') << std::endl;
    
    std::cout << "\nEnter action (fold/call/check/raise <amount>/all-in): ";
    std::string command;
    std::getline(std::cin, command);

    Action a = parseCommand(command);
    if (a.type == PlayerAction::FOLD) {
        std::string c = command;
        std::transform(c.begin(), c.end(), c.begin(), ::tolower);
        size_t s = c.find_first_not_of(" \t\n\r"), e = c.find_last_not_of(" \t\n\r");
        if (s != std::string::npos && e != std::string::npos) c = c.substr(s, e - s + 1);
        if (c != "fold") {
            std::cout << "Try again: ";
            std::getline(std::cin, command);
            a = parseCommand(command);
            if (a.type == PlayerAction::FOLD) folded = true;
            return a;
        }
    }
    return a;
}

Action AIPlayer::parseCommand(const std::string& command) {
    std::string cmd = command;
    
    // Convert to lowercase
    std::transform(cmd.begin(), cmd.end(), cmd.begin(), ::tolower);
    
    // Trim whitespace
    size_t start = cmd.find_first_not_of(" \t\n\r");
    size_t end = cmd.find_last_not_of(" \t\n\r");
    if (start != std::string::npos && end != std::string::npos) {
        cmd = cmd.substr(start, end - start + 1);
    }
    
    if (cmd == "fold") {
        folded = true;
        return Action(PlayerAction::FOLD);
    } else if (cmd == "call") {
        return Action(PlayerAction::CALL);
    } else if (cmd == "check") {
        return Action(PlayerAction::CHECK);
    } else if (cmd == "all-in" || cmd == "allin") {
        return Action(PlayerAction::ALL_IN);
    } else if (cmd.find("raise") == 0) {
        // Extract amount from "raise 100" or "raise100"
        std::stringstream ss(cmd.substr(5));
        int amount;
        if (ss >> amount) {
            return Action(PlayerAction::RAISE, amount);
        }
    }
    
    // Invalid command: return FOLD but don't set folded yet (getAction may reprompt)
    std::cout << "Invalid command. Defaulting to fold." << std::endl;
    return Action(PlayerAction::FOLD);
}

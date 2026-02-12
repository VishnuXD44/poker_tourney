#include "poker_game.h"
#include <iostream>
#include <memory>

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "   TEXAS HOLD'EM POKER ENGINE" << std::endl;
    std::cout << "   For AI Agents and Models" << std::endl;
    std::cout << "========================================" << std::endl;
    
    // Create game with small blind 10, big blind 20
    PokerGame game(10, 20);
    
    // Add players (you + AI agents, all in the same game)
    std::cout << "\nCreating players..." << std::endl;
    
    auto human = std::make_shared<AIPlayer>("You", 1000);
    auto agent1 = std::make_shared<AIPlayer>("AI_Agent_1", 1000);
    auto agent2 = std::make_shared<AIPlayer>("AI_Agent_2", 1000);
    auto agent3 = std::make_shared<AIPlayer>("AI_Agent_3", 1000);
    
    game.addPlayer(human);
    game.addPlayer(agent1);
    game.addPlayer(agent2);
    game.addPlayer(agent3);
    
    std::cout << "You and 3 AI agents added to the game (4 players total)." << std::endl;
    std::cout << "Starting chips: 1000 each" << std::endl;
    std::cout << "Blinds: 10/20" << std::endl;
    
    // Play multiple hands
    std::cout << "\nHow many hands would you like to play? ";
    int numHands;
    std::cin >> numHands;
    std::cin.ignore(); // Clear newline
    
    for (int i = 0; i < numHands; i++) {
        std::cout << "\n\nHAND " << (i + 1) << " of " << numHands << std::endl;
        game.playHand();
        
        // Check if any player is out of chips
        bool gameOver = false;
        // Could add elimination logic here if desired
    }
    
    std::cout << "\n\n========================================" << std::endl;
    std::cout << "   GAME OVER" << std::endl;
    std::cout << "========================================" << std::endl;
    
    return 0;
}

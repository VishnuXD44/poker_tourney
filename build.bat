@echo off
echo ========================================
echo Building Poker Engine
echo ========================================

echo.
echo Compiling source files...

g++ -std=c++17 -Wall -Wextra -O2 -c card.cpp -o card.o
if errorlevel 1 goto error

g++ -std=c++17 -Wall -Wextra -O2 -c hand_evaluator.cpp -o hand_evaluator.o
if errorlevel 1 goto error

g++ -std=c++17 -Wall -Wextra -O2 -c player.cpp -o player.o
if errorlevel 1 goto error

g++ -std=c++17 -Wall -Wextra -O2 -c poker_game.cpp -o poker_game.o
if errorlevel 1 goto error

g++ -std=c++17 -Wall -Wextra -O2 -c main.cpp -o main.o
if errorlevel 1 goto error

echo.
echo Linking...
g++ -std=c++17 -o poker_engine.exe card.o hand_evaluator.o player.o poker_game.o main.o
if errorlevel 1 goto error

echo.
echo ========================================
echo Build successful!
echo ========================================
echo.
echo Run the poker engine with: poker_engine.exe
echo.
goto end

:error
echo.
echo ========================================
echo Build failed!
echo ========================================
echo.
echo Make sure g++ is installed and in your PATH
echo.

:end

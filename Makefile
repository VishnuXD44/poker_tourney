CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2
TARGET = poker_engine
SOURCES = main.cpp card.cpp hand_evaluator.cpp player.cpp poker_game.cpp
OBJECTS = $(SOURCES:.cpp=.o)
HEADERS = card.h hand_evaluator.h player.h poker_game.h

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CXX) $(CXXFLAGS) -o $(TARGET) $(OBJECTS)

%.o: %.cpp $(HEADERS)
	$(CXX) $(CXXFLAGS) -c $< -o $@

TEST_TARGET = tests/hand_evaluator_test

$(TEST_TARGET): tests/hand_evaluator_test.cpp card.o hand_evaluator.o $(HEADERS)
	$(CXX) $(CXXFLAGS) -o $@ tests/hand_evaluator_test.cpp card.o hand_evaluator.o

test: $(TEST_TARGET)
	./$(TEST_TARGET)

clean:
	rm -f $(OBJECTS) $(TARGET) $(TEST_TARGET)

run: $(TARGET)
	./$(TARGET)

.PHONY: all clean run test

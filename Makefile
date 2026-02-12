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

clean:
	rm -f $(OBJECTS) $(TARGET)

run: $(TARGET)
	./$(TARGET)

.PHONY: all clean run

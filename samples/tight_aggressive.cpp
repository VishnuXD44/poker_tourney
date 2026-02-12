/*
 * Sample bot: Tight Aggressive
 * Checks when free; calls or raises with decent cards (A/K/Q/pair); folds weak hands to big bets.
 * Protocol: read one JSON line from stdin, write one JSON line to stdout.
 * Compile: g++ -std=c++17 -O2 -o tight_aggressive tight_aggressive.cpp
 */
#include <iostream>
#include <string>
#include <cctype>

int main() {
  std::string line;
  if (!std::getline(std::cin, line)) {
    std::cout << "{\"action\":\"fold\"}" << std::endl;
    return 0;
  }

  auto findNum = [&line](const std::string& key) -> long long {
    std::string search = "\"" + key + "\":";
    size_t pos = line.find(search);
    if (pos == std::string::npos) return 0;
    pos += search.size();
    while (pos < line.size() && (line[pos] == ' ' || line[pos] == '\t')) ++pos;
    if (pos >= line.size()) return 0;
    std::string numStr;
    if (line[pos] == '-') { numStr += '-'; ++pos; }
    while (pos < line.size() && std::isdigit(static_cast<unsigned char>(line[pos])))
      numStr += line[pos++];
    if (numStr.empty()) return 0;
    return std::stoll(numStr);
  };

  auto hasFaceOrPair = [&line]() -> bool {
    size_t pos = line.find("\"myCards\":[");
    if (pos == std::string::npos) return false;
    pos += 10;
    size_t end = line.find(']', pos);
    if (end == std::string::npos) return false;
    std::string cards = line.substr(pos, end - pos);
    bool hasA = cards.find('A') != std::string::npos;
    bool hasK = cards.find('K') != std::string::npos;
    bool hasQ = cards.find('Q') != std::string::npos;
    bool hasJ = cards.find('J') != std::string::npos;
    bool hasT = cards.find('T') != std::string::npos;
    for (char c = '2'; c <= '9'; ++c) {
      if (cards.find(c) != std::string::npos &&
          cards.find(c) != cards.rfind(c))
        return true;
    }
    if (cards.find("T") != std::string::npos && cards.rfind("T") != cards.find("T")) return true;
    if (cards.find("J") != std::string::npos && cards.rfind("J") != cards.find("J")) return true;
    if (cards.find("Q") != std::string::npos && cards.rfind("Q") != cards.find("Q")) return true;
    if (cards.find("K") != std::string::npos && cards.rfind("K") != cards.find("K")) return true;
    if (cards.find("A") != std::string::npos && cards.rfind("A") != cards.find("A")) return true;
    return hasA || hasK || hasQ || hasJ || hasT;
  };

  long long toCall = findNum("toCall");
  long long myChips = findNum("myChips");
  long long minRaise = findNum("minRaise");
  long long pot = findNum("pot");

  if (toCall == 0) {
    std::cout << "{\"action\":\"check\"}" << std::endl;
    return 0;
  }
  if (toCall >= myChips) {
    std::cout << "{\"action\":\"all-in\"}" << std::endl;
    return 0;
  }

  bool decent = hasFaceOrPair();
  if (decent && myChips > toCall + minRaise && toCall <= pot / 2) {
    std::cout << "{\"action\":\"raise\",\"amount\":" << minRaise << "}" << std::endl;
    return 0;
  }
  if (decent || toCall <= pot / 4) {
    std::cout << "{\"action\":\"call\"}" << std::endl;
    return 0;
  }
  std::cout << "{\"action\":\"fold\"}" << std::endl;
  return 0;
}

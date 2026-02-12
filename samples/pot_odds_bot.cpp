/*
 * Sample bot: Pot Odds / EV-based
 * Uses pot odds: call when estimated equity * (pot + toCall) > toCall (positive EV).
 * Raises for value when hand strength is high; folds when EV(call) < 0.
 * Protocol: one JSON line from stdin, one JSON line to stdout.
 * Compile: g++ -std=c++17 -O2 -o pot_odds_bot pot_odds_bot.cpp
 */
#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <cctype>

static int rankFromChar(char c) {
  if (c == 'A') return 14;
  if (c == 'K') return 13;
  if (c == 'Q') return 12;
  if (c == 'J') return 11;
  if (c == 'T') return 10;
  if (c >= '2' && c <= '9') return c - '0';
  return 0;
}

static void parseCards(const std::string& line, const std::string& key, std::vector<int>& ranks) {
  std::string search = "\"" + key + "\":[";
  size_t pos = line.find(search);
  if (pos == std::string::npos) return;
  pos += search.size();
  while (pos < line.size()) {
    size_t start = line.find('"', pos);
    if (start == std::string::npos) break;
    size_t end = line.find('"', start + 1);
    if (end == std::string::npos) break;
    std::string card = line.substr(start + 1, end - start - 1);
    if (card.size() >= 1) {
      int r = (card.size() >= 2 && card[0] == '1') ? 10 : rankFromChar(card[0]);
      if (r > 0) ranks.push_back(r);
    }
    pos = end + 1;
    if (pos < line.size() && line[pos] == ']') break;
  }
}

static long long findNum(const std::string& line, const std::string& key) {
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
}

/* Preflop: approximate equity vs random hand (0.0 to 1.0) from 2-card strength. */
static double preflopEquity(std::vector<int>& hole) {
  if (hole.size() != 2) return 0.35;
  int a = hole[0], b = hole[1];
  if (a < b) std::swap(a, b);
  bool pair = (a == b);
  int high = a, low = b;
  int gap = high - low;
  if (pair) {
    if (high >= 12) return 0.85;
    if (high >= 10) return 0.75;
    if (high >= 8) return 0.65;
    return 0.55;
  }
  bool connected = (gap <= 2);
  if (high >= 14 && low >= 10) return 0.68;
  if (high >= 13 && low >= 9) return 0.58;
  if (high >= 12 && connected) return 0.55;
  if (high >= 10) return 0.48;
  if (high >= 8) return 0.42;
  return 0.38;
}

/* Postflop: rough equity from pair+ or strong draw (simplified). */
static double postflopEquity(const std::vector<int>& hole, const std::vector<int>& board) {
  if (hole.size() != 2 || board.empty()) return 0.35;
  std::vector<int> all(hole);
  all.insert(all.end(), board.begin(), board.end());
  int pairCount = 0;
  for (size_t i = 0; i < all.size(); i++)
    for (size_t j = i + 1; j < all.size(); j++)
      if (all[i] == all[j]) pairCount++;
  int maxCount = 0;
  for (int r = 14; r >= 2; r--) {
    int c = 0;
    for (int x : all) if (x == r) c++;
    if (c > maxCount) maxCount = c;
  }
  if (maxCount >= 2) {
    if (maxCount >= 3) return 0.75;
    return 0.58;
  }
  int high = std::max(hole[0], hole[1]);
  int low = std::min(hole[0], hole[1]);
  for (int b : board) high = std::max(high, b);
  return 0.35 + (high - 7) * 0.03;
}

int main() {
  std::string line;
  if (!std::getline(std::cin, line)) {
    std::cout << "{\"action\":\"fold\"}" << std::endl;
    return 0;
  }

  long long toCall = findNum(line, "toCall");
  long long pot = findNum(line, "pot");
  long long myChips = findNum(line, "myChips");
  long long minRaise = findNum(line, "minRaise");
  std::string stage;
  size_t stagePos = line.find("\"stage\":\"");
  if (stagePos != std::string::npos) {
    stagePos += 9;
    size_t end = line.find('"', stagePos);
    if (end != std::string::npos) stage = line.substr(stagePos, end - stagePos);
  }

  std::vector<int> myRanks, boardRanks;
  parseCards(line, "myCards", myRanks);
  parseCards(line, "communityCards", boardRanks);

  double equity = 0.4;
  if (boardRanks.empty())
    equity = preflopEquity(myRanks);
  else
    equity = postflopEquity(myRanks, boardRanks);

  if (toCall == 0) {
    std::cout << "{\"action\":\"check\"}" << std::endl;
    return 0;
  }
  if (toCall >= myChips) {
    std::cout << "{\"action\":\"all-in\"}" << std::endl;
    return 0;
  }

  long long potAfterCall = pot + toCall;
  double potOdds = (potAfterCall > 0) ? static_cast<double>(toCall) / potAfterCall : 1.0;
  bool evCall = (equity > potOdds);

  if (!evCall) {
    std::cout << "{\"action\":\"fold\"}" << std::endl;
    return 0;
  }
  if (equity >= 0.65 && myChips > toCall + minRaise) {
    std::cout << "{\"action\":\"raise\",\"amount\":" << minRaise << "}" << std::endl;
    return 0;
  }
  std::cout << "{\"action\":\"call\"}" << std::endl;
  return 0;
}

/*
 * Sample bot: GTO-style balanced (value + bluff mix)
 * Game theory: balance value bets with bluffs so opponent cannot exploit.
 * - Value bet/raise with strong hands.
 * - Bluff with weak hands a fraction of the time (when pot is small).
 * - Call with medium hands when pot odds justify; otherwise mix.
 * Uses deterministic "mix" via hand hash so behavior is stable per hand.
 * Protocol: one JSON line from stdin, one JSON line to stdout.
 * Compile: g++ -std=c++17 -O2 -o gto_balanced gto_balanced.cpp
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

enum class RangeType { FOLD, CALL, BLUFF_RAISE, VALUE_RAISE };

static RangeType classifyHand(const std::vector<int>& hole, const std::vector<int>& board,
                              long long pot, long long toCall, unsigned mix) {
  if (hole.size() != 2) return RangeType::FOLD;
  int a = hole[0], b = hole[1];
  if (a < b) std::swap(a, b);
  bool pair = (a == b);
  bool strong = (a >= 12 && b >= 10) || pair;
  bool medium = (a >= 10) || (a >= 8 && b >= 6);
  bool weak = (a <= 9 && b <= 6);

  if (!board.empty()) {
    int pairCount = 0;
    for (int h : hole) for (int c : board) if (h == c) pairCount++;
    if (pairCount >= 1) strong = true;
    if (pairCount >= 2) strong = true;
  }

  if (strong) return RangeType::VALUE_RAISE;
  if (medium) return RangeType::CALL;
  if (weak) {
    bool smallBet = (toCall == 0 || (pot > 0 && toCall * 2 < pot));
    if (smallBet && (mix % 5 == 0))
      return RangeType::BLUFF_RAISE;
    return RangeType::FOLD;
  }
  return RangeType::CALL;
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

  std::vector<int> myRanks, boardRanks;
  parseCards(line, "myCards", myRanks);
  parseCards(line, "communityCards", boardRanks);

  unsigned mix = 0;
  for (int r : myRanks) mix = mix * 17 + static_cast<unsigned>(r);
  for (int r : boardRanks) mix = mix * 17 + static_cast<unsigned>(r);
  mix += static_cast<unsigned>(pot) + static_cast<unsigned>(toCall);

  if (toCall == 0) {
    RangeType rt = classifyHand(myRanks, boardRanks, pot, toCall, mix);
    if (rt == RangeType::VALUE_RAISE && myChips > minRaise)
      std::cout << "{\"action\":\"raise\",\"amount\":" << minRaise << "}" << std::endl;
    else if (rt == RangeType::BLUFF_RAISE && myChips > minRaise)
      std::cout << "{\"action\":\"raise\",\"amount\":" << minRaise << "}" << std::endl;
    else
      std::cout << "{\"action\":\"check\"}" << std::endl;
    return 0;
  }
  if (toCall >= myChips) {
    std::cout << "{\"action\":\"all-in\"}" << std::endl;
    return 0;
  }

  RangeType rt = classifyHand(myRanks, boardRanks, pot, toCall, mix);
  if (rt == RangeType::FOLD) {
    std::cout << "{\"action\":\"fold\"}" << std::endl;
    return 0;
  }
  if ((rt == RangeType::VALUE_RAISE || rt == RangeType::BLUFF_RAISE) && myChips > toCall + minRaise) {
    std::cout << "{\"action\":\"raise\",\"amount\":" << minRaise << "}" << std::endl;
    return 0;
  }
  std::cout << "{\"action\":\"call\"}" << std::endl;
  return 0;
}

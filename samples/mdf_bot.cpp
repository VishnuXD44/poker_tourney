/*
 * Sample bot: Minimum Defense Frequency (MDF)
 * Game theory: don't over-fold. Defend at least (1 - pot_odds) of the time
 * so the opponent cannot profit by betting any two cards. We fold only
 * the bottom of our range; otherwise call or raise to meet MDF.
 * Protocol: one JSON line from stdin, one JSON line to stdout.
 * Compile: g++ -std=c++17 -O2 -o mdf_bot mdf_bot.cpp
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

/* Hand rank 0-100: bottom of range = 0, top = 100. Used to compare vs MDF. */
static int handRank(const std::vector<int>& hole, const std::vector<int>& board) {
  if (hole.size() != 2) return 20;
  int a = hole[0], b = hole[1];
  if (a < b) std::swap(a, b);
  int rank = 0;
  if (a == b) {
    rank = 40 + a * 3;
  } else {
    rank = 15 + a + b / 2;
    if (a - b <= 2) rank += 10;
  }
  if (!board.empty()) {
    int pairCount = 0;
    for (int h : hole)
      for (int b : board) if (h == b) pairCount++;
    if (pairCount >= 1) rank += 25;
    if (pairCount >= 2) rank += 20;
  }
  return std::min(100, std::max(0, rank));
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

  int hr = handRank(myRanks, boardRanks);

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
  double mdf = 1.0 - potOdds;
  if (mdf < 0) mdf = 0;
  if (mdf > 1) mdf = 1;
  int foldThreshold = static_cast<int>(100 * (1.0 - mdf));

  if (hr < foldThreshold) {
    std::cout << "{\"action\":\"fold\"}" << std::endl;
    return 0;
  }
  if (hr >= 70 && myChips > toCall + minRaise) {
    std::cout << "{\"action\":\"raise\",\"amount\":" << minRaise << "}" << std::endl;
    return 0;
  }
  std::cout << "{\"action\":\"call\"}" << std::endl;
  return 0;
}

/*
 * Sample bot: Calling Station
 * Always checks when possible, otherwise calls. No raises, no folds.
 * Protocol: read one JSON line from stdin, write one JSON line to stdout.
 * Compile: g++ -std=c++17 -O2 -o calling_station calling_station.cpp
 */
#include <iostream>
#include <string>
#include <sstream>

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

  long long toCall = findNum("toCall");

  if (toCall == 0) {
    std::cout << "{\"action\":\"check\"}" << std::endl;
  } else {
    std::cout << "{\"action\":\"call\"}" << std::endl;
  }
  return 0;
}

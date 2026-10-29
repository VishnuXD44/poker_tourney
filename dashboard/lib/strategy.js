/**
 * Visual strategy model: node types, a JS evaluator for testing hands in the builder,
 * and a code generator that turns a node graph into a single-file C++ bot.
 *
 * Graph shape: { nodes: [{ id, type, x, y, p: { param: value } }], edges: [{ from, port, to }] }
 * Ports: "out" (start), "yes" / "no" (questions). Actions have no outputs.
 * The JS `analyze` and the C++ `analyze` in CPP_PRELUDE must stay in step.
 */

/** localStorage key for the strategy open in the builder. */
export const BUILDER_STORAGE_KEY = "poker_tourney.strategy";

export const NODE_W = 216;
export const NODE_H = { start: 40, cond: 92, action: 68 };

const MADE = [
  ["1", "any pair"],
  ["2", "top pair"],
  ["3", "two pair"],
  ["4", "three of a kind"],
  ["5", "a straight"],
  ["6", "a flush"],
  ["7", "a full house"],
];

export const NODE_TYPES = {
  start: { kind: "start", title: "start", help: "every decision begins here" },

  street: {
    kind: "cond",
    title: "street",
    help: "which betting round it is",
    before: "is it the",
    param: { key: "stage", options: [["pre-flop", "pre-flop"], ["postflop", "flop or later"], ["flop", "flop"], ["turn", "turn"], ["river", "river"]] },
    after: "?",
    js: (s, v) => (v === "pre-flop" ? s.street === 0 : v === "postflop" ? s.street > 0 : s.street === { flop: 1, turn: 2, river: 3 }[v]),
    cpp: (v) => (v === "pre-flop" ? "s.street == 0" : v === "postflop" ? "s.street > 0" : `s.street == ${{ flop: 1, turn: 2, river: 3 }[v]}`),
  },
  preflop: {
    kind: "cond",
    title: "starting hand",
    help: "how good your two hole cards are",
    before: "are my hole cards",
    param: { key: "tier", options: [["3", "premium"], ["2", "strong or better"], ["1", "playable or better"]] },
    after: "?",
    js: (s, v) => s.tier >= Number(v),
    cpp: (v) => `s.tier >= ${Number(v)}`,
  },
  made: {
    kind: "cond",
    title: "made hand",
    help: "what you've hit with the board",
    before: "do I have",
    param: { key: "min", options: MADE },
    after: "or better?",
    js: (s, v) => s.score >= Number(v),
    cpp: (v) => `s.score >= ${Number(v)}`,
  },
  draw: {
    kind: "cond",
    title: "draw",
    help: "one card away from a straight or flush",
    before: "am I drawing to a straight or flush?",
    js: (s) => s.draw,
    cpp: () => "s.draw",
  },
  facing: {
    kind: "cond",
    title: "facing a bet",
    help: "someone has bet and you must pay to stay in",
    before: "do I have to pay to stay in?",
    js: (s) => s.toCall > 0,
    cpp: () => "s.toCall > 0",
  },
  price: {
    kind: "cond",
    title: "cheap call",
    help: "compares the call to the size of the pot",
    before: "does calling cost at most",
    param: { key: "pct", options: [["10", "10%"], ["25", "25%"], ["33", "33%"], ["50", "50%"], ["75", "75%"], ["100", "100%"]] },
    after: "of the pot?",
    js: (s, v) => s.toCall * 100 <= Number(v) * s.pot,
    cpp: (v) => `s.toCall * 100 <= ${Number(v)}LL * s.pot`,
  },
  odds: {
    kind: "cond",
    title: "pot odds",
    help: "is my rough chance of winning worth the price",
    before: "is my chance of winning worth the price?",
    js: (s) => s.equity * (s.pot + s.toCall) >= s.toCall,
    cpp: () => "s.equity * (s.pot + s.toCall) >= s.toCall",
  },
  players: {
    kind: "cond",
    title: "opponents",
    help: "how many players are still in the hand",
    before: "are there at most",
    param: { key: "n", options: [["1", "1 opponent"], ["2", "2 opponents"], ["3", "3 opponents"], ["4", "4 opponents"]] },
    after: "left?",
    js: (s, v) => s.opps <= Number(v),
    cpp: (v) => `s.opps <= ${Number(v)}`,
  },
  stack: {
    kind: "cond",
    title: "short stack",
    help: "your chips compared to the pot",
    before: "is my stack at most",
    param: { key: "x", options: [["1", "1×"], ["2", "2×"], ["3", "3×"], ["5", "5×"]] },
    after: "the pot?",
    js: (s, v) => s.myChips <= Number(v) * s.pot,
    cpp: (v) => `s.myChips <= ${Number(v)}LL * s.pot`,
  },
  chance: {
    kind: "cond",
    title: "coin flip",
    help: "random yes, for bluffs and mixing it up",
    before: "say yes",
    param: { key: "pct", options: [["10", "10%"], ["25", "25%"], ["33", "33%"], ["50", "50%"], ["75", "75%"]] },
    after: "of the time",
    js: (s, v, rng) => rng() < Number(v) / 100,
    cpp: (v) => `rnd01() < ${(Number(v) / 100).toFixed(2)}`,
  },

  checkfold: {
    kind: "action",
    title: "check / fold",
    help: "check if it's free, otherwise fold",
    before: "check if free, else fold",
    js: (s) => (s.toCall === 0 ? { action: "check" } : { action: "fold" }),
    cpp: () => "doCheckFold(s)",
  },
  call: {
    kind: "action",
    title: "check / call",
    help: "stay in: call any bet",
    before: "call whatever it costs",
    js: (s) => (s.toCall === 0 ? { action: "check" } : { action: "call" }),
    cpp: () => "doCall(s)",
  },
  raise: {
    kind: "action",
    title: "raise",
    help: "put in more; becomes all-in if short",
    before: "raise by",
    param: { key: "size", options: [["min", "the minimum"], ["half", "½ the pot"], ["pot", "the pot"], ["2pot", "2× the pot"]] },
    after: "",
    js: (s, v) => raiseAction(s, v),
    cpp: (v) => `doRaise(s, ${["min", "half", "pot", "2pot"].indexOf(v)})`,
  },
  allin: {
    kind: "action",
    title: "all-in",
    help: "shove every chip",
    before: "push all my chips in",
    js: () => ({ action: "all-in" }),
    cpp: () => "Act{\"all-in\", 0}",
  },
};

export const PALETTE = [
  { group: "ask a question", types: ["street", "preflop", "made", "draw", "facing", "price", "odds", "players", "stack", "chance"] },
  { group: "make a move", types: ["checkfold", "call", "raise", "allin"] },
];

export const TIER_NAMES = ["weak", "playable", "strong", "premium"];
export const SCORE_NAMES = ["nothing", "weak pair", "top pair", "two pair", "three of a kind", "straight", "flush", "full house", "quads+"];
export const TIER_HELP = "premium: JJ+, AK · strong: 77+, AT+, KJ+ · playable: any pair, any ace, two broadway cards, suited connectors";

/** Returns the param value if it is one of the allowed options, else the first option. */
export function paramValue(node) {
  const param = NODE_TYPES[node.type]?.param;
  if (!param) return undefined;
  const v = node.p?.[param.key];
  return param.options.some(([o]) => o === v) ? v : param.options[0][0];
}

export function defaultParams(type) {
  const param = NODE_TYPES[type]?.param;
  return param ? { [param.key]: param.options[0][0] } : {};
}

export function nodeHeight(type) {
  return NODE_H[NODE_TYPES[type]?.kind] ?? NODE_H.action;
}

export function outPorts(type) {
  const kind = NODE_TYPES[type]?.kind;
  return kind === "start" ? ["out"] : kind === "cond" ? ["yes", "no"] : [];
}

export function portPos(node, port) {
  const h = nodeHeight(node.type);
  if (port === "in") return { x: node.x + NODE_W / 2, y: node.y };
  if (port === "yes") return { x: node.x + NODE_W * 0.25, y: node.y + h };
  if (port === "no") return { x: node.x + NODE_W * 0.75, y: node.y + h };
  return { x: node.x + NODE_W / 2, y: node.y + h };
}

/* ---------- hand analysis (mirrors CPP_PRELUDE) ---------- */

const RANK = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, T: 10, J: 11, Q: 12, K: 13, A: 14 };

export function parseCard(str) {
  if (typeof str !== "string" || str.length < 2) return null;
  const r = RANK[str.slice(0, -1).toUpperCase()];
  const s = str.slice(-1).toLowerCase();
  return r && "hdcs".includes(s) ? { r, s } : null;
}

function category(cards) {
  const cnt = Array(15).fill(0);
  const bySuit = { h: [], d: [], c: [], s: [] };
  for (const c of cards) {
    cnt[c.r]++;
    bySuit[c.s].push(c.r);
  }
  const hasStraight = (ranks) => {
    const has = Array(15).fill(false);
    for (const r of ranks) has[r] = true;
    for (let hi = 14; hi >= 5; hi--) {
      let ok = true;
      for (let k = 0; k < 5 && ok; k++) ok = has[hi - k === 1 ? 14 : hi - k];
      if (ok) return true;
    }
    return false;
  };
  const flushSuit = Object.values(bySuit).find((rs) => rs.length >= 5);
  if (flushSuit && hasStraight(flushSuit)) return { cat: 8, pair: 0 };
  let quads = 0, trips = 0, pairs = 0, bestPair = 0;
  for (let r = 14; r >= 2; r--) {
    if (cnt[r] === 4) quads++;
    else if (cnt[r] === 3) trips++;
    else if (cnt[r] === 2) {
      pairs++;
      if (!bestPair) bestPair = r;
    }
  }
  if (quads) return { cat: 7, pair: 0 };
  if (trips && (pairs || trips > 1)) return { cat: 6, pair: 0 };
  if (flushSuit) return { cat: 5, pair: 0 };
  if (hasStraight(cards.map((c) => c.r))) return { cat: 4, pair: 0 };
  if (trips) return { cat: 3, pair: 0 };
  if (pairs >= 2) return { cat: 2, pair: 0 };
  if (pairs === 1) return { cat: 1, pair: bestPair };
  return { cat: 0, pair: 0 };
}

function preflopTier(hole) {
  if (hole.length !== 2) return 0;
  const a = Math.max(hole[0].r, hole[1].r);
  const b = Math.min(hole[0].r, hole[1].r);
  const suited = hole[0].s === hole[1].s;
  if ((a === b && a >= 11) || (a === 14 && b === 13)) return 3;
  if ((a === b && a >= 7) || (a === 14 && b >= 10) || (a === 13 && b >= 11)) return 2;
  if (a === b || a === 14 || b >= 10 || (suited && a - b <= 2 && b >= 5)) return 1;
  return 0;
}

function hasDraw(hole, board, score) {
  if (board.length < 3 || board.length > 4 || score >= 5) return false;
  const all = [...hole, ...board];
  for (const suit of "hdcs") {
    if (all.filter((c) => c.s === suit).length === 4 && hole.some((c) => c.s === suit)) return true;
  }
  const has = (cards, r) => cards.some((c) => c.r === r || (r === 1 && c.r === 14));
  for (let lo = 1; lo <= 10; lo++) {
    let n = 0, mine = false;
    for (let r = lo; r < lo + 5; r++) {
      if (has(all, r)) n++;
      if (has(hole, r)) mine = true;
    }
    if (n === 4 && mine) return true;
  }
  return false;
}

const PRE_EQUITY = [0.32, 0.45, 0.55, 0.7];
const POST_EQUITY = [0.3, 0.45, 0.6, 0.7, 0.78, 0.84, 0.88, 0.93, 0.97];

export function analyze(state) {
  const hole = (state.myCards || []).map(parseCard).filter(Boolean);
  const board = (state.communityCards || []).map(parseCard).filter(Boolean);
  const street = board.length >= 5 ? 3 : board.length === 4 ? 2 : board.length >= 3 ? 1 : 0;
  const all = category([...hole, ...board]);
  const onBoard = board.length ? category(board) : { cat: 0 };
  const eff = all.cat > onBoard.cat ? all.cat : 0;
  const maxBoard = board.reduce((m, c) => Math.max(m, c.r), 0);
  const score = eff === 0 ? 0 : eff === 1 ? (all.pair >= maxBoard ? 2 : 1) : Math.min(8, eff + 1);
  const tier = preflopTier(hole);
  const draw = hasDraw(hole, board, score);
  const equity = street === 0 ? PRE_EQUITY[tier] : Math.min(0.97, POST_EQUITY[score] + (draw ? 0.15 : 0));
  return {
    street,
    pot: Number(state.pot) || 0,
    toCall: Number(state.toCall) || 0,
    minRaise: Math.max(1, Number(state.minRaise) || 0),
    myChips: Number(state.myChips) || 0,
    opps: (state.opponents || []).length,
    tier,
    score,
    draw,
    equity,
  };
}

function raiseAction(s, size) {
  const base = { min: s.minRaise, half: Math.floor(s.pot / 2), pot: s.pot, "2pot": 2 * s.pot }[size] ?? s.minRaise;
  const amount = Math.max(s.minRaise, base);
  if (s.toCall + amount >= s.myChips) return { action: "all-in" };
  return { action: "raise", amount };
}

/* ---------- graph helpers ---------- */

export const edgeKey = (e) => `${e.from}:${e.port}`;

export function reachable(graph, fromId) {
  const seen = new Set();
  const stack = [fromId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of graph.edges) if (e.from === id) stack.push(e.to);
  }
  return seen;
}

/** Adds an edge (replacing whatever that port pointed to). Returns null if it would be invalid. */
export function connect(graph, from, port, to) {
  const target = graph.nodes.find((n) => n.id === to);
  if (!target || from === to || NODE_TYPES[target.type].kind === "start") return null;
  if (reachable(graph, to).has(from)) return null; // would loop back on itself
  const edges = graph.edges.filter((e) => !(e.from === from && e.port === port));
  return { ...graph, edges: [...edges, { from, port, to }] };
}

/** Walks the graph for one game state. Open branches fall back to check / fold. */
export function decide(graph, state, rng = Math.random) {
  const s = analyze(state);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const path = [];
  const edges = [];
  const answers = []; // { id, port } for each question asked
  let node = graph.nodes.find((n) => n.type === "start");
  for (let i = 0; node && i < 64; i++) {
    path.push(node.id);
    const t = NODE_TYPES[node.type];
    if (t.kind === "action") return { ...t.js(s, paramValue(node)), path, edges, answers, s, fallback: false };
    const port = t.kind === "start" ? "out" : t.js(s, paramValue(node), rng) ? "yes" : "no";
    if (t.kind === "cond") answers.push({ id: node.id, port });
    const edge = graph.edges.find((e) => e.from === node.id && e.port === port);
    if (!edge) break;
    edges.push(edgeKey(edge));
    node = byId.get(edge.to);
  }
  return { ...NODE_TYPES.checkfold.js(s), path, edges, answers, s, fallback: true };
}

/** Problems worth showing before export. */
export function lint(graph) {
  const start = graph.nodes.find((n) => n.type === "start");
  if (!start) return ["no start block"];
  const live = reachable(graph, start.id);
  const notes = [];
  let open = 0;
  for (const n of graph.nodes) {
    if (!live.has(n.id)) continue;
    for (const port of outPorts(n.type)) {
      if (!graph.edges.some((e) => e.from === n.id && e.port === port)) open++;
    }
  }
  if (open) notes.push(`${open} open branch${open > 1 ? "es" : ""} → check / fold`);
  const unused = graph.nodes.length - live.size;
  if (unused) notes.push(`${unused} block${unused > 1 ? "s" : ""} not connected to start (ignored)`);
  return notes;
}

/* ---------- C++ generation ---------- */

const CPP_PRELUDE = String.raw`#include <iostream>
#include <string>
#include <vector>
#include <algorithm>
#include <chrono>
#include <random>
#include <cctype>

struct Card { int r; char s; };
struct State {
  int street = 0;
  long long pot = 0, toCall = 0, minRaise = 1, myChips = 0;
  int opps = 0, tier = 0, score = 0;
  bool draw = false;
  double equity = 0.3;
};
struct Act { const char* action; long long amount; };

static long long findNum(const std::string& j, const std::string& key) {
  size_t p = j.find("\"" + key + "\":");
  if (p == std::string::npos) return 0;
  p += key.size() + 3;
  while (p < j.size() && j[p] == ' ') ++p;
  bool neg = p < j.size() && j[p] == '-';
  if (neg) ++p;
  long long v = 0;
  while (p < j.size() && std::isdigit(static_cast<unsigned char>(j[p]))) v = v * 10 + (j[p++] - '0');
  return neg ? -v : v;
}

static int rankOf(const std::string& r) {
  if (r == "10" || r == "T" || r == "t") return 10;
  if (r.size() != 1) return 0;
  char c = static_cast<char>(std::toupper(static_cast<unsigned char>(r[0])));
  if (c >= '2' && c <= '9') return c - '0';
  if (c == 'J') return 11;
  if (c == 'Q') return 12;
  if (c == 'K') return 13;
  if (c == 'A') return 14;
  return 0;
}

static std::vector<Card> findCards(const std::string& j, const std::string& key) {
  std::vector<Card> out;
  size_t p = j.find("\"" + key + "\":[");
  if (p == std::string::npos) return out;
  size_t end = j.find(']', p);
  p += key.size() + 4;
  while (p < end) {
    size_t a = j.find('"', p);
    if (a == std::string::npos || a > end) break;
    size_t b = j.find('"', a + 1);
    if (b == std::string::npos || b > end) break;
    std::string c = j.substr(a + 1, b - a - 1);
    if (c.size() >= 2) {
      int r = rankOf(c.substr(0, c.size() - 1));
      char s = static_cast<char>(std::tolower(static_cast<unsigned char>(c.back())));
      if (r) out.push_back(Card{r, s});
    }
    p = b + 1;
  }
  return out;
}

static int suitIdx(char s) { return s == 'h' ? 0 : s == 'd' ? 1 : s == 'c' ? 2 : 3; }

static bool hasStraight(const bool* has) {
  for (int hi = 14; hi >= 5; hi--) {
    bool ok = true;
    for (int k = 0; k < 5 && ok; k++) ok = has[hi - k == 1 ? 14 : hi - k];
    if (ok) return true;
  }
  return false;
}

// 0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush, 6 full house, 7 quads, 8 straight flush
static int category(const std::vector<Card>& cs, int& pairRank) {
  int cnt[15] = {0}, suits[4] = {0};
  bool has[15] = {false};
  for (const Card& c : cs) { cnt[c.r]++; suits[suitIdx(c.s)]++; has[c.r] = true; }
  int flush = -1;
  for (int s = 0; s < 4; s++) if (suits[s] >= 5) flush = s;
  if (flush >= 0) {
    bool hs[15] = {false};
    for (const Card& c : cs) if (suitIdx(c.s) == flush) hs[c.r] = true;
    if (hasStraight(hs)) return 8;
  }
  int quads = 0, trips = 0, pairs = 0, best = 0;
  for (int r = 14; r >= 2; r--) {
    if (cnt[r] == 4) quads++;
    else if (cnt[r] == 3) trips++;
    else if (cnt[r] == 2) { pairs++; if (!best) best = r; }
  }
  if (quads) return 7;
  if (trips && (pairs || trips > 1)) return 6;
  if (flush >= 0) return 5;
  if (hasStraight(has)) return 4;
  if (trips) return 3;
  if (pairs >= 2) return 2;
  if (pairs == 1) { pairRank = best; return 1; }
  return 0;
}

static int preflopTier(const std::vector<Card>& h) {
  if (h.size() != 2) return 0;
  int a = std::max(h[0].r, h[1].r), b = std::min(h[0].r, h[1].r);
  bool suited = h[0].s == h[1].s;
  if ((a == b && a >= 11) || (a == 14 && b == 13)) return 3;
  if ((a == b && a >= 7) || (a == 14 && b >= 10) || (a == 13 && b >= 11)) return 2;
  if (a == b || a == 14 || b >= 10 || (suited && a - b <= 2 && b >= 5)) return 1;
  return 0;
}

static bool hasRank(const std::vector<Card>& cs, int r) {
  for (const Card& c : cs) if (c.r == r || (r == 1 && c.r == 14)) return true;
  return false;
}

static bool hasDraw(const std::vector<Card>& hole, const std::vector<Card>& board, int score) {
  if (board.size() < 3 || board.size() > 4 || score >= 5) return false;
  std::vector<Card> all(hole);
  all.insert(all.end(), board.begin(), board.end());
  for (char s : std::string("hdcs")) {
    int n = 0;
    bool mine = false;
    for (const Card& c : all) if (c.s == s) n++;
    for (const Card& c : hole) if (c.s == s) mine = true;
    if (n == 4 && mine) return true;
  }
  for (int lo = 1; lo <= 10; lo++) {
    int n = 0;
    bool mine = false;
    for (int r = lo; r < lo + 5; r++) {
      if (hasRank(all, r)) n++;
      if (hasRank(hole, r)) mine = true;
    }
    if (n == 4 && mine) return true;
  }
  return false;
}

static State analyze(const std::string& j) {
  static const double PRE[4] = {0.32, 0.45, 0.55, 0.7};
  static const double POST[9] = {0.3, 0.45, 0.6, 0.7, 0.78, 0.84, 0.88, 0.93, 0.97};
  State s;
  std::vector<Card> hole = findCards(j, "myCards"), board = findCards(j, "communityCards");
  s.street = board.size() >= 5 ? 3 : board.size() == 4 ? 2 : board.size() >= 3 ? 1 : 0;
  s.pot = findNum(j, "pot");
  s.toCall = findNum(j, "toCall");
  s.minRaise = std::max(1LL, findNum(j, "minRaise"));
  s.myChips = findNum(j, "myChips");
  size_t p = j.find("\"opponents\":");
  while (p != std::string::npos && (p = j.find("\"name\":", p + 1)) != std::string::npos) s.opps++;

  std::vector<Card> all(hole);
  all.insert(all.end(), board.begin(), board.end());
  int pairRank = 0, unused = 0, maxBoard = 0;
  int cat = category(all, pairRank);
  int boardCat = board.empty() ? 0 : category(board, unused);
  int eff = cat > boardCat ? cat : 0;
  for (const Card& c : board) maxBoard = std::max(maxBoard, c.r);
  s.score = eff == 0 ? 0 : eff == 1 ? (pairRank >= maxBoard ? 2 : 1) : std::min(8, eff + 1);
  s.tier = preflopTier(hole);
  s.draw = hasDraw(hole, board, s.score);
  s.equity = s.street == 0 ? PRE[s.tier] : std::min(0.97, POST[s.score] + (s.draw ? 0.15 : 0.0));
  return s;
}

static double rnd01() {
  static std::mt19937_64 gen(static_cast<unsigned long long>(
      std::chrono::high_resolution_clock::now().time_since_epoch().count()));
  return std::uniform_real_distribution<double>(0.0, 1.0)(gen);
}

static Act doCheckFold(const State& s) { return s.toCall == 0 ? Act{"check", 0} : Act{"fold", 0}; }
static Act doCall(const State& s) { return s.toCall == 0 ? Act{"check", 0} : Act{"call", 0}; }

// size: 0 min raise, 1 half pot, 2 pot, 3 two pots
static Act doRaise(const State& s, int size) {
  long long base = size == 1 ? s.pot / 2 : size == 2 ? s.pot : size == 3 ? 2 * s.pot : s.minRaise;
  long long amount = std::max(s.minRaise, base);
  if (s.toCall + amount >= s.myChips) return Act{"all-in", 0};
  return Act{"raise", amount};
}
`;

function describe(node) {
  const t = NODE_TYPES[node.type];
  const v = paramValue(node);
  const label = t.param ? t.param.options.find(([o]) => o === v)[1] : "";
  return [t.before, label, t.after].filter(Boolean).join(" ").replace(" ?", "?");
}

/** Builds the C++ source. Only nodes reachable from start are emitted; params are whitelisted. */
export function generateCpp(graph, name = "strategy") {
  const start = graph.nodes.find((n) => n.type === "start");
  const order = start ? [...reachable(graph, start.id)] : [];
  const fn = new Map(order.map((id, i) => [id, i === 0 ? "start" : `step${i}`]));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const target = (id, port) => {
    const e = graph.edges.find((x) => x.from === id && x.port === port);
    return e && fn.has(e.to) ? `${fn.get(e.to)}(s)` : "doCheckFold(s)";
  };

  const bodies = order.map((id) => {
    const node = byId.get(id);
    const t = NODE_TYPES[node.type];
    const head = `static Act ${fn.get(id)}(const State& s) {`;
    if (t.kind === "start") return `${head}\n  return ${target(id, "out")};\n}`;
    if (t.kind === "action") return `${head}\n  // ${describe(node)}\n  return ${t.cpp(paramValue(node))};\n}`;
    return [
      head,
      `  // ${describe(node)}`,
      `  if (${t.cpp(paramValue(node))}) return ${target(id, "yes")};`,
      `  return ${target(id, "no")};`,
      "}",
    ].join("\n");
  });

  const safeName = String(name).replace(/[^\w .-]/g, "").slice(0, 60) || "strategy";
  return [
    `// ${safeName}: generated by the poker_tourney strategy builder.`,
    "// One JSON line in (table state), one JSON line out (action).",
    CPP_PRELUDE,
    "// ---- strategy ----",
    ...order.map((id) => `static Act ${fn.get(id)}(const State& s);`),
    "",
    bodies.join("\n\n"),
    "",
    `int main() {
  std::string line;
  if (!std::getline(std::cin, line)) {
    std::cout << "{\\"action\\":\\"fold\\"}" << std::endl;
    return 0;
  }
  State s = analyze(line);
  Act a = ${start ? "start(s)" : "doCheckFold(s)"};
  std::cout << "{\\"action\\":\\"" << a.action << "\\"";
  if (std::string(a.action) == "raise") std::cout << ",\\"amount\\":" << a.amount;
  std::cout << "}" << std::endl;
  return 0;
}
`,
  ].join("\n");
}

/* ---------- templates ---------- */

const n = (id, type, x, y, p = defaultParams(type)) => ({ id, type, x, y, p });
const e = (from, port, to) => ({ from, port, to });

export const TEMPLATES = {
  "solid player": {
    nodes: [
      n("n1", "start", 352, 40),
      n("n2", "street", 352, 140, { stage: "pre-flop" }),
      n("n3", "preflop", 80, 290, { tier: "3" }),
      n("n4", "raise", -40, 450, { size: "pot" }),
      n("n5", "preflop", 200, 450, { tier: "2" }),
      n("n6", "call", 120, 610),
      n("n7", "checkfold", 360, 610),
      n("n8", "made", 620, 290, { min: "2" }),
      n("n9", "raise", 520, 450, { size: "half" }),
      n("n10", "draw", 760, 450),
      n("n11", "odds", 680, 610),
      n("n12", "call", 620, 770),
      n("n13", "checkfold", 860, 770),
    ],
    edges: [
      e("n1", "out", "n2"),
      e("n2", "yes", "n3"),
      e("n2", "no", "n8"),
      e("n3", "yes", "n4"),
      e("n3", "no", "n5"),
      e("n5", "yes", "n6"),
      e("n5", "no", "n7"),
      e("n8", "yes", "n9"),
      e("n8", "no", "n10"),
      e("n10", "yes", "n11"),
      e("n10", "no", "n7"),
      e("n11", "yes", "n12"),
      e("n11", "no", "n13"),
    ],
  },
  "calling station": {
    nodes: [n("n1", "start", 200, 60), n("n2", "call", 200, 180)],
    edges: [e("n1", "out", "n2")],
  },
  maniac: {
    nodes: [
      n("n1", "start", 200, 60),
      n("n2", "chance", 200, 160, { pct: "50" }),
      n("n3", "raise", 60, 320, { size: "pot" }),
      n("n4", "call", 340, 320),
    ],
    edges: [e("n1", "out", "n2"), e("n2", "yes", "n3"), e("n2", "no", "n4")],
  },
  blank: { nodes: [n("n1", "start", 200, 60)], edges: [] },
};

/* ---------- randomiser ---------- */

const NAME_A = ["loose", "tight", "sneaky", "lucky", "wild", "silent", "greedy", "patient", "reckless", "stone"];
const NAME_B = ["shark", "donkey", "fox", "owl", "whale", "badger", "rook", "viper", "mule", "hawk"];

export function randomName(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return `${pick(NAME_A)}_${pick(NAME_B)}`;
}

/**
 * Builds a random but complete strategy: a tree of 3–7 questions, every branch ending in a move.
 * A question is never repeated on the same path, and the two answers of a question never end
 * in the same move, so every question can change the outcome.
 */
export function randomStrategy(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const randomParams = (type) => {
    const param = NODE_TYPES[type].param;
    return param ? { [param.key]: pick(param.options)[0] } : {};
  };
  const questions = PALETTE[0].types;
  const moves = PALETTE[1].types;
  const nodes = [];
  const edges = [];
  const children = new Map();
  const budget = 3 + Math.floor(rng() * 5);
  let asked = 0;

  const add = (type, p) => {
    const id = `n${nodes.length + 1}`;
    nodes.push({ id, type, x: 0, y: 0, p });
    children.set(id, []);
    return id;
  };
  const link = (from, port, to) => {
    edges.push({ from, port, to });
    children.get(from).push(to);
  };
  const sameMove = (a, b) => a.type === b.type && JSON.stringify(a.p) === JSON.stringify(b.p);

  const grow = (depth, seen) => {
    if (depth >= 4 || asked >= budget || (asked >= 3 && rng() < 0.3)) {
      const type = pick(moves);
      return add(type, randomParams(type));
    }
    const type = pick(questions.filter((t) => !seen.has(t)));
    asked++;
    const id = add(type, randomParams(type));
    const nextSeen = new Set(seen).add(type);
    const yes = grow(depth + 1, nextSeen);
    const no = grow(depth + 1, nextSeen);
    const [a, b] = [yes, no].map((x) => nodes.find((n) => n.id === x));
    if (NODE_TYPES[a.type].kind === "action" && NODE_TYPES[b.type].kind === "action" && sameMove(a, b)) {
      b.type = pick(moves.filter((t) => t !== a.type));
      b.p = randomParams(b.type);
    }
    link(id, "yes", yes);
    link(id, "no", no);
    return id;
  };

  const start = add("start", {});
  link(start, "out", grow(0, new Set()));

  // Tidy tree layout: leaves get consecutive columns, parents sit centred over their children.
  let column = 0;
  const place = (id, depth) => {
    const node = nodes.find((n) => n.id === id);
    const kids = children.get(id);
    kids.forEach((k) => place(k, depth + 1));
    const x = kids.length
      ? (nodes.find((n) => n.id === kids[0]).x + nodes.find((n) => n.id === kids[kids.length - 1]).x) / 2
      : column++ * (NODE_W + 24);
    node.x = Math.round(x);
    node.y = depth * 150;
  };
  place(start, 0);
  return { nodes, edges };
}

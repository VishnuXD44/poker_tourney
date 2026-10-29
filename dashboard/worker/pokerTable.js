/**
 * One multiplayer table (Durable Object, one instance per table code). Runs the same
 * engine as the arena (server/game) with people instead of bots: the engine's getAction
 * waits for the seated player's WebSocket to answer.
 *
 * The object is the only place the deck and everyone's hole cards exist. Each socket gets
 * its own view, with other players' cards hidden until showdown.
 *
 * Tables are private: whoever opens one sets a PIN, and a socket sees nothing until it
 * sends that PIN. The code in the link finds the table; the PIN, sent separately, gets you in.
 *
 * When the players are done, any of them can delete the table: its storage is wiped and
 * every socket is closed. The code then points at an empty table again.
 *
 * Sockets use accept() rather than the hibernation API on purpose: a hand in progress is an
 * engine call awaiting a player, which lives in memory. Chips and seats are saved after every
 * hand, so if the object restarts the table comes back paused at the last finished hand.
 */
import { createGame, addPlayer, playHand } from "../../server/game/pokerGame.js";

// The engine yields with setImmediate between actions; Workers only has it with nodejs_compat.
globalThis.setImmediate ??= (fn) => setTimeout(fn, 0);

const MAX_SEATS = 6;
const MAX_SOCKETS = 16;
const MAX_MESSAGE = 1024;
const NAME_MAX = 20;
const CHAT_MAX = 300;
const CHAT_KEEP = 50;
// Pause after a hand so everyone can see the result; skipped once every seat clicks "next".
const BETWEEN_HANDS_MS = 12000;
const PIN_RE = /^[A-Za-z0-9]{4,12}$/;
// Wrong PINs per table before it stops accepting any for a while.
const PIN_TRIES = 10;
const PIN_WINDOW_MS = 10 * 60 * 1000;

const encoder = new TextEncoder();
function pinMatches(given, pin) {
  const a = encoder.encode(String(given));
  const b = encoder.encode(pin);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

const clampInt = (value, min, max, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const DEFAULT_SETTINGS = { startingChips: 1000, smallBlind: 10, bigBlind: 20 };

export class PokerTable {
  constructor(ctx) {
    this.ctx = ctx;
    this.sockets = new Map(); // ws -> seat token, or null for someone watching
    this.authed = new Set(); // sockets that sent the right PIN
    this.pin = null; // set by the first socket to arrive at a new table
    this.pinFailures = [];
    this.seats = []; // { token, name, chips }; seats[0] is the host
    this.settings = { ...DEFAULT_SETTINGS };
    this.phase = "lobby"; // lobby | playing | over
    this.handNumber = 0;
    this.button = 0;
    this.chat = [];
    this.game = null; // engine state while a hand is being played
    this.pending = null; // { token, state, resolve } for the player the engine is waiting on
    this.lastHand = null; // { number, board, events } of the last finished hand
    this.between = null; // { until, ready: Set, advance } between hands
    this.stopRequested = false;
    this.rematchVotes = new Set(); // seat tokens that asked for a rematch after a game ended

    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("table");
      if (!saved) return;
      this.pin = saved.pin || null;
      this.seats = saved.seats || [];
      this.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
      this.handNumber = saved.handNumber || 0;
      this.button = saved.button || 0;
      this.chat = saved.chat || [];
      this.lastHand = saved.lastHand || null;
      // A game that was running when the object stopped resumes from the lobby.
      this.phase = saved.phase === "over" ? "over" : "lobby";
    });
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    if (this.sockets.size >= MAX_SOCKETS) return new Response("Table is full", { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sockets.set(server, null);
    server.addEventListener("message", (ev) => this.onMessage(server, ev.data));
    const drop = () => {
      this.sockets.delete(server);
      this.authed.delete(server);
      this.broadcast();
    };
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);
    this.send(server, { type: "locked", fresh: !this.pin });
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- messages ---------------------------------------------------------------------

  onMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!this.authed.has(ws)) {
      if (msg?.type === "auth") this.auth(ws, msg.pin);
      return;
    }
    const token = this.sockets.get(ws);
    const seatIndex = token ? this.seats.findIndex((s) => s.token === token) : -1;
    const isHost = seatIndex === 0;

    switch (msg?.type) {
      case "ping":
        return;
      case "join":
        return this.join(ws, msg);
      case "leave":
        if (seatIndex === -1 || this.phase === "playing") return;
        this.seats.splice(seatIndex, 1);
        this.sockets.set(ws, null);
        this.rematchVotes.delete(token);
        if (this.phase === "over" && this.maybeRematch()) return;
        return this.saveAndBroadcast();
      case "settings":
        if (!isHost || this.phase !== "lobby" || this.handNumber > 0) return;
        this.settings = this.cleanSettings(msg);
        for (const s of this.seats) s.chips = this.settings.startingChips;
        return this.saveAndBroadcast();
      case "start":
        if (!isHost || this.phase !== "lobby" || this.seats.filter((s) => s.chips > 0).length < 2) return;
        this.runGame();
        return;
      case "pause":
        // Stops after the current hand; the table returns to the lobby with chips kept.
        if (!isHost || this.phase !== "playing") return;
        this.stopRequested = true;
        this.between?.advance();
        return this.broadcast();
      case "reset":
        // Host, from the lobby: everyone back to the starting stack.
        if (!isHost || this.phase !== "lobby") return;
        this.resetChips();
        return this.saveAndBroadcast();
      case "rematch":
        // After a game: anyone seated can ask; it deals once every seat has asked.
        if (seatIndex === -1 || this.phase !== "over") return;
        if (msg.cancel) this.rematchVotes.delete(token);
        else this.rematchVotes.add(token);
        if (!this.maybeRematch()) this.broadcast();
        return;
      case "next":
        if (seatIndex === -1 || !this.between) return;
        this.between.ready.add(token);
        if (this.seats.every((s) => this.between.ready.has(s.token))) this.between.advance();
        else this.broadcast();
        return;
      case "action":
        return this.act(token, msg);
      case "delete":
        // Not mid-game: pause first, so nobody loses a hand in progress without warning.
        if (seatIndex === -1 || this.phase === "playing") return;
        this.destroy(this.seats[seatIndex].name);
        return;
      case "chat": {
        if (seatIndex === -1) return;
        const text = String(msg.text || "").trim().slice(0, CHAT_MAX);
        if (!text) return;
        this.chat.push({ name: this.seats[seatIndex].name, text, at: Date.now() });
        if (this.chat.length > CHAT_KEEP) this.chat.splice(0, this.chat.length - CHAT_KEEP);
        return this.saveAndBroadcast();
      }
    }
  }

  auth(ws, given) {
    const now = Date.now();
    this.pinFailures = this.pinFailures.filter((t) => now - t < PIN_WINDOW_MS);
    if (this.pinFailures.length >= PIN_TRIES) return this.send(ws, { type: "error", error: "too many wrong PINs, try again in a few minutes", code: "pin-locked" });
    if (!this.pin) {
      // A new table: the person opening it chooses the PIN.
      if (!PIN_RE.test(String(given))) return this.send(ws, { type: "error", error: "PIN must be 4–12 letters or digits", code: "bad-pin" });
      this.pin = String(given);
      this.save();
    } else if (!pinMatches(given, this.pin)) {
      this.pinFailures.push(now);
      return this.send(ws, { type: "error", error: "wrong PIN", code: "bad-pin" });
    }
    this.authed.add(ws);
    this.sendView(ws);
  }

  /** Erases everything stored for this table and disconnects everyone. */
  async destroy(by) {
    const authed = new Set(this.authed);
    const sockets = [...this.sockets.keys()];
    this.sockets.clear();
    this.authed.clear();
    this.seats = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.phase = "lobby";
    this.handNumber = 0;
    this.button = 0;
    this.chat = [];
    this.lastHand = null;
    this.pin = null;
    this.pinFailures = [];
    this.rematchVotes.clear();
    await this.ctx.storage.deleteAll();
    for (const ws of sockets) {
      if (authed.has(ws)) this.send(ws, { type: "deleted", by });
      try {
        ws.close(1000, "table deleted");
      } catch {}
    }
  }

  resetChips() {
    this.handNumber = 0;
    this.lastHand = null;
    for (const s of this.seats) s.chips = this.settings.startingChips;
  }

  /** Starts the rematch once every seat has voted for it. Returns true if it started. */
  maybeRematch() {
    if (this.seats.length < 2 || !this.seats.every((s) => this.rematchVotes.has(s.token))) return false;
    this.resetChips();
    this.runGame();
    return true;
  }

  join(ws, msg) {
    const token = typeof msg.token === "string" && /^[A-Za-z0-9-]{16,64}$/.test(msg.token) ? msg.token : null;
    if (!token) return this.send(ws, { type: "error", error: "bad token" });

    // Returning player: same browser, same seat.
    if (this.seats.some((s) => s.token === token)) {
      this.sockets.set(ws, token);
      return this.broadcast();
    }
    if (this.phase === "playing") return this.send(ws, { type: "error", error: "a game is in progress, wait for the next one" });
    if (this.seats.length >= MAX_SEATS) return this.send(ws, { type: "error", error: "the table is full" });

    const base = String(msg.name || "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || "player";
    // The engine's log identifies players by name, so names must be unique.
    let name = base;
    for (let n = 2; this.seats.some((s) => s.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} ${n}`;

    this.seats.push({ token, name, chips: this.settings.startingChips });
    this.sockets.set(ws, token);
    this.saveAndBroadcast();
  }

  cleanSettings(msg) {
    const startingChips = clampInt(msg.startingChips, 100, 1000000, DEFAULT_SETTINGS.startingChips);
    const smallBlind = clampInt(msg.smallBlind, 1, Math.floor(startingChips / 10), DEFAULT_SETTINGS.smallBlind);
    const bigBlind = clampInt(msg.bigBlind, smallBlind, Math.floor(startingChips / 5), smallBlind * 2);
    return { startingChips, smallBlind, bigBlind };
  }

  act(token, msg) {
    const pending = this.pending;
    if (!pending || pending.token !== token) return;
    const { state } = pending;
    let action;
    switch (msg.action) {
      case "fold":
        action = { action: "fold" };
        break;
      case "check":
        if (state.toCall > 0) return; // the engine would treat this as a fold
        action = { action: "check" };
        break;
      case "call":
        action = { action: "call" };
        break;
      case "all-in":
        action = { action: "all-in" };
        break;
      case "raise": {
        // The page sends the total to raise to; the engine takes the amount above the current bet.
        const to = parseInt(msg.to, 10);
        if (!Number.isFinite(to)) return;
        action = { action: "raise", amount: to - state.currentBet };
        break;
      }
      default:
        return;
    }
    this.pending = null;
    pending.resolve(action);
  }

  // ---- game loop --------------------------------------------------------------------

  async runGame() {
    this.phase = "playing";
    this.stopRequested = false;
    this.rematchVotes.clear();
    const { smallBlind, bigBlind, startingChips } = this.settings;
    const game = createGame(smallBlind, bigBlind, startingChips);
    for (const seat of this.seats) {
      addPlayer(game, seat.token, seat.name, (state) => this.ask(seat.token, state));
      game.players[game.players.length - 1].chips = seat.chips;
    }
    // Resuming: the engine moves the button on from here when handsPlayed > 0.
    game.handsPlayed = this.handNumber;
    game.dealerButton = Math.min(this.button, game.players.length - 1);
    this.game = game;

    try {
      while (game.players.filter((p) => p.chips > 0).length >= 2) {
        game.handLog = [];
        this.handNumber++;
        this.lastHand = null;
        this.broadcast();
        await playHand(game);

        game.players.forEach((p, i) => (this.seats[i].chips = p.chips));
        this.button = game.dealerButton;
        this.lastHand = {
          number: this.handNumber,
          board: game.communityCards.map((c) => c.str),
          events: game.handLog,
        };
        if (game.players.filter((p) => p.chips > 0).length < 2) break;
        await this.save();
        if (this.stopRequested) break;
        await this.waitBetweenHands();
        if (this.stopRequested) break;
      }
    } catch (err) {
      this.chat.push({ name: "table", text: `hand stopped: ${err.message}`, at: Date.now() });
    }

    this.game = null;
    this.pending = null;
    this.between = null;
    this.phase = this.seats.filter((s) => s.chips > 0).length < 2 ? "over" : "lobby";
    await this.saveAndBroadcast();
  }

  ask(token, state) {
    return new Promise((resolve) => {
      this.pending = { token, state, resolve };
      this.broadcast();
    });
  }

  waitBetweenHands() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => advance(), BETWEEN_HANDS_MS);
      const advance = () => {
        clearTimeout(timer);
        this.between = null;
        resolve();
      };
      this.between = { until: Date.now() + BETWEEN_HANDS_MS, ready: new Set(), advance };
      this.broadcast();
    });
  }

  // ---- views ------------------------------------------------------------------------

  viewFor(token) {
    const game = this.game;
    const handLive = game && !this.lastHand;
    const connected = new Set(this.sockets.values());
    const you = token ? this.seats.findIndex((s) => s.token === token) : -1;

    const seats = this.seats.map((seat, i) => {
      const p = handLive ? game.players[i] : null;
      return {
        name: seat.name,
        chips: p ? p.chips : seat.chips,
        bet: p ? p.currentBet : 0,
        folded: p ? p.folded : false,
        allIn: p ? p.allIn : false,
        out: p ? p.sittingOut : seat.chips <= 0,
        dealer: game ? game.dealerButton === i : false,
        connected: connected.has(seat.token),
        turn: this.pending?.token === seat.token,
        ready: this.between ? this.between.ready.has(seat.token) : false,
        rematch: this.rematchVotes.has(seat.token),
        // Only your own cards (kept between hands); everyone else's arrive in the showdown event.
        cards: game && i === you ? game.players[i].holeCards.map((c) => c.str) : null,
        inHand: p ? !p.sittingOut : false,
      };
    });

    let prompt = null;
    if (this.pending && this.pending.token === token) {
      const s = this.pending.state;
      const myBet = s.currentBet - s.toCall;
      prompt = {
        toCall: Math.min(s.toCall, s.myChips),
        currentBet: s.currentBet,
        minRaiseTo: s.currentBet + s.minRaise,
        maxRaiseTo: myBet + s.myChips,
        myChips: s.myChips,
      };
    }

    return {
      type: "state",
      you,
      phase: this.phase,
      settings: this.settings,
      handNumber: this.handNumber,
      seats,
      board: handLive ? game.communityCards.map((c) => c.str) : this.lastHand?.board || [],
      pot: handLive ? game.pot + game.players.reduce((sum, p) => sum + p.currentBet, 0) : 0,
      log: handLive ? game.handLog : this.lastHand?.events || [],
      lastHand: this.lastHand,
      between: this.between ? { until: this.between.until } : null,
      stopping: this.stopRequested && this.phase === "playing",
      prompt,
      chat: this.chat,
    };
  }

  send(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      this.sockets.delete(ws);
      this.authed.delete(ws);
    }
  }

  sendView(ws) {
    this.send(ws, this.viewFor(this.sockets.get(ws)));
  }

  broadcast() {
    for (const ws of [...this.authed]) this.sendView(ws);
  }

  async save() {
    await this.ctx.storage.put("table", {
      pin: this.pin,
      seats: this.seats,
      settings: this.settings,
      handNumber: this.handNumber,
      button: this.button,
      chat: this.chat,
      lastHand: this.lastHand,
      phase: this.phase,
    });
  }

  async saveAndBroadcast() {
    this.broadcast();
    await this.save();
  }
}

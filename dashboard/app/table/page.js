"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Panel from "@/components/Panel";
import PlayingCard from "@/components/PlayingCard";
import ChipStack from "@/components/Chips";
import HandGuide from "@/components/HandGuide";
import { describeEvent, WinReason } from "@/components/LiveTable";
import { bestHand, describeHand } from "@/lib/hands";
import { isMuted, play, setMuted, unlockAudio } from "@/lib/sounds";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const CODE_RE = /^[a-z0-9]{6,16}$/;
const NAME_KEY = "poker-table-name";
const PIN_RE = /^[A-Za-z0-9]{4,12}$/;
const tokenKey = (code) => `poker-table-token:${code}`;
const pinKey = (code) => `poker-table-pin:${code}`;

function storage(fn, fallback = null) {
  try {
    return fn(window.localStorage);
  } catch {
    return fallback;
  }
}

function newCode() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * The table's socket: reconnects with backoff, unlocks with the saved PIN and re-claims the
 * seat with the saved token. `locked` is set while the table is waiting for a PIN.
 */
function useTable(code) {
  const [view, setView] = useState(null);
  const [locked, setLocked] = useState(null);
  const [deleted, setDeleted] = useState(null); // { by } once someone deletes the table
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const wsRef = useRef(null);

  useEffect(() => {
    if (!code) return;
    let closed = false;
    let retry = 0;
    let timer;
    let ping;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}${BASE}/api/table/${code}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        setStatus("online");
        ping = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 25000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "deleted") {
          // Nothing of this table survives, so this browser forgets its PIN and seat too.
          closed = true;
          storage((s) => s.removeItem(pinKey(code)));
          storage((s) => s.removeItem(tokenKey(code)));
          setDeleted({ by: msg.by });
        } else if (msg.type === "locked") {
          const pin = storage((s) => s.getItem(pinKey(code)));
          if (pin) unlockWith(ws, pin);
          else setLocked({ fresh: msg.fresh });
        } else if (msg.type === "state") {
          setView(msg);
          setLocked(null);
          setError("");
        } else if (msg.type === "error") {
          setError(msg.error);
          if (msg.code === "bad-pin") {
            storage((s) => s.removeItem(pinKey(code)));
            setLocked((prev) => prev || { fresh: false });
          }
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (closed) return;
        setStatus("reconnecting");
        timer = setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [code]);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  }, []);

  const unlock = useCallback(
    (pin) => {
      storage((s) => s.setItem(pinKey(code), pin));
      if (wsRef.current?.readyState === 1) unlockWith(wsRef.current, pin);
    },
    [code]
  );

  /** The PIN, then the seat token if this browser has one; the table handles them in order. */
  function unlockWith(ws, pin) {
    ws.send(JSON.stringify({ type: "auth", pin }));
    const token = storage((s) => s.getItem(tokenKey(code)));
    if (token) ws.send(JSON.stringify({ type: "join", token, name: storage((s) => s.getItem(NAME_KEY)) || "" }));
  }

  return { view, locked, deleted, status, error, send, unlock };
}

// ---- lobby / landing -------------------------------------------------------------------

function NameField({ value, onChange }) {
  return (
    <label className="block">
      <span className="label">your name</span>
      <input className="field" maxLength={20} value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. vishnu" />
    </label>
  );
}

function PinField({ value, onChange, autoFocus }) {
  return (
    <label className="block">
      <span className="label">pin</span>
      <input
        className="field tracking-[0.3em]"
        maxLength={12}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
        placeholder="4–12 letters or digits"
      />
    </label>
  );
}

function Landing() {
  const [joinCode, setJoinCode] = useState("");
  const [pin, setPin] = useState("");
  const open = (code) => {
    location.search = `?room=${code}`;
  };
  const create = (e) => {
    e.preventDefault();
    if (!PIN_RE.test(pin)) return;
    const code = newCode();
    storage((s) => s.setItem(pinKey(code), pin));
    open(code);
  };
  const cleaned = joinCode.trim().toLowerCase();
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Panel index="01" title="open a table">
        <p className="text-xs text-muted mb-5 leading-relaxed">
          Starts a private table with its own link and a PIN you choose. Send the link and the PIN to whoever you want to
          play with, ideally in different messages. Up to six seats.
        </p>
        <form onSubmit={create} className="space-y-4">
          <PinField value={pin} onChange={setPin} />
          <button className="btn" disabled={!PIN_RE.test(pin)}>
            open a new table
          </button>
        </form>
      </Panel>
      <Panel index="02" title="join with a code">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (CODE_RE.test(cleaned)) open(cleaned);
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="label">table code</span>
            <input className="field" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="8 letters and digits" />
          </label>
          <button className="btn" disabled={!CODE_RE.test(cleaned)}>
            join
          </button>
        </form>
      </Panel>
    </div>
  );
}

function Unlock({ code, locked, error, unlock }) {
  const [pin, setPin] = useState("");
  return (
    <div className="max-w-md">
      <Panel index="01" title="private table" aside={`table ${code}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (PIN_RE.test(pin)) unlock(pin);
          }}
          className="space-y-4"
        >
          <p className="text-xs text-muted leading-relaxed">
            {locked.fresh
              ? "No one has opened this table yet. Choose a PIN; anyone joining will need it."
              : "Enter the PIN you were given for this table."}
          </p>
          <PinField value={pin} onChange={setPin} autoFocus />
          <button className="btn" disabled={!PIN_RE.test(pin)}>
            {locked.fresh ? "open table" : "unlock"}
          </button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </form>
      </Panel>
    </div>
  );
}

function ShareLink({ code }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${location.origin}${BASE}/table?room=${code}`;
  const pin = storage((s) => s.getItem(pinKey(code)));
  return (
    <div>
      {pin && (
        <p className="text-xs text-muted mb-4">
          pin <span className="text-ink tracking-[0.3em] ml-2">{pin}</span>
          <span className="block mt-1">send it separately from the link</span>
        </p>
      )}
      <span className="label">invite link</span>
      <div className="flex gap-2 mt-1.5">
        <input className="field !mt-0 text-xs" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button
          className="btn !w-auto px-3 text-xs"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </div>
  );
}

function JoinForm({ code, view, send, error }) {
  const [name, setName] = useState(() => storage((s) => s.getItem(NAME_KEY), "") || "");
  const join = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    let token = storage((s) => s.getItem(tokenKey(code)));
    if (!token) {
      token = crypto.randomUUID();
      storage((s) => s.setItem(tokenKey(code), token));
    }
    storage((s) => s.setItem(NAME_KEY, trimmed));
    send({ type: "join", token, name: trimmed });
  };
  const closed = view.phase === "playing" || view.seats.length >= 6;
  return (
    <form onSubmit={join} className="space-y-4">
      <NameField value={name} onChange={setName} />
      <button className="btn" disabled={closed || !name.trim()}>
        take a seat
      </button>
      {closed && <p className="text-xs text-muted">{view.phase === "playing" ? "a game is running, you're watching" : "the table is full"}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

function Settings({ view, send, editable }) {
  const [form, setForm] = useState(view.settings);
  useEffect(() => setForm(view.settings), [view.settings]);
  const field = (key, label) => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="field tabular-nums"
        type="number"
        inputMode="numeric"
        disabled={!editable}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        onBlur={() => send({ type: "settings", ...form })}
      />
    </label>
  );
  return (
    <div className="grid grid-cols-3 gap-3">
      {field("startingChips", "stack")}
      {field("smallBlind", "small blind")}
      {field("bigBlind", "big blind")}
    </div>
  );
}

function SeatList({ view }) {
  return (
    <ul className="space-y-2">
      {view.seats.map((s, i) => (
        <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <span aria-hidden className={s.connected ? "text-ink" : "text-muted"}>
              {s.connected ? "●" : "○"}
            </span>
            <span className="truncate">
              {s.name}
              {i === view.you && <span className="text-muted"> (you)</span>}
              {i === 0 && <span className="text-muted"> · host</span>}
            </span>
          </span>
          <span className="tabular-nums text-muted">{s.chips.toLocaleString()}</span>
        </li>
      ))}
      {view.seats.length === 0 && <li className="text-xs text-muted">no one seated yet</li>}
    </ul>
  );
}

function Lobby({ code, view, send, error }) {
  const seated = view.you !== -1;
  const isHost = view.you === 0;
  const ready = view.seats.filter((s) => s.chips > 0).length >= 2;
  const resuming = view.handNumber > 0;

  return (
    <Panel index="01" title="lobby" aside={`table ${code}`}>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <ShareLink code={code} />
          <div>
            <p className="label mb-3">seats</p>
            <SeatList view={view} />
          </div>
        </div>
        <div className="space-y-6">
          {!seated && <JoinForm code={code} view={view} send={send} error={error} />}
          {seated && (
            <>
              <Settings view={view} send={send} editable={isHost && !resuming} />
              {isHost ? (
                <button className="btn" disabled={!ready} onClick={() => send({ type: "start" })}>
                  {ready ? (resuming ? `resume from hand ${view.handNumber}` : "deal") : "waiting for a second player"}
                </button>
              ) : (
                <p className="text-xs text-muted">waiting for {view.seats[0]?.name} to deal</p>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {isHost && resuming && (
                  <button className="text-xs text-muted hover:text-ink underline underline-offset-4" onClick={() => send({ type: "reset" })}>
                    reset everyone to {view.settings.startingChips.toLocaleString()} chips
                  </button>
                )}
                <button className="text-xs text-muted hover:text-ink underline underline-offset-4" onClick={() => send({ type: "leave" })}>
                  leave seat
                </button>
              </div>
              <DeleteTable send={send} />
            </>
          )}
          <p className="text-[11px] text-muted leading-relaxed">
            No hand limit: play until one player has every chip, or pause and pick it up later. Chips are saved after every hand.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/** Two-step "delete this table forever", for when the players are done with it. */
function DeleteTable({ send }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button className="text-xs text-muted hover:text-danger underline underline-offset-4" onClick={() => setConfirming(true)}>
        delete this table
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label="Delete this table" className="rounded border border-danger/60 p-4 space-y-3 text-left">
      <p className="text-xs leading-relaxed">
        <span className="text-danger">Delete forever?</span> Seats, chips, chat and the PIN are erased for everyone, and anyone still here is
        disconnected. This can&apos;t be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn !w-auto px-4 !border-danger !text-danger hover:!bg-danger hover:!text-surface"
          onClick={() => send({ type: "delete" })}
        >
          delete forever
        </button>
        <button className="btn !w-auto px-4" onClick={() => setConfirming(false)}>
          keep it
        </button>
      </div>
    </div>
  );
}

function Deleted({ deleted }) {
  return (
    <div className="max-w-md">
      <Panel index="01" title="table deleted">
        <div className="space-y-5">
          <p className="text-sm">{deleted.by ? `${deleted.by} deleted this table.` : "This table was deleted."}</p>
          <p className="text-xs text-muted leading-relaxed">
            Its seats, chips, chat and PIN are gone from the server, and this browser has forgotten them too.
          </p>
          <a className="btn block text-center" href={`${BASE}/table`}>
            open a new table
          </a>
        </div>
      </Panel>
    </div>
  );
}

// ---- the table -------------------------------------------------------------------------

function Board({ cards }) {
  return (
    <div className="flex gap-2 sm:gap-3 justify-center" aria-label="Community cards">
      {Array.from({ length: 5 }, (_, i) => (
        <PlayingCard key={i} card={cards[i]} faceDown={!cards[i]} size="board" />
      ))}
    </div>
  );
}

function Badge({ children, strong }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm ${
        strong ? "bg-ink text-surface" : "border border-line text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/** One player: name, stack, bet this street, and cards (yours, shown at showdown, or backs). */
function Seat({ seat, shown, won, me, handName }) {
  // Your own cards while you have them; after a game ends, the showdown reveal.
  const cards = me && seat.cards?.length ? seat.cards : shown;
  const holding = seat.inHand && !seat.folded;
  return (
    <div className={`rounded p-3 sm:p-4 border ${seat.turn || won ? "border-hi" : "border-line"} ${seat.folded ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm truncate">
          {seat.name}
          {me && <span className="text-muted"> (you)</span>}
        </p>
        <div className="flex flex-wrap justify-end gap-1">
          {seat.dealer && <Badge>d</Badge>}
          {seat.turn && <Badge strong>to act</Badge>}
          {won && <Badge strong>win</Badge>}
          {seat.allIn && <Badge>all-in</Badge>}
          {seat.folded && <Badge>fold</Badge>}
          {!seat.connected && <Badge>away</Badge>}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex gap-1">
          {cards?.length
            ? cards.map((c) => <PlayingCard key={c} card={c} size={me ? "lg" : "md"} />)
            : holding && [0, 1].map((i) => <PlayingCard key={i} faceDown size={me ? "lg" : "md"} />)}
        </div>
        <div className="text-right text-xs min-w-0">
          <p className="tabular-nums text-sm">{seat.chips.toLocaleString()}</p>
          {seat.bet > 0 && <p className="text-muted tabular-nums">bet {seat.bet.toLocaleString()}</p>}
          {handName && <p className="text-ink mt-1">{handName}</p>}
        </div>
      </div>
    </div>
  );
}

function Actions({ prompt, pot, send }) {
  const canRaise = prompt.maxRaiseTo > prompt.currentBet && prompt.myChips > prompt.toCall;
  const minTo = Math.min(prompt.minRaiseTo, prompt.maxRaiseTo);
  const [to, setTo] = useState(minTo);
  useEffect(() => setTo(minTo), [minTo]);
  const clampTo = (v) => Math.max(minTo, Math.min(prompt.maxRaiseTo, Math.round(v) || minTo));
  const potRaise = clampTo(prompt.currentBet + pot + prompt.toCall);
  const act = (action, extra) => send({ type: "action", action, ...extra });

  return (
    // Sticks to the bottom of the screen on phones so the buttons stay in reach.
    <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 mt-6 px-5 sm:px-6 pt-4 pb-5 bg-surface border-t border-line space-y-4 lg:static lg:mx-auto lg:px-0 lg:pb-0 lg:max-w-2xl">
      <p className="label">
        your move{prompt.toCall > 0 && <span className="normal-case tracking-normal"> · {prompt.toCall.toLocaleString()} to call</span>}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn" onClick={() => act("fold")}>
          fold
        </button>
        {prompt.toCall > 0 ? (
          <button className="btn" onClick={() => act("call")}>
            call {prompt.toCall.toLocaleString()}
          </button>
        ) : (
          <button className="btn" onClick={() => act("check")}>
            check
          </button>
        )}
        <button className="btn" onClick={() => act("all-in")}>
          all-in {prompt.myChips.toLocaleString()}
        </button>
      </div>
      {canRaise && minTo < prompt.maxRaiseTo && (
        <div className="space-y-3">
          <input
            type="range"
            className="w-full accent-[#f3f3ed]"
            min={minTo}
            max={prompt.maxRaiseTo}
            step={1}
            value={clampTo(to)}
            onChange={(e) => setTo(clampTo(e.target.value))}
            aria-label="Raise to"
          />
          <div className="flex flex-wrap gap-2">
            <input
              className="field !mt-0 !w-28 tabular-nums"
              type="number"
              inputMode="numeric"
              value={to}
              min={minTo}
              max={prompt.maxRaiseTo}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => setTo(clampTo(to))}
              aria-label="Raise to amount"
            />
            <button className="btn !w-auto px-3 text-xs" onClick={() => setTo(clampTo(prompt.currentBet + Math.round((pot + prompt.toCall) / 2)))}>
              ½ pot
            </button>
            <button className="btn !w-auto px-3 text-xs" onClick={() => setTo(potRaise)}>
              pot
            </button>
            <button className="btn !w-auto flex-1 px-4" onClick={() => act("raise", { to: clampTo(to) })}>
              {prompt.currentBet > 0 ? "raise" : "bet"} to {clampTo(to).toLocaleString()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Countdown({ until }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{Math.max(0, Math.ceil((until - now) / 1000))}s</span>;
}

function HandLog({ events }) {
  const lines = events.map(describeEvent).filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="mt-6">
      <p className="label mb-3">this hand</p>
      <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 text-xs leading-relaxed text-muted max-h-40 overflow-y-auto">
        {lines.map(([tag, text], i) => (
          <div key={i} className="contents">
            <dt className={tag === "win" ? "text-ink" : ""}>{tag}</dt>
            <dd className={`break-words ${tag === "win" ? "text-ink" : ""}`}>{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Shown on every screen when someone has all the chips: anyone seated can ask for a rematch. */
function GameOver({ view, send }) {
  const winner = view.seats.find((s) => s.chips > 0);
  const me = view.seats[view.you];
  const asked = view.seats.filter((s) => s.rematch);
  const waitingOn = view.seats.filter((s) => !s.rematch);

  return (
    <div className="mt-6 pt-6 border-t border-line text-center space-y-4">
      <div>
        <p className="label">game over · {view.handNumber} hands</p>
        <p className="text-2xl font-bold mt-2">{winner?.name ?? "—"}</p>
        <p className="text-xs text-muted mt-1">takes every chip</p>
      </div>
      {me && (
        <div className="max-w-sm mx-auto space-y-2">
          {me.rematch ? (
            <>
              <button className="btn" disabled>
                rematch requested
              </button>
              <p className="text-xs text-muted">
                waiting for {waitingOn.map((s) => s.name).join(" & ")} ·{" "}
                <button className="underline underline-offset-4 hover:text-ink" onClick={() => send({ type: "rematch", cancel: true })}>
                  cancel
                </button>
              </p>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => send({ type: "rematch" })}>
                {asked.length ? "accept rematch" : "request rematch"}
              </button>
              {asked.length > 0 && (
                <p className="text-xs text-ink">
                  {asked.map((s) => s.name).join(" & ")} {asked.length === 1 ? "wants" : "want"} a rematch
                </p>
              )}
            </>
          )}
          <p className="text-[11px] text-muted">
            everyone goes back to {view.settings.startingChips.toLocaleString()} chips and the next game deals right away.
          </p>
          <div className="pt-3">
            <DeleteTable send={send} />
          </div>
        </div>
      )}
    </div>
  );
}

function Table({ view, send }) {
  const showdown = view.log.find((ev) => ev.type === "showdown");
  const shown = new Map((showdown?.hands || []).map((h) => [h.name, h]));
  const winners = new Set(view.log.filter((ev) => ev.type === "win").map((ev) => ev.player));
  const finished = Boolean(view.lastHand);
  const over = view.phase === "over";
  const me = view.seats[view.you];
  // Your seat goes last, closest to the action buttons.
  const others = view.seats.map((s, i) => [s, i]).filter(([, i]) => i !== view.you);
  const seatProps = (s) => ({
    shown: shown.get(s.name)?.cards,
    handName: shown.get(s.name) ? describeHand(shown.get(s.name).hv) : undefined,
    won: finished && winners.has(s.name),
  });
  const myLive = me?.cards?.length && !finished ? bestHand(me.cards, view.board) : null;
  const won = view.log.filter((ev) => ev.type === "win").reduce((sum, ev) => sum + ev.amount, 0);
  const pot = view.pot || won;

  return (
    <Panel index="01" title="table" aside={`hand ${String(view.handNumber).padStart(3, "0")} · blinds ${view.settings.smallBlind}/${view.settings.bigBlind}`}>
      <div className={`grid gap-3 ${others.length > 1 ? "sm:grid-cols-2 2xl:grid-cols-3" : "max-w-md mx-auto"}`}>
        {others.map(([s, i]) => (
          <Seat key={i} seat={s} {...seatProps(s)} />
        ))}
      </div>

      <div className="my-6 sm:my-10">
        <Board cards={view.board} />
        <div className="mt-5 flex flex-col items-center gap-2 min-h-[4.5rem]">
          {pot > 0 && <ChipStack amount={pot} size={36} maxPiles={5} />}
          {pot > 0 && (
            <p className="text-xs">
              <span className="label inline mr-2">{finished ? "won" : "pot"}</span>
              <span className="tabular-nums">{pot.toLocaleString()}</span>
            </p>
          )}
        </div>
      </div>

      {me && (
        <div className="max-w-md mx-auto">
          <Seat seat={me} me {...seatProps(me)} handName={seatProps(me).handName || (myLive && !me.folded ? describeHand(myLive.hv) : undefined)} />
        </div>
      )}

      {view.prompt && <Actions prompt={view.prompt} pot={view.pot} send={send} />}
      {!view.prompt && !finished && me && (
        <p className="mt-5 text-xs text-muted text-center">
          {view.seats.find((s) => s.turn) ? `waiting for ${view.seats.find((s) => s.turn).name}…` : "dealing…"}
        </p>
      )}

      {finished && (
        <div className="mt-6 space-y-3">
          <WinReason events={view.log} />
          {!over && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {[...winners].join(" & ") || "—"} <span className="text-muted">wins {won.toLocaleString()}</span>
              </p>
              {view.between && me && (
                <button className="btn !w-auto px-4" disabled={me.ready} onClick={() => send({ type: "next" })}>
                  {me.ready ? "waiting…" : "next hand"} <Countdown until={view.between.until} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {over && <GameOver view={view} send={send} />}
      {view.stopping && <p className="mt-3 text-xs text-muted">pausing after this hand</p>}

      <HandLog events={view.log} />

      {view.you === 0 && !view.stopping && !over && (
        <button className="mt-6 text-xs text-muted hover:text-ink underline underline-offset-4" onClick={() => send({ type: "pause" })}>
          pause after this hand
        </button>
      )}
    </Panel>
  );
}

function Chat({ view, send }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [view.chat.length]);
  const seated = view.you !== -1;
  return (
    <Panel index="02" title="chat">
      <ul ref={listRef} className="space-y-1.5 text-xs max-h-72 overflow-y-auto mb-4 break-words">
        {view.chat.map((m, i) => (
          <li key={i}>
            <span className="text-muted">{m.name}</span> {m.text}
          </li>
        ))}
        {view.chat.length === 0 && <li className="text-muted">say hi_</li>}
      </ul>
      {seated && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            send({ type: "chat", text });
            setText("");
          }}
        >
          <input className="field" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="message" aria-label="Chat message" />
        </form>
      )}
    </Panel>
  );
}

// ---- sound -----------------------------------------------------------------------------

const ACTION_SOUND = { fold: "fold", check: "check", call: "chip", raise: "raise", "all-in": "allin" };

/**
 * Plays a sound for each new thing that happens at the table: the deal, each action, each
 * street, the result, your turn and incoming chat. Nothing plays for the state you load into.
 */
function useTableSounds(view) {
  const prev = useRef(null);
  useEffect(() => {
    if (!view) return;
    const before = prev.current;
    const now = { hand: view.handNumber, len: view.log.length, prompt: Boolean(view.prompt), chat: view.chat.length };
    prev.current = now;
    if (!before) return;

    const fresh = now.hand !== before.hand ? view.log : view.log.slice(before.len);
    const queue = [];
    for (const ev of fresh) {
      if (ev.type === "hand_start") queue.push("deal");
      else if (ev.type === "street") queue.push("card");
      else if (ev.type === "action" && ACTION_SOUND[ev.action]) queue.push(ACTION_SOUND[ev.action]);
    }
    const me = view.seats[view.you];
    if (fresh.some((ev) => ev.type === "win") && me) {
      queue.push(fresh.some((ev) => ev.type === "win" && ev.player === me.name) ? "win" : "lose");
    }
    if (now.prompt && !before.prompt) queue.push("turn");
    const last = view.chat[view.chat.length - 1];
    if (now.chat > before.chat && last && last.name !== me?.name) queue.push("chat");

    const timers = queue.map((name, i) => setTimeout(() => play(name), i * 160));
    return () => timers.forEach(clearTimeout);
  }, [view]);
}

function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => setMutedState(isMuted()), []);
  return (
    <button
      className="text-xs text-muted hover:text-ink"
      aria-pressed={!muted}
      onClick={() => {
        unlockAudio();
        setMuted(!muted);
        setMutedState(!muted);
        if (muted) setTimeout(() => play("chip"), 30);
      }}
    >
      <span aria-hidden>♪</span> sound {muted ? "off" : "on"}
    </button>
  );
}

// ---- page ------------------------------------------------------------------------------

export default function TablePage() {
  const [code, setCode] = useState(undefined);
  useEffect(() => {
    const room = new URLSearchParams(location.search).get("room")?.toLowerCase() || "";
    setCode(CODE_RE.test(room) ? room : null);
  }, []);
  const { view, locked, deleted, status, error, send, unlock } = useTable(code);
  useTableSounds(view);

  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    const unlockOnce = () => unlockAudio();
    window.addEventListener("pointerdown", unlockOnce);
    window.addEventListener("keydown", unlockOnce);
    return () => {
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
  }, []);

  // Flag your turn in the tab title, for when the table is in a background tab.
  const myTurn = Boolean(view?.prompt);
  useEffect(() => {
    document.title = myTurn ? "● your turn · poker_tourney" : "play with friends · poker_tourney";
  }, [myTurn]);

  const atTable = view && view.phase !== "lobby" && view.handNumber > 0;
  const me = view?.seats[view.you];

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-6 sm:mb-8">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">
          play with friends <span className="text-muted font-normal text-xs sm:text-sm ml-2">private texas hold&apos;em tables</span>
        </h1>
        <div className="flex items-center gap-5 text-xs">
          {code && view && !deleted && <SoundToggle />}
          {code && !deleted && (
            <p className="flex items-center gap-2" role="status">
              <span aria-hidden>{status === "online" ? "●" : "○"}</span>
              <span className={status === "online" ? "text-ink" : "text-muted"}>{status}</span>
            </p>
          )}
        </div>
      </div>

      <main id="main-content">
        {code === null && <Landing />}
        {code && deleted && <Deleted deleted={deleted} />}
        {code && !deleted && locked && <Unlock code={code} locked={locked} error={error} unlock={unlock} />}
        {code && !deleted && !locked && !view && <p className="text-xs text-muted">connecting to table {code}…</p>}
        {code && !deleted && !locked && view && (
          // Phones: table, then seats and chat, then the guide. lg: guide moves under chat. xl: guide on the left.
          <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[18rem_minmax(0,1fr)_20rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_22rem] items-start">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2 xl:col-start-2">
              {atTable ? <Table view={view} send={send} /> : <Lobby code={code} view={view} send={send} error={error} />}
              {atTable && view.you === -1 && <p className="mt-4 text-xs text-muted">you&apos;re watching. you can take a seat once this game ends.</p>}
            </div>
            <div className="space-y-6 lg:space-y-8 lg:col-start-2 lg:row-start-1 xl:col-start-3">
              {atTable && (
                <Panel title="seats" aside={`table ${code}`}>
                  <SeatList view={view} />
                </Panel>
              )}
              <Chat view={view} send={send} />
            </div>
            <div className="lg:col-start-2 lg:row-start-2 xl:col-start-1 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-16">
              <HandGuide myCards={atTable ? me?.cards : null} board={atTable ? view.board : []} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

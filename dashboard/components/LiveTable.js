"use client";

import Panel from "./Panel";
import PlayingCard from "./PlayingCard";

const BOARD_SIZE = 5;

/** The five board slots: dealt cards face up, the rest face down. */
function Board({ cards }) {
  return (
    <div className="flex gap-2 sm:gap-3 justify-center" aria-label="Community cards">
      {Array.from({ length: BOARD_SIZE }, (_, i) => (
        <PlayingCard key={i} card={cards[i]} faceDown={!cards[i]} size="board" />
      ))}
    </div>
  );
}

/** Hole cards and hand names of everyone who reached showdown in the last hand. */
function Showdown({ event }) {
  if (!event?.hands?.length) return null;
  const winners = new Set(event.winners || []);
  return (
    <div className="mt-8">
      <p className="label mb-3">showdown</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {event.hands.map((h) => {
          const won = winners.has(h.name);
          return (
            <div
              key={h.name}
              className={`flex items-center gap-3 rounded p-2.5 border ${won ? "border-hi" : "border-line"}`}
            >
              <div className="flex gap-1 flex-shrink-0">
                {(h.cards || []).map((c) => (
                  <PlayingCard key={c} card={c} size="sm" />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{h.name}</p>
                <p className="text-xs text-muted">{h.handName?.toLowerCase()}</p>
              </div>
              {won && (
                <span className="text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm bg-ink text-surface">
                  win
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** [tag, text] for a log line; the tag is blank for actions so streets stand out. */
function describeEvent(ev) {
  switch (ev.type) {
    case "hand_start": return ["deal", `sb ${ev.sb} · bb ${ev.bb}`];
    case "street": return [ev.street, (ev.cards || []).join(" ")];
    case "action": return ["", `${ev.player} ${ev.action}${ev.amount != null ? ` ${ev.amount}` : ""}${ev.reason ? ` (${ev.reason})` : ""}`];
    case "showdown": return ["show", (ev.winners || []).join(", ")];
    case "win": return ["win", `${ev.player} +${ev.amount}${ev.pot && ev.pot !== "main" ? ` (${ev.pot})` : ""}`];
    case "error": return ["error", `${ev.player}: ${ev.message}`];
    default: return null;
  }
}

function EventLog({ events }) {
  const lines = events.map(describeEvent).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <div className="mt-8">
      <p className="label mb-3">last hand</p>
      <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 text-xs leading-relaxed text-muted max-h-48 overflow-y-auto">
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

export default function LiveTable({ update }) {
  if (!update) {
    return (
      <Panel index="01" title="live table" aside="idle">
        <div className="py-6">
          <Board cards={[]} />
          <p className="text-xs text-muted text-center mt-8">select bots and run a match to start the stream_</p>
        </div>
      </Panel>
    );
  }

  const { type, matchId, handNumber, lastHandEvents = [], communityCards = [] } = update;

  if (type === "MATCH_ERROR") {
    return (
      <Panel index="01" title="live table" aside="error">
        <p className="text-sm text-danger">error: {update.error}</p>
      </Panel>
    );
  }

  if (type === "MATCH_END") {
    return (
      <Panel index="01" title="live table" aside={matchId}>
        <div className="py-6 text-center">
          <p className="label">match finished · {update.numHandsPlayed} hands</p>
          <p className="text-2xl font-bold mt-3">{update.winner ?? "—"}</p>
          <p className="text-xs text-muted mt-1">takes the table</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel index="01" title="live table" aside={`hand ${String(handNumber).padStart(3, "0")}`}>
      <div className="pt-2">
        <Board cards={communityCards} />
      </div>
      <Showdown event={lastHandEvents.find((ev) => ev.type === "showdown")} />
      <EventLog events={lastHandEvents} />
    </Panel>
  );
}

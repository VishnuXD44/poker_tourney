"use client";

const SUIT_NAMES = { h: "Hearts", d: "Diamonds", c: "Clubs", s: "Spades" };
const RANK_TO_NUM = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 1 };

function cardToSpritePath(cardStr) {
  if (!cardStr || cardStr.length < 2) return null;
  const rankChar = cardStr.slice(0, -1);
  const suitChar = cardStr.slice(-1);
  const suitName = SUIT_NAMES[suitChar];
  const rankNum = RANK_TO_NUM[rankChar];
  if (!suitName || rankNum == null) return null;
  const filename = `${suitName} ${rankNum}.png`;
  return `/Sprites/${encodeURIComponent(filename)}`;
}

export default function LiveTable({ update }) {
  const sectionStyle = {
    background: "#ffffff",
    border: "1px solid #e2dfda",
    boxShadow: "0 4px 12px rgba(26,39,68,0.06)",
  };
  if (!update) {
    return (
      <section className="rounded-xl p-6" style={sectionStyle}>
        <h2 className="text-lg font-bold mb-4" style={{ color: "#1a2744" }}>Live Table</h2>
        <div className="aspect-video rounded-lg flex items-center justify-center text-sm" style={{ background: "#fafaf9", border: "1px solid #e2dfda", color: "#5c6577" }}>
          Start a match to see the live stream.
        </div>
      </section>
    );
  }

  const { type, matchId, handNumber, chipCounts = [], lastHandEvents = [], communityCards = [] } = update;

  if (type === "MATCH_ERROR") {
    return (
      <section className="rounded-xl p-6" style={sectionStyle}>
        <h2 className="text-lg font-bold mb-4" style={{ color: "#1a2744" }}>Live Table</h2>
        <div className="rounded-lg p-4 text-sm" style={{ background: "rgba(197,48,48,0.1)", border: "1px solid rgba(197,48,48,0.3)", color: "#c53030" }}>
          {update.error}
        </div>
      </section>
    );
  }

  if (type === "MATCH_END") {
    return (
      <section className="rounded-xl p-6" style={sectionStyle}>
        <h2 className="text-lg font-bold mb-4" style={{ color: "#1a2744" }}>Live Table</h2>
        <div className="rounded-lg p-4 border-l-4" style={{ background: "#1a2744", color: "#e8c547", borderLeftColor: "#b8860b" }}>
          <p className="text-sm opacity-90">Match finished</p>
          <p className="font-semibold mt-1">
            Winner: {update.winner ?? "—"} (after {update.numHandsPlayed} hands)
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl p-6" style={sectionStyle}>
      <h2 className="text-lg font-bold mb-4" style={{ color: "#1a2744" }}>Live Table</h2>
      <div className="rounded-xl p-6 min-h-[200px] border-2" style={{ background: "#fafaf9", borderColor: "#e2dfda" }}>
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-mono" style={{ color: "#5c6577" }}>{matchId}</span>
          <span className="text-sm font-semibold" style={{ color: "#b8860b" }}>Hand {handNumber}</span>
        </div>
        {communityCards.length > 0 && (
          <div className="flex gap-1 justify-center mb-4 flex-wrap">
            {communityCards.map((c, i) => {
              const src = cardToSpritePath(c);
              return src ? (
                <img
                  key={i}
                  src={src}
                  alt={c}
                  className="h-14 w-auto object-contain"
                  title={c}
                />
              ) : (
                <span
                  key={i}
                  className="inline-flex items-center justify-center w-10 h-14 rounded-lg bg-white border border-[#e2dfda] text-sm font-mono text-[#1a2744]"
                >
                  {c}
                </span>
              );
            })}
          </div>
        )}
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {(lastHandEvents || []).slice(-12).map((ev, i) => (
            <div key={i} className="text-xs text-[#5c6577] font-mono">
              {ev.type === "action" && `${ev.player} ${ev.action}${ev.amount != null ? ` ${ev.amount}` : ""}`}
              {ev.type === "street" && `Street: ${ev.street} ${(ev.cards || []).join(" ")}`}
              {ev.type === "win" && `${ev.player} wins ${ev.amount}`}
              {ev.type === "showdown" && `Showdown — winners: ${(ev.winners || []).join(", ")}`}
              {ev.type === "hand_start" && `Hand start — SB: ${ev.sb} BB: ${ev.bb}`}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

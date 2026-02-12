"use client";

export default function Leaderboard({ update }) {
  const chipCounts = update?.chipCounts ?? [];
  const sorted = [...chipCounts].sort((a, b) => (b.chips ?? 0) - (a.chips ?? 0));
  const winner = update?.winner ?? null;
  const isEnd = update?.type === "MATCH_END";

  const sectionStyle = {
    background: "#ffffff",
    border: "1px solid #e2dfda",
    boxShadow: "0 4px 12px rgba(26,39,68,0.06)",
  };
  return (
    <section className="rounded-xl p-6" style={sectionStyle}>
      <h2 className="text-lg font-bold mb-4" style={{ color: "#1a2744" }}>Leaderboard</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-[#5c6577]">Chip counts will appear when a match is running.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((p, i) => (
            <li
              key={p.id}
              className={`flex justify-between items-center px-4 py-2.5 rounded-lg border ${
                isEnd && winner === p.name
                  ? "bg-gradient-to-r from-[#b8860b]/10 to-transparent border-[#b8860b] text-[#1a2744] font-semibold"
                  : "bg-[#fafaf9] border-[#e2dfda] text-[#1a2744]"
              }`}
            >
              <span className="text-sm font-medium">
                {i + 1}. {p.name}
                {isEnd && winner === p.name && (
                  <span className="ml-2 text-[#b8860b] text-xs font-semibold">Winner</span>
                )}
              </span>
              <span className="text-sm font-mono font-semibold text-[#1a2744]">{p.chips}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

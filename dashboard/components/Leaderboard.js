"use client";

import Panel from "./Panel";

export default function Leaderboard({ update }) {
  const chipCounts = update?.chipCounts ?? [];
  const sorted = [...chipCounts].sort((a, b) => (b.chips ?? 0) - (a.chips ?? 0));
  const total = sorted.reduce((s, p) => s + (p.chips ?? 0), 0);
  const winner = update?.winner ?? null;
  const isEnd = update?.type === "MATCH_END";

  return (
    <Panel index="03" title="standings" aside={total ? `${total.toLocaleString()} chips` : null}>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted">chip counts appear once a match is running.</p>
      ) : (
        <ol className="space-y-3">
          {sorted.map((p, i) => {
            const won = isEnd && winner === p.name;
            const share = total ? (p.chips / total) * 100 : 0;
            return (
              <li key={p.id}>
                <div className={`flex items-baseline gap-3 text-sm ${p.chips === 0 ? "text-muted" : ""}`}>
                  <span className="text-muted text-xs w-5">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 truncate">
                    {p.name}
                    {won && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm bg-ink text-surface">
                        winner
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{p.chips === 0 ? "out" : p.chips.toLocaleString()}</span>
                </div>
                {/* Share of all chips on the table */}
                <div className="ml-8 mt-1.5 h-px bg-line">
                  <div className="h-px bg-hi transition-[width] duration-300" style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

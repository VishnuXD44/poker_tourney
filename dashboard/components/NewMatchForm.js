"use client";

import { useEffect, useState } from "react";

export default function NewMatchForm({ bots, onRunMatch, disabled, update }) {
  const [selected, setSelected] = useState([]);
  const [hands, setHands] = useState(50);
  const [sb, setSb] = useState(10);
  const [bb, setBb] = useState(20);
  const [chips, setChips] = useState(1000);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const botIds = new Set(bots.map((bot) => bot.id));
    setSelected((prev) => prev.filter((id) => botIds.has(id)));
  }, [bots]);

  useEffect(() => {
    if (!update) return;
    if (update.type === "MATCH_END" || update.type === "MATCH_ERROR") {
      setRunning(false);
    }
  }, [update]);

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const run = () => {
    if (selected.length < 2 || disabled || running) return;
    setRunning(true);
    onRunMatch({
      botIds: selected,
      numHands: hands,
      smallBlind: sb,
      bigBlind: bb,
      startingChips: chips,
    });
  };

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e2dfda",
    boxShadow: "0 4px 12px rgba(26,39,68,0.06)",
  };
  return (
    <section className="rounded-xl p-6" style={cardStyle}>
      <h2 className="text-lg font-bold mb-1" style={{ color: "#1a2744" }}>New Match</h2>
      <p className="text-sm text-[#5c6577] mb-4">
        Select 2-9 uploaded C++ bots. The backend runs their compiled executables and streams updates here.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-[#1a2744] mb-2">Bots</label>
          <div className="flex flex-wrap gap-2">
            {bots.length === 0 ? (
              <span className="text-sm text-[#5c6577]">No bots available. Upload and verify at least two C++ bots first.</span>
            ) : (
              bots.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-[#fafaf9] border border-[#e2dfda] hover:border-[#9a7b2e] text-[#1a2744]"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(b.id)}
                    onChange={() => toggle(b.id)}
                    className="rounded text-[#b8860b] focus:ring-[#b8860b]"
                  />
                  <span className="text-sm">{b.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#1a2744]">Hands</label>
            <input
              type="number"
              min={10}
              max={500}
              value={hands}
              onChange={(e) => setHands(Number(e.target.value) || 50)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#fafaf9] border border-[#e2dfda] text-sm text-[#1a2744] focus:border-[#b8860b] focus:ring-2 focus:ring-[#b8860b]/15 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1a2744]">Small blind</label>
            <input
              type="number"
              min={1}
              value={sb}
              onChange={(e) => setSb(Number(e.target.value) || 10)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#fafaf9] border border-[#e2dfda] text-sm text-[#1a2744] focus:border-[#b8860b] focus:ring-2 focus:ring-[#b8860b]/15 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1a2744]">Big blind</label>
            <input
              type="number"
              min={1}
              value={bb}
              onChange={(e) => setBb(Number(e.target.value) || 20)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#fafaf9] border border-[#e2dfda] text-sm text-[#1a2744] focus:border-[#b8860b] focus:ring-2 focus:ring-[#b8860b]/15 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1a2744]">Starting chips</label>
            <input
              type="number"
              min={100}
              value={chips}
              onChange={(e) => setChips(Number(e.target.value) || 1000)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-[#fafaf9] border border-[#e2dfda] text-sm text-[#1a2744] focus:border-[#b8860b] focus:ring-2 focus:ring-[#b8860b]/15 outline-none"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={disabled || selected.length < 2 || running}
          className="w-full py-3 rounded-lg font-semibold border disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm hover:opacity-95"
          style={{
            background: "linear-gradient(180deg, #d4af37 0%, #b8860b 100%)",
            color: "#1a2744",
            borderColor: "#9a7b2e",
          }}
        >
          {running ? "Starting…" : "Run Match (live stream)"}
        </button>
      </div>
    </section>
  );
}

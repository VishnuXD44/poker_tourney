"use client";

import { useEffect, useState } from "react";
import Panel from "./Panel";

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

  const fields = [
    { label: "hands", value: hands, set: setHands, fallback: 50, min: 10, max: 500 },
    { label: "small blind", value: sb, set: setSb, fallback: 10, min: 1 },
    { label: "big blind", value: bb, set: setBb, fallback: 20, min: 1 },
    { label: "stack", value: chips, set: setChips, fallback: 1000, min: 100 },
  ];

  return (
    <Panel index="02" title="new match" aside={`${selected.length}/9 seated`}>
      <p className="label mb-2">bots</p>
      {bots.length === 0 ? (
        <p className="text-xs text-muted">no bots yet. upload at least two below.</p>
      ) : (
        <ul className="space-y-0.5">
          {bots.map((b) => {
            const on = selected.includes(b.id);
            return (
              <li key={b.id}>
                <label className={`flex items-center gap-2 cursor-pointer py-1 text-sm ${on ? "text-ink" : "text-muted hover:text-ink"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(b.id)} className="sr-only peer" />
                  <span aria-hidden className="peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-hi rounded-sm">
                    {on ? "[x]" : "[ ]"}
                  </span>
                  <span className="truncate">{b.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3 mt-5">
        {fields.map((f) => (
          <label key={f.label} className="block">
            <span className="label">{f.label}</span>
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={f.value}
              onChange={(e) => f.set(Number(e.target.value) || f.fallback)}
              className="field tabular-nums"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={run}
        disabled={disabled || selected.length < 2 || running}
        className="btn mt-5"
      >
        {running ? "running…" : "run match →"}
      </button>
    </Panel>
  );
}

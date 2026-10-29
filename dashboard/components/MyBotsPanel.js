"use client";

import { useRouter } from "next/navigation";
import Panel from "./Panel";
import { HOUSE_BOTS, deleteMyBot } from "@/lib/myBots";
import { BUILDER_STORAGE_KEY } from "@/lib/strategy";

/** Bots panel for the in-browser arena: saved strategies (editable) and the house bots. */
export default function MyBotsPanel({ myBots, onChange }) {
  const router = useRouter();

  const edit = (bot) => {
    try {
      localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify({ graph: bot.graph, name: bot.name }));
    } catch {}
    router.push("/builder");
  };
  const remove = (bot) => {
    if (!window.confirm(`delete "${bot.name}"?`)) return;
    deleteMyBot(bot.id);
    onChange();
  };

  return (
    <Panel index="04" title="bots" aside={`${myBots.length} saved · ${HOUSE_BOTS.length} house`}>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="label mb-3">your strategies</p>
          {myBots.length === 0 ? (
            <p className="text-xs text-muted leading-relaxed">
              none yet. design one in the{" "}
              <button type="button" onClick={() => router.push("/builder")} className="text-ink underline underline-offset-4">
                strategy builder
              </button>{" "}
              and press &ldquo;save to arena&rdquo;. strategies are kept in this browser only.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-line border-y border-line">
              {myBots.map((bot) => (
                <li key={bot.id} className="py-2 text-sm flex justify-between items-center gap-3">
                  <span className="truncate">{bot.name}</span>
                  <span className="flex gap-4 text-xs text-muted flex-shrink-0">
                    <button type="button" onClick={() => edit(bot)} className="hover:text-ink">
                      edit
                    </button>
                    <button type="button" onClick={() => remove(bot)} className="hover:text-danger" aria-label={`delete ${bot.name}`}>
                      delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="label mb-3">house bots</p>
          <ul className="divide-y divide-line border-y border-line">
            {HOUSE_BOTS.map((bot) => (
              <li key={bot.id} className="py-2 text-sm flex justify-between gap-3">
                <span className="truncate">{bot.name}</span>
                <span className="text-xs text-muted">built-in</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

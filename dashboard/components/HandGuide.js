"use client";

import Panel from "./Panel";
import PlayingCard from "./PlayingCard";
import { RANKINGS, bestHand, describeHand, draws, rankingKey, startingHand } from "@/lib/hands";

const TIER_BAR = ["▮▯▯▯", "▮▮▯▯", "▮▮▮▯", "▮▮▮▮"];

const TERMS = [
  ["blinds", "Forced bets that start each pot. The two players left of the dealer (D) post them; in heads-up the dealer posts the small one."],
  ["check", "Pass without betting. Only allowed when nobody has bet this round."],
  ["call", "Match the current bet to stay in."],
  ["bet / raise", "Put in more than anyone so far; others must call, raise again, or fold."],
  ["fold", "Give up the hand. You lose what you've put in, nothing more."],
  ["all-in", "Bet every chip you have. You can only win as much from each player as you put in."],
  ["kicker", "When two hands tie on the main part (same pair, say), the highest leftover card decides."],
  ["streets", "Pre-flop (just your two cards), flop (3 shared cards), turn (4th), river (5th), then showdown."],
];

/** What you're holding right now, in words, with your best five cards when there's a board. */
function YourHand({ myCards, board }) {
  if (!myCards?.length) {
    return <p className="text-xs text-muted leading-relaxed">When you&apos;re dealt in, this explains what your cards are worth.</p>;
  }
  const hand = bestHand(myCards, board);
  const start = startingHand(myCards);
  const drawing = draws(myCards, board);
  const preflop = board.length === 0;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-ink">{describeHand(hand?.hv)}</p>
        {preflop && start && (
          <p className="text-xs text-muted mt-1">
            {start.label} · <span className="text-ink">{start.strength}</span>{" "}
            <span aria-hidden className="tracking-tighter">
              {TIER_BAR[start.tier]}
            </span>
          </p>
        )}
      </div>
      {preflop && start && <p className="text-xs leading-relaxed text-muted">{start.tip}</p>}
      {hand?.best && (
        <div>
          <p className="label mb-1.5">your best five</p>
          <div className="flex gap-1">
            {hand.best.map((c) => (
              <PlayingCard key={c} card={c} size="xs" className={myCards.includes(c) ? "" : "opacity-60"} />
            ))}
          </div>
          <p className="text-[11px] text-muted mt-1.5">brighter cards are yours; the rest come from the board.</p>
        </div>
      )}
      {drawing.map((d) => (
        <p key={d} className="text-xs text-muted leading-relaxed">
          ↗ {d}
        </p>
      ))}
    </div>
  );
}

/**
 * Sidebar for beginners: what your hand is, how hands rank (yours lit up), how strong a
 * starting hand is, and the words people use at the table.
 */
export default function HandGuide({ myCards, board = [] }) {
  const hand = myCards?.length ? bestHand(myCards, board) : null;
  const current = rankingKey(hand?.hv);

  return (
    <Panel title="hand guide">
      <div className="space-y-6">
        <section aria-label="Your hand">
          <p className="label mb-2">you have</p>
          <YourHand myCards={myCards} board={board} />
        </section>

        <section aria-label="Hand rankings">
          <p className="label mb-2">hand rankings · best first</p>
          <ol className="space-y-1">
            {RANKINGS.map((r, i) => {
              const on = r.key === current;
              return (
                <li
                  key={r.key}
                  aria-current={on ? "true" : undefined}
                  className={`rounded px-2 py-1.5 border ${on ? "border-hi bg-bg" : "border-transparent"}`}
                >
                  <details className="group">
                    <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-xs">
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className="text-edge tabular-nums w-4">{i + 1}</span>
                        <span className={`truncate ${on ? "text-ink" : ""}`}>{r.name}</span>
                        {on && <span className="text-[10px] uppercase tracking-[0.14em] text-hi">you</span>}
                      </span>
                      <span aria-hidden className="text-edge group-open:rotate-90 transition-transform">
                        ›
                      </span>
                    </summary>
                    <div className="mt-2 pl-6 space-y-1.5">
                      <div className="flex gap-0.5">
                        {r.example.map((c) => (
                          <PlayingCard key={c} card={c} size="xs" />
                        ))}
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed">{r.about}</p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            You make the best five-card hand from your two cards plus the five on the board. Suits never rank; ace is high (or low in A-2-3-4-5).
          </p>
        </section>

        <section aria-label="Terms">
          <details>
            <summary className="label cursor-pointer">table words ›</summary>
            <dl className="mt-3 space-y-2 text-[11px] leading-relaxed">
              {TERMS.map(([t, d]) => (
                <div key={t}>
                  <dt className="text-ink">{t}</dt>
                  <dd className="text-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      </div>
    </Panel>
  );
}

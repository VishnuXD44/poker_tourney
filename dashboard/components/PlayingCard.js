"use client";

const SUIT_NAMES = { h: "hearts", d: "diamonds", c: "clubs", s: "spades" };
const RANK_FILES = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
const RANK_LABELS = { T: "10", J: "jack", Q: "queen", K: "king", A: "ace" };

/** "Ah" -> "/cards/hearts-A.svg", "Td" -> "/cards/diamonds-10.svg"; null if unparseable. */
export function cardImagePath(cardStr) {
  if (!cardStr || cardStr.length < 2) return null;
  const rank = cardStr.slice(0, -1).toUpperCase();
  const suit = SUIT_NAMES[cardStr.slice(-1).toLowerCase()];
  const file = RANK_FILES[rank] || (/^[2-9]$/.test(rank) ? rank : null);
  if (!suit || !file) return null;
  return `/cards/${suit}-${file}.svg`;
}

function cardLabel(cardStr) {
  const rank = cardStr.slice(0, -1).toUpperCase();
  const suit = SUIT_NAMES[cardStr.slice(-1).toLowerCase()];
  return `${RANK_LABELS[rank] || rank} of ${suit || "?"}`;
}

const SIZES = {
  sm: "h-14",
  md: "h-20",
  lg: "h-28",
  // Shrinks on phones so five cards fit in a row.
  board: "h-[4.5rem] sm:h-28",
};

/**
 * A single playing card. Pass `card` like "Ah" or "Td"; omit it (or pass faceDown) to show the back.
 */
export default function PlayingCard({ card, faceDown = false, size = "md", className = "" }) {
  const height = SIZES[size] || SIZES.md;
  const src = !faceDown && card ? cardImagePath(card) : "/cards/back.svg";

  if (!src) {
    return (
      <span
        className={`inline-flex items-center justify-center aspect-[154/214] ${height} rounded-md bg-surface border border-edge text-sm text-ink ${className}`}
      >
        {card}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={faceDown || !card ? "Face-down card" : cardLabel(card)}
      title={faceDown || !card ? undefined : card}
      width={154}
      height={214}
      draggable={false}
      className={`${height} w-auto select-none ${className}`}
    />
  );
}

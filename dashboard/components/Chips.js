"use client";

/** Denominations with artwork in public/chips, largest first. */
export const CHIP_VALUES = [1000, 500, 100, 25, 10, 5, 1];

// The chip art is 260×266: a 260px face plus a 6px offset edge underneath.
const ASPECT = 266 / 260;

/** Splits an amount into the fewest chips: [{ value, count }], largest denomination first. */
export function chipBreakdown(amount) {
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  const out = [];
  for (const value of CHIP_VALUES) {
    const count = Math.floor(left / value);
    if (count) out.push({ value, count });
    left -= count * value;
  }
  return out;
}

/** A single chip seen from above. */
export function Chip({ value, size = 24, className = "", style }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/chips/chip-${value}.svg`}
      alt=""
      width={size}
      height={Math.round(size * ASPECT)}
      draggable={false}
      className={`select-none ${className}`}
      style={style}
    />
  );
}

/**
 * An amount drawn as one pile per denomination with a ×count under it. A pile shows up to
 * three chips slightly offset so the top face stays readable. Only the `maxPiles` largest
 * denominations are drawn, so show the exact number next to it.
 */
export default function ChipStack({ amount, size = 40, maxPiles = 4, className = "" }) {
  const piles = chipBreakdown(amount).slice(0, maxPiles);
  if (!piles.length) return null;
  const step = Math.max(2, Math.round(size * 0.07));
  const faceH = Math.round(size * ASPECT);

  return (
    <span
      role="img"
      aria-label={`${Number(amount).toLocaleString()} in chips`}
      className={`inline-flex items-end ${className}`}
      style={{ gap: Math.round(size * 0.25) }}
    >
      {piles.map(({ value, count }) => {
        const n = Math.min(count, 3);
        return (
          <span key={value} className="inline-flex flex-col items-center gap-1" title={`${count} × ${value}`}>
            <span className="relative inline-block flex-shrink-0" style={{ width: size, height: faceH + (n - 1) * step }}>
              {Array.from({ length: n }, (_, i) => (
                <Chip key={i} value={value} size={size} className="absolute left-0" style={{ top: (n - 1 - i) * step }} />
              ))}
            </span>
            <span className="text-[10px] leading-none text-muted tabular-nums">×{count}</span>
          </span>
        );
      })}
    </span>
  );
}

import type { Suit } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export function SuitIcon({
  suit,
  className,
  inverse,
}: {
  suit: Suit;
  className?: string;
  inverse?: boolean;
}) {
  const cls = cn("suit-glyph", inverse ? "text-cream" : `suit-${suit.toLowerCase()}`, className);

  if (suit === "S") {
    // Inverted heart (two lobes + point) plus a short pedestal — reads as ♠ at small sizes.
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden overflow="visible">
        <circle cx="8" cy="14.7" r="5.75" />
        <circle cx="16" cy="14.7" r="5.75" />
        <polygon points="2.5,13.9 12,1.0 21.5,13.9" />
        <path d="M10.6 19.4h2.8v2l3.3 2.5H7.3l3.3-2.5z" />
      </svg>
    );
  }
  if (suit === "H") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden overflow="visible">
        <circle cx="8" cy="8.85" r="5.75" />
        <circle cx="16" cy="8.85" r="5.75" />
        <polygon points="2.5,9.5 12,23.2 21.5,9.5" />
      </svg>
    );
  }
  if (suit === "D") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <polygon points="12,1.2 21.3,12 12,22.8 2.7,12" />
      </svg>
    );
  }
  // Three round lobes with deep notches + pedestal — reads as ♣ at small sizes.
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden overflow="visible">
      <path d="M12 .6C8.6.6 6.2 3.2 6.2 6.4c0 1.8.8 3.3 2 4.3-2-.5-4.4.5-5.6 2.5-1.4 2.4-.8 5.6 1.6 7.2 2 1.3 4.6.8 6.2-.8v.8L8.2 23.4h7.6L13.6 20.4v-.8c1.6 1.6 4.2 2.1 6.2.8 2.4-1.6 3-4.8 1.6-7.2-1.2-2-3.6-3-5.6-2.5 1.2-1 2-2.5 2-4.3C17.8 3.2 15.4.6 12 .6z" />
    </svg>
  );
}

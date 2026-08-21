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
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <path d="M12 2C9 8 3.5 10.5 3.5 15.2c0 3 2.4 5.3 5.4 5.3 1.2 0 2.2-.3 3.1-1v2.5h3V19.5c.9.7 1.9 1 3.1 1 3 0 5.4-2.3 5.4-5.3C20.5 10.5 15 8 12 2z" />
      </svg>
    );
  }
  if (suit === "H") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <path d="M12 21S3 14.2 3 8.6C3 5.5 5.5 3 8.5 3c1.8 0 3.4.9 4.5 2.3C14.1 3.9 15.7 3 17.5 3 20.5 3 23 5.5 23 8.6 23 14.2 12 21 12 21z" />
      </svg>
    );
  }
  if (suit === "D") {
    return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <path d="M12 2 L21 12 L12 22 L3 12 Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden>
      <path d="M12 3c-2.4 3.2-5.6 5.3-5.6 8.3 0 1.6 1.1 2.8 2.6 3.2-.9.6-1.5 1.6-1.5 2.8 0 .4.1.8.2 1.1H7v2h10v-2h-.7c.1-.3.2-.7.2-1.1 0-1.2-.6-2.2-1.5-2.8 1.5-.4 2.6-1.6 2.6-3.2 0-3-3.2-5.1-5.6-8.3z" />
    </svg>
  );
}

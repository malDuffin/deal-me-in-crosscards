import { useLayoutEffect, useRef } from "react";
import { attachPooledCard, parkPooledCard } from "@/lib/game/card-pool";
import { useSettings } from "@/lib/game/settings";
import type { Card, CardStyle } from "@/lib/game/types";
import { cn } from "@/lib/utils";

/** Play-table card visual. Reuses a 52-face pool instead of remounting faces. */
export function PooledCardFace({
  card,
  className,
  dimmed,
  tray,
  style = "classic",
  active = true,
}: {
  card: Card;
  className?: string;
  dimmed?: boolean;
  tray?: boolean;
  style?: CardStyle;
  active?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const colorblind = useSettings((s) => s.colorblind);
  const gold = tray || !card.fixed;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !active) return;
    attachPooledCard(host, card.rank, card.suit, {
      gold,
      dimmed: !!dimmed,
      style,
      colorblind,
    });
    return () => parkPooledCard(card.rank, card.suit, host);
  }, [active, card.rank, card.suit, gold, dimmed, style, colorblind]);

  return <div ref={hostRef} className={cn("h-full w-full", className)} />;
}

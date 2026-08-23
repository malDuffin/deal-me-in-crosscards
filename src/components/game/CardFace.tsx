import type { Card, CardStyle } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";
import { SuitIcon } from "./SuitIcon";

export function CardFace({
  card,
  className,
  dimmed,
  tray,
  style = "classic",
}: {
  card: Card;
  className?: string;
  dimmed?: boolean;
  tray?: boolean;
  style?: CardStyle;
}) {
  const suitClass = `suit-${card.suit.toLowerCase()}`;
  const playable = tray || !card.fixed;

  if (style === "realistic") {
    return (
      <div
        className={cn(
          "relative h-full w-full rounded-[4px]",
          playable && "card-playable",
          dimmed && "opacity-80",
          className,
        )}
      >
        <PlayingCard rank={card.rank} suit={card.suit} gold={playable} />
        {card.fixed ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink/20" /> : null}
      </div>
    );
  }

  if (style === "large") {
    const redSuit = card.suit === "H" || card.suit === "D";
    return (
      <div
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden rounded-[4px] card-shadow card-large",
          playable ? "card-playable" : null,
          playable
            ? redSuit
              ? "card-large-gold-red"
              : "card-large-gold-black"
            : redSuit
              ? "card-large-cream-red"
              : "card-large-cream-black",
          dimmed && "opacity-80",
          className,
        )}
      >
        <div className={cn("grid flex-1 place-items-center pt-[4%]", suitClass)}>
          <span className="font-display text-[1.55em] font-bold leading-none tracking-tight">
            {card.rank}
          </span>
        </div>
        <div
          className={cn(
            "grid h-[48%] place-items-center",
            `suit-bar-${card.suit.toLowerCase()}`,
          )}
        >
          <SuitIcon suit={card.suit} inverse className="size-[88%]" />
        </div>
        {card.fixed ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink/20" /> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col justify-between rounded-[4px] px-[7%] py-[6%] card-shadow",
        playable ? "card-playable bg-gold" : "bg-cream",
        dimmed && "opacity-80",
        suitClass,
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="font-display text-[1.26em] font-semibold leading-none tracking-tight">
          {card.rank}
        </span>
        <SuitIcon suit={card.suit} className="mt-px size-[0.9em]" />
      </div>
      <div className="grid flex-1 place-items-center">
        <SuitIcon suit={card.suit} className="size-[46%]" />
      </div>
      <div className="flex rotate-180 items-start justify-between">
        <span className="font-display text-[1.26em] font-semibold leading-none tracking-tight">
          {card.rank}
        </span>
        <SuitIcon suit={card.suit} className="mt-px size-[0.9em]" />
      </div>
      {card.fixed ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink/20" /> : null}
    </div>
  );
}

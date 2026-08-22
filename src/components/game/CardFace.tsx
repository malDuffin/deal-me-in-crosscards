import type { Card, CardStyle, Rank, Suit } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { SuitIcon } from "./SuitIcon";

type Pip = { x: number; y: number; flip?: boolean };

const L = 26;
const R = 74;
const C = 50;

const PIP_LAYOUT: Partial<Record<Rank, Pip[]>> = {
  A: [{ x: C, y: 50 }],
  "2": [
    { x: C, y: 16 },
    { x: C, y: 84, flip: true },
  ],
  "3": [
    { x: C, y: 16 },
    { x: C, y: 50 },
    { x: C, y: 84, flip: true },
  ],
  "4": [
    { x: L, y: 18 },
    { x: R, y: 18 },
    { x: L, y: 82, flip: true },
    { x: R, y: 82, flip: true },
  ],
  "5": [
    { x: L, y: 18 },
    { x: R, y: 18 },
    { x: C, y: 50 },
    { x: L, y: 82, flip: true },
    { x: R, y: 82, flip: true },
  ],
  "6": [
    { x: L, y: 16 },
    { x: R, y: 16 },
    { x: L, y: 50 },
    { x: R, y: 50 },
    { x: L, y: 84, flip: true },
    { x: R, y: 84, flip: true },
  ],
  "7": [
    { x: L, y: 16 },
    { x: R, y: 16 },
    { x: C, y: 33 },
    { x: L, y: 50 },
    { x: R, y: 50 },
    { x: L, y: 84, flip: true },
    { x: R, y: 84, flip: true },
  ],
  "8": [
    { x: L, y: 16 },
    { x: R, y: 16 },
    { x: C, y: 33 },
    { x: L, y: 50 },
    { x: R, y: 50 },
    { x: C, y: 67, flip: true },
    { x: L, y: 84, flip: true },
    { x: R, y: 84, flip: true },
  ],
  "9": [
    { x: L, y: 14 },
    { x: R, y: 14 },
    { x: L, y: 38 },
    { x: R, y: 38 },
    { x: C, y: 50 },
    { x: L, y: 62, flip: true },
    { x: R, y: 62, flip: true },
    { x: L, y: 86, flip: true },
    { x: R, y: 86, flip: true },
  ],
  "10": [
    { x: L, y: 12 },
    { x: R, y: 12 },
    { x: C, y: 24 },
    { x: L, y: 36 },
    { x: R, y: 36 },
    { x: L, y: 64, flip: true },
    { x: R, y: 64, flip: true },
    { x: C, y: 76, flip: true },
    { x: L, y: 88, flip: true },
    { x: R, y: 88, flip: true },
  ],
};

function pipSize(rank: Rank) {
  if (rank === "A") return "42%";
  if (rank === "10" || rank === "9") return "17%";
  if (rank === "7" || rank === "8") return "19%";
  return "22%";
}

function RankPips({ rank, suit }: { rank: Rank; suit: Suit }) {
  if (rank === "J" || rank === "Q" || rank === "K") {
    return (
      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="flex flex-col items-center leading-none">
          <span className="font-display text-[1.05em] font-bold">{rank}</span>
          <SuitIcon suit={suit} className="mt-[6%] size-[0.72em]" />
        </div>
      </div>
    );
  }
  const spots = PIP_LAYOUT[rank] ?? [{ x: C, y: 50 }];
  const size = pipSize(rank);
  return (
    <div className="relative min-h-0 flex-1">
      {spots.map((p, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: size,
            height: size,
            transform: `translate(-50%, -50%)${p.flip ? " rotate(180deg)" : ""}`,
          }}
        >
          <SuitIcon suit={suit} className="size-full" />
        </span>
      ))}
    </div>
  );
}

function Index({ rank, suit }: { rank: Rank; suit: Suit }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="font-display text-[0.72em] font-bold">{rank}</span>
      <SuitIcon suit={suit} className="mt-[1px] size-[0.52em]" />
    </div>
  );
}

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

  if (style === "large") {
    return (
      <div
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden rounded-[4px] card-shadow",
          playable ? "bg-gold" : "bg-cream",
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

  if (style === "realistic") {
    return (
      <div
        className={cn(
          "relative flex h-full w-full flex-col rounded-[4px] border border-ink/15 px-[5%] py-[4%] card-shadow",
          playable ? "bg-gold" : "bg-cream",
          dimmed && "opacity-80",
          suitClass,
          className,
        )}
      >
        <div className="flex justify-start">
          <Index rank={card.rank} suit={card.suit} />
        </div>
        <RankPips rank={card.rank} suit={card.suit} />
        <div className="flex justify-start rotate-180">
          <Index rank={card.rank} suit={card.suit} />
        </div>
        {card.fixed ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink/20" /> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col justify-between rounded-[4px] px-[7%] py-[6%] card-shadow",
        playable ? "bg-gold" : "bg-cream",
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

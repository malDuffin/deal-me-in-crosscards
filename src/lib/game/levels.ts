import imported from "./imported-levels.json";
import { deal } from "./deck";
import { BOARD_SIZE, type Campaign, type Level, type Rank, type Suit } from "./types";

type RawLevel = {
  id: string;
  campaign: Campaign;
  name: string;
  number: number;
  briefing: string;
  grid: number;
  group?: string;
  blocked: { r: number; c: number }[];
  fixed: { r: number; c: number; rank: string; suit: string }[];
  hand: { rank: string; suit: string }[];
  targets: { r: number; c: number; rank: string; suit: string }[];
  win: Level["win"];
};

function asRank(r: string): Rank {
  return r as Rank;
}
function asSuit(s: string): Suit {
  return s as Suit;
}

function hydrate(raw: RawLevel): Level {
  return {
    id: raw.id,
    campaign: raw.campaign,
    name: raw.name,
    number: raw.number,
    briefing: raw.briefing,
    grid: raw.grid,
    group: raw.group,
    blocked: raw.blocked,
    fixed: raw.fixed.map((f) => ({ r: f.r, c: f.c, rank: asRank(f.rank), suit: asSuit(f.suit) })),
    hand: raw.hand.map((h) => ({ rank: asRank(h.rank), suit: asSuit(h.suit) })),
    targets: raw.targets.map((t) => ({
      r: t.r,
      c: t.c,
      rank: asRank(t.rank),
      suit: asSuit(t.suit),
    })),
    win: raw.win,
  };
}

const ALL = (imported as RawLevel[]).map(hydrate);

export const HOWTO_LEVELS = ALL.filter((l) => l.campaign === "howto");
export const TRAINING_LEVELS = ALL.filter((l) => l.campaign === "training");
export const PUZZLE_LEVELS = ALL.filter((l) => l.campaign === "puzzle");

export function makeFreeLevel(): Level {
  return {
    id: "free",
    campaign: "free",
    name: "Free Play",
    number: 0,
    briefing: "Twelve cards on an 11×11 table. Place them all and chase the highest score.",
    grid: BOARD_SIZE,
    hand: deal(12),
    win: { allPlaced: true },
  };
}

export function levelsFor(campaign: Campaign): Level[] {
  if (campaign === "howto") return HOWTO_LEVELS;
  if (campaign === "training") return TRAINING_LEVELS;
  if (campaign === "puzzle") return PUZZLE_LEVELS;
  return [];
}

export function findLevel(campaign: Campaign, id?: string): Level {
  if (campaign === "free") return makeFreeLevel();
  if (campaign === "endless") return makeFreeLevel();
  const list = levelsFor(campaign);
  return list.find((l) => l.id === id) ?? list[0];
}

export function nextLevel(level: Level): Level | null {
  const list = levelsFor(level.campaign);
  const i = list.findIndex((l) => l.id === level.id);
  if (i < 0 || i >= list.length - 1) return null;
  return list[i + 1];
}

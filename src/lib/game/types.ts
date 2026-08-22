export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number];

export type Card = {
  id: string;
  rank: Rank;
  suit: Suit;
  fixed?: boolean;
};

export type Cell = { r: number; c: number };

export type Placement = Record<string, Cell | "tray">;

export type Campaign = "howto" | "training" | "puzzle" | "free" | "endless" | "custom";

export type Difficulty = "beginner" | "easy" | "medium" | "hard" | "expert";

export type CardStyle = "large" | "classic" | "realistic";

export type HandName =
  | "Pair"
  | "Two Pair"
  | "Three of a Kind"
  | "Straight"
  | "Flush"
  | "Full House"
  | "Four of a Kind"
  | "Straight Flush"
  | "Royal Flush";

export type DetectedHand = {
  name: HandName;
  score: number;
  cells: Cell[];
  cardIds: string[];
  axis: "row" | "col";
  index: number;
};

export type WinCondition = {
  allPlaced: boolean;
  minScore?: number;
  any?: HandName[];
  all?: HandName[];
  pairCountsAsTwoPair?: boolean;
  /** Win only when each hand card sits on its original solution cell. */
  exactTargets?: boolean;
  /** Every placed card must belong to a scoring poker run. */
  allScore?: boolean;
};

export type Level = {
  id: string;
  campaign: Campaign;
  name: string;
  number: number;
  briefing: string;
  grid: number;
  group?: string;
  blocked?: Cell[];
  fixed?: { r: number; c: number; rank: Rank; suit: Suit }[];
  hand: { rank: Rank; suit: Suit }[];
  targets?: { r: number; c: number; rank: Rank; suit: Suit }[];
  win: WinCondition;
};

export const HAND_SCORES: Record<HandName, number> = {
  Pair: 10,
  "Two Pair": 25,
  "Three of a Kind": 30,
  Straight: 50,
  Flush: 60,
  "Full House": 80,
  "Four of a Kind": 100,
  "Straight Flush": 150,
  "Royal Flush": 250,
};

export const HAND_RANK: Record<HandName, number> = {
  Pair: 1,
  "Two Pair": 2,
  "Three of a Kind": 3,
  Straight: 4,
  Flush: 5,
  "Full House": 6,
  "Four of a Kind": 7,
  "Straight Flush": 8,
  "Royal Flush": 9,
};

export const BOARD_SIZE = 11;
export const CELL_W = 34;
export const CELL_H = 48;
export const CELL_GAP = 2;
export const BOARD_PAD = 10;
export const BOARD_RAIL = 7;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

/** Ordered list for UI pickers (easiest → hardest). */
export const DIFFICULTY_ORDER: Difficulty[] = [
  "beginner",
  "easy",
  "medium",
  "hard",
  "expert",
];

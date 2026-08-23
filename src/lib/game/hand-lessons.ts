import { HAND_SCORES, type HandName, type Rank, type Suit } from "./types";

export type LessonCard = { rank: Rank; suit: Suit };

export type HandLesson = {
  name: HandName;
  blurb: string;
  score: number;
  examples: LessonCard[][];
};

export const HAND_LESSONS: Record<HandName, HandLesson> = {
  Pair: {
    name: "Pair",
    blurb: "Two cards of the same rank sitting side by side. Suits can be anything.",
    score: HAND_SCORES.Pair,
    examples: [
      [
        { rank: "A", suit: "H" },
        { rank: "A", suit: "S" },
      ],
      [
        { rank: "7", suit: "C" },
        { rank: "7", suit: "D" },
      ],
      [
        { rank: "K", suit: "H" },
        { rank: "K", suit: "D" },
      ],
      [
        { rank: "10", suit: "S" },
        { rank: "10", suit: "C" },
      ],
    ],
  },
  "Two Pair": {
    name: "Two Pair",
    blurb: "Two different pairs in the same line, each pair sitting as a block — like 9-9-4-4, not 9-4-9-4.",
    score: HAND_SCORES["Two Pair"],
    examples: [
      [
        { rank: "9", suit: "H" },
        { rank: "9", suit: "S" },
        { rank: "4", suit: "C" },
        { rank: "4", suit: "D" },
      ],
      [
        { rank: "A", suit: "D" },
        { rank: "A", suit: "C" },
        { rank: "K", suit: "H" },
        { rank: "K", suit: "S" },
      ],
      [
        { rank: "8", suit: "S" },
        { rank: "8", suit: "H" },
        { rank: "2", suit: "D" },
        { rank: "2", suit: "C" },
      ],
      [
        { rank: "Q", suit: "C" },
        { rank: "Q", suit: "D" },
        { rank: "J", suit: "S" },
        { rank: "J", suit: "H" },
      ],
    ],
  },
  "Three of a Kind": {
    name: "Three of a Kind",
    blurb: "Three cards of the same rank in a row. The fourth suit is left in the deck.",
    score: HAND_SCORES["Three of a Kind"],
    examples: [
      [
        { rank: "J", suit: "H" },
        { rank: "J", suit: "S" },
        { rank: "J", suit: "D" },
      ],
      [
        { rank: "5", suit: "C" },
        { rank: "5", suit: "H" },
        { rank: "5", suit: "S" },
      ],
      [
        { rank: "A", suit: "S" },
        { rank: "A", suit: "H" },
        { rank: "A", suit: "C" },
      ],
      [
        { rank: "8", suit: "D" },
        { rank: "8", suit: "C" },
        { rank: "8", suit: "H" },
      ],
    ],
  },
  Straight: {
    name: "Straight",
    blurb: "Five ranks in order, any mix of suits. Ace can be high (10–A) or low (A–5).",
    score: HAND_SCORES.Straight,
    examples: [
      [
        { rank: "5", suit: "H" },
        { rank: "6", suit: "C" },
        { rank: "7", suit: "D" },
        { rank: "8", suit: "S" },
        { rank: "9", suit: "H" },
      ],
      [
        { rank: "10", suit: "S" },
        { rank: "J", suit: "D" },
        { rank: "Q", suit: "C" },
        { rank: "K", suit: "H" },
        { rank: "A", suit: "S" },
      ],
      [
        { rank: "A", suit: "C" },
        { rank: "2", suit: "H" },
        { rank: "3", suit: "S" },
        { rank: "4", suit: "D" },
        { rank: "5", suit: "C" },
      ],
      [
        { rank: "8", suit: "D" },
        { rank: "9", suit: "S" },
        { rank: "10", suit: "H" },
        { rank: "J", suit: "C" },
        { rank: "Q", suit: "D" },
      ],
    ],
  },
  Flush: {
    name: "Flush",
    blurb: "Five cards of the same suit. Ranks can jump around — they don't need to be in order.",
    score: HAND_SCORES.Flush,
    examples: [
      [
        { rank: "A", suit: "H" },
        { rank: "9", suit: "H" },
        { rank: "6", suit: "H" },
        { rank: "4", suit: "H" },
        { rank: "2", suit: "H" },
      ],
      [
        { rank: "K", suit: "S" },
        { rank: "J", suit: "S" },
        { rank: "8", suit: "S" },
        { rank: "5", suit: "S" },
        { rank: "3", suit: "S" },
      ],
      [
        { rank: "Q", suit: "D" },
        { rank: "10", suit: "D" },
        { rank: "7", suit: "D" },
        { rank: "4", suit: "D" },
        { rank: "2", suit: "D" },
      ],
      [
        { rank: "A", suit: "C" },
        { rank: "K", suit: "C" },
        { rank: "9", suit: "C" },
        { rank: "6", suit: "C" },
        { rank: "3", suit: "C" },
      ],
    ],
  },
  "Full House": {
    name: "Full House",
    blurb: "Three of a kind plus a pair in the same line — like K-K-K-5-5. Keep each rank in its own block.",
    score: HAND_SCORES["Full House"],
    examples: [
      [
        { rank: "K", suit: "H" },
        { rank: "K", suit: "S" },
        { rank: "K", suit: "D" },
        { rank: "5", suit: "C" },
        { rank: "5", suit: "H" },
      ],
      [
        { rank: "9", suit: "C" },
        { rank: "9", suit: "D" },
        { rank: "A", suit: "S" },
        { rank: "A", suit: "H" },
        { rank: "A", suit: "C" },
      ],
      [
        { rank: "Q", suit: "S" },
        { rank: "Q", suit: "H" },
        { rank: "Q", suit: "C" },
        { rank: "2", suit: "D" },
        { rank: "2", suit: "S" },
      ],
      [
        { rank: "7", suit: "D" },
        { rank: "7", suit: "C" },
        { rank: "J", suit: "H" },
        { rank: "J", suit: "S" },
        { rank: "J", suit: "D" },
      ],
    ],
  },
  "Four of a Kind": {
    name: "Four of a Kind",
    blurb: "All four suits of one rank in a row. There is no fifth copy in the deck.",
    score: HAND_SCORES["Four of a Kind"],
    examples: [
      [
        { rank: "5", suit: "H" },
        { rank: "5", suit: "S" },
        { rank: "5", suit: "D" },
        { rank: "5", suit: "C" },
      ],
      [
        { rank: "A", suit: "S" },
        { rank: "A", suit: "H" },
        { rank: "A", suit: "C" },
        { rank: "A", suit: "D" },
      ],
      [
        { rank: "Q", suit: "D" },
        { rank: "Q", suit: "C" },
        { rank: "Q", suit: "H" },
        { rank: "Q", suit: "S" },
      ],
      [
        { rank: "8", suit: "C" },
        { rank: "8", suit: "S" },
        { rank: "8", suit: "H" },
        { rank: "8", suit: "D" },
      ],
    ],
  },
  "Straight Flush": {
    name: "Straight Flush",
    blurb: "Five cards in rank order, all the same suit. Stronger than a plain straight or flush.",
    score: HAND_SCORES["Straight Flush"],
    examples: [
      [
        { rank: "6", suit: "C" },
        { rank: "7", suit: "C" },
        { rank: "8", suit: "C" },
        { rank: "9", suit: "C" },
        { rank: "10", suit: "C" },
      ],
      [
        { rank: "A", suit: "H" },
        { rank: "2", suit: "H" },
        { rank: "3", suit: "H" },
        { rank: "4", suit: "H" },
        { rank: "5", suit: "H" },
      ],
      [
        { rank: "9", suit: "S" },
        { rank: "10", suit: "S" },
        { rank: "J", suit: "S" },
        { rank: "Q", suit: "S" },
        { rank: "K", suit: "S" },
      ],
      [
        { rank: "3", suit: "D" },
        { rank: "4", suit: "D" },
        { rank: "5", suit: "D" },
        { rank: "6", suit: "D" },
        { rank: "7", suit: "D" },
      ],
    ],
  },
  "Royal Flush": {
    name: "Royal Flush",
    blurb: "10, Jack, Queen, King and Ace of the same suit — the best hand on the felt.",
    score: HAND_SCORES["Royal Flush"],
    examples: [
      [
        { rank: "10", suit: "H" },
        { rank: "J", suit: "H" },
        { rank: "Q", suit: "H" },
        { rank: "K", suit: "H" },
        { rank: "A", suit: "H" },
      ],
      [
        { rank: "10", suit: "S" },
        { rank: "J", suit: "S" },
        { rank: "Q", suit: "S" },
        { rank: "K", suit: "S" },
        { rank: "A", suit: "S" },
      ],
      [
        { rank: "10", suit: "D" },
        { rank: "J", suit: "D" },
        { rank: "Q", suit: "D" },
        { rank: "K", suit: "D" },
        { rank: "A", suit: "D" },
      ],
      [
        { rank: "10", suit: "C" },
        { rank: "J", suit: "C" },
        { rank: "Q", suit: "C" },
        { rank: "K", suit: "C" },
        { rank: "A", suit: "C" },
      ],
    ],
  },
};

const HAND_NAMES = Object.keys(HAND_LESSONS) as HandName[];

export function lessonFor(name: string | undefined): HandLesson | null {
  if (!name) return null;
  return HAND_NAMES.includes(name as HandName) ? HAND_LESSONS[name as HandName] : null;
}

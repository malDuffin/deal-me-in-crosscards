import type { Suit } from "./types";

/** Cream/white board cards — matching reds and matching blacks. */
export const CREAM_SUIT: Record<Suit, string> = {
  S: "#12140f",
  H: "#b4232c",
  D: "#b4232c",
  C: "#12140f",
};

/**
 * Gold/player cards — slightly split reds and blacks so hearts≠diamonds
 * and spades≠clubs still read on yellow.
 */
export const GOLD_SUIT: Record<Suit, string> = {
  S: "#101210",
  H: "#be1028",
  D: "#e24a0c",
  C: "#1f4a32",
};

export const COLORBLIND_SUIT: Record<Suit, string> = {
  S: "#111111",
  H: "#e69f00",
  D: "#56b4e9",
  C: "#009e73",
};

export const CARD_GOLD = "#e8c547";
export const CARD_CREAM = "#efe7d6";

export function suitInkCsv(map: Record<Suit, string>) {
  return `${map.S},${map.H},${map.D},${map.C}`;
}

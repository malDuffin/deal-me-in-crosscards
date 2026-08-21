import { RANKS, SUITS, type Card, type Rank, type Suit } from "./types";

export function makeCard(rank: Rank, suit: Suit, index: number, fixed = false): Card {
  return { id: `${rank}${suit}-${index}`, rank, suit, fixed };
}

export function fullDeck(): { rank: Rank; suit: Suit }[] {
  const d: { rank: Rank; suit: Suit }[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) d.push({ rank, suit });
  }
  return d;
}

export function fisherYates<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deal(count: number): { rank: Rank; suit: Suit }[] {
  return fisherYates(fullDeck()).slice(0, count);
}

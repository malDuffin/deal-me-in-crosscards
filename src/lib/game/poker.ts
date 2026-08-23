import {
  HAND_SCORES,
  RANKS,
  type Card,
  type Cell,
  type DetectedHand,
  type HandName,
  type Placement,
} from "./types";

const ACE_LOW = RANKS;
const ACE_HIGH = [
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
  "A",
] as const;

function rankCounts(cards: Card[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  return m;
}

function isFlush(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const s = cards[0].suit;
  return cards.every((c) => c.suit === s);
}

function isStraight(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const ranks = cards.map((c) => c.rank);
  if (new Set(ranks).size !== ranks.length) return false;

  const sequential = (order: readonly string[]) => {
    const idxs = ranks.map((r) => order.indexOf(r)).sort((a, b) => a - b);
    if (idxs.some((i) => i < 0)) return false;
    for (let i = 1; i < idxs.length; i++) {
      if (idxs[i] !== idxs[i - 1] + 1) return false;
    }
    return true;
  };

  if (sequential(ACE_LOW) || sequential(ACE_HIGH)) return true;
  if (
    ranks.includes("A") &&
    ranks.includes("2") &&
    ranks.includes("3") &&
    ranks.includes("4") &&
    ranks.includes("5")
  ) {
    return true;
  }
  return false;
}

function isRoyal(cards: Card[]): boolean {
  if (cards.length !== 5 || !isFlush(cards)) return false;
  const set = new Set(cards.map((c) => c.rank));
  return (["10", "J", "Q", "K", "A"] as const).every((r) => set.has(r));
}

/** Same ranks in a run must sit in one block (7-7-A-A yes, 7-A-7-A no). */
function ranksGrouped(cards: Card[]): boolean {
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  const n = new Map<string, number>();
  cards.forEach((c, i) => {
    if (!first.has(c.rank)) first.set(c.rank, i);
    last.set(c.rank, i);
    n.set(c.rank, (n.get(c.rank) ?? 0) + 1);
  });
  for (const [rank, count] of n) {
    if (last.get(rank)! - first.get(rank)! + 1 !== count) return false;
  }
  return true;
}

/** Evaluate a consecutive run as a single poker hand (original CrossCards rule). */
export function evaluateRun(cards: Card[]): { name: HandName; score: number } | null {
  const n = cards.length;
  if (n < 2 || n > 5) return null;

  const counts = [...rankCounts(cards).values()].sort((a, b) => b - a);
  const flush = isFlush(cards);
  const straight = isStraight(cards);
  const grouped = ranksGrouped(cards);

  if (n === 5) {
    if (isRoyal(cards)) return { name: "Royal Flush", score: HAND_SCORES["Royal Flush"] };
    if (flush && straight) {
      return { name: "Straight Flush", score: HAND_SCORES["Straight Flush"] };
    }
  }

  if (!grouped) {
    if (n === 5 && flush) return { name: "Flush", score: HAND_SCORES.Flush };
    if (n === 5 && straight) return { name: "Straight", score: HAND_SCORES.Straight };
    return null;
  }

  if (n === 2) {
    if (counts[0] === 2) return { name: "Pair", score: HAND_SCORES.Pair };
    return null;
  }

  if (n === 3) {
    if (counts[0] === 3) {
      return { name: "Three of a Kind", score: HAND_SCORES["Three of a Kind"] };
    }
    return null;
  }

  if (n === 4) {
    if (counts[0] === 4) {
      return { name: "Four of a Kind", score: HAND_SCORES["Four of a Kind"] };
    }
    if (counts[0] === 2 && counts[1] === 2) {
      return { name: "Two Pair", score: HAND_SCORES["Two Pair"] };
    }
    if (counts[0] === 3) {
      return { name: "Three of a Kind", score: HAND_SCORES["Three of a Kind"] };
    }
    return null;
  }

  // n === 5 — only true 5-card poker hands (no pair/trips with kickers)
  if (counts[0] === 3 && counts[1] === 2) {
    return { name: "Full House", score: HAND_SCORES["Full House"] };
  }
  if (flush) return { name: "Flush", score: HAND_SCORES.Flush };
  if (straight) return { name: "Straight", score: HAND_SCORES.Straight };
  return null;
}

function collectRuns(
  rows: number,
  cols: number,
  blocked: Set<string>,
  occupier: (r: number, c: number) => Card | null,
  axis: "row" | "col",
): { cards: Card[]; cells: Cell[]; axis: "row" | "col"; index: number }[] {
  const runs: { cards: Card[]; cells: Cell[]; axis: "row" | "col"; index: number }[] =
    [];
  const outer = axis === "row" ? rows : cols;
  const inner = axis === "row" ? cols : rows;

  for (let i = 0; i < outer; i++) {
    let currentCards: Card[] = [];
    let currentCells: Cell[] = [];
    const flushRun = () => {
      if (currentCards.length >= 2) {
        runs.push({
          cards: currentCards,
          cells: currentCells,
          axis,
          index: i,
        });
      }
      currentCards = [];
      currentCells = [];
    };

    for (let j = 0; j < inner; j++) {
      const r = axis === "row" ? i : j;
      const c = axis === "row" ? j : i;
      const key = `${r},${c}`;
      if (blocked.has(key)) {
        flushRun();
        continue;
      }
      const card = occupier(r, c);
      if (card) {
        currentCards.push(card);
        currentCells.push({ r, c });
      } else {
        flushRun();
      }
    }
    flushRun();
  }
  return runs;
}

export function scanBoard(
  cols: number,
  blocked: Set<string>,
  placements: Placement,
  cardsById: Map<string, Card>,
  rows = cols,
): DetectedHand[] {
  const cellToCard = new Map<string, Card>();
  for (const [id, pos] of Object.entries(placements)) {
    if (pos === "tray") continue;
    const card = cardsById.get(id);
    if (!card) continue;
    cellToCard.set(`${pos.r},${pos.c}`, card);
  }

  const occupier = (r: number, c: number) => cellToCard.get(`${r},${c}`) ?? null;
  const runs = [
    ...collectRuns(rows, cols, blocked, occupier, "row"),
    ...collectRuns(rows, cols, blocked, occupier, "col"),
  ];

  const detected: DetectedHand[] = [];
  for (const run of runs) {
    const hand = evaluateRun(run.cards);
    if (!hand) continue;
    detected.push({
      name: hand.name,
      score: hand.score,
      cells: run.cells,
      cardIds: run.cards.map((c) => c.id),
      axis: run.axis,
      index: run.index,
    });
  }
  return detected;
}

export function totalScore(hands: DetectedHand[]): number {
  return hands.reduce((s, h) => s + h.score, 0);
}

export function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

/** Consecutive occupied stretches of 2+ cells, used for How-to example labels. */
export function collectOccupiedRuns(
  cols: number,
  occupied: Set<string>,
  rows = cols,
): { cells: Cell[]; axis: "row" | "col" }[] {
  const out: { cells: Cell[]; axis: "row" | "col" }[] = [];
  for (const axis of ["row", "col"] as const) {
    const outer = axis === "row" ? rows : cols;
    const inner = axis === "row" ? cols : rows;
    for (let i = 0; i < outer; i++) {
      let cells: Cell[] = [];
      const flush = () => {
        if (cells.length >= 2) out.push({ cells, axis });
        cells = [];
      };
      for (let j = 0; j < inner; j++) {
        const r = axis === "row" ? i : j;
        const c = axis === "row" ? j : i;
        if (occupied.has(`${r},${c}`)) cells.push({ r, c });
        else flush();
      }
      flush();
    }
  }
  return out;
}

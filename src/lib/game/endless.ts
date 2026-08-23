import { fisherYates } from "./deck";
import { evaluateRun } from "./poker";
import {
  BOARD_SIZE, BOARD_SIZE_MAX, BOARD_SIZE_MIN, RANKS, SUITS,
  type Card, type Cell, type Difficulty, type Level, type Rank, type Suit,
} from "./types";

type RS = { rank: Rank; suit: Suit };
type Placed = { r: number; c: number; rank: Rank; suit: Suit; target: boolean };

export type BoardShape = { rows: number; cols: number };

const DEFAULT_SHAPE: BoardShape = { rows: BOARD_SIZE, cols: BOARD_SIZE };
const shapeStack: BoardShape[] = [DEFAULT_SHAPE];
function shape(): BoardShape {
  return shapeStack[shapeStack.length - 1] ?? DEFAULT_SHAPE;
}
function rows(): number {
  return shape().rows;
}
function cols(): number {
  return shape().cols;
}
function centreR(): number {
  return Math.floor(rows() / 2);
}
function centreC(): number {
  return Math.floor(cols() / 2);
}
function withShape<T>(s: BoardShape, fn: () => T): T {
  shapeStack.push(s);
  try {
    return fn();
  } finally {
    shapeStack.pop();
  }
}

export function clampBoardSize(n: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return BOARD_SIZE;
  return Math.min(BOARD_SIZE_MAX, Math.max(BOARD_SIZE_MIN, v));
}

export function boardShapeOf(level: Pick<Level, "grid" | "rows">): BoardShape {
  const c = level.grid || BOARD_SIZE;
  return { cols: c, rows: level.rows || c };
}

type Recipe = "pair" | "three" | "twoPair" | "straight" | "flush" | "fullHouse" | "four";

/**
 * Endless difficulty — gold-seat ranges match the authored Puzzle campaign.
 *
 * Authored hand sizes (gold seats to place):
 *   Beginner 4–8 · Easy 11–15 · Medium 12–17 · Hard 16–25 · Expert 22–26
 *
 * Authored Easy+ boards are near-full decks (~52 cards). Endless mirrors that
 * density. Uniqueness for large hands uses pairwise swaps + time-budgeted
 * sampling (full n! is not feasible at 16–26 gold).
 *
 * Extra generation rules (Hard 8s bug):
 * - Kickers do not score: 7-7-8-10-10 is not a hand. evaluateRun already
 *   rejects that; everyCardInValidHand uses it.
 * - Stops close any run that cannot legally grow by one card.
 * - Gold seats that, against the *fixed* crossword alone, each force the same
 *   rank, must not demand more copies than the hand holds.
 *
 * | Tier     | Gold range | Goal | Min cards | Min runs | Recipes                              |
 * |----------|------------|------|-----------|----------|--------------------------------------|
 * | Beginner | 4–8        | 6    | 28        | 6        | pair, three                          |
 * | Easy     | 11–15      | 13   | 48        | 10       | + two pair                           |
 * | Medium   | 12–17      | 15   | 48        | 12       | + straight                           |
 * | Hard     | 16–25      | 19   | 48        | 14       | + flush, full house                  |
 * | Expert   | 22–26      | 24   | 46        | 15       | + four of a kind                     |
 */
const PARAMS: Record<
  Difficulty,
  {
    runs: number;
    targets: number;
    targetMin: number;
    targetMax: number;
    minCards: number;
    recipes: Recipe[];
  }
> = {
  beginner: {
    runs: 6,
    targets: 6,
    targetMin: 4,
    targetMax: 8,
    minCards: 28,
    recipes: ["pair", "pair", "three"],
  },
  easy: {
    runs: 10,
    targets: 13,
    targetMin: 11,
    targetMax: 15,
    minCards: 48,
    recipes: ["pair", "pair", "three", "twoPair"],
  },
  medium: {
    runs: 12,
    targets: 15,
    targetMin: 12,
    targetMax: 17,
    minCards: 48,
    recipes: ["pair", "three", "twoPair", "straight"],
  },
  hard: {
    runs: 14,
    targets: 19,
    targetMin: 16,
    targetMax: 25,
    minCards: 48,
    recipes: ["three", "twoPair", "straight", "flush", "fullHouse"],
  },
  expert: {
    runs: 15,
    targets: 24,
    targetMin: 22,
    targetMax: 26,
    // 50 was so tight Expert often failed every attempt and fell through
    // to the 2-card pair. 46 still reads as a near-full table.
    minCards: 46,
    recipes: ["straight", "flush", "fullHouse", "four", "twoPair", "three"],
  },
};

/** Minimum gold seats an Endless table must keep for its difficulty label. */
const ENDLESS_GOLD_FLOOR: Record<string, number> = {
  beginner: 4,
  easy: 8,
  medium: 10,
  hard: 14,
  expert: 20,
};

/** Progress updates while a dense Endless table is being built. */
export type GenBoardPreview = {
  grid?: number;
  rows?: number;
  cells: {
    r: number;
    c: number;
    rank?: Rank;
    suit?: Suit;
    gold?: boolean;
    stop?: boolean;
  }[];
};

export type GenProgress = {
  phase: string;
  attempt: number;
  detail?: string;
  preview?: GenBoardPreview;
};

const key = (r: number, c: number) => `${r},${c}`;
const inBounds = (r: number, c: number) => r >= 0 && r < rows() && c >= 0 && c < cols();
const neighbors = (r: number, c: number): Cell[] =>
  [{ r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 }].filter((p) => inBounds(p.r, p.c));
function asCard(rs: RS): Card {
  return { id: `${rs.rank}${rs.suit}`, rank: rs.rank, suit: rs.suit };
}

/** True when the cells immediately before/after a run are empty (runs must not glue together). */
function endsClear(cells: Cell[], occupied: Map<string, RS>, axis: "row" | "col"): boolean {
  if (!cells.length) return false;
  const first = cells[0];
  const last = cells[cells.length - 1];
  const before = axis === "row" ? { r: first.r, c: first.c - 1 } : { r: first.r - 1, c: first.c };
  const after = axis === "row" ? { r: last.r, c: last.c + 1 } : { r: last.r + 1, c: last.c };
  const free = (p: Cell) => !inBounds(p.r, p.c) || !occupied.has(key(p.r, p.c));
  return free(before) && free(after);
}

function spanOnAxis(
  occupied: Map<string, RS>,
  axis: "row" | "col",
  start: Cell,
): RS[] {
  const step = axis === "row" ? { r: 0, c: 1 } : { r: 1, c: 0 };
  let r = start.r;
  let c = start.c;
  while (inBounds(r - step.r, c - step.c) && occupied.has(key(r - step.r, c - step.c))) {
    r -= step.r;
    c -= step.c;
  }
  const out: RS[] = [];
  while (inBounds(r, c) && occupied.has(key(r, c))) {
    out.push(occupied.get(key(r, c))!);
    r += step.r;
    c += step.c;
  }
  return out;
}

const MAX_RUN = 5;

/**
 * Stops only where another card would be illegal:
 * - both ends of a 5-card run (can't make 6)
 * - both ends of a four of a kind (only four suits)
 * - a 1-cell gap between two groups if merging them would exceed 5 cards
 */
export function neededStops(
  occupied: Map<string, { rank: Rank; suit: Suit }>,
  board?: BoardShape,
): Cell[] {
  if (board) return withShape(board, () => neededStops(occupied));
  const stops = new Set<string>();
  const consider = (r: number, c: number) => {
    if (!inBounds(r, c)) return;
    const k = key(r, c);
    if (occupied.has(k)) return;
    stops.add(k);
  };

  for (const axis of ["row", "col"] as const) {
    const outer = axis === "row" ? rows() : cols();
    const inner = axis === "row" ? cols() : rows();
    for (let i = 0; i < outer; i++) {
      const segs: { a: number; b: number; ranks: Rank[] }[] = [];
      let a = -1;
      let ranks: Rank[] = [];
      for (let j = 0; j <= inner; j++) {
        const r = axis === "row" ? i : j;
        const c = axis === "row" ? j : i;
        const card = j < inner ? occupied.get(key(r, c)) : undefined;
        if (card) {
          if (a < 0) a = j;
          ranks.push(card.rank);
        } else if (a >= 0) {
          segs.push({ a, b: j - 1, ranks });
          a = -1;
          ranks = [];
        }
      }
      for (const s of segs) {
        const len = s.b - s.a + 1;
        const fourOfAKind = len === 4 && s.ranks.every((r) => r === s.ranks[0]);
        if (len >= MAX_RUN || fourOfAKind) {
          const before = s.a - 1;
          const after = s.b + 1;
          consider(axis === "row" ? i : before, axis === "row" ? before : i);
          consider(axis === "row" ? i : after, axis === "row" ? after : i);
        }
      }
      for (let s = 0; s < segs.length - 1; s++) {
        const left = segs[s];
        const right = segs[s + 1];
        if (right.a - left.b !== 2) continue;
        const merged = left.b - left.a + 1 + 1 + (right.b - right.a + 1);
        if (merged > MAX_RUN) {
          const j = left.b + 1;
          consider(axis === "row" ? i : j, axis === "row" ? j : i);
        }
      }
    }
  }

  return [...stops].map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  });
}

function recipeLen(recipe: Recipe): number {
  if (recipe === "pair") return 2;
  if (recipe === "three") return 3;
  if (recipe === "four" || recipe === "twoPair") return 4;
  return 5;
}

function groupedAroundLock(locked: RS, lockIdx: number, lockBlock: RS[], other: RS[]): RS[] | null {
  const i = lockBlock.findIndex((c) => c.rank === locked.rank && c.suit === locked.suit);
  if (i < 0) return null;
  if (lockIdx === i) return [...lockBlock, ...other];
  if (lockIdx === other.length + i) return [...other, ...lockBlock];
  return null;
}

function takeMatching(deck: RS[], pred: (c: RS) => boolean, n: number): RS[] | null {
  const found: RS[] = [];
  const rest: RS[] = [];
  for (const card of deck) {
    if (found.length < n && pred(card)) found.push(card);
    else rest.push(card);
  }
  if (found.length < n) return null;
  deck.length = 0;
  deck.push(...rest);
  return found;
}

function buildHand(recipe: Recipe, len: number, deck: RS[], locked: RS | null, lockIdx: number): RS[] | null {
  if (locked && (lockIdx < 0 || lockIdx >= len)) return null;
  if (recipe === "pair" && len === 2) {
    if (locked) {
      const other = takeMatching(deck, (c) => c.rank === locked.rank && c.suit !== locked.suit, 1);
      if (!other) return null;
      return lockIdx === 0 ? [locked, other[0]] : [other[0], locked];
    }
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 2);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "three" && len === 3) {
    if (locked) {
      const rest = takeMatching(deck, (c) => c.rank === locked.rank && c.suit !== locked.suit, 2);
      if (!rest) return null;
      const out = [...rest];
      out.splice(lockIdx, 0, locked);
      return out;
    }
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 3);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "four" && len === 4) {
    if (locked) {
      const rest = takeMatching(deck, (c) => c.rank === locked.rank && c.suit !== locked.suit, 3);
      if (!rest) return null;
      const out = [...rest];
      out.splice(lockIdx, 0, locked);
      return out;
    }
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 4);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "twoPair" && len === 4) {
    if (locked) {
      const mate = takeMatching(deck, (c) => c.rank === locked.rank && c.suit !== locked.suit, 1);
      if (!mate) return null;
      for (const rank of fisherYates(RANKS.filter((r) => r !== locked.rank))) {
        const pair = takeMatching(deck, (c) => c.rank === rank, 2);
        if (!pair) continue;
        const laid = groupedAroundLock(locked, lockIdx, [locked, mate[0]], pair);
        if (laid) return laid;
        deck.unshift(...pair);
      }
      deck.unshift(...mate);
      return null;
    }
    for (const r1 of fisherYates([...RANKS])) {
      const p1 = takeMatching(deck, (c) => c.rank === r1, 2);
      if (!p1) continue;
      for (const r2 of fisherYates(RANKS.filter((r) => r !== r1))) {
        const p2 = takeMatching(deck, (c) => c.rank === r2, 2);
        if (p2) return [...p1, ...p2];
      }
      deck.unshift(...p1);
    }
    return null;
  }
  if (recipe === "fullHouse" && len === 5) {
    if (locked) {
      const twoMore = takeMatching(deck, (c) => c.rank === locked.rank && c.suit !== locked.suit, 2);
      if (twoMore) {
        for (const rank of fisherYates(RANKS.filter((r) => r !== locked.rank))) {
          const pair = takeMatching(deck, (c) => c.rank === rank, 2);
          if (pair) {
            const laid = groupedAroundLock(locked, lockIdx, [locked, ...twoMore], pair);
            if (laid) return laid;
            deck.unshift(...pair);
          }
        }
        deck.unshift(...twoMore);
      }
      return null;
    }
    for (const r3 of fisherYates([...RANKS])) {
      const trips = takeMatching(deck, (c) => c.rank === r3, 3);
      if (!trips) continue;
      for (const r2 of fisherYates(RANKS.filter((r) => r !== r3))) {
        const pair = takeMatching(deck, (c) => c.rank === r2, 2);
        if (pair) return [...trips, ...pair];
      }
      deck.unshift(...trips);
    }
    return null;
  }
  if (recipe === "flush" && len === 5) {
    if (locked) {
      const rest = takeMatching(
        deck,
        (c) => c.suit === locked.suit && !(c.rank === locked.rank && c.suit === locked.suit),
        len - 1,
      );
      if (!rest) return null;
      const out = [...rest];
      out.splice(lockIdx, 0, locked);
      return out;
    }
    for (const suit of fisherYates([...SUITS])) {
      const cards = takeMatching(deck, (c) => c.suit === suit, len);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "straight" && len === 5) {
    const orders: Rank[][] = [
      ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"],
      ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"],
    ];
    for (const seq of orders) {
      const starts = fisherYates(Array.from({ length: seq.length - len + 1 }, (_, i) => i));
      for (const s of starts) {
        const ranks = seq.slice(s, s + len);
        if (locked && ranks[lockIdx] !== locked.rank) continue;
        const picked: RS[] = [];
        const usedIdx: number[] = [];
        let ok = true;
        for (let i = 0; i < ranks.length; i++) {
          if (locked && i === lockIdx) {
            picked.push(locked);
            continue;
          }
          const idx = deck.findIndex(
            (c, di) => c.rank === ranks[i] && !usedIdx.includes(di) &&
              !(locked && c.rank === locked.rank && c.suit === locked.suit),
          );
          if (idx < 0) { ok = false; break; }
          usedIdx.push(idx);
          picked.push(deck[idx]);
        }
        if (!ok) continue;
        const keep = deck.filter((_, i) => !usedIdx.includes(i));
        deck.length = 0;
        deck.push(...keep);
        return picked;
      }
    }
    return null;
  }
  return null;
}

function placeCells(len: number, occupied: Map<string, RS>, pivot: Cell | null, axis: "row" | "col"): Cell[] | null {
  for (let a = 0; a < 80; a++) {
    const horiz = axis === "row";
    if (pivot) {
      if (horiz) {
        const r = pivot.r;
        const minC = Math.max(0, pivot.c - (len - 1));
        const maxC = Math.min(pivot.c, cols() - len);
        if (minC > maxC) continue;
        const c0 = minC + Math.floor(Math.random() * (maxC - minC + 1));
        const cells = Array.from({ length: len }, (_, i) => ({ r, c: c0 + i }));
        if (
          cells.every((p) => (p.r === pivot.r && p.c === pivot.c) || !occupied.has(key(p.r, p.c))) &&
          endsClear(cells, occupied, "row")
        )
          return cells;
      } else {
        const c = pivot.c;
        const minR = Math.max(0, pivot.r - (len - 1));
        const maxR = Math.min(pivot.r, rows() - len);
        if (minR > maxR) continue;
        const r0 = minR + Math.floor(Math.random() * (maxR - minR + 1));
        const cells = Array.from({ length: len }, (_, i) => ({ r: r0 + i, c }));
        if (
          cells.every((p) => (p.r === pivot.r && p.c === pivot.c) || !occupied.has(key(p.r, p.c))) &&
          endsClear(cells, occupied, "col")
        )
          return cells;
      }
    } else if (horiz) {
      const r = centreR();
      const c0 = Math.floor(Math.random() * (cols() - len + 1));
      const cells = Array.from({ length: len }, (_, i) => ({ r, c: c0 + i }));
      if (cells.some((p) => p.c === centreC()) && cells.every((p) => !occupied.has(key(p.r, p.c)))) return cells;
    } else {
      const c = centreC();
      const r0 = Math.floor(Math.random() * (rows() - len + 1));
      const cells = Array.from({ length: len }, (_, i) => ({ r: r0 + i, c }));
      if (cells.some((p) => p.r === centreR()) && cells.every((p) => !occupied.has(key(p.r, p.c)))) return cells;
    }
  }
  return null;
}

function cardCellsConnected(cells: Cell[]): boolean {
  if (!cells.length) return false;
  const set = new Set(cells.map((p) => key(p.r, p.c)));
  const start = cells[0];
  const seen = new Set<string>([key(start.r, start.c)]);
  const stack = [start];
  while (stack.length) {
    const p = stack.pop()!;
    for (const n of neighbors(p.r, p.c)) {
      const k = key(n.r, n.c);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push(n); }
    }
  }
  return seen.size === set.size;
}

function everyCardInValidHand(occupied: Map<string, RS>, blocked: Set<string>): boolean {
  const covered = new Set<string>();
  const cellCard = (r: number, c: number): Card | null => {
    const rs = occupied.get(key(r, c));
    return rs ? { id: `${rs.rank}${rs.suit}`, rank: rs.rank, suit: rs.suit } : null;
  };
  for (const axis of ["row", "col"] as const) {
    const outer = axis === "row" ? rows() : cols();
    const inner = axis === "row" ? cols() : rows();
    for (let i = 0; i < outer; i++) {
      let cards: Card[] = [];
      let cells: Cell[] = [];
      const flush = () => {
        if (cards.length >= 2 && evaluateRun(cards)) for (const p of cells) covered.add(key(p.r, p.c));
        cards = []; cells = [];
      };
      for (let j = 0; j < inner; j++) {
        const r = axis === "row" ? i : j;
        const c = axis === "row" ? j : i;
        if (blocked.has(key(r, c))) { flush(); continue; }
        const card = cellCard(r, c);
        if (card) { cards.push(card); cells.push({ r, c }); }
        else flush();
      }
      flush();
    }
  }
  return [...occupied.keys()].every((k) => covered.has(k));
}

/**
 * Isolated span through a gold seat: other golds are empty (they break the
 * run). Used to find ranks the player can deduce must go here *before* any
 * other gold is filled.
 */
function isolatedSpan(
  gold: Cell,
  filling: RS,
  axis: "row" | "col",
  fixed: Map<string, RS>,
  blocked: Set<string>,
  goldSet: Set<string>,
): Card[] {
  const step = axis === "row" ? { r: 0, c: 1 } : { r: 1, c: 0 };
  const walk = (dir: number): Card[] => {
    const out: Card[] = [];
    let r = gold.r + dir * step.r;
    let c = gold.c + dir * step.c;
    while (inBounds(r, c)) {
      const k = key(r, c);
      if (blocked.has(k) || goldSet.has(k)) break;
      const rs = fixed.get(k);
      if (!rs) break;
      out.push(asCard(rs));
      r += dir * step.r;
      c += dir * step.c;
    }
    return out;
  };
  return [...walk(-1).reverse(), asCard(filling), ...walk(1)];
}

/**
 * Hand cards that can sit on `gold` *right now*, with every other gold empty.
 * An empty list + a span of 2+ fixed neighbours means the seat is locally
 * unfillable. A single remaining rank means the seat is forced.
 */
function isolatedLegalCards(
  gold: Cell,
  fixed: Map<string, RS>,
  blocked: Set<string>,
  goldSet: Set<string>,
  hand: RS[],
): { cards: RS[]; touchesFixed: boolean } {
  let touchesFixed = false;
  const ok: RS[] = [];
  cardLoop: for (const filling of hand) {
    for (const axis of ["row", "col"] as const) {
      const span = isolatedSpan(gold, filling, axis, fixed, blocked, goldSet);
      if (span.length >= 2) touchesFixed = true;
      if (span.length > MAX_RUN) continue cardLoop;
      if (span.length >= 2 && !evaluateRun(span)) continue cardLoop;
    }
    ok.push(filling);
  }
  // Recompute touchesFixed even if no card worked
  if (!touchesFixed) {
    const probe = hand[0] ?? { rank: "A" as Rank, suit: "S" as Suit };
    for (const axis of ["row", "col"] as const) {
      if (isolatedSpan(gold, probe, axis, fixed, blocked, goldSet).length >= 2) {
        touchesFixed = true;
        break;
      }
    }
  }
  return { cards: ok, touchesFixed };
}

function hasAdjacentGold(gold: Cell, goldSet: Set<string>, blocked: Set<string>): boolean {
  for (const n of neighbors(gold.r, gold.c)) {
    const k = key(n.r, n.c);
    if (goldSet.has(k) && !blocked.has(k)) return true;
  }
  return false;
}

/**
 * Reject tables where gold seats, considered independently against the fixed
 * crossword, demand more copies of a rank than the hand holds.
 *
 * The Hard board that forced 8♥ under 8♦/8♠ *and* two more 8s above 8♣/10s
 * fails this: two (or three) isolated golds each only accept an 8, but the
 * hand has one 8.
 *
 * A gold that is unfillable in isolation is only illegal when no neighbouring
 * gold can join the run (sequential two-pair / full-house is allowed).
 */
function goldForcesFeasible(level: Level): boolean {
  const targets = level.targets ?? [];
  if (targets.length <= 1) return true;
  const blocked = new Set((level.blocked ?? []).map((b) => key(b.r, b.c)));
  const goldSet = new Set(targets.map((t) => key(t.r, t.c)));
  const fixed = new Map<string, RS>();
  for (const f of level.fixed ?? []) fixed.set(key(f.r, f.c), { rank: f.rank, suit: f.suit });
  const hand: RS[] = targets.map((t) => ({ rank: t.rank, suit: t.suit }));

  const forcedRanks: Rank[] = [];
  for (const t of targets) {
    const gold = { r: t.r, c: t.c };
    const { cards: options, touchesFixed } = isolatedLegalCards(gold, fixed, blocked, goldSet, hand);
    if (!touchesFixed) continue;
    if (!options.length) {
      if (!hasAdjacentGold(gold, goldSet, blocked)) return false;
      continue;
    }
    const ranks = [...new Set(options.map((c) => c.rank))];
    if (ranks.length === 1) forcedRanks.push(ranks[0]);
  }

  const need = new Map<Rank, number>();
  for (const r of forcedRanks) need.set(r, (need.get(r) ?? 0) + 1);
  const have = new Map<Rank, number>();
  for (const c of hand) have.set(c.rank, (have.get(c.rank) ?? 0) + 1);
  for (const [rank, n] of need) {
    if (n > (have.get(rank) ?? 0)) return false;
  }
  return true;
}

function graftOneRun(
  occupied: Map<string, RS>,
  deck: RS[],
  tryRecipes: Recipe[],
): boolean {
  const pivots = fisherYates([...occupied.keys()].map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  }));
  for (const recipe of tryRecipes) {
    const len = recipeLen(recipe);
    for (const pivot of pivots) {
      const rowBusy = [pivot.c - 1, pivot.c + 1].some((c) => c >= 0 && c < cols() && occupied.has(key(pivot.r, c)));
      const axisOrder: ("row" | "col")[] = rowBusy ? ["col", "row"] : ["row", "col"];
      for (const axis of axisOrder) {
        const cells = placeCells(len, occupied, pivot, axis);
        if (!cells) continue;
        const lockIdx = cells.findIndex((p) => p.r === pivot.r && p.c === pivot.c);
        if (lockIdx < 0) continue;
        const locked = occupied.get(key(pivot.r, pivot.c))!;
        const deckSnap = deck.slice();
        const cards = buildHand(recipe, len, deck, locked, lockIdx);
        if (!cards) { deck.length = 0; deck.push(...deckSnap); continue; }
        let conflict = false;
        for (let i = 0; i < cells.length; i++) {
          if (i === lockIdx) continue;
          if (occupied.has(key(cells[i].r, cells[i].c))) { conflict = true; break; }
        }
        if (conflict) { deck.length = 0; deck.push(...deckSnap); continue; }
        for (let i = 0; i < cells.length; i++) {
          if (i === lockIdx) continue;
          occupied.set(key(cells[i].r, cells[i].c), cards[i]);
        }
        let glued = false;
        for (const p of cells) {
          for (const ax of ["row", "col"] as const) {
            const span = spanOnAxis(occupied, ax, p);
            if (span.length < 2) continue;
            if (span.length > 5 || !evaluateRun(span.map(asCard))) {
              glued = true;
              break;
            }
          }
          if (glued) break;
        }
        if (glued) {
          for (let i = 0; i < cells.length; i++) {
            if (i === lockIdx) continue;
            occupied.delete(key(cells[i].r, cells[i].c));
          }
          deck.length = 0;
          deck.push(...deckSnap);
          continue;
        }
        return true;
      }
    }
  }
  return false;
}

function previewFromOccupied(
  occupied: Map<string, RS>,
  blocked: Cell[],
  goldKeys?: Set<string>,
): GenBoardPreview {
  const cells: GenBoardPreview["cells"] = [];
  for (const [k, rs] of occupied) {
    const [r, c] = k.split(",").map(Number);
    cells.push({
      r,
      c,
      rank: rs.rank,
      suit: rs.suit,
      gold: goldKeys?.has(k) ?? false,
    });
  }
  for (const b of blocked) {
    if (occupied.has(key(b.r, b.c))) continue;
    cells.push({ r: b.r, c: b.c, stop: true });
  }
  return { grid: cols(), rows: rows(), cells };
}

function previewFromLevel(level: Level): GenBoardPreview {
  const gold = new Set((level.targets ?? []).map((t) => key(t.r, t.c)));
  const occupied = new Map<string, RS>();
  for (const f of level.fixed ?? []) occupied.set(key(f.r, f.c), { rank: f.rank, suit: f.suit });
  for (const t of level.targets ?? []) occupied.set(key(t.r, t.c), { rank: t.rank, suit: t.suit });
  return previewFromOccupied(occupied, level.blocked ?? [], gold);
}

function explainIssue(issue: string): string {
  if (/one correct seat/i.test(issue)) {
    return "Gold seats aren't unique — two cards of the same rank could swap chairs. Remaking the gold marks.";
  }
  if (/at least \d+ gold/i.test(issue)) {
    return `${issue} This cut was too sparse, so it goes back in the deck.`;
  }
  if (/force more copies/i.test(issue)) {
    return "Gold seats demand more copies of a rank than the hand holds. Scrapping this layout.";
  }
  if (/valid poker hand/i.test(issue)) {
    return "A run on this crossword isn't a legal poker hand. Rebuilding the grafts.";
  }
  if (/touch the rest/i.test(issue)) {
    return "The crossword split apart. Every card has to touch the rest of the table.";
  }
  if (/centre square/i.test(issue)) {
    return "Nothing landed on the centre square. Starting a new spine through the middle.";
  }
  return issue;
}

function attemptLevel(
  difficulty: Difficulty,
  table: number,
  onDraft?: (p: GenBoardPreview) => void,
  goldGoal?: number,
): Level | null {
  const cfg = PARAMS[difficulty] ?? PARAMS.easy;
  const deck: RS[] = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))));
  const occupied = new Map<string, RS>();
  const s = (rows() * cols()) / (BOARD_SIZE * BOARD_SIZE);
  const wantRuns = Math.max(2, Math.round(cfg.runs * s));
  const minCards = Math.min(52, Math.max(4, Math.round(cfg.minCards * s)));
  const maxLen = Math.min(5, rows(), cols());
  const recipes = fisherYates(cfg.recipes.filter((r) => recipeLen(r) <= maxLen).slice());
  if (!recipes.length) recipes.push("pair");
  const spineRecipe = recipes[0] ?? "pair";
  const spineLen = recipeLen(spineRecipe);
  const spineAxis: "row" | "col" = Math.random() < 0.5 ? "row" : "col";
  let spineCells = placeCells(spineLen, occupied, null, spineAxis);
  if (!spineCells || !spineCells.some((p) => p.r === centreR() && p.c === centreC())) {
    if (spineAxis === "row") {
      const minC = Math.max(0, centreC() - (spineLen - 1));
      const maxC = Math.min(centreC(), cols() - spineLen);
      if (minC > maxC) return null;
      const c0 = minC + Math.floor(Math.random() * (maxC - minC + 1));
      spineCells = Array.from({ length: spineLen }, (_, i) => ({ r: centreR(), c: c0 + i }));
    } else {
      const minR = Math.max(0, centreR() - (spineLen - 1));
      const maxR = Math.min(centreR(), rows() - spineLen);
      if (minR > maxR) return null;
      const r0 = minR + Math.floor(Math.random() * (maxR - minR + 1));
      spineCells = Array.from({ length: spineLen }, (_, i) => ({ r: r0 + i, c: centreC() }));
    }
  }
  const spineCards = buildHand(spineRecipe, spineLen, deck, null, 0);
  if (!spineCards) return null;
  spineCells.forEach((p, i) => occupied.set(key(p.r, p.c), spineCards[i]));

  let placedRuns = 1;
  let guard = 0;
  const fallback: Recipe[] = ["pair", "three", "twoPair", "straight", ...recipes];
  const runGuard = Math.max(80, wantRuns * 40);
  while (placedRuns < wantRuns && guard++ < runGuard) {
    const tryRecipes = [...new Set([recipes[placedRuns % recipes.length], ...fallback])];
    if (!graftOneRun(occupied, deck, tryRecipes)) break;
    placedRuns++;
  }

  // Need a real crossword; density pass can make up a small run shortfall.
  const minRuns = Math.max(2, Math.ceil(wantRuns * 0.85));
  if (placedRuns < minRuns) return null;

  // Density pass: fill toward a near-full-deck table (cap at 52 unique cards).
  const maxCards = 52;
  let densityGuard = 0;
  const densityRecipes: Recipe[] = [
    ...new Set(["three", "twoPair", "straight", "flush", "fullHouse", ...fallback] as Recipe[]),
  ];
  while (occupied.size < minCards && occupied.size < maxCards && densityGuard++ < 120) {
    const room = maxCards - occupied.size;
    const fit = densityRecipes.filter((r) => recipeLen(r) - 1 <= room);
    if (!fit.length) break;
    if (!graftOneRun(occupied, deck, fit)) break;
    placedRuns++;
  }

  const allCells = [...occupied.entries()].map(([k, rs]) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c, ...rs };
  });
  if (!occupied.has(key(centreR(), centreC())) || !cardCellsConnected(allCells)) {
    onDraft?.(previewFromOccupied(occupied, neededStops(occupied)));
    return null;
  }
  if (allCells.length < minCards) {
    onDraft?.(previewFromOccupied(occupied, neededStops(occupied)));
    return null;
  }

  const blocked = neededStops(occupied);
  const blockedSet = new Set(blocked.map((p) => key(p.r, p.c)));
  if (!everyCardInValidHand(occupied, blockedSet)) {
    onDraft?.(previewFromOccupied(occupied, blocked));
    return null;
  }
  onDraft?.(previewFromOccupied(occupied, blocked));

  // Gold-seat count: caller may ease this down after failed shuffles so a
  // unique hand is more likely. Never go below the difficulty floor.
  const goldFloor = Math.max(
    2,
    Math.min(
      allCells.length - 1,
      Math.round((ENDLESS_GOLD_FLOOR[difficulty] ?? cfg.targetMin) * s),
    ),
  );
  const requested = goldGoal ?? goldFloor;
  const goal = Math.min(allCells.length - 1, Math.max(goldFloor, requested));
  if (goal < goldFloor) return null;

  const rankFreq = new Map<string, number>();
  for (const cell of allCells) rankFreq.set(cell.rank, (rankFreq.get(cell.rank) ?? 0) + 1);
  const candidates = fisherYates(
    allCells.filter((c) => !(c.r === centreR() && c.c === centreC())),
  );
  candidates.sort((a, b) => (rankFreq.get(a.rank)! - rankFreq.get(b.rank)!));

  const pickOnce = (): typeof allCells | null => {
    const chosen: typeof allCells = [];
    if (goal <= 9) {
      for (const cell of fisherYates(candidates.slice())) {
        if (chosen.length >= goal) break;
        const trial = [...chosen, cell];
        if (hasUniqueSolution(levelFromParts(allCells, trial, blocked), { budgetMs: 12, samples: 60 })) chosen.push(cell);
      }
    } else {
      const usedRanks = new Set<string>();
      const pool = fisherYates(candidates.slice());
      // Prefer one seat per rank first — same-rank doubles are the usual
      // source of interchangeable seats (two 5s, four Aces, …).
      for (const cell of pool) {
        if (chosen.length >= goal) break;
        if (usedRanks.has(cell.rank)) continue;
        chosen.push(cell);
        usedRanks.add(cell.rank);
      }
      if (chosen.length < goal) {
        const picked = new Set(chosen.map((c) => key(c.r, c.c)));
        for (const cell of pool) {
          if (chosen.length >= goal) break;
          if (picked.has(key(cell.r, cell.c))) continue;
          const trial = [...chosen, cell];
          const trialLevel = levelFromParts(allCells, trial, blocked);
          // Cheap unique check while growing the hand — full uniqueness runs
          // once on the finished pick (and again in levelIssues).
          if (!hasUniqueSolution(trialLevel, { budgetMs: 12, samples: 60 })) continue;
          if (!goldForcesFeasible(trialLevel)) continue;
          chosen.push(cell);
          picked.add(key(cell.r, cell.c));
        }
      }
    }
    if (chosen.length < goal) return null;
    const trial = levelFromParts(allCells, chosen, blocked);
    if (!goldForcesFeasible(trial)) return null;
    if (!hasUniqueSolution(trial, { budgetMs: 24, samples: 120 })) return null;
    return chosen;
  };

  let chosen: typeof allCells | null = null;
  const pickTries = goal <= 9 ? 6 : 14;
  for (let t = 0; t < pickTries && !chosen; t++) chosen = pickOnce();
  if (!chosen) return null;

  const targetKeys = new Set(chosen.map((c) => key(c.r, c.c)));
  onDraft?.(previewFromOccupied(occupied, blocked, targetKeys));
  const placedList: Placed[] = allCells.map((cell) => ({
    ...cell,
    target: targetKeys.has(key(cell.r, cell.c)),
  }));

  const fixed = placedList.filter((p) => !p.target).map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const targets = placedList.filter((p) => p.target).map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const hand = targets.map(({ rank, suit }) => ({ rank, suit }));
  const label = difficulty[0].toUpperCase() + difficulty.slice(1);
  return {
    id: `endless-${difficulty}-${table}-${Date.now().toString(36)}`,
    campaign: "endless",
    name: `${label} table ${table}`,
    number: table,
    briefing: "Fill every gold seat. Each hand card has only one correct place.",
    grid: cols(),
    rows: rows(),
    group: difficulty,
    blocked, fixed, hand, targets,
    win: { allPlaced: true, exactTargets: true },
  };
}

function levelFromParts(
  allCells: { r: number; c: number; rank: Rank; suit: Suit }[],
  targets: { r: number; c: number; rank: Rank; suit: Suit }[],
  blocked: Cell[],
): Level {
  const tset = new Set(targets.map((t) => key(t.r, t.c)));
  return {
    id: "trial",
    campaign: "endless",
    name: "",
    number: 0,
    briefing: "",
    grid: cols(),
    rows: rows(),
    blocked,
    fixed: allCells
      .filter((c) => !tset.has(key(c.r, c.c)))
      .map(({ r, c, rank, suit }) => ({ r, c, rank, suit })),
    targets: targets.map(({ r, c, rank, suit }) => ({ r, c, rank, suit })),
    hand: targets.map(({ rank, suit }) => ({ rank, suit })),
    win: { allPlaced: true, exactTargets: true },
  };
}

export type GenOptions = {
  /** Prefetch while the player is on a live table — yield to animation frames. */
  background?: boolean;
  isCancelled?: () => boolean;
  cols?: number;
  rows?: number;
};

export async function makeProceduralLevel(
  difficulty: Difficulty,
  table: number,
  onProgress?: (p: GenProgress) => void,
  opts?: GenOptions,
): Promise<Level> {
  const board: BoardShape = {
    cols: clampBoardSize(opts?.cols ?? BOARD_SIZE),
    rows: clampBoardSize(opts?.rows ?? opts?.cols ?? BOARD_SIZE),
  };
  const cfg = PARAMS[difficulty] ?? PARAMS.easy;
  const areaScale = (board.rows * board.cols) / (BOARD_SIZE * BOARD_SIZE);
  const cellCount = board.rows * board.cols;
  shapeStack.push(board);
  try {
  let lastPreview: GenBoardPreview | undefined;
  const report = (phase: string, attempt: number, detail?: string, preview?: GenBoardPreview) => {
    if (preview) lastPreview = preview;
    onProgress?.({ phase, attempt, detail, preview: preview ?? lastPreview });
  };
  const draft = (p: GenBoardPreview) => {
    lastPreview = p;
    onProgress?.({
      phase: "Laying this shuffle on the felt",
      attempt: 0,
      detail: `${p.cells.filter((c) => c.rank).length} cards in this try.`,
      preview: p,
    });
  };
  const decide = (level: Level): string[] => levelIssues(level);
  const throwIfCancelled = () => {
    if (opts?.isCancelled?.()) {
      const err = new Error("cancelled");
      err.name = "GenCancelled";
      throw err;
    }
  };
  const tick = async (i: number) => {
    throwIfCancelled();
    const every = opts?.background ? 1 : 3;
    if (i % every === 0) await yieldToUi(opts?.background ? "idle" : "frame");
    throwIfCancelled();
  };

  const primaryAttempts =
    difficulty === "expert" ? 500 : difficulty === "hard" ? 380 : difficulty === "medium" ? 260 : 180;
  const label = difficulty[0]!.toUpperCase() + difficulty.slice(1);
  const goldFloor = Math.max(
    2,
    Math.min(
      cellCount - 2,
      Math.round((ENDLESS_GOLD_FLOOR[difficulty] ?? cfg.targetMin) * areaScale),
    ),
  );
  let goldGoal = Math.max(
    goldFloor,
    Math.min(cellCount - 1, Math.round(cfg.targetMax * areaScale)),
  );
  const easeHand = () => {
    if (goldGoal > goldFloor) goldGoal -= 1;
  };

  report(
    `Cutting a fresh ${label} deck`,
    0,
    `I need a connected crossword of ${cfg.minCards}+ cards. Starting with ${goldGoal} gold seats in the hand — I'll pull one fewer each time a shuffle fails, down to ${goldFloor}.`,
  );
  await tick(0);

  for (let i = 0; i < primaryAttempts; i++) {
    await tick(i);
    if (i % 6 === 0) {
      report(
        "Grafting poker hands onto a centre spine",
        i + 1,
        `Attempt ${i + 1} of ${primaryAttempts}. Hand is ${goldGoal} gold cards. Laying pairs, trips and longer runs so the table fills like a crossword.`,
        lastPreview,
      );
    }
    const level = attemptLevel(difficulty, table, draft, goldGoal);
    if (!level) {
      easeHand();
      if (i % 6 === 0) {
        report(
          "That shuffle didn't hold together",
          i + 1,
          goldGoal < cfg.targetMax
            ? `Not enough touching hands, or the centre never filled. Next shuffle uses ${goldGoal} gold seats.`
            : "Not enough touching hands, or the centre never filled. Starting a new spine.",
          lastPreview,
        );
      }
      continue;
    }
    const preview = previewFromLevel(level);
    const nGold = level.targets?.length ?? 0;
    const nCards = (level.fixed?.length ?? 0) + nGold;
    if (i % 6 === 0) {
      report(
        "Stress-testing gold seats",
        i + 1,
        `${nCards} cards, ${nGold} gold. Checking that no two hand cards can swap chairs.`,
        preview,
      );
    }
    const issues = decide(level);
    if (!issues.length) {
      report("Table locked in", i + 1, `${nGold} gold seats. Each hand card has one correct place.`, preview);
      return level;
    }
    easeHand();
    if (i % 6 === 0) {
      report(
        "Throwing this crossword back",
        i + 1,
        `${explainIssue(issues[0]!)} Next hand is ${goldGoal} gold.`,
        preview,
      );
    }
  }

  const fallback: Difficulty[] =
    difficulty === "expert"
      ? ["hard"]
      : difficulty === "hard"
        ? ["medium"]
        : difficulty === "medium"
          ? ["easy"]
          : difficulty === "easy"
            ? ["beginner"]
            : [];
  const minTargets = Math.max(
    cfg.targetMin - 3,
    difficulty === "expert" ? 20 : difficulty === "hard" ? 14 : cfg.targetMin - 2,
  );
  const minCardsFloor = Math.max(cfg.targetMin + 2, Math.floor(cfg.minCards * 0.85));
  for (const d of fallback) {
    report(
      "Primary recipes were stubborn",
      0,
      `Loosening the mix (${d} patterns) while still aiming for at least ${minTargets} gold and ${minCardsFloor}+ cards.`,
      lastPreview,
    );
    await tick(0);
    for (let i = 0; i < 120; i++) {
      await tick(i);
      if (i % 8 === 0) {
        report(
          "Reseating the regulars",
          i + 1,
          `Trying a denser cut with ${d} hands — ${goldGoal} gold, unique seats only.`,
          lastPreview,
        );
      }
      const level = attemptLevel(d, table, draft, goldGoal);
      if (!level) {
        easeHand();
        continue;
      }
      const preview = previewFromLevel(level);
      const issues = decide(level);
      if (issues.length) {
        easeHand();
        continue;
      }
      const cards = (level.fixed?.length ?? 0) + (level.targets?.length ?? 0);
      if ((level.targets?.length ?? 0) < minTargets) continue;
      if (cards < minCardsFloor) continue;
      report("Table locked in", i + 1, `${level.targets?.length ?? 0} gold seats after a denser cut.`, preview);
      return {
        ...level,
        id: `endless-${difficulty}-${table}-${Date.now().toString(36)}`,
        name: `${label} table ${table}`,
        group: difficulty,
      };
    }
  }

  // Keep hammering — NEVER ship the 2-card centre pair for medium/hard/expert.
  const stubbornFloor =
    difficulty === "expert" ? 20
    : difficulty === "hard" ? 14
    : difficulty === "medium" ? 10
    : difficulty === "easy" ? 8
    : 4;
  const stubbornCards = Math.max(
    stubbornFloor + 4,
    Math.floor(cfg.minCards * 0.7),
  );
  if (difficulty !== "beginner") {
    report(
      "Holding out for a proper table",
      0,
      `I will not deal a thin pair. Still need ≥${stubbornFloor} gold on ≥${stubbornCards} cards.`,
      lastPreview,
    );
    for (let wave = 0; wave < 10; wave++) {
      for (let i = 0; i < 120; i++) {
        await tick(wave * 120 + i);
        if (i % 10 === 0) {
          report(
            "One more shuffle",
            wave * 120 + i + 1,
            `Wave ${wave + 1}. ${goldGoal} gold seats this shuffle.`,
            lastPreview,
          );
        }
        const d: Difficulty =
          fallback.length && i % 3 === 2 ? fallback[0]! : difficulty;
        const level = attemptLevel(d, table, draft, goldGoal);
        if (!level) {
          easeHand();
          continue;
        }
        const issues = decide(level);
        if (issues.length) {
          easeHand();
          continue;
        }
        const n = level.targets?.length ?? 0;
        const cards = (level.fixed?.length ?? 0) + n;
        if (n < stubbornFloor || cards < stubbornCards) continue;
        report("Table locked in", wave * 120 + i + 1, `${n} gold seats. Unique chairs.`, previewFromLevel(level));
        return {
          ...level,
          id: `endless-${difficulty}-${table}-${Date.now().toString(36)}`,
          name: `${label} table ${table}`,
          group: difficulty,
        };
      }
    }
  }

  if (difficulty === "beginner") {
    report("Fallback pair", 0, "The deck was stubborn. Seating a centre pair so you can still play.");
    return minimalCentrePair(difficulty, table);
  }

  report(
    "Building a denser fallback",
    0,
    `Last search pass — still need ≥${stubbornFloor} gold, unique seats only.`,
    lastPreview,
  );
  for (let i = 0; i < 400; i++) {
    await tick(i);
    if (i % 15 === 0) {
      report("Building a denser fallback", i + 1, `Attempt ${i + 1}. Preferring packed pairs and trips.`, lastPreview);
    }
    const d: Difficulty = fallback[0] ?? difficulty;
    const level = attemptLevel(d, table, draft, goldGoal);
    if (!level) {
      easeHand();
      continue;
    }
    const issues = decide(level);
    if (issues.length) {
      easeHand();
      continue;
    }
    const n = level.targets?.length ?? 0;
    if (n < stubbornFloor) continue;
    report("Table locked in", i + 1, `${n} gold seats on the fallback cut.`, previewFromLevel(level));
    return {
      ...level,
      id: `endless-${difficulty}-${table}-${Date.now().toString(36)}`,
      name: `${label} table ${table}`,
      group: difficulty,
    };
  }

  report(
    "Building a guaranteed table",
    0,
    `Procedural search gave up. Laying connected pairs and trips with at most one gold per rank so nothing can swap.`,
    lastPreview,
  );
  await tick(0);
  const guaranteed = denseGuaranteedLevel(difficulty, table, stubbornFloor);
  report(
    "Table locked in",
    0,
    `${guaranteed.targets?.length ?? 0} gold seats on a guaranteed connected table.`,
    previewFromLevel(guaranteed),
  );
  return guaranteed;
  } finally {
    shapeStack.pop();
  }
}

function yieldToUi(kind: "frame" | "idle" = "frame"): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (kind === "idle" && typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout: 80 });
      return;
    }
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function minimalCentrePair(difficulty: Difficulty, table: number): Level {
  const deck = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit } as RS))));
  const cards = takeMatching(deck, (c) => c.rank === "A", 2) ?? [
    { rank: "A" as Rank, suit: "S" as Suit },
    { rank: "A" as Rank, suit: "H" as Suit },
  ];
  const fixed = [{ r: centreR(), c: centreC(), ...cards[0] }];
  const targets = [{ r: centreR(), c: centreC() + 1, ...cards[1] }];
  const label = difficulty[0].toUpperCase() + difficulty.slice(1);
  return {
    id: `endless-${difficulty}-${table}-min`,
    campaign: "endless",
    name: `${label} table ${table}`,
    number: table,
    briefing: "Fill every gold seat.",
    grid: cols(),
    rows: rows(),
    group: difficulty,
    blocked: [],
    fixed,
    hand: targets.map(({ rank, suit }) => ({ rank, suit })),
    targets,
    win: { allPlaced: true, exactTargets: true },
  };
}

/**
 * Dense guaranteed fallback when procedural search fails for medium/hard/expert.
 * Connected pairs and trips — never a single gold seat.
 */
function denseGuaranteedLevel(
  difficulty: Difficulty,
  table: number,
  minGold: number,
): Level {
  const deck = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit } as RS))));
  const occupied = new Map<string, RS>();
  const put = (r: number, c: number, card: RS) => {
    if (!inBounds(r, c) || occupied.has(key(r, c))) return false;
    occupied.set(key(r, c), card);
    return true;
  };

  {
    const pair =
      takeMatching(deck, (c) => c.rank === "A", 2) ??
      ([{ rank: "A" as Rank, suit: "S" as Suit }, { rank: "A" as Rank, suit: "H" as Suit }]);
    put(centreR(), centreC(), pair[0]!);
    put(centreR(), centreC() + 1, pair[1]!);
  }

  const ranksLeft = fisherYates(RANKS.filter((r) => r !== "A"));
  for (const rank of ranksLeft) {
    if (occupied.size >= Math.min(42, rows() * cols() - 3)) break;
    const want = occupied.size < 24 ? 3 : 2;
    const copies =
      takeMatching(deck, (c) => c.rank === rank, want) ??
      takeMatching(deck, (c) => c.rank === rank, 2);
    if (!copies || copies.length < 2) continue;

    const pivots = fisherYates(
      [...occupied.keys()].map((k) => {
        const [r, c] = k.split(",").map(Number);
        return { r, c };
      }),
    );
    let done = false;
    for (const p of pivots) {
      if (done) break;
      for (const axis of ["row", "col"] as const) {
        if (done) break;
        for (const n of neighbors(p.r, p.c)) {
          if (occupied.has(key(n.r, n.c))) continue;
          const step = axis === "row" ? { r: 0, c: 1 } : { r: 1, c: 0 };
          const cells: Cell[] = [];
          let ok = true;
          for (let i = 0; i < copies.length; i++) {
            const cell = { r: n.r + step.r * i, c: n.c + step.c * i };
            if (!inBounds(cell.r, cell.c) || occupied.has(key(cell.r, cell.c))) {
              ok = false;
              break;
            }
            cells.push(cell);
          }
          if (!ok) continue;
          for (let i = 0; i < cells.length; i++) put(cells[i]!.r, cells[i]!.c, copies[i]!);
          done = true;
          break;
        }
      }
    }
  }

  const allCells = [...occupied.entries()].map(([k, rs]) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c, ...rs };
  });

  const byRank = new Map<Rank, typeof allCells>();
  for (const cell of allCells) {
    const list = byRank.get(cell.rank) ?? [];
    list.push(cell);
    byRank.set(cell.rank, list);
  }
  // At most one gold per rank so two 5s / four Aces cannot swap seats.
  // Remaining copies of the rank stay fixed and force the single gold seat.
  const targetKeys = new Set<string>();
  const goldedRanks = new Set<Rank>();
  for (const [rank, cells] of byRank) {
    if (cells.length < 2) continue;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      if (cell.r === centreR() && cell.c === centreC()) continue;
      targetKeys.add(key(cell.r, cell.c));
      goldedRanks.add(rank);
      break;
    }
  }
  if (targetKeys.size < minGold) {
    for (const cell of fisherYates(allCells)) {
      if (targetKeys.size >= minGold) break;
      if (cell.r === centreR() && cell.c === centreC()) continue;
      if (targetKeys.has(key(cell.r, cell.c))) continue;
      // Prefer ranks that are not already golded; only double up if needed.
      if (goldedRanks.has(cell.rank) && targetKeys.size < minGold - 2) continue;
      const trialKeys = new Set(targetKeys);
      trialKeys.add(key(cell.r, cell.c));
      const trialTargets = allCells
        .filter((c) => trialKeys.has(key(c.r, c.c)))
        .map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
      const trialFixed = allCells
        .filter((c) => !trialKeys.has(key(c.r, c.c)))
        .map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
      const trialLevel: Level = {
        id: "trial",
        campaign: "endless",
        name: "",
        number: 0,
        briefing: "",
        grid: cols(),
    rows: rows(),
        blocked: neededStops(occupied),
        fixed: trialFixed,
        targets: trialTargets,
        hand: trialTargets.map(({ rank, suit }) => ({ rank, suit })),
        win: { allPlaced: true, exactTargets: true },
      };
      if (!hasUniqueSolution(trialLevel)) continue;
      targetKeys.add(key(cell.r, cell.c));
      goldedRanks.add(cell.rank);
    }
  }

  const fixed = allCells
    .filter((c) => !targetKeys.has(key(c.r, c.c)))
    .map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const targets = allCells
    .filter((c) => targetKeys.has(key(c.r, c.c)))
    .map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const blocked = neededStops(occupied);
  const label = difficulty[0].toUpperCase() + difficulty.slice(1);
  return {
    id: `endless-${difficulty}-${table}-dense`,
    campaign: "endless",
    name: `${label} table ${table}`,
    number: table,
    briefing: "Fill every gold seat. Each hand card has only one correct place.",
    grid: cols(),
    rows: rows(),
    group: difficulty,
    blocked,
    fixed,
    hand: targets.map(({ rank, suit }) => ({ rank, suit })),
    targets,
    win: { allPlaced: true, exactTargets: true },
  };
}

/**
 * After placing a card at `at`, check any fully-closed run through that cell.
 * Invalid closed runs prune the uniqueness search early.
 */
function closedRunsValid(
  occupied: Map<string, RS>,
  blockedSet: Set<string>,
  openSeats: Set<string>,
  at: Cell,
): boolean {
  for (const axis of ["row", "col"] as const) {
    const step = axis === "row" ? { r: 0, c: 1 } : { r: 1, c: 0 };
    let r = at.r;
    let c = at.c;
    while (inBounds(r - step.r, c - step.c)) {
      const k = key(r - step.r, c - step.c);
      if (blockedSet.has(k) || (!occupied.has(k) && !openSeats.has(k))) break;
      if (openSeats.has(k) && !occupied.has(k)) {
        r = -1;
        break;
      }
      r -= step.r;
      c -= step.c;
    }
    if (r < 0) continue;
    const cards: Card[] = [];
    let openHit = false;
    let rr = r;
    let cc = c;
    while (inBounds(rr, cc)) {
      const k = key(rr, cc);
      if (blockedSet.has(k)) break;
      if (openSeats.has(k) && !occupied.has(k)) {
        openHit = true;
        break;
      }
      const rs = occupied.get(k);
      if (!rs) break;
      cards.push({ id: `${rs.rank}${rs.suit}`, rank: rs.rank, suit: rs.suit });
      rr += step.r;
      cc += step.c;
    }
    if (openHit) continue;
    if (cards.length >= 2 && !evaluateRun(cards)) return false;
    if (cards.length > 5) return false;
  }
  return true;
}

function assignmentValid(
  baseOccupied: Map<string, RS>,
  blockedSet: Set<string>,
  cells: Cell[],
  order: RS[],
): boolean {
  const occupied = new Map(baseOccupied);
  for (let i = 0; i < cells.length; i++) {
    occupied.set(key(cells[i].r, cells[i].c), order[i]);
  }
  return everyCardInValidHand(occupied, blockedSet);
}

/**
 * True when the designed target assignment is the only practical way to place
 * the hand. Full backtracking for small hands; for large authored-scale hands
 * (16–26 gold) we check pairwise swaps plus a time-budgeted random sample.
 */
function hasUniqueSolution(
  level: Level,
  opts?: { budgetMs?: number; samples?: number },
): boolean {
  const targets = level.targets ?? [];
  if (targets.length <= 1) return true;

  const blockedSet = new Set((level.blocked ?? []).map((b) => key(b.r, b.c)));
  const baseOccupied = new Map<string, RS>();
  for (const f of level.fixed ?? []) {
    baseOccupied.set(key(f.r, f.c), { rank: f.rank, suit: f.suit });
  }

  const cells = targets.map((t) => ({ r: t.r, c: t.c }));
  const cards = targets.map((t) => ({ rank: t.rank, suit: t.suit }));
  const n = cells.length;

  // Every pair of seats — including same-rank different-suit — must not be
  // interchangeable. Skipping same-rank on large hands let Expert tables ship
  // with two 5s or four Aces freely swappable.
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (cards[a].rank === cards[b].rank && cards[a].suit === cards[b].suit) continue;
      const swapped = cards.slice();
      const tmp = swapped[a];
      swapped[a] = swapped[b];
      swapped[b] = tmp;
      if (assignmentValid(baseOccupied, blockedSet, cells, swapped)) return false;
    }
  }

  // Same-rank groups of 3+: also try non-swap permutations (cycles). Pairwise
  // catches free swaps; cycles catch "rotate three Aces" style ambiguities.
  const rankGroups = new Map<Rank, number[]>();
  for (let i = 0; i < n; i++) {
    const list = rankGroups.get(cards[i].rank) ?? [];
    list.push(i);
    rankGroups.set(cards[i].rank, list);
  }
  for (const idxs of rankGroups.values()) {
    if (idxs.length < 3) continue;
    const k = idxs.length;
    // Rotate left by 1, 2, ... k-1
    for (let rot = 1; rot < k; rot++) {
      const order = cards.slice();
      for (let j = 0; j < k; j++) {
        order[idxs[j]!] = cards[idxs[(j + rot) % k]!]!;
      }
      if (assignmentValid(baseOccupied, blockedSet, cells, order)) return false;
    }
    // A couple of random shuffles within the group
    for (let s = 0; s < Math.min(8, k * 2); s++) {
      const perm = fisherYates(idxs.map((i) => cards[i]!));
      let differs = false;
      const order = cards.slice();
      for (let j = 0; j < k; j++) {
        order[idxs[j]!] = perm[j]!;
        if (perm[j]!.suit !== cards[idxs[j]!]!.suit) differs = true;
      }
      if (!differs) continue;
      if (assignmentValid(baseOccupied, blockedSet, cells, order)) return false;
    }
  }

  if (n <= 9) {
    const openSeats = new Set(cells.map((p) => key(p.r, p.c)));
    const used = new Array<boolean>(n).fill(false);
    const assign: RS[] = new Array(n);
    let foundOther = false;

    function rec(idx: number, occupied: Map<string, RS>) {
      if (foundOther) return;
      if (idx === n) {
        let differs = false;
        for (let i = 0; i < n; i++) {
          if (assign[i].rank !== cards[i].rank || assign[i].suit !== cards[i].suit) {
            differs = true;
            break;
          }
        }
        if (!differs) return;
        if (everyCardInValidHand(occupied, blockedSet)) foundOther = true;
        return;
      }
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        used[i] = true;
        assign[idx] = cards[i];
        const k = key(cells[idx].r, cells[idx].c);
        occupied.set(k, cards[i]);
        if (closedRunsValid(occupied, blockedSet, openSeats, cells[idx])) {
          rec(idx + 1, occupied);
        }
        occupied.delete(k);
        used[i] = false;
        if (foundOther) return;
      }
    }

    rec(0, new Map(baseOccupied));
    return !foundOther;
  }

  // Residual different-rank rearrangements. Pairwise swaps already catch
  // interchangeable seats; keep this sample short so the main thread stays
  // responsive (Expert used to burn 600ms here per candidate).
  const budgetMs = opts?.budgetMs ?? (n >= 20 ? 120 : n >= 14 ? 80 : 50);
  const samples = opts?.samples ?? (n >= 20 ? 700 : n >= 14 ? 400 : 250);
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  for (let s = 0; s < samples; s++) {
    if (now() - t0 > budgetMs) break;
    const order = fisherYates(cards.slice());
    let same = true;
    for (let i = 0; i < n; i++) {
      if (order[i].rank !== cards[i].rank || order[i].suit !== cards[i].suit) {
        same = false;
        break;
      }
    }
    if (same) continue;
    if (assignmentValid(baseOccupied, blockedSet, cells, order)) return false;
  }
  return true;
}

export function levelIssues(
  level: Level,
  opts: { requireCentre?: boolean; requireUnique?: boolean } = {},
): string[] {
  return withShape(boardShapeOf(level), () => {
  const requireCentre = opts.requireCentre !== false;
  const requireUnique = opts.requireUnique !== false;
  const issues: string[] = [];

  const sh = boardShapeOf(level);
  if (level.campaign === "endless") {
    if (
      sh.cols < BOARD_SIZE_MIN ||
      sh.cols > BOARD_SIZE_MAX ||
      sh.rows < BOARD_SIZE_MIN ||
      sh.rows > BOARD_SIZE_MAX
    ) {
      issues.push(`Endless boards are ${BOARD_SIZE_MIN}–${BOARD_SIZE_MAX} cells on each side.`);
    }
  } else if (sh.cols !== BOARD_SIZE || sh.rows !== BOARD_SIZE) {
    issues.push("Board must be 11×11.");
  }
  if (!level.hand.length || !level.targets?.length) {
    issues.push("Mark at least one gold seat.");
  } else if (level.hand.length !== level.targets.length) {
    issues.push("Hand cards must match the gold seats.");
  }
  if (level.campaign === "endless") {
    if ((level.targets?.length ?? 0) > 26) issues.push("At most twenty-six gold seats.");
    const baseFloor = ENDLESS_GOLD_FLOOR[level.group ?? ""] ?? 0;
    const floor = baseFloor
      ? Math.max(2, Math.round(baseFloor * ((sh.rows * sh.cols) / (BOARD_SIZE * BOARD_SIZE))))
      : 0;
    if (floor && (level.targets?.length ?? 0) < floor) {
      issues.push(
        `${level.group![0]!.toUpperCase()}${level.group!.slice(1)} tables need at least ${floor} gold seats.`,
      );
    }
  } else if ((level.targets?.length ?? 0) > 8) {
    issues.push("At most eight gold seats.");
  }

  const used = new Set<string>();
  const cards = new Set<string>();
  const take = (r: number, c: number, rank: Rank, suit: Suit, label: string) => {
    if (!inBounds(r, c)) {
      issues.push(`${label} sits off the board.`);
      return;
    }
    const k = key(r, c);
    if (used.has(k)) issues.push(`Two things occupy row ${r + 1}, column ${c + 1}.`);
    if (cards.has(`${rank}${suit}`)) issues.push(`Duplicate ${rank}${suit}.`);
    used.add(k);
    cards.add(`${rank}${suit}`);
  };
  for (const f of level.fixed ?? []) take(f.r, f.c, f.rank, f.suit, "A fixed card");
  for (const t of level.targets ?? []) take(t.r, t.c, t.rank, t.suit, "A gold seat");
  for (const b of level.blocked ?? []) {
    if (!inBounds(b.r, b.c)) issues.push("A stop sits off the board.");
    else if (used.has(key(b.r, b.c))) issues.push("A stop overlaps a card.");
    else used.add(key(b.r, b.c));
  }
  const bag = [...level.hand.map((h) => `${h.rank}${h.suit}`)].sort().join();
  const tbag = [...(level.targets ?? []).map((t) => `${t.rank}${t.suit}`)].sort().join();
  if (level.hand.length && bag !== tbag) issues.push("Hand does not match the gold-seat cards.");

  const cardCells: Cell[] = [
    ...(level.fixed ?? []).map((f) => ({ r: f.r, c: f.c })),
    ...(level.targets ?? []).map((t) => ({ r: t.r, c: t.c })),
  ];
  if (cardCells.length && !cardCellsConnected(cardCells)) {
    issues.push("Every card must touch the rest of the crossword.");
  }
  if (requireCentre && !cardCells.some((p) => p.r === centreR() && p.c === centreC())) {
    issues.push("A card must sit on the centre square.");
  }
  const occupied = new Map<string, RS>();
  for (const f of level.fixed ?? []) occupied.set(key(f.r, f.c), { rank: f.rank, suit: f.suit });
  for (const t of level.targets ?? []) occupied.set(key(t.r, t.c), { rank: t.rank, suit: t.suit });
  const blockedSet = new Set((level.blocked ?? []).map((b) => key(b.r, b.c)));
  if (occupied.size && !everyCardInValidHand(occupied, blockedSet)) {
    issues.push("Every card must be part of a valid poker hand.");
  }
  if (!goldForcesFeasible(level)) {
    issues.push("Gold seats must not force more copies of a rank than the hand holds.");
  }
  if (requireUnique && (level.targets?.length ?? 0) > 0 && !hasUniqueSolution(level)) {
    issues.push("Each gold card must have only one correct seat.");
  }
  return [...new Set(issues)];
  });
}

export function isValidLevel(level: Level): boolean {
  return levelIssues(level).length === 0;
}

/** Compact connected crossword of 8–12 scoring cards for Free Play. */
function compactScoringOccupied(): Map<string, RS> | null {
  const deck: RS[] = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))));
  const occupied = new Map<string, RS>();
  const spines = fisherYates(["flush", "straight", "fullHouse", "twoPair", "three"] as Recipe[]);
  const spineRecipe = spines[0] ?? "flush";
  const spineLen = recipeLen(spineRecipe);
  const spineAxis: "row" | "col" = Math.random() < 0.5 ? "row" : "col";
  let spineCells = placeCells(spineLen, occupied, null, spineAxis);
  if (!spineCells || !spineCells.some((p) => p.r === centreR() && p.c === centreC())) {
    if (spineAxis === "row") {
      const minC = Math.max(0, centreC() - (spineLen - 1));
      const maxC = Math.min(centreC(), cols() - spineLen);
      if (minC > maxC) return null;
      const c0 = minC + Math.floor(Math.random() * (maxC - minC + 1));
      spineCells = Array.from({ length: spineLen }, (_, i) => ({ r: centreR(), c: c0 + i }));
    } else {
      const minR = Math.max(0, centreR() - (spineLen - 1));
      const maxR = Math.min(centreR(), rows() - spineLen);
      if (minR > maxR) return null;
      const r0 = minR + Math.floor(Math.random() * (maxR - minR + 1));
      spineCells = Array.from({ length: spineLen }, (_, i) => ({ r: r0 + i, c: centreC() }));
    }
  }
  const spineCards = buildHand(spineRecipe, spineLen, deck, null, 0);
  if (!spineCards) return null;
  spineCells.forEach((p, i) => occupied.set(key(p.r, p.c), spineCards[i]));

  const want = 8 + Math.floor(Math.random() * 5);
  const grafts: Recipe[] = ["pair", "pair", "three", "twoPair", "pair", "three"];
  let guard = 0;
  while (occupied.size < want && guard++ < 50) {
    const room = want - occupied.size;
    const fit = grafts.filter((r) => recipeLen(r) - 1 <= room);
    if (!fit.length) break;
    if (!graftOneRun(occupied, deck, fisherYates(fit))) break;
  }

  if (occupied.size < 8 || occupied.size > 12) return null;
  const cells = [...occupied.keys()].map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c };
  });
  if (!occupied.has(key(centreR(), centreC())) || !cardCellsConnected(cells)) return null;
  const blocked = new Set(neededStops(occupied).map((p) => key(p.r, p.c)));
  if (!everyCardInValidHand(occupied, blocked)) return null;
  return occupied;
}

function guaranteedPairDeal(): RS[] {
  const deck: RS[] = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))));
  const out: RS[] = [];
  for (const rank of fisherYates([...RANKS])) {
    if (out.length >= 10) break;
    const pair = takeMatching(deck, (c) => c.rank === rank, 2);
    if (pair) out.push(...pair);
  }
  return out.length >= 8 ? out : deck.slice(0, 10);
}

/**
 * Free Play hand: every card belongs to a known connected crossword of
 * scoring poker hands (pairs grafted onto a flush/straight/full-house spine,
 * etc.). We deal the whole layout — never a random slice — so nothing is left
 * without a scoring seat (the old 12-card slice produced orphan Aces/3s).
 */
export function makeScoringDeal(): RS[] {
  for (let i = 0; i < 100; i++) {
    const layout = compactScoringOccupied();
    if (layout) return fisherYates([...layout.values()]);
  }
  return guaranteedPairDeal();
}


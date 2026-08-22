import { fisherYates } from "./deck";
import { evaluateRun } from "./poker";
import {
  BOARD_SIZE, RANKS, SUITS,
  type Card, type Cell, type Difficulty, type Level, type Rank, type Suit,
} from "./types";

type RS = { rank: Rank; suit: Suit };
type Placed = { r: number; c: number; rank: Rank; suit: Suit; target: boolean };
const CENTRE = Math.floor(BOARD_SIZE / 2);

type Recipe = "pair" | "three" | "twoPair" | "straight" | "flush" | "fullHouse" | "four";

const PARAMS: Record<Difficulty, { runs: number; targets: number; recipes: Recipe[] }> = {
  beginner: { runs: 2, targets: 1, recipes: ["pair", "pair", "three"] },
  easy: { runs: 3, targets: 2, recipes: ["pair", "pair", "three", "twoPair"] },
  medium: { runs: 4, targets: 3, recipes: ["pair", "three", "twoPair", "straight"] },
  hard: { runs: 5, targets: 4, recipes: ["three", "twoPair", "straight", "flush", "fullHouse"] },
  expert: { runs: 6, targets: 4, recipes: ["straight", "flush", "fullHouse", "four", "twoPair", "three"] },
};

const key = (r: number, c: number) => `${r},${c}`;
const inBounds = (r: number, c: number) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
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
 * - both ends of a four of a kind (only four suits — the hand is complete)
 * - a 1-cell gap between two groups if merging them would exceed 5 cards
 */
export function neededStops(occupied: Map<string, { rank: Rank; suit: Suit }>): Cell[] {
  const stops = new Set<string>();
  const consider = (r: number, c: number) => {
    if (!inBounds(r, c)) return;
    const k = key(r, c);
    if (occupied.has(k)) return;
    stops.add(k);
  };

  for (const axis of ["row", "col"] as const) {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const segs: { a: number; b: number; ranks: Rank[] }[] = [];
      let a = -1;
      let ranks: Rank[] = [];
      for (let j = 0; j <= BOARD_SIZE; j++) {
        const r = axis === "row" ? i : j;
        const c = axis === "row" ? j : i;
        const card = j < BOARD_SIZE ? occupied.get(key(r, c)) : undefined;
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
        const maxC = Math.min(pivot.c, BOARD_SIZE - len);
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
        const maxR = Math.min(pivot.r, BOARD_SIZE - len);
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
      const r = CENTRE;
      const c0 = Math.floor(Math.random() * (BOARD_SIZE - len + 1));
      const cells = Array.from({ length: len }, (_, i) => ({ r, c: c0 + i }));
      if (cells.some((p) => p.c === CENTRE) && cells.every((p) => !occupied.has(key(p.r, p.c)))) return cells;
    } else {
      const c = CENTRE;
      const r0 = Math.floor(Math.random() * (BOARD_SIZE - len + 1));
      const cells = Array.from({ length: len }, (_, i) => ({ r: r0 + i, c }));
      if (cells.some((p) => p.r === CENTRE) && cells.every((p) => !occupied.has(key(p.r, p.c)))) return cells;
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
    for (let i = 0; i < BOARD_SIZE; i++) {
      let cards: Card[] = [];
      let cells: Cell[] = [];
      const flush = () => {
        if (cards.length >= 2 && evaluateRun(cards)) for (const p of cells) covered.add(key(p.r, p.c));
        cards = []; cells = [];
      };
      for (let j = 0; j < BOARD_SIZE; j++) {
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

function attemptLevel(difficulty: Difficulty, table: number): Level | null {
  const cfg = PARAMS[difficulty] ?? PARAMS.easy;
  const deck: RS[] = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))));
  const occupied = new Map<string, RS>();
  const recipes = fisherYates(cfg.recipes.slice());
  const spineRecipe = recipes[0] ?? "pair";
  const spineLen = recipeLen(spineRecipe);
  const spineAxis: "row" | "col" = Math.random() < 0.5 ? "row" : "col";
  let spineCells = placeCells(spineLen, occupied, null, spineAxis);
  if (!spineCells || !spineCells.some((p) => p.r === CENTRE && p.c === CENTRE)) {
    if (spineAxis === "row") {
      const minC = Math.max(0, CENTRE - (spineLen - 1));
      const maxC = Math.min(CENTRE, BOARD_SIZE - spineLen);
      if (minC > maxC) return null;
      const c0 = minC + Math.floor(Math.random() * (maxC - minC + 1));
      spineCells = Array.from({ length: spineLen }, (_, i) => ({ r: CENTRE, c: c0 + i }));
    } else {
      const minR = Math.max(0, CENTRE - (spineLen - 1));
      const maxR = Math.min(CENTRE, BOARD_SIZE - spineLen);
      if (minR > maxR) return null;
      const r0 = minR + Math.floor(Math.random() * (maxR - minR + 1));
      spineCells = Array.from({ length: spineLen }, (_, i) => ({ r: r0 + i, c: CENTRE }));
    }
  }
  const spineCards = buildHand(spineRecipe, spineLen, deck, null, 0);
  if (!spineCards) return null;
  spineCells.forEach((p, i) => occupied.set(key(p.r, p.c), spineCards[i]));

  let placedRuns = 1;
  let guard = 0;
  const fallback: Recipe[] = ["pair", "three", "twoPair", "straight", ...recipes];
  while (placedRuns < cfg.runs && guard++ < 80) {
    const tryRecipes = [...new Set([recipes[placedRuns % recipes.length], ...fallback])];
    const pivots = fisherYates([...occupied.keys()].map((k) => {
      const [r, c] = k.split(",").map(Number);
      return { r, c };
    }));
    let placed = false;
    recipeLoop: for (const recipe of tryRecipes) {
      const len = recipeLen(recipe);
      for (const pivot of pivots) {
        const rowBusy = [pivot.c - 1, pivot.c + 1].some((c) => c >= 0 && c < BOARD_SIZE && occupied.has(key(pivot.r, c)));
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
          placed = true;
          placedRuns++;
          break recipeLoop;
        }
      }
    }
    if (!placed) break;
  }

  const allCells = [...occupied.entries()].map(([k, rs]) => {
    const [r, c] = k.split(",").map(Number);
    return { r, c, ...rs };
  });
  if (!occupied.has(key(CENTRE, CENTRE)) || !cardCellsConnected(allCells)) return null;

  const rankFreq = new Map<string, number>();
  for (const cell of allCells) rankFreq.set(cell.rank, (rankFreq.get(cell.rank) ?? 0) + 1);
  const candidates = fisherYates(
    allCells.filter((c) => !(c.r === CENTRE && c.c === CENTRE)),
  );
  candidates.sort((a, b) => (rankFreq.get(a.rank)! - rankFreq.get(b.rank)!));

  const blocked = neededStops(occupied);
  const blockedSet = new Set(blocked.map((p) => key(p.r, p.c)));
  if (!everyCardInValidHand(occupied, blockedSet)) return null;

  const goal = Math.max(1, cfg.targets);
  const chosen: typeof allCells = [];
  for (const cell of candidates) {
    if (chosen.length >= goal) break;
    const trial = [...chosen, cell];
    if (hasUniqueSolution(levelFromParts(allCells, trial, blocked))) chosen.push(cell);
  }
  if (!chosen.length && candidates.length) chosen.push(candidates[0]);

  const targetKeys = new Set(chosen.map((c) => key(c.r, c.c)));
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
    grid: BOARD_SIZE,
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
    grid: BOARD_SIZE,
    blocked,
    fixed: allCells
      .filter((c) => !tset.has(key(c.r, c.c)))
      .map(({ r, c, rank, suit }) => ({ r, c, rank, suit })),
    targets: targets.map(({ r, c, rank, suit }) => ({ r, c, rank, suit })),
    hand: targets.map(({ rank, suit }) => ({ rank, suit })),
    win: { allPlaced: true, exactTargets: true },
  };
}

export function makeProceduralLevel(difficulty: Difficulty, table: number): Level {
  for (let i = 0; i < 80; i++) {
    const level = attemptLevel(difficulty, table);
    if (level && isValidLevel(level)) return level;
  }
  return minimalCentrePair(difficulty, table);
}

function minimalCentrePair(difficulty: Difficulty, table: number): Level {
  const deck = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit } as RS))));
  const cards = takeMatching(deck, (c) => c.rank === "A", 2) ?? [
    { rank: "A" as Rank, suit: "S" as Suit },
    { rank: "A" as Rank, suit: "H" as Suit },
  ];
  const fixed = [{ r: CENTRE, c: CENTRE, ...cards[0] }];
  const targets = [{ r: CENTRE, c: CENTRE + 1, ...cards[1] }];
  const label = difficulty[0].toUpperCase() + difficulty.slice(1);
  return {
    id: `endless-${difficulty}-${table}-min`,
    campaign: "endless",
    name: `${label} table ${table}`,
    number: table,
    briefing: "Fill every gold seat.",
    grid: BOARD_SIZE,
    group: difficulty,
    blocked: [],
    fixed,
    hand: targets.map(({ rank, suit }) => ({ rank, suit })),
    targets,
    win: { allPlaced: true, exactTargets: true },
  };
}

/**
 * True only when the designed target assignment is the unique way to place the
 * hand cards into the gold seats such that every card still participates in a
 * valid poker run.
 */
function hasUniqueSolution(level: Level): boolean {
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
  const used = new Array<boolean>(n).fill(false);
  const assign: RS[] = new Array(n);
  let foundOther = false;

  function rec(idx: number) {
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
      const occupied = new Map(baseOccupied);
      for (let i = 0; i < n; i++) {
        occupied.set(key(cells[i].r, cells[i].c), assign[i]);
      }
      if (everyCardInValidHand(occupied, blockedSet)) foundOther = true;
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      assign[idx] = cards[i];
      rec(idx + 1);
      used[i] = false;
      if (foundOther) return;
    }
  }

  rec(0);
  return !foundOther;
}

export function levelIssues(
  level: Level,
  opts: { requireCentre?: boolean; requireUnique?: boolean } = {},
): string[] {
  const requireCentre = opts.requireCentre !== false;
  const requireUnique = opts.requireUnique !== false;
  const issues: string[] = [];

  if (level.grid !== BOARD_SIZE) issues.push("Board must be 11×11.");
  if (!level.hand.length || !level.targets?.length) {
    issues.push("Mark at least one gold seat.");
  } else if (level.hand.length !== level.targets.length) {
    issues.push("Hand cards must match the gold seats.");
  }
  if ((level.targets?.length ?? 0) > 6) issues.push("At most six gold seats.");

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
  if (requireCentre && !cardCells.some((p) => p.r === CENTRE && p.c === CENTRE)) {
    issues.push("A card must sit on the centre square.");
  }
  const occupied = new Map<string, RS>();
  for (const f of level.fixed ?? []) occupied.set(key(f.r, f.c), { rank: f.rank, suit: f.suit });
  for (const t of level.targets ?? []) occupied.set(key(t.r, t.c), { rank: t.rank, suit: t.suit });
  const blockedSet = new Set((level.blocked ?? []).map((b) => key(b.r, b.c)));
  if (occupied.size && !everyCardInValidHand(occupied, blockedSet)) {
    issues.push("Every card must be part of a valid poker hand.");
  }
  if (requireUnique && (level.targets?.length ?? 0) > 0 && !hasUniqueSolution(level)) {
    issues.push("Each gold card must have only one correct seat.");
  }
  return [...new Set(issues)];
}

export function isValidLevel(level: Level): boolean {
  return levelIssues(level).length === 0;
}

/** A connected crossword of scoring cards — used as the Free Play deal. */
export function makeScoringDeal(): RS[] {
  const diffs: Difficulty[] = ["easy", "medium", "hard"];
  for (let i = 0; i < 80; i++) {
    const level = attemptLevel(diffs[i % diffs.length], 1);
    if (!level) continue;
    const cards: RS[] = [
      ...(level.fixed ?? []).map(({ rank, suit }) => ({ rank, suit })),
      ...level.hand,
    ];
    if (cards.length >= 8 && cards.length <= 16) return cards;
  }
  const deck: RS[] = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))));
  const out: RS[] = [];
  const pair = takeMatching(deck, (c) => c.rank === "A", 2);
  const trips = takeMatching(deck, (c) => c.rank === "K", 3);
  const two = takeMatching(deck, (c) => c.rank === "9", 2);
  const two2 = takeMatching(deck, (c) => c.rank === "5", 2);
  if (pair) out.push(...pair);
  if (trips) out.push(...trips);
  if (two) out.push(...two);
  if (two2) out.push(...two2);
  return out.length ? out : deck.slice(0, 12);
}

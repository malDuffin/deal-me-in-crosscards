import { fisherYates } from "./deck";
import { evaluateRun } from "./poker";
import { makeCard } from "./deck";
import {
  BOARD_SIZE,
  RANKS,
  SUITS,
  type Cell,
  type Difficulty,
  type Level,
  type Rank,
  type Suit,
} from "./types";

type RS = { rank: Rank; suit: Suit };
type Placed = { r: number; c: number; rank: Rank; suit: Suit; target: boolean };

const CENTRE = Math.floor(BOARD_SIZE / 2);

const PARAMS: Record<
  Difficulty,
  { runs: number; handBias: number; blockers: number; recipes: Recipe[] }
> = {
  beginner: {
    runs: 2,
    handBias: 0.35,
    blockers: 4,
    recipes: ["pair", "pair", "three"],
  },
  easy: {
    runs: 2,
    handBias: 0.55,
    blockers: 6,
    recipes: ["pair", "pair", "three"],
  },
  medium: {
    runs: 3,
    handBias: 0.5,
    blockers: 12,
    recipes: ["pair", "three", "twoPair", "straight"],
  },
  hard: {
    runs: 4,
    handBias: 0.48,
    blockers: 20,
    recipes: ["three", "twoPair", "straight", "flush", "fullHouse"],
  },
  expert: {
    runs: 5,
    handBias: 0.45,
    blockers: 28,
    recipes: ["straight", "flush", "fullHouse", "four", "twoPair", "three"],
  },
};

type Recipe = "pair" | "three" | "twoPair" | "straight" | "flush" | "fullHouse" | "four";

function key(r: number, c: number) {
  return `${r},${c}`;
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function neighbors(r: number, c: number): Cell[] {
  return [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ].filter((p) => inBounds(p.r, p.c));
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

/**
 * Build cards for a hand recipe, optionally locking some pivot cards
 * that must be included in the result.
 */
function buildHand(recipe: Recipe, deck: RS[], pivot?: RS[]): RS[] | null {
  if (recipe === "pair") {
    // If we have a pivot card, find a matching rank for the second card
    if (pivot?.length === 1) {
      const p = pivot[0];
      const second = takeMatching(deck, (c) => c.rank === p.rank && c.suit !== p.suit, 1);
      if (second) return [p, ...second];
      return null;
    }
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 2);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "three") {
    if (pivot?.length === 1) {
      const p = pivot[0];
      const rest = takeMatching(deck, (c) => c.rank === p.rank && c.suit !== p.suit, 2);
      if (rest) return [p, ...rest];
      return null;
    }
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 3);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "four") {
    if (pivot?.length === 1) {
      const p = pivot[0];
      const rest = takeMatching(deck, (c) => c.rank === p.rank && c.suit !== p.suit, 3);
      if (rest) return [p, ...rest];
      return null;
    }
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 4);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "twoPair") {
    const a = buildHand("pair", deck, pivot?.slice(0, 1));
    const b = buildHand("pair", deck);
    if (a && b) return [...a, ...b];
    if (a) deck.unshift(...a);
    if (b) deck.unshift(...b);
    return null;
  }
  if (recipe === "fullHouse") {
    const t = buildHand("three", deck, pivot?.slice(0, 1));
    const p = buildHand("pair", deck);
    if (t && p) return [...t, ...p];
    if (t) deck.unshift(...t);
    if (p) deck.unshift(...p);
    return null;
  }
  if (recipe === "flush") {
    const len = Math.random() < 0.5 ? 4 : 5;
    if (pivot?.length === 1) {
      const p = pivot[0];
      const rest = takeMatching(deck, (c) => c.suit === p.suit, len - 1);
      if (rest) return [p, ...rest];
      return null;
    }
    for (const suit of fisherYates([...SUITS])) {
      const cards = takeMatching(deck, (c) => c.suit === suit, len);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "straight") {
    const len = Math.random() < 0.45 ? 4 : 5;
    const order = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as Rank[];
    const startMax = order.length - len;
    const starts = fisherYates(Array.from({ length: startMax + 1 }, (_, i) => i));

    if (pivot?.length === 1) {
      const p = pivot[0];
      const pivotIdx = order.indexOf(p.rank);
      for (const s of starts) {
        if (pivotIdx < s || pivotIdx >= s + len) continue;
        const ranks = order.slice(s, s + len);
        const pivotRanks = ranks.filter((r) => r !== p.rank);
        const picked: RS[] = [p];
        const usedIdx: number[] = [];
        let ok = true;
        for (const rank of pivotRanks) {
          const idx = deck.findIndex((c, i) => c.rank === rank && !usedIdx.includes(i));
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
      return null;
    }

    for (const s of starts) {
      const ranks = order.slice(s, s + len);
      const picked: RS[] = [];
      const usedIdx: number[] = [];
      let ok = true;
      for (const rank of ranks) {
        const idx = deck.findIndex((c, i) => c.rank === rank && !usedIdx.includes(i));
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
    return null;
  }
  return null;
}

/**
 * Check that every card cell in the placed array participates in at least
 * one valid poker hand (consecutive run).
 */
function everyCardInValidHand(placed: Placed[]): boolean {
  const cellCard = new Map<string, RS>();
  for (const p of placed) {
    cellCard.set(key(p.r, p.c), { rank: p.rank, suit: p.suit });
  }

  const cardInHand = new Set<string>();

  // Check rows
  for (let r = 0; r < BOARD_SIZE; r++) {
    let run: { k: string; card: RS }[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const k = key(r, c);
      const card = cellCard.get(k);
      if (card) {
        run.push({ k, card });
      } else {
        if (run.length >= 2) {
          const cards = run.map((x, i) => makeCard(x.card.rank, x.card.suit, i));
          if (evaluateRun(cards)) run.forEach((x) => cardInHand.add(x.k));
        }
        run = [];
      }
    }
    if (run.length >= 2) {
      const cards = run.map((x, i) => makeCard(x.card.rank, x.card.suit, i));
      if (evaluateRun(cards)) run.forEach((x) => cardInHand.add(x.k));
    }
  }

  // Check cols
  for (let c = 0; c < BOARD_SIZE; c++) {
    let run: { k: string; card: RS }[] = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      const k = key(r, c);
      const card = cellCard.get(k);
      if (card) {
        run.push({ k, card });
      } else {
        if (run.length >= 2) {
          const cards = run.map((x, i) => makeCard(x.card.rank, x.card.suit, i));
          if (evaluateRun(cards)) run.forEach((x) => cardInHand.add(x.k));
        }
        run = [];
      }
    }
    if (run.length >= 2) {
      const cards = run.map((x, i) => makeCard(x.card.rank, x.card.suit, i));
      if (evaluateRun(cards)) run.forEach((x) => cardInHand.add(x.k));
    }
  }

  return placed.every((p) => cardInHand.has(key(p.r, p.c)));
}

/** Check all card cells form one connected component including centre cell. */
function isConnected(placed: Placed[]): boolean {
  if (!placed.length) return false;
  const cellSet = new Set(placed.map((p) => key(p.r, p.c)));
  if (!cellSet.has(key(CENTRE, CENTRE))) return false;

  const visited = new Set<string>();
  const queue: string[] = [key(CENTRE, CENTRE)];
  while (queue.length) {
    const k = queue.pop()!;
    if (visited.has(k)) continue;
    visited.add(k);
    const [r, c] = k.split(",").map(Number);
    for (const nb of neighbors(r, c)) {
      const nk = key(nb.r, nb.c);
      if (cellSet.has(nk) && !visited.has(nk)) queue.push(nk);
    }
  }
  return visited.size === cellSet.size;
}

/**
 * Reject levels where any non-identity permutation of hand (target) cards
 * onto gold seats still has every card in a valid run.
 * Returns true if the solution is unique.
 */
function hasUniqueSolution(placed: Placed[]): boolean {
  const targets = placed.filter((p) => p.target);
  if (targets.length <= 1) return true;

  // Group targets by rank — only same-rank cards are interchangeable
  const byRank = new Map<Rank, Placed[]>();
  for (const t of targets) {
    const arr = byRank.get(t.rank) ?? [];
    arr.push(t);
    byRank.set(t.rank, arr);
  }

  // If all target ranks are distinct, solution is already unique
  const hasDupe = [...byRank.values()].some((arr) => arr.length > 1);
  if (!hasDupe) return true;

  // Try swapping same-rank targets; if swapped placement still has all cards in valid hand → not unique
  for (const [, group] of byRank) {
    if (group.length < 2) continue;
    // Try swapping pair within group
    const swapped = placed.map((p) => ({ ...p }));
    // find indices in placed
    const gi = group.map((g) => placed.indexOf(g));
    // swap positions of first two
    const a = gi[0], b = gi[1];
    const tmp = { r: swapped[a].r, c: swapped[a].c };
    swapped[a].r = swapped[b].r; swapped[a].c = swapped[b].c;
    swapped[b].r = tmp.r; swapped[b].c = tmp.c;

    if (everyCardInValidHand(swapped)) return false;
  }
  return true;
}

/**
 * Place a run of cards as a branch from a pivot cell.
 * Direction: perpendicular to the spine axis.
 * pivot: the connecting cell (already in occupied); branch grows away from it.
 */
function placeBranch(
  cards: RS[],
  pivotR: number,
  pivotC: number,
  horiz: boolean, // if spine is horiz, branch is vertical and vice versa
  occupied: Set<string>,
): Placed[] | null {
  const len = cards.length;
  // Try both directions from pivot
  for (const dir of fisherYates([-1, 1])) {
    const cells: Cell[] = [];
    let ok = true;
    for (let i = 0; i < len; i++) {
      const r = horiz ? pivotR + dir * (i + 1) : pivotR;
      const c = horiz ? pivotC : pivotC + dir * (i + 1);
      if (!inBounds(r, c) || occupied.has(key(r, c))) { ok = false; break; }
      cells.push({ r, c });
    }
    if (ok) return cells.map((cell, i) => ({ ...cell, ...cards[i], target: false }));
  }
  return null;
}

/**
 * Place a run of cards along the spine (row or column through CENTRE).
 */
function placeSpineRun(
  cards: RS[],
  spineHoriz: boolean,
  spineOffset: number,
  occupied: Set<string>,
): Placed[] | null {
  const len = cards.length;
  const maxStart = BOARD_SIZE - len;
  const starts = fisherYates(Array.from({ length: maxStart + 1 }, (_, i) => i));
  for (const s of starts) {
    const cells: Cell[] = Array.from({ length: len }, (_, i) => ({
      r: spineHoriz ? spineOffset : s + i,
      c: spineHoriz ? s + i : spineOffset,
    }));
    if (cells.some((p) => occupied.has(key(p.r, p.c)))) continue;
    if (!cells.some((p) => p.r === CENTRE && p.c === CENTRE) &&
        !cells.some((p) => (spineHoriz ? p.c : p.r) === CENTRE)) {
      // Must pass through or near centre
      if (!cells.some((p) => p.r === CENTRE || p.c === CENTRE)) continue;
    }
    return cells.map((cell, i) => ({ ...cell, ...cards[i], target: false }));
  }
  return null;
}

function minimalCentrePair(difficulty: Difficulty, table: number): Level {
  // Minimal fallback: two cards placed horizontally through centre, one is target
  const deck: RS[] = fisherYates(SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))));
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const cards = deck.filter((c) => c.rank === rank).slice(0, 2);
  const fixed = [{ r: CENTRE, c: CENTRE - 1, rank: cards[0].rank, suit: cards[0].suit }];
  const targets = [{ r: CENTRE, c: CENTRE, rank: cards[1].rank, suit: cards[1].suit }];
  const hand = targets.map(({ rank, suit }) => ({ rank, suit }));
  const label = difficulty[0].toUpperCase() + difficulty.slice(1);
  return {
    id: `endless-${difficulty}-${table}-${Date.now().toString(36)}`,
    campaign: "endless",
    name: `${label} table ${table}`,
    number: table,
    briefing: "Fill every gold seat. The cards only score in their marked places.",
    grid: BOARD_SIZE,
    group: difficulty,
    blocked: [],
    fixed,
    hand,
    targets,
    win: { allPlaced: true, exactTargets: true },
  };
}

function attemptLevel(difficulty: Difficulty, table: number): Level | null {
  const cfg = PARAMS[difficulty];
  const deck: RS[] = fisherYates(
    SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))),
  );

  const occupied = new Set<string>();
  const placed: Placed[] = [];
  const recipes = fisherYates(cfg.recipes.slice());

  // Spine: always goes through centre row or column
  const spineHoriz = Math.random() < 0.5;
  const spineOffset = CENTRE; // row CENTRE (horiz) or col CENTRE (vert)

  // First run: along the spine, must include centre cell
  const firstRecipe = recipes[0];
  const firstCards = buildHand(firstRecipe, deck);
  if (!firstCards) return null;

  // Force a spine run that passes through centre
  let spineRun: Placed[] | null = null;
  const len = firstCards.length;
  // Try positions that include the centre cell on the spine
  for (const dir of [-1, 0, 1, -2, 2]) {
    const start = CENTRE - Math.floor(len / 2) + dir;
    if (start < 0 || start + len > BOARD_SIZE) continue;
    const cells: Cell[] = Array.from({ length: len }, (_, i) => ({
      r: spineHoriz ? spineOffset : start + i,
      c: spineHoriz ? start + i : spineOffset,
    }));
    if (cells.some((p) => occupied.has(key(p.r, p.c)))) continue;
    spineRun = cells.map((cell, i) => ({ ...cell, ...firstCards[i], target: false }));
    break;
  }
  if (!spineRun) {
    // put cards back
    deck.unshift(...firstCards);
    // fallback: just pick any spine run
    spineRun = placeSpineRun(firstCards, spineHoriz, spineOffset, occupied);
    if (!spineRun) return null;
  }

  for (const p of spineRun) occupied.add(key(p.r, p.c));
  placed.push(...spineRun);

  // Find pivot on spine closest to centre (for branches)
  const pivots = spineRun.map((p) => ({ ...p }));

  // Remaining runs: perpendicular branches from pivots
  for (let i = 1; i < cfg.runs; i++) {
    const recipe = recipes[i % recipes.length];
    // Pick a pivot cell from existing placed cards
    const pivot = fisherYates(pivots)[0];
    if (!pivot) break;

    const cards = buildHand(recipe, deck, [{ rank: pivot.rank, suit: pivot.suit }]);
    if (!cards) continue;

    // Try placing branch perpendicular to spine
    const branchHoriz = !spineHoriz;
    let branch: Placed[] | null = null;

    // The pivot is the first card; place remaining cards as the branch
    const branchCards = cards.filter((_, idx) => idx !== 0 || cards[0].rank !== pivot.rank || cards[0].suit !== pivot.suit);
    // Actually: pivot is already placed, we need only remaining cards from the hand
    // Use pivot as connection point; place the rest
    const remaining = cards.slice(1);

    for (const dir of fisherYates([-1, 1])) {
      const cells: Cell[] = [];
      let ok = true;
      for (let j = 0; j < remaining.length; j++) {
        const r = branchHoriz ? pivot.r : pivot.r + dir * (j + 1);
        const c = branchHoriz ? pivot.c + dir * (j + 1) : pivot.c;
        if (!inBounds(r, c) || occupied.has(key(r, c))) { ok = false; break; }
        cells.push({ r, c });
      }
      if (ok) {
        // The pivot cell is already placed; we add only the branch cells
        // but we need to include pivot as part of the run visually
        branch = cells.map((cell, idx) => ({ ...cell, ...remaining[idx], target: false }));
        break;
      }
    }

    if (!branch) {
      deck.unshift(...cards.slice(1)); // return non-pivot cards
      continue;
    }
    for (const p of branch) occupied.add(key(p.r, p.c));
    placed.push(...branch);
  }

  // Assign targets: prefer distinct ranks, modest count (max ~3)
  const handBias = cfg.handBias;
  // Prefer singleton ranks (ranks appearing only once among placed)
  const rankCount = new Map<Rank, number>();
  for (const p of placed) rankCount.set(p.rank, (rankCount.get(p.rank) ?? 0) + 1);
  const singletons = placed.filter((p) => rankCount.get(p.rank) === 1);
  const nonSingletons = placed.filter((p) => (rankCount.get(p.rank) ?? 0) > 1);

  // Choose targets from singletons first
  const targetPool = [...fisherYates(singletons), ...fisherYates(nonSingletons)];
  let targetCount = 0;
  const maxTargets = Math.min(3, Math.max(1, Math.ceil(placed.length * handBias)));

  for (const p of targetPool) {
    if (targetCount >= maxTargets) break;
    p.target = true;
    targetCount++;
  }

  if (targetCount === 0) {
    // Fallback: make the last placed card a target
    placed[placed.length - 1].target = true;
  }

  // Blockers
  const blocked: Cell[] = [];
  let b = 0;
  let guard = 0;
  while (b < cfg.blockers && guard++ < 400) {
    const r = Math.floor(Math.random() * BOARD_SIZE);
    const c = Math.floor(Math.random() * BOARD_SIZE);
    if (occupied.has(key(r, c))) continue;
    const near = neighbors(r, c).some((p) => occupied.has(key(p.r, p.c)));
    if (!near && Math.random() < 0.65) continue;
    occupied.add(key(r, c));
    blocked.push({ r, c });
    b++;
  }

  // Validate
  if (!everyCardInValidHand(placed)) return null;
  if (!isConnected(placed)) return null;
  if (!hasUniqueSolution(placed)) return null;

  const fixed = placed.filter((p) => !p.target).map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const targets = placed.filter((p) => p.target).map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const hand = targets.map(({ rank, suit }) => ({ rank, suit }));

  if (!hand.length) return null;
  if (!occupied.has(key(CENTRE, CENTRE))) return null;

  const label = difficulty[0].toUpperCase() + difficulty.slice(1);
  return {
    id: `endless-${difficulty}-${table}-${Date.now().toString(36)}`,
    campaign: "endless",
    name: `${label} table ${table}`,
    number: table,
    briefing: "Fill every gold seat. The cards only score in their marked places.",
    grid: BOARD_SIZE,
    group: difficulty,
    blocked,
    fixed,
    hand,
    targets,
    win: { allPlaced: true, exactTargets: true },
  };
}

export function makeProceduralLevel(difficulty: Difficulty, table: number): Level {
  for (let attempt = 0; attempt < 80; attempt++) {
    const level = attemptLevel(difficulty, table);
    if (level && isValidLevel(level)) return level;
  }
  return minimalCentrePair(difficulty, table);
}

export function isValidLevel(level: Level): boolean {
  if (level.grid !== BOARD_SIZE) return false;
  if (!level.hand.length || !level.targets?.length) return false;
  if (level.hand.length !== level.targets.length) return false;

  const used = new Set<string>();
  const cards = new Set<string>();
  const take = (r: number, c: number, rank: Rank, suit: Suit) => {
    if (!inBounds(r, c)) return false;
    const k = key(r, c);
    if (used.has(k)) return false;
    const ck = `${rank}${suit}`;
    if (cards.has(ck)) return false;
    used.add(k);
    cards.add(ck);
    return true;
  };
  for (const f of level.fixed ?? []) {
    if (!take(f.r, f.c, f.rank, f.suit)) return false;
  }
  for (const t of level.targets ?? []) {
    if (!take(t.r, t.c, t.rank, t.suit)) return false;
  }
  for (const b of level.blocked ?? []) {
    if (!inBounds(b.r, b.c)) return false;
    if (used.has(key(b.r, b.c))) return false;
    used.add(key(b.r, b.c));
  }
  const bag = [...level.hand.map((h) => `${h.rank}${h.suit}`)].sort();
  const tbag = [...(level.targets ?? []).map((t) => `${t.rank}${t.suit}`)].sort();
  if (bag.join() !== tbag.join()) return false;

  // Centre cell must be occupied
  if (!used.has(key(CENTRE, CENTRE))) return false;

  // Reconstruct placed for deeper checks
  const allPlaced: Placed[] = [
    ...(level.fixed ?? []).map((f) => ({ ...f, target: false })),
    ...(level.targets ?? []).map((t) => ({ ...t, target: true })),
  ];

  if (!everyCardInValidHand(allPlaced)) return false;
  if (!isConnected(allPlaced)) return false;
  if (!hasUniqueSolution(allPlaced)) return false;

  return true;
}

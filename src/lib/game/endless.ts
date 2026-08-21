import { fisherYates } from "./deck";
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

const PARAMS: Record<
  Difficulty,
  { runs: number; handBias: number; blockers: number; decoys: number; recipes: Recipe[] }
> = {
  easy: {
    runs: 2,
    handBias: 0.55,
    blockers: 6,
    decoys: 8,
    recipes: ["pair", "pair", "three"],
  },
  medium: {
    runs: 3,
    handBias: 0.5,
    blockers: 12,
    decoys: 10,
    recipes: ["pair", "three", "twoPair", "straight"],
  },
  hard: {
    runs: 4,
    handBias: 0.48,
    blockers: 20,
    decoys: 12,
    recipes: ["three", "twoPair", "straight", "flush", "fullHouse"],
  },
  expert: {
    runs: 5,
    handBias: 0.45,
    blockers: 28,
    decoys: 14,
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

function makeRunCards(recipe: Recipe, deck: RS[]): RS[] | null {
  if (recipe === "pair") {
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 2);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "three") {
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 3);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "four") {
    for (const rank of fisherYates([...RANKS])) {
      const cards = takeMatching(deck, (c) => c.rank === rank, 4);
      if (cards) return cards;
    }
    return null;
  }
  if (recipe === "twoPair") {
    const a = makeRunCards("pair", deck);
    const b = makeRunCards("pair", deck);
    if (a && b) return [...a, ...b];
    if (a) deck.unshift(...a);
    if (b) deck.unshift(...b);
    return null;
  }
  if (recipe === "fullHouse") {
    const t = makeRunCards("three", deck);
    const p = makeRunCards("pair", deck);
    if (t && p) return [...t, ...p];
    if (t) deck.unshift(...t);
    if (p) deck.unshift(...p);
    return null;
  }
  if (recipe === "flush") {
    const len = Math.random() < 0.5 ? 4 : 5;
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
    for (const s of starts) {
      const ranks = order.slice(s, s + len);
      const picked: RS[] = [];
      const usedIdx: number[] = [];
      let ok = true;
      for (const rank of ranks) {
        const idx = deck.findIndex((c, i) => c.rank === rank && !usedIdx.includes(i));
        if (idx < 0) {
          ok = false;
          break;
        }
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

function tryCells(len: number, occupied: Set<string>): Cell[] | null {
  for (let attempt = 0; attempt < 50; attempt++) {
    const horiz = Math.random() < 0.5;
    if (horiz) {
      const r = Math.floor(Math.random() * BOARD_SIZE);
      const c0 = Math.floor(Math.random() * (BOARD_SIZE - len + 1));
      const cells = Array.from({ length: len }, (_, i) => ({ r, c: c0 + i }));
      if (cells.every((p) => !occupied.has(key(p.r, p.c)))) return cells;
    } else {
      const c = Math.floor(Math.random() * BOARD_SIZE);
      const r0 = Math.floor(Math.random() * (BOARD_SIZE - len + 1));
      const cells = Array.from({ length: len }, (_, i) => ({ r: r0 + i, c }));
      if (cells.every((p) => !occupied.has(key(p.r, p.c)))) return cells;
    }
  }
  return null;
}

function neighbors(r: number, c: number): Cell[] {
  return [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ].filter((p) => inBounds(p.r, p.c));
}

export function makeProceduralLevel(difficulty: Difficulty, table: number): Level {
  const cfg = PARAMS[difficulty];
  const deck: RS[] = fisherYates(
    SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }))),
  );

  const occupied = new Set<string>();
  const placed: Placed[] = [];
  const recipes = fisherYates(cfg.recipes.slice());

  for (let i = 0; i < cfg.runs; i++) {
    const recipe = recipes[i % recipes.length];
    const cards = makeRunCards(recipe, deck);
    if (!cards) continue;
    const cells = tryCells(cards.length, occupied);
    if (!cells) {
      deck.unshift(...cards);
      continue;
    }
    let targets = 0;
    cards.forEach((card, idx) => {
      const isTarget = Math.random() < cfg.handBias || (idx === cards.length - 1 && targets === 0);
      if (isTarget) targets++;
      occupied.add(key(cells[idx].r, cells[idx].c));
      placed.push({ ...cells[idx], ...card, target: isTarget });
    });
  }

  let decoys = 0;
  while (decoys < cfg.decoys && deck.length) {
    const r = Math.floor(Math.random() * BOARD_SIZE);
    const c = Math.floor(Math.random() * BOARD_SIZE);
    if (occupied.has(key(r, c))) continue;
    const card = deck.shift()!;
    occupied.add(key(r, c));
    placed.push({ r, c, ...card, target: false });
    decoys++;
  }

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

  const fixed = placed.filter((p) => !p.target).map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const targets = placed.filter((p) => p.target).map(({ r, c, rank, suit }) => ({ r, c, rank, suit }));
  const hand = targets.map(({ rank, suit }) => ({ rank, suit }));

  if (hand.length === 0 && deck.length) {
    const host = placed[0];
    if (host) {
      const n = neighbors(host.r, host.c).find((p) => !occupied.has(key(p.r, p.c)));
      if (n) {
        const card = deck.shift()!;
        targets.push({ ...n, ...card });
        hand.push({ rank: card.rank, suit: card.suit });
      }
    }
  }

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
  return bag.join() === tbag.join();
}

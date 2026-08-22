import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { levelIssues, neededStops, makeScoringDeal } = await jiti.import("../src/lib/game/endless.ts");

const L = (over) => ({
  id: "t",
  campaign: "endless",
  name: "t",
  number: 1,
  briefing: "",
  grid: 11,
  group: "hard",
  blocked: [],
  win: { allPlaced: true, exactTargets: true },
  ...over,
});

describe("gold force inventory", () => {
  it("rejects the Hard 8s over-demand (8 under 8♦/8♠ AND 8s above 8♣-10-10)", () => {
    const level = L({
      fixed: [
        { r: 4, c: 4, rank: "8", suit: "D" },
        { r: 5, c: 4, rank: "8", suit: "S" },
        { r: 6, c: 2, rank: "8", suit: "C" },
        { r: 7, c: 2, rank: "10", suit: "H" },
        { r: 8, c: 2, rank: "10", suit: "D" },
        { r: 5, c: 5, rank: "A", suit: "S" },
      ],
      targets: [
        { r: 6, c: 4, rank: "8", suit: "H" },
        { r: 4, c: 2, rank: "7", suit: "C" },
        { r: 5, c: 2, rank: "7", suit: "D" },
      ],
      hand: [
        { rank: "8", suit: "H" },
        { rank: "7", suit: "C" },
        { rank: "7", suit: "D" },
      ],
    });
    const issues = levelIssues(level, { requireUnique: false });
    assert.ok(
      issues.some((s) => /force more copies/i.test(s)),
      `expected force-inventory issue, got: ${issues.join(" | ")}`,
    );
  });

  it("accepts a single forced 8 with enough 8s in the hand", () => {
    const level = L({
      fixed: [
        { r: 4, c: 4, rank: "8", suit: "D" },
        { r: 5, c: 4, rank: "8", suit: "S" },
        { r: 5, c: 5, rank: "A", suit: "S" },
      ],
      targets: [{ r: 6, c: 4, rank: "8", suit: "H" }],
      hand: [{ rank: "8", suit: "H" }],
    });
    const issues = levelIssues(level, { requireUnique: false });
    assert.ok(
      !issues.some((s) => /force more copies/i.test(s)),
      `unexpected force issue: ${issues.join(" | ")}`,
    );
  });

  it("accepts sequential two-pair golds (7-7 next to fixed 10-10)", () => {
    const level = L({
      fixed: [
        { r: 5, c: 5, rank: "A", suit: "S" },
        { r: 6, c: 2, rank: "10", suit: "H" },
        { r: 7, c: 2, rank: "10", suit: "D" },
      ],
      targets: [
        { r: 4, c: 2, rank: "7", suit: "C" },
        { r: 5, c: 2, rank: "7", suit: "D" },
      ],
      hand: [
        { rank: "7", suit: "C" },
        { rank: "7", suit: "D" },
      ],
    });
    const issues = levelIssues(level, { requireUnique: false });
    assert.ok(
      !issues.some((s) => /force more copies/i.test(s)),
      `unexpected force issue: ${issues.join(" | ")}`,
    );
  });
});

describe("endless gold floors", () => {
  it("rejects a 1-gold Expert pair", () => {
    const level = L({
      group: "expert",
      fixed: [{ r: 5, c: 5, rank: "A", suit: "D" }],
      targets: [{ r: 5, c: 6, rank: "A", suit: "C" }],
      hand: [{ rank: "A", suit: "C" }],
    });
    const issues = levelIssues(level, { requireUnique: false });
    assert.ok(
      issues.some((s) => /at least 20 gold/i.test(s)),
      `expected gold-floor issue, got: ${issues.join(" | ")}`,
    );
  });

  it("rejects a 1-gold Hard pair", () => {
    const level = L({
      group: "hard",
      fixed: [{ r: 5, c: 5, rank: "A", suit: "D" }],
      targets: [{ r: 5, c: 6, rank: "A", suit: "C" }],
      hand: [{ rank: "A", suit: "C" }],
    });
    const issues = levelIssues(level, { requireUnique: false });
    assert.ok(
      issues.some((s) => /at least 14 gold/i.test(s)),
      `expected gold-floor issue, got: ${issues.join(" | ")}`,
    );
  });
});

describe("unique solution", () => {
  it("rejects two interchangeable 5s in separate pair seats", () => {
    // Two fixed 5s each paired with a gold 5 — either hand 5 can sit in either seat.
    const level = L({
      group: "beginner",
      fixed: [
        { r: 5, c: 5, rank: "5", suit: "C" },
        { r: 0, c: 0, rank: "5", suit: "H" },
        { r: 8, c: 0, rank: "2", suit: "C" },
        { r: 8, c: 2, rank: "3", suit: "C" },
      ],
      targets: [
        { r: 5, c: 6, rank: "5", suit: "D" },
        { r: 0, c: 1, rank: "5", suit: "S" },
        { r: 9, c: 0, rank: "2", suit: "D" },
        { r: 9, c: 2, rank: "3", suit: "D" },
      ],
      hand: [
        { rank: "5", suit: "D" },
        { rank: "5", suit: "S" },
        { rank: "2", suit: "D" },
        { rank: "3", suit: "D" },
      ],
    });
    const issues = levelIssues(level, { requireUnique: true, requireCentre: false });
    assert.ok(
      issues.some((s) => /one correct seat/i.test(s)),
      `expected unique-seat issue, got: ${issues.join(" | ")}`,
    );
  });

  it("rejects four freely ordered Aces", () => {
    const level = L({
      group: "beginner",
      fixed: [],
      targets: [
        { r: 5, c: 4, rank: "A", suit: "S" },
        { r: 5, c: 5, rank: "A", suit: "H" },
        { r: 5, c: 6, rank: "A", suit: "D" },
        { r: 5, c: 7, rank: "A", suit: "C" },
      ],
      hand: [
        { rank: "A", suit: "S" },
        { rank: "A", suit: "H" },
        { rank: "A", suit: "D" },
        { rank: "A", suit: "C" },
      ],
    });
    const issues = levelIssues(level, { requireUnique: true, requireCentre: false });
    assert.ok(
      issues.some((s) => /one correct seat/i.test(s)),
      `expected unique-seat issue, got: ${issues.join(" | ")}`,
    );
  });
});

describe("neededStops closes dead-end pairs", () => {
  it("puts stops at both ends of four of a kind", () => {
    const occupied = new Map([
      ["5,5", { rank: "A", suit: "S" }],
      ["5,6", { rank: "A", suit: "H" }],
      ["5,4", { rank: "A", suit: "D" }],
      ["5,7", { rank: "A", suit: "C" }],
    ]);
    const stops = neededStops(occupied);
    const keys = new Set(stops.map((p) => `${p.r},${p.c}`));
    assert.ok(keys.has("5,3"), "stop before four aces");
    assert.ok(keys.has("5,8"), "stop after four aces");
  });
});

const ACE_HIGH = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const ACE_LOW = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function rankCanStraight(cards, rank) {
  for (const order of [ACE_HIGH, ACE_LOW]) {
    const present = new Set(cards.map((c) => c.rank));
    const idx = order.indexOf(rank);
    if (idx < 0) continue;
    for (let start = Math.max(0, idx - 4); start <= idx && start + 4 < order.length; start++) {
      const window = order.slice(start, start + 5);
      if (window.every((r) => present.has(r))) return true;
    }
  }
  return false;
}

describe("free play deals are closed scoring sets", () => {
  it("never deals a singleton that cannot join a flush or straight", () => {
    for (let n = 0; n < 20; n++) {
      const cards = makeScoringDeal();
      assert.ok(cards.length >= 8 && cards.length <= 12, `deal size ${cards.length}`);
      const ids = cards.map((c) => `${c.rank}${c.suit}`);
      assert.equal(new Set(ids).size, ids.length, "duplicate cards in deal");
      const rankN = new Map();
      const suitN = new Map();
      for (const c of cards) {
        rankN.set(c.rank, (rankN.get(c.rank) ?? 0) + 1);
        suitN.set(c.suit, (suitN.get(c.suit) ?? 0) + 1);
      }
      for (const c of cards) {
        if ((rankN.get(c.rank) ?? 0) >= 2) continue;
        const flush = (suitN.get(c.suit) ?? 0) >= 5;
        const straight = rankCanStraight(cards, c.rank);
        assert.ok(
          flush || straight,
          `orphan ${c.rank}${c.suit} in ${ids.join(" ")}`,
        );
      }
    }
  });
});

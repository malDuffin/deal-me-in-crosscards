import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { levelIssues, neededStops } = await jiti.import("../src/lib/game/endless.ts");

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

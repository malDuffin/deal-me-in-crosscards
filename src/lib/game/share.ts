/**
 * Encode / decode levels for shareable URLs (base64url JSON).
 */
import {
  BOARD_SIZE,
  RANKS,
  SUITS,
  type Level,
  type Rank,
  type Suit,
} from "./types";
import { isValidLevel } from "./endless";

type WireLevel = {
  n?: string;
  b?: string;
  g?: string;
  blocked?: [number, number][];
  fixed?: [number, number, string, string][];
  targets?: [number, number, string, string][];
  hand?: [string, string][];
  win?: Level["win"];
};

function toB64Url(bytes: string): string {
  if (typeof btoa === "function") {
    return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(bytes, "binary").toString("base64url");
}

function fromB64Url(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") return atob(b64);
  return Buffer.from(b64, "base64").toString("binary");
}

export function encodeLevel(level: Level): string {
  const wire: WireLevel = {
    n: level.name,
    b: level.briefing,
    g: level.group,
    blocked: (level.blocked ?? []).map((c) => [c.r, c.c]),
    fixed: (level.fixed ?? []).map((f) => [f.r, f.c, f.rank, f.suit]),
    targets: (level.targets ?? []).map((t) => [t.r, t.c, t.rank, t.suit]),
    hand: level.hand.map((h) => [h.rank, h.suit]),
    win: level.win,
  };
  return toB64Url(JSON.stringify(wire));
}

function asRank(r: string): Rank | null {
  return (RANKS as readonly string[]).includes(r) ? (r as Rank) : null;
}
function asSuit(s: string): Suit | null {
  return (SUITS as readonly string[]).includes(s) ? (s as Suit) : null;
}

export function decodeLevel(payload: string): Level | null {
  try {
    const raw = JSON.parse(fromB64Url(payload)) as WireLevel;
    const fixed = (raw.fixed ?? [])
      .map(([r, c, rank, suit]) => {
        const rk = asRank(rank);
        const st = asSuit(suit);
        if (rk == null || st == null) return null;
        return { r, c, rank: rk, suit: st };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    const targets = (raw.targets ?? [])
      .map(([r, c, rank, suit]) => {
        const rk = asRank(rank);
        const st = asSuit(suit);
        if (rk == null || st == null) return null;
        return { r, c, rank: rk, suit: st };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    const hand =
      raw.hand && raw.hand.length
        ? raw.hand
            .map(([rank, suit]) => {
              const rk = asRank(rank);
              const st = asSuit(suit);
              if (rk == null || st == null) return null;
              return { rank: rk, suit: st };
            })
            .filter((x): x is NonNullable<typeof x> => x != null)
        : targets.map(({ rank, suit }) => ({ rank, suit }));
    const level: Level = {
      id: `shared-${Date.now().toString(36)}`,
      campaign: "custom",
      name: (raw.n ?? "Shared table").slice(0, 48),
      number: 0,
      briefing: (raw.b ?? "A shared CrossCards table.").slice(0, 200),
      grid: BOARD_SIZE,
      group: raw.g,
      blocked: (raw.blocked ?? []).map(([r, c]) => ({ r, c })),
      fixed,
      hand,
      targets,
      win: raw.win ?? { allPlaced: true, exactTargets: true },
    };
    return isValidLevel(level) ? level : null;
  } catch {
    return null;
  }
}

export function levelShareUrl(level: Level, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://example.com");
  return `${base}/play?mode=custom&share=${encodeLevel(level)}`;
}

export function gameShareUrl(origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://example.com");
  return `${base}/`;
}

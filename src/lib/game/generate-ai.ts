import { createServerFn } from "@tanstack/react-start";
import { makeProceduralLevel, isValidLevel } from "./endless";
import {
  BOARD_SIZE,
  RANKS,
  SUITS,
  type Difficulty,
  type Level,
  type Rank,
  type Suit,
} from "./types";

const DIFFS: Difficulty[] = ["easy", "medium", "hard", "expert"];
const AI_TIMEOUT_MS = 7000;

type AiPuzzle = {
  name?: string;
  briefing?: string;
  blocked?: { r: number; c: number }[];
  fixed?: { r: number; c: number; rank: string; suit: string }[];
  hand?: { rank: string; suit: string }[];
  targets?: { r: number; c: number; rank: string; suit: string }[];
};

function asRank(r: string): Rank | null {
  return (RANKS as readonly string[]).includes(r) ? (r as Rank) : null;
}
function asSuit(s: string): Suit | null {
  return (SUITS as readonly string[]).includes(s) ? (s as Suit) : null;
}

function hydrateAi(raw: AiPuzzle, difficulty: Difficulty, table: number): Level | null {
  const rankSuit = (x: { rank: string; suit: string }) => {
    const rank = asRank(x.rank);
    const suit = asSuit(x.suit);
    if (!rank || !suit) return null;
    return { rank, suit };
  };
  const fixed = (raw.fixed ?? [])
    .map((f) => {
      const rs = rankSuit(f);
      return rs ? { r: f.r, c: f.c, ...rs } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const targets = (raw.targets ?? [])
    .map((t) => {
      const rs = rankSuit(t);
      return rs ? { r: t.r, c: t.c, ...rs } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const hand =
    raw.hand && raw.hand.length
      ? raw.hand.map(rankSuit).filter((x): x is NonNullable<typeof x> => x != null)
      : targets.map(({ rank, suit }) => ({ rank, suit }));
  const blocked = (raw.blocked ?? []).map((b) => ({ r: b.r, c: b.c }));
  const level: Level = {
    id: `endless-${difficulty}-${table}-ai`,
    campaign: "endless",
    name: raw.name?.slice(0, 42) || `${difficulty} table ${table}`,
    number: table,
    briefing:
      raw.briefing?.slice(0, 140) ||
      "Fill every gold seat. The cards only score in their marked places.",
    grid: BOARD_SIZE,
    group: difficulty,
    blocked,
    fixed,
    hand,
    targets,
    win: { allPlaced: true, exactTargets: true },
  };
  return isValidLevel(level) ? level : null;
}

function extractJson(text: string): AiPuzzle | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as AiPuzzle;
  } catch {
    return null;
  }
}

async function askPuzzle(
  apiKey: string,
  difficulty: Difficulty,
  table: number,
): Promise<Level | null> {
  const hint =
    difficulty === "easy"
      ? "11–15 gold seats on a near-full ~48–52 card board, pairs / three of a kind / two pair."
      : difficulty === "medium"
        ? "12–17 gold seats on a ~48–52 card board, mix of pairs, threes, straight or two pair."
        : difficulty === "hard"
          ? "16–25 gold seats on a ~48–52 card board, include a flush or full house, interlocking runs."
          : "22–26 gold seats on a full ~46–52 card board, denser gold than fixed, four of a kind OK.";

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 1200,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You design CrossCards puzzles. Reply with JSON only.",
          },
          {
            role: "user",
            content: `Create one unique 11x11 CrossCards puzzle, table ${table}, difficulty ${difficulty}. ${hint}
Coordinates r,c are integers 0-10. Cards use rank A,2-10,J,Q,K and suit S,H,D,C.
Rules:
- unique 52-card deck: no duplicate rank+suit anywhere
- no overlapping cells among fixed, targets, blocked
- hand is the exact multiset of cards sitting on targets
- gold seats matching the difficulty hint (unique solution: each hand card has one correct seat)
fixed = already on the board. targets = gold empty seats. blocked = unplayable cells.
JSON shape:
{"name":"short title","briefing":"one sentence hint","blocked":[{"r":0,"c":0}],"fixed":[{"r":0,"c":1,"rank":"A","suit":"S"}],"hand":[{"rank":"A","suit":"H"}],"targets":[{"r":0,"c":2,"rank":"A","suit":"H"}]}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text);
    if (!parsed) return null;
    return hydrateAi(parsed, difficulty, table);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const generateEndlessLevel = createServerFn({ method: "POST" })
  .validator((input: { difficulty: Difficulty; table: number }) => {
    const difficulty = DIFFS.includes(input.difficulty) ? input.difficulty : "easy";
    const table = Math.max(1, Math.min(200, Number(input.table) || 1));
    return { difficulty, table };
  })
  .handler(async ({ data }) => {
    const fallback = await makeProceduralLevel(data.difficulty, data.table);
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: true as const, level: fallback, source: "local" as const };

    let level = await askPuzzle(apiKey, data.difficulty, data.table);
    if (!level) return { ok: true as const, level: fallback, source: "local" as const };
    return { ok: true as const, level, source: "ai" as const };
  });

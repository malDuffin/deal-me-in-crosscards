import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Eraser, Pencil, Play, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";
import { ShareSheet } from "./ShareSheet";
import { StopSign } from "./StopSign";
import { deleteTable, loadSavedTables, saveTable, type SavedTable } from "@/lib/game/editor-store";
import { levelIssues, neededStops } from "@/lib/game/endless";
import { levelShareUrl } from "@/lib/game/share";
import { useSettings } from "@/lib/game/settings";
import {
  BOARD_PAD,
  BOARD_RAIL,
  BOARD_SIZE,
  CELL_GAP,
  CELL_H,
  CELL_W,
  RANKS,
  SUITS,
  type Level,
  type Rank,
  type Suit,
} from "@/lib/game/types";
import { cn } from "@/lib/utils";

const CENTRE = Math.floor(BOARD_SIZE / 2);
const innerW = BOARD_SIZE * CELL_W + (BOARD_SIZE - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
const innerH = BOARD_SIZE * CELL_H + (BOARD_SIZE - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;

type Tool = "erase" | "card" | "gold";
type CellState =
  | { kind: "empty" }
  | { kind: "stop" }
  | { kind: "card"; rank: Rank; suit: Suit; gold: boolean };

function emptyGrid(): CellState[] {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => ({ kind: "empty" }));
}

function idx(r: number, c: number) {
  return r * BOARD_SIZE + c;
}

function withStops(grid: CellState[]): CellState[] {
  const occupied = new Map<string, { rank: Rank; suit: Suit }>();
  grid.forEach((cell, i) => {
    if (cell.kind !== "card") return;
    const r = Math.floor(i / BOARD_SIZE);
    const c = i % BOARD_SIZE;
    occupied.set(`${r},${c}`, { rank: cell.rank, suit: cell.suit });
  });
  const stopAt = new Set(neededStops(occupied).map((p) => idx(p.r, p.c)));
  return grid.map((cell, i) => {
    if (cell.kind === "card") return cell;
    if (stopAt.has(i)) return { kind: "stop" };
    if (cell.kind === "stop") return { kind: "empty" };
    return cell;
  });
}

function fromLevel(level: Level): { grid: CellState[]; name: string } {
  const grid = emptyGrid();
  for (const f of level.fixed ?? []) {
    grid[idx(f.r, f.c)] = { kind: "card", rank: f.rank, suit: f.suit, gold: false };
  }
  for (const t of level.targets ?? []) {
    grid[idx(t.r, t.c)] = { kind: "card", rank: t.rank, suit: t.suit, gold: true };
  }
  return { grid: withStops(grid), name: level.name };
}

function toLevel(grid: CellState[], name: string, id?: string): Level {
  const blocked: Level["blocked"] = [];
  const fixed: NonNullable<Level["fixed"]> = [];
  const targets: NonNullable<Level["targets"]> = [];
  grid.forEach((cell, i) => {
    const r = Math.floor(i / BOARD_SIZE);
    const c = i % BOARD_SIZE;
    if (cell.kind === "stop") blocked.push({ r, c });
    else if (cell.kind === "card" && cell.gold) targets.push({ r, c, rank: cell.rank, suit: cell.suit });
    else if (cell.kind === "card") fixed.push({ r, c, rank: cell.rank, suit: cell.suit });
  });
  return {
    id: id ?? `custom-${Date.now().toString(36)}`,
    campaign: "custom",
    name: name.trim().slice(0, 48) || "Untitled table",
    number: 0,
    briefing: "Fill every gold seat. Each card has one correct place.",
    grid: BOARD_SIZE,
    blocked,
    fixed,
    targets,
    hand: targets.map(({ rank, suit }) => ({ rank, suit })),
    win: { allPlaced: true, exactTargets: true },
  };
}

export function LevelEditor() {
  const navigate = useNavigate();
  const cardStyle = useSettings((s) => s.cardStyle);
  const [view, setView] = useState<"library" | "edit">("library");
  const [saved, setSaved] = useState<SavedTable[]>([]);
  const [grid, setGrid] = useState<CellState[]>(emptyGrid);
  const [name, setName] = useState("Untitled table");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [tool, setTool] = useState<Tool>("card");
  const [rank, setRank] = useState<Rank>("A");
  const [suit, setSuit] = useState<Suit>("S");
  const [toast, setToast] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const refresh = () => setSaved(loadSavedTables());
  useEffect(() => {
    refresh();
  }, [view]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || view !== "edit") return;
    const measure = () => {
      const s = Math.min(el.clientWidth / innerW, el.clientHeight / innerH) * 0.98;
      setScale(Number.isFinite(s) && s > 0 ? Math.max(0.18, Math.min(s, 1.2)) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const draft = useMemo(() => toLevel(grid, name, editingId), [grid, name, editingId]);
  const issues = useMemo(
    () => levelIssues(draft, { requireCentre: false, requireUnique: true }),
    [draft],
  );
  const seated = useMemo(() => {
    const s = new Set<string>();
    for (const c of grid) {
      if (c.kind === "card") s.add(`${c.rank}${c.suit}`);
    }
    return s;
  }, [grid]);
  const usedKey = `${rank}${suit}`;
  const used = seated.has(usedKey);

  useEffect(() => {
    if (!used) return;
    const free = SUITS.find((s) => !seated.has(`${rank}${s}`));
    if (free) setSuit(free);
  }, [used, rank, seated]);

  const paint = (r: number, c: number) => {
    setGrid((prev) => {
      const next = prev.slice();
      const i = idx(r, c);
      const cur = next[i];
      if (tool === "erase") {
        next[i] = { kind: "empty" };
        return withStops(next);
      }
      if (cur.kind === "card") {
        next[i] = { ...cur, gold: !cur.gold };
        return withStops(next);
      }
      if (used) {
        setToast(`${usedKey} is already seated.`);
        return prev;
      }
      next[i] = { kind: "card", rank, suit, gold: tool === "gold" };
      return withStops(next);
    });
  };

  const startNew = () => {
    setGrid(emptyGrid());
    setName("Untitled table");
    setEditingId(undefined);
    setTool("card");
    setToast("Place board cards, then tap them to mark player cards.");
    setView("edit");
  };

  const startEdit = (row: SavedTable) => {
    const loaded = fromLevel(row.level);
    setGrid(loaded.grid);
    setName(loaded.name);
    setEditingId(row.id);
    setToast("Editing saved table.");
    setView("edit");
  };

  const onSave = () => {
    if (issues.length) {
      setToast(issues[0]);
      return;
    }
    const row = saveTable(draft);
    setEditingId(row.id);
    refresh();
    setToast("Saved on this device.");
  };

  const onPlay = () => {
    if (issues.length) {
      setToast(issues[0]);
      return;
    }
    const row = saveTable(draft);
    void navigate({ to: "/play", search: { mode: "custom", id: row.id } });
  };

  const onShare = () => {
    if (issues.length) {
      setToast(issues[0]);
      return;
    }
    const row = saveTable(draft);
    setEditingId(row.id);
    setShareUrl(levelShareUrl(row.level));
  };

  if (view === "library") {
    return (
      <div className="felt-bg relative min-h-dvh">
        <div className="felt-noise absolute inset-0" />
        <div className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-10 pt-3">
          <header className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex size-11 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
              aria-label="Back"
            >
              <ChevronLeft className="size-5" />
            </Link>
            <h1 className="font-display text-lg font-semibold tracking-tight">Table editor</h1>
            <div className="w-11" />
          </header>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Build a crossword, mark gold seats, and share a unique-solution table. Saved on this device.
          </p>
          <Button className="mt-5" size="lg" onClick={startNew}>
            <Pencil className="size-4" />
            New table
          </Button>
          <div className="mt-6 space-y-2">
            {saved.length === 0 ? (
              <p className="text-sm text-fg-subtle">No custom tables yet.</p>
            ) : (
              saved.map((row) => (
                <div
                  key={row.id}
                  className="glass-chip flex items-center gap-2 rounded-2xl px-3 py-2.5"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => startEdit(row)}
                  >
                    <span className="block truncate font-medium">{row.level.name}</span>
                    <span className="text-xs text-fg-subtle">
                      {row.level.hand.length} gold · {row.level.fixed?.length ?? 0} fixed
                    </span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
                    aria-label="Play"
                    onClick={() =>
                      void navigate({ to: "/play", search: { mode: "custom", id: row.id } })
                    }
                  >
                    <Play className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
                    aria-label="Share"
                    onClick={() => setShareUrl(levelShareUrl(row.level))}
                  >
                    <Share2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
                    aria-label="Delete"
                    onClick={() => {
                      deleteTable(row.id);
                      refresh();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        <ShareSheet
          open={!!shareUrl}
          onClose={() => setShareUrl("")}
          url={shareUrl}
          title="Share this table"
          blurb="Anyone with the link or QR can play your crossword."
        />
      </div>
    );
  }

  return (
    <div className="felt-bg relative flex h-dvh flex-col overflow-hidden">
      <div className="felt-noise absolute inset-0" />
      <header className="relative z-10 flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
          aria-label="Back to library"
          onClick={() => {
            setView("library");
            refresh();
          }}
        >
          <ChevronLeft className="size-5" />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="glass-chip min-w-0 flex-1 rounded-xl px-3 py-2 text-center font-display text-sm font-semibold tracking-tight"
          maxLength={48}
          aria-label="Table name"
        />
        <div className="w-11" />
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-2 pb-3">
        <div className="mb-2 flex flex-wrap justify-center gap-1.5">
          {(
            [
              ["erase", "Erase", Eraser],
              ["card", "Place Card", null],
              ["gold", "Set As Player Card", null],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTool(id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
                tool === id ? "border-gold bg-gold/15 text-gold" : "glass-chip text-fg-muted",
              )}
            >
              {Icon ? <Icon className="size-3.5" /> : null}
              {label}
            </button>
          ))}
        </div>

        {tool === "card" || tool === "gold" ? (
          <div className="mb-2 space-y-1.5">
            <div className="flex flex-wrap justify-center gap-1">
              {RANKS.map((r) => {
                const rankFull = SUITS.every((s) => seated.has(`${r}${s}`));
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRank(r)}
                    className={cn(
                      "h-8 min-w-8 rounded-lg border px-1.5 font-display text-sm",
                      rank === r ? "border-gold bg-gold/15 text-gold" : "glass-chip",
                      rankFull && "opacity-35",
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-center gap-1">
              {SUITS.map((s) => {
                const taken = seated.has(`${rank}${s}`);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={taken}
                    onClick={() => setSuit(s)}
                    aria-label={taken ? `${rank}${s} already seated` : `${rank}${s}`}
                    className={cn(
                      "h-8 w-10 rounded-lg border",
                      taken
                        ? "cursor-not-allowed border-border bg-surface/30 opacity-30 grayscale"
                        : suit === s
                          ? "border-gold bg-gold/15"
                          : "glass-chip",
                    )}
                  >
                    <span className="mx-auto block h-6 w-[18px]" style={{ fontSize: 8 }}>
                      <CardFace
                        card={{ id: s, rank, suit: s, fixed: tool !== "gold" }}
                        style={cardStyle}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <p className="mb-1 min-h-5 text-center text-xs text-fg-muted">
          {toast ||
            (tool === "gold"
              ? "Tap a card to mark it as a player card (gold) or a board card (white)."
              : tool === "erase"
                ? "Tap to clear a square. Stops replant if a sixth card would be illegal."
                : "Tap empty squares to place a white board card. Tap a placed card to toggle player/board.")}
        </p>

        <div ref={wrapRef} className="min-h-0 min-w-0 w-full flex-1 overflow-hidden">
          <div className="flex h-full items-center justify-center">
            <div style={{ width: innerW * scale, height: innerH * scale, position: "relative" }}>
              <div
                className="absolute left-0 top-0"
                style={{
                  width: innerW,
                  height: innerH,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                <div
                  className="rounded-[18px] border-rail bg-felt shadow-[inset_0_0_40px_rgba(0,0,0,0.45)]"
                  style={{ borderWidth: BOARD_RAIL, padding: BOARD_PAD }}
                >
                  <div
                    className="grid"
                    style={{
                      gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_W}px)`,
                      gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_H}px)`,
                      gap: CELL_GAP,
                      fontSize: 11,
                    }}
                  >
                    {grid.map((cell, i) => {
                      const r = Math.floor(i / BOARD_SIZE);
                      const c = i % BOARD_SIZE;
                      const centre = r === CENTRE && c === CENTRE;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => paint(r, c)}
                          className={cn(
                            "relative rounded-[3px]",
                            cell.kind === "stop" ? "bg-rail/80" : "border border-cell-line bg-cell",
                            cell.kind === "card" && cell.gold && "slot-mark ring-1 ring-gold",
                            centre && cell.kind === "empty" && "ring-1 ring-cream/30",
                          )}
                        >
                          {cell.kind === "stop" ? (
                            <span className="pointer-events-none absolute inset-0 grid place-items-center">
                              <StopSign className="h-[70%] w-[70%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
                            </span>
                          ) : null}
                          {cell.kind === "card" ? (
                            <span className="absolute inset-[1px]">
                              <CardFace
                                card={{
                                  id: `${cell.rank}${cell.suit}`,
                                  rank: cell.rank,
                                  suit: cell.suit,
                                  fixed: !cell.gold,
                                }}
                                style={cardStyle}
                              />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {issues.length ? (
          <ul className="mt-2 max-h-16 space-y-0.5 overflow-y-auto text-center text-xs text-gold">
            {issues.slice(0, 3).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-center text-xs text-ok">Unique table. Ready to save.</p>
        )}

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={onSave} disabled={issues.length > 0}>
            Save
          </Button>
          <Button size="sm" onClick={onPlay} disabled={issues.length > 0}>
            Play
          </Button>
          <Button variant="secondary" size="sm" onClick={onShare} disabled={issues.length > 0}>
            <Share2 className="size-4" />
            Share
          </Button>
        </div>
      </div>

      <ShareSheet
        open={!!shareUrl}
        onClose={() => setShareUrl("")}
        url={shareUrl}
        title="Share this table"
        blurb="Anyone with the link or QR can play your crossword."
      />
    </div>
  );
}

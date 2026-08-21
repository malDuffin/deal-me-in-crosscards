/**
 * LevelEditor – local level editor with:
 *   - 11×11 scalable board
 *   - paint tools: stop / erase / card / gold
 *   - rank + suit pickers
 *   - uniqueness validation via levelIssues
 *   - save / play / share library
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Play, Save, Share2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { levelIssues } from "@/lib/game/endless";
import {
  deleteTable,
  loadSavedTables,
  saveTable,
  type SavedTable,
} from "@/lib/game/editor-store";
import { levelShareUrl } from "@/lib/game/share";
import {
  BOARD_PAD,
  BOARD_RAIL,
  BOARD_SIZE,
  CELL_GAP,
  CELL_H,
  CELL_W,
  RANKS,
  SUITS,
  type Rank,
  type Suit,
  type Level,
  type Cell,
} from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";
import { ShareSheet } from "./ShareSheet";

const CENTRE = Math.floor(BOARD_SIZE / 2);

type PaintTool = "stop" | "erase" | "card" | "gold";

type CellData =
  | { kind: "blocked" }
  | { kind: "fixed"; rank: Rank; suit: Suit }
  | { kind: "target"; rank: Rank; suit: Suit };

function cellKey(r: number, c: number) {
  return `${r},${c}`;
}

function makeBlankGrid(): Map<string, CellData> {
  return new Map();
}

function gridToLevel(
  grid: Map<string, CellData>,
  name: string,
  briefing: string,
): Level | null {
  const blocked: Cell[] = [];
  const fixed: Level["fixed"] = [];
  const targets: NonNullable<Level["targets"]> = [];

  for (const [k, cd] of grid) {
    const [r, c] = k.split(",").map(Number);
    if (cd.kind === "blocked") blocked.push({ r, c });
    else if (cd.kind === "fixed") fixed.push({ r, c, rank: cd.rank, suit: cd.suit });
    else targets.push({ r, c, rank: cd.rank, suit: cd.suit });
  }

  if (!targets.length) return null;
  const hand = targets.map(({ rank, suit }) => ({ rank, suit }));

  return {
    id: `custom-${Date.now().toString(36)}`,
    campaign: "custom",
    name: name.trim() || "Custom table",
    number: 0,
    briefing: briefing.trim() || "Place every gold card on its marked seat.",
    grid: BOARD_SIZE,
    blocked,
    fixed,
    hand,
    targets,
    win: { allPlaced: true, exactTargets: true },
  };
}

function levelToGrid(level: Level): Map<string, CellData> {
  const m = new Map<string, CellData>();
  for (const b of level.blocked ?? []) m.set(cellKey(b.r, b.c), { kind: "blocked" });
  for (const f of level.fixed ?? []) m.set(cellKey(f.r, f.c), { kind: "fixed", rank: f.rank, suit: f.suit });
  for (const t of level.targets ?? []) m.set(cellKey(t.r, t.c), { kind: "target", rank: t.rank, suit: t.suit });
  return m;
}

export function LevelEditor() {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const [tool, setTool] = useState<PaintTool>("card");
  const [rank, setRank] = useState<Rank>("A");
  const [suit, setSuit] = useState<Suit>("S");
  const [grid, setGrid] = useState<Map<string, CellData>>(makeBlankGrid);
  const [name, setName] = useState("Custom table");
  const [briefing, setBriefing] = useState("Place every gold card on its marked seat.");
  const [savedTables, setSavedTables] = useState<SavedTable[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [validationIssues, setValidationIssues] = useState<string[]>([]);

  const innerW = BOARD_SIZE * CELL_W + (BOARD_SIZE - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
  const innerH = BOARD_SIZE * CELL_H + (BOARD_SIZE - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const s = Math.min(1, el.clientWidth / innerW, el.clientHeight / innerH);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [innerW, innerH]);

  useEffect(() => {
    setSavedTables(loadSavedTables());
  }, []);

  const currentLevel = useMemo(() => gridToLevel(grid, name, briefing), [grid, name, briefing]);

  useEffect(() => {
    if (!currentLevel) {
      setValidationIssues(["Add at least one gold (target) card."]);
      return;
    }
    // Debounce uniqueness check (can be expensive for large target sets)
    const id = window.setTimeout(() => {
      setValidationIssues(levelIssues(currentLevel, { requireCentre: false, requireUnique: true }));
    }, 300);
    return () => window.clearTimeout(id);
  }, [currentLevel]);

  const paintCell = useCallback(
    (r: number, c: number) => {
      setGrid((prev) => {
        const next = new Map(prev);
        const k = cellKey(r, c);
        if (tool === "erase") {
          next.delete(k);
        } else if (tool === "stop") {
          next.set(k, { kind: "blocked" });
        } else if (tool === "card") {
          next.set(k, { kind: "fixed", rank, suit });
        } else if (tool === "gold") {
          next.set(k, { kind: "target", rank, suit });
        }
        return next;
      });
    },
    [tool, rank, suit],
  );

  const handleSave = () => {
    if (!currentLevel) return;
    const saved = saveTable(currentLevel);
    setSavedTables(loadSavedTables());
    void navigate({ to: "/play", search: { mode: "custom", share: undefined, id: saved.id } });
  };

  const handlePlay = () => {
    if (!currentLevel) return;
    const saved = saveTable(currentLevel);
    void navigate({ to: "/play", search: { mode: "custom", id: saved.id } });
  };

  const handleShare = () => {
    if (!currentLevel) return;
    setShareUrl(levelShareUrl(currentLevel));
    setShareOpen(true);
  };

  const loadTable = (st: SavedTable) => {
    setGrid(levelToGrid(st.level));
    setName(st.level.name);
    setBriefing(st.level.briefing);
  };

  const deleteRow = (id: string) => {
    deleteTable(id);
    setSavedTables(loadSavedTables());
  };

  const isValid = validationIssues.length === 0;

  return (
    <div className="felt-bg relative flex h-dvh flex-col overflow-hidden">
      <div className="felt-noise absolute inset-0" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 py-1">
        <Link
          to="/"
          className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="font-display text-base font-semibold tracking-tight">Table Editor</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleShare} disabled={!isValid}>
            <Share2 className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handlePlay} disabled={!isValid}>
            <Play className="size-4" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isValid}>
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 gap-2 px-2 pb-2">
        {/* Left panel: tools + rank/suit pickers */}
        <div className="flex w-28 shrink-0 flex-col gap-2 pt-1">
          <p className="text-[10px] uppercase tracking-wider text-fg-subtle">Tool</p>
          {(["card", "gold", "stop", "erase"] as PaintTool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              className={cn(
                "rounded-lg border px-2 py-1 text-xs font-medium capitalize transition-colors",
                tool === t
                  ? "border-gold bg-gold/20 text-gold"
                  : "border-border bg-surface text-fg-muted hover:bg-surface-2",
              )}
            >
              {t === "card" ? "Fixed card" : t === "gold" ? "Gold seat" : t === "stop" ? "Blocker" : "Erase"}
            </button>
          ))}

          {(tool === "card" || tool === "gold") && (
            <>
              <p className="mt-2 text-[10px] uppercase tracking-wider text-fg-subtle">Rank</p>
              <div className="grid grid-cols-3 gap-0.5">
                {RANKS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRank(r)}
                    className={cn(
                      "rounded px-1 py-0.5 text-[11px] font-medium",
                      rank === r ? "bg-gold text-ink" : "bg-surface text-fg-muted hover:bg-surface-2",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <p className="mt-1 text-[10px] uppercase tracking-wider text-fg-subtle">Suit</p>
              <div className="grid grid-cols-2 gap-0.5">
                {SUITS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSuit(s)}
                    className={cn(
                      "rounded px-1 py-0.5 text-xs font-medium",
                      suit === s ? "bg-gold text-ink" : "bg-surface text-fg-muted hover:bg-surface-2",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Validation */}
          <div className="mt-auto">
            {isValid ? (
              <p className="text-[10px] text-ok">✓ Valid puzzle</p>
            ) : (
              <ul className="space-y-0.5">
                {validationIssues.slice(0, 3).map((iss, i) => (
                  <li key={i} className="text-[10px] text-pip-red leading-tight">{iss}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Board */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div ref={wrapRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full items-center justify-center">
              <div
                style={{
                  width: innerW * scale,
                  height: innerH * scale,
                  position: "relative",
                }}
              >
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
                      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
                        const r = Math.floor(i / BOARD_SIZE);
                        const c = i % BOARD_SIZE;
                        const k = cellKey(r, c);
                        const cd = grid.get(k);
                        const isCentre = r === CENTRE && c === CENTRE;
                        const isBlocked = cd?.kind === "blocked";

                        return (
                          <div
                            key={k}
                            className={cn(
                              "relative cursor-pointer rounded-[3px] select-none",
                              isBlocked
                                ? "bg-rail/80"
                                : "border border-cell-line bg-cell hover:bg-cell/80",
                              cd?.kind === "target" && "slot-mark",
                              isCentre && !cd && "ring-1 ring-inset ring-fg/15",
                            )}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              paintCell(r, c);
                            }}
                            onPointerEnter={(e) => {
                              if (e.buttons === 1) paintCell(r, c);
                            }}
                          >
                            {isBlocked ? (
                              <span className="absolute inset-[28%] rotate-45 rounded-[1px] bg-cream/25" />
                            ) : null}
                            {cd && cd.kind !== "blocked" ? (
                              <div
                                className={cn(
                                  "absolute inset-[1px]",
                                  cd.kind === "target" && "ring-2 ring-gold ring-inset",
                                )}
                                style={{ fontSize: 11 }}
                              >
                                <CardFace
                                  card={{ id: k, rank: cd.rank, suit: cd.suit, fixed: cd.kind === "fixed" }}
                                  dimmed={cd.kind === "fixed"}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Name + briefing */}
          <div className="shrink-0 space-y-1 px-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Table name"
              className="w-full rounded-lg border border-border bg-surface px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
            <input
              type="text"
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="Briefing text"
              className="w-full rounded-lg border border-border bg-surface px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>
        </div>

        {/* Right panel: saved tables */}
        {savedTables.length > 0 && (
          <div className="flex w-28 shrink-0 flex-col gap-1 pt-1">
            <p className="text-[10px] uppercase tracking-wider text-fg-subtle">Saved</p>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-1 pr-0.5">
              {savedTables.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1"
                >
                  <button
                    type="button"
                    onClick={() => loadTable(st)}
                    className="min-w-0 flex-1 text-left text-[11px] font-medium truncate text-fg hover:text-gold"
                  >
                    {st.level.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRow(st.id)}
                    className="shrink-0 text-fg-subtle hover:text-err"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        title="Share this CrossCards table"
        blurb="Send this link to share your custom table."
      />
    </div>
  );
}

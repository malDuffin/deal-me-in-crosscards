import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, RotateCcw, Settings, Share2, Undo2, Volume2, VolumeX, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import gsap from "gsap";
import { makeCard } from "@/lib/game/deck";
import { makeProceduralLevel, neededStops, type GenProgress } from "@/lib/game/endless";
import { findLevel, nextLevel } from "@/lib/game/levels";
import { getTable } from "@/lib/game/editor-store";
import { decodeLevel, levelShareUrl } from "@/lib/game/share";
import {
  playBounce,
  playDeal,
  playHand,
  playPlace,
  playSelect,
  playWhoosh,
  playWin,
  unlockAudio,
} from "@/lib/game/audio";
import { boardDealIn, cardSwapFly, dealIn, flyInFromOffscreen, flyOutStopRects, placePop, rejectFlyHome, scatterElements, selectPulse, teachMarkIn, trayReorg } from "@/lib/game/juice";
import { WaitOverlay } from "@/components/game/WaitOverlay";
import { cellKey, collectOccupiedRuns, scanBoard, totalScore } from "@/lib/game/poker";
import { recordScore } from "@/lib/game/progress";
import { feltDropShadow, useSettings } from "@/lib/game/settings";
import {
  BOARD_PAD,
  BOARD_RAIL,
  CELL_GAP,
  CELL_H,
  CELL_W,
  DIFFICULTY_LABEL,
  type Campaign,
  type Card,
  type Cell,
  type DetectedHand,
  type Difficulty,
  type Level,
  type Placement,
  type Rank,
  type Suit,
} from "@/lib/game/types";
import { saveHighScore } from "@/lib/scores";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";
import { SettingsSheet } from "./SettingsSheet";
import { ShareSheet } from "./ShareSheet";
import { StopSign } from "./StopSign";

const DRAG_THRESHOLD = 10;

const RANK_HIGH: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  "10": 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

const SUIT_HIGH: Record<Suit, number> = { S: 4, H: 3, D: 2, C: 1 };

function sortHighToLow(a: Card, b: Card) {
  return RANK_HIGH[b.rank] - RANK_HIGH[a.rank] || SUIT_HIGH[b.suit] - SUIT_HIGH[a.suit];
}

type DragState = {
  id: string;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  origin: Cell | "tray";
};

type PendingPointer = {
  id: string;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  origin: Cell | "tray";
};

function setupLevel(level: Level) {
  const blocked = new Set((level.blocked ?? []).map((c) => cellKey(c.r, c.c)));
  const cards: Card[] = [];
  const placements: Placement = {};
  const targets: Record<string, Cell> = {};
  let i = 0;
  for (const f of level.fixed ?? []) {
    const card = makeCard(f.rank, f.suit, i++, true);
    cards.push(card);
    placements[card.id] = { r: f.r, c: f.c };
  }
  const targetList = level.targets ?? [];
  const used = new Set<number>();
  for (const h of level.hand) {
    const card = makeCard(h.rank, h.suit, i++, false);
    cards.push(card);
    placements[card.id] = "tray";
    const ti = targetList.findIndex(
      (t, idx) => !used.has(idx) && t.rank === h.rank && t.suit === h.suit,
    );
    if (ti >= 0) {
      used.add(ti);
      targets[card.id] = { r: targetList[ti].r, c: targetList[ti].c };
    }
  }
  return { cards, placements, blocked, targets };
}

function occupiedAt(
  placements: Placement,
  r: number,
  c: number,
  skipId?: string,
): string | null {
  for (const [id, pos] of Object.entries(placements)) {
    if (id === skipId) continue;
    if (pos !== "tray" && pos.r === r && pos.c === c) return id;
  }
  return null;
}

function sameCell(a: Cell | "tray" | undefined, b: Cell | undefined) {
  if (!a || a === "tray" || !b) return false;
  return a.r === b.r && a.c === b.c;
}

/** Puzzle tables only accept gold seats. Free play can use any empty square. */
function seatsLocked(campaign: Campaign, targetCount: number) {
  return campaign !== "free" && targetCount > 0;
}

type TeachMark = {
  ok: boolean;
  axis: "row" | "col";
  hang: "start" | "end";
  cells: Cell[];
};

function howtoMarks(level: Level | null): TeachMark[] {
  if (!level || level.campaign !== "howto") return [];
  const grid = level.grid;
  const mid = Math.floor(grid / 2);
  const occ = new Set((level.fixed ?? []).map((f) => cellKey(f.r, f.c)));
  return collectOccupiedRuns(grid, occ).flatMap((g) => {
    const top = g.cells.every((p) => p.r < mid);
    const bot = g.cells.every((p) => p.r > mid);
    if (!top && !bot) return [];
    const first = g.cells[0];
    const hang: "start" | "end" =
      g.axis === "row" ? (first.c === 0 ? "end" : "start") : first.r === 0 ? "end" : "start";
    return [{ ok: top, axis: g.axis, hang, cells: g.cells }];
  });
}

function meetsWin(
  level: Level,
  hands: DetectedHand[],
  trayEmpty: boolean,
  score: number,
  cards: Card[],
  placements: Placement,
  targets: Record<string, Cell>,
) {
  const w = level.win;
  if (w.exactTargets) {
    return cards
      .filter((c) => !c.fixed)
      .every((c) => sameCell(placements[c.id], targets[c.id]));
  }
  if (w.allPlaced && !trayEmpty) return false;
  if (w.allScore) {
    const scoring = new Set(hands.flatMap((h) => h.cardIds));
    const placed = cards.filter((c) => placements[c.id] && placements[c.id] !== "tray");
    if (!placed.length || placed.some((c) => !scoring.has(c.id))) return false;
  }
  if (w.minScore != null && score < w.minScore) return false;
  const names = hands.map((h) => h.name);
  const count = (n: string) => names.filter((x) => x === n).length;
  const has = (n: string) => {
    if (n === "Two Pair" && w.pairCountsAsTwoPair) {
      return count("Two Pair") >= 1 || count("Pair") >= 2;
    }
    return count(n) >= 1;
  };
  if (w.all && !w.all.every(has)) return false;
  if (w.any && !w.any.some(has)) return false;
  if (!w.any && !w.all && w.minScore == null && level.campaign !== "free") return false;
  return true;
}

function handLabel(hands: DetectedHand[]) {
  if (!hands.length) return "";
  const unique = [...new Set(hands.map((h) => h.name))];
  return unique
    .map((n) => `${n}  +${hands.find((h) => h.name === n)?.score ?? 0}`)
    .join("   ·   ");
}

function campaignLabel(campaign: Campaign, difficulty?: Difficulty) {
  if (campaign === "howto") return "How to play";
  if (campaign === "training") return "Training";
  if (campaign === "puzzle") return "Puzzle";
  if (campaign === "endless") return `Endless · ${DIFFICULTY_LABEL[difficulty ?? "easy"]}`;
  if (campaign === "custom") return "Custom table";
  return "Free play";
}

function handKey(h: DetectedHand) {
  return `${h.name}|${h.cells.map((c) => `${c.r},${c.c}`).sort().join(";")}`;
}

function midpoint(cells: Cell[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of cells) {
    const el = document.querySelector(`[data-r="${p.r}"][data-c="${p.c}"]`);
    if (!(el instanceof HTMLElement)) continue;
    const r = el.getBoundingClientRect();
    x += r.left + r.width / 2;
    y += r.top + r.height / 2;
    n++;
  }
  return { x: n ? x / n : window.innerWidth / 2, y: n ? y / n : window.innerHeight / 3 };
}

/** Dashed marching-ants arrow from a tray/dragged card to its gold seat. */
function GuideArrows({
  active,
  cardIds,
  targets,
  drag,
  scale,
}: {
  active: boolean;
  cardIds: string[];
  targets: Record<string, Cell>;
  drag: DragState | null;
  scale: number;
}) {
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);

  useLayoutEffect(() => {
    if (!active || !cardIds.length) {
      setPaths([]);
      return;
    }

    const curve = (x1: number, y1: number, x2: number, y2: number, fan: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const bow = Math.min(72, len * 0.22) + fan;
      const c1x = x1 + dx * 0.28 + nx * bow * 0.4;
      const c1y = y1 + dy * 0.28 + ny * bow * 0.4;
      const back = Math.min(40, len * 0.3);
      const c2x = x2 - ux * back + nx * fan * 0.25;
      const c2y = y2 - uy * back + ny * fan * 0.25;
      const tip = Math.min(12, len * 0.1);
      const ex = x2 - ux * tip;
      const ey = y2 - uy * tip;
      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    };

    const measure = () => {
      const next: { id: string; d: string }[] = [];
      const n = cardIds.length;
      cardIds.forEach((id, i) => {
        const dest = targets[id];
        if (!dest) return;
        const toEl = document.querySelector<HTMLElement>(`[data-r="${dest.r}"][data-c="${dest.c}"]`);
        if (!toEl) return;
        const b = toEl.getBoundingClientRect();
        if (b.width < 2) return;
        const x2 = b.left + b.width / 2;
        const y2 = b.top + b.height / 2;
        let x1: number;
        let y1: number;
        if (drag && drag.id === id) {
          const w = CELL_W * scale;
          const h = CELL_H * scale;
          x1 = drag.x - drag.grabX + w / 2;
          y1 = drag.y - drag.grabY + h / 2;
        } else {
          const fromEl = document.querySelector<HTMLElement>(`[data-tray] [data-card-id="${id}"]`);
          if (!fromEl) return;
          const a = fromEl.getBoundingClientRect();
          if (a.width < 2) return;
          x1 = a.left + a.width / 2;
          y1 = a.top + 4;
        }
        const fan = (i - (n - 1) / 2) * 36;
        next.push({ id, d: curve(x1, y1, x2, y2, fan) });
      });
      setPaths(next);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, cardIds, targets, drag, scale]);

  if (!active || !paths.length) return null;
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[45]"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="guide-arrow-head"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#e8c547" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.id}
          d={p.d}
          className="guide-arrow"
          markerEnd="url(#guide-arrow-head)"
        />
      ))}
    </svg>
  );
}

export function PlaySession({
  campaign,
  levelId,
  difficulty = "easy",
  share,
}: {
  campaign: Campaign;
  levelId?: string;
  difficulty?: Difficulty;
  share?: string;
}) {
  const navigate = useNavigate();
  const [dealKey, setDealKey] = useState(0);
  const [endlessLevel, setEndlessLevel] = useState<Level | null>(null);
  const [endlessLoading, setEndlessLoading] = useState(campaign === "endless");
  const [genProgress, setGenProgress] = useState<GenProgress | null>(
    campaign === "endless"
      ? {
          phase: "Hold please",
          attempt: 0,
          detail: "Waiting until this panel is fully on the felt. Then I'll shuffle a table.",
        }
      : null,
  );
  const [tableNo, setTableNo] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const cardStyle = useSettings((s) => s.cardStyle);
  const muted = useSettings((s) => s.muted);
  const setMuted = useSettings((s) => s.setMuted);
  const boardShadows = useSettings((s) => s.boardShadows);
  const shadowDistance = useSettings((s) => s.shadowDistance);
  const shadowOpacity = useSettings((s) => s.shadowOpacity);
  const placedShadow = feltDropShadow(boardShadows, shadowDistance, shadowOpacity);
  const nextCache = useRef<{ n: number; difficulty: Difficulty; level: Level } | null>(null);

  const staticLevel = useMemo(
    () => (campaign === "endless" || campaign === "custom" ? null : findLevel(campaign, levelId)),
    [campaign, levelId, dealKey],
  );
  const sharedLevel = useMemo(() => {
    if (campaign !== "custom" || !share) return null;
    return decodeLevel(share);
  }, [campaign, share]);
  const [savedLevel, setSavedLevel] = useState<Level | null>(null);
  const [savedReady, setSavedReady] = useState(!(campaign === "custom" && !share && !!levelId));
  useEffect(() => {
    if (campaign === "custom" && !share && levelId) {
      setSavedLevel(getTable(levelId)?.level ?? null);
    } else {
      setSavedLevel(null);
    }
    setSavedReady(true);
  }, [campaign, share, levelId]);
  const customLevel = share ? sharedLevel : savedLevel;
  const level = campaign === "endless" ? endlessLevel : campaign === "custom" ? customLevel : staticLevel;

  const overlayReadyRef = useRef(false);
  const overlayWaiterRef = useRef<(() => void) | null>(null);
  const loadingUiRef = useRef(campaign === "endless");
  const genSeq = useRef(0);

  const markOverlayReady = useCallback(() => {
    overlayReadyRef.current = true;
    overlayWaiterRef.current?.();
    overlayWaiterRef.current = null;
  }, []);

  const waitForOverlay = () => {
    if (overlayReadyRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        overlayWaiterRef.current = null;
        resolve();
      };
      overlayWaiterRef.current = finish;
      window.setTimeout(finish, 520);
    });
  };

  const loadEndless = useCallback(
    async (n: number) => {
      const cached = nextCache.current;
      const hit = !!(cached && cached.n === n && cached.difficulty === difficulty);
      setTableNo(n);
      if (hit && cached) {
        nextCache.current = null;
        loadingUiRef.current = false;
        setEndlessLevel(cached.level);
        setEndlessLoading(false);
        setGenProgress(null);
        void makeProceduralLevel(difficulty, n + 1).then((lvl) => {
          nextCache.current = { n: n + 1, difficulty, level: lvl };
        });
        return;
      }
      const seq = ++genSeq.current;
      const remountPanel = !loadingUiRef.current;
      loadingUiRef.current = true;
      if (remountPanel) overlayReadyRef.current = false;
      setEndlessLoading(true);
      setEndlessLevel(null);
      setGenProgress({
        phase: "Hold please",
        attempt: 0,
        detail: "Waiting until this panel is fully on the felt. Then I'll shuffle a table.",
      });
      await waitForOverlay();
      if (seq !== genSeq.current) return;
      try {
        const lvl = await makeProceduralLevel(difficulty, n, (p) => {
          if (seq !== genSeq.current) return;
          setGenProgress(p);
        });
        if (seq !== genSeq.current) return;
        loadingUiRef.current = false;
        setEndlessLevel(lvl);
        setGenProgress(null);
        void makeProceduralLevel(difficulty, n + 1).then((next) => {
          nextCache.current = { n: n + 1, difficulty, level: next };
        });
      } finally {
        if (seq === genSeq.current) {
          loadingUiRef.current = false;
          setEndlessLoading(false);
        }
      }
    },
    [difficulty],
  );

  useEffect(() => {
    nextCache.current = null;
    if (campaign !== "endless") return;
    setEndlessLevel(null);
    const t = window.setTimeout(() => loadEndless(1), 0);
    return () => window.clearTimeout(t);
  }, [campaign, loadEndless, difficulty]);

  const built = useMemo(
    () =>
      level
        ? setupLevel(level)
        : { cards: [] as Card[], placements: {} as Placement, blocked: new Set<string>(), targets: {} as Record<string, Cell> },
    [level],
  );
  const cards = built.cards;
  const targets = built.targets;
  const grid = level?.grid ?? 11;
  const [placements, setPlacements] = useState<Placement>(built.placements);
  const [history, setHistory] = useState<Placement[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [hoverSwapId, setHoverSwapId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Cell | null>(null);
  const [won, setWon] = useState(false);
  const [showWinUi, setShowWinUi] = useState(false);
  const [toast, setToast] = useState(level?.briefing ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const winBoxRef = useRef<HTMLDivElement>(null);
  const winOverlayRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const prevHands = useRef<string>("");
  const pendingRef = useRef<PendingPointer | null>(null);
  const pendingFloats = useRef(0);
  const pendingWin = useRef(false);
  const lastPop = useRef<string | null>(null);
  const trayPrevRects = useRef<Map<string, DOMRect>>(new Map());
  const skipTrayReorg = useRef(true);
  const swappingRef = useRef(false);
  const placementsRef = useRef<Placement>({});
  const bounceTimer = useRef<number | null>(null);
  const bounceHomeRef = useRef<(ids: string[], before: Map<string, DOMRect>) => void>(() => {});
  const [shownSig, setShownSig] = useState("");
  const [holdPlease, setHoldPlease] = useState(true);
  const prevFeltRef = useRef<{ cards: Map<string, { rank: Rank; suit: Suit }>; stops: Set<string> }>({
    cards: new Map(),
    stops: new Set(),
  });

  const targetKeys = useMemo(() => {
    const s = new Set<string>();
    for (const t of Object.values(targets)) s.add(cellKey(t.r, t.c));
    return s;
  }, [targets]);
  const goldOnly = seatsLocked(campaign, targetKeys.size);
  placementsRef.current = placements;
  const tableSig = `${level?.id ?? ""}:${campaign}`;
  const awaitingDeal = shownSig !== tableSig;
  const feltStay = (r: number, c: number, rank?: Rank, suit?: Suit) => {
    if (campaign !== "training" || !awaitingDeal) return false;
    const prev = prevFeltRef.current.cards.get(`${r},${c}`);
    return !!prev && !!rank && !!suit && prev.rank === rank && prev.suit === suit;
  };
  const stopStay = (k: string) => campaign === "training" && awaitingDeal && prevFeltRef.current.stops.has(k);

  const scanPlacements = useMemo(() => {
    if (!drag) return placements;
    const copy = { ...placements };
    copy[drag.id] = "tray";
    return copy;
  }, [placements, drag]);

  /** Live caps from the cards currently on the felt — lift one and leftover stops fly off.
   *  How to Play uses the authored stops only; the demo "wrong" hands must not grow signs. */
  const blocked = useMemo(() => {
    if (campaign === "howto") return built.blocked;
    const occupied = new Map<string, { rank: Rank; suit: Suit }>();
    for (const c of cards) {
      const p = scanPlacements[c.id];
      if (p && p !== "tray") occupied.set(cellKey(p.r, p.c), { rank: c.rank, suit: c.suit });
    }
    const set = new Set<string>();
    for (const s of neededStops(occupied)) {
      const k = cellKey(s.r, s.c);
      if (targetKeys.has(k)) continue;
      set.add(k);
    }
    return set;
  }, [campaign, built.blocked, cards, scanPlacements, targetKeys]);

  const prevBlockedRef = useRef<Set<string>>(new Set());
  const stopRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const stopTableRef = useRef(tableSig);
  if (stopTableRef.current !== tableSig) {
    stopTableRef.current = tableSig;
    prevBlockedRef.current = new Set();
    stopRectsRef.current = new Map();
  }

  useLayoutEffect(() => {
    const prev = prevBlockedRef.current;
    const leaving: string[] = [];
    const entering: string[] = [];
    for (const k of prev) if (!blocked.has(k)) leaving.push(k);
    for (const k of blocked) if (!prev.has(k)) entering.push(k);

    if (leaving.length && !awaitingDeal && campaign !== "training") {
      const rects = leaving
        .map((k) => stopRectsRef.current.get(k))
        .filter((r): r is DOMRect => !!r && r.width > 1 && r.height > 1);
      void flyOutStopRects(rects, { origin: "random", stagger: 0.04 });
    }

    prevBlockedRef.current = new Set(blocked);

    const cache = new Map<string, DOMRect>();
    wrapRef.current?.querySelectorAll<HTMLElement>("[data-fly-stop]").forEach((el) => {
      const k = el.dataset.stopKey;
      if (k) cache.set(k, el.getBoundingClientRect());
    });
    stopRectsRef.current = cache;

    if (entering.length && !awaitingDeal) {
      const els = entering
        .map((k) =>
          [...(wrapRef.current?.querySelectorAll<HTMLElement>("[data-fly-stop]") ?? [])].find(
            (el) => el.dataset.stopKey === k,
          ),
        )
        .filter((el): el is HTMLElement => !!el);
      for (const el of els) el.style.visibility = "hidden";
      void flyInFromOffscreen(els, { origin: "random", stagger: 0.04 }).then(() => {
        for (const el of els) el.style.visibility = "";
      });
    }
  }, [blocked, awaitingDeal, campaign]);

  useLayoutEffect(() => {
    const cache = new Map<string, DOMRect>();
    wrapRef.current?.querySelectorAll<HTMLElement>("[data-fly-stop]").forEach((el) => {
      const k = el.dataset.stopKey;
      if (k) cache.set(k, el.getBoundingClientRect());
    });
    stopRectsRef.current = cache;
  }, [blocked, scale, awaitingDeal, shownSig]);

  const canSeat = useCallback(
    (r: number, c: number, skipId?: string) => {
      if (blocked.has(cellKey(r, c))) return false;
      if (occupiedAt(placements, r, c, skipId)) return false;
      if (goldOnly && !targetKeys.has(cellKey(r, c))) return false;
      return true;
    },
    [blocked, placements, goldOnly, targetKeys],
  );

  const clearSelect = useCallback(() => {
    setSelectedCard(null);
    setSelectedSlot(null);
  }, []);

  useLayoutEffect(() => {
    setPlacements(built.placements);
    setHistory([]);
    setWon(false);
    setShowWinUi(false);
    pendingWin.current = false;
    setToast(level?.briefing ?? "");
    setDrag(null);
    pendingRef.current = null;
    setSelectedCard(null);
    setSelectedSlot(null);
    setHoverSwapId(null);
    prevHands.current = "";
    skipTrayReorg.current = true;
    trayPrevRects.current = new Map();
    if (bounceTimer.current) {
      window.clearTimeout(bounceTimer.current);
      bounceTimer.current = null;
    }
  }, [built, level?.briefing]);

  useLayoutEffect(() => {
    setHoldPlease(!(campaign === "training" && prevFeltRef.current.cards.size > 0));
  }, [tableSig, campaign]);

  useLayoutEffect(() => {
    if (campaign === "endless" && !level) return;
    if (!awaitingDeal) return;
    if (placements !== built.placements) return;
    const boardEls = [...(wrapRef.current?.querySelectorAll("[data-fly-card][data-on-board]") ?? [])].filter(
      (el) => !(el instanceof HTMLElement && el.dataset.stayFelt === "1"),
    );
    const trayEls = [...(trayRef.current?.querySelectorAll("[data-fly-card]") ?? [])] as HTMLElement[];
    const marks = [...(wrapRef.current?.querySelectorAll("[data-teach-mark]") ?? [])];
    const stopEls = [...(wrapRef.current?.querySelectorAll("[data-fly-stop]") ?? [])].filter(
      (el) => !(el instanceof HTMLElement && el.dataset.stayFelt === "1"),
    );
    if (!boardEls.length && !trayEls.length && !marks.length && !stopEls.length) {
      setHoldPlease(false);
      setShownSig(tableSig);
      skipTrayReorg.current = false;
      return;
    }
    setHoldPlease(false);
    if (boardEls.length || trayEls.length) playDeal();
    if (boardEls.length || stopEls.length) playWhoosh();
    const failsafe = window.setTimeout(() => {
      setShownSig(tableSig);
      skipTrayReorg.current = false;
    }, 2200);
    void Promise.all([
      boardDealIn([...boardEls, ...stopEls]),
      dealIn(trayEls),
      teachMarkIn(marks),
    ]).then(() => {
      window.clearTimeout(failsafe);
      const landed = [...boardEls, ...trayEls, ...marks, ...stopEls].filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
      );
      for (const el of landed) el.style.visibility = "visible";
      setShownSig(tableSig);
      requestAnimationFrame(() => {
        for (const el of landed) el.style.visibility = "";
      });
      const seeded = new Map<string, DOMRect>();
      for (const el of trayEls) {
        const id = el.dataset.cardId;
        if (id) seeded.set(id, el.getBoundingClientRect());
      }
      trayPrevRects.current = seeded;
      skipTrayReorg.current = false;
    });
  }, [awaitingDeal, tableSig, placements, built.placements, campaign]);

  useLayoutEffect(() => {
    if (awaitingDeal) return;
    if (campaign !== "training") {
      prevFeltRef.current = { cards: new Map(), stops: new Set() };
      return;
    }
    const cardsMap = new Map<string, { rank: Rank; suit: Suit }>();
    for (const c of cards) {
      const p = placements[c.id];
      if (p && p !== "tray") cardsMap.set(`${p.r},${p.c}`, { rank: c.rank, suit: c.suit });
    }
    prevFeltRef.current = { cards: cardsMap, stops: new Set(blocked) };
  }, [awaitingDeal, campaign, cards, placements, blocked]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const hands = useMemo(() => {
    const found = scanBoard(grid, blocked, scanPlacements, cardsById);
    if (campaign !== "howto") return found;
    const mid = Math.floor(grid / 2);
    return found.filter((h) => {
      const top = h.cells.every((p) => p.r < mid);
      const bot = h.cells.every((p) => p.r > mid);
      return !top && !bot;
    });
  }, [grid, blocked, scanPlacements, cardsById, campaign]);
  const score = totalScore(hands);
  const teachMarks = useMemo(() => howtoMarks(level), [level]);
  const highlighted = useMemo(() => {
    const s = new Set<string>();
    for (const h of hands) for (const c of h.cells) s.add(cellKey(c.r, c.c));
    return s;
  }, [hands]);

  const trayCards = cards
    .filter((c) => placements[c.id] === "tray")
    .slice()
    .sort(sortHighToLow);
  const trayOrderKey = trayCards.map((c) => c.id).join("|");
  const trayEmpty = cards.every((c) => c.fixed || placements[c.id] !== "tray");
  const guideCardIds = useMemo(() => {
    if (campaign !== "howto" && campaign !== "training") return [];
    const ids = trayCards.filter((c) => targets[c.id]).map((c) => c.id);
    if (drag?.id && targets[drag.id] && !ids.includes(drag.id)) ids.push(drag.id);
    return ids;
  }, [campaign, trayOrderKey, targets, drag?.id]);

  useLayoutEffect(() => {
    const els = [...(trayRef.current?.querySelectorAll("[data-fly-card]") ?? [])] as HTMLElement[];
    if (skipTrayReorg.current) return;
    trayPrevRects.current = trayReorg(els, trayPrevRects.current);
  }, [trayOrderKey]);

  const revealWin = useCallback(() => {
    if (!pendingWin.current) return;
    if (pendingFloats.current > 0) return;
    pendingWin.current = false;
    const nxt = campaign === "training" && level ? nextLevel(level) : null;
    if (nxt) {
      void navigate({ to: "/play", search: { mode: nxt.campaign, id: nxt.id } });
      return;
    }
    setShowWinUi(true);
    playWin();
  }, [campaign, level, navigate]);

  const spawnFloats = useCallback(
    (fresh: DetectedHand[]) => {
      fresh.forEach((h, i) => {
        const mid = midpoint(h.cells);
        const el = document.createElement("div");
        el.className = "score-float";
        el.textContent = `+${h.score}`;
        const spread = (i - (fresh.length - 1) / 2) * 40;
        el.style.left = `${mid.x + spread}px`;
        el.style.top = `${mid.y}px`;
        document.body.appendChild(el);
        pendingFloats.current++;
        gsap.fromTo(
          el,
          { opacity: 0, scale: 0.45, y: 10 },
          {
            opacity: 1,
            scale: 1.18,
            y: -16,
            duration: 0.32,
            ease: "back.out(2)",
            onComplete: () => {
              gsap.to(el, {
                opacity: 0,
                y: -70,
                duration: 0.7,
                delay: 0.22,
                ease: "power1.in",
                onComplete: () => {
                  el.remove();
                  pendingFloats.current--;
                  revealWin();
                },
              });
            },
          },
        );
      });
    },
    [revealWin],
  );

  useEffect(() => {
    const sig = hands.map(handKey).sort().join("§");
    if (!prevHands.current) {
      prevHands.current = sig;
      return;
    }
    if (sig === prevHands.current) return;
    const prevKeys = new Set(prevHands.current.split("§").filter(Boolean));
    const brandNew = hands.filter((h) => !prevKeys.has(handKey(h)));
    prevHands.current = sig;
    if (brandNew.length) {
      playHand();
      setToast(handLabel(hands));
      spawnFloats(brandNew);
    }
  }, [hands, spawnFloats]);

  useEffect(() => {
    if (!level || won || drag || !trayEmpty) {
      if (bounceTimer.current) {
        window.clearTimeout(bounceTimer.current);
        bounceTimer.current = null;
      }
    }
    if (!level || won || drag) return;
    if (cards.some((c) => placements[c.id] == null)) return;
    if (meetsWin(level, hands, trayEmpty, score, cards, placements, targets)) {
      setWon(true);
      recordScore(level.id, level.campaign, score);
      void saveHighScore({ data: { levelId: level.id, score } }).catch(() => {});
      pendingWin.current = true;
      if (pendingFloats.current === 0) {
        window.setTimeout(revealWin, 380);
      }
      return;
    }
    if (level.win.exactTargets && trayEmpty && history.length > 0) {
      if (bounceTimer.current != null) return;
      bounceTimer.current = window.setTimeout(() => {
        bounceTimer.current = null;
        const curr = placementsRef.current;
        const next = { ...curr };
        const before = new Map<string, DOMRect>();
        const ids: string[] = [];
        for (const c of cards) {
          if (c.fixed) continue;
          if (!sameCell(next[c.id], targets[c.id])) {
            const el = document.querySelector(`[data-card-id="${c.id}"]`);
            if (el instanceof HTMLElement) before.set(c.id, el.getBoundingClientRect());
            next[c.id] = "tray";
            ids.push(c.id);
          }
        }
        if (!ids.length) return;
        setPlacements(next);
        setSelectedCard(null);
        setSelectedSlot(null);
        playBounce();
        playWhoosh();
        setToast("Not the right seats — those cards return to your hand.");
        bounceHomeRef.current(ids, before);
      }, 680);
    } else if (level.win.allScore && trayEmpty) {
      setToast("Every card must sit in a scoring hand.");
    }
  }, [hands, trayEmpty, drag, score, level, won, cards, placements, targets, revealWin, history.length]);

  useEffect(() => {
    if (!showWinUi) return;
    const overlay = winOverlayRef.current;
    const box = winBoxRef.current;
    if (!overlay || !box) return;
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.28 });
    gsap.fromTo(box, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: "back.out(1.5)" });
  }, [showWinUi]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const boardW = grid * CELL_W + (grid - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
    const boardH = grid * CELL_H + (grid - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
    const measure = () => {
      const availW = Math.max(1, wrap.clientWidth);
      const availH = Math.max(1, wrap.clientHeight);
      const s = Math.min(availW / boardW, availH / boardH);
      setScale(Number.isFinite(s) && s > 0 ? s : 0.4);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [grid, level]);

  const commit = useCallback(
    (next: Placement, placedId?: string) => {
      setHistory((h) => [...h, placements]);
      setPlacements(next);
      playPlace();
      if (placedId) lastPop.current = placedId;
    },
    [placements],
  );

  const flyAfter = useCallback((ids: string[], before: Map<string, DOMRect>) => {
    swappingRef.current = true;
    skipTrayReorg.current = true;
    requestAnimationFrame(() => {
      const shots: { node: HTMLElement; from: DOMRect; to: DOMRect }[] = [];
      for (const id of ids) {
        const el = document.querySelector(`[data-card-id="${id}"]`);
        const from = before.get(id);
        if (!(el instanceof HTMLElement) || !from) continue;
        shots.push({ node: el, from, to: el.getBoundingClientRect() });
      }
      void cardSwapFly(shots).finally(() => {
        for (const s of shots) s.node.style.visibility = "";
        swappingRef.current = false;
        const trayEls = [...(trayRef.current?.querySelectorAll("[data-fly-card]") ?? [])] as HTMLElement[];
        const seeded = new Map<string, DOMRect>();
        for (const el of trayEls) {
          const id = el.dataset.cardId;
          if (id) seeded.set(id, el.getBoundingClientRect());
        }
        trayPrevRects.current = seeded;
        skipTrayReorg.current = false;
      });
    });
  }, []);

  const bounceHome = useCallback((ids: string[], before: Map<string, DOMRect>) => {
    swappingRef.current = true;
    skipTrayReorg.current = true;
    requestAnimationFrame(() => {
      const shots: { node: HTMLElement; from: DOMRect; to: DOMRect }[] = [];
      for (const id of ids) {
        const el = document.querySelector(`[data-card-id="${id}"]`);
        const from = before.get(id);
        if (!(el instanceof HTMLElement) || !from) continue;
        shots.push({ node: el, from, to: el.getBoundingClientRect() });
      }
      void rejectFlyHome(shots).finally(() => {
        for (const s of shots) s.node.style.visibility = "";
        swappingRef.current = false;
        const trayEls = [...(trayRef.current?.querySelectorAll("[data-fly-card]") ?? [])] as HTMLElement[];
        const seeded = new Map<string, DOMRect>();
        for (const el of trayEls) {
          const id = el.dataset.cardId;
          if (id) seeded.set(id, el.getBoundingClientRect());
        }
        trayPrevRects.current = seeded;
        skipTrayReorg.current = false;
      });
    });
  }, []);
  bounceHomeRef.current = bounceHome;

  const captureRect = (id: string) => {
    const el = document.querySelector(`[data-card-id="${id}"]`);
    return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
  };

  const doSwap = useCallback(
    (idA: string, idB: string) => {
      if (won || swappingRef.current) return false;
      if (idA === idB) return false;
      const a = cardsById.get(idA);
      const b = cardsById.get(idB);
      if (!a || !b || a.fixed || b.fixed) return false;
      const posA = placements[idA];
      const posB = placements[idB];
      if (posA == null || posB == null) return false;
      if (posA === "tray" && posB === "tray") return false;
      const next = { ...placements, [idA]: posB, [idB]: posA };
      const before = new Map<string, DOMRect>();
      const ra = captureRect(idA);
      const rb = captureRect(idB);
      if (ra) before.set(idA, ra);
      if (rb) before.set(idB, rb);
      setHistory((h) => [...h, placements]);
      setPlacements(next);
      setSelectedCard(null);
      setSelectedSlot(null);
      playWhoosh();
      flyAfter([idA, idB], before);
      return true;
    },
    [won, cardsById, placements, flyAfter],
  );

  useLayoutEffect(() => {
    if (!lastPop.current) return;
    const el = document.querySelector(`[data-card-id="${lastPop.current}"]`);
    placePop(el);
    lastPop.current = null;
  }, [placements]);

  useEffect(() => {
    if (!selectedCard) return;
    selectPulse(document.querySelector(`[data-card-id="${selectedCard}"]`));
    playSelect();
  }, [selectedCard]);

  const tryPlace = useCallback(
    (cardId: string, dest: Cell | "tray") => {
      if (won || swappingRef.current) return false;
      const from = placements[cardId];
      if (dest !== "tray") {
        const occ = occupiedAt(placements, dest.r, dest.c, cardId);
        if (occ) return doSwap(cardId, occ);
        if (!canSeat(dest.r, dest.c, cardId)) return false;
      }
      const next = { ...placements, [cardId]: dest };
      if (JSON.stringify(next) === JSON.stringify(placements)) return false;
      const goingHome = dest === "tray" && from !== "tray";
      if (goingHome) {
        const before = new Map<string, DOMRect>();
        const r = captureRect(cardId);
        if (r) before.set(cardId, r);
        setHistory((h) => [...h, placements]);
        setPlacements(next);
        setSelectedCard(null);
        setSelectedSlot(null);
        playWhoosh();
        flyAfter([cardId], before);
        return true;
      }
      commit(next, dest === "tray" ? undefined : cardId);
      setSelectedCard(null);
      setSelectedSlot(null);
      return true;
    },
    [canSeat, placements, commit, doSwap, flyAfter, won],
  );

  const onCardTap = useCallback(
    (card: Card) => {
      if (card.fixed || won || swappingRef.current) return;
      if (selectedSlot) {
        tryPlace(card.id, selectedSlot);
        return;
      }
      if (selectedCard && selectedCard !== card.id) {
        const from = placements[selectedCard];
        const to = placements[card.id];
        if (from === "tray" && to === "tray") {
          setSelectedCard(card.id);
          return;
        }
        if (doSwap(selectedCard, card.id)) return;
      }
      if (selectedCard === card.id) {
        setSelectedCard(null);
        return;
      }
      setSelectedCard(card.id);
      setSelectedSlot(null);
    },
    [selectedSlot, selectedCard, tryPlace, doSwap, placements, won],
  );

  const onSlotTap = useCallback(
    (cell: Cell) => {
      if (won || swappingRef.current) return;
      const occ = occupiedAt(placements, cell.r, cell.c);
      if (occ && selectedCard) {
        doSwap(selectedCard, occ);
        return;
      }
      if (!canSeat(cell.r, cell.c)) return;
      if (selectedCard) {
        tryPlace(selectedCard, cell);
        return;
      }
      if (selectedSlot && selectedSlot.r === cell.r && selectedSlot.c === cell.c) {
        setSelectedSlot(null);
        return;
      }
      setSelectedSlot(cell);
      setSelectedCard(null);
    },
    [canSeat, selectedCard, selectedSlot, tryPlace, doSwap, placements, won],
  );

  const returnToHand = useCallback(() => {
    if (!selectedCard || won || swappingRef.current) return;
    if (placements[selectedCard] === "tray") return;
    tryPlace(selectedCard, "tray");
  }, [selectedCard, placements, tryPlace, won]);

  const onPointerDown = (e: ReactPointerEvent, card: Card) => {
    if (card.fixed || won || swappingRef.current) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    unlockAudio();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const origin = placements[card.id];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pendingRef.current = {
      id: card.id,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      origin: origin === "tray" || !origin ? "tray" : origin,
    };
  };

  const ghostBox = (x: number, y: number, grabX: number, grabY: number) =>
    new DOMRect(x - grabX, y - grabY, CELL_W * scale, CELL_H * scale);

  const overlapArea = (a: DOMRect, b: DOMRect) => {
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return w * h;
  };

  const hitFromBox = (box: DOMRect, skipId?: string) => {
    type Hit = {
      r: number;
      c: number;
      score: number;
      overlap: number;
      empty: boolean;
      swapId: string | null;
    };
    const hits: Hit[] = [];
    const nodes = wrapRef.current?.querySelectorAll<HTMLElement>("[data-board-cell]") ?? [];
    for (const n of nodes) {
      if (n.dataset.r == null || n.dataset.c == null) continue;
      const rect = n.getBoundingClientRect();
      const tile = rect.width * rect.height;
      if (tile < 1) continue;
      const overlap = overlapArea(box, rect);
      if (overlap <= 0) continue;
      const r = Number(n.dataset.r);
      const c = Number(n.dataset.c);
      const occ = occupiedAt(placements, r, c, skipId);
      const other = occ ? cardsById.get(occ) : undefined;
      hits.push({
        r,
        c,
        score: overlap / tile,
        overlap,
        empty: canSeat(r, c, skipId),
        swapId: other && !other.fixed ? other.id : null,
      });
    }

    const empties = hits.filter((h) => h.empty);
    const swaps = hits.filter((h) => h.swapId);
    const maxOf = (arr: Hit[]) => arr.reduce((a, b) => (a.score >= b.score ? a : b));

    let chosen: Hit | null = null;
    if (empties.length === 1) chosen = empties[0];
    else if (empties.length > 1) chosen = maxOf(empties);
    else if (swaps.length) chosen = maxOf(swaps);
    else if (hits.length) chosen = maxOf(hits);

    let trayOverlap = 0;
    const trayEl = trayRef.current;
    if (trayEl) trayOverlap = overlapArea(box, trayEl.getBoundingClientRect());
    const uniqueEmpty = empties.length === 1;
    const trayWins =
      trayOverlap > 0 && !uniqueEmpty && (!chosen || trayOverlap > chosen.overlap);

    return {
      cardId: chosen && !trayWins ? chosen.swapId : null,
      cell: chosen && !trayWins ? { r: chosen.r, c: chosen.c } : null,
      tray: trayWins,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const pending = pendingRef.current;
    if (pending && !drag) {
      const dist = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
      if (dist >= DRAG_THRESHOLD) {
        setDrag({
          id: pending.id,
          x: e.clientX,
          y: e.clientY,
          grabX: pending.grabX,
          grabY: pending.grabY,
          origin: pending.origin,
        });
        setSelectedCard(null);
        setSelectedSlot(null);
      }
      return;
    }
    if (!drag) return;
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const hit = hitFromBox(ghostBox(e.clientX, e.clientY, drag.grabX, drag.grabY), drag.id);
    if (hit.cardId) {
      const other = cardsById.get(hit.cardId);
      if (other && !other.fixed) {
        setHoverSwapId(hit.cardId);
        setHoverCell(null);
        return;
      }
    }
    setHoverSwapId(null);
    setHoverCell(hit.cell);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (drag) {
      const hit = hitFromBox(ghostBox(e.clientX, e.clientY, drag.grabX, drag.grabY), drag.id);
      setDrag(null);
      setHoverCell(null);
      setHoverSwapId(null);
      if (hit.cardId && hit.cardId !== drag.id) {
        if (doSwap(drag.id, hit.cardId)) return;
      }
      let dest: Cell | "tray" = "tray";
      if (hit.cell) {
        if (canSeat(hit.cell.r, hit.cell.c, drag.id)) dest = hit.cell;
        else dest = drag.origin;
      } else if (hit.tray) {
        dest = "tray";
      } else {
        dest = drag.origin;
      }
      if (dest === "tray" && drag.origin !== "tray") {
        tryPlace(drag.id, "tray");
        return;
      }
      const next = { ...placements, [drag.id]: dest };
      const placedId = dest !== "tray" && JSON.stringify(next) !== JSON.stringify(placements) ? drag.id : undefined;
      if (JSON.stringify(next) !== JSON.stringify(placements)) commit(next, placedId);
      return;
    }
    if (pending) {
      const card = cardsById.get(pending.id);
      if (card) onCardTap(card);
    }
  };

  const reset = () => {
    if (campaign === "free") {
      setDealKey((k) => k + 1);
      return;
    }
    if (!level) return;
    setPlacements(built.placements);
    setHistory([]);
    setWon(false);
    setShowWinUi(false);
    pendingWin.current = false;
    setToast(level.briefing);
    clearSelect();
    prevHands.current = "";
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setPlacements(prev);
    setWon(false);
    setShowWinUi(false);
    pendingWin.current = false;
    clearSelect();
  };

  const scatterThen = async (after: () => void) => {
    setShowWinUi(false);
    if (campaign === "training") {
      after();
      return;
    }
    const nodes = [
      ...document.querySelectorAll<HTMLElement>("[data-fly-card]"),
      ...document.querySelectorAll<HTMLElement>("[data-fly-stop]"),
      ...document.querySelectorAll<HTMLElement>("[data-teach-mark]"),
    ];
    playWhoosh();
    await Promise.race([
      scatterElements(nodes),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1400)),
    ]);
    after();
  };

  const goNext = () => {
    if (campaign === "endless") {
      void scatterThen(() => {
        setWon(false);
        pendingWin.current = false;
        void loadEndless(tableNo + 1);
      });
      return;
    }
    const nxt = level ? nextLevel(level) : null;
    if (!nxt) return;
    void scatterThen(() => {
      void navigate({ to: "/play", search: { mode: nxt.campaign, id: nxt.id } });
    });
  };

  const nxt = level && campaign !== "endless" ? nextLevel(level) : null;
  const dragCard = drag ? cardsById.get(drag.id) : null;
  const innerW = grid * CELL_W + (grid - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
  const innerH = grid * CELL_H + (grid - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
  const remain = cards.filter((c) => !c.fixed).length;
  const placed = remain - trayCards.length;

  if (campaign === "endless" && (endlessLoading || !level)) {
    return (
      <div className="felt-bg relative h-dvh">
        <WaitOverlay
          show
          variant="builder"
          progress={genProgress}
          onReady={markOverlayReady}
        />
      </div>
    );
  }

  if (campaign === "custom" && !savedReady) return null;

  if (campaign === "custom" && !level) {
    return (
      <div className="felt-bg relative flex h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-2xl font-semibold tracking-tight">This table is missing</p>
        <p className="mt-2 max-w-sm text-sm text-fg-muted">
          The share link is broken, or the saved table is no longer on this device.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/">Back to lobby</Link>
        </Button>
      </div>
    );
  }

  if (!level) return null;

  return (
    <div className="felt-bg relative flex h-dvh flex-col overflow-hidden">
      <div className="felt-noise absolute inset-0" />
      <WaitOverlay
        show={
          holdPlease &&
          !(campaign === "training" && prevFeltRef.current.cards.size > 0)
        }
      />
      <GuideArrows
        active={
          (campaign === "howto" || campaign === "training") &&
          !won &&
          !awaitingDeal &&
          !holdPlease
        }
        cardIds={guideCardIds}
        targets={targets}
        drag={drag}
        scale={scale}
      />
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-2 py-1">
        <Link
          to="/"
          className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
          aria-label="Back"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
            {campaignLabel(campaign, difficulty)}
            {level.number ? `  ·  ${level.number}` : ""}
            {campaign === "puzzle" && level.group ? `  ·  ${level.group}` : ""}
          </p>
          <h1 className="truncate font-display text-base font-semibold tracking-tight sm:text-lg">{level.name}</h1>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
            aria-label="Share"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="size-5" />
          </button>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              unlockAudio();
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-5" />
          </button>
        </div>
      </header>

      <div ref={stageRef} className="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden px-0 pb-2 sm:px-3">
        <div className="mb-1 flex shrink-0 items-start justify-between gap-3 px-1">
          <p className="min-w-0 flex-1 text-xs leading-snug text-fg-muted sm:text-sm">
            {toast || level.briefing}
          </p>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-fg-subtle sm:inline">
              {placed}/{remain}
            </span>
            <div className="glass-chip rounded-full px-3 py-0.5 font-display text-base tabular-nums tracking-tight sm:text-lg">
              {score}
            </div>
          </div>
        </div>

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
              className="rounded-md border-board-rim bg-felt shadow-[inset_0_0_28px_rgba(0,0,0,0.4)]"
              style={{ borderWidth: BOARD_RAIL, padding: BOARD_PAD }}
            >
              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: `repeat(${grid}, ${CELL_W}px)`,
                  gridTemplateRows: `repeat(${grid}, ${CELL_H}px)`,
                  gap: CELL_GAP,
                  fontSize: 11,
                }}
              >
                {Array.from({ length: grid * grid }, (_, i) => {
                  const r = Math.floor(i / grid);
                  const c = i % grid;
                  const key = cellKey(r, c);
                  const isBlocked = blocked.has(key);
                  const showStop = isBlocked;
                  const occ = occupiedAt(placements, r, c);
                  const card = occ ? cardsById.get(occ) : undefined;
                  const isTarget = targetKeys.has(key);
                  const canSwapHere = !!card && !card.fixed && !!drag && drag.id !== card.id;
                  const droppable =
                    !isBlocked &&
                    (canSwapHere || ((!occ || occ === drag?.id) && (!goldOnly || isTarget)));
                  const isSlotSel = !!selectedSlot && selectedSlot.r === r && selectedSlot.c === c;
                  const isCardSel = !!card && selectedCard === card.id;
                  const isSwapHover = !!card && hoverSwapId === card.id;
                  const isHover =
                    !!hoverCell && hoverCell.r === r && hoverCell.c === c && droppable && !card;
                  const isHi = highlighted.has(key) && occ !== drag?.id;
                  return (
                    <div
                      key={key}
                      data-board-cell="1"
                      data-cell={droppable ? "1" : undefined}
                      data-r={r}
                      data-c={c}
                      className={cn(
                        "relative rounded-[3px]",
                        isBlocked
                          ? "bg-rail/80"
                          : "border border-cell-line bg-cell",
                        isTarget && !card && "slot-mark",
                        isSlotSel && "ring-2 ring-gold",
                        isHover && "bg-ok/25 ring-1 ring-ok",
                        droppable && !card && "cursor-pointer",
                      )}
                      onPointerUp={
                        droppable && !card
                          ? (ev) => {
                              if (drag || pendingRef.current) return;
                              if (ev.button !== 0 && ev.pointerType === "mouse") return;
                              onSlotTap({ r, c });
                            }
                          : undefined
                      }
                    >
                      {showStop ? (
                        <span
                          data-fly-stop="1"
                          data-stop-key={key}
                          data-stay-felt={stopStay(key) ? "1" : undefined}
                          className={cn(
                            "pointer-events-none absolute inset-0 grid place-items-center",
                            awaitingDeal && !stopStay(key) && "invisible",
                          )}
                        >
                          <StopSign className="h-[70%] w-[70%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
                        </span>
                      ) : null}
                      {card ? (
                        <button
                          type="button"
                          data-fly-card="1"
                          data-on-board="1"
                          data-card-id={card.id}
                          data-stay-felt={feltStay(r, c, card.rank, card.suit) ? "1" : undefined}
                          className={cn(
                            "absolute inset-[1px] touch-none rounded-[4px]",
                            awaitingDeal && !feltStay(r, c, card.rank, card.suit) && "invisible",
                            drag?.id === card.id && "invisible",
                            isCardSel && "ring-2 ring-gold ring-offset-1 ring-offset-felt",
                            isSwapHover && "ring-2 ring-ok ring-offset-1 ring-offset-felt",
                            !isCardSel &&
                              !isSwapHover &&
                              isHi &&
                              "ring-2 ring-cream/70",
                          )}
                          style={{ cursor: card.fixed ? "default" : "grab" }}
                          onPointerDown={(ev) => onPointerDown(ev, card)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                          disabled={card.fixed}
                        >
                          <div className="h-full w-full" style={{ filter: placedShadow }}>
                            <CardFace card={card} dimmed={card.fixed} style={cardStyle} />
                          </div>
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {teachMarks.map((mark) => {
                  const rs = mark.cells.map((p) => p.r);
                  const cs = mark.cells.map((p) => p.c);
                  const r0 = Math.min(...rs);
                  const r1 = Math.max(...rs);
                  const c0 = Math.min(...cs);
                  const c1 = Math.max(...cs);
                  const pad = 3;
                  const left = c0 * (CELL_W + CELL_GAP) - pad;
                  const top = r0 * (CELL_H + CELL_GAP) - pad;
                  const width = (c1 - c0 + 1) * CELL_W + (c1 - c0) * CELL_GAP + pad * 2;
                  const height = (r1 - r0 + 1) * CELL_H + (r1 - r0) * CELL_GAP + pad * 2;
                  const side =
                    mark.axis === "row"
                      ? mark.hang === "start"
                        ? "left-0 top-1/2 -translate-x-[55%] -translate-y-1/2"
                        : "right-0 top-1/2 translate-x-[55%] -translate-y-1/2"
                      : mark.hang === "start"
                        ? "left-1/2 top-0 -translate-x-1/2 -translate-y-[55%]"
                        : "left-1/2 bottom-0 -translate-x-1/2 translate-y-[55%]";
                  return (
                    <div
                      key={`teach-${mark.axis}-${mark.ok ? "ok" : "no"}-${r0}-${c0}`}
                      data-teach-mark="1"
                      aria-label={mark.ok ? "Correct combination" : "Incorrect combination"}
                      className={cn(
                        "pointer-events-none absolute z-20 rounded-[8px]",
                        awaitingDeal && "invisible",
                        mark.ok ? "teach-outline-ok" : "teach-outline-bad",
                      )}
                      style={{ left, top, width, height }}
                    >
                      <span
                        className={cn(
                          "teach-mark absolute",
                          mark.ok ? "text-[#4ad66a]" : "text-pip-red",
                          side,
                        )}
                      >
                        {mark.ok ? (
                          <Check
                            className="size-[44px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                            strokeWidth={3.25}
                          />
                        ) : (
                          <X
                            className="size-[44px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                            strokeWidth={3.25}
                          />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
          </div>
        </div>

        <div
          ref={trayRef}
          data-tray="1"
          className="glass-chip mt-1.5 shrink-0 rounded-2xl border-dashed border-gold/50 p-1.5"
          onPointerUp={(ev) => {
            if (drag || pendingRef.current) return;
            if (ev.button !== 0 && ev.pointerType === "mouse") return;
            const t = ev.target as HTMLElement | null;
            if (t?.closest("[data-card-id]")) return;
            returnToHand();
          }}
        >
          <p className="mb-1 text-center text-[10px] uppercase tracking-[0.16em] text-fg-subtle">
            Hand · {trayCards.length} to place
            {selectedCard && placements[selectedCard] !== "tray"
              ? " · tap the tray to return"
              : selectedCard || selectedSlot
                ? " · tap a card to swap or a seat to place"
                : ""}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {trayCards.map((card) => (
              <button
                key={card.id}
                type="button"
                data-fly-card="1"
                data-card-id={card.id}
                className={cn(
                  "h-[42px] w-[30px] shrink-0 touch-none",
                  awaitingDeal && "invisible",
                  drag?.id === card.id && "invisible",
                  selectedCard === card.id && "ring-2 ring-gold ring-offset-1 ring-offset-bg",
                  hoverSwapId === card.id && "ring-2 ring-ok ring-offset-1 ring-offset-bg",
                )}
                style={{ cursor: "grab", fontSize: 10 }}
                onPointerDown={(ev) => onPointerDown(ev, card)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <CardFace card={card} tray style={cardStyle} />
              </button>
            ))}
            {trayCards.length === 0 ? (
              <p className="py-2 text-sm text-fg-subtle">All cards are on the table</p>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex shrink-0 flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={undo} disabled={!history.length}>
            <Undo2 className="size-4" />
            Undo
          </Button>
          <Button variant="secondary" size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            {campaign === "free" ? "New deal" : "Reset"}
          </Button>
        </div>
      </div>

      {drag && dragCard ? (
        <div
          className="pointer-events-none fixed z-50 rotate-[4deg]"
          style={{
            left: drag.x - drag.grabX,
            top: drag.y - drag.grabY,
            width: CELL_W * scale,
            height: CELL_H * scale,
            fontSize: Math.max(8, 11 * scale),
            filter: placedShadow,
          }}
        >
          <CardFace card={dragCard} tray style={cardStyle} className="bg-gold" />
        </div>
      ) : null}

      {showWinUi ? (
        <div ref={winOverlayRef} className="glass-scrim fixed inset-0 z-40 grid place-items-center p-4">
          <div ref={winBoxRef} className="glass w-full max-w-sm rounded-[28px] p-6 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-ok/20 text-ok">
              <Check className="size-6" />
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {campaign === "free" ? "Round complete" : "Table complete"}
            </h2>
            <p className="mt-2 text-sm text-fg-muted">Score {score}</p>
            <div className="mt-5 flex flex-col gap-2">
              {campaign === "endless" || nxt ? (
                <Button onClick={goNext}>Next table</Button>
              ) : campaign === "free" ? (
                <Button onClick={reset}>Deal again</Button>
              ) : (
                <Button asChild>
                  <Link to="/">Back to lobby</Link>
                </Button>
              )}
              <Button variant="secondary" onClick={() => setShareOpen(true)}>
                <Share2 className="size-4" />
                Share table
              </Button>
              <Button variant="secondary" onClick={reset}>
                Replay
              </Button>
              {campaign === "endless" || nxt ? (
                <Button variant="ghost" asChild>
                  <Link to="/">Lobby</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {level ? (
        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          url={levelShareUrl(level)}
          title="Share this table"
          blurb="Scan the code or copy the link. Gold seats stay unique."
        />
      ) : null}
    </div>
  );
}

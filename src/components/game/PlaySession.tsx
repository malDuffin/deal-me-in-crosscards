import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, RotateCcw, Settings2, Undo2, Volume2, VolumeX } from "lucide-react";
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
import { makeProceduralLevel } from "@/lib/game/endless";
import { findLevel, nextLevel } from "@/lib/game/levels";
import { decodeLevel } from "@/lib/game/share";
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
import { dealIn, fixedDealIn, placePop, scatterElements, selectPulse, trayReorg } from "@/lib/game/juice";
import { cellKey, scanBoard, totalScore } from "@/lib/game/poker";
import { recordScore } from "@/lib/game/progress";
import { useSettings } from "@/lib/game/settings";
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
import { DealingScreen } from "./DealingScreen";
import { SettingsSheet } from "./SettingsSheet";

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

/** In puzzle modes (everything except free play) cards may only land on gold target cells. */
function seatsLocked(campaign: Campaign, targetCount: number): boolean {
  return campaign !== "free" && targetCount > 0;
}

function sameCell(a: Cell | "tray" | undefined, b: Cell | undefined) {
  if (!a || a === "tray" || !b) return false;
  return a.r === b.r && a.c === b.c;
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
  const [tableNo, setTableNo] = useState(1);
  const [revealDeal, setRevealDeal] = useState(campaign !== "endless");
  const [dealPace, setDealPace] = useState<"full" | "quick">("full");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cardStyle = useSettings((s) => s.cardStyle);
  const muted = useSettings((s) => s.muted);
  const setMuted = useSettings((s) => s.setMuted);
  const nextCache = useRef<{ n: number; difficulty: Difficulty; level: Level } | null>(null);

  const staticLevel = useMemo(() => {
    if (campaign === "endless") return null;
    if (share) {
      const decoded = decodeLevel(share);
      if (decoded) return decoded;
    }
    return findLevel(campaign, levelId);
  }, [campaign, levelId, dealKey, share]);
  const level = campaign === "endless" ? endlessLevel : staticLevel;

  const loadEndless = useCallback(
    (n: number) => {
      const cached = nextCache.current;
      const hit = cached && cached.n === n && cached.difficulty === difficulty;
      setTableNo(n);
      setRevealDeal(false);
      setDealPace(hit ? "quick" : "full");
      if (hit && cached) {
        nextCache.current = null;
        setEndlessLevel(cached.level);
        setEndlessLoading(false);
        nextCache.current = {
          n: n + 1,
          difficulty,
          level: makeProceduralLevel(difficulty, n + 1),
        };
        return;
      }
      setEndlessLoading(true);
      const lvl = makeProceduralLevel(difficulty, n);
      setEndlessLevel(lvl);
      setEndlessLoading(false);
      nextCache.current = {
        n: n + 1,
        difficulty,
        level: makeProceduralLevel(difficulty, n + 1),
      };
    },
    [difficulty],
  );

  useEffect(() => {
    nextCache.current = null;
    if (campaign === "endless") loadEndless(1);
  }, [campaign, loadEndless]);

  const built = useMemo(
    () =>
      level
        ? setupLevel(level)
        : { cards: [] as Card[], placements: {} as Placement, blocked: new Set<string>(), targets: {} as Record<string, Cell> },
    [level],
  );
  const cards = built.cards;
  const blocked = built.blocked;
  const targets = built.targets;
  const grid = level?.grid ?? 11;
  const [placements, setPlacements] = useState<Placement>(built.placements);
  const [history, setHistory] = useState<Placement[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Cell | null>(null);
  const [won, setWon] = useState(false);
  const [showWinUi, setShowWinUi] = useState(false);
  const [toast, setToast] = useState(level?.briefing ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);
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

  const targetKeys = useMemo(() => {
    const s = new Set<string>();
    for (const t of Object.values(targets)) s.add(cellKey(t.r, t.c));
    return s;
  }, [targets]);

  const locked = seatsLocked(campaign, Object.keys(targets).length);

  const canSeat = useCallback(
    (r: number, c: number, skipId?: string) => {
      if (blocked.has(cellKey(r, c))) return false;
      if (occupiedAt(placements, r, c, skipId)) return false;
      if (locked && !targetKeys.has(cellKey(r, c))) return false;
      return true;
    },
    [blocked, placements, locked, targetKeys],
  );

  const clearSelect = useCallback(() => {
    setSelectedCard(null);
    setSelectedSlot(null);
  }, []);

  useEffect(() => {
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
    prevHands.current = "";
    trayPrevRects.current = new Map();
    requestAnimationFrame(() => {
      const boardEls = [...(wrapRef.current?.querySelectorAll<HTMLElement>("[data-fly-card][data-on-board]") ?? [])];
      const trayEls = [...(trayRef.current?.querySelectorAll<HTMLElement>("[data-fly-card]") ?? [])];
      fixedDealIn(boardEls);
      dealIn(trayEls);
      if (trayEls.length) playDeal();
      requestAnimationFrame(() => {
        const els = [...(trayRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])];
        const map = new Map<string, DOMRect>();
        for (const el of els) {
          const id = el.dataset.cardId;
          if (id) map.set(id, el.getBoundingClientRect());
        }
        trayPrevRects.current = map;
      });
    });
  }, [built, level?.briefing]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const scanPlacements = useMemo(() => {
    if (!drag) return placements;
    const copy = { ...placements };
    copy[drag.id] = "tray";
    return copy;
  }, [placements, drag]);

  const hands = useMemo(
    () => scanBoard(grid, blocked, scanPlacements, cardsById),
    [grid, blocked, scanPlacements, cardsById],
  );
  const score = totalScore(hands);
  const highlighted = useMemo(() => {
    const s = new Set<string>();
    for (const h of hands) for (const c of h.cells) s.add(cellKey(c.r, c.c));
    return s;
  }, [hands]);

  const trayCards = cards
    .filter((c) => placements[c.id] === "tray")
    .slice()
    .sort(sortHighToLow);
  const trayEmpty = cards.every((c) => c.fixed || placements[c.id] !== "tray");

  const trayOrderKey = trayCards.map((c) => c.id).join(",");

  useLayoutEffect(() => {
    if (!trayRef.current) return;
    const els = [...trayRef.current.querySelectorAll<HTMLElement>("[data-card-id]")];
    trayPrevRects.current = trayReorg(els, trayPrevRects.current);
  }, [trayOrderKey]);

  const revealWin = useCallback(() => {
    if (!pendingWin.current) return;
    if (pendingFloats.current > 0) return;
    pendingWin.current = false;
    setShowWinUi(true);
    playWin();
  }, []);

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
    if (!level || won || drag || endlessLoading) return;
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
      const next = { ...placements };
      let bounced = 0;
      for (const c of cards) {
        if (c.fixed) continue;
        if (!sameCell(next[c.id], targets[c.id])) {
          next[c.id] = "tray";
          bounced++;
        }
      }
      if (bounced) {
        setPlacements(next);
        setSelectedCard(null);
        setSelectedSlot(null);
        playBounce();
        setToast("Not the right seats — those cards return to your hand.");
      }
    }
  }, [hands, trayEmpty, drag, score, level, won, cards, placements, targets, endlessLoading, revealWin, history.length]);

  useEffect(() => {
    if (!showWinUi) return;
    const overlay = winOverlayRef.current;
    const box = winBoxRef.current;
    if (!overlay || !box) return;
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.28 });
    gsap.fromTo(box, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: "back.out(1.5)" });
  }, [showWinUi]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const innerW = grid * CELL_W + (grid - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
    const innerH = grid * CELL_H + (grid - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
    // Tray cards (one row of CELL_H) + tray chrome (label + border + padding ~44px) + buttons row (~52px) + gaps (~24px)
    const CHROME_H = CELL_H + 44 + 52 + 24;
    const measure = () => {
      const s = Math.min(1.25, el.clientWidth / innerW, (el.clientHeight - CHROME_H) / innerH);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [grid]);

  const commit = useCallback(
    (next: Placement, placedId?: string) => {
      setHistory((h) => [...h, placements]);
      setPlacements(next);
      playPlace();
      if (placedId) lastPop.current = placedId;
    },
    [placements],
  );

  useEffect(() => {
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
      if (dest !== "tray") {
        if (!canSeat(dest.r, dest.c, cardId)) return false;
      }
      const next = { ...placements, [cardId]: dest };
      if (JSON.stringify(next) === JSON.stringify(placements)) return false;
      commit(next, dest === "tray" ? undefined : cardId);
      setSelectedCard(null);
      setSelectedSlot(null);
      return true;
    },
    [canSeat, placements, commit],
  );

  const onCardTap = useCallback(
    (card: Card) => {
      if (card.fixed) return;
      if (selectedSlot) {
        tryPlace(card.id, selectedSlot);
        return;
      }
      if (selectedCard === card.id) {
        setSelectedCard(null);
        return;
      }
      setSelectedCard(card.id);
      setSelectedSlot(null);
    },
    [selectedSlot, selectedCard, tryPlace],
  );

  const onSlotTap = useCallback(
    (cell: Cell) => {
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
    [canSeat, selectedCard, selectedSlot, tryPlace],
  );

  const onPointerDown = (e: ReactPointerEvent, card: Card) => {
    if (card.fixed || won) return;
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
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const hit = stack.find((n) => n instanceof HTMLElement && n.dataset.cell);
    if (hit instanceof HTMLElement && hit.dataset.r && hit.dataset.c) {
      setHoverCell({ r: Number(hit.dataset.r), c: Number(hit.dataset.c) });
    } else {
      setHoverCell(null);
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (drag) {
      const stack = document.elementsFromPoint(e.clientX, e.clientY);
      const hit = stack.find((n) => n instanceof HTMLElement && n.dataset.cell);
      let dest: Cell | "tray" = "tray";
      if (hit instanceof HTMLElement && hit.dataset.r && hit.dataset.c) {
        const r = Number(hit.dataset.r);
        const c = Number(hit.dataset.c);
        if (canSeat(r, c, drag.id)) {
          dest = { r, c };
        } else {
          dest = drag.origin;
        }
      } else if (stack.some((n) => n instanceof HTMLElement && n.dataset.tray === "1")) {
        dest = "tray";
      } else {
        dest = drag.origin;
      }
      const next = { ...placements, [drag.id]: dest };
      const placedId = dest !== "tray" && JSON.stringify(next) !== JSON.stringify(placements) ? drag.id : undefined;
      setDrag(null);
      setHoverCell(null);
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
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-fly-card]")];
    playWhoosh();
    setShowWinUi(false);
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

  if (campaign === "endless" && (!revealDeal || endlessLoading || !level)) {
    return (
      <DealingScreen
        key={`${difficulty}-${tableNo}`}
        difficulty={difficulty}
        table={tableNo}
        loaded={!endlessLoading && !!endlessLevel}
        pace={dealPace}
        onFinished={() => setRevealDeal(true)}
      />
    );
  }

  if (!level) return null;

  return (
    <div className="felt-bg relative flex h-dvh flex-col overflow-hidden">
      <div className="felt-noise absolute inset-0" />
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 py-1">
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
          <h1 className="font-display text-base font-semibold tracking-tight">{level.name}</h1>
        </div>
        <div className="flex items-center">
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
            <Settings2 className="size-5" />
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-2 pb-3">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <p className="min-h-9 flex-1 text-sm leading-snug text-fg-muted">
            {toast || level.briefing}
          </p>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-fg-subtle sm:inline">
              {placed}/{remain}
            </span>
            <div className="rounded-full border border-border bg-surface px-3 py-1 font-display text-lg tabular-nums tracking-tight">
              {score}
            </div>
          </div>
        </div>

        <div ref={wrapRef} className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full items-center justify-center py-1">
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
                  const occ = occupiedAt(placements, r, c);
                  const card = occ ? cardsById.get(occ) : undefined;
                  const isTarget = targetKeys.has(key);
                  const isSlotSel =
                    !!selectedSlot && selectedSlot.r === r && selectedSlot.c === c;
                  const isCardSel = !!card && selectedCard === card.id;
                  const isDroppable = !isBlocked && canSeat(r, c, drag?.id);
                  const isHover =
                    !!hoverCell &&
                    hoverCell.r === r &&
                    hoverCell.c === c &&
                    isDroppable;
                  const isHi = highlighted.has(key) && occ !== drag?.id;
                  return (
                    <div
                      key={key}
                      data-cell={isDroppable ? "1" : undefined}
                      data-r={isDroppable ? r : undefined}
                      data-c={isDroppable ? c : undefined}
                      className={cn(
                        "relative rounded-[3px]",
                        isBlocked
                          ? "bg-rail/80"
                          : "border border-cell-line bg-cell",
                        isTarget && !card && "slot-mark",
                        isSlotSel && "ring-2 ring-gold",
                        isHi && "bg-cell ring-2 ring-cream/70",
                        isHover && "bg-ok/25 ring-1 ring-ok",
                        !isBlocked && !card && "cursor-pointer",
                      )}
                      onPointerUp={
                        !isBlocked && !card
                          ? (ev) => {
                              if (drag || pendingRef.current) return;
                              if (ev.button !== 0 && ev.pointerType === "mouse") return;
                              onSlotTap({ r, c });
                            }
                          : undefined
                      }
                    >
                      {isBlocked ? (
                        <span className="absolute inset-[28%] rotate-45 rounded-[1px] bg-cream/25" />
                      ) : null}
                      {card ? (
                        <button
                          type="button"
                          data-fly-card="1"
                          data-on-board="1"
                          data-card-id={card.id}
                          className={cn(
                            "absolute inset-[1px] touch-none",
                            drag?.id === card.id && "invisible",
                            isCardSel && "ring-2 ring-gold ring-offset-1 ring-offset-felt",
                          )}
                          style={{ cursor: card.fixed ? "default" : "grab" }}
                          onPointerDown={(ev) => onPointerDown(ev, card)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                          disabled={card.fixed}
                        >
                          <CardFace card={card} dimmed={card.fixed} style={cardStyle} />
                        </button>
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

        <div
          ref={trayRef}
          data-tray="1"
          className="mt-2 shrink-0 rounded-2xl border border-dashed border-gold/50 bg-bg/80 p-2 backdrop-blur-sm"
        >
          <p className="mb-1.5 text-center text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
            Hand · {trayCards.length} to place
            {selectedCard || selectedSlot ? " · tap a seat or a card" : ""}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {trayCards.map((card) => (
              <button
                key={card.id}
                type="button"
                data-fly-card="1"
                data-card-id={card.id}
                className={cn(
                  "touch-none",
                  drag?.id === card.id && "invisible",
                  selectedCard === card.id && "ring-2 ring-gold ring-offset-1 ring-offset-bg",
                )}
                style={{ width: CELL_W * scale, height: CELL_H * scale, cursor: "grab", fontSize: 11 * scale }}
                onPointerDown={(ev) => onPointerDown(ev, card)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <CardFace card={card} tray style={cardStyle} />
              </button>
            ))}
            {trayCards.length === 0 ? (
              <p className="py-3 text-sm text-fg-subtle">All cards are on the table</p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
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
            fontSize: 11 * scale,
          }}
        >
          <CardFace card={dragCard} tray style={cardStyle} />
        </div>
      ) : null}

      {showWinUi ? (
        <div ref={winOverlayRef} className="fixed inset-0 z-40 grid place-items-center bg-bg/70 p-4">
          <div ref={winBoxRef} className="w-full max-w-sm rounded-[28px] border border-border bg-surface p-6 text-center">
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
    </div>
  );
}

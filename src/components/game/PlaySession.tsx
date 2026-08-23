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
import { lessonFor } from "@/lib/game/hand-lessons";
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
import { boardDealIn, cardSwapFly, celebrateWiggle, dealIn, flyInFromOffscreen, flyOutStopRects, placePop, prefersReducedMotion, rejectFlyHome, resetTrayFlip, scatterElements, selectPulse, snapshotTrayFlip, stopCelebrate, teachMarkIn, trayReorg } from "@/lib/game/juice";
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
  boardCols,
  boardRows,
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
import { HowToLesson } from "./HowToLesson";
import { PooledCardFace } from "./PooledCardFace";
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
  for (const f of level.fixed ?? []) {
    const card = makeCard(f.rank, f.suit, 0, true);
    cards.push(card);
    placements[card.id] = { r: f.r, c: f.c };
  }
  const targetList = level.targets ?? [];
  const used = new Set<number>();
  for (const h of level.hand) {
    const card = makeCard(h.rank, h.suit, 0, false);
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

const HAND_SKIN = "#fff4e8";
const HAND_LINE = "#1a1712";
const HAND_NAIL = "#f4c4b4";
const POINT_D =
  "M30 20.145s.094-2.362-1.791-3.068c-1.667-.625-2.309.622-2.309.622s.059-1.913-1.941-2.622c-1.885-.667-2.75.959-2.75.959s-.307-1.872-2.292-2.417C17.246 13.159 16 14.785 16 14.785V2.576C16 1.618 15.458.001 13.458 0S11 1.66 11 2.576v20.5c0 1-1 1-1 0V20.41c0-3.792-2.037-6.142-2.75-6.792-.713-.65-1.667-.98-2.82-.734-1.956.416-1.529 1.92-.974 3.197 1.336 3.078 2.253 7.464 2.533 9.538.79 5.858 5.808 10.375 11.883 10.381 6.626.004 12.123-5.298 12.128-11.924v-3.931z";
const THUMB_D =
  "M34.956 17.916c0-.503-.12-.975-.321-1.404-1.341-4.326-7.619-4.01-16.549-4.221-1.493-.035-.639-1.798-.115-5.668.341-2.517-1.282-6.382-4.01-6.382-4.498 0-.171 3.548-4.148 12.322-2.125 4.688-6.875 2.062-6.875 6.771v10.719c0 1.833.18 3.595 2.758 3.885C8.195 34.219 7.633 36 11.238 36h18.044c1.838 0 3.333-1.496 3.333-3.334 0-.762-.267-1.456-.698-2.018 1.02-.571 1.72-1.649 1.72-2.899 0-.76-.266-1.454-.696-2.015 1.023-.57 1.725-1.649 1.725-2.901 0-.909-.368-1.733-.961-2.336.757-.611 1.251-1.535 1.251-2.581z";
const THUMB_FINGERS_D =
  "M23.02 21.249h8.604c1.17 0 2.268-.626 2.866-1.633.246-.415.109-.952-.307-1.199-.415-.247-.952-.108-1.199.307-.283.479-.806.775-1.361.775h-8.81c-.873 0-1.583-.71-1.583-1.583s.71-1.583 1.583-1.583H28.7c.483 0 .875-.392.875-.875s-.392-.875-.875-.875h-5.888c-1.838 0-3.333 1.495-3.333 3.333 0 1.025.475 1.932 1.205 2.544-.615.605-.998 1.445-.998 2.373 0 1.028.478 1.938 1.212 2.549-.611.604-.99 1.441-.99 2.367 0 1.12.559 2.108 1.409 2.713-.524.589-.852 1.356-.852 2.204 0 1.838 1.495 3.333 3.333 3.333h5.484c1.17 0 2.269-.625 2.867-1.632.247-.415.11-.952-.305-1.199-.416-.245-.953-.11-1.199.305-.285.479-.808.776-1.363.776h-5.484c-.873 0-1.583-.71-1.583-1.583s.71-1.583 1.583-1.583h6.506c1.17 0 2.27-.626 2.867-1.633.247-.416.11-.953-.305-1.199-.419-.251-.954-.11-1.199.305-.289.487-.799.777-1.363.777h-7.063c-.873 0-1.583-.711-1.583-1.584s.71-1.583 1.583-1.583h8.091c1.17 0 2.269-.625 2.867-1.632.247-.415.11-.952-.305-1.199-.417-.246-.953-.11-1.199.305-.289.486-.799.776-1.363.776H23.02c-.873 0-1.583-.71-1.583-1.583s.709-1.584 1.583-1.584z";

function GuideHandArt({ pose }: { pose: "point" | "tap" | "up" }) {
  return (
    <svg viewBox="0 0 42 52" width="118" height="146" className="guide-hand-svg">
      <g className="gh-pose" opacity={pose === "point" || pose === "tap" ? 1 : 0}>
        <ellipse cx="21" cy="49" rx="10" ry="2.4" fill="#000" opacity="0.22" />
        <path
          d="M11 36.2 C10.4 34.6 12.2 33.4 14.6 33.4 H27.6 C31.2 33.4 32.8 35.2 32.6 37.4 C32.4 40.2 29.8 42.2 26.4 42.2 H14.2 C11.2 42.2 10.4 39.4 11 36.2Z"
          fill="#3b82f6"
          stroke={HAND_LINE}
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <path d="M14.2 38.2 H27.4" fill="none" stroke="#93c5fd" strokeWidth="1.1" strokeLinecap="round" />
        <g transform={pose === "tap" ? "translate(3.2,2.4) scale(0.96)" : "translate(3.2,0.2) scale(0.96)"}>
          <path fill={HAND_SKIN} stroke={HAND_LINE} strokeWidth="1.35" strokeLinejoin="round" d={POINT_D} />
          {pose !== "tap" && (
            <path d="M12.3 4.2 L12.3 13.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
          )}
          <ellipse cx="13.5" cy="2.6" rx="2.1" ry="1.7" fill={HAND_NAIL} />
        </g>
        {pose === "tap" ? (
          <g>
            <circle cx="16.2" cy="4.2" r="3.2" fill="none" stroke="#e8c547" strokeWidth="1.15" />
            <circle cx="16.2" cy="4.2" r="5.4" fill="none" stroke="#e8c547" strokeWidth="0.7" opacity="0.5" />
          </g>
        ) : null}
      </g>
      <g className="gh-pose" opacity={pose === "up" ? 1 : 0}>
        <ellipse cx="22" cy="49" rx="11" ry="2.4" fill="#000" opacity="0.22" />
        <path
          d="M12 37.2 C11.4 35.6 13.2 34.4 15.6 34.4 H29.4 C33 34.4 34.4 36.2 34.2 38.4 C34 41.2 31.4 43.2 27.8 43.2 H15.2 C12.2 43.2 11.4 40.4 12 37.2Z"
          fill="#3b82f6"
          stroke={HAND_LINE}
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <path d="M15.4 39.2 H29" fill="none" stroke="#93c5fd" strokeWidth="1.1" strokeLinecap="round" />
        <g transform="translate(2.2,1) scale(0.92)">
          <path fill={HAND_SKIN} stroke={HAND_LINE} strokeWidth="1.4" strokeLinejoin="round" d={THUMB_D} />
          <path fill="#edd0a8" opacity="0.95" d={THUMB_FINGERS_D} />
          <ellipse cx="12.2" cy="6.2" rx="2.4" ry="2" fill={HAND_NAIL} />
        </g>
        <path
          d="M34 6 L35.1 9.2 L38.4 9.6 L35.1 10 L34 13.2 L32.9 10 L29.6 9.6 L32.9 9.2 Z"
          fill="#e8c547"
          stroke={HAND_LINE}
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function GuideHand({
  active,
  cardId,
  target,
}: {
  active: boolean;
  cardId: string | null;
  target: Cell | null;
}) {
  const handRef = useRef<HTMLDivElement>(null);
  const [pose, setPose] = useState<"point" | "tap" | "up">("point");
  const poseRef = useRef(setPose);
  poseRef.current = setPose;

  useLayoutEffect(() => {
    const el = handRef.current;
    if (!el) return;
    if (!active || !cardId || !target || prefersReducedMotion()) {
      gsap.killTweensOf(el);
      gsap.set(el, { autoAlpha: 0 });
      poseRef.current("point");
      return;
    }
    let killed = false;
    let tl: ReturnType<typeof gsap.timeline> | null = null;
    let raf = 0;
    const fingerOffset = (kind: "point" | "up") => {
      const w = el.offsetWidth || 118;
      const h = el.offsetHeight || 146;
      if (kind === "up") return { ox: w * 0.52, oy: h * 0.1 };
      return { ox: w * 0.385, oy: h * 0.04 };
    };
    const measure = () => {
      const fromEl = document.querySelector<HTMLElement>(`[data-tray] [data-card-id="${cardId}"]`);
      const toEl = document.querySelector<HTMLElement>(`[data-r="${target.r}"][data-c="${target.c}"]`);
      if (!fromEl || !toEl) return null;
      const a = fromEl.getBoundingClientRect();
      const b = toEl.getBoundingClientRect();
      if (a.width < 2 || b.width < 2) return null;
      return {
        x1: a.left + a.width / 2,
        y1: a.top + a.height * 0.22,
        x2: b.left + b.width / 2,
        y2: b.top + b.height * 0.22,
      };
    };
    const run = () => {
      if (killed) return;
      const pts = measure();
      if (!pts) {
        raf = window.requestAnimationFrame(run);
        return;
      }
      gsap.killTweensOf(el);
      const p = fingerOffset("point");
      const u = fingerOffset("up");
      poseRef.current("point");
      gsap.set(el, { left: pts.x1 - p.ox, top: pts.y1 - p.oy, autoAlpha: 0, scale: 0.86, rotate: -8 });
      tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 0.4,
        defaults: { ease: "power2.inOut" },
        onRepeat: () => poseRef.current("point"),
      });
      tl.to(el, { autoAlpha: 1, scale: 1, duration: 0.28, ease: "back.out(1.7)" });
      tl.add(() => {
        if (!killed) poseRef.current("tap");
      });
      tl.to(el, { scale: 0.92, top: pts.y1 - p.oy + 10, duration: 0.12, ease: "power2.in" });
      tl.to(el, { scale: 1, top: pts.y1 - p.oy, duration: 0.14, ease: "power2.out" });
      tl.add(() => {
        if (!killed) poseRef.current("point");
      });
      tl.to({}, { duration: 0.16 });
      tl.to(el, { left: pts.x2 - p.ox, top: pts.y2 - p.oy, rotate: 6, duration: 0.85, ease: "power2.inOut" });
      tl.add(() => {
        if (!killed) poseRef.current("tap");
      });
      tl.to(el, { scale: 0.92, top: pts.y2 - p.oy + 10, duration: 0.12, ease: "power2.in" });
      tl.to(el, { scale: 1, top: pts.y2 - p.oy, duration: 0.14, ease: "power2.out" });
      tl.add(() => {
        if (!killed) poseRef.current("up");
      });
      tl.to(el, { left: pts.x2 - u.ox + 22, top: pts.y2 - u.oy + 8, rotate: -4, scale: 1.08, duration: 0.32, ease: "back.out(2)" });
      tl.to({}, { duration: 0.7 });
      tl.to(el, { autoAlpha: 0, scale: 0.9, duration: 0.22 });
    };
    raf = window.requestAnimationFrame(run);
    const onResize = () => {
      if (tl) tl.kill();
      gsap.killTweensOf(el);
      run();
    };
    window.addEventListener("resize", onResize);
    return () => {
      killed = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (tl) tl.kill();
      gsap.killTweensOf(el);
    };
  }, [active, cardId, target?.r, target?.c]);

  if (!active || !cardId || !target) return null;
  return (
    <div ref={handRef} className="guide-hand pointer-events-none fixed z-[46]" aria-hidden="true" style={{ left: 0, top: 0, opacity: 0 }}>
      <GuideHandArt pose={pose} />
    </div>
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
  const endlessCols = useSettings((s) => s.endlessCols);
  const endlessRows = useSettings((s) => s.endlessRows);
  const muted = useSettings((s) => s.muted);
  const setMuted = useSettings((s) => s.setMuted);
  const boardShadows = useSettings((s) => s.boardShadows);
  const shadowDistance = useSettings((s) => s.shadowDistance);
  const shadowOpacity = useSettings((s) => s.shadowOpacity);
  const placedShadow = feltDropShadow(boardShadows, shadowDistance, shadowOpacity);
  const nextCache = useRef<{
    n: number;
    difficulty: Difficulty;
    level: Level;
    cols: number;
    rows: number;
  } | null>(null);

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
  const prefetchId = useRef(0);

  const stopPrefetch = useCallback(() => {
    prefetchId.current += 1;
  }, []);

  const startPrefetch = useCallback(
    (n: number) => {
      const id = ++prefetchId.current;
      const delay = difficulty === "expert" || difficulty === "hard" ? 2200 : 800;
      const kick = () => {
        if (id !== prefetchId.current) return;
        void makeProceduralLevel(difficulty, n, undefined, {
          background: true,
          isCancelled: () => id !== prefetchId.current,
          cols: endlessCols,
          rows: endlessRows,
        })
          .then((lvl) => {
            if (id !== prefetchId.current) return;
            nextCache.current = { n, difficulty, level: lvl, cols: endlessCols, rows: endlessRows };
          })
          .catch((err: unknown) => {
            if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "GenCancelled") return;
          });
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(kick, { timeout: delay });
      } else {
        window.setTimeout(kick, delay);
      }
    },
    [difficulty, endlessCols, endlessRows],
  );

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
      const hit = !!(
        cached &&
        cached.n === n &&
        cached.difficulty === difficulty &&
        cached.cols === endlessCols &&
        cached.rows === endlessRows
      );
      setTableNo(n);
      stopPrefetch();
      if (hit && cached) {
        nextCache.current = null;
        loadingUiRef.current = false;
        setEndlessLevel(cached.level);
        setEndlessLoading(false);
        setGenProgress(null);
        startPrefetch(n + 1);
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
        const lvl = await makeProceduralLevel(
          difficulty,
          n,
          (p) => {
            if (seq !== genSeq.current) return;
            setGenProgress(p);
          },
          { isCancelled: () => seq !== genSeq.current, cols: endlessCols, rows: endlessRows },
        );
        if (seq !== genSeq.current) return;
        loadingUiRef.current = false;
        setEndlessLevel(lvl);
        setGenProgress(null);
        startPrefetch(n + 1);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "GenCancelled") return;
        throw err;
      } finally {
        if (seq === genSeq.current) {
          loadingUiRef.current = false;
          setEndlessLoading(false);
        }
      }
    },
    [difficulty, startPrefetch, stopPrefetch, endlessCols, endlessRows],
  );

  useEffect(() => {
    nextCache.current = null;
    stopPrefetch();
    if (campaign !== "endless") return;
    setEndlessLevel(null);
    const t = window.setTimeout(() => loadEndless(1), 0);
    return () => {
      window.clearTimeout(t);
      stopPrefetch();
    };
  }, [campaign, loadEndless, difficulty, stopPrefetch]);

  const built = useMemo(
    () =>
      level
        ? setupLevel(level)
        : { cards: [] as Card[], placements: {} as Placement, blocked: new Set<string>(), targets: {} as Record<string, Cell> },
    [level],
  );
  const cards = built.cards;
  const targets = built.targets;
  const cols = level ? boardCols(level) : 11;
  const rows = level ? boardRows(level) : 11;
  const [placements, setPlacements] = useState<Placement>(built.placements);
  const [history, setHistory] = useState<Placement[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverCell, setHoverCell] = useState<Cell | null>(null);
  const [hoverSwapId, setHoverSwapId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Cell | null>(null);
  const [won, setWon] = useState(false);
  const [showWinUi, setShowWinUi] = useState(false);
  const [handDismissed, setHandDismissed] = useState(false);
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
  const winTimer = useRef<number | null>(null);
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
    for (const s of neededStops(occupied, { rows, cols })) {
      const k = cellKey(s.r, s.c);
      if (targetKeys.has(k)) continue;
      set.add(k);
    }
    return set;
  }, [campaign, built.blocked, cards, scanPlacements, targetKeys, rows, cols]);

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
    resetTrayFlip();
    if (bounceTimer.current) {
      window.clearTimeout(bounceTimer.current);
      bounceTimer.current = null;
    }
    if (winTimer.current) {
      window.clearTimeout(winTimer.current);
      winTimer.current = null;
    }
    stopCelebrate([...(wrapRef.current?.querySelectorAll<HTMLElement>("[data-fly-card][data-user-placed]") ?? [])]);
    setHandDismissed(false);
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
      snapshotTrayFlip(trayEls);
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
    const found = scanBoard(cols, blocked, scanPlacements, cardsById, rows);
    if (campaign !== "howto") return found;
    const mid = Math.floor(rows / 2);
    return found.filter((h) => {
      const top = h.cells.every((p) => p.r < mid);
      const bot = h.cells.every((p) => p.r > mid);
      return !top && !bot;
    });
  }, [cols, rows, blocked, scanPlacements, cardsById, campaign]);
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
  const firstGuideCardId = useMemo(() => {
    if (!level) return null;
    const opener =
      (campaign === "howto" && level.number === 1) ||
      (campaign === "training" && level.number === 1) ||
      (campaign === "puzzle" && level.id === "bg-1");
    if (!opener) return null;
    const h = level.hand[0];
    if (!h) return null;
    const card = cards.find(
      (c) =>
        !c.fixed &&
        c.rank === h.rank &&
        c.suit === h.suit &&
        (placements[c.id] === "tray" || drag?.id === c.id),
    );
    return card?.id ?? null;
  }, [level, campaign, cards, placements, drag?.id]);

  const guideCardIds = useMemo(() => {
    if (campaign === "howto" || campaign === "training") {
      const ids = trayCards.filter((c) => targets[c.id]).map((c) => c.id);
      if (drag?.id && targets[drag.id] && !ids.includes(drag.id)) ids.push(drag.id);
      return ids;
    }
    if (campaign === "puzzle" && level?.id === "bg-1" && firstGuideCardId && targets[firstGuideCardId]) {
      return [firstGuideCardId];
    }
    return [];
  }, [campaign, trayOrderKey, targets, drag?.id, level?.id, firstGuideCardId]);

  useEffect(() => {
    if (!firstGuideCardId) return;
    if (drag?.id === firstGuideCardId || selectedCard === firstGuideCardId) {
      setHandDismissed(true);
    }
  }, [drag?.id, selectedCard, firstGuideCardId]);

  useLayoutEffect(() => {
    const els = [...(trayRef.current?.querySelectorAll("[data-fly-card]") ?? [])] as HTMLElement[];
    if (skipTrayReorg.current) {
      snapshotTrayFlip(els);
      return;
    }
    trayPrevRects.current = trayReorg(els, trayPrevRects.current);
  }, [trayOrderKey]);

  const revealWin = useCallback(() => {
    if (!pendingWin.current) return;
    pendingWin.current = false;
    const nxt = campaign === "training" && level ? nextLevel(level) : null;
    if (nxt) {
      void navigate({ to: "/play", search: { mode: nxt.campaign, id: nxt.id } });
      return;
    }
    setShowWinUi(true);
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
                },
              });
            },
          },
        );
      });
    },
    [],
  );

  const boardCardEls = () =>
    [...(wrapRef.current?.querySelectorAll<HTMLElement>("[data-fly-card][data-user-placed]") ?? [])];

  const cancelWinDelay = () => {
    if (winTimer.current) {
      window.clearTimeout(winTimer.current);
      winTimer.current = null;
    }
    stopCelebrate(boardCardEls());
  };

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
      const celebrating = campaign !== "training" || !nextLevel(level);
      if (celebrating) playWin();
      void celebrateWiggle(boardCardEls(), celebrating ? 3 : 1.2);
      if (winTimer.current) window.clearTimeout(winTimer.current);
      winTimer.current = window.setTimeout(() => {
        winTimer.current = null;
        revealWin();
      }, celebrating ? 3000 : 1200);
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
  }, [hands, trayEmpty, drag, score, level, won, cards, placements, targets, revealWin, history.length, campaign]);

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
    const boardW = cols * CELL_W + (cols - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
    const boardH = rows * CELL_H + (rows - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
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
  }, [cols, rows, level]);

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
        snapshotTrayFlip(trayEls);
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
        snapshotTrayFlip(trayEls);
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
    cancelWinDelay();
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
    cancelWinDelay();
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
  const howtoLesson = campaign === "howto" ? lessonFor(level?.name) : null;
  const dragCard = drag ? cardsById.get(drag.id) : null;
  const innerW = cols * CELL_W + (cols - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
  const innerH = rows * CELL_H + (rows - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
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
          (campaign === "howto" || campaign === "training" || (campaign === "puzzle" && level.id === "bg-1")) &&
          !won &&
          !awaitingDeal &&
          !holdPlease &&
          guideCardIds.length > 0
        }
        cardIds={guideCardIds}
        targets={targets}
        drag={drag}
        scale={scale}
      />
      <GuideHand
        active={!!firstGuideCardId && !handDismissed && !won && !awaitingDeal && !holdPlease}
        cardId={firstGuideCardId}
        target={firstGuideCardId ? targets[firstGuideCardId] ?? null : null}
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
                  gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
                  gridTemplateRows: `repeat(${rows}, ${CELL_H}px)`,
                  gap: CELL_GAP,
                  fontSize: 11,
                }}
              >
                {Array.from({ length: rows * cols }, (_, i) => {
                  const r = Math.floor(i / cols);
                  const c = i % cols;
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
                      <span
                        data-fly-stop={showStop ? "1" : undefined}
                        data-stop-key={showStop ? key : undefined}
                        data-stay-felt={stopStay(key) ? "1" : undefined}
                        className={cn(
                          "pointer-events-none absolute inset-0 grid place-items-center",
                          (!showStop || (awaitingDeal && !stopStay(key))) && "invisible",
                        )}
                      >
                        <StopSign className="h-[70%] w-[70%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
                      </span>
                      {card ? (
                        <button
                          type="button"
                          data-fly-card="1"
                          data-on-board="1"
                          data-user-placed={card.fixed ? undefined : "1"}
                          data-card-id={card.id}
                          data-flip-id={card.id}
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
                            <PooledCardFace
                              card={card}
                              dimmed={card.fixed}
                              style={cardStyle}
                              active={drag?.id !== card.id}
                            />
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
                data-flip-id={card.id}
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
                <PooledCardFace
                  card={card}
                  tray
                  style={cardStyle}
                  active={drag?.id !== card.id}
                />
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
          className="pointer-events-none fixed z-50 origin-center rotate-[4deg]"
          style={{
            left: drag.x - drag.grabX,
            top: drag.y - drag.grabY,
            width: CELL_W * scale,
            height: CELL_H * scale,
            fontSize: Math.max(8, 11 * scale),
            filter: placedShadow,
          }}
        >
          <PooledCardFace card={dragCard} tray style={cardStyle} className="bg-gold" />
        </div>
      ) : null}

      {showWinUi ? (
        <div ref={winOverlayRef} className="glass-scrim fixed inset-0 z-40 grid place-items-center p-4">
          <div ref={winBoxRef} className="glass w-full max-w-sm rounded-[28px] p-6 text-center">
            {howtoLesson ? (
              <HowToLesson lesson={howtoLesson} />
            ) : (
              <>
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-ok/20 text-ok">
                  <Check className="size-6" />
                </div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  {campaign === "free" ? "Round complete" : "Table complete"}
                </h2>
                <p className="mt-2 text-sm text-fg-muted">Score {score}</p>
              </>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {campaign === "endless" || nxt ? (
                <Button onClick={goNext}>
                  {campaign === "howto" ? "Next Card Combination" : "Next table"}
                </Button>
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

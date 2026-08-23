import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  Dumbbell,
  Infinity as InfinityIcon,
  Info,
  LayoutGrid,
  Pencil,
  Settings,
  Share2,
  Shuffle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { SettingsSheet } from "@/components/game/SettingsSheet";
import { ShareSheet } from "@/components/game/ShareSheet";
import { Button } from "@/components/ui/button";
import {
  playBounce,
  playClick,
  playDeal,
  playSelect,
  playWhoosh,
  unlockAudio,
} from "@/lib/game/audio";
import { fadeSlideIn, prefersReducedMotion } from "@/lib/game/juice";
import { WaitOverlay } from "@/components/game/WaitOverlay";
import { HOWTO_LEVELS, PUZZLE_LEVELS, TRAINING_LEVELS } from "@/lib/game/levels";
import { loadProgress, type Progress } from "@/lib/game/progress";
import { gameShareUrl } from "@/lib/game/share";
import { DIFFICULTY_LABEL, type Campaign, type Difficulty, type Level } from "@/lib/game/types";

const DIFFS: { id: Difficulty; blurb: string }[] = [
  { id: "beginner", blurb: "4–8 gold seats. Short interlocking hands." },
  { id: "easy", blurb: "11–15 gold seats. Friendly patterns." },
  { id: "medium", blurb: "12–17 gold seats. Mixed card combinations." },
  { id: "hard", blurb: "16–25 gold seats. Dense campaign tables." },
  { id: "expert", blurb: "22–26 gold seats. Most of the board is yours." },
];

const MASCOT_CREAM = "#fbf6e8";
const MASCOT_ANGRY_BG = "#e85a5a";
const MASCOT_FUNNY_BG = "#5cb87a";

const ANGRY_MOVES = ["startle", "rage", "stomp"] as const;
const FUNNY_MOVES = ["wink", "hop", "laugh"] as const;
type AngryMove = (typeof ANGRY_MOVES)[number];
type FunnyMove = (typeof FUNNY_MOVES)[number];
type JokerMove = AngryMove | FunnyMove;

function pickJokerMove(last: JokerMove | null): { move: JokerMove; mood: "angry" | "funny" } {
  // Angry is ~3× more likely than funny (75% / 25%).
  const mood: "angry" | "funny" = Math.random() < 0.75 ? "angry" : "funny";
  const pool = (mood === "angry" ? ANGRY_MOVES : FUNNY_MOVES).filter((m) => m !== last);
  const list = pool.length ? pool : mood === "angry" ? [...ANGRY_MOVES] : [...FUNNY_MOVES];
  const move = list[Math.floor(Math.random() * list.length)]!;
  return { move, mood };
}

function CrossCardMascot() {
  const hitRef = useRef<HTMLButtonElement>(null);
  const bgRef = useRef<SVGRectElement>(null);
  const hatRef = useRef<SVGGElement>(null);
  const browRef = useRef<SVGGElement>(null);
  const lidLRef = useRef<SVGRectElement>(null);
  const lidRRef = useRef<SVGRectElement>(null);
  const steamRef = useRef<SVGGElement>(null);
  const mouthMadRef = useRef<SVGGElement>(null);
  const mouthORef = useRef<SVGEllipseElement>(null);
  const mouthLaughRef = useRef<SVGPathElement>(null);
  const busy = useRef(false);
  const lastMove = useRef<JokerMove | null>(null);

  useEffect(() => {
    const hit = hitRef.current;
    return () => {
      if (hit) gsap.killTweensOf(hit);
    };
  }, []);

  const poke = () => {
    unlockAudio();
    if (busy.current) return;
    const hit = hitRef.current;
    if (!hit) return;

    if (prefersReducedMotion()) {
      playClick();
      gsap.fromTo(hit, { scale: 0.96 }, { scale: 1, duration: 0.18, ease: "power2.out" });
      return;
    }

    const { move, mood } = pickJokerMove(lastMove.current);
    lastMove.current = move;
    busy.current = true;
    hit.classList.add("is-reacting");

    const hat = hatRef.current;
    const brow = browRef.current;
    const lidL = lidLRef.current;
    const lidR = lidRRef.current;
    const steam = steamRef.current;
    const mouthMad = mouthMadRef.current;
    const mouthO = mouthORef.current;
    const mouthLaugh = mouthLaughRef.current;
    const bg = bgRef.current;
    const tint = mood === "angry" ? MASCOT_ANGRY_BG : MASCOT_FUNNY_BG;

    gsap.set(hit, { transformOrigin: "50% 88%" });
    if (hat) gsap.set(hat, { transformOrigin: "40px 24px" });
    if (brow) gsap.set(brow, { transformOrigin: "40px 42px" });
    if (lidL) gsap.set(lidL, { transformOrigin: "50% 0%" });
    if (lidR) gsap.set(lidR, { transformOrigin: "50% 0%" });
    if (steam) gsap.set(steam, { transformOrigin: "40px 8px" });

    const done = () => {
      gsap.set(
        [hit, hat, brow, lidL, lidR, steam, mouthMad, mouthO, mouthLaugh].filter(Boolean),
        { clearProps: "transform,x,y,rotation,rotationY,scale,scaleX,scaleY,opacity" },
      );
      gsap.set(bg, { fill: MASCOT_CREAM });
      hit.classList.remove("is-reacting");
      busy.current = false;
    };

    const tl = gsap.timeline({ onComplete: done });
    if (bg) {
      tl.fromTo(bg, { fill: MASCOT_CREAM }, { fill: tint, duration: 0.18, ease: "power2.out" }, 0);
      tl.to(bg, { fill: MASCOT_CREAM, duration: 0.35, ease: "power1.in" }, 0.55);
    }

    if (move === "startle") {
      playBounce();
      tl.to(hit, { y: -14, rotate: 7, duration: 0.12, ease: "power2.out" }, 0);
      tl.to(hit, { x: -7, duration: 0.05 }, 0.12);
      tl.to(hit, { x: 7, duration: 0.05 });
      tl.to(hit, { x: -4, duration: 0.05 });
      tl.to(hit, { x: 0, y: 0, rotate: 0, duration: 0.32, ease: "back.out(2.4)" });
      if (brow) tl.to(brow, { y: 5, duration: 0.1 }, 0);
      if (lidL && lidR) {
        tl.to([lidL, lidR], { scaleY: 1, duration: 0.08 }, 0);
        tl.to([lidL, lidR], { scaleY: 0, duration: 0.14 }, 0.2);
      }
      if (mouthMad && mouthO) {
        tl.to(mouthMad, { opacity: 0, duration: 0.08 }, 0);
        tl.to(mouthO, { opacity: 1, duration: 0.08 }, 0);
        tl.to(mouthO, { opacity: 0, duration: 0.16 }, 0.55);
        tl.to(mouthMad, { opacity: 1, duration: 0.16 }, 0.55);
      }
      if (steam) {
        tl.fromTo(steam, { opacity: 0, y: 6 }, { opacity: 1, y: -6, duration: 0.18 }, 0.04);
        tl.to(steam, { opacity: 0, y: -16, duration: 0.34 }, 0.28);
      }
      if (hat) tl.to(hat, { rotate: 12, duration: 0.14 }, 0);
      if (hat) tl.to(hat, { rotate: 0, duration: 0.3, ease: "elastic.out(1, 0.5)" }, 0.2);
    } else if (move === "stomp") {
      playBounce();
      tl.to(hit, { y: 8, scaleY: 0.88, scaleX: 1.08, duration: 0.1, ease: "power2.in" }, 0);
      tl.to(hit, { y: -16, scaleY: 1.08, scaleX: 0.94, duration: 0.18, ease: "power2.out" });
      tl.to(hit, { y: 0, scaleY: 1, scaleX: 1, duration: 0.28, ease: "bounce.out" });
      if (brow) tl.to(brow, { y: 4, duration: 0.1 }, 0);
      if (brow) tl.to(brow, { y: 0, duration: 0.25 }, 0.4);
      if (steam) {
        tl.fromTo(steam, { opacity: 0, y: 4 }, { opacity: 1, y: -8, duration: 0.2 }, 0.12);
        tl.to(steam, { opacity: 0, y: -18, duration: 0.3 }, 0.35);
      }
      if (hat) {
        tl.to(hat, { rotate: -10, duration: 0.12 }, 0);
        tl.to(hat, { rotate: 8, duration: 0.16 }, 0.12);
        tl.to(hat, { rotate: 0, duration: 0.28, ease: "back.out(2)" }, 0.28);
      }
    } else if (move === "rage") {
      playClick();
      playBounce();
      tl.to(hit, { x: -6, rotate: -8, duration: 0.05 }, 0);
      tl.to(hit, { x: 6, rotate: 8, duration: 0.05 });
      tl.to(hit, { x: -5, rotate: -6, duration: 0.05 });
      tl.to(hit, { x: 5, rotate: 6, duration: 0.05 });
      tl.to(hit, { x: -3, rotate: -3, duration: 0.05 });
      tl.to(hit, { x: 0, rotate: 0, duration: 0.22, ease: "back.out(3)" });
      if (brow) tl.to(brow, { y: 6, scaleY: 1.15, duration: 0.08 }, 0);
      if (brow) tl.to(brow, { y: 0, scaleY: 1, duration: 0.28, ease: "power2.out" }, 0.35);
      if (steam) {
        tl.fromTo(steam, { opacity: 0, y: 4, scale: 0.7 }, { opacity: 1, y: -10, scale: 1.15, duration: 0.22 }, 0);
        tl.to(steam, { opacity: 0, y: -22, duration: 0.38 }, 0.28);
      }
      if (hat) tl.to(hat, { rotate: -14, y: -3, duration: 0.1 }, 0);
      if (hat) tl.to(hat, { rotate: 0, y: 0, duration: 0.32, ease: "elastic.out(1, 0.45)" }, 0.28);
    } else if (move === "wink") {
      playSelect();
      tl.to(hit, { rotate: 8, y: -4, duration: 0.16, ease: "power2.out" }, 0);
      tl.to(hit, { rotate: 0, y: 0, duration: 0.36, ease: "back.out(2)" }, 0.42);
      if (lidL) tl.to(lidL, { scaleY: 1, duration: 0.1 }, 0);
      if (lidL) tl.to(lidL, { scaleY: 0, duration: 0.16 }, 0.42);
      if (hat) tl.to(hat, { rotate: 16, duration: 0.18 }, 0);
      if (hat) tl.to(hat, { rotate: 0, duration: 0.34, ease: "elastic.out(1, 0.5)" }, 0.42);
    } else if (move === "laugh") {
      playWhoosh();
      playSelect();
      tl.to(hit, { rotate: -6, duration: 0.08 }, 0);
      tl.to(hit, { rotate: 6, duration: 0.08 });
      tl.to(hit, { rotate: -5, duration: 0.08 });
      tl.to(hit, { rotate: 5, duration: 0.08 });
      tl.to(hit, { rotate: -3, duration: 0.08 });
      tl.to(hit, { rotate: 0, duration: 0.2, ease: "back.out(2)" });
      if (mouthMad && mouthLaugh) {
        tl.to(mouthMad, { opacity: 0, duration: 0.08 }, 0);
        tl.to(mouthLaugh, { opacity: 1, duration: 0.08 }, 0);
        tl.to(mouthLaugh, { opacity: 0, duration: 0.18 }, 0.55);
        tl.to(mouthMad, { opacity: 1, duration: 0.18 }, 0.55);
      }
      if (lidL && lidR) {
        tl.to([lidL, lidR], { scaleY: 0.55, duration: 0.1 }, 0);
        tl.to([lidL, lidR], { scaleY: 0, duration: 0.18 }, 0.5);
      }
      if (hat) {
        tl.to(hat, { rotate: 14, y: -2, duration: 0.15 }, 0);
        tl.to(hat, { rotate: -10, duration: 0.2 }, 0.15);
        tl.to(hat, { rotate: 0, y: 0, duration: 0.28, ease: "elastic.out(1, 0.5)" }, 0.4);
      }
    } else {
      playDeal();
      tl.to(hit, { y: -22, scaleY: 1.06, scaleX: 0.94, duration: 0.18, ease: "power2.out" }, 0);
      tl.to(hit, { y: 0, scaleY: 0.92, scaleX: 1.08, duration: 0.16, ease: "power2.in" });
      tl.to(hit, { scaleY: 1, scaleX: 1, duration: 0.28, ease: "elastic.out(1, 0.45)" });
      if (hat) tl.to(hat, { y: -8, rotate: 10, duration: 0.18 }, 0);
      if (hat) tl.to(hat, { y: 2, rotate: -6, duration: 0.16 }, 0.18);
      if (hat) tl.to(hat, { y: 0, rotate: 0, duration: 0.28, ease: "back.out(2)" }, 0.34);
      if (lidL && lidR) {
        tl.to([lidL, lidR], { scaleY: 1, duration: 0.08 }, 0.16);
        tl.to([lidL, lidR], { scaleY: 0, duration: 0.12 }, 0.28);
      }
    }
  };

  return (
    <button
      ref={hitRef}
      type="button"
      className="cross-mascot-hit"
      aria-label="Poke the joker"
      onClick={poke}
    >
      <svg className="cross-mascot" viewBox="0 -8 80 128" role="img">
        <title>An angry joker card</title>
        <defs>
          <clipPath id="mascot-clip">
            <rect x="6" y="14" width="68" height="98" rx="8" />
          </clipPath>
        </defs>
        <g className="cross-mascot-bob">
          <rect ref={bgRef} x="6" y="14" width="68" height="98" rx="8" fill={MASCOT_CREAM} />
          <g clipPath="url(#mascot-clip)">
            <path d="M6 78 H74 V104 C74 108.4 70.4 112 66 112 H14 C9.6 112 6 108.4 6 104 Z" fill="#1a1712" />
            <path d="M6 78 H74 V86 H6 Z" fill="#b4232c" />
          </g>
          <rect x="6" y="14" width="68" height="98" rx="8" fill="none" stroke="#2a2118" strokeWidth="3" />

          <text x="12" y="28" fill="#b4232c" fontFamily="Fraunces, Times New Roman, serif" fontSize="11" fontWeight="700">
            J
          </text>
          <text
            x="68"
            y="104"
            fill="#e8c547"
            fontFamily="Fraunces, Times New Roman, serif"
            fontSize="11"
            fontWeight="700"
            textAnchor="end"
          >
            J
          </text>

          <g ref={steamRef} className="cross-mascot-steam" opacity={0}>
            <ellipse cx="22" cy="6" rx="3.2" ry="4.2" fill="#efe7d6" />
            <ellipse cx="34" cy="-2" rx="3.8" ry="5" fill="#efe7d6" />
            <ellipse cx="48" cy="4" rx="3" ry="4" fill="#efe7d6" />
          </g>

          <g ref={hatRef} className="cross-mascot-hat">
            <path d="M18 28 L8 4 L28 22 Z" fill="#b4232c" stroke="#2a2118" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M40 16 L40 -2 L52 22 Z" fill="#e8c547" stroke="#2a2118" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M62 28 L72 5 L50 22 Z" fill="#1a1712" stroke="#e8c547" strokeWidth="1.4" strokeLinejoin="round" />
            <circle className="cross-mascot-bell" cx="8" cy="4" r="3.2" fill="#e8c547" stroke="#2a2118" strokeWidth="1" />
            <circle className="cross-mascot-bell" cx="40" cy="-2" r="3.2" fill="#b4232c" stroke="#2a2118" strokeWidth="1" />
            <circle className="cross-mascot-bell" cx="72" cy="5" r="3.2" fill="#e8c547" stroke="#2a2118" strokeWidth="1" />
          </g>

          <ellipse cx="40" cy="52" rx="22" ry="20" fill="#f3d7b0" stroke="#2a2118" strokeWidth="1.3" />
          <path d="M24 44 Q28 38 34 40" fill="none" stroke="#e7b48a" strokeWidth="2" strokeLinecap="round" />

          <g ref={browRef} className="cross-mascot-brow">
            <path d="M24 42 L36 48" stroke="#1a1712" strokeWidth="3.6" strokeLinecap="round" />
            <path d="M56 42 L44 48" stroke="#1a1712" strokeWidth="3.6" strokeLinecap="round" />
          </g>
          <g className="cross-mascot-eyes">
            <ellipse cx="31" cy="54" rx="6.2" ry="6.8" fill="#1a1712" />
            <ellipse cx="49" cy="54" rx="6.2" ry="6.8" fill="#1a1712" />
            <circle cx="32.8" cy="52.4" r="1.7" fill="#fbf6e8" />
            <circle cx="50.8" cy="52.4" r="1.7" fill="#fbf6e8" />
            <rect ref={lidLRef} className="cross-mascot-lid" x="24.5" y="46.5" width="13" height="15" rx="6" fill="#f3d7b0" />
            <rect ref={lidRRef} className="cross-mascot-lid" x="42.5" y="46.5" width="13" height="15" rx="6" fill="#f3d7b0" />
          </g>
          <g ref={mouthMadRef}>
            <path d="M32 66 L36 63 L40 66 L44 63 L48 66" fill="none" stroke="#1a1712" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M33 68 Q40 72 47 68" fill="none" stroke="#1a1712" strokeWidth="2.6" strokeLinecap="round" />
          </g>
          <ellipse ref={mouthORef} cx="40" cy="67" rx="4.2" ry="4.8" fill="#1a1712" opacity={0} />
          <path
            ref={mouthLaughRef}
            d="M30 64 Q40 76 50 64"
            fill="none"
            stroke="#1a1712"
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity={0}
          />

          <path d="M18 70 Q24 64 32 70 Q40 64 48 70 Q56 64 62 70 Q56 76 48 72 Q40 78 32 72 Q24 76 18 70Z" fill="#b4232c" stroke="#2a2118" strokeWidth="1.2" />
          <path d="M24 70 Q32 66 40 70 Q48 66 56 70" fill="none" stroke="#e8c547" strokeWidth="1.4" />
        </g>
      </svg>
    </button>
  );
}

export function TitleScreen() {
  const navigate = useNavigate();
  const [list, setList] = useState<Campaign | null>(null);
  const [endlessPick, setEndlessPick] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, [list, endlessPick]);

  useEffect(() => {
    fadeSlideIn(panelRef.current);
  }, [list, endlessPick]);

  const levels: Level[] =
    list === "howto"
      ? HOWTO_LEVELS
      : list === "training"
        ? TRAINING_LEVELS
        : list === "puzzle"
          ? PUZZLE_LEVELS
          : [];

  const groups = levels.reduce<{ name: string; items: Level[] }[]>((acc, lv) => {
    const name = lv.group ?? "";
    const last = acc[acc.length - 1];
    if (last && last.name === name) last.items.push(lv);
    else acc.push({ name, items: [lv] });
    return acc;
  }, []);

  return (
    <div className="felt-bg relative flex h-dvh flex-col overflow-hidden">
      <div className="felt-noise absolute inset-0" />
      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-lg flex-col px-5 pt-[max(0.6rem,env(safe-area-inset-top))] pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="absolute right-3 top-[max(0.35rem,env(safe-area-inset-top))] z-20 inline-flex size-11 items-center justify-center rounded-xl text-fg-muted transition-transform duration-150 ease-out hover:bg-fg/5 hover:text-fg active:scale-[0.96]"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-5" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 pr-12">
            <div className="min-w-0">
              <p className="text-[11px] uppercase leading-none tracking-[0.22em] text-fg-subtle">
                Deal Me In
              </p>
              <h1 className="mt-1 font-display font-semibold leading-[0.9] tracking-tight text-[clamp(1.7rem,7.2dvh,3.25rem)]">
                Cross
                <br />
                Cards
              </h1>
            </div>
            <CrossCardMascot />
          </div>
          <p className="mt-2 max-w-sm text-sm leading-snug text-fg-muted [@media(max-height:680px)]:line-clamp-2 [@media(min-height:820px)]:mt-3 [@media(min-height:820px)]:text-base [@media(min-height:820px)]:leading-relaxed">
            An 11×11 crossword of card combinations. Fixed cards stay put; yellow cards in
            your hand fill the empty seats. Rows and columns score as hands.
          </p>

          {!list && !endlessPick ? (
            <div ref={panelRef} className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pb-1">
              <Button
                size="lg"
                className="h-auto min-h-12 shrink-0 flex-col gap-0.5 py-2.5 sm:min-h-14"
                variant="secondary"
                onPointerDown={() => setList("howto")}
              >
                <span className="inline-flex items-center gap-2">
                  <Info className="size-4" />
                  How to play
                </span>
                <span className="text-[11px] font-normal leading-snug text-fg-muted">
                  Learn the combinations — pair, three of a kind, full house, and more.
                </span>
              </Button>
              <Button
                size="lg"
                className="h-auto min-h-12 shrink-0 flex-col gap-0.5 py-2.5 sm:min-h-14"
                variant="secondary"
                onPointerDown={() => setList("training")}
              >
                <span className="inline-flex items-center gap-2">
                  <Dumbbell className="size-4" />
                  Training
                </span>
                <span className="text-[11px] font-normal leading-snug text-fg-muted">
                  Play a full game, one step at a time.
                </span>
              </Button>
              <Button
                size="lg"
                className="cta-pulse h-16 shrink-0 text-lg sm:h-[4.5rem] sm:text-xl"
                onPointerDown={() => setList("puzzle")}
              >
                <LayoutGrid className="size-6" />
                Play Game
              </Button>
              <Button
                size="lg"
                className="h-auto min-h-12 shrink-0 flex-col gap-0.5 py-2.5 sm:min-h-14"
                variant="secondary"
                onPointerDown={() => {
                  setEndlessPick(true);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <InfinityIcon className="size-4" />
                  Play Endless
                </span>
                <span className="text-[11px] font-normal leading-snug text-fg-muted">
                  Fresh puzzles, generated at random as you play.
                </span>
              </Button>
              <Button
                size="lg"
                className="h-auto min-h-12 shrink-0 flex-col gap-0.5 py-2.5 sm:min-h-14"
                variant="secondary"
                onPointerDown={() => {
                  setWaiting(true);
                  void navigate({
                    to: "/play",
                    search: { mode: "free", id: `d${Date.now()}` },
                  });
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Shuffle className="size-4" />
                  Play Free Placement
                </span>
                <span className="text-[11px] font-normal leading-snug text-fg-muted">
                  An empty board — place every card so they all score.
                </span>
              </Button>
              <Button
                size="lg"
                className="h-auto min-h-12 shrink-0 flex-col gap-0.5 py-2.5 sm:min-h-14"
                variant="secondary"
                onPointerDown={() => {
                  setWaiting(true);
                  void navigate({ to: "/editor" });
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Pencil className="size-4" />
                  Make Your Own Puzzle
                </span>
                <span className="text-[11px] font-normal leading-snug text-fg-muted">
                  Build a table, then share it with anyone.
                </span>
              </Button>
              <Button
                size="lg"
                className="h-auto min-h-12 shrink-0 flex-col gap-0.5 py-2.5 sm:min-h-14"
                variant="ghost"
                onPointerDown={() => setShareOpen(true)}
              >
                <span className="inline-flex items-center gap-2">
                  <Share2 className="size-4" />
                  Share CrossCards
                </span>
                <span className="text-[11px] font-normal leading-snug text-fg-muted">
                  Send it to friends and colleagues — QR or a link, they deal in from there.
                </span>
              </Button>
            </div>
          ) : endlessPick ? (
            <div ref={panelRef} className="mt-3 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  How hard?
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setEndlessPick(false)}>
                  Close
                </Button>
              </div>
              <p className="mb-3 shrink-0 text-sm text-fg-muted">
                Continuous tables, generated as you go. Pick a difficulty.
              </p>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
                {DIFFS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      void navigate({
                        to: "/play",
                        search: { mode: "endless", diff: d.id },
                      });
                    }}
                    className="glass-chip flex min-h-12 shrink-0 items-center justify-between rounded-2xl px-4 py-2.5 text-left transition-transform duration-150 ease-out hover:bg-cream/10 active:scale-[0.96]"
                  >
                    <span>
                      <span className="block font-medium">{DIFFICULTY_LABEL[d.id]}</span>
                      <span className="text-xs text-fg-muted">{d.blurb}</span>
                    </span>
                    <span className="text-xs text-fg-subtle">Play</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div ref={panelRef} className="mt-3 flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  {list === "howto"
                    ? "Lessons"
                    : list === "training"
                      ? "Training"
                      : "Puzzles"}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setList(null)}>
                  Close
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {list === "puzzle" ? (
                  <PuzzleAccordion groups={groups} progress={progress} onGo={() => setWaiting(true)} />
                ) : (
                  groups.map((g) => (
                    <div key={g.name || "all"}>
                      {g.name ? (
                        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
                          {g.name}
                        </p>
                      ) : null}
                      <ul className="grid grid-cols-1 gap-2">
                        {g.items.map((lv) => (
                          <LevelRow key={lv.id} level={lv} progress={progress} onGo={() => setWaiting(true)} />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="mt-3 shrink-0 space-y-1 text-xs leading-snug text-fg-subtle">
          <p className="[@media(max-height:700px)]:hidden">
            Gold slots mark where a hand card belongs. A whole touching run of
            2–5 cards scores as one card combination — a stray neighbour can break it.
          </p>
          {progress.freeBest > 0 ? (
            <p className="text-fg-muted">Best free play {progress.freeBest}</p>
          ) : null}
          {progress.endlessBest > 0 ? (
            <p className="text-fg-muted">Best endless table {progress.endlessBest}</p>
          ) : null}
        </footer>
      </div>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WaitOverlay show={waiting} />
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={gameShareUrl()}
        title="Share CrossCards"
        blurb="Send the lobby link. Friends can deal in from the QR or URL."
      />
    </div>
  );
}

function LevelRow({
  level,
  progress,
  onGo,
}: {
  level: Level;
  progress: Progress;
  onGo?: () => void;
}) {
  const navigate = useNavigate();
  const done = progress.completed[level.id] != null;
  return (
    <li>
      <button
        type="button"
        onPointerDown={() => {
          onGo?.();
          void navigate({ to: "/play", search: { mode: level.campaign, id: level.id } });
        }}
        className="glass-chip flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-transform duration-150 ease-out hover:bg-cream/10 active:scale-[0.96]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={`grid size-5 shrink-0 place-items-center rounded-full ${
              done ? "bg-ok/20 text-ok" : "border border-border text-transparent"
            }`}
            aria-hidden
          >
            <Check className="size-3" />
          </span>
          <span className="truncate font-medium">{level.name}</span>
        </span>
        <span className="ml-3 shrink-0 text-xs tabular-nums text-fg-subtle">
          {done ? `${progress.completed[level.id]} pts` : "Play"}
        </span>
      </button>
    </li>
  );
}

function PuzzleAccordion({
  groups,
  progress,
  onGo,
}: {
  groups: { name: string; items: Level[] }[];
  progress: Progress;
  onGo?: () => void;
}) {
  const [open, setOpen] = useState("");

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const doneCount = g.items.filter((lv) => progress.completed[lv.id] != null).length;
        const allDone = doneCount === g.items.length;
        const isOpen = open === g.name;
        return (
          <div
            key={g.name || "all"}
            className="overflow-hidden rounded-2xl bg-cream/12 ring-1 ring-cream/30"
          >
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-cream"
              onClick={() => setOpen(isOpen ? "" : g.name)}
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`grid size-5 place-items-center rounded-full ${
                    allDone ? "bg-ok/20 text-ok" : "border border-cream/35 text-transparent"
                  }`}
                >
                  {allDone ? <Check className="size-3" /> : null}
                </span>
                <span className="font-display font-semibold tracking-tight">{g.name || "Puzzles"}</span>
              </span>
              <span className="flex items-center gap-2 text-xs tabular-nums text-cream/70">
                {doneCount}/{g.items.length}
                <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {isOpen ? (
              <ul className="space-y-2 border-t border-border px-2 py-2">
                {g.items.map((lv) => (
                  <LevelRow key={lv.id} level={lv} progress={progress} onGo={onGo} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

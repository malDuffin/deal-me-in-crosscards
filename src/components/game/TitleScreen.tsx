import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Check,
  ChevronDown,
  Dumbbell,
  Infinity as InfinityIcon,
  LayoutGrid,
  Pencil,
  Settings2,
  Share2,
  Shuffle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SettingsSheet } from "@/components/game/SettingsSheet";
import { ShareSheet } from "@/components/game/ShareSheet";
import { Button } from "@/components/ui/button";
import { fadeSlideIn } from "@/lib/game/juice";
import { HOWTO_LEVELS, PUZZLE_LEVELS, TRAINING_LEVELS } from "@/lib/game/levels";
import { loadProgress, type Progress } from "@/lib/game/progress";
import { gameShareUrl } from "@/lib/game/share";
import { DIFFICULTY_LABEL, type Campaign, type Difficulty, type Level } from "@/lib/game/types";

const DIFFS: { id: Difficulty; blurb: string }[] = [
  { id: "beginner", blurb: "Tiny crossword. Just a couple of hands." },
  { id: "easy", blurb: "A few gold seats. Friendly patterns." },
  { id: "medium", blurb: "Mixed hands and more to place." },
  { id: "hard", blurb: "A crowded crossword of poker." },
  { id: "expert", blurb: "Packed table. Tight seats." },
];

export function TitleScreen() {
  const navigate = useNavigate();
  const [list, setList] = useState<Campaign | null>(null);
  const [endlessPick, setEndlessPick] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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
    <div className="felt-bg relative min-h-dvh">
      <div className="felt-noise absolute inset-0" />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-10 pt-5">
        <header className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.22em] text-fg-subtle">Deal Me In</p>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-xl text-fg-muted transition-transform duration-150 ease-out hover:bg-fg/5 hover:text-fg active:scale-[0.96]"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-5" />
          </button>
        </header>

        <div className="flex flex-1 flex-col justify-center py-8">
          <h1 className="font-display text-3xl font-semibold leading-[0.95] tracking-tight sm:text-[3.4rem]">
            Cross
            <br />
            Cards
          </h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-fg-muted">
            An 11×11 crossword of poker. Fixed cards stay put; yellow cards in
            your hand fill the empty seats. Rows and columns score as hands.
          </p>

          {!list && !endlessPick ? (
            <div ref={panelRef} className="mt-8 flex flex-col gap-3">
              <Button size="lg" onPointerDown={() => setList("howto")}>
                <BookOpen className="size-4" />
                How to play
              </Button>
              <Button size="lg" variant="secondary" onPointerDown={() => setList("training")}>
                <Dumbbell className="size-4" />
                Training
              </Button>
              <Button size="lg" variant="secondary" onPointerDown={() => setList("puzzle")}>
                <LayoutGrid className="size-4" />
                Puzzles
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onPointerDown={() => {
                  setEndlessPick(true);
                }}
              >
                <InfinityIcon className="size-4" />
                Endless tables
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onPointerDown={() =>
                  void navigate({
                    to: "/play",
                    search: { mode: "free", id: `d${Date.now()}` },
                  })
                }
              >
                <Shuffle className="size-4" />
                Free play
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onPointerDown={() => void navigate({ to: "/editor" })}
              >
                <Pencil className="size-4" />
                Table editor
              </Button>
              <Button size="lg" variant="ghost" onPointerDown={() => setShareOpen(true)}>
                <Share2 className="size-4" />
                Share CrossCards
              </Button>
            </div>
          ) : endlessPick ? (
            <div ref={panelRef} className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold tracking-tight">
                  How hard?
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setEndlessPick(false)}>
                  Close
                </Button>
              </div>
              <p className="mb-4 text-sm text-fg-muted">
                Continuous tables, generated as you go. Pick a difficulty.
              </p>
              <div className="flex flex-col gap-2">
                {DIFFS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/play",
                        search: { mode: "endless", diff: d.id },
                      })
                    }
                    className="glass-chip flex min-h-14 items-center justify-between rounded-2xl px-4 py-3 text-left transition-transform duration-150 ease-out hover:bg-cream/10 active:scale-[0.96]"
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
            <div ref={panelRef} className="mt-6 min-h-0">
              <div className="mb-3 flex items-center justify-between">
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
              <div className="max-h-[min(58vh,520px)] space-y-2 overflow-y-auto pr-1">
                {list === "puzzle" ? (
                  <PuzzleAccordion groups={groups} progress={progress} />
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
                          <LevelRow key={lv.id} level={lv} progress={progress} />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="min-h-[4.5rem] space-y-2 text-sm leading-relaxed text-fg-subtle">
          <p>
            Gold slots mark where a hand card belongs. A whole touching run of
            2–5 cards scores as one poker hand — a stray neighbour can break it.
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

function LevelRow({ level, progress }: { level: Level; progress: Progress }) {
  const done = progress.completed[level.id] != null;
  return (
    <li>
      <Link
        to="/play"
        search={{ mode: level.campaign, id: level.id }}
        className="glass-chip flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-transform duration-150 ease-out hover:bg-cream/10 active:scale-[0.96]"
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
      </Link>
    </li>
  );
}

function PuzzleAccordion({
  groups,
  progress,
}: {
  groups: { name: string; items: Level[] }[];
  progress: Progress;
}) {
  const firstOpen = useMemo(() => {
    const next = groups.find((g) => g.items.some((lv) => progress.completed[lv.id] == null));
    return next?.name ?? groups[0]?.name ?? "";
  }, [groups, progress]);
  const [open, setOpen] = useState(firstOpen);
  useEffect(() => {
    setOpen(firstOpen);
  }, [firstOpen]);

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const doneCount = g.items.filter((lv) => progress.completed[lv.id] != null).length;
        const allDone = doneCount === g.items.length;
        const isOpen = open === g.name;
        return (
          <div key={g.name || "all"} className="glass-chip overflow-hidden rounded-2xl">
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setOpen(isOpen ? "" : g.name)}
              aria-expanded={isOpen}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`grid size-5 place-items-center rounded-full ${
                    allDone ? "bg-ok/20 text-ok" : "border border-border text-fg-subtle"
                  }`}
                >
                  {allDone ? <Check className="size-3" /> : null}
                </span>
                <span className="font-medium">{g.name || "Puzzles"}</span>
              </span>
              <span className="flex items-center gap-2 text-xs tabular-nums text-fg-subtle">
                {doneCount}/{g.items.length}
                <ChevronDown className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {isOpen ? (
              <ul className="space-y-2 border-t border-border px-2 py-2">
                {g.items.map((lv) => (
                  <LevelRow key={lv.id} level={lv} progress={progress} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

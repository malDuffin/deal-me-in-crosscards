import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Dumbbell, Infinity as InfinityIcon, LayoutGrid, Settings2, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SettingsSheet } from "@/components/game/SettingsSheet";
import { Button } from "@/components/ui/button";
import { unlockAudio } from "@/lib/game/audio";
import { fadeSlideIn } from "@/lib/game/juice";
import { HOWTO_LEVELS, PUZZLE_LEVELS, TRAINING_LEVELS } from "@/lib/game/levels";
import { loadProgress, type Progress } from "@/lib/game/progress";
import { DIFFICULTY_LABEL, type Campaign, type Difficulty, type Level } from "@/lib/game/types";

// layout: settings-only header, beginner endless tier

// endless difficulty list includes beginner

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
  const [progress, setProgress] = useState<Progress>({
    completed: {},
    freeBest: 0,
    endlessBest: 0,
  });
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
              <Button size="lg" onClick={() => setList("howto")}>
                <BookOpen className="size-4" />
                How to play
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setList("training")}>
                <Dumbbell className="size-4" />
                Training
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setList("puzzle")}>
                <LayoutGrid className="size-4" />
                Puzzles
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  unlockAudio();
                  setEndlessPick(true);
                }}
              >
                <InfinityIcon className="size-4" />
                Endless tables
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() =>
                  void navigate({
                    to: "/play",
                    search: { mode: "free", id: `d${Date.now()}` },
                  })
                }
              >
                <Shuffle className="size-4" />
                Free play
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
                    className="flex min-h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-transform duration-150 ease-out hover:bg-surface-2 active:scale-[0.96]"
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
              <div className="max-h-[min(58vh,520px)] space-y-4 overflow-y-auto pr-1">
                {groups.map((g) => (
                  <div key={g.name || "all"}>
                    {g.name && list === "puzzle" ? (
                      <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
                        {g.name}
                      </p>
                    ) : null}
                    <ul className="grid grid-cols-1 gap-2">
                      {g.items.map((lv) => {
                        const done = progress.completed[lv.id] != null;
                        return (
                          <li key={lv.id}>
                            <Link
                              to="/play"
                              search={{ mode: lv.campaign, id: lv.id }}
                              className="flex min-h-12 items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 transition-transform duration-150 ease-out hover:bg-surface-2 active:scale-[0.96]"
                            >
                              <span className="truncate font-medium">{lv.name}</span>
                              <span className="ml-3 shrink-0 text-xs tabular-nums text-fg-subtle">
                                {done ? `${progress.completed[lv.id]} pts` : "Play"}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="space-y-2 text-sm leading-relaxed text-fg-subtle">
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
    </div>
  );
}

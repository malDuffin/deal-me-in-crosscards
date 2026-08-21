import type { Campaign } from "./types";

const KEY = "crosscards-progress-v1";

export type Progress = {
  completed: Record<string, number>;
  freeBest: number;
  endlessBest: number;
};

function empty(): Progress {
  return { completed: {}, freeBest: 0, endlessBest: 0 };
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Progress;
    return {
      completed: parsed.completed ?? {},
      freeBest: parsed.freeBest ?? 0,
      endlessBest: parsed.endlessBest ?? 0,
    };
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function recordScore(levelId: string, campaign: Campaign, score: number): Progress {
  const p = loadProgress();
  if (campaign === "free") {
    p.freeBest = Math.max(p.freeBest, score);
  } else if (campaign === "endless") {
    p.endlessBest = Math.max(p.endlessBest, score);
  } else {
    p.completed[levelId] = Math.max(p.completed[levelId] ?? 0, score);
  }
  saveProgress(p);
  return p;
}

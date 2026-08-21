import { createFileRoute } from "@tanstack/react-router";
import { PlaySession } from "@/components/game/PlaySession";
import type { Campaign, Difficulty } from "@/lib/game/types";

type PlaySearch = {
  mode: Campaign;
  id?: string;
  diff?: Difficulty;
};

const MODES: Campaign[] = ["puzzle", "free", "howto", "training", "endless"];
const DIFFS: Difficulty[] = ["easy", "medium", "hard", "expert"];

function parseSearch(raw: Record<string, unknown>): PlaySearch {
  const mode = MODES.includes(raw.mode as Campaign) ? (raw.mode as Campaign) : "howto";
  const id = typeof raw.id === "string" ? raw.id : undefined;
  const diff = DIFFS.includes(raw.diff as Difficulty) ? (raw.diff as Difficulty) : "easy";
  return { mode, id, diff };
}

export const Route = createFileRoute("/play")({
  validateSearch: parseSearch,
  component: PlayPage,
});

function PlayPage() {
  const { mode, id, diff } = Route.useSearch();
  return <PlaySession campaign={mode} levelId={id} difficulty={diff} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { LevelEditor } from "@/components/game/LevelEditor";

export const Route = createFileRoute("/editor")({
  ssr: false,
  component: LevelEditor,
});

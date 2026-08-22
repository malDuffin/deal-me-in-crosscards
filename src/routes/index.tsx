import { createFileRoute } from "@tanstack/react-router";
import { TitleScreen } from "@/components/game/TitleScreen";

export const Route = createFileRoute("/")({
  ssr: false,
  component: TitleScreen,
});

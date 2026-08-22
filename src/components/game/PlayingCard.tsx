import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  CARD_CREAM,
  CARD_GOLD,
  COLORBLIND_SUIT,
  CREAM_SUIT,
  GOLD_SUIT,
  suitInkCsv,
} from "@/lib/game/card-inks";
import { useSettings } from "@/lib/game/settings";
import type { Rank, Suit } from "@/lib/game/types";
import { cn } from "@/lib/utils";

let cardmeisterReady =
  typeof window !== "undefined" && !!window.customElements?.get("playing-card");
const listeners = new Set<() => void>();

function emitReady() {
  if (cardmeisterReady) return;
  cardmeisterReady = true;
  listeners.forEach((fn) => fn());
}

function loadCardmeister() {
  if (typeof window === "undefined") return;
  if (window.customElements?.get("playing-card")) {
    emitReady();
    return;
  }
  const existing = document.querySelector("script[data-cardmeister]");
  if (existing) {
    existing.addEventListener("load", emitReady, { once: true });
    return;
  }
  const s = document.createElement("script");
  s.src = "/vendor/cardmeister/elements.cardmeister.full.js";
  s.async = false;
  s.dataset.cardmeister = "1";
  s.onload = emitReady;
  document.head.appendChild(s);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function useCardmeisterReady() {
  useEffect(() => {
    loadCardmeister();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => cardmeisterReady,
    () => false,
  );
}

function cidFor(rank: Rank, suit: Suit) {
  return `${rank === "10" ? "T" : rank}${suit}`;
}

export function PlayingCard({
  rank,
  suit,
  gold,
  className,
}: {
  rank: Rank;
  suit: Suit;
  gold: boolean;
  className?: string;
}) {
  const ready = useCardmeisterReady();
  const colorblind = useSettings((s) => s.colorblind);
  const ref = useRef<HTMLElement>(null);
  const inks = colorblind ? COLORBLIND_SUIT : gold ? GOLD_SUIT : CREAM_SUIT;
  const cid = cidFor(rank, suit);
  const cardcolor = gold ? CARD_GOLD : CARD_CREAM;
  const colors = suitInkCsv(inks);
  const border = gold ? "#8a7020" : "#6a6458";

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    el.setAttribute("cid", cid);
    el.setAttribute("cardcolor", cardcolor);
    el.setAttribute("suitcolor", colors);
    el.setAttribute("rankcolor", colors);
    el.setAttribute("opacity", "1");
    el.setAttribute("shadow", "0,0,0");
    el.setAttribute("borderradius", "10");
    el.setAttribute("bordercolor", border);
    el.setAttribute("borderline", "1");
  }, [ready, cid, cardcolor, colors, border]);

  if (!ready) {
    return (
      <div
        className={cn(
          "h-full w-full rounded-[4px]",
          gold ? "bg-gold" : "bg-cream",
          className,
        )}
      />
    );
  }

  return (
    <playing-card
      ref={ref}
      className={cn("playing-card-el", className)}
      cid={cid}
      cardcolor={cardcolor}
      suitcolor={colors}
      rankcolor={colors}
      opacity="1"
      shadow="0,0,0"
      borderradius="10"
      bordercolor={border}
      borderline="1"
    />
  );
}

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/game/juice";
import type { HandLesson } from "@/lib/game/hand-lessons";
import { useSettings } from "@/lib/game/settings";
import { CardFace } from "./CardFace";

const SWAP_MS = 1000;

export function HowToLesson({ lesson }: { lesson: HandLesson }) {
  const cardStyle = useSettings((s) => s.cardStyle);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const examples = lesson.examples;
  const cards = examples[idx % examples.length] ?? examples[0]!;

  useEffect(() => {
    setIdx(0);
    setVisible(true);
  }, [lesson.name]);

  useEffect(() => {
    if (examples.length < 2) return;
    const reduced = prefersReducedMotion();
    let fade: number | undefined;
    const id = window.setInterval(() => {
      if (reduced) {
        setIdx((i) => (i + 1) % examples.length);
        return;
      }
      setVisible(false);
      fade = window.setTimeout(() => {
        setIdx((i) => (i + 1) % examples.length);
        setVisible(true);
      }, 180);
    }, SWAP_MS);
    return () => {
      window.clearInterval(id);
      if (fade) window.clearTimeout(fade);
    };
  }, [examples.length, lesson.name]);

  return (
    <div className="text-center">
      <p className="text-[11px] uppercase tracking-[0.16em] text-fg-subtle">You made</p>
      <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{lesson.name}</h2>
      <p className="mt-1 text-xs tabular-nums text-gold">Scores {lesson.score}</p>
      <div
        className="mt-4 flex min-h-[64px] items-center justify-center gap-1.5 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        aria-label={`Example of ${lesson.name}`}
      >
        {cards.map((c, i) => (
          <span key={`${c.rank}${c.suit}-${i}`} className="h-[58px] w-[41px] shrink-0">
            <CardFace
              card={{
                id: `lesson-${c.rank}${c.suit}-${i}`,
                rank: c.rank,
                suit: c.suit,
                fixed: true,
              }}
              style={cardStyle}
              dimmed={false}
            />
          </span>
        ))}
      </div>
      <p className="mt-4 text-sm leading-snug text-fg-muted">{lesson.blurb}</p>
    </div>
  );
}

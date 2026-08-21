import { Link } from "@tanstack/react-router";
import { Check, ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { unlockAudio, playDeal, playPlace } from "@/lib/game/audio";
import { DEAL_OPENERS, DEAL_STAGES, stallLine } from "@/lib/game/dealer-patter";
import { prefersReducedMotion } from "@/lib/game/juice";
import { useSettings } from "@/lib/game/settings";
import { DIFFICULTY_LABEL, type Card, type Difficulty } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";

const FAN: Card[] = [
  { id: "load-AS", rank: "A", suit: "S" },
  { id: "load-KH", rank: "K", suit: "H" },
  { id: "load-QD", rank: "Q", suit: "D" },
  { id: "load-JC", rank: "J", suit: "C" },
  { id: "load-10S", rank: "10", suit: "S" },
];

const FAN_ROT = [-22, -11, 0, 11, 22];

type Pace = "full" | "quick";

const PACE: Record<Pace, { stageMs: number; minMs: number; stallMs: number }> = {
  full: { stageMs: 720, minMs: 5600, stallMs: 1100 },
  quick: { stageMs: 220, minMs: 1400, stallMs: 500 },
};

export function DealingScreen({
  difficulty,
  table,
  loaded,
  pace = "full",
  onFinished,
}: {
  difficulty: Difficulty;
  table: number;
  loaded: boolean;
  pace?: Pace;
  onFinished: () => void;
}) {
  const cardStyle = useSettings((s) => s.cardStyle);
  const cfg = PACE[pace];
  const [stage, setStage] = useState(0);
  const [log, setLog] = useState<string[]>([DEAL_OPENERS[difficulty]]);
  const [pct, setPct] = useState(4);
  const logRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const loadedRef = useRef(loaded);
  const started = useRef(performance.now());
  const stallIdx = useRef(0);
  const onFinishedRef = useRef(onFinished);

  loadedRef.current = loaded;
  onFinishedRef.current = onFinished;

  useEffect(() => {
    unlockAudio();
    playDeal();
    started.current = performance.now();
    finished.current = false;

    const reduced = prefersReducedMotion();
    const fan = fanRef.current?.children;
    if (fan && !reduced) {
      gsap.fromTo(
        fan,
        { y: 36, opacity: 0, rotate: 8 },
        { y: 0, opacity: 1, rotate: 0, duration: 0.45, stagger: 0.06, ease: "back.out(1.6)" },
      );
    }

    if (reduced) {
      setStage(DEAL_STAGES.length);
      setLog((rows) => [...rows, ...DEAL_STAGES.map((s) => s.line)]);
      setPct(loadedRef.current ? 100 : 90);
    }

    let stageIdx = 0;
    const tick = window.setInterval(
      () => {
        if (finished.current) return;
        if (stageIdx < DEAL_STAGES.length) {
          const next = DEAL_STAGES[stageIdx];
          stageIdx += 1;
          setStage(stageIdx);
          setLog((rows) => [...rows, next.line]);
          setPct(Math.min(92, Math.round((stageIdx / DEAL_STAGES.length) * 88) + 6));
          playPlace();
          return;
        }
        if (!loadedRef.current) {
          const extra = stallLine(stallIdx.current++);
          setLog((rows) => [...rows, extra]);
          setPct((p) => (p > 93 ? 88 : p + 1));
        }
      },
      reduced ? 10_000 : cfg.stageMs,
    );

    const watch = window.setInterval(() => {
      if (finished.current) return;
      const elapsed = performance.now() - started.current;
      const ready = loadedRef.current && elapsed >= (reduced ? 200 : cfg.minMs);
      if (!ready) return;
      finished.current = true;
      setStage(DEAL_STAGES.length);
      setPct(100);
      setLog((rows) => [...rows, "Cards are seated. You're up. Try not to look impressed."]);
      window.setTimeout(() => onFinishedRef.current(), reduced ? 80 : 420);
    }, 80);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(watch);
    };
  }, [cfg.minMs, cfg.stageMs, difficulty, table]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const last = el.lastElementChild;
    if (last && !prefersReducedMotion()) {
      gsap.fromTo(
        last,
        { opacity: 0, y: 10, filter: "blur(4px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.28, ease: "power2.out" },
      );
    }
  }, [log]);

  const current = DEAL_STAGES[Math.min(stage, DEAL_STAGES.length - 1)];
  const allDone = stage >= DEAL_STAGES.length && loaded;
  const headline = allDone
    ? "Cards are seated. You're up."
    : (log[log.length - 1] ?? current.line);

  return (
    <div className="felt-bg relative flex h-dvh flex-col overflow-hidden">
      <div className="felt-noise absolute inset-0" />
      <header className="relative z-10 flex items-center justify-between px-3 py-2">
        <Link
          to="/"
          className="inline-flex size-11 items-center justify-center rounded-xl text-fg-muted hover:bg-fg/5 hover:text-fg"
          aria-label="Back to lobby"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
            Endless · {DIFFICULTY_LABEL[difficulty]} · Table {table}
          </p>
          <h1 className="font-display text-lg font-semibold tracking-tight">The dealer is talking</h1>
        </div>
        <div className="w-11" />
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-y-auto px-4 pb-16">
        <div ref={fanRef} className="flex h-28 items-end justify-center pt-2" aria-hidden>
          {FAN.map((card, i) => (
            <div
              key={card.id}
              className="h-20 w-14 origin-bottom"
              style={{
                marginLeft: i === 0 ? 0 : -18,
                transform: `rotate(${FAN_ROT[i]}deg)`,
                zIndex: i,
              }}
            >
              <CardFace card={card} style={cardStyle} />
            </div>
          ))}
        </div>

        <p className="mt-4 min-h-16 text-center font-display text-lg font-medium leading-snug tracking-tight sm:text-xl">
          {headline}
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
            <span>{allDone ? "Dealt" : current.label}</span>
            <span className="tabular-nums">{Math.min(100, pct)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>

        <ol className="mt-4 hidden flex-wrap justify-center gap-1.5 sm:flex">
          {DEAL_STAGES.map((s, i) => {
            const done = i < stage;
            const active = i === Math.min(stage, DEAL_STAGES.length - 1) && !allDone;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
                  done
                    ? "border-ok/40 bg-ok/15 text-ok"
                    : active
                      ? "border-gold/50 bg-gold/10 text-gold"
                      : "border-border text-fg-subtle",
                )}
              >
                {done ? <Check className="size-3" /> : null}
                {s.label}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 min-h-0 flex-1 rounded-2xl border border-border bg-bg/70 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">Dealer log</p>
          <div
            ref={logRef}
            className="h-full max-h-72 space-y-2 overflow-y-auto pr-1 text-sm leading-relaxed text-fg-muted"
            aria-live="polite"
          >
            {log.map((line, i) => (
              <p key={`${i}-${line.slice(0, 18)}`} className={cn(i === log.length - 1 && "text-fg")}>
                <span className="mr-2 font-display text-[11px] tabular-nums text-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>{" "}
                {line}
              </p>
            ))}
          </div>
        </div>

        {loaded ? (
          <Button
            className="mt-4 w-full"
            onClick={() => {
              if (finished.current) return;
              finished.current = true;
              onFinished();
            }}
          >
            Sit down already
          </Button>
        ) : (
          <p className="mt-4 text-center text-xs text-fg-subtle">
            Table is still being argued into existence. Stay. The jokes are free.
          </p>
        )}
      </div>
    </div>
  );
}

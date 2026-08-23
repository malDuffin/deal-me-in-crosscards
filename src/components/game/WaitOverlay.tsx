import gsap from "gsap";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEAL_STALL } from "@/lib/game/dealer-patter";
import { prefersReducedMotion } from "@/lib/game/juice";
import type { GenBoardPreview, GenProgress } from "@/lib/game/endless";
import { useSettings } from "@/lib/game/settings";
import {
  BOARD_PAD,
  BOARD_RAIL,
  BOARD_SIZE,
  CELL_GAP,
  CELL_H,
  CELL_W,
} from "@/lib/game/types";
import { CardFace } from "./CardFace";
import { StopSign } from "./StopSign";
import { cn } from "@/lib/utils";

function TrialBoard({ preview }: { preview: GenBoardPreview | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const cardStyle = useSettings((s) => s.cardStyle);
  const cols = preview?.grid ?? BOARD_SIZE;
  const rows = preview?.rows ?? cols;
  const innerW = cols * CELL_W + (cols - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;
  const innerH = rows * CELL_H + (rows - 1) * CELL_GAP + BOARD_PAD * 2 + BOARD_RAIL * 2;

  const map = new Map<string, GenBoardPreview["cells"][number]>();
  if (preview) {
    for (const cell of preview.cells) map.set(`${cell.r},${cell.c}`, cell);
  }

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const s = Math.min(wrap.clientWidth / innerW, wrap.clientHeight / innerH);
      setScale(Number.isFinite(s) && s > 0 ? s : 0.4);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [innerW, innerH]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-14 bottom-28 sm:inset-x-3"
    >
      <div ref={wrapRef} className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
        <div style={{ width: innerW * scale, height: innerH * scale, position: "relative" }}>
          <div
            className="absolute left-0 top-0"
            style={{
              width: innerW,
              height: innerH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <div
              className="rounded-md border-board-rim bg-felt shadow-[inset_0_0_28px_rgba(0,0,0,0.4)]"
              style={{ borderWidth: BOARD_RAIL, padding: BOARD_PAD }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
                  gridTemplateRows: `repeat(${rows}, ${CELL_H}px)`,
                  gap: CELL_GAP,
                  fontSize: 11,
                }}
              >
                {Array.from({ length: rows * cols }, (_, i) => {
                  const r = Math.floor(i / cols);
                  const c = i % cols;
                  const cell = map.get(`${r},${c}`);
                  if (!cell) {
                    return (
                      <div key={i} className="relative rounded-[3px] border border-cell-line bg-cell" />
                    );
                  }
                  if (cell.stop) {
                    return (
                      <div key={i} className="relative rounded-[3px] bg-rail/80">
                        <span className="absolute inset-0 grid place-items-center">
                          <StopSign className="h-[70%] w-[70%] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]" />
                        </span>
                      </div>
                    );
                  }
                  if (!cell.rank || !cell.suit) {
                    return (
                      <div key={i} className="relative rounded-[3px] border border-cell-line bg-cell" />
                    );
                  }
                  return (
                    <div key={i} className="relative rounded-[3px] border border-cell-line bg-cell">
                      <div className="absolute inset-[1px]">
                        <CardFace
                          card={{
                            id: `trial-${r}-${c}`,
                            rank: cell.rank,
                            suit: cell.suit,
                            fixed: !cell.gold,
                          }}
                          dimmed={!cell.gold}
                          style={cardStyle}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WaitOverlay({
  show = true,
  status = null,
  variant = "stall",
  progress = null,
  onReady,
}: {
  show?: boolean;
  /** Live Endless builder status (shown instead of / alongside a stall line). */
  status?: string | null;
  /** `builder` = Endless generation copy + trial boards. `stall` = other modes. */
  variant?: "stall" | "builder";
  progress?: GenProgress | null;
  /** Fires once the Hold Please panel has fully appeared. */
  onReady?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const readySent = useRef(false);
  const [mounted, setMounted] = useState(show);
  const [stallIdx, setStallIdx] = useState(() => Math.floor(Math.random() * DEAL_STALL.length));
  const [log, setLog] = useState<string[]>([]);

  onReadyRef.current = onReady;

  const headline = progress?.phase ?? status;
  const detail = progress?.detail ?? null;
  const preview = progress?.preview ?? null;

  useLayoutEffect(() => {
    if (show) setMounted(true);
  }, [show]);

  useLayoutEffect(() => {
    if (!show) {
      readySent.current = false;
      return;
    }
    setLog([]);
  }, [show]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!mounted || !el) return;
    gsap.killTweensOf(el);
    const fireReady = () => {
      if (readySent.current) return;
      readySent.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => onReadyRef.current?.());
      });
    };
    if (!show) {
      gsap.to(el, {
        opacity: 0,
        duration: 0.28,
        ease: "power2.in",
        onComplete: () => setMounted(false),
      });
      return;
    }
    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1 });
      fireReady();
      return;
    }
    gsap.fromTo(
      el,
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.34,
        ease: "power2.out",
        onComplete: fireReady,
      },
    );
  }, [show, mounted]);

  useEffect(() => {
    if (!show || variant !== "stall") return;
    const t = window.setInterval(() => {
      setStallIdx((i) => (i + 1) % DEAL_STALL.length);
    }, 2400);
    return () => window.clearInterval(t);
  }, [show, variant]);

  useEffect(() => {
    if (!show || variant !== "builder") return;
    const line = [headline, detail].filter(Boolean).join(" — ");
    if (!line) return;
    setLog((rows) => (rows[rows.length - 1] === line ? rows : [...rows.slice(-5), line]));
  }, [show, variant, headline, detail]);

  if (!mounted) return null;

  const stall = DEAL_STALL[stallIdx % DEAL_STALL.length];
  const builder = variant === "builder";

  return (
    <div
      ref={rootRef}
      className="glass-scrim pointer-events-none fixed inset-0 z-40 grid place-items-center p-6"
      style={{ opacity: 0 }}
    >
      {builder ? <TrialBoard preview={preview} /> : null}
      <div className={cn("glass relative z-10 rounded-[28px] px-6 py-5 text-center", builder ? "max-w-md" : "max-w-sm")}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-fg-subtle">Hold please</p>
        {builder ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-fg" aria-live="polite">
              {headline || "Bringing the table into view…"}
            </p>
            {detail ? <p className="mt-2 text-xs leading-relaxed text-fg-muted">{detail}</p> : null}
            {log.length > 1 ? (
              <ol className="mt-3 space-y-1.5 text-left text-[11px] leading-snug text-fg-subtle">
                {log.slice(0, -1).map((row, i) => (
                  <li key={`${i}-${row.slice(0, 24)}`} className="truncate">
                    {row}
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-fg" aria-live="polite">
              {status || stall}
            </p>
            {status ? (
              <p className="mt-3 text-xs leading-relaxed text-fg-muted">{stall}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

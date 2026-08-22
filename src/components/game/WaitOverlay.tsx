import gsap from "gsap";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEAL_STALL } from "@/lib/game/dealer-patter";

export function WaitOverlay({
  show = true,
  status = null,
}: {
  show?: boolean;
  /** Live Endless builder status (shown instead of / alongside a stall line). */
  status?: string | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(show);
  const [stallIdx, setStallIdx] = useState(() => Math.floor(Math.random() * DEAL_STALL.length));

  useLayoutEffect(() => {
    if (show) setMounted(true);
  }, [show]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!mounted || !el) return;
    gsap.killTweensOf(el);
    if (show) {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out" });
      return;
    }
    gsap.to(el, {
      opacity: 0,
      duration: 0.28,
      ease: "power2.in",
      onComplete: () => setMounted(false),
    });
  }, [show, mounted]);

  useEffect(() => {
    if (!show) return;
    const t = window.setInterval(() => {
      setStallIdx((i) => (i + 1) % DEAL_STALL.length);
    }, 2400);
    return () => window.clearInterval(t);
  }, [show]);

  if (!mounted) return null;

  const stall = DEAL_STALL[stallIdx % DEAL_STALL.length];

  return (
    <div
      ref={rootRef}
      className="glass-scrim pointer-events-none fixed inset-0 z-40 grid place-items-center p-6"
      style={{ opacity: 0 }}
    >
      <div className="glass max-w-sm rounded-[28px] px-6 py-5 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-fg-subtle">Hold please</p>
        <p className="mt-3 text-sm leading-relaxed text-fg" aria-live="polite">
          {status || stall}
        </p>
        {status ? (
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">{stall}</p>
        ) : null}
      </div>
    </div>
  );
}

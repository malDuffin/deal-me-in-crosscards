import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import gsap from "gsap";
import { applyAudioPrefs, unlockAudio } from "@/lib/game/audio";
import { prefersReducedMotion } from "@/lib/game/juice";
import { useSettings } from "@/lib/game/settings";
import type { Card, CardStyle } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";

const SAMPLE: Card = { id: "preview", rank: "A", suit: "H" };

const STYLES: { id: CardStyle; name: string; blurb: string }[] = [
  { id: "large", name: "Large rank", blurb: "Big letter on top, suit color below" },
  { id: "classic", name: "Classic", blurb: "Rank and suit stacked like a mini card" },
  { id: "realistic", name: "Realistic", blurb: "Traditional corners and a center pip" },
];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const {
    cardStyle,
    colorblind,
    music,
    muted,
    setCardStyle,
    setColorblind,
    setMusic,
    setMuted,
  } = useSettings();

  useEffect(() => {
    applyAudioPrefs(muted, music);
  }, [muted, music]);

  useEffect(() => {
    const panel = panelRef.current;
    const sheet = sheetRef.current;
    if (!panel || !sheet) return;
    if (open) {
      panel.style.display = "flex";
      panel.style.pointerEvents = "auto";
      if (prefersReducedMotion()) {
        panel.style.opacity = "1";
        sheet.style.transform = "translateY(0)";
        return;
      }
      gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(sheet, { y: 72 }, { y: 0, duration: 0.34, ease: "power3.out" });
    } else {
      panel.style.pointerEvents = "none";
      if (panel.style.display === "flex") {
        if (prefersReducedMotion()) {
          panel.style.display = "none";
          return;
        }
        gsap.to(sheet, { y: 72, duration: 0.22, ease: "power2.in" });
        gsap.to(panel, {
          opacity: 0,
          duration: 0.22,
          onComplete: () => {
            panel.style.display = "none";
          },
        });
      } else {
        panel.style.display = "none";
      }
    }
  }, [open]);

  return (
    <div
      ref={panelRef}
      className="glass-scrim pointer-events-none fixed inset-0 z-50 hidden items-end justify-center sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className="glass max-h-[min(92dvh,680px)] w-full max-w-md overflow-y-auto rounded-t-[28px] p-5 pb-10 sm:rounded-[28px]"
      >
        <div className="relative mb-4">
          <h2 className="text-center font-display text-xl font-semibold tracking-tight">
            Settings
          </h2>
          <button
            type="button"
            className="absolute right-0 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-fg-muted transition-transform duration-150 ease-out hover:bg-fg/5 hover:text-fg active:scale-[0.96]"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">Card style</p>
        <div className="mb-5 flex flex-col gap-2">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                unlockAudio();
                setCardStyle(s.id);
              }}
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-transform duration-150 ease-out active:scale-[0.96]",
                cardStyle === s.id
                  ? "border-gold bg-gold/15"
                  : "glass-chip hover:bg-cream/10",
              )}
            >
              <span className="h-12 w-[34px] shrink-0" style={{ fontSize: 11 }}>
                <CardFace card={{ ...SAMPLE, fixed: true }} style={s.id} />
              </span>
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="text-xs text-fg-muted">{s.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
          Accessibility
        </p>
        <Toggle
          title="Colorblind colors"
          blurb="Hearts amber · diamonds blue · clubs green"
          on={colorblind}
          onClick={() => setColorblind(!colorblind)}
        />

        <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">Audio</p>
        <div className="space-y-2">
          <Toggle
            title="Music"
            blurb="Late-night lounge over the felt"
            on={music && !muted}
            onClick={() => {
              unlockAudio();
              if (muted) setMuted(false);
              setMusic(!music);
            }}
          />
          <Toggle
            title="Mute"
            blurb="Silence music and table sounds"
            on={muted}
            onClick={() => {
              unlockAudio();
              setMuted(!muted);
            }}
          />
        </div>

        <Button className="mt-5 w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  title,
  blurb,
  on,
  onClick,
}: {
  title: string;
  blurb: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-chip flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left transition-transform duration-150 ease-out active:scale-[0.96]"
    >
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-xs text-fg-muted">{blurb}</span>
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          on ? "bg-ok" : "bg-ink/40",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-6 rounded-full bg-cream transition-transform",
            on ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

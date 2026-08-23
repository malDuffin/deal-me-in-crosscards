import { useEffect, useRef } from "react";
import { Link2, Link2Off, X } from "lucide-react";
import gsap from "gsap";
import { applyAudioPrefs, unlockAudio } from "@/lib/game/audio";
import { prefersReducedMotion } from "@/lib/game/juice";
import {
  feltDropShadow,
  SHADOW_DISTANCE_MAX,
  SHADOW_DISTANCE_MIN,
  SHADOW_OPACITY_MAX,
  SHADOW_OPACITY_MIN,
  useSettings,
} from "@/lib/game/settings";
import { SUITS, BOARD_SIZE_MAX, BOARD_SIZE_MIN, type Card, type CardStyle, type Suit } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CardFace } from "./CardFace";

const SAMPLE: Card = { id: "preview", rank: "A", suit: "H" };

const STYLES: { id: CardStyle; name: string; blurb: string }[] = [
  { id: "large", name: "Large rank", blurb: "Big letter on top, suit color below" },
  { id: "classic", name: "Classic", blurb: "Rank and suit stacked like a mini card" },
  { id: "realistic", name: "Realistic", blurb: "Full-face pips and courts (Cardmeister)" },
];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const {
    cardStyle,
    colorblind,
    music,
    muted,
    boardShadows,
    shadowDistance,
    shadowOpacity,
    setCardStyle,
    setColorblind,
    setMusic,
    setMuted,
    setBoardShadows,
    setShadowDistance,
    setShadowOpacity,
    endlessCols,
    endlessRows,
    endlessSizeLinked,
    setEndlessCols,
    setEndlessRows,
    setEndlessSizeLinked,
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

  const previewShadow = feltDropShadow(boardShadows, shadowDistance, shadowOpacity);

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
        className="glass max-h-[min(92dvh,760px)] w-full max-w-md overflow-y-auto rounded-t-[28px] p-5 pb-10 sm:rounded-[28px]"
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
        <div className="mb-3 flex flex-col gap-2">
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

        <div className="mb-5 flex justify-center gap-2">
          {SUITS.map((s: Suit) => (
            <span key={s} className="h-[58px] w-[41px]">
              <CardFace
                card={{ id: `gold-${s}`, rank: "A", suit: s }}
                style={cardStyle}
                tray
              />
            </span>
          ))}
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
          Endless board
        </p>
        <div className="glass-chip mb-5 rounded-2xl px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">
                {endlessCols}×{endlessRows}
              </span>
              <span className="text-xs text-fg-muted">
                How to Play, Training and Puzzle stay 11×11
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setEndlessSizeLinked(!endlessSizeLinked);
              }}
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-xl transition-transform duration-150 ease-out active:scale-[0.96]",
                endlessSizeLinked ? "bg-gold/20 text-gold" : "bg-ink/30 text-fg-muted",
              )}
              aria-pressed={endlessSizeLinked}
              aria-label={endlessSizeLinked ? "Unlock width and height" : "Lock width and height together"}
              title={endlessSizeLinked ? "Width and height linked" : "Width and height separate"}
            >
              {endlessSizeLinked ? <Link2 className="size-5" /> : <Link2Off className="size-5" />}
            </button>
          </div>
          <label className="mt-3 block">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm">{endlessSizeLinked ? "Size" : "Width"}</span>
              <span className="text-xs tabular-nums text-fg-muted">{endlessCols}</span>
            </span>
            <input
              type="range"
              min={BOARD_SIZE_MIN}
              max={BOARD_SIZE_MAX}
              step={1}
              value={endlessCols}
              aria-label={endlessSizeLinked ? "Endless board size" : "Endless board width"}
              onChange={(e) => setEndlessCols(Number(e.target.value))}
              className="mt-1 w-full accent-gold"
            />
          </label>
          <label className={cn("mt-2 block", endlessSizeLinked && "opacity-45")}>
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-sm">Height</span>
              <span className="text-xs tabular-nums text-fg-muted">{endlessRows}</span>
            </span>
            <input
              type="range"
              min={BOARD_SIZE_MIN}
              max={BOARD_SIZE_MAX}
              step={1}
              value={endlessRows}
              disabled={endlessSizeLinked}
              aria-label="Endless board height"
              onChange={(e) => setEndlessRows(Number(e.target.value))}
              className="mt-1 w-full accent-gold"
            />
          </label>
          <div className="mt-3 grid place-items-center rounded-xl bg-felt px-3 py-3">
            <div
              className="rounded-[3px] border border-board-rim bg-cell/80"
              style={{
                width: Math.max(28, endlessCols * 4),
                height: Math.max(28, endlessRows * 4),
                backgroundImage:
                  "linear-gradient(to right, color-mix(in oklab, var(--color-fg) 14%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-fg) 14%, transparent) 1px, transparent 1px)",
                backgroundSize: `${100 / endlessCols}% ${100 / endlessRows}%`,
              }}
              aria-hidden
            />
          </div>
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
          Board shadows
        </p>
        <Toggle
          title="Shadows on placed cards"
          blurb="Cast onto the felt after a card is seated"
          on={boardShadows}
          onClick={() => setBoardShadows(!boardShadows)}
        />
        <div className="mt-2 space-y-2">
          <SliderRow
            title="Shadow distance"
            blurb="How far the shadow sits from the card"
            value={shadowDistance}
            min={SHADOW_DISTANCE_MIN}
            max={SHADOW_DISTANCE_MAX}
            step={1}
            disabled={!boardShadows}
            format={(v) => `${Math.round(v)} px`}
            onChange={setShadowDistance}
          />
          <SliderRow
            title="Shadow opacity"
            blurb="How heavy the shadow reads on the felt"
            value={shadowOpacity}
            min={SHADOW_OPACITY_MIN}
            max={SHADOW_OPACITY_MAX}
            step={0.05}
            disabled={!boardShadows}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setShadowOpacity}
          />
        </div>
        <div className="mt-2 mb-5 grid place-items-center rounded-2xl bg-felt px-4 py-5">
          <div
            className="h-16 w-[46px]"
            style={{ fontSize: 14, filter: previewShadow }}
          >
            <CardFace card={{ ...SAMPLE }} style={cardStyle} tray />
          </div>
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

function SliderRow({
  title,
  blurb,
  value,
  min,
  max,
  step,
  disabled,
  format,
  onChange,
}: {
  title: string;
  blurb: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label
      className={cn(
        "glass-chip block rounded-2xl px-3 py-3",
        disabled && "pointer-events-none opacity-45",
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{title}</span>
        <span className="text-xs tabular-nums text-fg-muted">{format(value)}</span>
      </span>
      <span className="block text-xs text-fg-muted">{blurb}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={title}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-gold"
      />
    </label>
  );
}

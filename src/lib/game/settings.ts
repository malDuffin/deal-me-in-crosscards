import { create } from "zustand";
import type { CardStyle } from "./types";

const KEY = "crosscards-settings-v1";

export const SHADOW_DISTANCE_MIN = 1;
export const SHADOW_DISTANCE_MAX = 16;
export const SHADOW_OPACITY_MIN = 0.1;
export const SHADOW_OPACITY_MAX = 0.85;

type SettingsData = {
  cardStyle: CardStyle;
  colorblind: boolean;
  music: boolean;
  muted: boolean;
  boardShadows: boolean;
  shadowDistance: number;
  shadowOpacity: number;
};

type Settings = SettingsData & {
  setCardStyle: (s: CardStyle) => void;
  setColorblind: (v: boolean) => void;
  setMusic: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setBoardShadows: (v: boolean) => void;
  setShadowDistance: (v: number) => void;
  setShadowOpacity: (v: number) => void;
};

const DEFAULTS: SettingsData = {
  cardStyle: "large",
  colorblind: false,
  music: true,
  muted: false,
  boardShadows: false,
  shadowDistance: 4,
  shadowOpacity: 0.4,
};

function clamp(n: number, lo: number, hi: number, fallback: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function load(): SettingsData {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<SettingsData>;
    return {
      cardStyle:
        p.cardStyle === "classic" || p.cardStyle === "realistic" || p.cardStyle === "large"
          ? p.cardStyle
          : DEFAULTS.cardStyle,
      colorblind: !!p.colorblind,
      music: p.music !== false,
      muted: !!p.muted,
      boardShadows: !!p.boardShadows,
      shadowDistance: clamp(
        Number(p.shadowDistance),
        SHADOW_DISTANCE_MIN,
        SHADOW_DISTANCE_MAX,
        DEFAULTS.shadowDistance,
      ),
      shadowOpacity: clamp(
        Number(p.shadowOpacity),
        SHADOW_OPACITY_MIN,
        SHADOW_OPACITY_MAX,
        DEFAULTS.shadowOpacity,
      ),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(s: Settings) {
  if (typeof window === "undefined") return;
  const data: SettingsData = {
    cardStyle: s.cardStyle,
    colorblind: s.colorblind,
    music: s.music,
    muted: s.muted,
    boardShadows: s.boardShadows,
    shadowDistance: s.shadowDistance,
    shadowOpacity: s.shadowOpacity,
  };
  window.localStorage.setItem(KEY, JSON.stringify(data));
}

/** Felt-cast drop-shadow for cards seated on the board. */
export function feltDropShadow(
  on: boolean,
  distance: number,
  opacity: number,
): string | undefined {
  if (!on) return undefined;
  const d = Math.round(distance);
  const blur = Math.max(1, Math.round(d * 0.9));
  return `drop-shadow(${d}px ${d}px ${blur}px rgba(0, 0, 0, ${opacity}))`;
}

export const useSettings = create<Settings>((set, get) => ({
  ...load(),
  setCardStyle: (cardStyle) => {
    set({ cardStyle });
    persist(get());
  },
  setColorblind: (colorblind) => {
    set({ colorblind });
    persist(get());
  },
  setMusic: (music) => {
    set({ music });
    persist(get());
  },
  setMuted: (muted) => {
    set({ muted });
    persist(get());
  },
  setBoardShadows: (boardShadows) => {
    set({ boardShadows });
    persist(get());
  },
  setShadowDistance: (shadowDistance) => {
    set({
      shadowDistance: clamp(
        shadowDistance,
        SHADOW_DISTANCE_MIN,
        SHADOW_DISTANCE_MAX,
        DEFAULTS.shadowDistance,
      ),
    });
    persist(get());
  },
  setShadowOpacity: (shadowOpacity) => {
    set({
      shadowOpacity: clamp(
        shadowOpacity,
        SHADOW_OPACITY_MIN,
        SHADOW_OPACITY_MAX,
        DEFAULTS.shadowOpacity,
      ),
    });
    persist(get());
  },
}));

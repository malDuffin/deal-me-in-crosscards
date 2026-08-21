import { create } from "zustand";
import type { CardStyle } from "./types";

const KEY = "crosscards-settings-v1";

type Settings = {
  cardStyle: CardStyle;
  colorblind: boolean;
  music: boolean;
  muted: boolean;
  setCardStyle: (s: CardStyle) => void;
  setColorblind: (v: boolean) => void;
  setMusic: (v: boolean) => void;
  setMuted: (v: boolean) => void;
};

function load(): Pick<Settings, "cardStyle" | "colorblind" | "music" | "muted"> {
  const defaults = { cardStyle: "large" as CardStyle, colorblind: false, music: true, muted: false };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults;
    const p = JSON.parse(raw) as Partial<typeof defaults>;
    return {
      cardStyle: p.cardStyle === "classic" || p.cardStyle === "realistic" || p.cardStyle === "large" ? p.cardStyle : "large",
      colorblind: !!p.colorblind,
      music: p.music !== false,
      muted: !!p.muted,
    };
  } catch {
    return defaults;
  }
}

function persist(s: Pick<Settings, "cardStyle" | "colorblind" | "music" | "muted">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
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
}));

import {
  CARD_CREAM,
  CARD_GOLD,
  COLORBLIND_SUIT,
  CREAM_SUIT,
  GOLD_SUIT,
  suitInkCsv,
} from "./card-inks";
import { RANKS, SUITS, type CardStyle, type Rank, type Suit } from "./types";

type FaceOpts = { gold: boolean; dimmed: boolean; style: CardStyle; colorblind: boolean };

type Slot = {
  wrap: HTMLElement;
  rank: Rank;
  suit: Suit;
  gold: boolean;
  dimmed: boolean;
  style: CardStyle;
  colorblind: boolean;
};

const KEY = (rank: Rank, suit: Suit) => `${rank}${suit}`;

let park: HTMLElement | null = null;
let builtStyle: CardStyle | null = null;
let builtCb: boolean | null = null;
const slots = new Map<string, Slot>();

function ensurePark() {
  if (typeof document === "undefined") return null;
  if (park?.isConnected) return park;
  park = document.getElementById("cc-card-park") as HTMLElement | null;
  if (!park) {
    park = document.createElement("div");
    park.id = "cc-card-park";
    park.setAttribute("aria-hidden", "true");
    park.style.cssText =
      "position:fixed;left:-240vw;top:0;width:40px;height:56px;overflow:hidden;pointer-events:none;contain:strict;";
    document.body.appendChild(park);
  }
  return park;
}

function cidFor(rank: Rank, suit: Suit) {
  return `${rank === "10" ? "T" : rank}${suit}`;
}

function suitSvg(suit: Suit, inverse: boolean, cls: string) {
  const color = inverse ? "text-cream" : `suit-${suit.toLowerCase()}`;
  const klass = `suit-glyph ${color} ${cls}`;
  if (suit === "S") {
    return `<svg viewBox="0 0 24 24" class="${klass}" aria-hidden="true" overflow="visible"><circle cx="8" cy="14.7" r="5.75"/><circle cx="16" cy="14.7" r="5.75"/><polygon points="2.5,13.9 12,1.0 21.5,13.9"/><path d="M10.6 19.4h2.8v2l3.3 2.5H7.3l3.3-2.5z"/></svg>`;
  }
  if (suit === "H") {
    return `<svg viewBox="0 0 24 24" class="${klass}" aria-hidden="true" overflow="visible"><circle cx="8" cy="8.85" r="5.75"/><circle cx="16" cy="8.85" r="5.75"/><polygon points="2.5,9.5 12,23.2 21.5,9.5"/></svg>`;
  }
  if (suit === "D") {
    return `<svg viewBox="0 0 24 24" class="${klass}" aria-hidden="true"><polygon points="12,1.2 21.3,12 12,22.8 2.7,12"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" class="${klass}" aria-hidden="true" overflow="visible"><path d="M12 .6C8.6.6 6.2 3.2 6.2 6.4c0 1.8.8 3.3 2 4.3-2-.5-4.4.5-5.6 2.5-1.4 2.4-.8 5.6 1.6 7.2 2 1.3 4.6.8 6.2-.8v.8L8.2 23.4h7.6L13.6 20.4v-.8c1.6 1.6 4.2 2.1 6.2.8 2.4-1.6 3-4.8 1.6-7.2-1.2-2-3.6-3-5.6-2.5 1.2-1 2-2.5 2-4.3C17.8 3.2 15.4.6 12 .6z"/></svg>`;
}

function classicInner(rank: Rank, suit: Suit) {
  const pip = suitSvg(suit, false, "mt-px size-[0.9em]");
  const big = suitSvg(suit, false, "size-[46%]");
  return `<div class="flex items-start justify-between"><span class="font-display text-[1.26em] font-semibold leading-none tracking-tight">${rank}</span>${pip}</div><div class="grid flex-1 place-items-center">${big}</div><div class="flex rotate-180 items-start justify-between"><span class="font-display text-[1.26em] font-semibold leading-none tracking-tight">${rank}</span>${pip}</div>`;
}

function largeInner(rank: Rank, suit: Suit) {
  const icon = suitSvg(suit, true, "size-[88%]");
  return `<div class="grid flex-1 place-items-center pt-[4%] suit-${suit.toLowerCase()}"><span class="font-display text-[1.55em] font-bold leading-none tracking-tight">${rank}</span></div><div class="grid h-[48%] place-items-center suit-bar-${suit.toLowerCase()}">${icon}</div>`;
}

function paintRealistic(wrap: HTMLElement, rank: Rank, suit: Suit, gold: boolean, colorblind: boolean) {
  let pc = wrap.querySelector("playing-card") as HTMLElement | null;
  if (!pc) {
    pc = document.createElement("playing-card");
    pc.className = "playing-card-el";
    wrap.replaceChildren(pc);
  }
  const inks = colorblind ? COLORBLIND_SUIT : gold ? GOLD_SUIT : CREAM_SUIT;
  const colors = suitInkCsv(inks);
  pc.setAttribute("cid", cidFor(rank, suit));
  pc.setAttribute("cardcolor", gold ? CARD_GOLD : CARD_CREAM);
  pc.setAttribute("suitcolor", colors);
  pc.setAttribute("rankcolor", colors);
  pc.setAttribute("opacity", "1");
  pc.setAttribute("shadow", "0,0,0");
  pc.setAttribute("borderradius", "10");
  pc.setAttribute("bordercolor", gold ? "#8a7020" : "#6a6458");
  pc.setAttribute("borderline", "1");
}

function paintDrawn(wrap: HTMLElement, rank: Rank, suit: Suit, gold: boolean, dimmed: boolean, style: CardStyle) {
  const red = suit === "H" || suit === "D";
  if (style === "large") {
    const tint = gold
      ? red
        ? "card-large-gold-red"
        : "card-large-gold-black"
      : red
        ? "card-large-cream-red"
        : "card-large-cream-black";
    wrap.className = `pooled-card-face relative flex h-full w-full flex-col overflow-hidden rounded-[4px] card-shadow card-large ${tint}${gold ? " card-playable" : ""}${dimmed ? " opacity-80" : ""}`;
    if (wrap.dataset.kind !== "large") {
      wrap.innerHTML = largeInner(rank, suit);
      wrap.dataset.kind = "large";
    }
  } else {
    wrap.className = `pooled-card-face relative flex h-full w-full flex-col justify-between rounded-[4px] px-[7%] py-[6%] card-shadow ${gold ? "card-playable bg-gold" : "bg-cream"} suit-${suit.toLowerCase()}${dimmed ? " opacity-80" : ""}`;
    if (wrap.dataset.kind !== "classic") {
      wrap.innerHTML = classicInner(rank, suit);
      wrap.dataset.kind = "classic";
    }
  }
  let bar = wrap.querySelector("[data-fixed-bar]") as HTMLElement | null;
  if (!gold) {
    if (!bar) {
      bar = document.createElement("span");
      bar.dataset.fixedBar = "1";
      bar.className = "absolute inset-x-0 bottom-0 h-0.5 bg-ink/20";
      wrap.appendChild(bar);
    }
  } else if (bar) {
    bar.remove();
  }
}

function paint(slot: Slot, opts: FaceOpts) {
  slot.gold = opts.gold;
  slot.dimmed = opts.dimmed;
  slot.style = opts.style;
  slot.colorblind = opts.colorblind;
  if (opts.style === "realistic") {
    slot.wrap.className = `pooled-card-face relative h-full w-full rounded-[4px]${opts.gold ? " card-playable" : ""}${opts.dimmed ? " opacity-80" : ""}`;
    slot.wrap.dataset.kind = "realistic";
    paintRealistic(slot.wrap, slot.rank, slot.suit, opts.gold, opts.colorblind);
  } else {
    paintDrawn(slot.wrap, slot.rank, slot.suit, opts.gold, opts.dimmed, opts.style);
  }
}

function makeSlot(rank: Rank, suit: Suit, style: CardStyle, colorblind: boolean): Slot {
  const wrap = document.createElement("div");
  wrap.dataset.poolCard = KEY(rank, suit);
  wrap.style.cssText = "width:100%;height:100%;";
  const slot: Slot = { wrap, rank, suit, gold: false, dimmed: false, style, colorblind };
  paint(slot, { gold: false, dimmed: false, style, colorblind });
  return slot;
}

/** Build or rebuild the 52-card visual pool. Cheap no-op if already current. */
export function ensureCardPool(style: CardStyle, colorblind: boolean) {
  const root = ensurePark();
  if (!root) return;
  if (builtStyle === style && builtCb === colorblind && slots.size === 52) return;
  for (const slot of slots.values()) slot.wrap.remove();
  slots.clear();
  builtStyle = style;
  builtCb = colorblind;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const slot = makeSlot(rank, suit, style, colorblind);
      root.appendChild(slot.wrap);
      slots.set(KEY(rank, suit), slot);
    }
  }
}

export function attachPooledCard(
  host: HTMLElement,
  rank: Rank,
  suit: Suit,
  opts: FaceOpts,
) {
  ensureCardPool(opts.style, opts.colorblind);
  const slot = slots.get(KEY(rank, suit));
  if (!slot) return;
  if (slot.gold !== opts.gold || slot.dimmed !== opts.dimmed || slot.style !== opts.style || slot.colorblind !== opts.colorblind) {
    paint(slot, opts);
  }
  if (slot.wrap.parentElement !== host) host.appendChild(slot.wrap);
}

export function parkPooledCard(rank: Rank, suit: Suit, host?: HTMLElement | null) {
  const slot = slots.get(KEY(rank, suit));
  const root = ensurePark();
  if (!slot || !root) return;
  if (host && slot.wrap.parentElement !== host) return;
  if (slot.wrap.parentElement !== root) root.appendChild(slot.wrap);
}

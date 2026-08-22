import gsap from "gsap";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Launch cards up in a random direction, then drop them with gravity. */
export function scatterElements(els: HTMLElement[]): Promise<void> {
  if (!els.length) return Promise.resolve();
  if (prefersReducedMotion()) return Promise.resolve();

  return new Promise((resolve) => {
    let done = 0;
    const finish = () => {
      done++;
      if (done >= els.length) resolve();
    };

    els.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        finish();
        return;
      }
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.position = "fixed";
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.zIndex = "90";
      clone.style.pointerEvents = "none";
      clone.style.margin = "0";
      clone.style.transformOrigin = "center center";
      document.body.appendChild(clone);
      el.style.visibility = "hidden";

      const vx = (Math.random() - 0.5) * 760;
      const lift = -(160 + Math.random() * 240);
      const fall = 720 + Math.random() * 280;
      const rot = (Math.random() - 0.5) * 640;
      const tl = gsap.timeline({
        delay: i * 0.016,
        onComplete: () => {
          clone.remove();
          finish();
        },
      });
      tl.to(clone, {
        x: vx * 0.38,
        y: lift,
        rotation: rot * 0.4,
        duration: 0.22,
        ease: "power2.out",
      });
      tl.to(clone, {
        x: vx,
        y: fall,
        rotation: rot,
        opacity: 0,
        duration: 0.78,
        ease: "power2.in",
      });
    });
  });
}

/** Kept for callers — player-placed cards now use the heavier felt-drop. */
export function popIn(el: Element | null) {
  placePop(el);
}

type FlyOrigin = "bottom" | "top" | "left" | "right" | "random";

function originDelta(rect: DOMRect, origin: FlyOrigin) {
  const pad = 96;
  let side: Exclude<FlyOrigin, "random"> = origin === "random"
    ? (["top", "left", "right", "bottom"] as const)[Math.floor(Math.random() * 4)]
    : origin;
  let x = 0;
  let y = 0;
  if (side === "bottom") {
    y = window.innerHeight + pad - rect.top;
    x = (Math.random() - 0.5) * 160;
  } else if (side === "top") {
    y = -pad - rect.height - rect.top;
    x = (Math.random() - 0.5) * 200;
  } else if (side === "left") {
    x = -pad - rect.width - rect.left;
    y = (Math.random() - 0.5) * 140;
  } else {
    x = window.innerWidth + pad - rect.left;
    y = (Math.random() - 0.5) * 140;
  }
  const spin =
    side === "left" ? -220 - Math.random() * 140 : side === "right" ? 220 + Math.random() * 140 : (Math.random() - 0.5) * 420;
  return { x, y, rot: spin };
}

function snapshotCard(el: HTMLElement, rect: DOMRect) {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = "0";
  clone.style.zIndex = "72";
  clone.style.pointerEvents = "none";
  clone.style.transformOrigin = "center center";
  clone.style.filter = "drop-shadow(0 22px 18px rgba(0,0,0,0.55))";
  clone.style.animation = "none";
  clone.style.visibility = "visible";
  clone.style.opacity = "1";
  document.body.appendChild(clone);
  el.style.visibility = "hidden";
  return clone;
}

/**
 * Cards slam in from off-screen onto their seats — spin, overshoot, bounce.
 */
export function flyInFromOffscreen(
  els: Element[],
  opts?: { origin?: FlyOrigin; stagger?: number; delay?: number },
): Promise<void> {
  const nodes = els.filter((el): el is HTMLElement => el instanceof HTMLElement);
  if (!nodes.length) return Promise.resolve();
  if (prefersReducedMotion()) {
    for (const el of nodes) el.style.visibility = "";
    return Promise.resolve();
  }

  const origin = opts?.origin ?? "random";
  const stagger = opts?.stagger ?? 0.05;
  const baseDelay = opts?.delay ?? 0;

  return new Promise((resolve) => {
    let left = nodes.length;
    const done = () => {
      left--;
      if (left <= 0) resolve();
    };

    nodes.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        el.style.visibility = "";
        done();
        return;
      }
      const clone = snapshotCard(el, rect);
      const start = originDelta(rect, origin);
      const tl = gsap.timeline({
        delay: baseDelay + i * stagger,
        onComplete: () => {
          el.style.visibility = "visible";
          requestAnimationFrame(() => {
            clone.remove();
            done();
          });
        },
      });
      tl.fromTo(
        clone,
        {
          x: start.x,
          y: start.y,
          rotation: start.rot,
          scale: 0.38,
        },
        {
          x: start.x * 0.08,
          y: Math.min(-36, start.y * 0.08),
          rotation: start.rot * 0.12,
          scale: 1.22,
          duration: 0.3,
          ease: "power3.in",
          immediateRender: true,
        },
      );
      tl.to(clone, {
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        duration: 0.38,
        ease: "back.out(2.6)",
      });
      tl.to(clone, {
        y: -6,
        duration: 0.08,
        yoyo: true,
        repeat: 1,
        ease: "power1.out",
      });
      tl.to(
        clone,
        { filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.28))", duration: 0.18 },
        "<",
      );
    });
  });
}

/** Stop signs (and anything else) launch off-screen the same way cards slam in. */
export function flyOutOffscreen(
  els: Element[],
  opts?: { origin?: FlyOrigin; stagger?: number },
): Promise<void> {
  const nodes = els.filter((el): el is HTMLElement => el instanceof HTMLElement);
  if (!nodes.length) return Promise.resolve();
  if (prefersReducedMotion()) {
    for (const el of nodes) el.style.visibility = "hidden";
    return Promise.resolve();
  }
  const origin = opts?.origin ?? "random";
  const stagger = opts?.stagger ?? 0.04;

  return new Promise((resolve) => {
    let left = nodes.length;
    const done = () => {
      left--;
      if (left <= 0) resolve();
    };

    nodes.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        el.style.visibility = "hidden";
        done();
        return;
      }
      const clone = snapshotCard(el, rect);
      tweenOut(clone, rect, origin, i * stagger, () => {
        clone.remove();
        done();
      });
    });
  });
}

const STOP_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:70%;height:70%;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.45))">
  <path d="M8.1 2.2h7.8L21.8 8.1v7.8l-5.9 5.9H8.1L2.2 15.9V8.1L8.1 2.2z" fill="#d32f2a" stroke="#f4ece0" stroke-width="1.7" stroke-linejoin="round"/>
</svg>`;

function tweenOut(
  clone: HTMLElement,
  rect: DOMRect,
  origin: FlyOrigin,
  delay: number,
  onComplete: () => void,
) {
  const end = originDelta(rect, origin);
  const tl = gsap.timeline({ delay, onComplete });
  tl.to(clone, {
    y: -10,
    scale: 1.2,
    rotation: (Math.random() - 0.5) * 16,
    duration: 0.08,
    ease: "power2.out",
  });
  tl.to(clone, {
    x: end.x,
    y: end.y,
    rotation: end.rot,
    scale: 0.36,
    duration: 0.4,
    ease: "back.in(1.9)",
  });
}

/** Fly stop signs off the felt from last-known cell rects (works even if React already unmounted them). */
export function flyOutStopRects(
  rects: DOMRect[],
  opts?: { origin?: FlyOrigin; stagger?: number },
): Promise<void> {
  const usable = rects.filter((r) => r && r.width > 1 && r.height > 1);
  if (!usable.length) return Promise.resolve();
  if (prefersReducedMotion()) return Promise.resolve();
  const origin = opts?.origin ?? "random";
  const stagger = opts?.stagger ?? 0.04;

  return new Promise((resolve) => {
    let left = usable.length;
    const done = () => {
      left--;
      if (left <= 0) resolve();
    };
    usable.forEach((rect, i) => {
      const ghost = document.createElement("div");
      ghost.style.position = "fixed";
      ghost.style.left = `${rect.left}px`;
      ghost.style.top = `${rect.top}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.margin = "0";
      ghost.style.zIndex = "80";
      ghost.style.pointerEvents = "none";
      ghost.style.display = "grid";
      ghost.style.placeItems = "center";
      ghost.style.transformOrigin = "center center";
      ghost.innerHTML = STOP_SVG;
      document.body.appendChild(ghost);
      tweenOut(ghost, rect, origin, i * stagger, () => {
        ghost.remove();
        done();
      });
    });
  });
}

/**
 * Player-placed card lands on the felt in place — overshoot, tilt, micro bounce.
 * Does not hide the card or fly it from off-screen.
 */
export function placePop(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return;
  el.style.visibility = "";
  if (prefersReducedMotion()) return;
  const tilt = (Math.random() - 0.5) * 10;
  gsap.killTweensOf(el);
  const tl = gsap.timeline({ defaults: { transformOrigin: "50% 50%" } });
  tl.fromTo(
    el,
    { scale: 1.18, y: -10, rotation: tilt },
    {
      scale: 1,
      y: 0,
      rotation: 0,
      duration: 0.32,
      ease: "back.out(2.6)",
    },
  );
  tl.to(el, {
    y: -3,
    duration: 0.07,
    yoyo: true,
    repeat: 1,
    ease: "power1.out",
  });
}

export function selectPulse(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { scale: 1 }, { scale: 1.08, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
}

/** How-to ticks fly in from the top, crosses from below — same slam as the cards. */
export function teachMarkIn(els: Element[]) {
  const nodes = els.filter((el): el is HTMLElement => el instanceof HTMLElement);
  if (!nodes.length) return Promise.resolve();
  for (const el of nodes) el.style.visibility = "hidden";
  if (prefersReducedMotion()) {
    for (const el of nodes) el.style.visibility = "";
    return Promise.resolve();
  }
  const ok = nodes.filter((el) => el.getAttribute("aria-label")?.toLowerCase().includes("correct"));
  const bad = nodes.filter((el) => !ok.includes(el));
  return Promise.all([
    flyInFromOffscreen(ok, { origin: "top", stagger: 0.07, delay: 0.28 }),
    flyInFromOffscreen(bad, { origin: "bottom", stagger: 0.07, delay: 0.28 }),
  ]).then(() => undefined);
}

/** Hand tray cards dealing in from below the screen. */
export function dealIn(els: Element[]) {
  return flyInFromOffscreen(els, { origin: "bottom", stagger: 0.055 });
}

/** Pre-placed / fixed cards fly onto the felt from around the table. */
export function boardDealIn(els: Element[]) {
  return flyInFromOffscreen(els, { origin: "random", stagger: 0.048 });
}

export function fixedDealIn(els: Element[]) {
  return flyInFromOffscreen(els, { origin: "random", stagger: 0.048 });
}

/**
 * FLIP-style reorganisation of the bottom hand tray when cards re-sort Ace-high.
 */
export function trayReorg(
  els: HTMLElement[],
  prevRects: Map<string, DOMRect>,
): Map<string, DOMRect> {
  const nextRects = new Map<string, DOMRect>();
  if (!els.length) return nextRects;

  for (const el of els) {
    const id = el.dataset.cardId;
    if (!id) continue;
    nextRects.set(id, el.getBoundingClientRect());
  }

  if (prefersReducedMotion() || prevRects.size === 0) return nextRects;

  els.forEach((el, i) => {
    const id = el.dataset.cardId;
    if (!id) return;
    const old = prevRects.get(id);
    const neu = nextRects.get(id);
    if (!old || !neu) return;
    const dx = old.left - neu.left;
    const dy = old.top - neu.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    gsap.killTweensOf(el);
    gsap.fromTo(
      el,
      { x: dx, y: dy },
      {
        x: 0,
        y: 0,
        duration: 0.38,
        delay: i * 0.012,
        ease: "back.out(1.35)",
      },
    );
  });

  return nextRects;
}

/**
 * Two cards leap past each other (or one card flies home) along a short arc.
 * `node` is the live element already at `to`; it is hidden for the flight.
 */
export function cardSwapFly(
  shots: { node: HTMLElement; from: DOMRect; to: DOMRect }[],
): Promise<void> {
  const usable = shots.filter((s) => {
    const dx = s.to.left - s.from.left;
    const dy = s.to.top - s.from.top;
    return Math.hypot(dx, dy) > 2 || Math.abs(s.to.width - s.from.width) > 1;
  });
  if (!usable.length) return Promise.resolve();
  if (prefersReducedMotion()) return Promise.resolve();

  return new Promise((resolve) => {
    const clones: HTMLElement[] = [];
    const tl = gsap.timeline({
      onComplete: () => {
        for (const c of clones) c.remove();
        resolve();
      },
    });

    usable.forEach((shot, i) => {
      const clone = shot.node.cloneNode(true) as HTMLElement;
      clone.style.position = "fixed";
      clone.style.left = `${shot.from.left}px`;
      clone.style.top = `${shot.from.top}px`;
      clone.style.width = `${shot.from.width}px`;
      clone.style.height = `${shot.from.height}px`;
      clone.style.margin = "0";
      clone.style.zIndex = String(88 + i);
      clone.style.pointerEvents = "none";
      clone.style.transformOrigin = "center center";
      clone.style.filter = "drop-shadow(0 10px 14px rgba(0,0,0,0.45))";
      document.body.appendChild(clone);
      clones.push(clone);
      shot.node.style.visibility = "hidden";

      const dx = shot.to.left - shot.from.left;
      const dy = shot.to.top - shot.from.top;
      const dist = Math.hypot(dx, dy);
      const arc = (i % 2 === 0 ? -1 : 1) * Math.min(56, Math.max(24, dist * 0.28));

      tl.fromTo(
        clone,
        { x: 0, y: 0, width: shot.from.width, height: shot.from.height, rotation: 0, scale: 1 },
        {
          keyframes: [
            {
              x: dx * 0.5,
              y: dy * 0.5 + arc,
              rotation: i % 2 === 0 ? 18 : -18,
              scale: 1.16,
              duration: 0.22,
              ease: "power2.out",
            },
            {
              x: dx,
              y: dy,
              width: shot.to.width,
              height: shot.to.height,
              rotation: 0,
              scale: 1,
              duration: 0.34,
              ease: "back.out(1.75)",
            },
          ],
        },
        0,
      );
    });
  });
}

/**
 * Wrong-seat reject: cards shudder on the felt, then get flung into the hand.
 */
export function rejectFlyHome(
  shots: { node: HTMLElement; from: DOMRect; to: DOMRect }[],
): Promise<void> {
  const usable = shots.filter((s) => s.node && s.from && s.to);
  if (!usable.length) return Promise.resolve();
  if (prefersReducedMotion()) {
    for (const s of usable) s.node.style.visibility = "";
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let left = usable.length;
    const done = () => {
      left--;
      if (left <= 0) resolve();
    };

    usable.forEach((shot, i) => {
      const clone = shot.node.cloneNode(true) as HTMLElement;
      clone.style.position = "fixed";
      clone.style.left = `${shot.from.left}px`;
      clone.style.top = `${shot.from.top}px`;
      clone.style.width = `${shot.from.width}px`;
      clone.style.height = `${shot.from.height}px`;
      clone.style.margin = "0";
      clone.style.zIndex = String(92 + i);
      clone.style.pointerEvents = "none";
      clone.style.transformOrigin = "center center";
      clone.style.animation = "none";
      clone.style.filter = "drop-shadow(0 10px 12px rgba(0,0,0,0.4))";
      document.body.appendChild(clone);
      shot.node.style.visibility = "hidden";

      const dx = shot.to.left - shot.from.left;
      const dy = shot.to.top - shot.from.top;
      const spin = 320 + Math.random() * 160;
      const lift = -(90 + Math.random() * 70);
      const tl = gsap.timeline({
        delay: i * 0.07,
        onComplete: () => {
          clone.remove();
          shot.node.style.visibility = "";
          done();
        },
      });
      tl.to(clone, { x: 11, rotation: -16, duration: 0.045, ease: "power1.inOut" });
      tl.to(clone, { x: -13, rotation: 18, duration: 0.045, ease: "power1.inOut" });
      tl.to(clone, { x: 8, rotation: -10, duration: 0.04, ease: "power1.inOut" });
      tl.to(clone, { x: -6, rotation: 8, duration: 0.04, ease: "power1.inOut" });
      tl.to(clone, {
        x: dx * 0.32,
        y: lift,
        rotation: spin * 0.45,
        scale: 1.28,
        filter: "drop-shadow(0 28px 22px rgba(0,0,0,0.55))",
        duration: 0.28,
        ease: "power3.out",
      });
      tl.to(clone, {
        x: dx,
        y: dy,
        rotation: spin,
        scale: 1,
        width: shot.to.width,
        height: shot.to.height,
        duration: 0.48,
        ease: "back.out(2.1)",
      });
      tl.to(clone, {
        y: dy - 7,
        duration: 0.08,
        yoyo: true,
        repeat: 1,
        ease: "power1.out",
      });
      tl.to(
        clone,
        { filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.28))", duration: 0.16 },
        "<",
      );
    });
  });
}

export function fadeSlideIn(el: Element | null, y = 18) {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0 });
    return;
  }
  gsap.fromTo(el, { opacity: 1, y }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" });
}

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

/** Soft settle used when a player places a card onto the board (kept for callers). */
export function popIn(el: Element | null) {
  placePop(el);
}

/**
 * Player-placed card landing on the felt — heavier drop with overshoot + slight tilt.
 * Distinct from fixedDealIn so you can feel the difference between your move and
 * cards that were already on the table.
 */
export function placePop(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  const tilt = (Math.random() - 0.5) * 8;
  gsap.killTweensOf(el);
  const tl = gsap.timeline({ defaults: { transformOrigin: "50% 50%" } });
  tl.fromTo(
    el,
    { scale: 1.22, y: -14, rotation: tilt },
    {
      scale: 1,
      y: 0,
      rotation: 0,
      duration: 0.36,
      ease: "back.out(2.8)",
    },
  );
  // micro second-bounce so it feels like it hit the felt
  tl.to(el, {
    y: -3,
    duration: 0.08,
    yoyo: true,
    repeat: 1,
    ease: "power1.out",
  });
}

export function selectPulse(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { scale: 1 }, { scale: 1.08, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
}

/** Hand tray cards dealing in at the start of a table. */
export function dealIn(els: Element[]) {
  if (!els.length || prefersReducedMotion()) return;
  gsap.fromTo(
    els,
    { opacity: 0, y: 28, scale: 0.7, rotation: -8 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      rotation: 0,
      duration: 0.4,
      stagger: 0.045,
      ease: "back.out(1.7)",
    },
  );
}

/**
 * Pre-placed / fixed cards already on the board at deal-in.
 * Soft fade + gentle settle — no big overshoot so they feel “already there”.
 */
export function boardDealIn(els: Element[]) {
  fixedDealIn(els);
}

export function fixedDealIn(els: Element[]) {
  if (!els.length || prefersReducedMotion()) return;
  gsap.fromTo(
    els,
    { opacity: 0, y: -8, scale: 0.88 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.36,
      stagger: 0.018,
      ease: "power2.out",
    },
  );
}

/**
 * FLIP-style reorganisation of the bottom hand tray when cards re-sort
 * (Ace-high after a place / bounce-back / undo). Cards slide into their
 * new slots instead of snapping.
 *
 * Call after React has painted the new order, passing the current tray
 * card elements. Pass a Map of previous getBoundingClientRect() values
 * keyed by data-card-id.
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

export function fadeSlideIn(el: Element | null, y = 18) {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0 });
    return;
  }
  gsap.fromTo(el, { opacity: 0, y }, { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" });
}

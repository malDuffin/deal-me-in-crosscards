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

export function popIn(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    { scale: 0.72, y: 8 },
    { scale: 1, y: 0, duration: 0.38, ease: "back.out(2.2)" },
  );
}

export function selectPulse(el: Element | null) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { scale: 1 }, { scale: 1.08, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
}

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

export function boardDealIn(els: Element[]) {
  if (!els.length || prefersReducedMotion()) return;
  gsap.fromTo(
    els,
    { opacity: 0, scale: 0.4 },
    { opacity: 1, scale: 1, duration: 0.32, stagger: 0.012, ease: "back.out(1.5)" },
  );
}

export function fadeSlideIn(el: Element | null, y = 18) {
  if (!el) return;
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1, y: 0 });
    return;
  }
  gsap.fromTo(el, { opacity: 0, y }, { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" });
}

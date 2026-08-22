import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

export const GA_MEASUREMENT_ID = "G-ENJ70B41QM";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Sends a GA4 page_view on every client route change (SPA). */
export function GoogleAnalytics() {
  const href = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: window.location.pathname + window.location.search,
    });
  }, [href]);

  return null;
}

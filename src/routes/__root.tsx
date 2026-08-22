import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { SettingsSync } from "@/components/game/SettingsSync";
import { GA_MEASUREMENT_ID, GoogleAnalytics } from "@/components/GoogleAnalytics";
import appCss from "../styles.css?url";

const APP_NAME = "CrossCards";

function ViewportLock() {
  useEffect(() => {
    const canScroll = (target: EventTarget | null) => {
      let n: HTMLElement | null = target instanceof HTMLElement ? target : null;
      while (n && n !== document.documentElement) {
        const style = window.getComputedStyle(n);
        const y = style.overflowY;
        const x = style.overflowX;
        if ((y === "auto" || y === "scroll") && n.scrollHeight > n.clientHeight + 1) return true;
        if ((x === "auto" || x === "scroll") && n.scrollWidth > n.clientWidth + 1) return true;
        n = n.parentElement;
      }
      return false;
    };
    const onMove = (e: TouchEvent) => {
      if (!canScroll(e.target)) e.preventDefault();
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    return () => document.removeEventListener("touchmove", onMove);
  }, []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0b120e" },
      {
        name: "description",
        content: "Place cards on a grid to form poker hands in rows and columns.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://www.googletagmanager.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
    scripts: [
      {
        src: "/vendor/cardmeister/elements.cardmeister.full.js",
      },
      {
        async: true,
        src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
      },
      {
        children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });`,
      },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ViewportLock />
        <PreviewHostBridge />
        <SettingsSync />
        <GoogleAnalytics />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});

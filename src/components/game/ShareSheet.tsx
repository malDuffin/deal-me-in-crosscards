import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";
import { renderSVG } from "uqr";
import gsap from "gsap";
import { prefersReducedMotion } from "@/lib/game/juice";
import { Button } from "@/components/ui/button";

export function ShareSheet({
  open,
  onClose,
  url,
  title,
  blurb,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  blurb: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [liveUrl, setLiveUrl] = useState("");

  useEffect(() => {
    setLiveUrl(url);
  }, [url]);

  const qrSrc = useMemo(() => {
    if (!liveUrl) return "";
    try {
      const svg = renderSVG(liveUrl, {
        pixelSize: 4,
        border: 2,
        whiteColor: "#efe7d6",
        blackColor: "#12140f",
      });
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    } catch {
      return "";
    }
  }, [liveUrl]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open, url]);

  useEffect(() => {
    const panel = panelRef.current;
    const sheet = sheetRef.current;
    if (!panel || !sheet) return;
    if (open) {
      panel.style.display = "flex";
      if (prefersReducedMotion()) {
        panel.style.opacity = "1";
        sheet.style.transform = "translateY(0)";
        return;
      }
      gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(sheet, { y: 72 }, { y: 0, duration: 0.34, ease: "power3.out" });
    } else if (panel.style.display === "flex") {
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
    }
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl || url);
      setCopied(true);
    } catch {
      const input = document.getElementById("share-url") as HTMLInputElement | null;
      input?.select();
    }
  };

  const nativeShare = async () => {
    const href = liveUrl || url;
    try {
      if (navigator.share) {
        await navigator.share({ title, url: href, text: blurb });
        return;
      }
    } catch {
      /* user cancelled */
    }
    await copy();
  };

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 hidden items-end justify-center bg-bg/70 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className="max-h-[min(92dvh,680px)] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-border bg-surface p-5 pb-10 sm:rounded-[28px]"
      >
        <div className="mb-1 flex items-center justify-center gap-2 text-gold">
          <QrCode className="size-5" />
        </div>
        <h2 className="mb-1 text-center font-display text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mb-4 text-center text-sm text-fg-muted">{blurb}</p>

        {qrSrc ? (
          <div className="mx-auto mb-4 grid size-52 place-items-center rounded-2xl bg-cream p-3">
            <img src={qrSrc} alt="QR code for this table" className="size-full" />
          </div>
        ) : liveUrl ? (
          <p className="mb-4 text-center text-sm text-fg-muted">
            This table is too dense for a QR code — copy the link instead.
          </p>
        ) : (
          <div className="mx-auto mb-4 size-52 rounded-2xl bg-cream/40" />
        )}

        <label className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-fg-subtle">
          Link
        </label>
        <input
          id="share-url"
          readOnly
          value={liveUrl}
          className="mb-4 h-11 w-full truncate rounded-xl border border-border bg-bg/60 px-3 text-sm text-fg"
          onFocus={(e) => e.currentTarget.select()}
        />

        <div className="flex flex-col gap-2">
          <Button onClick={() => void nativeShare()}>Share</Button>
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

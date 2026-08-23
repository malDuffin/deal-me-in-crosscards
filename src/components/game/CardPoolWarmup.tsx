import { useEffect } from "react";
import { ensureCardPool } from "@/lib/game/card-pool";
import { useSettings } from "@/lib/game/settings";

/** Build the 52-card visual pool at startup and whenever card looks change. */
export function CardPoolWarmup() {
  const style = useSettings((s) => s.cardStyle);
  const colorblind = useSettings((s) => s.colorblind);
  useEffect(() => {
    ensureCardPool(style, colorblind);
  }, [style, colorblind]);
  return null;
}

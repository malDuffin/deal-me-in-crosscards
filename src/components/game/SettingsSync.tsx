import { useEffect } from "react";
import { applyAudioPrefs, attachUiSounds } from "@/lib/game/audio";
import { useSettings } from "@/lib/game/settings";

export function SettingsSync() {
  const colorblind = useSettings((s) => s.colorblind);
  const muted = useSettings((s) => s.muted);
  const music = useSettings((s) => s.music);

  useEffect(() => {
    document.body.classList.toggle("colorblind", colorblind);
  }, [colorblind]);

  useEffect(() => {
    applyAudioPrefs(muted, music);
  }, [muted, music]);

  useEffect(() => {
    attachUiSounds();
  }, []);

  return null;
}

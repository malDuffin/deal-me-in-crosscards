let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;
let muted = false;
let musicOn = true;
let clickHooked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.5;
    sfx.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
  if (musicOn && !muted) startMusic();
}

export function applyAudioPrefs(nextMuted: boolean, nextMusic: boolean) {
  muted = nextMuted;
  musicOn = nextMusic;
  const c = getCtx();
  if (!c || !master || !musicGain) return;
  master.gain.setValueAtTime(muted ? 0 : 1, c.currentTime);
  if (musicOn && !muted) startMusic();
  else stopMusic();
}

function beep(freq: number, dur: number, type: OscillatorType, gain = 0.05, at = 0) {
  const c = getCtx();
  if (!c || !sfx || muted) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfx);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.08) {
  const c = getCtx();
  if (!c || !sfx || muted) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 1600;
  src.connect(f);
  f.connect(g);
  g.connect(sfx);
  src.start();
}

export function playClick(): void {
  beep(880, 0.035, "square", 0.035);
  beep(1240, 0.025, "square", 0.02, 0.025);
}

export function playSelect(): void {
  beep(540, 0.07, "triangle", 0.07);
  beep(810, 0.09, "sine", 0.045, 0.04);
}

export function playPlace(): void {
  noise(0.05, 0.07);
  beep(240, 0.1, "triangle", 0.09);
  beep(360, 0.07, "sine", 0.04, 0.04);
}

export function playDeal(): void {
  noise(0.03, 0.04);
  beep(380 + Math.random() * 180, 0.05, "triangle", 0.04);
}

export function playHand(): void {
  const notes = [523, 659, 784, 1046];
  notes.forEach((f, i) => beep(f, 0.16, "sine", 0.07, i * 0.06));
}

export function playWin(): void {
  [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, 0.28, "triangle", 0.08, i * 0.09));
}

export function playWhoosh(): void {
  noise(0.18, 0.1);
  beep(170, 0.22, "sawtooth", 0.03);
}

export function playBounce(): void {
  beep(160, 0.05, "triangle", 0.06);
}

function startMusic() {
  const c = getCtx();
  if (!c || !musicGain || musicTimer != null || muted || !musicOn) return;
  musicGain.gain.setTargetAtTime(0.11, c.currentTime, 0.4);
  const notes = [130.81, 164.81, 196.0, 246.94, 261.63, 196.0, 164.81, 146.83];
  const beat = 0.58;
  const tick = () => {
    if (!ctx || !musicGain || muted || !musicOn) return;
    const f = notes[musicStep % notes.length];
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.9);
    o.connect(g);
    g.connect(musicGain);
    o.start();
    o.stop(t + beat);
    if (musicStep % 4 === 0) {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "triangle";
      o2.frequency.value = f / 2;
      g2.gain.setValueAtTime(0.018, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + beat * 3.2);
      o2.connect(g2);
      g2.connect(musicGain);
      o2.start();
      o2.stop(t + beat * 3.2);
    }
    musicStep++;
  };
  tick();
  musicTimer = window.setInterval(tick, beat * 1000);
}

function stopMusic() {
  if (musicTimer != null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  const c = getCtx();
  if (c && musicGain) musicGain.gain.setTargetAtTime(0, c.currentTime, 0.25);
}

export function attachUiSounds() {
  if (clickHooked || typeof document === "undefined") return;
  clickHooked = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("button, a[href], [role='button']")) {
        unlockAudio();
        playClick();
      }
    },
    { capture: true },
  );
}

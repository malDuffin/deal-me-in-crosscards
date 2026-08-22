let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let musicGain: GainNode | null = null;
let loungeBus: GainNode | null = null;
let loungeFilter: BiquadFilterNode | null = null;
let musicTimer: number | null = null;
let musicGen = 0;
let musicNext = 0;
let musicBar = 0;
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

export function warmAudio(): void {
  getCtx();
}

export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
  if (musicOn && !muted && musicTimer == null) {
    window.setTimeout(() => {
      if (musicOn && !muted && musicTimer == null) startMusic();
    }, 120);
  }
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
  noise(0.12, 0.09);
  beep(220, 0.09, "square", 0.07);
  beep(146, 0.16, "triangle", 0.08, 0.07);
  beep(98, 0.2, "sawtooth", 0.04, 0.14);
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Slow F-major lounge: Fmaj7 – Dm7 – Gm7 – C9, twice. */
const LOUNGE_CHORDS: number[][] = [
  [53, 57, 60, 64], // Fmaj7
  [50, 53, 57, 60], // Dm7
  [55, 58, 62, 65], // Gm7
  [48, 52, 55, 58, 62], // C9
  [53, 57, 60, 64, 69], // Fmaj9
  [50, 53, 57, 60], // Dm7
  [55, 58, 62, 65], // Gm7
  [48, 52, 55, 58], // C7
];

const LOUNGE_BASS = [41, 38, 43, 36, 41, 38, 43, 36]; // F2 D2 G2 C2

/** Sparse vibes phrases: [beatOffset, midi, durationBeats][] per bar. */
const LOUNGE_LEAD: [number, number, number][][] = [
  [[2.0, 72, 1.6]],
  [[0.5, 69, 1.2], [2.5, 74, 1.1]],
  [],
  [[1.0, 67, 1.0], [3.0, 65, 0.9]],
  [[0.5, 72, 1.4], [2.5, 76, 1.2]],
  [[1.5, 69, 2.0]],
  [[0.0, 74, 1.5]],
  [[1.0, 72, 0.8], [2.0, 70, 0.7], [3.0, 69, 1.0]],
];

const BPM = 74;
const BEAT = 60 / BPM;

function makeImpulse(c: AudioContext, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  return buf;
}

function ensureLounge(c: AudioContext) {
  if (loungeFilter || !musicGain) return;
  loungeFilter = c.createBiquadFilter();
  loungeFilter.type = "lowpass";
  loungeFilter.frequency.value = 1950;
  loungeFilter.Q.value = 0.32;
  const dry = c.createGain();
  dry.gain.value = 0.7;
  const wet = c.createGain();
  wet.gain.value = 0.42;
  const conv = c.createConvolver();
  conv.buffer = makeImpulse(c, 1.85);
  loungeFilter.connect(dry);
  loungeFilter.connect(conv);
  conv.connect(wet);
  dry.connect(musicGain);
  wet.connect(musicGain);
}

function out(): AudioNode | null {
  return loungeBus;
}

function env(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak * 0.72, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(
  freq: number,
  t: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  attack: number,
  detune = 0,
) {
  const c = ctx;
  const dest = out();
  if (!c || !dest) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.setValueAtTime(detune, t);
  env(g, t, peak, attack, dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function playRhodes(notes: number[], t: number, dur: number) {
  for (const n of notes) {
    const f = midi(n);
    tone(f, t, dur, "sine", 0.028, 0.07);
    tone(f, t, dur, "triangle", 0.014, 0.08, 6);
    tone(f * 2, t, 0.11, "sine", 0.01, 0.008); // tine
  }
}

function playBass(n: number, t: number, dur: number) {
  const f = midi(n);
  tone(f, t, dur, "sine", 0.07, 0.03);
  tone(f, t, dur, "triangle", 0.018, 0.04);
}

function playLead(n: number, t: number, dur: number) {
  const f = midi(n);
  tone(f, t, dur, "sine", 0.045, 0.02);
  tone(f, t, dur, "triangle", 0.012, 0.03, 5);
}

function playBrush(t: number, vol: number) {
  const c = ctx;
  const dest = out();
  if (!c || !dest) return;
  const len = Math.floor(c.sampleRate * 0.07);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 2400;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.08);
}

function scheduleBar(bar: number, when: number) {
  const i = bar % LOUNGE_CHORDS.length;
  const chord = LOUNGE_CHORDS[i];
  playRhodes(chord, when, BEAT * 3.7);
  playBass(LOUNGE_BASS[i], when, BEAT * 1.9);
  playBass(LOUNGE_BASS[i] + (i % 2 === 0 ? 7 : 12), when + BEAT * 2, BEAT * 1.8);
  playBrush(when + BEAT, 0.016);
  playBrush(when + BEAT * 3, 0.012);
  for (const [off, note, dur] of LOUNGE_LEAD[i]) {
    playLead(note, when + off * BEAT + (Math.random() - 0.5) * 0.012, dur * BEAT);
  }
}

function startMusic() {
  const c = getCtx();
  if (!c || !musicGain || musicTimer != null || muted || !musicOn) return;
  ensureLounge(c);
  if (!loungeFilter) return;
  if (loungeBus) {
    const old = loungeBus;
    old.gain.setTargetAtTime(0, c.currentTime, 0.08);
    window.setTimeout(() => {
      try {
        old.disconnect();
      } catch {
        /* already gone */
      }
    }, 500);
  }
  loungeBus = c.createGain();
  loungeBus.gain.value = 1;
  loungeBus.connect(loungeFilter);
  musicGain.gain.setTargetAtTime(0.16, c.currentTime, 0.6);
  const gen = musicGen;
  musicBar = 0;
  musicNext = c.currentTime + 0.12;
  const tick = () => {
    if (gen !== musicGen || !ctx || muted || !musicOn) return;
    const horizon = ctx.currentTime + 0.95;
    while (musicNext < horizon) {
      scheduleBar(musicBar, Math.max(musicNext, ctx.currentTime + 0.04));
      musicNext += BEAT * 4;
      musicBar++;
    }
  };
  tick();
  musicTimer = window.setInterval(tick, 180);
}

function stopMusic() {
  musicGen++;
  if (musicTimer != null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  const c = getCtx();
  if (c && musicGain) musicGain.gain.setTargetAtTime(0, c.currentTime, 0.28);
  if (c && loungeBus) loungeBus.gain.setTargetAtTime(0, c.currentTime, 0.2);
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

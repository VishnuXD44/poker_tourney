/**
 * Table sound effects, synthesised with Web Audio: no files to download, nothing for the
 * CSP to allow. Browsers only start audio after a user gesture, so the context is created
 * on the first click or key press. Muting is remembered per browser.
 */
const MUTE_KEY = "poker-sound-muted";
let ctx = null;
let muted = false;
try {
  muted = typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
} catch {}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {}
}

function out(when) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.connect(ctx.destination);
  return g;
}

/** A pitched blip with a fast attack and exponential decay. */
function tone(freq, { at = 0, dur = 0.12, type = "sine", gain = 0.12, to } = {}) {
  const when = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = out(when);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, when + dur);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

/** Filtered noise: card slides, swishes and chip rattles. */
function noise({ at = 0, dur = 0.08, gain = 0.15, freq = 3000, q = 1, type = "bandpass", sweepTo } = {}) {
  const when = ctx.currentTime + at;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, when);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, when + dur);
  const g = out(when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filter).connect(g);
  src.start(when);
}

const chipClack = (at) => {
  tone(2400 + Math.random() * 600, { at, dur: 0.05, type: "triangle", gain: 0.06 });
  noise({ at, dur: 0.04, freq: 5000, q: 4, gain: 0.08 });
};

const EFFECTS = {
  deal: () => [0, 0.09, 0.18, 0.27].forEach((at) => noise({ at, dur: 0.07, freq: 2500, q: 0.8, gain: 0.12, sweepTo: 1200 })),
  card: () => noise({ dur: 0.09, freq: 2200, q: 0.8, gain: 0.14, sweepTo: 900 }),
  check: () => [0, 0.11].forEach((at) => tone(150, { at, dur: 0.07, type: "sine", gain: 0.25, to: 90 })),
  chip: () => [0, 0.05].forEach(chipClack),
  raise: () => [0, 0.04, 0.09, 0.13].forEach(chipClack),
  allin: () => {
    for (let i = 0; i < 9; i++) chipClack(i * 0.035 + Math.random() * 0.01);
    tone(220, { at: 0.05, dur: 0.35, type: "sawtooth", gain: 0.03, to: 440 });
  },
  fold: () => noise({ dur: 0.22, freq: 1800, q: 0.6, gain: 0.1, sweepTo: 400 }),
  turn: () => [
    [660, 0],
    [880, 0.12],
  ].forEach(([f, at]) => tone(f, { at, dur: 0.25, type: "sine", gain: 0.12 })),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.3, type: "triangle", gain: 0.1 })),
  lose: () => [392, 330].forEach((f, i) => tone(f, { at: i * 0.14, dur: 0.3, type: "sine", gain: 0.08 })),
  chat: () => tone(1200, { dur: 0.08, type: "sine", gain: 0.05 }),
};

/** Plays a named effect if sound is on and the browser has allowed audio. */
export function play(name) {
  if (muted || !ctx || ctx.state !== "running") return;
  try {
    EFFECTS[name]?.();
  } catch {}
}

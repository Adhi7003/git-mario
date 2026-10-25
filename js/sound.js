// Tiny 8-bit sound effects generated with WebAudio (no audio files).
let ctx = null;
export const sound = { on: true };

function tone(freq, start, dur, type = 'square', vol = 0.06) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

const SFX = {
  coin: () => { tone(988, 0, 0.08); tone(1319, 0.08, 0.3); },
  goal: () => { tone(784, 0, 0.07); tone(1047, 0.07, 0.07); tone(1319, 0.14, 0.2); },
  error: () => { tone(196, 0, 0.12, 'triangle', 0.08); tone(147, 0.1, 0.2, 'triangle', 0.08); },
  clear: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.16)),
  pipe: () => [600, 450, 330, 250].forEach((f, i) => tone(f, i * 0.06, 0.08, 'square', 0.05)),
  bowser: () => [110, 104, 98].forEach((f, i) => tone(f, i * 0.12, 0.18, 'sawtooth', 0.05)),
};

export function play(name) {
  if (!sound.on || !SFX[name]) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    SFX[name]();
  } catch { /* audio unavailable */ }
}

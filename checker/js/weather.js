// Organic lighting "weather": slowly wanders between the three reference moods.
// Nothing here is driven by the user; it is a function of time only.

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// Three moods, one per reference image.
const MOODS = [
  { // 1: saturated blue sky, hot-pink streaks, pink sun, cream/black cloth
    skyTop: hex(0x1d7fc0), skyMid: hex(0x2e86c2), horizon: hex(0xe85a78),
    cloud: hex(0xf04a6c), cloudCover: 0.55,
    sunA: hex(0xf5506c), sunB: hex(0xf04a68),
    clothLight: hex(0xece0d2), clothDark: hex(0x0c110d),
    hill: hex(0x3a2a34), hills: 0.15, haze: hex(0xe7889a),
    shadowTint: hex(0x3a3550), sunRadius: 0.135,
  },
  { // 2: dusky blue over pink banded sky, orange-to-red sun, dark hills
    skyTop: hex(0x3c62a6), skyMid: hex(0x6f6aa8), horizon: hex(0xf06a80),
    cloud: hex(0xf2667c), cloudCover: 0.7,
    sunA: hex(0xf8a83a), sunB: hex(0xee4f3e),
    clothLight: hex(0xe8d9c6), clothDark: hex(0x0d0e0b),
    hill: hex(0x232325), hills: 1.0, haze: hex(0xe48c8e),
    shadowTint: hex(0x40304a), sunRadius: 0.11,
  },
  { // 3: clear blue, peach horizon, tan clouds, coral sun, pink cloth
    skyTop: hex(0x2a5aa6), skyMid: hex(0x5a7aa8), horizon: hex(0xe9a678),
    cloud: hex(0xc99a64), cloudCover: 0.35,
    sunA: hex(0xf27058), sunB: hex(0xef5c48),
    clothLight: hex(0xf3a2ab), clothDark: hex(0x0d0a0b),
    hill: hex(0x2a2a22), hills: 0.85, haze: hex(0xd9a083),
    shadowTint: hex(0x4a2c3c), sunRadius: 0.12,
  },
];

const KEYS = Object.keys(MOODS[0]);

// Smooth pseudo-random wander made of incommensurate sines.
const wander = (t, a, b, c) =>
  (Math.sin(t * a) + 0.6 * Math.sin(t * b + 1.7) + 0.35 * Math.sin(t * c + 4.1)) / 1.95;

export class Weather {
  constructor() {
    const q = new URLSearchParams(location.search);
    this.speed = parseFloat(q.get('speed') || '1');
    this.t = q.has('t') ? parseFloat(q.get('t')) : 8 + Math.random() * 20;
    this.state = {};
    for (const k of KEYS) this.state[k] = Array.isArray(MOODS[0][k]) ? [0, 0, 0] : 0;
    this.weights = [1, 0, 0];
    this.sunDir = [0, 0.1, -1];
    this.azScale = 1; // narrowed on portrait screens so the sun stays in frame
    this.update(0);
  }

  update(dt) {
    this.t += dt * this.speed;
    const t = this.t;
    // Mood phase: one full lap through the three moods takes ~4 minutes,
    // its pace breathing so the moods linger and the transitions drift.
    const lap = 240;
    const p = t / lap + 0.03 * Math.sin(t / 23.0) + 0.02 * Math.sin(t / 9.7);
    const w = [0, 0, 0];
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      let d = ((p - k / 3) % 1 + 1) % 1;
      if (d > 0.5) d -= 1;
      const v = Math.exp(-(d * d) / (2 * 0.085 * 0.085));
      w[k] = v; sum += v;
    }
    for (let k = 0; k < 3; k++) w[k] /= sum;
    this.weights = w;

    for (const key of KEYS) {
      const a = MOODS[0][key];
      if (Array.isArray(a)) {
        const out = this.state[key];
        for (let c = 0; c < 3; c++)
          out[c] = MOODS[0][key][c] * w[0] + MOODS[1][key][c] * w[1] + MOODS[2][key][c] * w[2];
      } else {
        this.state[key] = MOODS[0][key] * w[0] + MOODS[1][key] * w[1] + MOODS[2][key] * w[2];
      }
    }

    // Sun drifts across the right half of the sky and rises / sinks slowly.
    const az = (0.36 + 0.16 * wander(t, 1 / 61, 1 / 37, 1 / 17)) * this.azScale; // radians right of centre
    const el = 0.105 + 0.085 * wander(t + 40, 1 / 47, 1 / 29, 1 / 13); // above horizon
    const ce = Math.cos(el);
    this.sunDir = [Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce];
    this.sunEl = el;
    // 0 when the sun is touching the hills, 1 when it is high.
    this.light = Math.min(1, Math.max(0, (el + 0.02) / 0.22));
    this.cloudDrift = t * 0.004;
    this.wind = [wander(t, 1 / 11, 1 / 7, 1 / 3.3), wander(t + 9, 1 / 13, 1 / 5, 1 / 2.9)];
  }
}

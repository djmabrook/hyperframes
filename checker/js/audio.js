// audio.js — meditative, synthesized interactive sound for the checker cloth piece.
// Plain Web Audio, no dependencies. The note voice is swappable at runtime:
// built-in synth presets plus optional user samples listed in ../tones/tones.json.

// ---- Tuning constants -------------------------------------------------------
const ROOT_MIDI = 50;            // D3 — base of the note range
const RANGE_SEMIS = 30;          // ~2.5 octaves above the base
const MAX_VOICES = 14;
const NOTE_LEVEL = 0.32;         // per-voice peak scale (vel * NOTE_LEVEL)
const MASTER_LEVEL = 0.85;
const MUTE_TAU = 0.2;            // setTargetAtTime constant: ~0.6 s to settle

const DRONE_PEAK = 0.0316;       // ~ -30 dBFS
const DRONE_FADE_IN = 6.0;       // seconds
const DRONE_LFO_HZ = 0.055;      // slow breath (~18 s)

const REVERB_SECONDS = 5.6;
const REVERB_SEND = 0.55;
const DRY_LEVEL = 0.7;
const DELAY_TIME = 0.38;
const DELAY_FEEDBACK = 0.3;
const DELAY_SEND = 0.16;
const DELAY_LP = 2000;

const HOVER_MIN_INTERVAL = 0.28; // seconds
const HOVER_SKIP = 0.35;         // probability a hover note is skipped
const DRAG_MIN_INTERVAL = 0.07;
const PRESS_MIN_INTERVAL = 0.4;

// Scales by mood (semitones above D)
const SCALES = [
  [0, 2, 4, 7, 9],    // mood0: major pentatonic
  [0, 4, 6, 7, 11],   // mood1: lydian flavoured
  [0, 3, 5, 7, 10],   // mood2: minor / dorian pentatonic
];
// FM timbre per mood
const MOD_RATIO = [3.5, 2.0, 1.0];     // glassy, warm, round
const MOD_INDEX = [1.5, 2.1, 0.9];     // base modulation index
const SHIMMER_RATIO = [4.0, 3.0, 2.0];
const CUTOFF_BASE = [2600, 2000, 1400];

// Built-in voices, in display order. 'glass' is the original FM bell.
const BUILTIN_TONES = ['glass', 'bowl', 'kalimba', 'pad', 'breath', 'sine'];
const TONE_GAIN = { glass: 1, bowl: 0.95, kalimba: 1.05, pad: 0.62, breath: 0.85, sine: 0.9, sample: 0.9 };
const DEFAULT_TONE = 'glass';
const DEFAULT_SAMPLE_ROOT = 50; // D3

// Singing-bowl partials: [inharmonic ratio, level, decay scale, beat rate Hz]
const BOWL_PARTIALS = [
  [1.0, 1.0, 1.0, 0.6],
  [2.76, 0.5, 0.7, 1.3],
  [5.4, 0.26, 0.45, 2.1],
  [8.93, 0.12, 0.3, 2.9],
];

// ---- Helpers ----------------------------------------------------------------
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);

const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// "D3", "C#4", "Bb2", 50, "50" -> MIDI number; fallback D3.
function parseRoot(r) {
  if (typeof r === 'number' && isFinite(r)) return r;
  if (typeof r === 'string') {
    const t = r.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(t);
    if (m) {
      let pc = NOTE_PC[m[1].toLowerCase()];
      if (m[2] === '#') pc += 1;
      else if (m[2] === 'b') pc -= 1;
      return (parseInt(m[3], 10) + 1) * 12 + pc;
    }
  }
  return DEFAULT_SAMPLE_ROOT;
}

function urlToneParam() {
  try {
    const loc = globalThis.location;
    if (!loc || typeof loc.search !== 'string' || typeof URLSearchParams === 'undefined') return null;
    const t = new URLSearchParams(loc.search).get('tone');
    return t && t.trim() ? t.trim() : null;
  } catch (_) {
    return null;
  }
}

function decodeBuffer(ctx, ab) {
  return new Promise((res, rej) => {
    try {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && typeof p.then === 'function') p.then(res, rej);
    } catch (e) { rej(e); }
  });
}

function bufferPeak(buf) {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i += 4) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  return peak;
}

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function buildScaleNotes(scale) {
  const out = [];
  for (let oct = -1; oct < 4; oct++) {
    for (const s of scale) {
      const m = ROOT_MIDI + oct * 12 + s;
      if (m >= ROOT_MIDI - 12 && m <= ROOT_MIDI + RANGE_SEMIS) out.push(m);
    }
  }
  return out;
}
const SCALE_NOTES = SCALES.map(buildScaleNotes);

function makeImpulse(ctx, seconds) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const tau = seconds / 6.9; // -60 dB at the end
  const pre = Math.floor(rate * 0.018);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      if (i < pre) { d[i] = 0; continue; }
      const t = (i - pre) / rate;
      const n = Math.random() * 2 - 1;
      // one-pole lowpass that closes over time: the tail darkens
      const k = 0.85 - 0.75 * Math.min(1, t / seconds);
      lp += k * (n - lp);
      // gentle onset swell so the early part is not a hard click
      const onset = Math.min(1, t / 0.06);
      d[i] = lp * Math.exp(-t / tau) * onset;
    }
  }
  // normalize
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  const g = peak > 0 ? 0.6 / peak : 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return buf;
}

// ---- Sound ------------------------------------------------------------------
export class Sound {
  constructor() {
    this.ctx = null;
    this._starting = null;
    this._muted = false;
    this._suspendedByPage = false;
    this._voices = [];
    this._weights = [1, 0, 0];
    this._light = 0.6;
    this._lastLightApply = -1;
    this._appliedCutoff = 0;
    this._lastIdx = -1;
    this._lastHover = -1;
    this._lastDrag = -1;
    this._lastPress = -1;

    // tone bank
    this._tone = DEFAULT_TONE;
    this._pendingTone = null;   // a requested sample name not decoded yet
    this._samples = [];         // { name, url, root, buffer, norm, failed, loading }
    this._bankLoaded = false;
    this._droneOn = true;
    this.onTonesChanged = null;
    const want = urlToneParam();
    if (want) {
      const hit = BUILTIN_TONES.find((t) => t === want.toLowerCase());
      if (hit) this._tone = hit;
      else this._pendingTone = want;
    }
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  get muted() { return this._muted; }

  /** Tone names in order: built-ins first, then decoded samples from tones.json. */
  get tones() {
    const out = BUILTIN_TONES.slice();
    for (const smp of this._samples) if (smp.buffer) out.push(smp.name);
    return out;
  }

  get tone() { return this._tone; }

  /** Switch the note voice by name (case-insensitive) or index. Returns the current name. */
  setTone(nameOrIndex) {
    const list = this.tones;
    let name = null;
    if (typeof nameOrIndex === 'number' && isFinite(nameOrIndex)) {
      const n = list.length;
      name = list[((Math.round(nameOrIndex) % n) + n) % n];
    } else if (typeof nameOrIndex === 'string') {
      const k = nameOrIndex.trim().toLowerCase();
      name = list.find((t) => t.toLowerCase() === k) || null;
      if (!name) {
        // a sample listed but not decoded yet, or the bank isn't fetched yet:
        // remember it and switch once it loads
        const smp = this._samples.find((x) => x.name.toLowerCase() === k && !x.failed);
        if (k && (smp || !this._bankLoaded)) {
          this._pendingTone = nameOrIndex.trim();
          if (smp) this._decodeSample(smp);
        }
        return this._tone;
      }
    }
    if (!name) return this._tone;
    this._pendingTone = null;
    this._tone = name;
    this._audition();
    return name;
  }

  nextTone() {
    const list = this.tones;
    const i = list.indexOf(this._tone);
    return this.setTone(i < 0 ? 0 : i + 1);
  }

  /** Fade the background drone in or out (independent of the tone choice). */
  setDrone(on) {
    this._droneOn = !!on;
    if (!this.ctx || !this.droneGate) return;
    const now = this.ctx.currentTime;
    const g = this.droneGate.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(this._droneOn ? 1 : 0, now, this._droneOn ? 1.2 : 0.5);
  }

  get drone() { return this._droneOn; }

  async start() {
    if (this._starting) {
      if (this.ctx && this.ctx.state === 'suspended' && !this._suspendedByPage) {
        try { await this.ctx.resume(); } catch (_) { /* ignore */ }
      }
      return this._starting;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (_) {
      this.ctx = null;
      return;
    }
    // Resume synchronously-initiated within the gesture.
    const resumeP = this.ctx.state !== 'running' ? this.ctx.resume().catch(() => {}) : Promise.resolve();
    this._buildGraph();
    this._loadToneBank();
    this._starting = resumeP.then(() => {
      this._startDrone();
    });
    return this._starting;
  }

  setMuted(muted) {
    this._muted = !!muted;
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(this._muted ? 0 : MASTER_LEVEL, now, MUTE_TAU);
  }

  suspend() {
    if (!this.ctx) return;
    this._suspendedByPage = true;
    if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (!this.ctx) return;
    this._suspendedByPage = false;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setLight(s) {
    if (s) {
      const w = s.weights;
      if (w && w.length >= 3) {
        this._weights[0] = num(w[0], 0);
        this._weights[1] = num(w[1], 0);
        this._weights[2] = num(w[2], 0);
      }
      this._light = clamp01(num(s.light, this._light));
    }
    if (!this.ctx || !this.droneLP) return;
    // Throttle automation updates (~4 Hz) so per-frame calls stay cheap.
    const now = this.ctx.currentTime;
    if (now - this._lastLightApply < 0.25) return;
    this._lastLightApply = now;
    const L = this._light;
    const cutoff = 140 + 1100 * L * L + 260 * this._weights[1];
    if (Math.abs(cutoff - this._appliedCutoff) > 4) {
      this._appliedCutoff = cutoff;
      this.droneLP.frequency.setTargetAtTime(cutoff, now, 1.5);
    }
  }

  touch(e) {
    if (!this.ctx || !this.voiceBus || this._muted || this.ctx.state !== 'running' || !e) return;
    const now = this.ctx.currentTime;
    const kind = e.kind;
    const u = clamp01(num(e.u, 0.5));
    const v = clamp01(num(e.v, 0.5));
    const h = clamp01(num(e.height, 0.3));
    const pan = clamp(num(e.pan, 0), -1, 1);
    const energy = clamp01(num(e.energy, 0.5));

    const mood = this._dominant();
    const notes = SCALE_NOTES[mood];
    const tim = this._timbre(mood);
    this._kind = kind;

    // pitch position 0..1 from height (main), u (a little), far = higher
    const p = clamp01(0.68 * h + 0.12 * u + 0.2 * (1 - v) + (Math.random() - 0.5) * 0.06);
    // the upper part of the table (ROOT_MIDI and above) is the playable range
    const lowCount = notes.findIndex((m) => m >= ROOT_MIDI);
    const span = notes.length - 1 - lowCount;

    switch (kind) {
      case 'tap': {
        const idx = lowCount + Math.round(p * span);
        this._lastIdx = idx;
        this._note(notes[idx], 0.45, { pan, tim, attack: 0.012, decay: 4.2 + 1.6 * (1 - p), p });
        if (Math.random() < 0.3) {
          const idx2 = Math.min(notes.length - 1, idx + 2);
          this._note(notes[idx2], 0.45 * 0.32, { pan: pan * 0.6, tim, attack: 0.03, decay: 3.5, p, delay: 0.11 });
        }
        break;
      }
      case 'drag': {
        if (now - this._lastDrag < DRAG_MIN_INTERVAL) return;
        this._lastDrag = now;
        const idx = this._stepAway(lowCount + Math.round(p * span), notes.length, lowCount);
        this._note(notes[idx], 0.18 + 0.12 * energy, { pan, tim, attack: 0.02, decay: 2.8 + 1.4 * (1 - p), p });
        break;
      }
      case 'hover': {
        if (now - this._lastHover < HOVER_MIN_INTERVAL) return;
        this._lastHover = now;
        if (Math.random() < HOVER_SKIP) return;
        const idx = this._stepAway(lowCount + Math.round(p * span), notes.length, lowCount);
        this._note(notes[idx], 0.06 + 0.08 * energy, {
          pan, tim: { ...tim, index: tim.index * 0.7 }, attack: 0.035, decay: 2.6 + 1.5 * (1 - p), p,
        });
        break;
      }
      case 'press': {
        if (now - this._lastPress < PRESS_MIN_INTERVAL) return;
        this._lastPress = now;
        // a low swelling tone from the bottom of the range
        const lowIdx = clamp(Math.round(p * 4), 0, lowCount + 2);
        this._note(notes[lowIdx], 0.2, {
          pan: pan * 0.5,
          tim: { ...tim, ratio: 1.0, index: 0.5 + 0.4 * this._light, shimmer: 2.0, cutoff: tim.cutoff * 0.5 },
          attack: 0.65, decay: 5.0, p: 0, modDecayScale: 1.2,
        });
        break;
      }
      case 'release': {
        if (energy < 0.02) return;
        // root or fifth, low
        const useFifth = Math.random() < 0.4;
        const m = (useFifth ? ROOT_MIDI - 12 + 7 : ROOT_MIDI - 12);
        const vel = 0.1 + 0.26 * energy;
        const rt = { ...tim, ratio: 1.0, index: 0.6 + 0.6 * energy, shimmer: 2.0, cutoff: tim.cutoff * 0.6 };
        this._note(m, vel, { pan: pan * 0.4, tim: rt, attack: 0.05, decay: 5.5 + energy, p: 0 });
        this._note(m + 12, vel * 0.3, { pan: -pan * 0.3, tim: rt, attack: 0.08, decay: 4.5, p: 0.2, delay: 0.04 });
        break;
      }
      default:
        return;
    }
  }

  // ---- internals ------------------------------------------------------------
  _dominant() {
    const w = this._weights;
    let k = 0;
    if (w[1] > w[k]) k = 1;
    if (w[2] > w[k]) k = 2;
    return k;
  }

  _timbre(mood) {
    const w = this._weights;
    const L = this._light;
    let index = 0, cutoff = 0, sum = 0;
    for (let i = 0; i < 3; i++) {
      const wi = Math.max(0, w[i]);
      index += wi * MOD_INDEX[i];
      cutoff += wi * CUTOFF_BASE[i];
      sum += wi;
    }
    if (sum <= 0) { index = MOD_INDEX[mood]; cutoff = CUTOFF_BASE[mood]; sum = 1; }
    index /= sum; cutoff /= sum;
    return {
      ratio: MOD_RATIO[mood],              // snapped to dominant to stay harmonic
      shimmer: SHIMMER_RATIO[mood],
      index: index * (0.55 + 0.75 * L),
      cutoff: cutoff * (0.55 + 1.6 * L),
    };
  }

  _stepAway(idx, len, lo) {
    if (idx === this._lastIdx) {
      let n = idx + (Math.random() < 0.5 ? -1 : 1);
      if (n < lo) n = idx + 1;
      if (n >= len) n = idx - 1;
      idx = n;
    }
    this._lastIdx = idx;
    return idx;
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER_LEVEL;
    this._noise = makeNoise(ctx, 2.0);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 14;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.008;
    this.comp.release.value = 0.45;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;

    const dry = ctx.createGain();
    dry.gain.value = DRY_LEVEL;
    this.voiceBus.connect(dry);
    dry.connect(this.comp);

    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.normalize = false;
    this.reverb.buffer = makeImpulse(ctx, REVERB_SECONDS);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = REVERB_SEND;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.9;
    this.voiceBus.connect(this.reverbIn);
    this.reverbIn.connect(this.reverb);
    this.reverb.connect(revOut);
    revOut.connect(this.comp);

    // feedback delay
    const dSend = ctx.createGain();
    dSend.gain.value = DELAY_SEND;
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = DELAY_TIME;
    const dLP = ctx.createBiquadFilter();
    dLP.type = 'lowpass';
    dLP.frequency.value = DELAY_LP;
    dLP.Q.value = 0.4;
    const fb = ctx.createGain();
    fb.gain.value = DELAY_FEEDBACK;
    this.voiceBus.connect(dSend);
    dSend.connect(delay);
    delay.connect(dLP);
    dLP.connect(fb);
    fb.connect(delay);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.8;
    dLP.connect(dOut);
    dOut.connect(this.comp);
    dOut.connect(this.reverbIn); // echoes bloom into the space
  }

  _startDrone() {
    if (this._droneStarted || !this.ctx) return;
    this._droneStarted = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.droneLP = ctx.createBiquadFilter();
    this.droneLP.type = 'lowpass';
    this._appliedCutoff = 140 + 1100 * this._light * this._light;
    this.droneLP.frequency.value = this._appliedCutoff;
    this.droneLP.Q.value = 0.6;

    const breath = ctx.createGain();      // LFO-modulated level
    const fade = ctx.createGain();        // fade-in
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + DRONE_FADE_IN);

    // base level + LFO depth so peaks reach DRONE_PEAK
    const depth = DRONE_PEAK * 0.3;
    breath.gain.value = DRONE_PEAK - depth;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = DRONE_LFO_HZ;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = depth;
    lfo.connect(lfoAmt);
    lfoAmt.connect(breath.gain);
    lfo.start(now);

    // partials: [freq, level, detune cents, type]
    const D2 = mtof(38), A2 = mtof(45), D3 = mtof(50);
    const parts = [
      [D2, 0.42, -3, 'sine'], [D2, 0.3, 4, 'triangle'],
      [A2, 0.26, 2, 'sine'], [A2, 0.14, -5, 'triangle'],
      [D3, 0.09, 1, 'sine'],
    ];
    const mix = ctx.createGain();
    mix.gain.value = 1;
    for (const [f, lvl, cents, type] of parts) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = cents;
      // very slow independent drift for each partial
      const drift = ctx.createOscillator();
      drift.frequency.value = 0.02 + Math.random() * 0.05;
      const driftAmt = ctx.createGain();
      driftAmt.gain.value = 3 + Math.random() * 3;
      drift.connect(driftAmt);
      driftAmt.connect(o.detune);
      const g = ctx.createGain();
      g.gain.value = lvl;
      o.connect(g);
      g.connect(mix);
      o.start(now);
      drift.start(now);
    }
    mix.connect(this.droneLP);
    this.droneLP.connect(breath);
    breath.connect(fade);
    this.droneGate = ctx.createGain();
    this.droneGate.gain.value = this._droneOn ? 1 : 0;
    fade.connect(this.droneGate);
    this.droneGate.connect(this.comp);
    const droneSend = ctx.createGain();
    droneSend.gain.value = 0.5;
    this.droneGate.connect(droneSend);
    droneSend.connect(this.reverbIn);
  }

  _reap(now) {
    const vs = this._voices;
    for (let i = vs.length - 1; i >= 0; i--) {
      if (vs[i].end <= now) vs.splice(i, 1);
    }
  }

  _stealVoice(now) {
    const vs = this._voices;
    let worst = -1, worstLvl = Infinity;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      const lvl = v.vel * Math.exp(-Math.max(0, now - v.start) / v.tau);
      if (lvl < worstLvl) { worstLvl = lvl; worst = i; }
    }
    if (worst < 0) return;
    const v = vs[worst];
    vs.splice(worst, 1);
    try {
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setValueAtTime(v.out.gain.value, now);
      v.out.gain.setTargetAtTime(0, now, 0.04);
    } catch (_) { /* ignore */ }
    for (const o of v.oscs) { try { o.stop(now + 0.25); } catch (_) { /* ignore */ } }
  }

  // ---- tone bank ------------------------------------------------------------
  _fireTonesChanged() {
    const cb = this.onTonesChanged;
    if (typeof cb !== 'function') return;
    try { cb(this.tones); } catch (_) { /* ignore */ }
  }

  _sampleByName(name) {
    for (const smp of this._samples) if (smp.buffer && smp.name === name) return smp;
    return null;
  }

  async _loadToneBank() {
    if (this._bankLoading) return;
    this._bankLoading = true;
    try {
      if (typeof fetch !== 'function') return;
      const jsonUrl = new URL('../tones/tones.json', import.meta.url);
      const res = await fetch(jsonUrl, { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      const list = data && Array.isArray(data.tones) ? data.tones : [];
      const taken = new Set(BUILTIN_TONES);
      for (const t of list) {
        if (!t || typeof t.file !== 'string' || !t.file) continue;
        let name = typeof t.name === 'string' && t.name.trim() ? t.name.trim() : t.file.replace(/\.[^.]+$/, '');
        if (taken.has(name.toLowerCase())) name += '-sample';
        if (taken.has(name.toLowerCase())) continue;
        taken.add(name.toLowerCase());
        let url;
        try { url = new URL(t.file, jsonUrl).href; } catch (_) { continue; }
        this._samples.push({ name, url, root: parseRoot(t.root), buffer: null, norm: 1, failed: false, loading: null });
      }
    } catch (_) {
      /* no bank, or malformed: built-ins only */
    } finally {
      this._bankLoaded = true;
      this._bankLoading = false;
    }
    // decode in the background, the requested one first
    const want = this._pendingTone && this._pendingTone.toLowerCase();
    const order = this._samples.slice().sort((a, b) =>
      (b.name.toLowerCase() === want) - (a.name.toLowerCase() === want));
    for (const smp of order) await this._decodeSample(smp);
  }

  _decodeSample(smp) {
    if (smp.buffer || smp.failed) return Promise.resolve();
    if (smp.loading) return smp.loading;
    const ctx = this.ctx;
    if (!ctx || typeof fetch !== 'function') return Promise.resolve();
    smp.loading = fetch(smp.url)
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then((ab) => decodeBuffer(ctx, ab))
      .then((buf) => {
        if (!buf || !buf.length) throw new Error('empty');
        const pk = bufferPeak(buf);
        smp.norm = pk > 0 ? Math.min(6, 0.8 / pk) : 1;
        smp.buffer = buf;
        if (this._pendingTone && this._pendingTone.toLowerCase() === smp.name.toLowerCase()) {
          this._pendingTone = null;
          this._tone = smp.name;
        }
        this._fireTonesChanged();
      })
      .catch(() => { smp.failed = true; })
      .finally(() => { smp.loading = null; });
    return smp.loading;
  }

  _audition() {
    if (!this.ctx || !this.voiceBus || this._muted || this.ctx.state !== 'running') return;
    const mood = this._dominant();
    const notes = SCALE_NOTES[mood];
    const tim = this._timbre(mood);
    const lo = notes.findIndex((m) => m >= ROOT_MIDI);
    const steps = [2, 4, 6];
    const vels = [0.26, 0.22, 0.2];
    const pans = [-0.3, 0, 0.3];
    for (let k = 0; k < 3; k++) {
      const idx = Math.min(notes.length - 1, lo + steps[k]);
      this._note(notes[idx], vels[k], {
        pan: pans[k], tim, attack: 0.015, decay: 3.2, p: 0.3, delay: k * 0.17, kind: 'tap',
      });
    }
  }

  // ---- voices -----------------------------------------------------------------
  // Each voice builder makes its sources + amplitude envelope and returns
  // { head, sources, nodes, end, tau, cutScale }; _note adds filter, level, pan.

  _vGlass(ctx, t0, freq, vel, o, e) {
    const tim = o.tim;
    const car = ctx.createOscillator();
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * tim.ratio;
    const modGain = ctx.createGain();
    const idxPeak = tim.index * (0.6 + vel) * freq;
    const modTau = e.tau * 0.28 * (o.modDecayScale || 1);
    modGain.gain.setValueAtTime(0, t0);
    modGain.gain.linearRampToValueAtTime(idxPeak, t0 + e.attack);
    modGain.gain.setTargetAtTime(idxPeak * 0.08, t0 + e.attack, modTau);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const sh = ctx.createOscillator();
    sh.frequency.value = freq * tim.shimmer;
    sh.detune.value = (Math.random() - 0.5) * 8 + 3;
    const shGain = ctx.createGain();
    const shPeak = 0.07 * (0.5 + 0.5 * this._light);
    shGain.gain.setValueAtTime(0, t0);
    shGain.gain.linearRampToValueAtTime(shPeak, t0 + e.attack + 0.02);
    shGain.gain.setTargetAtTime(0, t0 + e.attack + 0.02, e.tau * 0.45);
    sh.connect(shGain);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(1, t0 + e.attack);
    amp.gain.setTargetAtTime(0, t0 + e.attack, e.tau);
    car.connect(amp);
    shGain.connect(amp);

    const end = t0 + e.attack + e.decay * 1.15;
    const sources = [car, mod, sh];
    for (const x of sources) { x.start(t0); x.stop(end); }
    return { head: amp, sources, nodes: [car, mod, modGain, sh, shGain, amp], end, tau: e.tau };
  }

  // inharmonic singing-bowl partials, each a slowly beating detuned pair; long decay
  _vBowl(ctx, t0, freq, vel, o, e) {
    const attack = Math.max(e.attack, 0.008);
    const tau = e.tau * 1.7;
    const L = this._light;
    const amp = ctx.createGain();
    amp.gain.value = 0.32;
    const sources = [], nodes = [amp];
    let end = t0 + attack + tau * 6.2;
    for (let k = 0; k < BOWL_PARTIALS.length; k++) {
      const [ratio, lvl0, dscale, beat] = BOWL_PARTIALS[k];
      const f = freq * ratio;
      if (f > 12000) break;
      // brighter light lets the upper partials ring more
      const lvl = lvl0 * (k === 0 ? 1 : 0.45 + 0.9 * L) * (k >= 2 ? 0.6 + 0.6 * vel : 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(lvl, t0 + attack + 0.004 * k);
      g.gain.setTargetAtTime(0, t0 + attack, tau * dscale);
      g.connect(amp);
      nodes.push(g);
      const b = beat * (0.8 + 0.4 * Math.random());
      for (const df of [-b / 2, b / 2]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f + df;
        osc.connect(g);
        sources.push(osc);
        nodes.push(osc);
      }
    }
    for (const x of sources) { x.start(t0); x.stop(end); }
    return { head: amp, sources, nodes, end, tau, cutScale: 1.4 };
  }

  // kalimba: sine tine with a fast inharmonic overtone, a little FM thunk and a soft click
  _vKalimba(ctx, t0, freq, vel, o, e) {
    const attack = e.attack > 0.1 ? e.attack : Math.min(e.attack, 0.004);
    const tau = e.tau * 0.5;
    const end = t0 + attack + tau * 6.5;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(1, t0 + attack);
    amp.gain.setTargetAtTime(0, t0 + attack, tau);

    const car = ctx.createOscillator();
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * 2;
    const modGain = ctx.createGain();
    const ip = freq * (0.6 + 0.8 * vel) * (0.5 + 0.6 * this._light);
    modGain.gain.setValueAtTime(ip, t0);
    modGain.gain.setTargetAtTime(0, t0 + attack, 0.05);
    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(amp);

    const tine = ctx.createOscillator();
    tine.frequency.value = Math.min(15000, freq * 6.27);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0, t0);
    tg.gain.linearRampToValueAtTime(0.28 * (0.5 + this._light), t0 + attack + 0.002);
    tg.gain.setTargetAtTime(0, t0 + attack + 0.002, 0.09);
    tine.connect(tg);
    tg.connect(amp);

    const sources = [car, mod, tine];
    const nodes = [car, mod, modGain, tine, tg, amp];
    for (const x of sources) { x.start(t0); x.stop(end); }

    if (attack < 0.1 && this._noise) {
      const n = ctx.createBufferSource();
      n.buffer = this._noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400 + 1600 * this._light;
      bp.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.09 * vel, t0);
      ng.gain.setTargetAtTime(0, t0, 0.006);
      n.connect(bp); bp.connect(ng); ng.connect(amp);
      n.start(t0, Math.random() * 1.5);
      n.stop(t0 + 0.06);
      sources.push(n);
      nodes.push(n, bp, ng);
    }
    return { head: amp, sources, nodes, end, tau, cutScale: 1.2 };
  }

  // soft detuned sine/triangle swell, slow attack, gentle hold then release
  _vPad(ctx, t0, freq, vel, o, e) {
    const attack = Math.max(0.55, e.attack * 1.3) + 0.25 * (1 - vel);
    const hold = 0.7;
    const tau = e.tau * 1.25;
    const end = t0 + attack + hold + tau * 5.5;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(1, t0 + attack);
    amp.gain.setTargetAtTime(0.72, t0 + attack, 0.5);
    amp.gain.setTargetAtTime(0, t0 + attack + hold, tau);

    // own swelling filter so the attack blooms open
    const sw = ctx.createBiquadFilter();
    sw.type = 'lowpass';
    sw.Q.value = 0.7;
    const top = clamp(o.tim.cutoff * (0.6 + 0.5 * vel), 400, 9000);
    sw.frequency.setValueAtTime(top * 0.25, t0);
    sw.frequency.linearRampToValueAtTime(top, t0 + attack);
    sw.frequency.setTargetAtTime(top * 0.5, t0 + attack + hold, tau);
    sw.connect(amp);

    const parts = [
      ['sine', 1, 0, 0.5], ['triangle', 1, 7, 0.3], ['triangle', 1, -8, 0.3],
      ['sine', 0.5, 2, 0.16], ['sine', 2, -3, 0.05 + 0.08 * this._light],
    ];
    const sources = [], nodes = [amp, sw];
    for (const [type, r, cents, lvl] of parts) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * r;
      osc.detune.value = cents + (Math.random() - 0.5) * 3;
      const g = ctx.createGain();
      g.gain.value = lvl;
      osc.connect(g);
      g.connect(sw);
      sources.push(osc);
      nodes.push(osc, g);
    }
    for (const x of sources) { x.start(t0); x.stop(end); }
    return { head: amp, sources, nodes, end, tau, cutScale: 1.6, attack };
  }

  // breathy choir: filtered noise through narrow bandpasses on the note and its
  // octave, two soft vowel formants, plus a faint sine to anchor the pitch
  _vBreath(ctx, t0, freq, vel, o, e) {
    const attack = Math.max(0.3, e.attack * 1.2);
    const tau = e.tau * 1.05;
    const end = t0 + attack + tau * 6;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(1, t0 + attack);
    amp.gain.setTargetAtTime(0, t0 + attack, tau);
    const sources = [], nodes = [amp];

    if (this._noise) {
      const n = ctx.createBufferSource();
      n.buffer = this._noise;
      n.loop = true;
      const L = this._light;
      const bands = [
        [freq, 28, 20],
        [freq * 2, 22, 9 * (0.5 + L)],
        [freq * 3, 18, 4 * L],
        [650 + 150 * L, 7, 1.0],   // vowel-ish formants ("oo"→"ah" with light)
        [1050 + 400 * L, 8, 0.6],
      ];
      for (const [f, q, lvl] of bands) {
        if (f > 14000) continue;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = lvl * 0.5;
        n.connect(bp); bp.connect(g); g.connect(amp);
        nodes.push(bp, g);
      }
      n.start(t0, Math.random() * 1.8);
      n.stop(end);
      sources.push(n);
      nodes.push(n);
    }
    const s = ctx.createOscillator();
    s.frequency.value = freq;
    const sg = ctx.createGain();
    sg.gain.value = 0.22;
    s.connect(sg); sg.connect(amp);
    s.start(t0); s.stop(end);
    sources.unshift(s);
    nodes.push(s, sg);
    return { head: amp, sources, nodes, end, tau, cutScale: 1.3, attack };
  }

  // pure soft sine with a touch of octave
  _vSine(ctx, t0, freq, vel, o, e) {
    const attack = Math.max(e.attack, 0.02);
    const tau = e.tau * 1.1;
    const end = t0 + attack + tau * 6;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(1, t0 + attack);
    amp.gain.setTargetAtTime(0, t0 + attack, tau);
    const a = ctx.createOscillator();
    a.frequency.value = freq;
    const b = ctx.createOscillator();
    b.frequency.value = freq * 2;
    b.detune.value = 2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.06 + 0.1 * this._light, t0);
    bg.gain.setTargetAtTime(0.02, t0 + attack, tau * 0.5);
    a.connect(amp);
    b.connect(bg); bg.connect(amp);
    const sources = [a, b];
    for (const x of sources) { x.start(t0); x.stop(end); }
    return { head: amp, sources, nodes: [a, b, bg, amp], end, tau, cutScale: 1.5 };
  }

  // user sample, repitched from its root; slow swell for press/release
  _vSample(ctx, t0, midi, vel, o, e, smp, kind) {
    const swell = kind === 'press' || kind === 'release';
    const attack = swell ? Math.max(0.4, e.attack) : Math.max(0.006, e.attack);
    const rate = Math.pow(2, (midi - smp.root) / 12) * Math.pow(2, ((Math.random() - 0.5) * 6) / 1200);
    const src = ctx.createBufferSource();
    src.buffer = smp.buffer;
    src.playbackRate.value = rate;
    const tau = e.tau * 1.3;
    const bufDur = smp.buffer.duration / rate;
    const dur = Math.max(0.05, Math.min(bufDur, attack + tau * 6));
    const fadeLen = Math.min(0.8, dur * 0.35);
    const end = t0 + dur;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(smp.norm, t0 + attack);
    amp.gain.setTargetAtTime(0, t0 + attack + 0.08, tau);
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(1, t0);
    fade.gain.setValueAtTime(1, end - fadeLen);
    fade.gain.linearRampToValueAtTime(0, end);
    src.connect(amp);
    amp.connect(fade);
    src.start(t0, 0);
    src.stop(end + 0.02);
    return { head: fade, sources: [src], nodes: [src, amp, fade], end: end + 0.02, tau, cutScale: 2.2, attack };
  }

  _note(midi, vel, o) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this._reap(now);
    while (this._voices.length >= MAX_VOICES) this._stealVoice(now);

    const t0 = now + 0.005 + (o.delay || 0);
    const tim = o.tim;
    const p = o.p || 0;
    const kind = o.kind || this._kind || 'tap';
    const freq = mtof(midi) * Math.pow(2, ((Math.random() - 0.5) * 6) / 1200);
    const decay = o.decay * (1 - 0.25 * p);
    const env = { attack: o.attack, decay, tau: decay / 5.5 };   // ~-48 dB at "decay"

    let tone = this._tone;
    const smp = BUILTIN_TONES.includes(tone) ? null : this._sampleByName(tone);
    if (!smp && !BUILTIN_TONES.includes(tone)) tone = DEFAULT_TONE;

    let v;
    try {
      if (smp) v = this._vSample(ctx, t0, midi, vel, o, env, smp, kind);
      else if (tone === 'bowl') v = this._vBowl(ctx, t0, freq, vel, o, env);
      else if (tone === 'kalimba') v = this._vKalimba(ctx, t0, freq, vel, o, env);
      else if (tone === 'pad') v = this._vPad(ctx, t0, freq, vel, o, env);
      else if (tone === 'breath') v = this._vBreath(ctx, t0, freq, vel, o, env);
      else if (tone === 'sine') v = this._vSine(ctx, t0, freq, vel, o, env);
      else v = this._vGlass(ctx, t0, freq, vel, o, env);
    } catch (_) {
      return;
    }
    const attack = v.attack != null ? v.attack : o.attack;
    // high notes a little quieter
    const peak = vel * NOTE_LEVEL * (1 - 0.3 * p) * (TONE_GAIN[smp ? 'sample' : tone] || 1);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    const cut = clamp(tim.cutoff * (0.7 + 0.6 * vel) * (v.cutScale || 1), 300, 16000);
    lp.frequency.setValueAtTime(cut, t0);
    lp.frequency.setTargetAtTime(Math.max(250, cut * 0.45), t0 + attack, v.tau * 0.8);

    const out = ctx.createGain();
    out.gain.value = peak;

    let panNode = null;
    if (ctx.createStereoPanner) {
      panNode = ctx.createStereoPanner();
      panNode.pan.value = clamp(o.pan * 0.75, -1, 1);
    }
    v.head.connect(lp);
    lp.connect(out);
    if (panNode) { out.connect(panNode); panNode.connect(this.voiceBus); }
    else out.connect(this.voiceBus);

    const nodes = v.nodes.concat([lp, out, panNode]);
    const voice = { start: t0, end: v.end, vel: peak, tau: v.tau, out, oscs: v.sources };
    v.sources[0].onended = () => {
      for (const n of nodes) { if (n) { try { n.disconnect(); } catch (_) { /* ignore */ } } }
      const i = this._voices.indexOf(voice);
      if (i >= 0) this._voices.splice(i, 1);
    };
    this._voices.push(voice);
  }
}

export default Sound;

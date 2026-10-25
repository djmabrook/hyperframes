// The site's 3D editing workspace: a Premiere / Resolve style interface on one big screen,
// filmed at an angle with shallow focus, after the Midjourney concept frames. The program
// monitor shows a dusk horizon with a glowing waveform and, once you're in, the reel.
// Scroll moves the camera through it: monitor → timeline → colour page → wide.
// One scene, two hosts: the website drives `s` from scroll (site/js/site.js) and the
// HyperFrames composition beside this file drives it from timeline time. Everything drawn is
// a function of `s` (0..4) and `time` (seconds), so scrolling up retraces the same shots.
import * as THREE from "./assets/vendor/three-0.170.0.module.min.js";

export { THREE };

/** Load an image as a texture (for hosts that show a still in place of the reel). */
export const loadTexture = (url) => new THREE.TextureLoader().loadAsync(url);
export const STOPS = 5; // hero, reel, work (timeline), credits (colour), contact (wide)

const SW = 32; // screen width, units
const SH = 18; // screen height
const PX = 128; // texture pixels per unit
const MON = { x: 8.25, y: 0.75, w: 13.5, h: 7.6 }; // program monitor picture, screen units
const VIEW = { x: 23.3, y: 1.15, w: 6.2, h: 3.4875 }; // the colour page's viewer: the same picture

/** Timeline ruler span (screen units): where the playhead runs, start to end of the picture. */
export const TIMELINE = { x0: 2.8, x1: SW - 0.6, top: 10.0, bottom: 17.85 };
/** Colour wheels on the colour page, in order lift, gamma, gain, offset. */
export const WHEELS = [0, 1, 2, 3].map((k) => ({ x: 24.9 + k * 2.0, y: 6.75, r: 0.9 }));
export const PUCK_REACH = 0.7; // how far a wheel's puck travels from centre

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const mix = (a, b, e) => a + (b - a) * e;

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// Screen coordinates (x right, y down, units) to world.
const toWorld = (x, y, z = 0) => new THREE.Vector3(x - SW / 2, SH / 2 - y, z);

// ---------- Interface chrome, painted once ----------
const LABELS = ["#9b8ad6", "#5a7be0", "#22b3a5", "#c79fe0", "#2e9be6", "#4c9a4c", "#e06a9a", "#f2a541", "#e6d84a", "#e04a4a"];

function paintChrome() {
  const c = document.createElement("canvas");
  c.width = SW * PX;
  c.height = SH * PX;
  const g = c.getContext("2d");
  const rand = seeded(5);
  const R = (x, y, w, h, col, r = 0) => {
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x * PX, y * PX, w * PX, h * PX, r * PX);
    g.fill();
  };
  const bar = (x, y, w, col = "#3a3d44") => R(x, y, w, 0.09, col, 0.04);
  const mono = (txt, x, y, size, col) => {
    g.fillStyle = col;
    g.font = `500 ${size * PX}px "JetBrains Mono", ui-monospace, monospace`;
    g.fillText(txt, x * PX, y * PX);
  };

  // Desk-dark surround and panel wells.
  R(0, 0, SW, SH, "#0b0c0e");
  R(0, 0, SW, 0.45, "#151619");
  for (let i = 0; i < 7; i++) bar(0.35 + i * 0.85, 0.18, 0.5, "#4a4d55");
  for (let i = 0; i < 5; i++) bar(11.5 + i * 1.6, 0.18, 1.1, i === 1 ? "#2d8ceb" : "#3a3d44");

  // Panels.
  const panel = (x, y, w, h) => {
    R(x, y, w, h, "#1b1c20", 0.06);
    R(x, y, w, 0.42, "#202227", 0.06);
    bar(x + 0.25, y + 0.17, 0.9, "#8b9099");
    bar(x + 1.45, y + 0.17, 0.7);
    bar(x + 2.45, y + 0.17, 0.8);
    R(x + 0.2, y + 0.38, 0.95, 0.03, "#2d8ceb");
  };
  panel(0.15, 0.6, 6.7, 8.8); // bins
  panel(7.0, 0.6, 15.9, 8.8); // program monitor
  panel(23.05, 0.6, 8.8, 4.35); // colour page viewer and scope
  panel(23.05, 5.05, 8.8, 4.35); // colour wheels
  panel(0.15, 9.6, SW - 0.3, 8.25); // timeline

  // Bin: thumbnails with label chips and durations.
  for (let i = 0; i < 12; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.45 + col * 2.12;
    const y = 1.3 + row * 1.95;
    const grad = g.createLinearGradient(0, y * PX, 0, (y + 1.1) * PX);
    grad.addColorStop(0, ["#3c5aa6", "#6b5aa0", "#2c6f8f", "#8f5a6a"][i % 4]);
    grad.addColorStop(0.55, "#d9c7c4");
    grad.addColorStop(0.6, "#2a2c5a");
    grad.addColorStop(1, "#141530");
    g.fillStyle = grad;
    g.fillRect(x * PX, y * PX, 1.95 * PX, 1.1 * PX);
    R(x, y + 1.22, 0.18, 0.18, LABELS[i % LABELS.length], 0.03);
    bar(x + 0.3, y + 1.27, 1.0, "#6d717a");
    mono(`00:0${Math.floor(rand() * 9)}:${String(Math.floor(rand() * 59)).padStart(2, "0")}`, x + 1.12, y + 1.0, 0.16, "#e8e8e8");
  }

  // Monitor transport.
  R(7.05, 8.42, 15.8, 0.95, "#16171a");
  mono("01:00:12:08", 7.35, 8.98, 0.26, "#4aa3ff");
  mono("00:04:36:15", 20.35, 8.98, 0.26, "#9aa0a8");
  g.fillStyle = "#c9ccd2";
  const cx = 14.95 * PX;
  const cy = 8.9 * PX;
  const tri = (x, dir) => {
    g.beginPath();
    g.moveTo(x, cy - 0.13 * PX);
    g.lineTo(x + dir * 0.2 * PX, cy);
    g.lineTo(x, cy + 0.13 * PX);
    g.fill();
  };
  tri(cx - 0.1 * PX, 1);
  tri(cx - 0.7 * PX, -1);
  tri(cx + 0.7 * PX, 1);
  g.fillRect(cx - 1.25 * PX, cy - 0.12 * PX, 0.06 * PX, 0.24 * PX);
  g.fillRect(cx + 1.2 * PX, cy - 0.12 * PX, 0.06 * PX, 0.24 * PX);

  // Colour page: viewer (a live mesh over this well) beside an RGB parade.
  R(VIEW.x, VIEW.y, VIEW.w, VIEW.h, "#0a0b0c");
  R(29.7, 1.15, 1.9, 3.6, "#0a0b0c");
  g.globalCompositeOperation = "lighter";
  const parade = ["rgba(255,70,60,", "rgba(70,230,110,", "rgba(70,140,255,"];
  parade.forEach((col, k) => {
    const x0 = 29.78 + k * 0.6;
    for (let i = 0; i < 900; i++) {
      const x = rand();
      const base = 0.55 + 0.25 * Math.sin(x * 6 + k) - 0.2 * Math.exp(-((x - 0.5) ** 2) / 0.02);
      const y = clamp01(base + (rand() - 0.5) * 0.35 * rand());
      g.fillStyle = col + (0.25 + rand() * 0.4) + ")";
      g.fillRect((x0 + x * 0.52) * PX, (1.3 + y * 3.3) * PX, 3, 3);
    }
  });
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i <= 4; i++) R(29.7, 1.3 + i * 0.825, 1.9, 0.012, "rgba(255,255,255,0.12)");

  // Colour wheels.
  for (let k = 0; k < 4; k++) {
    const r = 0.9;
    const x = 24.0 + k * 2.0 + r;
    const y = 6.75;
    const conic = g.createConicGradient(0, x * PX, y * PX);
    ["#ff3b3b", "#ffd23b", "#4cff5a", "#3bf0ff", "#3b5bff", "#e03bff", "#ff3b3b"].forEach((col, i) => conic.addColorStop(i / 6, col));
    g.fillStyle = conic;
    g.beginPath();
    g.arc(x * PX, y * PX, r * PX, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1b1c20";
    g.beginPath();
    g.arc(x * PX, y * PX, (r - 0.07) * PX, 0, Math.PI * 2);
    g.fill();
    const disc = g.createRadialGradient(x * PX, y * PX, 0, x * PX, y * PX, (r - 0.1) * PX);
    disc.addColorStop(0, "#3a3c42");
    disc.addColorStop(1, "#24262b");
    g.fillStyle = disc;
    g.beginPath();
    g.arc(x * PX, y * PX, (r - 0.1) * PX, 0, Math.PI * 2);
    g.fill();
    R(x - 0.01, y - r + 0.15, 0.02, 2 * r - 0.3, "rgba(255,255,255,0.08)");
    R(x - r + 0.15, y - 0.01, 2 * r - 0.3, 0.02, "rgba(255,255,255,0.08)");
    rand(); // the puck is a live mesh now; keep the layout's random sequence
    R(x - r, y + r + 0.3, 2 * r, 0.06, "#2c2e34", 0.03);
    R(x - r + rand() * 1.4, y + r + 0.25, 0.16, 0.16, "#b9bdc4", 0.08);
    mono(["0.00", "1.00", "1.00", "0.00"][k], x - 0.25, y + r + 0.75, 0.16, "#9aa0a8");
  }

  // Timeline: timecode, ruler, track headers, tracks.
  mono("01:00:12:08", 0.45, 10.55, 0.36, "#4aa3ff");
  R(2.7, 10.15, SW - 3.0, 0.5, "#16171a");
  for (let i = 0; i <= 58; i++) {
    const x = 2.8 + i * 0.5;
    R(x, i % 4 === 0 ? 10.3 : 10.45, 0.015, i % 4 === 0 ? 0.35 : 0.2, "#6d717a");
    if (i % 8 === 0) mono(`01:00:${String(i).padStart(2, "0")}:00`, x + 0.06, 10.4, 0.13, "#8b9099");
  }
  R(2.7, 10.6, 9.0, 0.05, "#f2a541"); // in/out range
  const tracks = [
    ["V3", 10.85, 0.6],
    ["V2", 11.5, 0.6],
    ["V1", 12.15, 1.85],
    ["A1", 14.1, 0.85],
    ["A2", 15.05, 0.85],
    ["A3", 16.0, 0.85],
  ];
  for (const [name, y, h] of tracks) {
    R(0.3, y, 2.3, h - 0.06, "#202227", 0.04);
    mono(name, 0.45, y + 0.38, 0.2, "#c9ccd2");
    for (let j = 0; j < 3; j++) R(1.25 + j * 0.42, y + 0.18, 0.3, 0.26, "#2c2e34", 0.04);
    R(2.7, y + h - 0.03, SW - 3.0, 0.012, "#24262b");
  }
  // Clips on V2 / V3.
  const clip = (x, y, w, h, col) => {
    R(x, y, w, h, col, 0.05);
    R(x, y, w, 0.12, "rgba(255,255,255,0.18)", 0.05);
    bar(x + 0.15, y + 0.03, Math.min(1.2, w - 0.3), "rgba(255,255,255,0.65)");
  };
  let x = 2.8;
  while (x < SW - 1) {
    const w = 0.8 + rand() * 2.6;
    if (rand() > 0.35) clip(x, 11.53, Math.min(w, SW - 0.6 - x), 0.52, rand() > 0.5 ? "#7b6fc4" : "#5a7be0");
    x += w + 0.05 + rand() * 0.6;
  }
  for (x = 4.5; x < SW - 3; x += 4 + rand() * 4) clip(x, 10.88, 1.4 + rand(), 0.52, "#c79fe0");

  // V1: the film strip, its frames full of spectral waveform.
  R(2.7, 12.2, SW - 3.0, 1.75, "#231a2e");
  for (let hx = 2.8; hx < SW - 0.4; hx += 0.32) {
    R(hx, 12.27, 0.16, 0.2, "#efeae4", 0.03);
    R(hx, 13.67, 0.16, 0.2, "#efeae4", 0.03);
  }
  const fy = 12.55;
  const fh = 1.05;
  for (let col = 0; col < (SW - 3.1) * 40; col++) {
    const xx = 2.75 + col / 40;
    const amp = 0.3 + 0.7 * Math.abs(Math.sin(col * 0.013) * Math.sin(col * 0.0031 + 1)) * (0.6 + rand() * 0.4);
    const top = fy + fh * (0.5 - amp / 2);
    const grad = g.createLinearGradient(0, top * PX, 0, (top + amp * fh) * PX);
    grad.addColorStop(0, "#2e8f9e");
    grad.addColorStop(0.3, "#e0442e");
    grad.addColorStop(0.5, "#ffd34a");
    grad.addColorStop(0.7, "#e0442e");
    grad.addColorStop(1, "#2e8f9e");
    g.fillStyle = grad;
    g.fillRect(xx * PX, top * PX, PX / 40 - 1, amp * fh * PX);
  }
  for (let fx = 2.75; fx < SW - 0.4; fx += 2.1) R(fx, 12.5, 0.05, 1.15, "#231a2e");

  // Audio: green clips with waveforms.
  const audio = (y, col, wave) => {
    let ax = 2.8;
    while (ax < SW - 1) {
      const w = Math.min(2.5 + rand() * 5, SW - 0.6 - ax);
      R(ax, y + 0.05, w, 0.72, col, 0.05);
      g.fillStyle = wave;
      for (let i = 0; i < w * 30; i++) {
        const a = (0.1 + 0.9 * Math.abs(Math.sin(i * 0.21) * Math.sin(i * 0.037 + ax))) * rand() * 0.3;
        g.fillRect((ax + i / 30) * PX, (y + 0.41 - a) * PX, 2, a * 2 * PX);
      }
      ax += w + 0.1 + rand() * 0.8;
    }
  };
  audio(14.1, "#2f6b45", "rgba(170,255,190,0.75)");
  audio(15.05, "#2f6b45", "rgba(170,255,190,0.6)");
  audio(16.0, "#2a5a78", "rgba(160,220,255,0.6)");

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------- Program monitor: dusk horizon, city lights, glowing waveform ----------
const MONITOR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uPlay;
  uniform float uVideoMix;
  uniform sampler2D uVideo;
  uniform float uPictureMix;
  uniform sampler2D uPicture;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  vec3 dusk(vec2 uv) {
    float horizon = 0.47 + (uv.x - 0.5) * 0.07;
    float d = uv.y - horizon;
    vec3 top = vec3(0.10, 0.17, 0.46);
    vec3 mid = vec3(0.42, 0.55, 0.84);
    vec3 low = vec3(0.90, 0.82, 0.86);
    vec3 sky = mix(low, mid, smoothstep(0.0, 0.12, d));
    sky = mix(sky, top, smoothstep(0.12, 0.6, d));
    sky += vec3(0.30, 0.10, 0.08) * exp(-abs(d) * 30.0) * smoothstep(0.3, 1.0, uv.x);
    // Ground: deep blue haze with small, streaked city lights.
    vec3 ground = mix(vec3(0.16, 0.16, 0.40), vec3(0.03, 0.04, 0.13), smoothstep(0.0, -0.35, d));
    float lights = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 g = vec2(uv.x * (70.0 + fi * 45.0) + uTime * 0.15, uv.y * (220.0 + fi * 90.0));
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float n = hash(id + fi * 17.0);
      vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
      float dist = length((f - off * 0.6) * vec2(0.45, 1.0));
      float on = step(0.8, n) * (0.55 + 0.45 * sin(uTime * 1.5 + n * 50.0));
      lights += on * smoothstep(0.32, 0.0, dist) * (1.0 - fi * 0.25);
    }
    float band = smoothstep(0.0, -0.025, d) * (1.0 - smoothstep(-0.08, -0.55, d) * 0.7);
    ground += vec3(1.0, 0.38, 0.24) * lights * band * 1.1;
    ground += vec3(0.75, 0.35, 0.5) * exp(-abs(d) * 20.0) * 0.3;
    return d > 0.0 ? sky : ground;
  }

  float waveAt(vec2 uv, float shift) {
    float x = uv.x + shift;
    float horizon = 0.455 + (x - 0.5) * 0.07;
    float env = exp(-pow((x - 0.47) / 0.13, 2.0)) * 0.11 + exp(-pow((x - 0.62) / 0.06, 2.0)) * 0.06 + 0.006;
    float col = floor(x * 520.0);
    float h = env * (0.25 + 0.75 * hash(vec2(col, floor(uTime * 12.0))));
    float dy = abs(uv.y - horizon);
    float line = step(dy, h) * (0.55 + 0.45 * hash(vec2(col, 3.0)));
    float glow = exp(-dy / (env * 0.7 + 0.003)) * 0.5;
    float recorded = smoothstep(uPlay + 0.003, uPlay - 0.02, x);
    return (line * 0.9 + glow) * mix(0.18, 1.0, recorded);
  }

  void main() {
    vec2 uv = vUv;
    vec3 col = dusk(uv);
    float r = waveAt(uv, 0.0025);
    float gch = waveAt(uv, 0.0);
    float b = waveAt(uv, -0.0025);
    col += vec3(0.55, 0.62, 1.0) * vec3(r * 0.8, gch, b * 1.25);
    // Playhead.
    float ph = exp(-abs(uv.x - uPlay) * 900.0);
    col += vec3(0.6, 0.95, 1.0) * ph * 0.9;
    col = pow(max(col, 0.0), vec3(2.2)); // authored in sRGB; the output stage re-encodes
    // The HyperFrames monitor composition, once the page has it playing.
    col = mix(col, texture2D(uPicture, uv).rgb, uPictureMix);
    vec3 video = texture2D(uVideo, uv).rgb;
    col = mix(col, video, uVideoMix);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const BASIC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---------- Lens: tilt-shift focus, chromatic fringe, grain, vignette ----------
const LENS_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform float uFocusY;
  uniform float uBlur;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    float far = smoothstep(0.08, 0.5, abs(uv.y - uFocusY) + abs(uv.x - 0.5) * 0.35);
    float radius = far * uBlur;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996;
      float rr = sqrt(float(i) / 16.0) * radius;
      vec2 o = vec2(cos(a), sin(a)) * rr / uRes;
      acc += texture2D(tScene, uv + o).rgb;
      wsum += 1.0;
    }
    vec3 col = acc / wsum;
    // Fringe toward the edges.
    vec2 dir = (uv - 0.5) * 0.004 * far;
    col.r = mix(col.r, texture2D(tScene, uv + dir).r, 0.6);
    col.b = mix(col.b, texture2D(tScene, uv - dir).b, 0.6);
    float v = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(1.1, 1.3)));
    col *= mix(0.55, 1.0, v);
    col += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * 0.03;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// Camera shots, in screen coordinates. yaw > 0 films from the right, pitch > 0 from above.
const SHOTS = [
  { x: 14.6, y: 4.5, d: 4.6, yaw: -0.5, pitch: -0.1, roll: 0.07, focus: 0.5, blur: 9 }, // waveform close-up
  { x: 15.0, y: 4.9, d: 17, yaw: -0.3, pitch: -0.04, roll: 0.035, focus: 0.47, blur: 6 }, // monitor and interface
  { x: 16.5, y: 13.2, d: 7.5, yaw: -0.5, pitch: -0.18, roll: 0.06, focus: 0.5, blur: 8 }, // timeline, film strip
  { x: 27.6, y: 4.7, d: 8.6, yaw: 0.42, pitch: 0.06, roll: -0.04, focus: 0.5, blur: 7 }, // colour page: viewer and wheels
  { x: 16.0, y: 9.2, d: 25, yaw: -0.16, pitch: 0.42, roll: 0.02, focus: 0.55, blur: 3.5 }, // whole screen
];

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {THREE.Texture} [o.video] texture for the reel on the program monitor
 * @param {THREE.Texture} [o.picture] the program monitor picture (the site's HyperFrames composition)
 * @param {number} [o.pixelRatio]
 */
export function createWorkspace({ canvas, video, picture, pixelRatio = 1 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050506");
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);

  // The screen.
  const chrome = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SH),
    new THREE.MeshBasicMaterial({ map: paintChrome() }),
  );
  scene.add(chrome);

  // A thin bezel so the screen reads as an object at wide angles.
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(SW + 0.5, SH + 0.5), new THREE.MeshBasicMaterial({ color: "#121316" }));
  bezel.position.z = -0.02;
  scene.add(bezel);

  if (video) video.colorSpace = THREE.SRGBColorSpace;
  if (picture) picture.colorSpace = THREE.SRGBColorSpace;
  const monitorMat = new THREE.ShaderMaterial({
    vertexShader: BASIC_VERT,
    fragmentShader: MONITOR_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPlay: { value: 0 },
      uVideoMix: { value: 0 },
      uVideo: { value: video || new THREE.Texture() },
      uPictureMix: { value: 0 },
      uPicture: { value: picture || new THREE.Texture() },
    },
  });
  const monitor = new THREE.Mesh(new THREE.PlaneGeometry(MON.w, MON.h), monitorMat);
  monitor.position.copy(toWorld(MON.x + MON.w / 2, MON.y + MON.h / 2, 0.01));
  scene.add(monitor);
  const viewer = new THREE.Mesh(new THREE.PlaneGeometry(VIEW.w, VIEW.h), monitorMat);
  viewer.position.copy(toWorld(VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2, 0.01));
  scene.add(viewer);

  // Playheads: one across the timeline, glowing.
  const phMat = new THREE.MeshBasicMaterial({ color: "#5fb2ff", transparent: true, opacity: 0.95 });
  const playhead = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 7.7), phMat);
  scene.add(playhead);
  const phGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 7.7),
    new THREE.MeshBasicMaterial({ color: "#2d8ceb", transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(phGlow);
  const phHead = new THREE.Mesh(new THREE.CircleGeometry(0.14, 3), phMat);
  phHead.rotation.z = -Math.PI / 2;
  scene.add(phHead);

  // Colour wheel pucks.
  const pucks = WHEELS.map((w) => {
    const puck = new THREE.Mesh(new THREE.CircleGeometry(0.065, 24), new THREE.MeshBasicMaterial({ color: "#f2f2f2" }));
    puck.position.copy(toWorld(w.x, w.y, 0.02));
    scene.add(puck);
    return puck;
  });
  /** @param {number[][]} offsets per wheel, [dx, dy] in screen units from centre */
  function setWheels(offsets) {
    offsets.forEach(([dx, dy], k) => pucks[k].position.copy(toWorld(WHEELS[k].x + dx, WHEELS[k].y + dy, 0.02)));
  }

  // Dust motes catching the monitor light.
  const rand = seeded(23);
  const N = 500;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pts[i * 3] = (rand() - 0.5) * SW;
    pts[i * 3 + 1] = (rand() - 0.5) * SH;
    pts[i * 3 + 2] = 0.3 + rand() * 6;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: "#9fb8ff", size: 0.035, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  scene.add(dust);

  // Lens pass.
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const lensMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: LENS_FRAG,
    uniforms: {
      tScene: { value: target.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uFocusY: { value: 0.5 },
      uBlur: { value: 6 },
      uTime: { value: 0 },
    },
    depthTest: false,
  });
  const lensScene = new THREE.Scene();
  lensScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat));
  const lensCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let width = 1;
  let height = 1;
  function setSize(w, h) {
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    target.setSize(Math.round(w * pr), Math.round(h * pr));
    lensMat.uniforms.uRes.value.set(w * pr, h * pr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const pointer = { x: 0, y: 0 };
  function setPointer(x, y) {
    pointer.x = x;
    pointer.y = y;
  }

  // Where the pointer meets the screen, in screen units (null when it misses).
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  function pick(ndcX, ndcY) {
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const x = hit.x + SW / 2;
    const y = SH / 2 - hit.y;
    return x >= 0 && x <= SW && y >= 0 && y <= SH ? { x, y } : null;
  }

  let playheadAt = null; // 0..1 along the timeline, or null to drift
  let pictureMix = 0;
  const setPlayhead = (f) => (playheadAt = f);
  const setPictureMix = (m) => (pictureMix = m);
  // A live scope over the painted parade on the colour page, when the page provides one.
  let scopeMesh = null;
  function setScope(texture) {
    if (!scopeMesh) {
      scopeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.6), new THREE.MeshBasicMaterial());
      scopeMesh.position.copy(toWorld(29.7 + 0.95, 1.15 + 1.8, 0.01));
      scene.add(scopeMesh);
    }
    scopeMesh.material.map = texture;
    scopeMesh.material.needsUpdate = true;
  }

  let peek = 0; // 0..1, how far the camera leans toward the monitor shot
  const setPeek = (p) => (peek = p);

  const look = new THREE.Vector3();
  /**
   * @param {number} s     scroll position in stops, 0..STOPS-1
   * @param {number} time  seconds, for the waveform and lights
   * @param {number} reel  0..1, how far the reel has replaced the dusk on the monitor
   */
  function render(s, time = 0, reel = 0) {
    s = Math.min(STOPS - 1, Math.max(0, s));
    const k = Math.min(STOPS - 2, Math.floor(s));
    const e = smooth(clamp01(s - k));
    const a = SHOTS[k];
    const b = SHOTS[k + 1];
    const shot = {};
    for (const key of Object.keys(a)) shot[key] = mix(mix(a[key], b[key], e), SHOTS[1][key], peek);

    // Narrow screens need more distance to fit the same subject.
    const fit = Math.max(1, 1.5 / camera.aspect);
    const t = toWorld(shot.x, shot.y);
    const yaw = shot.yaw + pointer.x * 0.04;
    const pitch = shot.pitch + pointer.y * 0.03;
    const d = shot.d * fit;
    camera.position.set(
      t.x + Math.sin(yaw) * Math.cos(pitch) * d,
      t.y + Math.sin(pitch) * d,
      t.z + Math.cos(yaw) * Math.cos(pitch) * d,
    );
    camera.up.set(Math.sin(shot.roll), Math.cos(shot.roll), 0);
    camera.lookAt(look.copy(t));

    // The playhead follows the monitor picture when the page drives it; otherwise it sweeps the
    // timeline as you scroll, and drifts on its own.
    const at = playheadAt ?? ((s / (STOPS - 1)) * 0.8 + 0.08 + time * 0.004) % 1;
    const phX = mix(TIMELINE.x0, TIMELINE.x1, at);
    playhead.position.copy(toWorld(phX, 13.75, 0.03));
    phGlow.position.copy(toWorld(phX, 13.75, 0.025));
    phHead.position.copy(toWorld(phX, 10.0, 0.035));

    monitorMat.uniforms.uTime.value = time;
    monitorMat.uniforms.uPlay.value = 0.12 + ((time * 0.05 + s * 0.2) % 0.8);
    monitorMat.uniforms.uVideoMix.value = reel;
    monitorMat.uniforms.uPictureMix.value = pictureMix;

    dust.rotation.z = time * 0.01;
    dust.position.y = Math.sin(time * 0.2) * 0.2;

    lensMat.uniforms.uFocusY.value = shot.focus;
    lensMat.uniforms.uBlur.value = shot.blur * renderer.getPixelRatio();
    lensMat.uniforms.uTime.value = time;

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(lensScene, lensCam);
  }

  return { render, setSize, setPointer, setPlayhead, setPictureMix, setPeek, setScope, setWheels, pick, renderer };
}

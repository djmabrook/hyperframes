// The opening: a film strip waves across the page, scissors cut it, and the two halves hang
// at the left and right edges for the rest of the site.
// One scene, two hosts: the website drives `p` from scroll (site/js/site.js), and the
// HyperFrames composition beside this file drives it from timeline time so it can be
// previewed and rendered. Everything drawn is a function of `p` (0..1 through the opening)
// and `idle` (seconds of ambient sway), so scrolling back up plays the cut in reverse.
import * as THREE from "./assets/vendor/three-0.170.0.module.min.js";

export { THREE };

const L = 4; // length of each half, world units
const W = 0.74; // film width
const SEG = 160; // segments along each half
const FRAMES = 5; // picture frames per half

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const span = (p, a, b) => smooth(clamp01((p - a) / (b - a)));
const mix = (a, b, e) => a + (b - a) * e;

// Timing of the opening, in p.
export const BEATS = {
  scissorsIn: [0.1, 0.26],
  close: [0.27, 0.36],
  apart: [0.36, 0.56],
  edgeOn: [0.38, 0.52],
  scissorsOut: [0.56, 0.68],
  hang: [0.56, 0.8],
  vignetteOut: [0.36, 0.52],
  whiteOut: [0.8, 0.95],
};

/** Page background for a given p: warm off-white with a dark left edge, clearing to white. */
export function backgroundAt(p) {
  const w = span(p, ...BEATS.whiteOut);
  const warm = [226, 222, 214];
  const rgb = warm.map((c) => Math.round(mix(c, 255, w)));
  return {
    color: `rgb(${rgb.join(",")})`,
    vignette: 1 - span(p, ...BEATS.vignetteOut),
    glow: 1 - w,
  };
}

// ---------- Film texture: sprockets and gradient-wave pictures ----------
const ACCENTS = [
  ["#f2a65a", "#c4612f"],
  ["#36a3a6", "#1d5f73"],
  ["#e0568f", "#8a2f6e"],
  ["#4b55c9", "#25296e"],
  ["#2fb0a4", "#1b6a6a"],
];

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function paintFilm(first) {
  const fw = 512;
  const c = document.createElement("canvas");
  c.width = fw * FRAMES;
  c.height = Math.round((c.width / L) * W);
  const g = c.getContext("2d");
  const H = c.height;
  const band = Math.round(H * 0.15);
  const rand = seeded(97 + first * 13);

  g.fillStyle = "#121012";
  g.fillRect(0, 0, c.width, H);

  // Sprocket holes, both edges.
  g.fillStyle = "#f1eee8";
  const hw = Math.round(band * 0.42);
  const hh = Math.round(band * 0.5);
  for (let x = 8; x < c.width; x += Math.round(hw * 1.9)) {
    for (const y of [(band - hh) / 2, H - band + (band - hh) / 2]) {
      g.beginPath();
      g.roundRect(x, y, hw, hh, 3);
      g.fill();
    }
  }

  // Pictures.
  for (let k = 0; k < FRAMES; k++) {
    const x0 = k * fw + 6;
    const y0 = band + 4;
    const w = fw - 12;
    const h = H - band * 2 - 8;
    const [accent, deep] = ACCENTS[(first + k) % ACCENTS.length];
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();

    const sky = g.createLinearGradient(0, y0, 0, y0 + h);
    sky.addColorStop(0, "#1d1838");
    sky.addColorStop(1, "#3a2e6e");
    g.fillStyle = sky;
    g.fillRect(x0, y0, w, h);

    // Stars.
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 40; i++) g.fillRect(x0 + rand() * w, y0 + rand() * h * 0.45, 1.5, 1.5);

    const wave = (base, amp, freq, phase) => {
      g.beginPath();
      g.moveTo(x0, y0 + h);
      for (let x = 0; x <= w; x += 6) {
        g.lineTo(x0 + x, y0 + base * h + Math.sin((x / w) * Math.PI * freq + phase) * amp * h);
      }
      g.lineTo(x0 + w, y0 + h);
      g.closePath();
    };
    const phase = rand() * Math.PI * 2;

    // Accent ground wave.
    const ground = g.createLinearGradient(0, y0 + h * 0.5, 0, y0 + h);
    ground.addColorStop(0, accent);
    ground.addColorStop(1, deep);
    g.fillStyle = ground;
    wave(0.62, 0.07, 2.2, phase);
    g.fill();

    // The glowing orb, over the ground.
    const ox = x0 + w * (0.35 + rand() * 0.3);
    const oy = y0 + h * 0.66;
    const orb = g.createRadialGradient(ox, oy, 0, ox, oy, h * 0.42);
    orb.addColorStop(0, "rgba(255,247,226,1)");
    orb.addColorStop(0.45, "rgba(250,232,200,0.75)");
    orb.addColorStop(1, "rgba(250,232,200,0)");
    g.fillStyle = orb;
    g.fillRect(x0, y0, w, h);

    // Dark upper waves cut across the top of the orb.
    g.fillStyle = "#3d2f7a";
    g.beginPath();
    g.moveTo(x0, y0);
    for (let x = 0; x <= w; x += 6) g.lineTo(x0 + x, y0 + h * 0.46 + Math.sin((x / w) * Math.PI * 2.6 + phase + 1) * h * 0.08);
    g.lineTo(x0 + w, y0);
    g.closePath();
    g.globalAlpha = 0.9;
    g.fill();
    g.fillStyle = "#241d4d";
    g.beginPath();
    g.moveTo(x0, y0);
    for (let x = 0; x <= w; x += 6) g.lineTo(x0 + x, y0 + h * 0.3 + Math.sin((x / w) * Math.PI * 3 + phase + 2) * h * 0.06);
    g.lineTo(x0 + w, y0);
    g.closePath();
    g.globalAlpha = 1;
    g.fill();
    g.restore();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------- Ribbon geometry ----------
// A half is described by an origin, an orientation and a curvature profile κ(s). The strip bends
// about its width axis (like real film), so its length stays L in every pose and the pictures
// never stretch.
function ribbonGeometry() {
  const g = new THREE.BufferGeometry();
  const n = (SEG + 1) * 2;
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const uv = new Float32Array(n * 2);
  const idx = [];
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    uv.set([u, 1, u, 0], i * 4);
    if (i < SEG) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const tmpV = new THREE.Vector3();

/** Sample a pose: centre points and width vectors, SEG + 1 of each. */
function pose(origin, quat, kappa, len, out) {
  let phi = 0;
  let x = 0;
  let z = 0;
  const ds = len / SEG;
  const wv = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
  for (let i = 0; i <= SEG; i++) {
    tmpV.set(x, 0, z).applyQuaternion(quat).add(origin);
    out.c[i].copy(tmpV);
    out.w[i].copy(wv);
    const s = i * ds;
    phi += kappa(s) * ds;
    x += Math.cos(phi) * ds;
    z += Math.sin(phi) * ds;
  }
  return out;
}

function makePose() {
  return {
    c: Array.from({ length: SEG + 1 }, () => new THREE.Vector3()),
    w: Array.from({ length: SEG + 1 }, () => new THREE.Vector3()),
  };
}

const q = (x, y, z, order = "XYZ") => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));

// ---------- Scissors ----------
function scissors() {
  const group = new THREE.Group();
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.05, -0.1);
  bladeShape.lineTo(-0.075, 0.35);
  bladeShape.lineTo(-0.012, 1.75);
  bladeShape.lineTo(0.0, 1.8);
  bladeShape.lineTo(0.06, 0.35);
  bladeShape.lineTo(0.045, -0.1);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, metalness: 0.55, roughness: 0.18, clearcoat: 1, side: THREE.DoubleSide });
  const b1 = new THREE.Mesh(bladeGeo, steel);
  const b2 = new THREE.Mesh(bladeGeo, steel);
  b1.position.z = 0.02;
  b2.position.z = -0.05;
  b2.scale.x = -1;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.075, 24, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x141414, roughness: 0.25, clearcoat: 1 }),
  );
  ring.position.y = -0.48;
  const pivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.14, 16),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }),
  );
  pivot.rotation.x = Math.PI / 2;
  group.add(b1, b2, ring, pivot);
  return { group, b1, b2, materials: [steel, ring.material, pivot.material] };
}

// ---------- Studio light for reflections ----------
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0xd8d4cc);
  const panel = (w, h, pos, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }),
    );
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(6, 2, new THREE.Vector3(-4, 5, 3), 6);
  panel(4, 4, new THREE.Vector3(5, 2, 4), 3);
  panel(8, 1, new THREE.Vector3(0, -4, 5), 1.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {number} [o.pixelRatio]
 */
export function createFilmstrip({ canvas, pixelRatio = 1 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(35, 16 / 10, 0.1, 100);
  camera.position.set(0, 0, 12);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cbb5, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-4, 6, 8);
  scene.add(key);

  const halves = [0, 1].map((h) => {
    const map = paintFilm(h * FRAMES);
    const mat = new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.32,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      side: THREE.DoubleSide,
    });
    const geo = ribbonGeometry();
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { mesh, geo, map, a: makePose(), b: makePose(), c: makePose() };
  });
  const full = makePose2(SEG * 2);

  const sc = scissors();
  scene.add(sc.group);

  let aspect = 16 / 10;
  function setSize(w, h) {
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function makePose2(n) {
    return {
      c: Array.from({ length: n + 1 }, () => new THREE.Vector3()),
      w: Array.from({ length: n + 1 }, () => new THREE.Vector3()),
    };
  }

  // The whole strip before the cut: one ribbon of length 2L, waving.
  function poseFull(idle, k) {
    const len = 2 * L * k;
    let phi = 0;
    let x = 0;
    let z = 0;
    const n = SEG * 2;
    const ds = len / n;
    const origin = new THREE.Vector3(-3.95 * k, 0.95 * k, 2.4);
    const quat = q(0.05, -0.42, -0.085);
    const wv = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    for (let i = 0; i <= n; i++) {
      full.c[i].set(x, 0, z).applyQuaternion(quat).add(origin);
      full.w[i].copy(wv);
      const s = i * ds;
      phi += 0.11 * Math.sin(1.5 * (s / k) - idle * 1.1) * ds;
      x += Math.cos(phi) * ds;
      z += Math.sin(phi) * ds;
    }
    // Left half runs outer end → cut; right half runs outer end → cut too.
    for (let i = 0; i <= SEG; i++) {
      halves[0].a.c[i].copy(full.c[i]);
      halves[0].a.w[i].copy(full.w[i]);
      halves[1].a.c[i].copy(full.c[n - i]);
      halves[1].a.w[i].copy(full.w[n - i]).negate(); // reversed run, so its width flips too
    }
  }

  function render(p, idle = 0, film = 0) {
    p = clamp01(p);
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * 12;
    const visW = visH * aspect;
    const k = Math.min(1, Math.max(0.36, visW / 12)); // shrink everything on narrow screens
    const len = L * k;

    poseFull(idle, k);

    const sway = Math.sin(idle * 0.8) * 0.04;
    // Flying apart: diagonals, ends starting to curl.
    const curlSoft = (s) => 0.7 * smooth(clamp01((s / k - 2.6) / 1.4)) / k;
    pose(new THREE.Vector3(-4.6 * k, 2.1 * k, -0.6), q(0.25, 0.35, -0.62), curlSoft, len, halves[0].b);
    pose(new THREE.Vector3(4.6 * k, 2.1 * k, -0.6), q(0.25, -0.35, -2.52), curlSoft, len, halves[1].b);
    // Hanging at the edges, curled at the bottom; both hooks turn the same way.
    const edge = aspect < 1 ? visW / 2 - 0.3 : visW / 2 - 1.5 * k; // phones: hug the edges
    const curlHang = (s) => (0.05 * Math.sin((s / k) * 2 + idle * 0.9) + 3.6 * smooth(clamp01((s / k - 2.85) / 0.55))) / k;
    pose(new THREE.Vector3(-edge, 2.3 * k, 0), new THREE.Quaternion().multiplyQuaternions(q(0, 0.9 + sway, 0), q(0, 0, -Math.PI / 2)), curlHang, len, halves[0].c);
    pose(new THREE.Vector3(edge - 0.6 * k, 2.3 * k, 0.3), new THREE.Quaternion().multiplyQuaternions(q(0, 0.35 - sway, 0), q(0, 0, -Math.PI / 2)), curlHang, len, halves[1].c);

    const eApart = span(p, ...BEATS.apart);
    const eHang = span(p, ...BEATS.hang);
    const w = W * k;
    for (const h of halves) {
      const pos = h.geo.attributes.position.array;
      for (let i = 0; i <= SEG; i++) {
        // Stagger: the cut end leads, the outer end follows.
        const lag = (1 - i / SEG) * 0.25;
        const e1 = clamp01((eApart - lag) / (1 - lag));
        const e2 = clamp01((eHang - lag * 0.6) / (1 - lag * 0.6));
        const c = tmpV.copy(h.a.c[i]).lerp(h.b.c[i], e1).lerp(h.c.c[i], e2);
        const wv = h.a.w[i].clone().lerp(h.b.w[i], e1).lerp(h.c.w[i], e2).normalize().multiplyScalar(w / 2);
        pos.set([c.x + wv.x, c.y + wv.y, c.z + wv.z, c.x - wv.x, c.y - wv.y, c.z - wv.z], i * 6);
      }
      h.geo.attributes.position.needsUpdate = true;
      h.geo.computeVertexNormals();
      h.geo.computeBoundingSphere();
      h.map.offset.x = film;
    }

    // Scissors: rise to the cut point, close, turn edge-on, leave.
    const cut = full.c[SEG];
    const inE = span(p, ...BEATS.scissorsIn);
    const outE = span(p, ...BEATS.scissorsOut);
    sc.group.visible = inE > 0 && outE < 1;
    sc.group.position.set(cut.x, cut.y - 0.62 * k - (1 - inE) * 7 + outE * 9, cut.z + 0.2);
    sc.group.scale.setScalar(1.3 * k);
    const open = 0.17 * (1 - span(p, ...BEATS.close));
    sc.b1.rotation.z = -open;
    sc.b2.rotation.z = open;
    sc.group.rotation.set(0, span(p, ...BEATS.edgeOn) * (Math.PI / 2), 0.02);

    renderer.render(scene, camera);
  }

  return { render, setSize, renderer };
}

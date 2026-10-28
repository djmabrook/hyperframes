/* VHS tape unspooling over the TV after it powers off.

   Each stream is a chain of particles (position-based dynamics, Verlet) fed
   down from an off-screen reel above the frame. Real tape remembers the reel:
   chord constraints over several spans (2, 3, 5, 8, 13 particles apart) hold a
   loose helix, so the ribbon curls into springy loops that gravity stretches,
   the way spilled tape hangs. Particles collide with each other (within and
   across streams) so loops catch and tangle instead of passing through, and
   the mouse or a finger is a capsule along the view ray that shoves and drags
   whatever it brushes.

   The ribbon is drawn 12.7 mm wide at the TV's scale, with its width turned to
   the curve's binormal (tape bends across its width, never in its own plane).
   Two sides: the matte brown oxide and the glossy black backing. It is lit by
   the photograph's window light (upper left) and casts soft shadows onto the
   wall and TV.

   Units: #tv-shot pixels (the 1920×1080 TV photograph), y down, z toward the
   viewer from the wall. scroll.js publishes where that photograph is on screen
   (window.__proxyStage + "proxy-stage" events) and how far to unspool (feed).
*/
import * as THREE from "../motion/landing/assets/vendor/three/three.module.js";

const canvas = document.getElementById("tape");
const small = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 640;
// Phones get fewer, coarser streams, fewer solver passes and a smaller shadow map.
const Q = small
  ? { streams: 4, maxN: 64, iters: 7, shadow: 1024, dpr: 1.5, sub: 2 }
  : { streams: 6, maxN: 110, iters: 10, shadow: 2048, dpr: 2, sub: 3 };

const TAPE_WIDTH = 22; // 12.7 mm on this 13" Trinitron (glass ≈ 26 cm = 508 px)
const GRAVITY = 650; // px/s². Real g at this scale is ~19000, but tape this light is mostly carried by its own springiness and the air.
const STEP = 1 / 60;
const FEED_RATE = 0.7; // max unspool progress per second, so a flung scroll still reads as tape
// Curl memory: overlapping windows of WINDOW particles are shape-matched to the
// tape's rest curve (a curly, irregular helix). CURL is how hard each pass pulls
// toward it: enough to hold loops against gravity, soft enough to stretch.
const WINDOW = 8;
const CURL = 0.6;
const POINTER_RADIUS = small ? 34 : 46; // CSS px
const FOV = 24;

let stage = window.__proxyStage || null;
let built = null; // { view, streams, total, ... }
let feed = 0;
let raf = 0,
  last = 0,
  acc = 0,
  idle = 0;

// ---------------------------------------------------------------- rendering

const renderer = (() => {
  try {
    return new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
  } catch {
    return null;
  }
})();
if (renderer) {
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);

// The room, for reflections on the glossy side: warm plaster, the window on the
// left (where the photograph's light and the reflection in the TV glass come
// from), a soft ceiling glow.
if (renderer) {
  const room = new THREE.Scene();
  room.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.32, 0.29, 0.25),
        side: THREE.BackSide,
      }),
    ),
  );
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.6) }),
  );
  win.position.set(-4.9, 1, 1.5);
  win.rotation.y = Math.PI / 2;
  room.add(win);
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.35) }),
  );
  ceiling.position.set(0, 4.9, 0);
  ceiling.rotation.x = Math.PI / 2;
  room.add(ceiling);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
}

const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(Q.shadow, Q.shadow);
key.shadow.radius = small ? 3 : 5;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 1.2;
scene.add(key, key.target);
// Direction toward the light: up, left and in front, matching the TV's shadow
// in the photograph (it falls down and to the right).
const KEY_DIR = new THREE.Vector3(-0.42, 0.55, 0.72).normalize();
scene.add(new THREE.HemisphereLight(0xf6ece0, 0x6b5a4c, 0.7));

// Oxide side: dull brown-black. Backing: glossy black.
const oxide = new THREE.MeshStandardMaterial({
  color: 0x1f150f,
  roughness: 0.55,
  metalness: 0,
  envMapIntensity: 0.7,
  side: THREE.FrontSide,
  shadowSide: THREE.DoubleSide,
});
const backing = new THREE.MeshPhysicalMaterial({
  color: 0x0e0c0b,
  roughness: 0.24,
  metalness: 0,
  clearcoat: 0.55,
  clearcoatRoughness: 0.12,
  envMapIntensity: 0.75,
  side: THREE.BackSide,
});
const geometry = new THREE.BufferGeometry();
const front = new THREE.Mesh(geometry, oxide);
const back = new THREE.Mesh(geometry, backing);
front.castShadow = true;
front.receiveShadow = back.receiveShadow = true;
front.frustumCulled = back.frustumCulled = false;
scene.add(front, back);

// Shadow catcher on the wall/TV plane: only the tape's shadow, warm like the
// TV's own shadow in the photograph.
const catcher = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ color: 0x3b2412, opacity: 0.24 }),
);
catcher.receiveShadow = true;
scene.add(catcher);

// ---------------------------------------------------------------- simulation

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The visible window in #tv-shot px.
function viewOf(s) {
  return { left: -s.ox / s.k, top: -s.oy / s.k, w: s.width / s.k, h: s.height / s.k };
}

function build(view) {
  const rand = rng(1979);
  const seg = Math.max(7, Math.min(26, view.h / 55));
  const radius = Math.max(TAPE_WIDTH * 0.42, seg * 0.5);
  const streams = [];
  let total = 0;
  for (let i = 0; i < Q.streams; i++) {
    const u = (i + 0.5) / Q.streams;
    const length = view.h * (1.15 + rand() * 0.6);
    const n = Math.min(Q.maxN, Math.ceil(length / seg) + 1);
    const s = {
      offset: total,
      n,
      seg: length / (n - 1),
      anchor: [
        view.left + view.w * (0.1 + 0.8 * u) + (rand() - 0.5) * view.w * 0.08,
        view.top - 30,
        24 + rand() * 120,
      ],
      // Unspools a little after the stream before it, so the tape arrives in strands.
      delay: (i % 2 ? 0.12 : 0) + rand() * 0.25,
      released: 0,
    };
    // Reel memory: a loose helix, its radius wandering along the length.
    const R = 32 + rand() * 70;
    const pitch = s.seg * (0.18 + rand() * 0.3);
    const wobble = rand() * 10;
    // The tape comes off the reel already curled: the feed guide is that helix.
    s.coil = {
      R,
      pitch,
      theta: 2 * Math.asin(Math.min(1, Math.sqrt(s.seg * s.seg - pitch * pitch) / (2 * R))),
      phase: rand() * Math.PI * 2,
      hand: rand() < 0.5 ? -1 : 1,
    };
    // The rest curve: integrate a wandering curvature (the reel radius) and a
    // torsion that drifts and changes sign, so the coil reverses here and there
    // the way real spilled tape does.
    const curve = new Float32Array(n * 3);
    let T = [0, 1, 0],
      N = [1, 0, 0],
      Bn = [0, 0, 1];
    const tw = rand() * 10,
      tf = 0.05 + rand() * 0.08;
    for (let j = 1; j < n; j++) {
      for (let c = 0; c < 3; c++) curve[j * 3 + c] = curve[(j - 1) * 3 + c] + T[c] * s.seg;
      const Rj = R * (0.6 + 0.8 * (0.5 + 0.5 * Math.sin(wobble + j * 0.11)));
      const kappa = (s.seg / Rj) * (rand() < 0.04 ? 0.2 : 1);
      const tau = (s.seg / R) * 1.1 * Math.sin(tw + j * tf);
      // Bend about the binormal, then twist about the tangent.
      [T, N] = rotatePair(T, N, kappa);
      [N, Bn] = rotatePair(N, Bn, tau);
    }
    // Rest offsets of each window from its own centroid.
    const windows = Math.max(0, n - WINDOW + 1);
    s.windows = windows;
    s.restQ = new Float32Array(windows * WINDOW * 3);
    s.rot = new Float32Array(windows * 4);
    for (let w = 0; w < windows; w++) {
      const c = [0, 0, 0];
      for (let i = 0; i < WINDOW; i++)
        for (let d = 0; d < 3; d++) c[d] += curve[(w + i) * 3 + d] / WINDOW;
      for (let i = 0; i < WINDOW; i++)
        for (let d = 0; d < 3; d++)
          s.restQ[(w * WINDOW + i) * 3 + d] = curve[(w + i) * 3 + d] - c[d];
      s.rot[w * 4 + 3] = 1;
    }
    streams.push(s);
    total += n;
  }
  const pos = new Float32Array(total * 3);
  const prev = new Float32Array(total * 3);
  const inv = new Float32Array(total);
  const nrm = new Float32Array(total * 3);
  const owner = new Int32Array(total);
  streams.forEach((s, si) => {
    for (let j = 0; j < s.n; j++) {
      const g = s.offset + j;
      owner[g] = si;
      guide(s, j, pos, g);
      prev.set(pos.subarray(g * 3, g * 3 + 3), g * 3);
      nrm[g * 3 + 2] = 1;
    }
  });
  // Geometry: Catmull-Rom subdivided, two vertices per sample.
  let verts = 0;
  const index = [];
  for (const s of streams) {
    const m = (s.n - 1) * Q.sub + 1;
    s.vOffset = verts;
    s.m = m;
    for (let i = 0; i < m - 1; i++) {
      const a = (verts + i) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    verts += m;
  }
  // Release the old GPU buffers before replacing their attributes on resize.
  geometry.dispose();
  geometry.setIndex(index);
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 6), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(verts * 6), 3));
  const cells = 4096;
  return {
    view,
    seg,
    radius,
    streams,
    total,
    pos,
    prev,
    inv,
    nrm,
    owner,
    head: new Int32Array(cells),
    next: new Int32Array(total),
    cellCoords: new Int32Array(total * 3),
    cells,
    samples: new Float32Array(Math.max(...streams.map((s) => s.m)) * 3),
  };
}

// Where particle j sits on the feed guide: the reel's coil, rising from the
// anchor and sliding down (turning as it goes) as tape is released. j = 0 is
// the free end.
function guide(s, j, out, g) {
  const c = s.coil;
  const u = j - s.released;
  const a = c.phase + c.hand * u * c.theta;
  out[g * 3] = s.anchor[0] + c.R * Math.cos(a);
  out[g * 3 + 1] = s.anchor[1] - u * c.pitch;
  out[g * 3 + 2] = s.anchor[2] + c.R * 0.6 * Math.sin(a);
}

const pointer = { on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 };
const tmp = new Float32Array(3);

function step(B) {
  const { pos, prev, inv, nrm, streams } = B;
  const g2 = GRAVITY * STEP * STEP;
  // Release along the guide.
  for (const s of streams) {
    const f = Math.max(0, Math.min(1, (feed - s.delay) / (1 - s.delay)));
    s.released = f * (s.n - 1);
    for (let j = 0; j < s.n; j++) {
      const g = s.offset + j;
      const i3 = g * 3;
      // The last particle stays on the reel; the rest are free once released.
      const free = j < s.released && j < s.n - 1;
      if (free) {
        inv[g] = 1;
        let vx = (pos[i3] - prev[i3]) * 0.996,
          vy = (pos[i3 + 1] - prev[i3 + 1]) * 0.996,
          vz = (pos[i3 + 2] - prev[i3 + 2]) * 0.996;
        // Flat tape falls like paper: motion across its face meets far more air.
        const vn = vx * nrm[i3] + vy * nrm[i3 + 1] + vz * nrm[i3 + 2];
        vx -= nrm[i3] * vn * 0.14;
        vy -= nrm[i3 + 1] * vn * 0.14;
        vz -= nrm[i3 + 2] * vn * 0.14;
        prev[i3] = pos[i3];
        prev[i3 + 1] = pos[i3 + 1];
        prev[i3 + 2] = pos[i3 + 2];
        pos[i3] += vx;
        pos[i3 + 1] += vy + g2;
        pos[i3 + 2] += vz;
      } else {
        inv[g] = 0;
        guide(s, j, tmp, 0);
        prev[i3] = pos[i3];
        prev[i3 + 1] = pos[i3 + 1];
        prev[i3 + 2] = pos[i3 + 2];
        // Reeling back in pulls loose tape up rather than teleporting it.
        const d = Math.hypot(tmp[0] - pos[i3], tmp[1] - pos[i3 + 1], tmp[2] - pos[i3 + 2]);
        const k = d > s.seg * 1.5 ? 0.22 : 1;
        pos[i3] += (tmp[0] - pos[i3]) * k;
        pos[i3 + 1] += (tmp[1] - pos[i3 + 1]) * k;
        pos[i3 + 2] += (tmp[2] - pos[i3 + 2]) * k;
      }
    }
  }
  if (pointer.on) brush(B);
  for (let it = 0; it < Q.iters; it++) {
    for (const s of streams) {
      curl(B, s);
      for (let j = 0; j + 1 < s.n; j++) link(B, s.offset + j, s.offset + j + 1, s.seg, 1);
    }
    if (it === Q.iters >> 1 || it === Q.iters - 1) collide(B);
    // The wall and the TV front: tape stays in front of them.
    const minZ = TAPE_WIDTH * 0.3;
    for (let g = 0; g < B.total; g++) if (inv[g] && pos[g * 3 + 2] < minZ) pos[g * 3 + 2] = minZ;
  }
}

// Rotate the orthonormal pair (a, b) by angle t in their plane.
function rotatePair(a, b, t) {
  const c = Math.cos(t),
    s = Math.sin(t);
  return [
    [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s],
    [b[0] * c - a[0] * s, b[1] * c - a[1] * s, b[2] * c - a[2] * s],
  ];
}

// Shape matching per window: find the rotation that best maps the rest curve
// onto the current particles (Müller et al. 2016, warm-started quaternion),
// then pull the particles toward the rotated rest shape.
const A = new Float32Array(9);
function curl(B, s) {
  const { pos, inv } = B;
  const share = CURL / WINDOW;
  for (let w = 0; w < s.windows; w++) {
    const base = s.offset + w;
    let free = 0;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let i = 0; i < WINDOW; i++) {
      const g3 = (base + i) * 3;
      cx += pos[g3];
      cy += pos[g3 + 1];
      cz += pos[g3 + 2];
      free += inv[base + i];
    }
    if (!free) continue;
    cx /= WINDOW;
    cy /= WINDOW;
    cz /= WINDOW;
    A.fill(0);
    const q0 = w * WINDOW * 3;
    for (let i = 0; i < WINDOW; i++) {
      const g3 = (base + i) * 3;
      const px = pos[g3] - cx,
        py = pos[g3 + 1] - cy,
        pz = pos[g3 + 2] - cz;
      const rx = s.restQ[q0 + i * 3],
        ry = s.restQ[q0 + i * 3 + 1],
        rz = s.restQ[q0 + i * 3 + 2];
      // A = Σ p qᵀ, row-major
      A[0] += px * rx;
      A[1] += px * ry;
      A[2] += px * rz;
      A[3] += py * rx;
      A[4] += py * ry;
      A[5] += py * rz;
      A[6] += pz * rx;
      A[7] += pz * ry;
      A[8] += pz * rz;
    }
    const qi = w * 4;
    extractRotation(A, s.rot, qi);
    const x = s.rot[qi],
      y = s.rot[qi + 1],
      z = s.rot[qi + 2],
      ww = s.rot[qi + 3];
    // Rotation matrix from the quaternion.
    const m00 = 1 - 2 * (y * y + z * z),
      m01 = 2 * (x * y - z * ww),
      m02 = 2 * (x * z + y * ww),
      m10 = 2 * (x * y + z * ww),
      m11 = 1 - 2 * (x * x + z * z),
      m12 = 2 * (y * z - x * ww),
      m20 = 2 * (x * z - y * ww),
      m21 = 2 * (y * z + x * ww),
      m22 = 1 - 2 * (x * x + y * y);
    for (let i = 0; i < WINDOW; i++) {
      const g = base + i;
      if (!inv[g]) continue;
      const g3 = g * 3;
      const rx = s.restQ[q0 + i * 3],
        ry = s.restQ[q0 + i * 3 + 1],
        rz = s.restQ[q0 + i * 3 + 2];
      pos[g3] += (cx + m00 * rx + m01 * ry + m02 * rz - pos[g3]) * share;
      pos[g3 + 1] += (cy + m10 * rx + m11 * ry + m12 * rz - pos[g3 + 1]) * share;
      pos[g3 + 2] += (cz + m20 * rx + m21 * ry + m22 * rz - pos[g3 + 2]) * share;
    }
  }
}

function extractRotation(A, q, offset) {
  for (let it = 0; it < 4; it++) {
    const x = q[offset],
      y = q[offset + 1],
      z = q[offset + 2],
      w = q[offset + 3];
    // Columns of R(q), kept as scalars: this runs thousands of times per frame.
    const r00 = 1 - 2 * (y * y + z * z),
      r01 = 2 * (x * y + z * w),
      r02 = 2 * (x * z - y * w);
    const r10 = 2 * (x * y - z * w),
      r11 = 1 - 2 * (x * x + z * z),
      r12 = 2 * (y * z + x * w);
    const r20 = 2 * (x * z + y * w),
      r21 = 2 * (y * z - x * w),
      r22 = 1 - 2 * (x * x + y * y);
    const ox = r01 * A[6] - r02 * A[3] + r11 * A[7] - r12 * A[4] + r21 * A[8] - r22 * A[5];
    const oy = r02 * A[0] - r00 * A[6] + r12 * A[1] - r10 * A[7] + r22 * A[2] - r20 * A[8];
    const oz = r00 * A[3] - r01 * A[0] + r10 * A[4] - r11 * A[1] + r20 * A[5] - r21 * A[2];
    const dot =
      r00 * A[0] +
      r01 * A[3] +
      r02 * A[6] +
      r10 * A[1] +
      r11 * A[4] +
      r12 * A[7] +
      r20 * A[2] +
      r21 * A[5] +
      r22 * A[8];
    const inv = 1 / (Math.abs(dot) + 1e-9);
    const wx = ox * inv,
      wy = oy * inv,
      wz = oz * inv;
    const angle = Math.hypot(wx, wy, wz);
    if (angle < 1e-9) break;
    const h = Math.sin(angle / 2) / angle;
    const dx = wx * h,
      dy = wy * h,
      dz = wz * h,
      dw = Math.cos(angle / 2);
    // q = dq * q
    const nx = dw * x + dx * w + dy * z - dz * y,
      ny = dw * y - dx * z + dy * w + dz * x,
      nz = dw * z + dx * y - dy * x + dz * w,
      nw = dw * w - dx * x - dy * y - dz * z;
    const l = Math.hypot(nx, ny, nz, nw) || 1;
    q[offset] = nx / l;
    q[offset + 1] = ny / l;
    q[offset + 2] = nz / l;
    q[offset + 3] = nw / l;
  }
}

function link(B, a, b, rest, stiff) {
  const { pos, inv } = B;
  const wa = inv[a],
    wb = inv[b],
    w = wa + wb;
  if (!w) return;
  const a3 = a * 3,
    b3 = b * 3;
  const dx = pos[b3] - pos[a3],
    dy = pos[b3 + 1] - pos[a3 + 1],
    dz = pos[b3 + 2] - pos[a3 + 2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  const c = ((len - rest) / (len * w)) * stiff;
  pos[a3] += dx * c * wa;
  pos[a3 + 1] += dy * c * wa;
  pos[a3 + 2] += dz * c * wa;
  pos[b3] -= dx * c * wb;
  pos[b3 + 1] -= dy * c * wb;
  pos[b3 + 2] -= dz * c * wb;
}

// Particle-particle contact through a spatial hash, so loops catch on each
// other and tangle. Neighbours along the same strand are skipped.
function collide(B) {
  const { pos, inv, head, next, cells, cellCoords, owner, radius } = B;
  const size = radius * 2;
  head.fill(-1);
  for (let g = 0; g < B.total; g++) {
    if (!inv[g]) continue;
    const g3 = g * 3;
    const cx = (cellCoords[g3] = Math.floor(pos[g3] / size));
    const cy = (cellCoords[g3 + 1] = Math.floor(pos[g3 + 1] / size));
    const cz = (cellCoords[g3 + 2] = Math.floor(pos[g3 + 2] / size));
    const c = ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) & (cells - 1);
    next[g] = head[c];
    head[c] = g;
  }
  const min2 = size * size;
  for (let a = 0; a < B.total; a++) {
    if (!inv[a]) continue;
    const a3 = a * 3;
    const cx = cellCoords[a3],
      cy = cellCoords[a3 + 1],
      cz = cellCoords[a3 + 2];
    for (let ix = -1; ix <= 1; ix++)
      for (let iy = -1; iy <= 1; iy++)
        for (let iz = -1; iz <= 1; iz++) {
          const c =
            (((cx + ix) * 73856093) ^ ((cy + iy) * 19349663) ^ ((cz + iz) * 83492791)) &
            (cells - 1);
          for (let b = head[c]; b !== -1; b = next[b]) {
            if (b <= a) continue;
            if (owner[a] === owner[b] && b - a <= 3) continue;
            const b3 = b * 3;
            // Hash buckets can alias, including within these 27 neighbours.
            if (
              cellCoords[b3] !== cx + ix ||
              cellCoords[b3 + 1] !== cy + iy ||
              cellCoords[b3 + 2] !== cz + iz
            )
              continue;
            // Earlier contacts may already have moved a; use its current position.
            const dx = pos[b3] - pos[a3],
              dy = pos[b3 + 1] - pos[a3 + 1],
              dz = pos[b3 + 2] - pos[a3 + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= min2 || d2 < 1e-8) continue;
            const d = Math.sqrt(d2);
            const push = ((size - d) / d) * 0.5;
            pos[a3] -= dx * push;
            pos[a3 + 1] -= dy * push;
            pos[a3 + 2] -= dz * push;
            pos[b3] += dx * push;
            pos[b3 + 1] += dy * push;
            pos[b3 + 2] += dz * push;
          }
        }
  }
}

// The pointer is a capsule along the view ray: whatever it touches is pushed
// out of the way and dragged along with the hand's motion.
function brush(B) {
  const { pos, prev, inv } = B;
  const s = stage;
  const cam = camera.position;
  // Camera in sim coordinates (y down).
  const ccx = cam.x,
    ccy = -cam.y,
    ccz = cam.z;
  const tx = (pointer.x - s.ox) / s.k,
    ty = (pointer.y - s.oy) / s.k;
  let dx = tx - ccx,
    dy = ty - ccy,
    dz = -ccz;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const R = POINTER_RADIUS / s.k;
  const pvx = pointer.vx / s.k,
    pvy = pointer.vy / s.k;
  for (let g = 0; g < B.total; g++) {
    if (!inv[g]) continue;
    const g3 = g * 3;
    const px = pos[g3] - ccx,
      py = pos[g3 + 1] - ccy,
      pz = pos[g3 + 2] - ccz;
    const t = px * dx + py * dy + pz * dz;
    const ox = px - dx * t,
      oy = py - dy * t,
      oz = pz - dz * t;
    // The capsule's radius grows with depth like the view does; R is at the wall.
    const r = R * (t / dl);
    const d = Math.hypot(ox, oy, oz);
    if (d >= r) continue;
    const falloff = 1 - d / r;
    let nx = ox,
      ny = oy,
      nz = oz;
    if (d < 1e-3) {
      nx = pvx || 1;
      ny = pvy;
      nz = 0;
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const out = (r - d) * 0.6;
    pos[g3] += (nx / nl) * out;
    pos[g3 + 1] += (ny / nl) * out;
    pos[g3 + 2] += (nz / nl) * out;
    // Drag: hand velocity (per step) handed to the tape it touches.
    prev[g3] -= pvx * 0.55 * falloff;
    prev[g3 + 1] -= pvy * 0.55 * falloff;
  }
}

// ---------------------------------------------------------------- drawing

function catmull(p, i0, i1, i2, i3, t, out) {
  const t2 = t * t,
    t3 = t2 * t;
  for (let c = 0; c < 3; c++) {
    const a = p[i0 * 3 + c],
      b = p[i1 * 3 + c],
      d = p[i2 * 3 + c],
      e = p[i3 * 3 + c];
    out[c] =
      0.5 *
      (2 * b + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3);
  }
}

const P = new Float32Array(3);
function draw(B) {
  const position = geometry.attributes.position.array;
  const normal = geometry.attributes.normal.array;
  const half = TAPE_WIDTH / 2;
  const S = B.samples;
  for (const s of B.streams) {
    const o = s.offset;
    // 1. Smooth samples (sim coordinates).
    for (let i = 0; i < s.m; i++) {
      const j = Math.min(s.n - 2, Math.floor(i / Q.sub));
      const t = i / Q.sub - j;
      catmull(B.pos, o + Math.max(0, j - 1), o + j, o + j + 1, o + Math.min(s.n - 1, j + 2), t, P);
      S[i * 3] = P[0];
      S[i * 3 + 1] = P[1];
      S[i * 3 + 2] = P[2];
    }
    // 2. Frame from the reel end down to the free end: the width starts level
    //    (facing the viewer as it comes off the reel), is parallel-transported
    //    along the tape, and turns toward the binormal wherever the tape bends.
    let wx = 1,
      wy = 0,
      wz = 0;
    for (let i = s.m - 1; i >= 0; i--) {
      const a = Math.max(0, i - 1),
        b = Math.min(s.m - 1, i + 1);
      // Tangent toward increasing index (toward the reel).
      let tx = S[b * 3] - S[a * 3],
        ty = S[b * 3 + 1] - S[a * 3 + 1],
        tz = S[b * 3 + 2] - S[a * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      let d = wx * tx + wy * ty + wz * tz;
      wx -= tx * d;
      wy -= ty * d;
      wz -= tz * d;
      if (i > 0 && i < s.m - 1) {
        const e1x = S[i * 3] - S[a * 3],
          e1y = S[i * 3 + 1] - S[a * 3 + 1],
          e1z = S[i * 3 + 2] - S[a * 3 + 2];
        const e2x = S[b * 3] - S[i * 3],
          e2y = S[b * 3 + 1] - S[i * 3 + 1],
          e2z = S[b * 3 + 2] - S[i * 3 + 2];
        let bx = e1y * e2z - e1z * e2y,
          by = e1z * e2x - e1x * e2z,
          bz = e1x * e2y - e1y * e2x;
        const bl = Math.hypot(bx, by, bz);
        const l1 = Math.hypot(e1x, e1y, e1z),
          l2 = Math.hypot(e2x, e2y, e2z);
        const bend = bl / (l1 * l2 + 1e-6); // sine of the turn angle
        if (bl > 1e-6) {
          bx /= bl;
          by /= bl;
          bz /= bl;
          if (bx * wx + by * wy + bz * wz < 0) {
            bx = -bx;
            by = -by;
            bz = -bz;
          }
          const k = Math.min(1, bend * 8) * 0.3;
          wx += (bx - wx) * k;
          wy += (by - wy) * k;
          wz += (bz - wz) * k;
        }
      }
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl;
      wy /= wl;
      wz /= wl;
      // Face normal n = w × t, matching the triangle winding (sim coords).
      const nx = wy * tz - wz * ty,
        ny = wz * tx - wx * tz,
        nz = wx * ty - wy * tx;
      if (i % Q.sub === 0) {
        const g3 = (o + i / Q.sub) * 3;
        B.nrm[g3] = nx;
        B.nrm[g3 + 1] = ny;
        B.nrm[g3 + 2] = nz;
      }
      // To three.js space (y up). Flipping y mirrors the frame, so the face
      // normal flips sign too: keep n consistent with the mirrored winding.
      const v = (s.vOffset + i) * 6;
      const x = S[i * 3],
        y = S[i * 3 + 1],
        z = S[i * 3 + 2];
      position[v] = x - wx * half;
      position[v + 1] = -(y - wy * half);
      position[v + 2] = z - wz * half;
      position[v + 3] = x + wx * half;
      position[v + 4] = -(y + wy * half);
      position[v + 5] = z + wz * half;
      normal[v] = normal[v + 3] = -nx;
      normal[v + 1] = normal[v + 4] = ny;
      normal[v + 2] = normal[v + 5] = -nz;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- framing

const renderSize = new THREE.Vector2();
function frameCamera() {
  const s = stage;
  const dpr = Math.min(devicePixelRatio || 1, Q.dpr);
  // setPixelRatio calls setSize internally; avoid reallocating/clearing the
  // drawing buffer for every feed or strain update.
  if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
  renderer.getSize(renderSize);
  if (renderSize.x !== s.width || renderSize.y !== s.height)
    renderer.setSize(s.width, s.height, false);
  const v = viewOf(s);
  const cx = v.left + v.w / 2,
    cy = v.top + v.h / 2;
  const dist = v.h / 2 / Math.tan((FOV * Math.PI) / 360);
  camera.aspect = s.width / s.height;
  camera.near = dist * 0.05;
  camera.far = dist * 4;
  camera.position.set(cx, -cy, dist);
  camera.lookAt(cx, -cy, 0);
  camera.updateProjectionMatrix();
  const span = Math.max(v.w, v.h) * 0.8 + 300;
  key.target.position.set(cx, -cy, 0);
  key.position.copy(key.target.position).addScaledVector(KEY_DIR, 3000);
  Object.assign(key.shadow.camera, {
    left: -span,
    right: span,
    top: span,
    bottom: -span,
    near: 100,
    far: 6000,
  });
  key.shadow.camera.updateProjectionMatrix();
  catcher.position.set(cx, -cy, 0);
  catcher.scale.set(v.w * 3, v.h * 3, 1);
}

function onStage(s) {
  stage = s;
  if (!renderer || !s) return;
  if (!s.active && !built) return;
  const v = viewOf(s);
  if (!built || Math.abs(v.h - built.view.h) / built.view.h > 0.15) {
    // A different framing (rotation, a phone toolbar is not enough) gets its own
    // tape at the right scale; it starts from wherever the scroll has fed to.
    built = build(v);
  }
  frameCamera();
  wake();
}

function wake() {
  if (!raf && renderer) {
    last = performance.now();
    raf = requestAnimationFrame(frameLoop);
  }
}

function frameLoop(now) {
  raf = 0;
  if (!built || !stage) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const target = stage.active ? stage.feed : 0;
  const maxStep = FEED_RATE * dt;
  feed += Math.max(-maxStep * 1.6, Math.min(maxStep, target - feed));
  // Pointer velocity in CSS px per physics step.
  pointer.vx = (pointer.x - pointer.px) / Math.max(1, dt / STEP);
  pointer.vy = (pointer.y - pointer.py) / Math.max(1, dt / STEP);
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  acc = Math.min(acc + dt, STEP * 3);
  while (acc >= STEP) {
    step(built);
    acc -= STEP;
  }
  const out = feed > 0.0005 || built.streams.some((s) => s.released > 0.001);
  canvas.classList.toggle("live", out);
  if (out) draw(built);
  // Sleep once the tape is fully reeled in (or the stage has scrolled away)
  // and nothing is settling.
  const onScreen = stage.active || out;
  idle = !out && target === 0 ? idle + dt : 0;
  if (onScreen && idle < 1) raf = requestAnimationFrame(frameLoop);
}

// The tape layer is fixed to the viewport. It stays put while the stage
// scrolls away (so the strands dangle over the wall that follows, #notes) and
// scrolls off with that wall's bottom edge, or the landing's when it is absent.
function place() {
  const holder = document.getElementById("notes") || document.getElementById("landing");
  const off = Math.min(0, holder.getBoundingClientRect().bottom - innerHeight);
  canvas.style.transform = off ? `translate3d(0, ${off}px, 0)` : "";
}
addEventListener("scroll", place, { passive: true });
addEventListener("resize", place, { passive: true });

addEventListener("proxy-stage", (e) => onStage(e.detail));
if (stage) onStage(stage);

function setPointer(x, y) {
  const r = canvas.getBoundingClientRect();
  pointer.x = x - r.left;
  pointer.y = y - r.top;
  if (!pointer.on) {
    pointer.px = pointer.x;
    pointer.py = pointer.y;
  }
  pointer.on = true;
}
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "touch") setPointer(e.clientX, e.clientY);
});
document.documentElement.addEventListener("pointerleave", () => (pointer.on = false));
// Touch: follow the finger even while it scrolls the page (pointer events are
// cancelled once a touch turns into a scroll; touch events keep coming).
addEventListener(
  "touchstart",
  (e) => {
    const t = e.touches[0];
    pointer.on = false;
    setPointer(t.clientX, t.clientY);
  },
  { passive: true },
);
addEventListener(
  "touchmove",
  (e) => {
    const t = e.touches[0];
    setPointer(t.clientX, t.clientY);
  },
  { passive: true },
);
addEventListener("touchend", () => (pointer.on = false), { passive: true });
addEventListener("touchcancel", () => (pointer.on = false), { passive: true });

window.__proxyTape = {
  get feed() {
    return feed;
  },
  get state() {
    return built;
  },
  quality: Q,
};

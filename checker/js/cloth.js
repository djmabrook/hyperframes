// The checkerboard cloth: a draped heightfield with a spring/wave simulation on top.
// Displacements are 3D (the cloth can be pulled sideways as well as up/down) and
// relax back to the draped rest shape.
import * as THREE from '../vendor/three/three.module.js';

export const WORLD = { x0: -70, x1: 70, z0: -80, z1: 14 };
const CELL = 1.6; // world size of one checker square

function peak(x, z, cx, cz, h, s, sharp) {
  const r = Math.hypot(x - cx, z - cz) / s;
  return h * Math.exp(-Math.pow(r, sharp));
}

// Folds that hang off a peak like draped fabric.
function folds(x, z, cx, cz, h, s, seed) {
  const dx = x - cx, dz = z - cz;
  const r = Math.hypot(dx, dz);
  const a = Math.atan2(dz, dx);
  const ring = Math.exp(-Math.pow(r / (s * 1.25), 2)) * (1 - Math.exp(-Math.pow(r / (s * 0.35), 2)));
  const wav = Math.sin(a * 6 + seed + 1.6 * Math.sin(a * 2 + seed * 2) + r * 0.12);
  return h * 0.075 * ring * Math.sign(wav) * Math.pow(Math.abs(wav), 0.6);
}

// [offset, dirX, dirZ, amp, width, wobbleFreq, phase, centre, length]
const CREASES = [
  [-6, 0.94, 0.34, 0.75, 1.4, 0.16, 0.3, -2, 16],
  [3, 0.80, -0.6, 0.55, 1.1, 0.21, 1.9, 4, 12],
  [-14, 0.97, 0.24, 0.6, 1.6, 0.12, 4.0, 10, 18],
  [8, 0.30, 0.95, 0.5, 1.0, 0.25, 2.2, -10, 10],
  [-22, 0.6, 0.8, 0.45, 1.3, 0.18, 5.1, -18, 14],
  [-1, 0.99, -0.12, 0.4, 0.9, 0.3, 0.8, 18, 20],
  [12, 0.9, 0.44, 0.65, 1.5, 0.14, 3.3, -14, 14],
  [-30, 0.7, -0.7, 0.5, 1.2, 0.2, 2.7, 12, 12],
].map((c) => { const l = Math.hypot(c[1], c[2]); c[1] /= l; c[2] /= l; return c; });

export function restHeight(x, z) {
  let y = 0;
  y += peak(x, z, -5, -30, 13.0, 9.0, 1.45);
  y += folds(x, z, -5, -30, 13.0, 9.0, 0.3);
  y += peak(x, z, 17, -44, 8.5, 8.5, 1.5);
  y += folds(x, z, 17, -44, 8.5, 8.5, 2.1);
  y += peak(x, z, -30, -40, 5.0, 10, 1.7);
  y += peak(x, z, 9, -16, 1.4, 4.0, 2.0);
  y += peak(x, z, -18, -12, 0.9, 5.0, 2.0);
  // gentle rolls and creases across the ground
  y += 0.45 * Math.sin(x * 0.19 + z * 0.11) * Math.sin(z * 0.23 - x * 0.07 + 1.3);
  y += 0.12 * Math.sin(x * 0.53 + z * 0.37 + Math.sin(z * 0.2) * 2.0);
  // draped creases running across the ground (like slack fabric)
  for (const c of CREASES) {
    const along = x * c[1] + z * c[2];
    const across = x * -c[2] + z * c[1] - c[0] - 1.8 * Math.sin(along * c[5] + c[6]);
    const fade = Math.exp(-Math.pow((along - c[7]) / c[8], 2));
    y += c[3] * Math.exp(-(across * across) / (c[4] * c[4])) * fade;
  }
  return y;
}

export class Cloth {
  constructor(lowPower) {
    this.NX = lowPower ? 150 : 260;
    this.NZ = lowPower ? 110 : 190;
    const NX = this.NX, NZ = this.NZ;
    const n = (NX + 1) * (NZ + 1);
    this.n = n;
    this.dxw = (WORLD.x1 - WORLD.x0) / NX;
    this.dzw = (WORLD.z1 - WORLD.z0) / NZ;

    this.rest = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.disp = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.acc = new Float32Array(n * 3);
    this.shadow = new Float32Array(n).fill(1);
    this.shadowTarget = new Float32Array(n).fill(1);
    this.restY = new Float32Array(n);
    const uv = new Float32Array(n * 2);

    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        const k = j * (NX + 1) + i;
        const x = WORLD.x0 + i * this.dxw;
        const z = WORLD.z0 + j * this.dzw;
        const y = restHeight(x, z);
        this.rest[k * 3] = x; this.rest[k * 3 + 1] = y; this.rest[k * 3 + 2] = z;
        this.restY[k] = y;
        uv[k * 2] = (x - WORLD.x0) / CELL;
        uv[k * 2 + 1] = (z - WORLD.z0) / CELL;
      }
    }
    this.pos.set(this.rest);

    const idx = new Uint32Array(NX * NZ * 6);
    let p = 0;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }

    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmAttr = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    this.shAttr = new THREE.BufferAttribute(this.shadow, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('normal', this.nrmAttr);
    g.setAttribute('shade', this.shAttr);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -30), 200);
    this.geometry = g;
    this.computeNormals();
    this.shadowRow = 0;

    // Interaction state
    this.hover = null;      // {x, z, strength}
    this.grab = null;       // {k, x, z, y, target:[dx,dy,dz], held}
  }

  // Bilinear lookup of the current surface height at world (x, z).
  heightAt(x, z) {
    const NX = this.NX;
    const fi = (x - WORLD.x0) / this.dxw, fj = (z - WORLD.z0) / this.dzw;
    if (fi < 0 || fj < 0 || fi >= NX || fj >= this.NZ) return -Infinity;
    const i = fi | 0, j = fj | 0, tx = fi - i, tz = fj - j;
    const k = j * (NX + 1) + i;
    const p = this.pos;
    const a = p[k * 3 + 1], b = p[(k + 1) * 3 + 1], c = p[(k + NX + 1) * 3 + 1], d = p[(k + NX + 2) * 3 + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // March a ray against the heightfield. Returns world hit point or null.
  raycast(origin, dir) {
    let t = 0.5;
    let prevT = t, prevD = origin.y + dir.y * t - this.heightAt(origin.x + dir.x * t, origin.z + dir.z * t);
    for (let s = 0; s < 400 && t < 220; s++) {
      const x = origin.x + dir.x * t, z = origin.z + dir.z * t, y = origin.y + dir.y * t;
      const h = this.heightAt(x, z);
      const d = y - h;
      if (h !== -Infinity && d < 0) {
        // refine between prevT and t
        let lo = prevT, hi = t;
        for (let r = 0; r < 10; r++) {
          const m = (lo + hi) / 2;
          const dm = origin.y + dir.y * m - this.heightAt(origin.x + dir.x * m, origin.z + dir.z * m);
          if (dm > 0) lo = m; else hi = m;
        }
        const m = (lo + hi) / 2;
        return new THREE.Vector3(origin.x + dir.x * m, origin.y + dir.y * m, origin.z + dir.z * m);
      }
      prevT = t; prevD = d;
      t += Math.max(0.08, Math.min(2.5, (h === -Infinity ? 2 : d) * 0.4));
    }
    return null;
  }

  indexAt(x, z) {
    const i = Math.round((x - WORLD.x0) / this.dxw), j = Math.round((z - WORLD.z0) / this.dzw);
    if (i < 0 || j < 0 || i > this.NX || j > this.NZ) return -1;
    return j * (this.NX + 1) + i;
  }

  step(dt, time, wind) {
    const NX = this.NX, NZ = this.NZ, W = NX + 1;
    const d = this.disp, v = this.vel, a = this.acc;
    const COUPLE = 520, REST = 2.2, DAMP = 2.6;
    a.fill(0);

    // neighbour coupling (Laplacian) + spring back to rest + damping
    for (let j = 1; j < NZ; j++) {
      for (let i = 1; i < NX; i++) {
        const k = j * W + i;
        for (let c = 0; c < 3; c++) {
          const q = k * 3 + c;
          const lap = d[q - 3] + d[q + 3] + d[q - W * 3] + d[q + W * 3] - 4 * d[q];
          a[q] = COUPLE * lap - REST * d[q] - DAMP * v[q];
        }
      }
    }

    // a slow breath of wind so the cloth is never perfectly still
    const wx = wind[0], wz = wind[1];
    for (let j = 1; j < NZ; j += 1) {
      const z = WORLD.z0 + j * this.dzw;
      for (let i = 1; i < NX; i += 1) {
        const k = j * W + i;
        const x = WORLD.x0 + i * this.dxw;
        const s = Math.sin(x * 0.11 + z * 0.07 + time * 0.35 + wx * 2.0) * Math.sin(z * 0.13 - time * 0.21 + wz);
        a[k * 3 + 1] += 0.55 * s;
      }
    }

    // hover: the surface swells softly toward the hand, and is nudged by its motion
    if (this.hover && this.hover.strength > 0.001) this.applyHover(a);
    // grab: press sinks in, dragging pulls the cloth with the hand
    if (this.grab) this.applyGrab(a);

    for (let q = 0; q < a.length; q++) {
      v[q] += a[q] * dt;
      d[q] += v[q] * dt;
    }
  }

  forEachNear(x, z, radius, fn) {
    const W = this.NX + 1;
    const i0 = Math.max(1, Math.floor((x - radius - WORLD.x0) / this.dxw));
    const i1 = Math.min(this.NX - 1, Math.ceil((x + radius - WORLD.x0) / this.dxw));
    const j0 = Math.max(1, Math.floor((z - radius - WORLD.z0) / this.dzw));
    const j1 = Math.min(this.NZ - 1, Math.ceil((z + radius - WORLD.z0) / this.dzw));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * W + i;
      const px = this.rest[k * 3], pz = this.rest[k * 3 + 2];
      const r2 = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (r2 < radius * radius) fn(k, r2);
    }
  }

  applyHover(a) {
    const h = this.hover;
    const s = h.radius;
    const inv = 1 / (s * s);
    this.forEachNear(h.x, h.z, s * 2.6, (k, r2) => {
      const w = Math.exp(-r2 * inv) * h.strength;
      a[k * 3 + 1] += 26 * w;
      a[k * 3] += h.vx * 18 * w;
      a[k * 3 + 2] += h.vz * 18 * w;
    });
  }

  applyGrab(a) {
    const g = this.grab;
    const s = g.radius;
    const inv = 1 / (s * s);
    const d = this.disp, v = this.vel;
    const press = g.press; // grows while held: the hand sinks deeper
    this.forEachNear(g.x, g.z, s * 2.8, (k, r2) => {
      const w = Math.exp(-r2 * inv);
      // target displacement: follow the hand, plus a dent under the palm
      const tx = g.target[0] * w;
      const ty = g.target[1] * w - press * Math.exp(-r2 * inv * 2.2);
      const tz = g.target[2] * w;
      const K = 140 * w, C = 14 * w;
      a[k * 3] += K * (tx - d[k * 3]) - C * v[k * 3];
      a[k * 3 + 1] += K * (ty - d[k * 3 + 1]) - C * v[k * 3 + 1];
      a[k * 3 + 2] += K * (tz - d[k * 3 + 2]) - C * v[k * 3 + 2];
    });
  }

  commit() {
    const p = this.pos, r = this.rest, d = this.disp;
    for (let q = 0; q < p.length; q++) p[q] = r[q] + d[q];
    this.computeNormals();
    this.posAttr.needsUpdate = true;
    this.nrmAttr.needsUpdate = true;
  }

  computeNormals() {
    const NX = this.NX, NZ = this.NZ, W = NX + 1;
    const p = this.pos, n = this.nrm;
    for (let j = 0; j <= NZ; j++) {
      const ju = Math.max(0, j - 1), jd = Math.min(NZ, j + 1);
      for (let i = 0; i <= NX; i++) {
        const il = Math.max(0, i - 1), ir = Math.min(NX, i + 1);
        const L = (j * W + il) * 3, R = (j * W + ir) * 3, U = (ju * W + i) * 3, D = (jd * W + i) * 3;
        const ax = p[R] - p[L], ay = p[R + 1] - p[L + 1], az = p[R + 2] - p[L + 2];
        const bx = p[D] - p[U], by = p[D + 1] - p[U + 1], bz = p[D + 2] - p[U + 2];
        // n = b x a  (points up for a = +x, b = +z)
        let nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax;
        const l = Math.hypot(nx, ny, nz) || 1;
        const k = (j * W + i) * 3;
        n[k] = nx / l; n[k + 1] = ny / l; n[k + 2] = nz / l;
      }
    }
  }

  // Soft self-shadowing: march each vertex toward the light over the heightfield.
  // Spread over several frames (a band of rows per call) and eased in over time.
  updateShadows(lightDir, rows) {
    const NX = this.NX, NZ = this.NZ, W = NX + 1;
    const lx = lightDir.x, ly = Math.max(0.03, lightDir.y), lz = lightDir.z;
    const hl = Math.hypot(lx, lz) || 1;
    const sx = lx / hl, sz = lz / hl, slope = ly / hl;
    const p = this.pos, out = this.shadowTarget;
    for (let r = 0; r < rows; r++) {
      const j = this.shadowRow;
      this.shadowRow = (this.shadowRow + 1) % (NZ + 1);
      for (let i = 0; i <= NX; i++) {
        const k = j * W + i;
        const x0 = p[k * 3], y0 = p[k * 3 + 1] + 0.05, z0 = p[k * 3 + 2];
        let occ = 0;
        let dist = 0.6;
        for (let s = 0; s < 22; s++) {
          const h = this.heightAt(x0 + sx * dist, z0 + sz * dist);
          if (h === -Infinity) break;
          const above = h - (y0 + slope * dist);
          if (above > 0) { occ = Math.max(occ, Math.min(1, above / (0.25 + dist * 0.08))); if (occ >= 1) break; }
          dist *= 1.22;
        }
        out[k] = 1 - occ;
      }
    }
  }

  easeShadows(f) {
    const s = this.shadow, t = this.shadowTarget;
    for (let k = 0; k < s.length; k++) s[k] += (t[k] - s[k]) * f;
    this.shAttr.needsUpdate = true;
  }
}

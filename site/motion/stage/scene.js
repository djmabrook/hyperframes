// The page's 3D stage. One scene, two hosts:
//  - the website drives it live from scroll position (site/js/site.js);
//  - the HyperFrames composition next to this file drives it from timeline time, so it can be
//    previewed, checked and rendered to video as the fallback for devices without WebGL.
// Everything drawn is a function of `s` (scroll position in sections) and `idle` (seconds of
// gentle float), so scrolling up replays the same frames in reverse.
import * as THREE from "./assets/vendor/three-0.170.0.module.min.js";

export const SECTIONS = 5; // hero, work, process, credits, contact
const PANELS = 10;
const ACCENT = new THREE.Color("#e8a33d");
const GROUND = new THREE.Color("#100f0d");

// Seeded random, so every host draws the same field.
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const mix = (a, b, e) => a + (b - a) * e;

// Cut lengths for the process timeline, in panel widths.
const CUT_W = [1.15, 0.75, 1.3, 0.6, 1.0, 0.9, 1.25, 0.7, 1.05, 0.95];

function panelLayout(k, i, s, aspect) {
  const wide = aspect >= 1.1;
  switch (k) {
    case 0: // hero: panels wait folded into the hero plane
      return { x: 0, y: 0, z: -2, ry: 0, rz: 0, sx: 0.4, sy: 0.4, o: 0 };
    case 1: {
      // work: a layered cascade, columns at three depths
      const col = i % 5;
      const row = Math.floor(i / 5);
      const baseX = wide ? -1.6 : -2.6;
      return {
        x: baseX + col * 1.45 + row * 0.6,
        y: (wide ? 0.9 : 1.8) - row * 1.7 - col * 0.12,
        z: -col * 0.9 - row * 0.6,
        ry: -0.28,
        rz: 0,
        sx: 1,
        sy: 1,
        o: 1,
      };
    }
    case 2: {
      // process: the selects line up as cuts on one track
      let x = -5.1;
      for (let j = 0; j < i; j++) x += CUT_W[j] * 1.0 + 0.04;
      const w = CUT_W[i] * 1.0;
      return { x: x + w / 2, y: -1.9, z: 0, ry: 0, rz: 0, sx: w / 1.6, sy: 0.42, o: 1 };
    }
    case 3: {
      // credits: a tunnel the camera travels through
      const a = i * 0.63 + s * 0.9;
      return {
        x: Math.cos(a) * 4.2,
        y: Math.sin(a) * 2.6,
        z: -3 - i * 1.6,
        ry: -Math.cos(a) * 0.6,
        rz: Math.sin(a) * 0.15,
        sx: 0.9,
        sy: 0.9,
        o: 0.75,
      };
    }
    default: {
      // contact: a slow ring around the contact card
      const a = (i / PANELS) * Math.PI * 2 + s * 0.8;
      return {
        x: Math.cos(a) * 5.6,
        y: Math.sin(a) * 1.2 - 0.2,
        z: -3 + Math.sin(a) * 2.5,
        ry: -Math.cos(a) * 0.5,
        rz: 0,
        sx: 0.75,
        sy: 0.75,
        o: 0.7,
      };
    }
  }
}

const CAMERA = [
  { x: 0, y: 0, z: 12 },
  { x: 0.4, y: 0, z: 11 },
  { x: 0, y: 0.2, z: 10.5 },
  { x: 0, y: 0, z: 9 },
  { x: 0, y: 0.4, z: 13 },
];

function sprocketTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#1c1915";
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = "#0a0908";
  for (let x = 6; x < 512; x += 24) {
    g.fillRect(x, 6, 12, 9);
    g.fillRect(x, 49, 12, 9);
  }
  g.fillStyle = "#2a2620";
  for (let x = 0; x < 512; x += 128) g.fillRect(x + 4, 20, 120, 24);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(232,163,61,0.9)");
  grad.addColorStop(0.4, "rgba(232,163,61,0.25)");
  grad.addColorStop(1, "rgba(232,163,61,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {THREE.Texture} opts.texture  what plays on the hero plane and every panel
 * @param {number} [opts.pixelRatio]
 */
export function createStage({ canvas, texture, pixelRatio = 1 }) {
  const rand = seeded(11);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(GROUND, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(GROUND, 9, 34);
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  texture.colorSpace = THREE.SRGBColorSpace;

  // Layer 1, far: dust field.
  const N = 2400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rand() - 0.5) * 60;
    pos[i * 3 + 1] = (rand() - 0.5) * 36;
    pos[i * 3 + 2] = -rand() * 40 + 4;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0x8b857b, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  scene.add(dust);

  // Layer 2, middle distance: film strips crossing on diagonals.
  const stripTex = sprocketTexture();
  const strips = [];
  for (let i = 0; i < 7; i++) {
    const tex = stripTex.clone();
    tex.repeat.set(6, 1);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 0.9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    m.position.set((rand() - 0.5) * 6, (rand() - 0.5) * 14, -8 - i * 2.4);
    m.rotation.z = (rand() - 0.5) * 0.9;
    m.userData = { speed: 0.04 + rand() * 0.05, dir: i % 2 ? 1 : -1, tex };
    scene.add(m);
    strips.push(m);
  }

  // Layer 3: the hero plane, where the reel plays after the opener.
  const heroMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0 });
  const hero = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), heroMat);
  scene.add(hero);

  // Layer 4: ten work panels, each with an accent frame for hover.
  const panelGeo = new THREE.PlaneGeometry(1.6, 0.9);
  const frameGeo = new THREE.PlaneGeometry(1.68, 0.98);
  const panels = [];
  for (let i = 0; i < PANELS; i++) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0 });
    const face = new THREE.Mesh(panelGeo, mat);
    face.userData.index = i;
    const frameMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.01;
    group.add(frame, face);
    scene.add(group);
    panels.push({ group, face, mat, frameMat, hover: 0 });
  }

  // Layer 5, process only: track lines and a playhead.
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a3630, transparent: true, opacity: 0 });
  const tracks = new THREE.Group();
  for (const y of [-1.5, -2.3, -2.75]) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5.3, y, 0), new THREE.Vector3(5.3, y, 0)]);
    tracks.add(new THREE.Line(g, lineMat));
  }
  const playheadMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 });
  const playhead = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 1.6), playheadMat);
  playhead.position.set(-5.1, -2.0, 0.05);
  tracks.add(playhead);
  scene.add(tracks);

  // Layer 6: warm glow that rises behind the contact section.
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0, depthWrite: false }),
  );
  glow.scale.set(18, 18, 1);
  glow.position.set(0, -0.5, -9);
  scene.add(glow);

  const pointer = { x: 0, y: 0 };
  let hovered = -1;
  let aspect = 16 / 9;
  const raycaster = new THREE.Raycaster();

  function setSize(w, h) {
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function setPointer(x, y) {
    pointer.x = x;
    pointer.y = y;
  }

  /** Index of the panel under a point in normalised device coordinates, or -1. */
  function pick(nx, ny) {
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObjects(
      panels.filter((p) => p.mat.opacity > 0.3).map((p) => p.face),
      false,
    );
    return hits.length ? hits[0].object.userData.index : -1;
  }

  function setHover(i) {
    hovered = i;
  }

  /**
   * Draw one frame.
   * @param {number} s      position in sections, 0 (hero) to SECTIONS - 1 (contact)
   * @param {number} idle   seconds of ambient float; the page passes its clock, renders pass time
   * @param {number} intro  0..1, how far the hero reel has faded in after the opener
   */
  function renderAt(s, idle = 0, intro = 1) {
    s = Math.min(SECTIONS - 1, Math.max(0, s));
    const k = Math.min(SECTIONS - 2, Math.floor(s));
    const frac = s - k;
    const e = smooth(clamp01((frac - 0.3) / 0.7));

    // Camera: section keyframes, plus pointer parallax.
    const c0 = CAMERA[k];
    const c1 = CAMERA[k + 1];
    camera.position.set(
      mix(c0.x, c1.x, e) + pointer.x * 0.5,
      mix(c0.y, c1.y, e) + pointer.y * 0.3,
      mix(c0.z, c1.z, e),
    );
    // In the credits tunnel the camera travels forward.
    const tunnel = smooth(clamp01(s - 2.3)) * (1 - smooth(clamp01(s - 3.3)));
    camera.position.z -= tunnel * 6;
    camera.lookAt(pointer.x * 0.2, pointer.y * 0.1, camera.position.z - 12);

    // Dust and strips drift with scroll and with the idle clock.
    dust.rotation.y = s * 0.12 + idle * 0.004;
    dust.rotation.x = s * 0.03;
    for (const m of strips) {
      m.userData.tex.offset.x = m.userData.dir * (s * 0.6 + idle * m.userData.speed);
    }

    // Hero plane covers the view at its depth, fades in after the opener and recedes on scroll.
    const heroOut = smooth(clamp01(s / 0.8));
    const heroZ = -2 - heroOut * 6;
    const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - heroZ);
    const cover = Math.max(viewH / 9, (viewH * aspect) / 16) * mix(1.02, 0.45, heroOut);
    hero.scale.set(cover, cover, 1);
    hero.position.set(0, 0, heroZ);
    heroMat.opacity = intro * 0.22 * (1 - smooth(clamp01((s - 0.5) / 0.5)));

    // Panels: blend between this section's layout and the next.
    for (let i = 0; i < PANELS; i++) {
      const a = panelLayout(k, i, s, aspect);
      const b = panelLayout(k + 1, i, s, aspect);
      // Stagger the hand-off so panels peel away one after another.
      const ei = smooth(clamp01((frac - 0.3 - i * 0.025) / 0.6));
      const p = panels[i];
      const bob = Math.sin(idle * 0.6 + i * 1.7) * 0.05;
      p.group.position.set(mix(a.x, b.x, ei), mix(a.y, b.y, ei) + bob, mix(a.z, b.z, ei));
      p.group.rotation.set(0, mix(a.ry, b.ry, ei), mix(a.rz, b.rz, ei));
      p.hover += ((hovered === i ? 1 : 0) - p.hover) * 0.2;
      const sc = 1 + p.hover * 0.08;
      p.group.scale.set(mix(a.sx, b.sx, ei) * sc, mix(a.sy, b.sy, ei) * sc, 1);
      p.mat.opacity = mix(a.o, b.o, ei);
      p.frameMat.opacity = p.mat.opacity * (0.12 + p.hover * 0.88);
    }

    // Process furniture: tracks and playhead.
    const proc = smooth(clamp01((s - 1.4) / 0.5)) * (1 - smooth(clamp01((s - 2.45) / 0.4)));
    lineMat.opacity = proc;
    playheadMat.opacity = proc;
    playhead.position.x = -5.1 + clamp01((s - 1.7) / 0.7) * 10.2;

    // Contact glow.
    glow.material.opacity = smooth(clamp01(s - 3)) * 0.8;

    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
  }

  return { renderAt, setSize, setPointer, pick, setHover, dispose, renderer };
}

export { THREE };

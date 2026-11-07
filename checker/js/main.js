import * as THREE from '../vendor/three/three.module.js';
import { Weather } from './weather.js';
import { Cloth, WORLD } from './cloth.js';
import { makeSky, makeHills, makeClothMaterial } from './scene.js';
import { Sound } from './audio.js';
import { HeadTracker } from './headtrack.js';

THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const coarse = matchMedia('(pointer: coarse)').matches;
const lowPower = coarse || Math.min(innerWidth, innerHeight) < 600;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
const weather = new Weather();
const cloth = new Cloth(lowPower);
const sky = makeSky();
const hills = makeHills();
const clothMat = makeClothMaterial();
const clothMesh = new THREE.Mesh(cloth.geometry, clothMat.mat);
clothMesh.frustumCulled = false;
scene.add(sky.mesh, hills.mesh, clothMesh);

// ---------- resolution: full Retina by default, step down only if the GPU struggles ----------
const MAX_PIXELS = 16.6e6; // a 5K panel at 2x is ~14.7 MP; anything above this is clamped
let quality = 1; // multiplier on devicePixelRatio, lowered by the frame-time watchdog
let rt = null;
let W = 0, H = 0, PR = 1;

function targetPR() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let pr = dpr * quality;
  const css = innerWidth * innerHeight;
  if (css * pr * pr > MAX_PIXELS) pr = Math.sqrt(MAX_PIXELS / css);
  return Math.max(0.75, pr);
}

function resize() {
  W = innerWidth; H = innerHeight; PR = targetPR();
  renderer.setPixelRatio(PR);
  renderer.setSize(W, H, false);
  const bw = Math.round(W * PR), bh = Math.round(H * PR);
  const samples = bw * bh > 9e6 ? 2 : 4;
  if (rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(bw, bh, { samples, type: THREE.UnsignedByteType, depthBuffer: true });
  post.material.uniforms.uGrainPx.value = Math.max(1, PR * 0.8);
  post.material.uniforms.uRes.value.set(bw, bh);
  framing();
}

// ---------- post: print grain ----------
const post = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, uSeed: { value: 0 }, uGrainPx: { value: 1 }, uRes: { value: new THREE.Vector2() }, uAmt: { value: 1 } },
  depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0., 1.); }`,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tScene; uniform float uSeed, uGrainPx, uAmt; uniform vec2 uRes;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec3 c = texture2D(tScene, vUv).rgb;
      vec2 gp = floor(gl_FragCoord.xy / uGrainPx);
      float n1 = h(gp + uSeed), n2 = h(gp * 1.37 + uSeed + 3.1), n3 = h(gp * 0.71 + uSeed + 7.7);
      float lum = dot(c, vec3(.299, .587, .114));
      // film / print grain, strongest in the midtones
      c += (n1 - 0.5) * 0.13 * uAmt * (0.35 + 0.65 * (1.0 - abs(lum * 2. - 1.)));
      c += (vec3(n2, n3, n1) - 0.5) * 0.04 * uAmt;
      // stipple: dark flecks on the light paper, pale flecks in the ink
      float s = h(gp * 0.913 + uSeed * 0.37);
      c = mix(c, c * 0.2, step(0.993, s) * smoothstep(0.45, 0.7, lum) * uAmt);
      c = mix(c, c + 0.25, step(s, 0.004) * smoothstep(0.25, 0.05, lum) * uAmt);
      // soft printed curve and a gentle vignette
      c = c * 0.95 + 0.02;
      vec2 q = vUv - 0.5;
      c *= 1.0 - 0.2 * pow(length(q * vec2(1.0, 1.2)) * 1.3, 2.6);
      gl_FragColor = vec4(c, 1.);
    }`,
}));
post.geometry.setDrawRange(0, 3);
post.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
post.frustumCulled = false;
const postScene = new THREE.Scene();
postScene.add(post);
const postCam = new THREE.OrthographicCamera();

// ---------- camera framing with head-coupled (off-axis) perspective ----------
const BASE = new THREE.Vector3(0, 2.7, 11.5);
const LOOK = new THREE.Vector3(0, 4.6, -40);
const camQuat = new THREE.Quaternion();
let vfov = 55, screenD = 7;
const eye = new THREE.Vector3(); // smoothed eye offset in camera space

function framing() {
  const aspect = W / H;
  // keep at least ~78 degrees horizontally so phones in portrait still see the peaks
  const minH = (aspect < 1 ? 64 : 78) * Math.PI / 180;
  weather.azScale = aspect < 1 ? Math.max(0.42, aspect * 0.75) : 1;
  const vFromH = 2 * Math.atan(Math.tan(minH / 2) / aspect) * 180 / Math.PI;
  vfov = Math.min(95, Math.max(52, vFromH));
  const m = new THREE.Matrix4().lookAt(BASE, LOOK, new THREE.Vector3(0, 1, 0));
  camQuat.setFromRotationMatrix(m);
}

function applyCamera() {
  camera.quaternion.copy(camQuat);
  const off = new THREE.Vector3(eye.x, eye.y, -eye.z).applyQuaternion(camQuat);
  camera.position.copy(BASE).add(off);
  // the "window": the screen plane stays fixed at distance screenD in front of the base eye
  const near = camera.near, far = camera.far;
  const hh = screenD * Math.tan(vfov * Math.PI / 360), hw = hh * (W / H);
  const d = Math.max(1.5, screenD - eye.z);
  const k = near / d;
  camera.projectionMatrix.makePerspective((-hw - eye.x) * k, (hw - eye.x) * k, (hh - eye.y) * k, (-hh - eye.y) * k, near, far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld(true);
}

// ---------- input ----------
const sound = new Sound();
const head = new HeadTracker();
const sndBtn = document.getElementById('snd');
const camBtn = document.getElementById('cam');
if (!coarse && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) camBtn.hidden = false;

const pointer = { x: 0, y: 0, inside: false, type: 'mouse', down: false, id: null, moved: 0 };
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
let hit = null, lastHit = null, lastCell = '', hoverStrength = 0;
let grab = null; // { p0, plane, target, press, lastNote }
let gyro = null; // {b0, g0, x, y}
let started = false;

function rayFrom(px, py) {
  ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray;
}

function touchInfo(p, kind, energy) {
  return {
    kind, energy: Math.max(0, Math.min(1, energy)),
    u: Math.max(0, Math.min(1, (p.x + 45) / 90)),
    v: Math.max(0, Math.min(1, (p.z - WORLD.z0) / (WORLD.z1 - WORLD.z0))),
    height: Math.max(0, Math.min(1, p.y / 13)),
    pan: Math.max(-1, Math.min(1, (pointer.x / W) * 2 - 1)),
  };
}

const cellOf = (p) => `${Math.floor((p.x - WORLD.x0) / 1.6)},${Math.floor((p.z - WORLD.z0) / 1.6)}`;

async function firstGesture() {
  if (started) return;
  started = true;
  sndBtn.classList.remove('pulse');
  // everything that needs the gesture is kicked off synchronously, before any await
  const audioP = sound.start().catch(() => {});
  let gyroP = null;
  if (coarse && window.DeviceOrientationEvent) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      gyroP = DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') listenGyro(); }).catch(() => {});
    } else listenGyro();
  }
  sndBtn.setAttribute('aria-pressed', 'true');
  await audioP;
  sound.setMuted(false);
  if (sound.setTone) toneBtn.hidden = false;
  // desktop: head tracking through the webcam (stays on this device)
  if (!camBtn.hidden && Q.get('cam') !== '0') startHead();
}

async function startHead() {
  camBtn.classList.add('pulse');
  const ok = await head.start();
  camBtn.classList.remove('pulse');
  camBtn.setAttribute('aria-pressed', ok ? 'true' : 'false');
}

function listenGyro() {
  addEventListener('deviceorientation', (e) => {
    if (e.beta == null) return;
    if (!gyro) gyro = { b0: e.beta, g0: e.gamma, x: 0, y: 0 };
    // slowly re-centre so holding the phone at any angle feels neutral
    gyro.b0 += (e.beta - gyro.b0) * 0.004;
    gyro.g0 += (e.gamma - gyro.g0) * 0.004;
    gyro.x = Math.max(-1, Math.min(1, (e.gamma - gyro.g0) / 22));
    gyro.y = Math.max(-1, Math.min(1, (e.beta - gyro.b0) / 22));
  });
}

sndBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
sndBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!started) { await firstGesture(); return; }
  const m = !sound.muted;
  sound.setMuted(m);
  sndBtn.setAttribute('aria-pressed', m ? 'false' : 'true');
});
camBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
camBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (head.enabled) { head.stop(); camBtn.setAttribute('aria-pressed', 'false'); }
  else { if (!started) { started = true; try { await sound.start(); } catch (_) {} sndBtn.classList.remove('pulse'); sndBtn.setAttribute('aria-pressed', 'true'); } startHead(); }
});

// audition base tones: the note icon cycles, number keys pick, T cycles, ?tone=name preselects
const toneBtn = document.getElementById('tone');
const flashTone = () => { toneBtn.style.opacity = '1'; setTimeout(() => { toneBtn.style.opacity = ''; }, 500); };
toneBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
toneBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!started) await firstGesture();
  if (sound.nextTone) { sound.nextTone(); flashTone(); }
});
addEventListener('keydown', async (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || !sound.setTone) return;
  const n = parseInt(e.key, 10);
  if (!started && (n >= 1 || e.key === 't' || e.key === 'T')) await firstGesture();
  if (n >= 1 && n <= 9 && n <= sound.tones.length) { sound.setTone(n - 1); flashTone(); }
  else if (e.key === 't' || e.key === 'T') { sound.nextTone(); flashTone(); }
});

canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; pointer.type = e.pointerType;
});
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
canvas.addEventListener('pointerdown', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; pointer.type = e.pointerType;
  pointer.down = true; pointer.id = e.pointerId; pointer.moved = 0;
  canvas.setPointerCapture(e.pointerId);
  firstGesture();
  const r = rayFrom(e.clientX, e.clientY);
  const p = cloth.raycast(r.origin, r.direction);
  if (!p) return;
  // drag plane through the touched point, facing the camera (but kept upright)
  const nrm = new THREE.Vector3().subVectors(camera.position, p); nrm.y *= 0.35; nrm.normalize();
  grab = { p0: p.clone(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, p), target: new THREE.Vector3(), press: 0, lastNote: performance.now(), holdNote: performance.now() };
  cloth.grab = { x: p.x, z: p.z, radius: lowPower ? 2.6 : 2.3, target: [0, 0, 0], press: 0 };
  lastCell = cellOf(p);
  sound.touch(touchInfo(p, 'tap', 0.6));
});
function endGrab(e) {
  if (!pointer.down) return;
  pointer.down = false;
  if (grab) {
    const pull = grab.target.length() / 8 + grab.press / 4;
    if (pull > 0.08) sound.touch(touchInfo(grab.p0, 'release', Math.min(1, pull)));
  }
  grab = null; cloth.grab = null;
  if (e.pointerType !== 'mouse') pointer.inside = false;
}
canvas.addEventListener('pointerup', endGrab);
canvas.addEventListener('pointercancel', endGrab);
addEventListener('blur', () => endGrab({ pointerType: 'mouse' }));
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.suspend(); else sound.resume(); });
addEventListener('resize', resize);
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); quality = Math.max(0.5, quality * 0.7); try { sessionStorage.setItem('checkerQ', String(quality)); } catch (_) {} setTimeout(() => location.reload(), 300); });
try { const sq = parseFloat(sessionStorage.getItem('checkerQ')); if (sq > 0) quality = sq; } catch (_) {}
if (Q.has('q')) quality = parseFloat(Q.get('q'));

// ---------- frame loop ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
const key = new THREE.Vector3();
let simTime = 0, frameAvg = 16, slowFor = 0, grainT = 0, lastHitPos = null;

function update(dt) {
  weather.update(dt);
  const s = weather.state;

  // eye offset: head tracking > phone tilt > pointer
  let tx = 0, ty = 0, tz = 0;
  head.update(performance.now());
  if (head.active) {
    const hp = head.pose;
    tx = hp.x * 2.4; ty = hp.y * 1.3; tz = (hp.z - 1) * 4.0;
  } else if (gyro) {
    tx = gyro.x * 1.6; ty = -gyro.y * 0.9;
  } else if (pointer.inside && pointer.type === 'mouse') {
    tx = ((pointer.x / W) * 2 - 1) * 0.9; ty = -((pointer.y / H) * 2 - 1) * 0.45;
  }
  const breath = Math.sin(simTime * 0.13) * 0.12;
  const ek = 1 - Math.exp(-dt * (head.active ? 9 : 2.5));
  eye.x += (tx + breath - eye.x) * ek;
  eye.y += (ty + Math.sin(simTime * 0.09) * 0.06 - eye.y) * ek;
  eye.z += (tz - eye.z) * ek;
  applyCamera();

  // where is the hand?
  hit = null;
  if (pointer.inside && (pointer.type === 'mouse' || pointer.down)) {
    const r = rayFrom(pointer.x, pointer.y);
    hit = cloth.raycast(r.origin, r.direction);
  }

  if (grab && pointer.down) {
    const r = rayFrom(pointer.x, pointer.y);
    if (r.intersectPlane(grab.plane, tmpV)) {
      const t = tmpV.sub(grab.p0);
      if (t.length() > 9) t.setLength(9);
      // the cloth cannot be pushed far below its own surface
      t.y = Math.max(t.y, -2.0);
      const prev = grab.target.clone();
      grab.target.lerp(t, 1 - Math.exp(-dt * 14));
      const speed = prev.distanceTo(grab.target) / Math.max(dt, 1e-3);
      pointer.moved = pointer.moved * 0.9 + speed * 0.1;
      // holding still lets the hand sink deeper into the cloth
      if (pointer.moved < 1.2) grab.press = Math.min(3.2, grab.press + dt * 1.1);
      else grab.press = Math.max(0, grab.press - dt * 0.8);
      cloth.grab.target[0] = grab.target.x; cloth.grab.target[1] = grab.target.y; cloth.grab.target[2] = grab.target.z;
      cloth.grab.press = grab.press;
      const now = performance.now();
      const cur = grab.p0.clone().add(grab.target);
      const cell = cellOf(cur);
      if (cell !== lastCell && now - grab.lastNote > 110) {
        lastCell = cell; grab.lastNote = now;
        sound.touch(touchInfo(cur, 'drag', Math.min(1, speed / 14)));
      }
      if (grab.press > 0.6 && now - grab.holdNote > 900) {
        grab.holdNote = now;
        sound.touch(touchInfo(grab.p0, 'press', grab.press / 3.2));
      }
    }
  }

  canvas.style.cursor = (hit || grab) ? 'none' : 'default';
  // hover swell + glow
  const hovering = hit && !pointer.down && pointer.type === 'mouse';
  hoverStrength += ((hovering ? 1 : 0) - hoverStrength) * (1 - Math.exp(-dt * 4));
  if (hit) {
    let vx = 0, vz = 0;
    if (lastHitPos) { vx = (hit.x - lastHitPos.x) / Math.max(dt, 1e-3); vz = (hit.z - lastHitPos.z) / Math.max(dt, 1e-3); }
    const cap = (v) => Math.max(-6, Math.min(6, v));
    cloth.hover = { x: hit.x, z: hit.z, radius: 2.0, strength: hoverStrength, vx: cap(vx) * 0.1, vz: cap(vz) * 0.1 };
    lastHitPos = hit.clone();
    if (hovering) {
      const cell = cellOf(hit);
      if (cell !== lastCell) {
        lastCell = cell;
        sound.touch(touchInfo(hit, 'hover', Math.min(1, Math.hypot(vx, vz) / 25)));
      }
    }
  } else {
    lastHitPos = null;
    if (cloth.hover) cloth.hover.strength = hoverStrength;
  }

  // simulate (fixed sub-steps)
  const steps = 2, h = Math.min(dt, 1 / 30) / steps;
  for (let i = 0; i < steps; i++) { simTime += h; cloth.step(h, simTime, weather.wind); }
  cloth.commit();

  // lighting: a key light from the sun's side, raised so the folds read
  const sd = weather.sunDir;
  key.set(0.35 + sd[0] * 1.3, 0.38 + weather.sunEl * 1.4, 0.32).normalize();
  cloth.updateShadows(key, Math.ceil(cloth.NZ / 8));
  cloth.easeShadows(1 - Math.exp(-dt * 6));

  const u = clothMat.uniforms;
  u.uLight.value.fromArray(s.clothLight); u.uDark.value.fromArray(s.clothDark);
  u.uKey.value.copy(key); u.uSun.value.fromArray(sd);
  u.uSunCol.value.fromArray(s.sunA).lerp(tmpV.fromArray(s.sunB), 0.5);
  u.uShadowTint.value.fromArray(s.shadowTint); u.uHaze.value.fromArray(s.haze);
  u.uLightAmt.value = weather.light;
  const hand = grab && pointer.down ? grab.p0.clone().add(grab.target) : hit;
  const handAmt = grab && pointer.down ? 1 : hoverStrength;
  if (hand) u.uHand.value.set(hand.x, hand.y, hand.z, handAmt);
  else u.uHand.value.w *= 0.9;

  const k = sky.uniforms;
  k.uTop.value.fromArray(s.skyTop); k.uMid.value.fromArray(s.skyMid); k.uHorizon.value.fromArray(s.horizon);
  k.uCloud.value.fromArray(s.cloud); k.uCover.value = s.cloudCover; k.uDrift.value = weather.cloudDrift;
  k.uSunDir.value.fromArray(sd); k.uSunA.value.fromArray(s.sunA); k.uSunB.value.fromArray(s.sunB);
  k.uSunR.value = s.sunRadius; k.uScan.value = weather.weights[2];
  sky.mesh.position.copy(camera.position);

  hills.uniforms.uHill.value.fromArray(s.hill); hills.uniforms.uHaze.value.fromArray(s.haze);
  hills.uniforms.uScale.value = s.hills;

  sound.setLight({ weights: weather.weights, light: weather.light, t: weather.t });
}

function render(dt) {
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  grainT += dt;
  if (grainT > 1 / 24) { grainT = 0; post.material.uniforms.uSeed.value = (Math.random() * 1000) | 0; }
  post.material.uniforms.tScene.value = rt.texture;
  renderer.render(postScene, postCam);
}

function watchdog(dt) {
  frameAvg += (dt * 1000 - frameAvg) * 0.05;
  if (frameAvg > 24 && quality > 0.5 && !document.hidden) {
    slowFor += dt;
    if (slowFor > 2.5) { quality *= 0.85; slowFor = 0; frameAvg = 16; resize(); }
  } else slowFor = Math.max(0, slowFor - dt);
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  render(dt);
  if (Q.get('fixed') !== '1') watchdog(dt);
  requestAnimationFrame(frame);
}

resize();
// settle the shadows before the first frame
cloth.updateShadows(key.set(0.4, 0.5, 0.28).normalize(), cloth.NZ + 1);
cloth.easeShadows(1);
requestAnimationFrame(frame);

window.__checker = { cloth, weather, sound, head, camera, get quality() { return quality; }, get pr() { return PR; } };

// Wires the page to its two kinds of motion:
//  - the HyperFrames opener (live, via <hyperframes-player>) that plays once on entry;
//  - the Three.js stage behind the page, drawn from scroll position in both directions.
// Without WebGL, or with reduced motion, the stage is swapped for a still/looping video.
import { createStage, SECTIONS, THREE } from "../motion/stage/scene.js";

const root = document.documentElement;
const body = document.body;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (new URLSearchParams(location.search).has("clean")) body.classList.add("clean");
document.getElementById("year").textContent = String(new Date().getFullYear());

// ---------- Video viewer ----------
const viewer = document.getElementById("viewer");
const viewerVideo = viewer.querySelector("video");
const viewerTitle = viewer.querySelector(".viewer-title");
const workButtons = [...document.querySelectorAll(".work-list button")];

function openViewer(key) {
  const btn = workButtons[Number(key)];
  viewerTitle.textContent = key === "reel" ? "Reel" : btn.querySelector(".w-title").textContent;
  viewer.showModal();
  viewerVideo.currentTime = 0;
  viewerVideo.play().catch(() => {});
}
viewer.querySelector(".close").addEventListener("click", () => viewer.close());
viewer.addEventListener("close", () => viewerVideo.pause());
viewer.addEventListener("click", (e) => {
  if (e.target === viewer) viewer.close();
});
document.querySelectorAll("[data-play]").forEach((el) =>
  el.addEventListener("click", () => openViewer(el.dataset.play)),
);

// ---------- Stage ----------
function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
const lowPower = navigator.connection?.saveData === true || (navigator.hardwareConcurrency || 4) <= 2;
const useStage = !reduceMotion && !lowPower && webglAvailable();

// One video feeds the hero plane and every panel (they all show the same placeholder for now).
const reel = document.createElement("video");
reel.src = "media/placeholder.mp4";
reel.muted = true;
reel.loop = true;
reel.playsInline = true;
reel.preload = "auto";

let stage = null;
let intro = 0; // hero reel fade-in, 0..1, starts when the opener ends
let introStart = -1;

if (useStage) {
  const canvas = document.getElementById("stage");
  stage = createStage({
    canvas,
    texture: new THREE.VideoTexture(reel),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  });
  const resize = () => stage.setSize(window.innerWidth, window.innerHeight);
  addEventListener("resize", resize);
  resize();
} else {
  body.classList.add("no-stage");
  const fb = document.getElementById("fallback-video");
  if (!reduceMotion) {
    fb.preload = "auto";
    fb.play().catch(() => {});
  }
}

// Scroll position as a section index: 0 at the top of the hero, 4 at the bottom of the page.
const sections = [...document.querySelectorAll("[data-stage]")];
let anchors = [];
function measure() {
  const max = document.documentElement.scrollHeight - innerHeight;
  anchors = sections.map((s, i) => (i === sections.length - 1 ? max : Math.min(s.offsetTop, max)));
}
function scrollToStage() {
  const y = scrollY;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y < anchors[i + 1]) return i + Math.max(0, (y - anchors[i]) / Math.max(1, anchors[i + 1] - anchors[i]));
  }
  return SECTIONS - 1;
}
addEventListener("resize", measure);
addEventListener("load", measure);
measure();

// Pointer: parallax plus picking panels in the work section.
const pointer = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0, inside: false };
addEventListener("pointermove", (e) => {
  pointer.nx = (e.clientX / innerWidth) * 2 - 1;
  pointer.ny = -(e.clientY / innerHeight) * 2 + 1;
  pointer.tx = pointer.nx;
  pointer.ty = pointer.ny;
  pointer.inside = !e.target.closest("a, button, table, .steps, dialog");
});

let hovered = -1;
function setHovered(i) {
  if (i === hovered) return;
  hovered = i;
  stage?.setHover(i);
  workButtons.forEach((b, j) => b.classList.toggle("is-hot", j === i));
  body.classList.toggle("pick-cursor", i >= 0 && pointer.inside);
}
workButtons.forEach((b, i) => {
  b.addEventListener("pointerenter", () => setHovered(i));
  b.addEventListener("pointerleave", () => setHovered(-1));
  b.addEventListener("focus", () => setHovered(i));
  b.addEventListener("blur", () => setHovered(-1));
});
addEventListener("click", (e) => {
  if (!stage || e.target.closest("a, button, dialog")) return;
  const i = stage.pick(pointer.nx, pointer.ny);
  if (i >= 0) openViewer(String(i));
});

// ---------- Render loop ----------
let s = scrollToStage();
const t0 = performance.now();
let running = true;
document.addEventListener("visibilitychange", () => {
  running = !document.hidden;
  if (running) requestAnimationFrame(frame);
});

function frame(now) {
  if (!running || !stage) return;
  const target = scrollToStage();
  s += (target - s) * 0.12;
  if (Math.abs(target - s) < 0.0005) s = target;
  pointer.x += (pointer.tx - pointer.x) * 0.06;
  pointer.y += (pointer.ty - pointer.y) * 0.06;
  stage.setPointer(pointer.x, pointer.y);

  if (introStart >= 0) intro = Math.min(1, (now - introStart) / 1400);

  // Panels are pickable from the work section on; the list hover wins while the pointer is on it.
  if (pointer.inside && s > 0.6 && s < 1.6) {
    setHovered(stage.pick(pointer.nx, pointer.ny));
  } else if (pointer.inside && hovered >= 0) {
    setHovered(-1);
  }

  stage.renderAt(s, (now - t0) / 1000, intro);
  requestAnimationFrame(frame);
}
if (stage) requestAnimationFrame(frame);

// ---------- Opener ----------
function finishIntro() {
  if (introStart >= 0) return;
  introStart = performance.now();
  root.classList.add("intro-done");
  if (stage) reel.play().catch(() => {});
}

customElements.whenDefined("hyperframes-player").then(() => {
  const opener = document.getElementById("opener");
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    if (reduceMotion) {
      // Land on the finished title without animating.
      opener.seek(opener.duration - 0.05);
      finishIntro();
    } else {
      opener.play();
    }
  };
  opener.addEventListener("ready", start);
  if (opener.ready) start();
  opener.addEventListener("ended", finishIntro);
  // Fade the reel in before the title finishes holding.
  opener.addEventListener("timeupdate", () => {
    if (opener.currentTime > 4.6) finishIntro();
  });
  opener.addEventListener("error", finishIntro);
});
// If the player never loads, the page still finishes its entry.
setTimeout(finishIntro, 9000);

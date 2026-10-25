// Scroll drives the film-strip opening (both directions); after it, the halves hang at the
// sides and their frames advance as the page scrolls. Without WebGL, or with reduced motion,
// the page skips the opening.
import { createFilmstrip, backgroundAt } from "../motion/filmstrip/scene.js";

const body = document.body;
const params = new URLSearchParams(location.search);
if (params.has("clean")) body.classList.add("clean");
document.getElementById("year").textContent = String(new Date().getFullYear());

// ---------- Viewer ----------
const viewer = document.getElementById("viewer");
const viewerVideo = viewer.querySelector("video");
document.querySelectorAll("[data-play]").forEach((el) =>
  el.addEventListener("click", () => {
    viewer.showModal();
    viewerVideo.currentTime = 0;
    viewerVideo.play().catch(() => {});
  }),
);
viewer.querySelector(".close").addEventListener("click", () => viewer.close());
viewer.addEventListener("close", () => viewerVideo.pause());
viewer.addEventListener("click", (e) => {
  if (e.target === viewer) viewer.close();
});

// ---------- Opening ----------
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
const heroVideo = document.getElementById("hero-video");
const hero = document.querySelector(".hero");

if (reduceMotion || !webglAvailable()) {
  body.classList.add("no-strip");
  if (!reduceMotion) heroVideo.play().catch(() => {});
} else {
  const canvas = document.getElementById("strip");
  const strip = createFilmstrip({ canvas, pixelRatio: Math.min(devicePixelRatio || 1, 2) });
  const resize = () => strip.setSize(innerWidth, innerHeight);
  addEventListener("resize", resize);
  resize();

  const bgEl = document.getElementById("bg");
  const glow = document.getElementById("bg-glow");
  const vignette = document.getElementById("bg-vignette");
  const opening = document.getElementById("opening");
  const fixedP = params.has("p") ? Number(params.get("p")) : null; // for screenshots

  const target = () => {
    if (fixedP !== null) return fixedP;
    const run = opening.offsetHeight - innerHeight;
    return Math.min(1, Math.max(0, scrollY / Math.max(1, run)));
  };
  let p = target();
  let heroOn = false;
  const t0 = performance.now();

  function frame(now) {
    const goal = target();
    p += (goal - p) * 0.14;
    if (Math.abs(goal - p) < 0.0004) p = goal;

    const bg = backgroundAt(p);
    bgEl.style.background = bg.color;
    glow.style.opacity = bg.glow;
    vignette.style.opacity = bg.vignette;

    // Hero video and name arrive once the strips have hung.
    const h = Math.min(1, Math.max(0, (p - 0.86) / 0.12));
    hero.style.opacity = h;
    hero.style.transform = `translateY(${(1 - h) * 12}px)`;
    if ((h > 0.5) !== heroOn) {
      heroOn = h > 0.5;
      hero.classList.toggle("on", heroOn);
      if (heroOn) heroVideo.play().catch(() => {});
      else heroVideo.pause();
    }

    // After the opening, the film advances through the hanging strips as the page scrolls.
    const after = Math.max(0, scrollY - (opening.offsetHeight - innerHeight));
    strip.render(p, (now - t0) / 1000, after / 1400);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

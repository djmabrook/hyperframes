// Scroll flies the camera through the editing workspace, stop by stop, in both directions.
// Without WebGL, or with reduced motion, the page shows a still behind the panels instead.
import { createWorkspace, STOPS, THREE } from "../motion/workspace/scene.js";

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

// ---------- Workspace ----------
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

if (reduceMotion || !webglAvailable()) {
  body.classList.add("no-ws");
} else {
  start();
}

async function start() {
  // The interface texture uses the mono face for its timecodes.
  await document.fonts.load('500 20px "JetBrains Mono"').catch(() => {});

  // One video plays the reel on the program monitor (placeholder for now).
  const reel = document.createElement("video");
  reel.src = "media/placeholder.mp4";
  reel.muted = true;
  reel.loop = true;
  reel.playsInline = true;
  reel.preload = "auto";

  const ws = createWorkspace({
    canvas: document.getElementById("ws"),
    video: new THREE.VideoTexture(reel),
    pixelRatio: Math.min(devicePixelRatio || 1, 1.75),
  });
  const resize = () => ws.setSize(innerWidth, innerHeight);
  addEventListener("resize", resize);
  resize();

  // Scroll position as a stop index: each section's top is its stop.
  const stops = [...document.querySelectorAll("[data-stop]")];
  let anchors = [];
  const measure = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    anchors = stops.map((el, i) => (i === stops.length - 1 ? max : Math.min(el.offsetTop, max)));
  };
  addEventListener("resize", measure);
  addEventListener("load", measure);
  measure();
  const fixed = params.has("s") ? Number(params.get("s")) : null; // for screenshots
  const target = () => {
    if (fixed !== null) return fixed;
    const y = scrollY;
    for (let i = 0; i < anchors.length - 1; i++) {
      if (y < anchors[i + 1]) return i + Math.max(0, (y - anchors[i]) / Math.max(1, anchors[i + 1] - anchors[i]));
    }
    return STOPS - 1;
  };

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = -(e.clientY / innerHeight) * 2 + 1;
  });

  let s = target();
  let playing = false;
  const t0 = performance.now();
  let last = t0;
  function frame(now) {
    const goal = target();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    s += (goal - s) * (1 - Math.exp(-dt * 5)); // eases the same at any frame rate
    if (Math.abs(goal - s) < 0.0005) s = goal;
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
    ws.setPointer(pointer.x, pointer.y);

    // The reel takes over the program monitor on the way into the second stop.
    const reelMix = Math.min(1, Math.max(0, (s - 0.55) / 0.4)) * (1 - Math.min(1, Math.max(0, (s - 1.6) / 0.4)));
    if ((reelMix > 0) !== playing) {
      playing = reelMix > 0;
      if (playing) reel.play().catch(() => {});
      else reel.pause();
    }
    ws.render(s, (now - t0) / 1000, reelMix);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Scroll flies the camera through the editing workspace, stop by stop, in both directions.
// Without WebGL, or with reduced motion, the page shows a still behind the panels instead.
// The program monitor plays a HyperFrames composition (motion/monitor): drag along the timeline
// to scrub it, and drag a colour wheel's puck to grade it, gently.
import { createWorkspace, STOPS, THREE, TIMELINE, WHEELS, PUCK_REACH } from "../motion/workspace/scene.js";
import { FEATURES } from "./features.js";

const body = document.body;
const params = new URLSearchParams(location.search);
if (params.has("clean")) body.classList.add("clean");
document.getElementById("year").textContent = String(new Date().getFullYear());
if (FEATURES.lowerThird) import("./lower-third.js");

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

  const pictureTex = new THREE.Texture();
  pictureTex.generateMipmaps = false;
  pictureTex.minFilter = THREE.LinearFilter;
  const ws = createWorkspace({
    canvas: document.getElementById("ws"),
    video: new THREE.VideoTexture(reel),
    picture: pictureTex,
    pixelRatio: Math.min(devicePixelRatio || 1, 1.75),
  });
  const monitor = startMonitor();
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

  // ---------- Scrub and grade ----------
  // What the pointer is over on the screen: the timeline, a wheel (index), or nothing.
  const pickAt = (e) => ws.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const overPage = (e) => e.target instanceof Element && e.target.closest(".panel, .slate, button, a, dialog");
  const handleAt = (p) => {
    if (!p) return null;
    const k = FEATURES.grade ? WHEELS.findIndex((w) => Math.hypot(p.x - w.x, p.y - w.y) < w.r) : -1;
    if (k >= 0) return { wheel: k };
    if (FEATURES.scrub && p.y > TIMELINE.top && p.y < TIMELINE.bottom && p.x > TIMELINE.x0 - 0.1 && p.x < TIMELINE.x1 + 0.3) return { timeline: true };
    return null;
  };
  const toFraction = (p) => Math.min(1, Math.max(0, (p.x - TIMELINE.x0) / (TIMELINE.x1 - TIMELINE.x0)));

  // Wheel pucks: where the pointer put them, and where they are (eased toward that).
  const puckGoal = WHEELS.map(() => [0, 0]);
  const puck = WHEELS.map(() => [0, 0]);
  let drag = null;
  addEventListener("pointerdown", (e) => {
    if (overPage(e) || !monitor.ready()) return;
    const h = handleAt(pickAt(e));
    if (!h) return;
    drag = { ...h, id: e.pointerId };
    if (h.timeline) monitor.scrubStart(toFraction(pickAt(e)));
    else dragWheel(e);
    e.preventDefault();
  });
  const dragWheel = (e) => {
    const p = pickAt(e);
    if (!p) return;
    const w = WHEELS[drag.wheel];
    let dx = p.x - w.x;
    let dy = p.y - w.y;
    const len = Math.hypot(dx, dy);
    if (len > PUCK_REACH) [dx, dy] = [(dx / len) * PUCK_REACH, (dy / len) * PUCK_REACH];
    puckGoal[drag.wheel] = [dx, dy];
  };
  addEventListener("pointermove", (e) => {
    if (drag && e.pointerId === drag.id) {
      if (drag.timeline) {
        const p = pickAt(e);
        if (p) monitor.scrub(toFraction(p));
      } else dragWheel(e);
      return;
    }
    if (e.pointerType === "mouse") {
      const h = !overPage(e) && monitor.ready() && handleAt(pickAt(e));
      body.style.cursor = h ? (h.timeline ? "ew-resize" : "grab") : "";
    }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.timeline) monitor.scrubEnd();
    drag = null;
  };
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);

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

    // Monitor: copy the composition's frame in, move the playhead with it, ease the pucks and
    // send the grade they make.
    const m = monitor.frame(dt);
    if (m.canvas && pictureTex.image !== m.canvas) pictureTex.image = m.canvas;
    if (m.canvas) pictureTex.needsUpdate = true;
    ws.setPictureMix(m.mix);
    ws.setPlayhead(m.fraction);
    let moved = false;
    puck.forEach((p, k) => {
      for (const i of [0, 1]) {
        const next = p[i] + (puckGoal[k][i] - p[i]) * (1 - Math.exp(-dt * 6));
        if (Math.abs(next - p[i]) > 1e-5) moved = true;
        p[i] = next;
      }
    });
    if (moved) {
      ws.setWheels(puck);
      monitor.grade(gradeFrom(puck));
    }

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

// ---------- The monitor composition ----------
// <hyperframes-player> plays motion/monitor, hidden behind the workspace canvas; each frame the
// workspace samples the composition's canvas onto the program monitor.
function startMonitor() {
  const state = { player: null, canvas: null, mix: 0, wasPlaying: false, scrubbing: false };
  const script = document.createElement("script");
  script.src = "vendor/hyperframes-player-0.8.198.js";
  script.onload = () => {
    const player = document.createElement("hyperframes-player");
    player.id = "monitor-player";
    player.setAttribute("aria-hidden", "true");
    player.setAttribute("runtime-src", new URL("motion/monitor/assets/vendor/hyperframes-runtime-0.8.198.js", location.href).href);
    player.setAttribute("disable-click-to-play", "");
    player.setAttribute("assets-loading-ui", "none");
    player.setAttribute("muted", "");
    player.setAttribute("src", "motion/monitor/index.html");
    document.body.appendChild(player);
    player.loop = true;
    state.player = player;
  };
  document.head.appendChild(script);

  const findCanvas = () => {
    try {
      const c = state.player.iframeElement?.contentDocument?.getElementById("picture");
      return c && c.width ? c : null;
    } catch {
      return null; // a host that won't share the frame: the fallback picture stays
    }
  };
  const ready = () => !!state.canvas;

  return {
    ready,
    frame(dt) {
      const p = state.player;
      if (p && !state.canvas && p.ready) {
        state.canvas = findCanvas();
        if (state.canvas) p.play();
      }
      if (state.canvas) state.mix = Math.min(1, state.mix + dt / 0.6);
      const fraction = state.canvas && p.duration ? Math.min(1, p.currentTime / p.duration) : null;
      return { canvas: state.canvas, mix: state.mix, fraction };
    },
    scrubStart(f) {
      const p = state.player;
      state.wasPlaying = !p.paused;
      state.scrubbing = true;
      p.pause();
      p.seek(f * p.duration);
    },
    scrub(f) {
      if (state.scrubbing) state.player.seek(f * state.player.duration);
    },
    scrubEnd() {
      state.scrubbing = false;
      if (state.wasPlaying) state.player.play();
    },
    grade(g) {
      if (ready()) state.player.setRuntimeData("grade", g);
    },
  };
}

// Puck offsets to a primary grade, kept small so it reads as a gentle shift. A puck pushed
// toward a hue on the wheel moves that wheel's range toward that hue.
const STRENGTH = { lift: 0.05, gamma: 0.08, gain: 0.08, offset: 0.025 };
function gradeFrom(pucks) {
  const tint = ([dx, dy], amount) => {
    const len = Math.hypot(dx, dy) / PUCK_REACH;
    if (len < 1e-4) return [0, 0, 0];
    // The painted wheels run red → yellow → green clockwise from three o'clock (y down).
    const h = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1;
    const rgb = [5, 3, 1].map((n) => {
      const k = (n + h * 6) % 6;
      return 1 - Math.max(0, Math.min(k, 4 - k, 1));
    });
    const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
    return rgb.map((c) => (c - mean) * len * amount);
  };
  const [lift, gamma, gain, offset] = pucks.map((p, k) => tint(p, Object.values(STRENGTH)[k]));
  return {
    lift,
    gamma: gamma.map((c) => 1 + c),
    gain: gain.map((c) => 1 + c),
    offset,
  };
}

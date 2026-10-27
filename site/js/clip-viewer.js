// Feature "clipViewer": clicking a clip in the bin sends it to the colour page's viewer, the
// smaller monitor on the right, and it starts playing there. The camera turns to frame the
// viewer, then punches in to twice the size it would have beside the bin (capped to the window),
// while the bin steps aside. Scroll on, press Esc, click off the viewer, or let the clip end, and the
// camera eases back and the bin returns. Click the viewer to pause or play.
// Off, a clip opens full size in a dialog instead.
import { THREE, VIEW } from "../motion/workspace/scene.js";

export function setupClipViewer({ ws }) {
  const video = document.createElement("video");
  video.playsInline = true;
  video.addEventListener("ended", () => release());
  video.preload = "auto";
  ws.setClip(new THREE.VideoTexture(video));
  const panel = document.querySelector("#work .panel");
  const state = { on: false, focus: 0, mix: 0, anchor: 0, settleUntil: 0, button: null };

  const play = () => {
    video.muted = false;
    video.play().catch(() => {
      video.muted = true; // a browser that won't play sound here still shows the picture
      video.play().catch(() => {});
    });
  };
  const release = () => {
    if (!state.on) return;
    state.on = false;
    video.pause();
    panel.classList.remove("stepped-aside");
  };

  // The viewer's width beside the bin panel: to its left, or above it, whichever leaves more room.
  // The punch-in doubles that, as large as the window allows, centred while the bin steps aside.
  function framePunchedIn() {
    const r = panel.getBoundingClientRect();
    const fits = (w, h) => Math.min(w, (h * 16) / 9);
    const beside = Math.max(fits(r.left * 0.9, innerHeight * 0.8), fits(innerWidth * 0.9, innerHeight * 0.4 * 0.8)) * 0.74;
    const w = Math.min(beside * 2, fits(innerWidth * 0.92, innerHeight * 0.82));
    const h = (w * 9) / 16;
    // Region sized so viewerShot's margins leave the picture exactly w by h.
    const rw = w / 0.74 / innerWidth;
    const rh = h / 0.8 / innerHeight;
    state.anchor = scrollY;
    ws.setFocus(0, { x0: 0.5 - rw / 2, x1: 0.5 + rw / 2, y0: 0.5 - rh / 2, y1: 0.5 + rh / 2 });
    panel.classList.add("stepped-aside");
  }

  function send(button, clip) {
    if (state.button !== button) {
      state.button?.removeAttribute("aria-current");
      button.setAttribute("aria-current", "true");
      state.button = button;
      state.mix = 0;
      video.src = clip.video;
    }
    framePunchedIn();
    state.on = true;
    play();
  }

  addEventListener(
    "scroll",
    () => {
      if (state.on && performance.now() > state.settleUntil && Math.abs(scrollY - state.anchor) > innerHeight * 0.35) release();
    },
    { passive: true },
  );
  addEventListener("keydown", (e) => e.key === "Escape" && release());
  addEventListener("pointerdown", (e) => {
    if (!state.button || (e.target instanceof Element && e.target.closest(".panel, .slate, button, a, dialog"))) return;
    const p = ws.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (!p || p.x < VIEW.x || p.x > VIEW.x + VIEW.w || p.y < VIEW.y || p.y > VIEW.y + VIEW.h) {
      release();
      return;
    }
    if (video.paused) play();
    else video.pause();
  });

  // Per frame: ease the camera's turn and fade the clip in once it has a picture.
  const frame = (dt) => {
    state.focus += ((state.on ? 1 : 0) - state.focus) * (1 - Math.exp(-dt * 3));
    if (!state.on && state.focus < 0.001) state.focus = 0;
    if (state.button && video.readyState >= 2) state.mix = Math.min(1, state.mix + dt / 0.4);
    ws.setFocus(state.focus);
    ws.setClipMix(state.mix);
  };
  return { send, frame };
}

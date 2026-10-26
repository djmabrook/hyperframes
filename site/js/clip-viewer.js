// Feature "clipViewer": clicking a clip in the bin sends it to the colour page's viewer, the
// smaller monitor on the right, and it starts playing there. The camera turns to frame the
// viewer beside the bin (above it on narrow screens). Scroll on, or press Esc, and the camera
// goes back to the page and the clip pauses. Click the viewer to pause or play.
// Off, a clip opens full size in a dialog instead.
import { THREE, VIEW } from "../motion/workspace/scene.js";

export function setupClipViewer({ ws }) {
  const video = document.createElement("video");
  video.playsInline = true;
  video.loop = true;
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
  };

  // Frame the viewer where the bin panel leaves room: to its left, or above it on narrow
  // screens, scrolling the panel down a little to make that room.
  function frameBesidePanel() {
    const r = panel.getBoundingClientRect();
    state.anchor = scrollY;
    if (r.width < innerWidth * 0.6) {
      ws.setFocus(0, { x0: 0.02, x1: r.left / innerWidth - 0.02, y0: 0.08, y1: 0.92 });
      return;
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    const want = Math.max(innerHeight * 0.4, innerHeight - r.height - 16);
    state.anchor = Math.min(max, Math.max(0, scrollY + r.top - want));
    const top = r.top - (state.anchor - scrollY);
    ws.setFocus(0, { x0: 0, x1: 1, y0: 0.03, y1: Math.max(0.2, top / innerHeight - 0.02) });
    if (state.anchor !== scrollY) {
      state.settleUntil = performance.now() + 1200;
      scrollTo({ top: state.anchor, behavior: "smooth" });
    }
  }

  function send(button, clip) {
    if (state.button !== button) {
      state.button?.removeAttribute("aria-current");
      button.setAttribute("aria-current", "true");
      state.button = button;
      state.mix = 0;
      video.src = clip.video;
    }
    frameBesidePanel();
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
    if (!p || p.x < VIEW.x || p.x > VIEW.x + VIEW.w || p.y < VIEW.y || p.y > VIEW.y + VIEW.h) return;
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

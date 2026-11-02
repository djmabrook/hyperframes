// Feature "clipViewer": clicking a clip in the bin sends it to the colour page's viewer, the
// smaller monitor on the right, and it starts playing there. The camera turns to frame the
// viewer, then punches in to twice the size it would have beside the bin (capped to the window),
// while the bin steps aside. Scroll on, press Esc, click off the viewer, or let the clip end, and the
// camera eases back and the bin returns. Click the viewer, press space or use the transport bar
// under it to pause or play; hold rewind or fast-forward to shuttle (2x, then 4x after a second).
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
    stopShuttle();
    video.pause();
    panel.classList.remove("stepped-aside");
    transport.hidden = true;
  };
  const toggle = () => (video.paused ? play() : video.pause());

  // Transport bar: shown under the viewer while a clip is punched in.
  const transport = document.createElement("div");
  transport.className = "transport";
  transport.hidden = true;
  transport.innerHTML = `
    <button type="button" class="t-rew" aria-label="Rewind (hold)"><svg viewBox="0 0 24 24"><path d="M11 6v12L3 12zM20 6v12l-8-6z"/></svg></button>
    <button type="button" class="t-play" aria-label="Play or pause"><svg viewBox="0 0 24 24"><path class="i-play" d="M7 5v14l12-7z"/><path class="i-pause" d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>
    <button type="button" class="t-ff" aria-label="Fast-forward (hold)"><svg viewBox="0 0 24 24"><path d="M13 6v12l8-6zM4 6v12l8-6z"/></svg></button>`;
  document.body.append(transport);
  const playButton = transport.querySelector(".t-play");
  const showState = () => playButton.classList.toggle("playing", !video.paused);
  video.addEventListener("play", showState);
  video.addEventListener("pause", showState);
  playButton.addEventListener("click", toggle);

  // Shuttle while held: forward speeds up playback; backward steps the time back on a timer,
  // since browsers don't play in reverse. Letting go restores whatever was playing before.
  let shuttle = null;
  function startShuttle(dir, button) {
    stopShuttle();
    const wasPlaying = !video.paused;
    const t0 = performance.now();
    const speed = () => (performance.now() - t0 > 1000 ? 4 : 2);
    let last = t0;
    const timer = setInterval(() => {
      const now = performance.now();
      if (dir > 0) video.playbackRate = speed();
      else video.currentTime = Math.max(0, video.currentTime - (speed() * (now - last)) / 1000);
      last = now;
    }, 50);
    if (dir > 0) {
      video.playbackRate = 2;
      play();
    } else video.pause();
    button.classList.add("held");
    shuttle = { timer, wasPlaying, button };
  }
  function stopShuttle() {
    if (!shuttle) return;
    clearInterval(shuttle.timer);
    video.playbackRate = 1;
    shuttle.button.classList.remove("held");
    if (shuttle.wasPlaying) play();
    else video.pause();
    shuttle = null;
  }
  for (const [cls, dir] of [[".t-rew", -1], [".t-ff", 1]]) {
    const b = transport.querySelector(cls);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      startShuttle(dir, b);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(type, stopShuttle);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  }

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
    transport.style.top = `${Math.min(innerHeight - 64, (innerHeight + h) / 2 + 14)}px`;
    transport.hidden = false;
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
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") release();
    else if (e.key === " " && state.on && !(e.target instanceof Element && e.target.closest("input, textarea"))) {
      e.preventDefault();
      toggle();
    }
  });
  addEventListener("pointerdown", (e) => {
    if (!state.button || (e.target instanceof Element && e.target.closest(".panel, .slate, .transport, button, a, dialog"))) return;
    const p = ws.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (!p || p.x < VIEW.x || p.x > VIEW.x + VIEW.w || p.y < VIEW.y || p.y > VIEW.y + VIEW.h) {
      release();
      return;
    }
    toggle();
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

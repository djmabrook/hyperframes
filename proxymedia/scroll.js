/* Scroll is the only clock. The seekable Hyperframes timeline owns all poses. */
(() => {
  const frame = document.getElementById("frame");
  const root = document.documentElement;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const W = 1920,
    H = 1080;
  let player,
    raf = 0,
    current = 0,
    shown = -1,
    last = 0,
    ready = false;
  let maxScroll = 1,
    baseScale = 1,
    coverScale = 1,
    endScale = 1;
  // Where the punch lands. Wide screens: the curved glass plus a little bezel
  // (scene zoom 2.7, glass 508 px wide), filling the screen. Screens whose frame
  // would end shorter than the viewport (portrait phones) instead land on the
  // whole TV: 545 px tall + 80 px of wall above and below (centred at y 527),
  // and 636 px wide + 12 px each side, so the letterbox fade only ever touches
  // wall, never the set.
  const GLASS_END = { scale: 2.7, aimY: 496, width: 508 * 1.06 };
  const TV_END = { scale: 1080 / 705, aimY: 527, width: 660 };
  let sceneEnd = GLASS_END;
  function compositionReady() {
    if (!player?.ready || !player.duration) return false;
    if (player.assetsReady) return true;
    // The pinned player does not report module-created WebGL assets in its
    // loading manifest. Gate the same-origin composition explicitly as well.
    try {
      const win = player.iframeElement.contentWindow;
      return (
        Boolean(win.__proxyScene?.model) &&
        Array.from(win.document.images).every((img) => img.complete && img.naturalWidth > 0)
      );
    } catch {
      return false;
    }
  }
  function layout() {
    maxScroll = Math.max(1, root.scrollHeight - innerHeight);
    // Keep all three objects visible on portrait screens; only zoom into the TV
    // at the end, rather than cropping the cassette away at the start.
    coverScale = Math.max(innerWidth / W, innerHeight / H);
    const scale = (baseScale = Math.min(coverScale, innerWidth / (W * 0.42)));
    sceneEnd = GLASS_END;
    endScale = Math.min(coverScale, innerWidth / (GLASS_END.width * GLASS_END.scale));
    if (H * endScale < innerHeight - 1) {
      sceneEnd = TV_END;
      endScale = Math.min(coverScale, innerWidth / (TV_END.width * TV_END.scale));
    }
    frame.style.width = `${W * scale}px`;
    frame.style.height = `${H * scale}px`;
    frame.classList.toggle("letterbox", H * scale < innerHeight - 1);
    wake();
  }
  const fraction = () => Math.max(0, Math.min(1, scrollY / maxScroll));
  function wake() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    raf = 0;
    // An unavailable 3D renderer keeps the static poster; never put a 2D
    // stand-in underneath the live cassette. Stop polling after that result.
    const model = player?.iframeElement?.contentWindow?.__proxyScene?.model;
    if (model?.ready === false) return;
    if (!compositionReady()) {
      wake();
      return;
    }
    const target = fraction() * player.duration;
    if (!ready) {
      player.pause();
      current = target;
      ready = true;
    }
    // Time-correct damping, identical at 60/120/144 Hz. Snap after tab restore.
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.05, elapsed);
    last = now;
    current =
      motion.matches || elapsed > 0.25
        ? target
        : current + (target - current) * -Math.expm1(-dt / 0.11);
    if (Math.abs(target - current) < 0.0001) current = target;
    const scene = player.iframeElement.contentWindow.__proxyScene;
    if (scene.end.scale !== sceneEnd.scale) {
      scene.setEnd(sceneEnd.scale, sceneEnd.aimY);
      shown = -1;
    }
    if (Math.abs(current - shown) > 0.00001) {
      player.seek(current);
      const punch = Math.max(0, Math.min(1, (current / player.duration - 0.76) / 0.2));
      const scale = baseScale + (endScale - baseScale) * punch * punch * (3 - 2 * punch);
      frame.style.width = `${W * scale}px`;
      frame.style.height = `${H * scale}px`;
      frame.classList.toggle("letterbox", H * scale < innerHeight - 1);
      shown = current;
      if (!frame.classList.contains("ready")) frame.classList.add("ready");
      root.style.setProperty(
        "--screen-progress",
        String(Math.min(1, Math.max(0, (current / player.duration - 0.96) / 0.04))),
      );
      document.body.dataset.sequenceComplete =
        current >= player.duration - 0.001 ? "true" : "false";
      // The set powers on when the punch lands, and off again when scrolling
      // back out. The CRT runs on its own clock; scroll only switches it.
      const crt = player.iframeElement.contentWindow.__proxyCRT;
      if (crt) {
        crt.setViewScale(scale * devicePixelRatio);
        if (current >= 13.7) crt.powerOn();
        else if (current < 13.55) crt.powerOff();
      }
    }
    if (current !== target) raf = requestAnimationFrame(tick);
  }
  customElements.whenDefined("hyperframes-player").then(() => {
    player = document.createElement("hyperframes-player");
    player.setAttribute(
      "runtime-src",
      new URL("motion/landing/assets/vendor/hyperframes-runtime-0.8.198.js", location.href).href,
    );
    player.setAttribute("disable-click-to-play", "");
    player.setAttribute("assets-loading-ui", "none");
    player.setAttribute("muted", "");
    player.setAttribute("src", "motion/landing/index.html");
    frame.appendChild(player);
    wake();
  });
  addEventListener("scroll", wake, { passive: true });
  addEventListener("resize", layout, { passive: true });
  addEventListener("pageshow", () => {
    layout();
    wake();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake();
  });
  motion.addEventListener("change", wake);
  layout();
})();

/* Scroll is the only clock. The seekable Hyperframes timeline owns all poses.

   The landing's scroll length is split by markers in index.html:
     0 .. #mark-tv            the 14 s camera move, ending on the TV (power on)
     #mark-tv .. #mark-strain  hold: the program plays
     #mark-strain .. #mark-off resistance: the wheel is damped, the set strains
                               toward you; push through and it powers off
     #mark-off .. #mark-unspool-end  VHS tape unspools from above (tape/)
*/
(() => {
  const frame = document.getElementById("frame");
  const stage = document.getElementById("stage");
  const landing = document.getElementById("landing");
  const marks = {};
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
  // How far the set leans in at the end of the resistance zone. Phones keep it
  // small so the whole-TV framing never loses its wall margin.
  const STRAIN = { wide: 0.035, tv: 0.012 };
  const OFF_HYSTERESIS = 24; // px of scroll between power-off and power back on
  let maxScroll = 1,
    strain = 0,
    strainShown = -1,
    tvOff = false,
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
    for (const id of ["tv", "strain", "off", "unspool-end"]) {
      const el = document.getElementById(`mark-${id}`);
      marks[id] = el.getBoundingClientRect().top + scrollY;
    }
    // The camera move spans the scroll up to the punch-in marker.
    maxScroll = Math.max(1, marks.tv);
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
    // The size above is the opening pose. Have the next tick re-apply the pose
    // for the current scroll position, or a resize at the end of the sequence
    // (iOS Safari's toolbar collapsing as you scroll) would jump to that size.
    shown = -1;
    wake();
  }
  const fraction = () => Math.max(0, Math.min(1, scrollY / maxScroll));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  // Resistance: the lean grows fast at first, then barely gives (a rubber band).
  // At the power-off marker it lets go and springs back.
  function strainTarget() {
    if (scrollY >= marks.off) return 0;
    const r = clamp01((scrollY - marks.strain) / (marks.off - marks.strain));
    return (sceneEnd === TV_END ? STRAIN.tv : STRAIN.wide) * (1 - Math.pow(1 - r, 2.4));
  }
  function inStrainZone() {
    return scrollY >= marks.strain - 1 && scrollY < marks.off;
  }
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
    const sTarget = strainTarget();
    strain =
      motion.matches || elapsed > 0.25
        ? sTarget
        : strain + (sTarget - strain) * -Math.expm1(-dt / (sTarget < strain ? 0.07 : 0.12));
    if (Math.abs(sTarget - strain) < 0.00002) strain = sTarget;
    const scene = player.iframeElement.contentWindow.__proxyScene;
    if (scene.end.scale !== sceneEnd.scale) {
      scene.setEnd(sceneEnd.scale, sceneEnd.aimY);
      shown = -1;
    }
    // Past the marker the set is off; a little above it, on again.
    if (scrollY >= marks.off) tvOff = true;
    else if (scrollY < marks.off - OFF_HYSTERESIS) tvOff = false;
    if (Math.abs(current - shown) > 0.00001 || strain !== strainShown) {
      if (Math.abs(current - shown) > 0.00001) player.seek(current);
      const punch = Math.max(0, Math.min(1, (current / player.duration - 0.76) / 0.2));
      const scale =
        (baseScale + (endScale - baseScale) * punch * punch * (3 - 2 * punch)) * (1 + strain);
      strainShown = strain;
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
      if (crt) crt.setViewScale(scale * devicePixelRatio);
    }
    const crt = player.iframeElement.contentWindow.__proxyCRT;
    if (crt) {
      if (current >= 13.7 && !tvOff) crt.powerOn();
      else if (current < 13.55 || tvOff) crt.powerOff();
    }
    publishStage();
    if (current !== target || strain !== sTarget) raf = requestAnimationFrame(tick);
  }
  // Hand the tape (tape/tape-ribbons.js) where the TV photograph is on screen
  // and how far the tape has unspooled. k is CSS px per #tv-shot px; ox/oy is
  // where #tv-shot's origin sits, relative to the stage.
  function publishStage() {
    const st = player.iframeElement.contentWindow.__proxyScene.state;
    const f = frame.getBoundingClientRect();
    const g = stage.getBoundingClientRect();
    const sx = f.width / W,
      sy = f.height / H;
    const feed = clamp01((scrollY - marks.off) / (marks["unspool-end"] - marks.off));
    const next = {
      k: st.scale * sx,
      ox: f.left - g.left + st.tx * sx,
      oy: f.top - g.top + (st.scale * 2240 + st.ty) * sy,
      width: g.width,
      height: g.height,
      feed,
      // Only live once the camera has landed on the TV.
      active: current >= player.duration - 0.001 && scrollY < landing.offsetHeight,
    };
    const prev = window.__proxyStage;
    if (
      prev &&
      ["k", "ox", "oy", "width", "height", "feed", "active"].every((key) => prev[key] === next[key])
    )
      return;
    window.__proxyStage = next;
    dispatchEvent(new CustomEvent("proxy-stage", { detail: next }));
  }
  // The wheel is heavier in the resistance zone: forward wheel input moves the
  // page at 40%. Touch, keys and the scrollbar are left alone (the scroll-snap
  // catch at #mark-tv plays that role on phones).
  addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.deltaY <= 0 || !inStrainZone() || motion.matches) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      scrollBy(0, Math.max(1, e.deltaY * unit * 0.4));
    },
    { passive: false },
  );
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

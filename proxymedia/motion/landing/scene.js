/* One deterministic scene, sampled at fractional seconds by Hyperframes.
   There are no shot swaps, pose handoffs, or independent animation clocks. */
(() => {
  const W = 1920,
    H = 1080,
    VCR_Y = 1120,
    TV_Y = 2240,
    DURATION = 14;
  const elements = Object.fromEntries(
    ["world", "tape-fallback", "tape-mask", "tape-shadow", "vcr-closed"].map((id) => [
      id,
      document.getElementById(id),
    ]),
  );
  const clamp = (v) => Math.max(0, Math.min(1, v));
  // Quintic interpolation has zero velocity AND acceleration at each endpoint.
  const smooth = (t, a, b) => {
    const u = clamp((t - a) / (b - a));
    return u * u * u * (u * (u * 6 - 15) + 10);
  };
  const mix = (a, b, u) => a + (b - a) * u;
  function stateAt(t) {
    t = Math.max(0, Math.min(DURATION, t));
    const approach = smooth(t, 0.7, 5.1);
    const insert = smooth(t, 5.55, 7.35);
    const tilt = smooth(t, 8.0, 10.8);
    const punch = smooth(t, 10.65, 13.7);
    // Aim at the original photographed glass; no dissolve to a different TV photograph.
    const scale = Math.exp(Math.log(4.05) * punch);
    const cameraY = VCR_Y * approach + (TV_Y - VCR_Y) * tilt;
    const aimY = mix(H / 2, 510, punch);
    return {
      time: t,
      cameraY,
      scale,
      approach,
      insert,
      tilt,
      punch,
      tx: (W / 2) * (1 - scale),
      ty: H / 2 - scale * (cameraY + aimY),
      x: mix(962.25, 949, approach),
      y: mix(520, VCR_Y + 650, approach) - 250 * insert,
      pitch: -64 * approach,
      width: mix(630.5, 682, approach) * mix(1, 0.88, insert),
      opacity: 1 - smooth(t, 7.15, 7.35),
      flap: smooth(t, 7.35, 7.8),
      shadow: 1 - smooth(t, 0.7, 2.0),
      // Occlusion starts after settling; same continuous tape slides behind slot lip.
      clipTop: t >= 5.55 ? VCR_Y + 533.5 : 0,
      complete: t >= 13.7,
    };
  }
  function renderAt(t) {
    const s = stateAt(t);
    elements.world.style.transform = `matrix(${s.scale},0,0,${s.scale},${s.tx},${s.ty})`;
    const k = s.width / 630.5;
    elements["tape-fallback"].style.transform =
      `translate3d(${s.x - 315.25}px,${s.y - 184.5}px,0) perspective(1888px) rotateX(${s.pitch}deg) scale(${k})`;
    elements["tape-mask"].style.opacity = s.opacity;
    elements["tape-mask"].style.clipPath = `inset(${s.clipTop}px 0 0 0)`;
    elements["tape-shadow"].style.opacity = s.shadow;
    elements["tape-shadow"].style.transform =
      `translate(0,${s.approach * 80}px) scale(${1 + s.approach * 0.15})`;
    // Animate only the flap patch, not a whole-frame dissolve with shifting texture.
    elements["vcr-closed"].style.opacity = s.flap;
    document.getElementById("root").dataset.phase = s.complete
      ? "screen"
      : s.punch > 0
        ? "punch"
        : s.tilt > 0
          ? "tilt"
          : s.insert > 0
            ? "insert"
            : "approach";
    window.__proxyScene.state = s;
    window.__proxyTapeRender?.(s);
    return t;
  }
  window.__proxyScene = { stateAt, renderAt, duration: DURATION, state: null };
  const clock = { time: 0 };
  const tl = gsap.timeline({ paused: true });
  tl.to(
    clock,
    {
      time: DURATION,
      duration: DURATION,
      ease: "none",
      modifiers: { time: (value) => renderAt(Number(value)) },
    },
    0,
  );
  window.addEventListener("hf-seek", (event) => renderAt(event.detail.time));
  renderAt(0);
  window.__proxyScene.timeline = tl;
})();

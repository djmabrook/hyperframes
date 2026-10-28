/* One deterministic scene, sampled at fractional seconds by Hyperframes.
   There are no shot swaps, pose handoffs, or independent animation clocks. */
(() => {
  const W = 1920,
    H = 1080,
    VCR_Y = 1120,
    TV_Y = 2240,
    DURATION = 14;
  // Where the punch-in lands. The default frames the curved glass with a little
  // bezel. Hosts whose frame is shorter than the screen (portrait phones) ask
  // for the whole TV instead via setEnd(), so no edge of the set is cut off.
  const end = { scale: 2.7, aimY: 496 };
  // After the TV powers off, the host pulls the camera back and lowers it by
  // this many composition px (setDrift), so the TV rises up the screen.
  let drift = 0;
  // Measured in the VCR photograph's 1920×1080 coordinate space. Keep the
  // cassette's entering cross-section inside the dark aperture, not its bezel.
  const SLOT = {
    x: 951,
    y: VCR_Y + 496,
    left: 651,
    right: 1251,
    top: VCR_Y + 460,
    bottom: VCR_Y + 534,
  };
  const TAPE_WIDTH = 580;
  const PITCH = -64;
  const elements = Object.fromEntries(
    ["world", "tape-mask", "vcr-closed"].map((id) => [id, document.getElementById(id)]),
  );
  const clamp = (v) => Math.max(0, Math.min(1, v));
  // Quintic interpolation has zero velocity AND acceleration at each endpoint.
  const smooth = (t, a, b) => {
    const u = clamp((t - a) / (b - a));
    return u * u * u * (u * (u * 6 - 15) + 10);
  };
  const mix = (a, b, u) => a + (b - a) * u;
  function stateAt(t, d = drift) {
    t = Math.max(0, Math.min(DURATION, t));
    const approach = smooth(t, 0.7, 5.1);
    const insert = smooth(t, 5.55, 7.35);
    const tilt = smooth(t, 8.0, 10.8);
    const punch = smooth(t, 10.65, 13.7);
    const geometry = window.__proxyScene.geometry;
    const pitchRadians = (PITCH * Math.PI) / 180;
    const tapeLength = TAPE_WIDTH * geometry.lengthRatio;
    const projectedLength = tapeLength * Math.cos(pitchRadians);
    const entryCenterY = SLOT.y + projectedLength / 2;
    // Aim at the original photographed glass; no dissolve to a different TV photograph.
    // Land with the whole curved glass and a little bezel in frame, so the CRT
    // reads as a tube rather than a flat fill.
    const scale = Math.exp(Math.log(end.scale) * punch);
    const cameraY = VCR_Y * approach + (TV_Y - VCR_Y) * tilt;
    const aimY = mix(H / 2, end.aimY, punch) + d;
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
      x: mix(962.25, SLOT.x, approach),
      // Translate one cassette length along its own insertion axis. The
      // section crossing the VCR's front plane stays centered in the slot.
      y: mix(520, entryCenterY, approach) - projectedLength * insert,
      depth: -tapeLength * Math.sin(-pitchRadians) * insert,
      pitch: PITCH * approach,
      width: mix(630.5, TAPE_WIDTH, approach),
      opacity: insert < 1 ? 1 : 0,
      flap: smooth(t, 7.35, 7.8),
      complete: t >= 13.7,
    };
  }
  function renderAt(t) {
    const s = stateAt(t);
    elements.world.style.transform = `matrix(${s.scale},0,0,${s.scale},${s.tx},${s.ty})`;
    elements["tape-mask"].style.opacity = s.opacity;
    // Occlusion is handled inside the 3D material at the insertion plane.
    // A screen-space clip at the lower lip would put the tape under the slot.
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
  window.__proxyScene = {
    stateAt,
    renderAt,
    duration: DURATION,
    state: null,
    slot: SLOT,
    end,
    setEnd(scale, aimY) {
      end.scale = scale;
      end.aimY = aimY;
    },
    setDrift(px) {
      drift = px;
    },
    geometry: { lengthRatio: 103 / 187, thicknessRatio: 25 / 187 },
  };
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

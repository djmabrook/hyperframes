/* The project list, scrawled in Sharpie on the plaster (a Codex-made
   photograph). On portrait phones the camera pans from group to group. */
(() => {
  const section = document.getElementById("notes");
  if (!section) return;
  const plate = section.querySelector(".nt-plate");

  const PW = 3840,
    PH = 2160;
  // Centres of the three groups of writing on the plate.
  const GROUPS = [
    [1310, 850],
    [2180, 1150],
    [1430, 1400],
  ];

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => v * v * (3 - 2 * v);

  let vw = 0,
    vh = 0,
    k = 1,
    tall = false,
    raf = 0;

  function layout() {
    vw = innerWidth;
    vh = innerHeight;
    tall = vw < vh * 0.9;
    // Wide screens see the whole wall; portrait phones a window about a third
    // as wide, so the writing stays legible.
    k = tall ? Math.max(vw / 1300, vh / PH) : Math.max(vw / PW, vh / PH);
    frame();
  }

  // Where the camera looks: the middle of the plate on wide screens, or a
  // pan across the three groups (with a hold on each) on portrait phones.
  function focus() {
    if (!tall) return [PW / 2, PH / 2];
    const rect = section.getBoundingClientRect();
    const p = clamp(-rect.top / Math.max(1, rect.height - vh));
    const seg = clamp(p * 1.25) * (GROUPS.length - 1);
    const i = Math.min(GROUPS.length - 2, Math.floor(seg));
    const t = ease(clamp((seg - i - 0.25) / 0.5));
    const [ax, ay] = GROUPS[i],
      [bx, by] = GROUPS[i + 1];
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  }

  function frame() {
    let [fx, fy] = focus();
    // Never show past the edge of the photograph.
    fx = clamp(fx, vw / (2 * k), PW - vw / (2 * k));
    fy = clamp(fy, vh / (2 * k), PH - vh / (2 * k));
    plate.style.transform = `translate(${vw / 2 - fx * k}px, ${vh / 2 - fy * k}px) scale(${k})`;
  }

  addEventListener(
    "scroll",
    () => {
      if (tall && !raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          frame();
        });
    },
    { passive: true },
  );
  addEventListener("resize", layout, { passive: true });
  layout();
})();

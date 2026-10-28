/* The mailbox: scrolling swings the middle door open and a paper contact form
   flops out of the box and lifts up to be filled in. Scrolling back reverses
   it. Springs give the door and the paper their weight. */
(() => {
  const section = document.getElementById("mailbox");
  if (!section) return;
  const plate = section.querySelector(".mb-plate");
  const door = section.querySelector(".mb-door");
  const form = section.querySelector(".mb-form");
  const status = form.querySelector(".mb-status");
  const submit = form.querySelector("button[type=submit]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // Plate units (the 3840 x 2160 photograph). The middle door's opening, its
  // floor lip, and roughly how deep the compartment runs behind it.
  const PW = 3840,
    PH = 2160,
    P = 3840;
  const OPEN = { x: 1704, y: 523, w: 425, h: 1139 };
  const LIP = 1640,
    DEPTH = 1400;
  const BOX = { x: 980, w: 1880 };

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (v) => v * v * (3 - 2 * v);
  const span = (p, a, b) => ease(clamp((p - a) / (b - a)));

  let vw = 0,
    vh = 0,
    scale = 1,
    fw = 440,
    fh = 560,
    raf = 0,
    last = 0,
    locked = false;

  // Each value chases its scroll target on a spring. Light damping on the
  // door and the paper's tip gives the bounce; the rest are near critical.
  const spring = (stiff, damp) => ({ x: 0, v: 0, target: 0, stiff, damp });
  const S = {
    approach: spring(90, 19),
    door: spring(120, 9),
    slide: spring(160, 24),
    droop: spring(170, 7),
    rise: spring(110, 21),
  };

  function layout() {
    vw = innerWidth;
    vh = innerHeight;
    // Fill the screen like the other frames, but keep the mailbox in frame:
    // all of it on wide screens, the middle three doors on a portrait phone.
    const keep = vw < vh ? 1350 : BOX.w;
    scale = Math.min(Math.max(vw / PW, vh / PH), (vw * 0.96) / keep);
    plate.classList.toggle("letterbox", PH * scale < vh - 1);
    fw = Math.min(440, vw - 32);
    form.style.width = `${fw}px`;
    form.style.padding = fw < 400 ? "24px 20px 18px" : "";
    fh = form.offsetHeight;
    // Give tall forms room on short screens by tightening the message box.
    const ta = form.querySelector("textarea");
    ta.rows = vh - 40 < fh ? 3 : 5;
    fh = form.offsetHeight;
    wake();
  }

  function progress() {
    const rect = section.getBoundingClientRect();
    return clamp(-rect.top / Math.max(1, rect.height - vh));
  }

  function targets(p) {
    // While someone is filling the form in, hold it up whatever the page does
    // (a phone keyboard scrolls the page when it opens).
    if (locked) p = 1;
    S.approach.target = span(p, 0, 0.14);
    S.door.target = span(p, 0.1, 0.32);
    S.slide.target = span(p, 0.3, 0.44);
    // The sheet tips off the lip all at once, the way paper does.
    S.droop.target = span(p, 0.42, 0.47);
    S.rise.target = span(p, 0.58, 0.8);
  }

  function step(dt) {
    let moving = false;
    for (const s of Object.values(S)) {
      if (reduced.matches) {
        s.x = s.target;
        s.v = 0;
        continue;
      }
      // Semi-implicit Euler in small slices keeps the springs stable.
      const n = Math.ceil(dt / 0.008);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        s.v += (s.stiff * (s.target - s.x) - s.damp * s.v) * h;
        s.x += s.v * h;
      }
      if (Math.abs(s.target - s.x) < 0.0004 && Math.abs(s.v) < 0.001) {
        s.x = s.target;
        s.v = 0;
      } else moving = true;
    }
    return moving;
  }

  function render() {
    const a = S.approach.x,
      d = S.door.x,
      sl = clamp(S.slide.x),
      dr = S.droop.x,
      r = clamp(S.rise.x),
      er = ease(r);
    // Camera: a slow push in toward the middle door.
    const k = scale * (1 + 0.07 * a);
    const fx = OPEN.x + OPEN.w / 2,
      fy = PH / 2 + (OPEN.y + OPEN.h / 2 - PH / 2) * a * 0.5;
    const ox = vw / 2 - fx * k,
      oy = vh / 2 - fy * k;
    const plateT = `translate(${ox}px, ${oy}px) scale(${k})`;
    plate.style.transform = plateT;
    door.style.setProperty("--door", (d * 118).toFixed(2));
    section.style.setProperty("--dim", (0.6 * er).toFixed(3));

    // The paper, in plate units, pivoting on its top edge. It lies face up on
    // the compartment floor, slides out over the lip, tips down to hang face
    // out with a bounce, then lifts to the middle of the screen at real size.
    const S0 = (OPEN.w * 0.72) / fw;
    const hx = OPEN.x + OPEN.w / 2,
      hy = LIP,
      hz = -DEPTH * 0.55 * (1 - sl) + 6;
    const tx = (vw / 2 - ox) / k,
      ty = (vh / 2 - fh / 2 - oy) / k;
    const X = hx + (tx - hx) * er - fw / 2;
    const Y = hy + (ty - hy) * er;
    const Z = hz * (1 - er);
    const angle = 90 * (1 - dr) * (1 - er);
    const S2 = S0 + (1 / k - S0) * er;
    const wob = S.droop.v * 0.5 * (1 - r);
    form.dataset.state = d < 0.3 ? "hidden" : "shown";
    if (r >= 0.999 && Math.abs(S.rise.v) < 0.001) {
      // At rest: a plain 2D placement so the text and inputs are crisp.
      form.style.transform = `translate(${Math.round(vw / 2 - fw / 2)}px, ${Math.round(vh / 2 - fh / 2)}px)`;
      form.dataset.settled = "true";
    } else {
      // The plate's own perspective, written out so the paper shares it.
      form.style.transform =
        `${plateT} translate(${PW / 2}px, ${PH / 2}px) perspective(${P}px) translate(${-PW / 2}px, ${-PH / 2}px)` +
        ` translate3d(${X}px, ${Y}px, ${Z}px) translateX(${fw / 2}px)` +
        ` rotateX(${angle}deg) rotateZ(${wob.toFixed(2)}deg) scale(${S2}) translateX(${-fw / 2}px)`;
      form.dataset.settled = "false";
    }
    // Inputs are only reachable once the form is up.
    form.inert = r < 0.9;
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    targets(progress());
    const moving = step(dt);
    render();
    if (moving) raf = requestAnimationFrame(tick);
  }
  function wake() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  form.addEventListener("focusin", () => {
    locked = true;
  });
  form.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!form.contains(document.activeElement)) {
        locked = false;
        wake();
      }
    }, 300);
  });

  // Netlify Forms: post the fields to the site root, URL-encoded.
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    status.textContent = "Sending…";
    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(form)).toString(),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      status.textContent = "Sent.";
      submit.disabled = false;
    } catch {
      status.textContent = "Couldn't send. Email mohamed@proxymedia.org";
      submit.disabled = false;
    }
  });

  addEventListener("scroll", wake, { passive: true });
  addEventListener("resize", layout, { passive: true });
  document.fonts.ready.then(layout);
  layout();
})();

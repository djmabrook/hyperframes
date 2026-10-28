/* The mailbox: scrolling swings the middle door open and a paper contact form
   flops out of the box and lifts up to be filled in. Scrolling back reverses
   it. Springs give the door and the paper their weight. */
(() => {
  const section = document.getElementById("mailbox");
  if (!section) return;
  const rig = section.querySelector(".mb-rig");
  const door = section.querySelector(".mb-door-open");
  const form = section.querySelector(".mb-form");
  const status = form.querySelector(".mb-status");
  const submit = form.querySelector("button[type=submit]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // Rig units: the box is 980 x 600, the open cubby 178 x 490 at (401, 62).
  const BOX_W = 980,
    BOX_H = 600;
  const CUBBY = { x: 401, y: 62, w: 178, h: 490 };

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
    const portrait = vw < vh;
    // The box fills most of the width, leaving the plaster around it.
    scale = Math.min((vw * (portrait ? 0.94 : 0.62)) / BOX_W, (vh * 0.62) / BOX_H);
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
    // Camera: in from a three-quarter view, squaring up as the paper rises
    // while the box falls back behind it.
    const theta = 22 - 10 * a - 12 * r;
    const s = scale * (0.86 + 0.14 * a);
    const back = 280 * er;
    const cx = vw / 2 - vw * 0.025 * (1 - r);
    const cy = vh * 0.5 + vh * 0.04 * (1 - a);
    const rigT =
      `translate(${cx}px, ${cy}px) translateZ(${-back}px) scale(${s})` +
      ` rotateY(${theta}deg) translate(${-BOX_W / 2}px, ${-BOX_H / 2}px)`;
    rig.style.transform = rigT;
    door.style.setProperty("--door", `${(d * 114).toFixed(2)}deg`);
    door.style.setProperty("--door-light", (Math.sin(Math.min(1, d) * Math.PI * 0.6) * 0.35).toFixed(3));
    section.style.setProperty("--dim", (0.6 * er).toFixed(3));
    // Once the paper is clear of the box, draw it over the box rather than
    // depth-sorting it with the box's faces (which some GPUs tile badly).
    section.classList.toggle("paper-out", r > 0.3);

    // The paper, in rig units, pivoting on its top edge. It lies face up in
    // the cubby, slides out over the lip, tips down to hang face out with a
    // bounce, then lifts to the middle of the screen at its real size.
    const k = Math.min((CUBBY.w * 0.75) / fw, 150 / fh);
    const lip = CUBBY.y + CUBBY.h;
    const hx = CUBBY.x + CUBBY.w / 2,
      hy = lip - 2,
      hz = -176 + 162 * sl;
    const fx = BOX_W / 2,
      fy = BOX_H / 2 - fh / (2 * s);
    const X = hx + (fx - hx) * er - fw / 2;
    const Y = hy + (fy - hy) * er;
    const Z = hz + (back - hz) * er;
    const angle = 90 * (1 - dr) * (1 - er);
    const S2 = k + (1 / s - k) * er;
    const wob = S.droop.v * 0.5 * (1 - r);
    form.dataset.state = d < 0.2 && sl < 0.01 ? "hidden" : "shown";
    if (r >= 0.999 && Math.abs(S.rise.v) < 0.001) {
      // At rest: a plain 2D placement so the text and inputs are crisp.
      form.style.transform = `translate(${Math.round(vw / 2 - fw / 2)}px, ${Math.round(vh / 2 - fh / 2)}px)`;
      form.dataset.settled = "true";
    } else {
      form.style.transform =
        `${rigT} translate3d(${X}px, ${Y}px, ${Z}px) translateX(${fw / 2}px)` +
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

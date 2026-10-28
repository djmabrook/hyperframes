/* The mailbox: scrolling pushes in on the photographed mailbox and swings
   its middle door open; then the contact form comes up in front of it.
   Scrolling back reverses it. A spring gives the door its weight. */
(() => {
  const section = document.getElementById("mailbox");
  if (!section) return;
  const plate = section.querySelector(".mb-plate");
  const door = section.querySelector(".mb-door");
  const form = section.querySelector(".mb-form");
  const status = form.querySelector(".mb-status");
  const submit = form.querySelector("button[type=submit]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // Plate units (the 3840 x 2160 photograph) and the middle door's opening.
  const PW = 3840,
    PH = 2160;
  const OPEN = { x: 1704, y: 523, w: 425, h: 1139 };
  const BOX_W = 1880;

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (v) => v * v * (3 - 2 * v);
  const span = (p, a, b) => ease(clamp((p - a) / (b - a)));

  let vw = 0,
    vh = 0,
    scale = 1,
    raf = 0,
    last = 0,
    locked = false;

  const spring = (stiff, damp) => ({ x: 0, v: 0, target: 0, stiff, damp });
  const S = { approach: spring(90, 19), door: spring(120, 9) };

  function layout() {
    vw = innerWidth;
    vh = innerHeight;
    // Fill the screen like the other frames, but keep the mailbox in frame:
    // all of it on wide screens, the middle three doors on a portrait phone.
    const keep = vw < vh ? 1350 : BOX_W;
    // Then half that: the mailbox sits small on a big wall.
    scale = 0.5 * Math.min(Math.max(vw / PW, vh / PH), (vw * 0.96) / keep);
    wake();
  }

  function progress() {
    const rect = section.getBoundingClientRect();
    return clamp(-rect.top / Math.max(1, rect.height - vh));
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

  function render(p) {
    const a = S.approach.x;
    // Camera: a slow push in toward the middle door.
    const k = scale * (1 + 0.07 * a);
    const fx = OPEN.x + OPEN.w / 2,
      fy = PH / 2 + (OPEN.y + OPEN.h / 2 - PH / 2) * a * 0.5;
    plate.style.transform = `translate(${vw / 2 - fx * k}px, ${vh / 2 - fy * k}px) scale(${k})`;
    door.style.setProperty("--door", (S.door.x * 118).toFixed(2));
    // Once the door is open the form comes up, and the wall falls into shade.
    const open = locked || p > 0.5;
    section.dataset.form = open ? "open" : "closed";
    form.inert = !open;
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // While someone is filling the form in, hold everything open whatever the
    // page does (a phone keyboard scrolls the page when it opens).
    const p = locked ? 1 : progress();
    S.approach.target = span(p, 0, 0.2);
    S.door.target = span(p, 0.12, 0.42);
    const moving = step(dt);
    render(p);
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
  layout();
})();

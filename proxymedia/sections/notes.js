/* The project list, scrawled in Sharpie straight onto the plaster: written on
   as it comes into view, and a wall the visitor can write on too, a different
   Sharpie for every stroke. */
(() => {
  const section = document.getElementById("notes");
  if (!section) return;
  const view = section.querySelector(".scene-view");
  const writing = section.querySelector(".nt-writing");
  const ink = section.querySelector(".nt-ink");
  const sharpie = section.querySelector(".nt-sharpie");
  const roller = section.querySelector(".nt-roller");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)");

  const BLACK = "#16161a";
  const INKS = ["#16161a", "#1d3f9e", "#b3242a", "#1b6e3c", "#5b2f8c", "#c4561a"];
  const HEAD = '"Sedgwick Ave Display"';
  const HAND = '"Caveat Brush"';
  // Placement as fractions of the wall in view. Lopsided on purpose.
  const WIDE = [
    { text: "In Development", x: 0.07, y: 0.22, rot: -0.06, size: 1, font: HEAD, color: BLACK, under: 1 },
    { text: "AI Psychosis Doc", x: 0.1, y: 0.35, rot: -0.025, size: 0.78, font: HAND, color: "#b3242a" },
    { text: "Bodega Guy Short", x: 0.125, y: 0.47, rot: -0.07, size: 0.76, font: HAND, color: "#1d3f9e" },
    { text: "In Production", x: 0.53, y: 0.17, rot: 0.045, size: 0.94, font: HEAD, color: BLACK, under: 1 },
    { text: "Nick County music vid", x: 0.555, y: 0.3, rot: 0.02, size: 0.76, font: HAND, color: "#1b6e3c" },
    { text: "Out Now", x: 0.6, y: 0.67, rot: -0.09, size: 1.08, font: HEAD, color: BLACK, under: 2 },
  ];
  const TALL = [
    { text: "In Development", x: 0.06, y: 0.17, rot: -0.05, size: 1, font: HEAD, color: BLACK, under: 1 },
    { text: "AI Psychosis Doc", x: 0.1, y: 0.25, rot: -0.02, size: 0.82, font: HAND, color: "#b3242a" },
    { text: "Bodega Guy Short", x: 0.13, y: 0.32, rot: -0.06, size: 0.8, font: HAND, color: "#1d3f9e" },
    { text: "In Production", x: 0.17, y: 0.47, rot: 0.05, size: 0.96, font: HEAD, color: BLACK, under: 1 },
    { text: "Nick County music vid", x: 0.2, y: 0.55, rot: 0.025, size: 0.8, font: HAND, color: "#1b6e3c" },
    { text: "Out Now", x: 0.09, y: 0.74, rot: -0.08, size: 1.08, font: HEAD, color: BLACK, under: 2 },
  ];

  // Seeded so the scrawl is the same on every visit and resize.
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let W = 0,
    H = 0,
    dpr = 1,
    ops = [],
    writeStart = 0,
    started = false,
    raf = 0,
    pores;
  const strokes = [];

  // Plaster pores: the felt tip skips the pits, leaving pinholes in the ink.
  function makePores() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const r = rng(11);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.6})`;
      const s = 0.6 + r() * 1.6;
      g.fillRect(r() * 256, r() * 256, s, s);
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.25})`;
      g.fillRect(r() * 256, r() * 256, 4 + r() * 18, 0.7);
    }
    return c;
  }

  function layout() {
    const rect = view.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [writing, ink]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    plan(W < H * 0.9);
    paintWriting(started ? (reduced.matches ? Infinity : performance.now() - writeStart) : 0);
    repaintInk();
  }

  function plan(tall) {
    const r = rng(2026);
    const ctx = writing.getContext("2d");
    const unit = tall ? W * 0.115 : Math.min(W * 0.058, H * 0.1);
    ops = [];
    let t = 200;
    for (const b of tall ? TALL : WIDE) {
      let size = unit * b.size;
      ctx.font = `${size}px ${b.font}`;
      // Squeeze rather than wrap when the wall runs out, the way people do.
      const room = W * 0.95 - b.x * W;
      const natural = ctx.measureText(b.text).width;
      if (natural > room) size *= room / natural;
      ctx.font = `${size}px ${b.font}`;
      const cos = Math.cos(b.rot),
        sin = Math.sin(b.rot);
      let along = 0;
      const x0 = b.x * W,
        y0 = b.y * H;
      // A blot where the tip first lands.
      ops.push({ type: "blot", x: x0 - size * 0.02, y: y0 - size * 0.35, r: size * 0.045, color: b.color, t0: t });
      for (const ch of b.text) {
        const cw = ctx.measureText(ch).width;
        if (ch !== " ") {
          // The line sags and recovers as the hand moves.
          const sag = Math.sin(along / (size * 3.1) + b.x * 9) * size * 0.05;
          const op = {
            type: "glyph",
            ch,
            font: b.font,
            x: x0 + along * cos - sag * sin,
            y: y0 + along * sin + sag * cos + (r() - 0.5) * size * 0.07,
            size: size * (0.93 + r() * 0.14),
            rot: b.rot + (r() - 0.5) * 0.1,
            color: b.color,
            t0: t,
          };
          tile(op);
          ops.push(op);
          t += 34 + r() * 30;
        } else t += 90;
        along += cw * (0.97 + r() * 0.08);
      }
      // Sloppy underlines that overshoot the word.
      for (let u = 0; u < (b.under || 0); u++) {
        const off = size * (0.2 + u * 0.2);
        const pts = [];
        const len = along * (1.02 + r() * 0.1);
        const start = -size * 0.15 + r() * size * 0.2;
        const curve = (r() - 0.5) * size * 0.25;
        for (let i = 0; i <= 28; i++) {
          const k = i / 28;
          const a = start + len * k;
          const d = off + curve * Math.sin(k * Math.PI) + (r() - 0.5) * size * 0.015 + u * k * size * 0.08;
          pts.push([x0 + a * cos - d * sin, y0 + a * sin + d * cos]);
        }
        ops.push({ type: "line", pts, color: b.color, width: Math.max(2, size * 0.07), t0: t + 60, t1: t + 300 });
        t += 360;
      }
      t += 260;
    }
    ops.total = t + 200;
  }

  // Each glyph is inked once: a feathered bleed into the plaster, the solid
  // stroke, then pinholes where the tip skipped.
  function tile(op) {
    const s = op.size;
    const pad = Math.ceil(s * 0.5);
    const c = document.createElement("canvas");
    c.width = Math.ceil((s * 1.6 + pad * 2) * dpr);
    c.height = Math.ceil((s * 1.6 + pad * 2) * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.font = `${s}px ${op.font}`;
    g.fillStyle = op.color;
    g.strokeStyle = op.color;
    g.filter = `blur(${Math.max(0.8, s * 0.025)}px)`;
    g.globalAlpha = 0.45;
    g.lineWidth = s * 0.03;
    g.strokeText(op.ch, pad, pad + s);
    g.filter = "none";
    g.globalAlpha = 0.93;
    g.fillText(op.ch, pad, pad + s);
    g.globalCompositeOperation = "destination-out";
    g.globalAlpha = 0.55;
    g.fillStyle = g.createPattern(pores, "repeat");
    g.fillRect(0, 0, c.width, c.height);
    op.tile = c;
    op.pad = pad;
  }

  function drawGlyph(g, op) {
    g.save();
    g.translate(op.x, op.y);
    g.rotate(op.rot);
    g.drawImage(op.tile, -op.pad, -op.pad - op.size, op.tile.width / dpr, op.tile.height / dpr);
    g.restore();
  }

  function drawLine(g, pts, color, width, upto = 1) {
    const n = Math.max(2, Math.ceil(pts.length * upto));
    g.save();
    g.strokeStyle = color;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.globalAlpha = 0.4;
    g.lineWidth = width * 1.35;
    g.filter = `blur(${Math.max(0.8, width * 0.25)}px)`;
    const path = () => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    };
    path();
    g.filter = "none";
    g.globalAlpha = 0.9;
    g.lineWidth = width;
    path();
    g.restore();
  }

  function drawBlot(g, op) {
    g.save();
    g.fillStyle = op.color;
    g.globalAlpha = 0.55;
    g.filter = `blur(${Math.max(0.6, op.r * 0.5)}px)`;
    g.beginPath();
    g.arc(op.x, op.y, op.r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function paintWriting(elapsed) {
    const g = writing.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const op of ops) {
      if (op.t0 > elapsed) break;
      if (op.type === "glyph") drawGlyph(g, op);
      else if (op.type === "blot") drawBlot(g, op);
    }
    // Underlines are timed after their words; draw them in their own pass.
    for (const op of ops)
      if (op.type === "line" && op.t0 <= elapsed)
        drawLine(g, op.pts, op.color, op.width, Math.min(1, (elapsed - op.t0) / (op.t1 - op.t0)));
  }

  function tick(now) {
    raf = 0;
    const elapsed = now - writeStart;
    paintWriting(elapsed);
    if (elapsed < ops.total) raf = requestAnimationFrame(tick);
  }

  function startWriting() {
    if (started) return;
    started = true;
    if (reduced.matches) return paintWriting(Infinity);
    writeStart = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // ---- Visitor writing ----
  let color = null,
    current = null;
  const pick = () => {
    let c;
    do c = INKS[Math.floor(Math.random() * INKS.length)];
    while (c === color);
    return c;
  };
  const point = (e) => {
    const rect = ink.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  };
  const tipWidth = () => Math.max(3, Math.min(W, H) * 0.007);
  function segment(g, s, from) {
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = s.color;
    g.lineCap = "round";
    g.lineJoin = "round";
    const p0 = s.pts[Math.max(0, from - 1)];
    const path = () => {
      g.beginPath();
      g.moveTo(p0[0] * W, p0[1] * H);
      for (let i = from; i < s.pts.length; i++) g.lineTo(s.pts[i][0] * W, s.pts[i][1] * H);
      if (s.pts.length === 1) g.lineTo(p0[0] * W + 0.1, p0[1] * H);
      g.stroke();
    };
    // Bleed first, then the stroke.
    g.globalAlpha = 0.18;
    g.lineWidth = tipWidth() * 1.7;
    path();
    g.globalAlpha = 0.9;
    g.lineWidth = tipWidth();
    path();
    g.restore();
  }
  function repaintInk() {
    const g = ink.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ink.width, ink.height);
    for (const s of strokes) segment(g, s, 1);
  }
  // On touch screens the wall scrolls until the Sharpie is uncapped.
  function setDrawing(on) {
    section.dataset.drawing = on ? "true" : "false";
    sharpie.setAttribute("aria-pressed", on ? "true" : "false");
  }
  setDrawing(false);
  sharpie.addEventListener("click", () => setDrawing(section.dataset.drawing !== "true"));
  ink.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" && section.dataset.drawing !== "true") return;
    e.preventDefault();
    ink.setPointerCapture(e.pointerId);
    color = pick();
    current = { color, pts: [point(e)] };
    strokes.push(current);
    segment(ink.getContext("2d"), current, 0);
  });
  ink.addEventListener("pointermove", (e) => {
    if (!current) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const from = current.pts.length;
    for (const ev of events) current.pts.push(point(ev));
    segment(ink.getContext("2d"), current, from);
  });
  const end = () => (current = null);
  ink.addEventListener("pointerup", end);
  ink.addEventListener("pointercancel", end);
  // The roller paints over the visitor's writing with a fresh coat.
  roller.addEventListener("click", () => {
    strokes.length = 0;
    if (reduced.matches) return repaintInk();
    const g = ink.getContext("2d");
    const t0 = performance.now();
    const coat = (now) => {
      const k = Math.min(1, (now - t0) / 650);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, ink.width, ink.height * k);
      g.restore();
      if (k < 1) requestAnimationFrame(coat);
    };
    requestAnimationFrame(coat);
  });

  function onScroll() {
    const rect = section.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, rect.top / innerHeight));
    section.style.setProperty("--settle", (k * k).toFixed(4));
    if (rect.top < innerHeight * 0.45 && rect.bottom > innerHeight * 0.5) startWriting();
    if (rect.bottom < innerHeight * 0.2 || rect.top > innerHeight) setDrawing(false);
  }

  Promise.all([document.fonts.load(`40px ${HEAD}`), document.fonts.load(`40px ${HAND}`)]).then(() => {
    pores = makePores();
    layout();
    onScroll();
  });
  addEventListener("scroll", onScroll, { passive: true });
  let resizeTimer = 0,
    lastW = innerWidth;
  addEventListener("resize", () => {
    // Phones resize as the toolbar hides; only re-plan for a real width change.
    if (innerWidth === lastW && started) return;
    lastW = innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => pores && layout(), 120);
  });
})();

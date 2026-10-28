/* The whiteboard: three columns written in marker as it comes into view, and
   a surface the visitor can draw on, a different marker for every stroke. */
(() => {
  const section = document.getElementById("whiteboard");
  if (!section) return;
  const board = section.querySelector(".wb-board");
  const surface = section.querySelector(".wb-surface");
  const writing = section.querySelector(".wb-writing");
  const ink = section.querySelector(".wb-ink");
  const tray = section.querySelector(".wb-tray");
  const eraser = section.querySelector(".wb-eraser");
  const markers = [...section.querySelectorAll(".wb-marker")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  // Expo-style marker inks.
  const INKS = ["#1f4fb5", "#c62a2a", "#1d8a4a", "#222226", "#6b3fa0", "#d0641c", "#7a4a2a"];
  const COLUMNS = [
    { head: "In Development", items: ["AI Psychosis Doc", "Bodega Guy Short"] },
    { head: "In Production", items: ["Nick County music vid"] },
    { head: "Out Now", items: [] },
  ];
  const HEAD_INK = "#222226";
  const ITEM_INKS = ["#1f4fb5", "#c62a2a", "#1d8a4a"];

  // Seeded so the handwriting looks the same on every visit and resize.
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
    raf = 0;
  const strokes = [];
  let streaks;

  // Dry-marker streaks: knocked out of every glyph so the ink isn't flat.
  function makeStreaks() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.35})`;
      const y = r() * 256;
      g.fillRect(r() * 256, y, 6 + r() * 40, 0.6 + r() * 1.2);
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.5})`;
      g.fillRect(r() * 256, r() * 256, 1, 1);
    }
    return c;
  }

  function layout() {
    const vw = innerWidth,
      vh = innerHeight;
    const portrait = vw < vh * 0.9;
    let bw, bh;
    if (portrait) {
      bw = vw - 24;
      bh = Math.min(vh * 0.66, bw * 1.5);
    } else {
      bw = Math.min(vw * 0.86, vh * 0.74 * 1.62);
      bh = bw / 1.62;
    }
    const frame = Math.max(8, Math.round(bw * 0.014));
    section.style.setProperty("--board-w", `${bw}px`);
    section.style.setProperty("--board-h", `${bh}px`);
    section.style.setProperty("--frame", `${frame}px`);
    W = bw - frame * 2;
    H = bh - frame * 2;
    dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [surface, writing, ink]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    paintSurface();
    plan(portrait);
    paintWriting(started ? (reduced.matches ? Infinity : performance.now() - writeStart) : 0);
    repaintInk();
  }

  // The bare board: cool white melamine, a soft window reflection, and the
  // ghosts of things written and wiped before.
  function paintSurface() {
    const g = surface.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#f7f8f6");
    base.addColorStop(0.55, "#eef0ee");
    base.addColorStop(1, "#e2e4e1");
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    const r = rng(42);
    // Ghosts of old writing, wiped but never quite gone: blurred fragments
    // of random letters, too faint to read, plus the eraser's smears.
    g.filter = `blur(${Math.max(1.6, W / 420)}px)`;
    const letters = "abcdefghijklmnoprstuvwyz";
    for (let i = 0; i < 18; i++) {
      const size = H * (0.04 + r() * 0.05);
      g.font = `${size}px "Gochi Hand"`;
      g.fillStyle = r() < 0.35 ? "rgba(40,70,150,0.022)" : r() < 0.5 ? "rgba(160,40,40,0.018)" : "rgba(50,50,50,0.022)";
      let word = "";
      for (let n = 3 + Math.floor(r() * 9); n > 0; n--) word += r() < 0.15 ? " " : letters[Math.floor(r() * letters.length)];
      g.save();
      g.translate(r() * W * 0.9, H * 0.08 + r() * H * 0.86);
      g.rotate((r() - 0.5) * 0.08);
      g.fillText(word, 0, 0);
      g.restore();
    }
    for (let i = 0; i < 7; i++) {
      g.fillStyle = "rgba(110,110,110,0.018)";
      g.beginPath();
      g.ellipse(r() * W, r() * H, W * (0.05 + r() * 0.07), H * (0.02 + r() * 0.02), (r() - 0.5) * 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = "none";
    // A broad, soft window reflection across the gloss.
    const sheen = g.createLinearGradient(W * 0.15, 0, W * 0.55, H);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.45, "rgba(255,255,255,0.55)");
    sheen.addColorStop(0.55, "rgba(255,255,255,0.55)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);
    // Room light falls off toward the lower right; dust settles at the tray.
    const fall = g.createRadialGradient(W * 0.25, H * 0.1, 0, W * 0.25, H * 0.1, W * 1.1);
    fall.addColorStop(0, "rgba(255,250,240,0)");
    fall.addColorStop(1, "rgba(90,85,80,0.16)");
    g.fillStyle = fall;
    g.fillRect(0, 0, W, H);
    const dust = g.createLinearGradient(0, H * 0.9, 0, H);
    dust.addColorStop(0, "rgba(120,115,105,0)");
    dust.addColorStop(1, "rgba(120,115,105,0.12)");
    g.fillStyle = dust;
    g.fillRect(0, 0, W, H);
  }

  // Lay out the writing as a list of timed strokes and glyphs. Wide screens
  // get three columns; a portrait phone gets the same three lists as bands.
  function plan(portrait) {
    const r = rng(1979);
    ops = [];
    let t = 250;
    const ctx = writing.getContext("2d");
    const pad = W * 0.045;
    const cellW = portrait ? W - pad * 2 : (W - pad * 2) / 3;
    const cellH = portrait ? (H - pad) / 3 : H;
    // Headers as big as the narrowest cell allows.
    ctx.font = '100px "Gochi Hand"';
    const widest = Math.max(...COLUMNS.map((c) => ctx.measureText(c.head).width));
    const head = Math.min((cellW * 0.82 * 100) / widest, portrait ? cellH * 0.2 : H * 0.085);
    const item = head * 0.84;
    const wobble = (x0, y0, x1, y1, amp) => {
      const pts = [];
      const n = 24;
      const ph = r() * 6;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const off = Math.sin(k * 3.1 + ph) * amp + (r() - 0.5) * amp * 0.25;
        const nx = -(y1 - y0),
          ny = x1 - x0,
          l = Math.hypot(nx, ny);
        pts.push([x0 + (x1 - x0) * k + (nx / l) * off, y0 + (y1 - y0) * k + (ny / l) * off]);
      }
      return pts;
    };
    const line = (pts, color, width, dur) => {
      ops.push({ type: "line", pts, color, width, t0: t, t1: t + dur });
      t += dur + 60;
    };
    const rule = Math.max(2, W * (portrait ? 0.006 : 0.0035));
    // Dividers, quick and a little crooked.
    for (let c = 1; c < 3; c++) {
      if (portrait) {
        const y = pad * 0.5 + cellH * c + (r() - 0.5) * H * 0.006;
        line(wobble(W * 0.04, y, W * 0.96, y + (r() - 0.5) * H * 0.01, H * 0.002), HEAD_INK, rule, 300);
      } else {
        const x = pad + cellW * c + (r() - 0.5) * W * 0.006;
        line(wobble(x, H * 0.05, x + (r() - 0.5) * W * 0.01, H * 0.93, W * 0.002), HEAD_INK, rule, 340);
      }
    }
    // Words wrap within the cell, glyph by glyph with a hand's wander.
    const words = (text, x, y, size, color, maxW) => {
      ctx.font = `${size}px "Gochi Hand"`;
      let cx = x,
        cy = y;
      const slant = (r() - 0.5) * 0.05;
      const space = ctx.measureText(" ").width;
      for (const word of text.split(" ")) {
        const ww = ctx.measureText(word).width;
        if (cx > x && cx + ww > x + maxW) {
          cx = x + size * 0.15;
          cy += size * 1.08;
        }
        for (const ch of word) {
          const cw = ctx.measureText(ch).width;
          const op = {
            type: "glyph",
            ch,
            x: cx,
            y: cy + (cx - x) * slant + (r() - 0.5) * size * 0.06,
            size: size * (0.95 + r() * 0.1),
            rot: (r() - 0.5) * 0.09,
            color,
            t0: t,
          };
          tile(op);
          ops.push(op);
          t += 26 + r() * 24;
          cx += cw * (0.98 + r() * 0.06);
        }
        cx += space * (0.9 + r() * 0.4);
        t += 50;
      }
      return { right: cx, bottom: cy };
    };
    COLUMNS.forEach((col, c) => {
      const x = portrait ? pad : pad + cellW * c + cellW * 0.07;
      const y0 = portrait ? pad * 0.5 + cellH * c + cellH * 0.08 : H * 0.07;
      const maxW = portrait ? cellW * 0.95 : cellW * 0.86;
      const end = words(col.head, x, y0 + head, head, HEAD_INK, maxW);
      const uy = end.bottom + head * 0.28;
      line(
        wobble(x - head * 0.1, uy, end.right + head * 0.05, uy + (r() - 0.5) * head * 0.2, head * 0.05),
        HEAD_INK,
        rule * 0.9,
        260,
      );
      let y = uy + item * 1.5;
      col.items.forEach((text, i) => {
        const color = ITEM_INKS[(c * 2 + i) % ITEM_INKS.length];
        // A dash, then the title.
        line(wobble(x, y - item * 0.32, x + item * 0.38, y - item * 0.3, 0.6), color, rule * 0.9, 110);
        const e = words(text, x + item * 0.6, y, item, color, maxW - item * 0.6);
        y = e.bottom + item * (portrait ? 1.25 : 1.45);
        t += 160;
      });
      t += 200;
    });
    ops.total = t;
  }

  // Each glyph is inked once into its own tile: the marker's dry streaks are
  // knocked out of it and its edges pool slightly darker.
  function tile(op) {
    const s = op.size;
    const pad = Math.ceil(s * 0.5);
    const c = document.createElement("canvas");
    c.width = Math.ceil((s * 1.4 + pad * 2) * dpr);
    c.height = Math.ceil((s * 1.6 + pad * 2) * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.font = `${s}px "Gochi Hand"`;
    g.fillStyle = op.color;
    g.globalAlpha = 0.94;
    g.fillText(op.ch, pad, pad + s);
    g.globalAlpha = 0.35;
    g.lineWidth = Math.max(0.6, s * 0.012);
    g.strokeStyle = op.color;
    g.strokeText(op.ch, pad, pad + s);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = g.createPattern(streaks, "repeat");
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
    g.lineWidth = width;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.globalAlpha = 0.9;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
    g.restore();
  }

  // Paint everything written by `elapsed` ms.
  function paintWriting(elapsed) {
    const g = writing.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const op of ops) {
      if (op.t0 > elapsed) break;
      if (op.type === "glyph") drawGlyph(g, op);
      else drawLine(g, op.pts, op.color, op.width, Math.min(1, (elapsed - op.t0) / (op.t1 - op.t0)));
    }
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
    if (reduced.matches) {
      paintWriting(Infinity);
      return;
    }
    writeStart = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // ---- Visitor drawing ----
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
  function segment(g, s, from) {
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.strokeStyle = s.color;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = Math.max(2.5, W * 0.0055);
    g.globalAlpha = 0.92;
    g.beginPath();
    const p0 = s.pts[Math.max(0, from - 1)];
    g.moveTo(p0[0] * W, p0[1] * H);
    for (let i = from; i < s.pts.length; i++) g.lineTo(s.pts[i][0] * W, s.pts[i][1] * H);
    if (s.pts.length === 1) g.lineTo(p0[0] * W + 0.1, p0[1] * H);
    g.stroke();
    g.restore();
  }
  function repaintInk() {
    const g = ink.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ink.width, ink.height);
    for (const s of strokes) segment(g, s, 1);
  }
  const coarse = matchMedia("(pointer: coarse)");
  function setDrawing(on) {
    board.dataset.drawing = on ? "true" : "false";
    markers.forEach((m) => m.classList.remove("is-up"));
    if (on) markers[Math.floor(Math.random() * markers.length)].classList.add("is-up");
  }
  let tap = null;
  ink.addEventListener("pointerdown", (e) => {
    // On touch screens a finger on the board scrolls the page until a tap
    // picks up a marker; then the board takes the finger.
    if (e.pointerType === "touch" && board.dataset.drawing !== "true") {
      tap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      return;
    }
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
  const end = (e) => {
    if (tap && e.type === "pointerup" && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) setDrawing(true);
    tap = null;
    current = null;
  };
  ink.addEventListener("pointerup", end);
  ink.addEventListener("pointercancel", end);
  // Tapping off the board puts the marker down again.
  section.addEventListener("pointerdown", (e) => {
    if (coarse.matches && !board.contains(e.target)) setDrawing(false);
  });
  eraser.addEventListener("click", () => {
    strokes.length = 0;
    // A quick wipe across the board rather than a cut.
    const g = ink.getContext("2d");
    if (reduced.matches) return repaintInk();
    const t0 = performance.now();
    const wipe = (now) => {
      const k = Math.min(1, (now - t0) / 420);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, ink.width * k, ink.height);
      g.restore();
      if (k < 1) requestAnimationFrame(wipe);
    };
    requestAnimationFrame(wipe);
  });

  // The camera settles onto the board as it arrives.
  function onScroll() {
    const rect = section.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, rect.top / innerHeight));
    section.style.setProperty("--settle", (k * k).toFixed(4));
    if (rect.top < innerHeight * 0.45 && rect.bottom > innerHeight * 0.5) startWriting();
    if (rect.bottom < 0 || rect.top > innerHeight) setDrawing(false);
  }

  document.fonts.load('40px "Gochi Hand"').then(() => {
    streaks = makeStreaks();
    layout();
    onScroll();
  });
  addEventListener("scroll", onScroll, { passive: true });
  let resizeTimer = 0;
  let lastW = innerWidth;
  addEventListener("resize", () => {
    // Phones resize as the toolbar hides; only re-plan for a real width change.
    if (innerWidth === lastW && started) return;
    lastW = innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => streaks && layout(), 120);
  });
})();

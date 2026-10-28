/* CRT screen: plays a video through the photographed Trinitron glass.

   One WebGL quad, sized to the glass in the TV photograph and placed inside
   #tv-shot, so it moves with the photo through every camera move for free.
   The fragment shader does all of the tube: barrel curvature, raster edge,
   misconvergence, edge softness, bloom, scanlines, aperture grille, vignette,
   flicker, power-off collapse, and finally the photographed glass (room and
   window reflection) screen-blended on top. Outside the glass it is fully
   transparent, so the DOM photograph is what you see there.

   Self-contained: no Three.js, no build step, plain WebGL 1. See README.md
   next to this file for the approach and every tunable in PARAMS.

   API (window.__proxyCRT):
     powerOn()          play tv-on.mp4, then blue-screen.mp4, then the program
     powerOff()         collapse the raster to a line and a dot, then stop
     setProgram(src)    the video that follows the blue screen (null: keep blue)
     setViewScale(s)    CSS px per composition px × devicePixelRatio
     state              "off" | "on" | "collapsing"
*/
(() => {
  // Glass in #tv-shot space (the 1920×1080 TV photograph). Measured against
  // the 4K source; make_overlays.py uses the same numbers.
  const GLASS = { cx: 960, cy: 496, hw: 254, hh: 176, radius: 26, bow: 4 };
  // The program: Mohamed's video, played after the blue "by proxy" screen.
  // Until his file lands this stays null and the blue screen keeps looping.
  // To swap it in, drop the MP4 in assets/crt/ and set e.g. "assets/crt/program.mp4".
  const PROGRAM_SRC = null;
  const BLUE_HOLD = 3; // seconds of blue screen before the program starts
  const OFF_MS = 1000; // power-off: line, dot, then the dot's afterglow fades
  const MARGIN = 10; // canvas extends this far past the glass on each side
  // The glass-surface texture covers ±(780/1080·2·hh) × ±hh around the center.
  const SURFACE_HALF = [(780 / 540) * GLASS.hh, GLASS.hh];

  const PARAMS = {
    curvature: 0.12, //   barrel strength: how far the picture bows on the bulbous glass
    overscan: 0.935, //   raster scale; < 1 overfills the glass edges but leaves the corners rounded
    rasterEdge: 0.018, // softness of the raster edge (in raster units)
    convergence: 0.0016, // R/B misconvergence at the corners (uv units)
    edgeBlur: 2.2, //     extra blur toward the edges (video px)
    bloom: 0.32, //       halo strength around bright areas
    scanlines: 0.22, //   scanline darkness at full visibility
    grille: 0.08, //      Trinitron vertical RGB stripe strength
    vignette: 0.38, //    brightness falloff toward the tube edges
    flicker: 0.012, //    frame-to-frame brightness wobble
    noise: 0.018, //      tube noise added to the emitted light
    reflection: 1.0, //   amount of the photographed glass screened on top
    glassFloor: 0.12, //  grey removed from the glass where the tube is lit
    glow: 1.08, //        phosphor gain
  };

  const host = document.getElementById("tv-shot");
  const canvas = document.createElement("canvas");
  canvas.id = "crt-screen";
  const left = GLASS.cx - GLASS.hw - MARGIN;
  const top = GLASS.cy - GLASS.hh - MARGIN;
  const cw = 2 * (GLASS.hw + MARGIN);
  const ch = 2 * (GLASS.hh + MARGIN);
  Object.assign(canvas.style, {
    position: "absolute",
    left: `${left}px`,
    top: `${top}px`,
    width: `${cw}px`,
    height: `${ch}px`,
    pointerEvents: "none",
    visibility: "hidden",
  });
  host.appendChild(canvas);

  const api = {
    state: "off",
    ready: false,
    powerOn,
    powerOff,
    setViewScale,
    setProgram,
    params: PARAMS,
  };
  window.__proxyCRT = api;

  const gl = canvas.getContext("webgl", {
    premultipliedAlpha: true,
    alpha: true,
    antialias: false,
  });
  if (!gl) return; // The photograph stays as it is; nothing else depends on this.

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uVideo, uSurface;
    uniform vec2 uVideoSize;   // video pixels
    uniform vec2 uOrigin, uSize; // canvas rect in #tv-shot px
    uniform vec4 uGlass;       // cx, cy, hw, hh
    uniform vec2 uShape;       // corner radius, edge bow
    uniform vec2 uSurfaceHalf;
    uniform float uTime, uPower, uOff, uHasVideo, uTrack;
    uniform float uLines, uGrilleVis, uPxPerLocal;
    uniform float uCurv, uOverscan, uRasterEdge, uConv, uEdgeBlur, uBloom;
    uniform float uScan, uGrille, uVig, uFlicker, uNoise, uRefl, uFloor, uGain;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    // Rounded box whose straight edges bow outward by uShape.y at their middles,
    // matching the slightly pillowed outline of the photographed glass.
    float glassSdf(vec2 p) {
      vec2 h = uGlass.zw;
      float bx = h.x + uShape.y * (1.0 - pow(clamp(p.y / h.y, -1.0, 1.0), 2.0));
      float by = h.y + uShape.y * (1.0 - pow(clamp(p.x / h.x, -1.0, 1.0), 2.0));
      vec2 e = abs(p) - (vec2(bx, by) - uShape.x);
      return length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - uShape.x;
    }

    // Raster coordinate (-1..1, y down) -> video uv, center-cut to the glass aspect.
    vec2 videoUv(vec2 r) {
      float cut = (uGlass.z / uGlass.w) / (uVideoSize.x / uVideoSize.y);
      return vec2(0.5 + 0.5 * r.x * cut, 0.5 + 0.5 * r.y);
    }

    vec3 tap(vec2 uv) { return texture2D(uVideo, clamp(uv, 0.0, 1.0)).rgb; }

    void main() {
      // Local position in #tv-shot px, y down, relative to the glass center.
      vec2 local = uOrigin + vec2(vUv.x, 1.0 - vUv.y) * uSize;
      vec2 p = local - uGlass.xy;
      float sd = glassSdf(p);
      // ~1 local px feather where the glass meets the bezel recess.
      float mask = clamp(0.5 - sd / max(1.2, 1.5 / uPxPerLocal), 0.0, 1.0);
      if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

      // 1. Bulbous glass: barrel-map glass position to raster position.
      vec2 n = p / uGlass.zw;
      float r2 = dot(n, n) * 0.5;
      vec2 r = n * (1.0 + uCurv * r2) * uOverscan;

      // 2. Power-off: the raster squeezes to a line, then to a dot, and the
      //    dot's afterglow shrinks and fades on the phosphor.
      float sy = mix(1.0, 0.006, smoothstep(0.0, 0.27, uOff));
      float sx = mix(1.0, 0.01, smoothstep(0.25, 0.42, uOff));
      float dotFade = 1.0 - smoothstep(0.42, 1.0, uOff);
      sx *= mix(1.0, 0.4, 1.0 - dotFade);
      sy *= mix(1.0, 0.4, 1.0 - dotFade);
      vec2 rs = r / vec2(sx, sy);
      float frame = floor(uTime * 60.0);
      // Tape tracking noise while the deck switches from blue to the program:
      // lines tear sideways in bands.
      if (uTrack > 0.0) {
        float band = floor(rs.y * 22.0 + uTime * 9.0);
        rs.x += uTrack * (hash(vec2(band, frame)) - 0.5) * 0.09;
      }

      // Raster edge: soft, rounded where the curved raster misses the corners.
      vec2 edge = smoothstep(1.0, 1.0 - uRasterEdge, abs(rs));
      float raster = edge.x * edge.y;

      vec3 emit = vec3(0.0);
      if (raster > 0.0 && uHasVideo > 0.5) {
        vec2 uv = videoUv(rs);
        vec2 px = 1.0 / uVideoSize;
        // 3. Misconvergence grows toward the corners.
        vec2 conv = n * uConv * r2;
        // 4. Softer focus toward the edges of the tube.
        float blur = 0.6 + uEdgeBlur * r2 * r2;
        vec3 c = vec3(0.0);
        c.r = (tap(uv + conv - vec2(blur, 0.0) * px).r + tap(uv + conv).r * 2.0 + tap(uv + conv + vec2(blur, 0.0) * px).r) * 0.25;
        c.g = (tap(uv - vec2(blur, 0.0) * px).g + tap(uv).g * 2.0 + tap(uv + vec2(blur, 0.0) * px).g) * 0.25;
        c.b = (tap(uv - conv - vec2(blur, 0.0) * px).b + tap(uv - conv).b * 2.0 + tap(uv - conv + vec2(blur, 0.0) * px).b) * 0.25;
        // 5. Bloom: a ring of wide taps, kept to the bright end.
        vec3 halo = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7854;
          halo += tap(uv + vec2(cos(a), sin(a)) * vec2(14.0, 10.0) * px);
        }
        halo /= 8.0;
        c += uBloom * max(halo - 0.25, 0.0) * 1.4 + uBloom * 0.25 * halo;
        // 6. Scanlines in raster space (so they curve with the picture),
        //    faded out when the screen is too small to resolve them.
        float line = 0.5 + 0.5 * cos((rs.y * 0.5 + 0.5) * uLines * 6.28318);
        c *= 1.0 - uScan * line;
        // 7. Trinitron aperture grille: vertical RGB stripes on device pixels.
        float stripe = mod(floor(gl_FragCoord.x), 3.0);
        vec3 grille = vec3(stripe == 0.0, stripe == 1.0, stripe == 2.0);
        c *= mix(vec3(1.0), 0.65 + 0.7 * grille, uGrille * uGrilleVis);
        emit = c * uGain;
      }
      // Power-off collapse burns white-hot as the beam concentrates.
      emit = mix(emit, vec3(0.92, 0.95, 1.0) * 1.6, smoothstep(0.05, 0.3, uOff));
      emit *= raster * dotFade;
      // The concentrated beam blooms on the glass around the line and dot.
      float halo = exp(-dot(r / vec2(max(sx, 0.02), max(sy, 0.02)), r / vec2(max(sx, 0.02), max(sy, 0.02))) * 0.6);
      emit += vec3(0.78, 0.86, 1.0) * halo * smoothstep(0.1, 0.35, uOff) * dotFade * dotFade * 0.55;
      emit += uTrack * 0.35 * hash(vec2(floor(rs.y * 120.0), frame)) * step(0.82, hash(vec2(floor(rs.y * 22.0), frame + 3.0))) * raster;

      // 8. Vignette and the darker strip just inside the bezel.
      emit *= 1.0 - uVig * pow(min(r2 * 1.1, 1.0), 1.5);
      emit *= 1.0 - 0.45 * smoothstep(-16.0, -2.0, sd);
      // 9. Tube flicker and noise.
      emit *= 1.0 + uFlicker * (hash(vec2(frame, 1.7)) - 0.5) * 2.0;
      emit += uNoise * (hash(gl_FragCoord.xy + frame) - 0.5) * raster;
      emit = max(emit * uPower, 0.0);

      // 10. The photographed glass on top: what the room reflects stays visible
      //     over the picture, exactly as when the set is off.
      vec2 suv = p / uSurfaceHalf * 0.5 + 0.5;
      vec3 surface = texture2D(uSurface, suv).rgb;
      // A lit tube out-shines the glass's diffuse grey; keep the reflections.
      // At black the floor stays, so the set off equals the photograph exactly.
      float lit = clamp(dot(emit, vec3(0.2126, 0.7152, 0.0722)) * 3.0, 0.0, 1.0);
      surface = max(surface - uFloor * lit, 0.0) * uRefl;
      vec3 col = 1.0 - (1.0 - min(emit, 1.0)) * (1.0 - surface);

      gl_FragColor = vec4(col * mask, mask);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const U = {};
  for (let i = 0; i < gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(prog, i).name;
    U[name] = gl.getUniformLocation(prog, name);
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  function texture(unit) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }
  const videoTex = texture(0);
  const surfaceTex = texture(1);
  gl.uniform1i(U.uVideo, 0);
  gl.uniform1i(U.uSurface, 1);
  gl.uniform2f(U.uOrigin, left, top);
  gl.uniform2f(U.uSize, cw, ch);
  gl.uniform4f(U.uGlass, GLASS.cx, GLASS.cy, GLASS.hw, GLASS.hh);
  gl.uniform2f(U.uShape, GLASS.radius, GLASS.bow);
  gl.uniform2f(U.uSurfaceHalf, SURFACE_HALF[0], SURFACE_HALF[1]);

  const surface = new Image();
  surface.onload = () => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, surfaceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface);
    api.ready = true;
  };
  surface.src = "assets/crt/overlays/glass-surface.png";

  function video(src, loop) {
    const v = document.createElement("video");
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.loop = loop;
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    return v;
  }
  const tvOn = video("assets/crt/tv-on.mp4", false);
  const blue = video("assets/crt/blue-screen.mp4", true);
  let program = PROGRAM_SRC ? video(PROGRAM_SRC, true) : null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let current = null,
    offStart = 0,
    raf = 0,
    viewScale = 1,
    lastBacking = 0,
    blueSince = 0,
    trackUntil = 0;

  // The flash hands over to the loop on its last frames; both are the same blue.
  tvOn.addEventListener("timeupdate", () => {
    if (api.state === "on" && tvOn.duration && tvOn.currentTime > tvOn.duration - 0.2 && blue.paused)
      blue.play().catch(() => {});
  });
  tvOn.addEventListener("ended", () => {
    if (api.state === "on") showBlue();
  });
  function showBlue() {
    current = blue;
    blueSince = performance.now();
    if (blue.paused) blue.play().catch(() => {});
  }
  // After BLUE_HOLD seconds of blue the deck rolls the program, through a
  // moment of tracking noise. Without a program the blue screen keeps looping.
  function maybeStartProgram(now) {
    if (!program || current !== blue || now - blueSince < BLUE_HOLD * 1000) return;
    if (program.readyState < 2) return; // keep blue until its first frame is in
    program.currentTime = 0;
    program.play().catch(() => {});
    trackUntil = now + 450;
    current = program;
    blue.pause();
  }
  function setProgram(src) {
    if (program) {
      program.pause();
      if (current === program) {
        current = null;
        if (api.state !== "off") showBlue();
      }
      // Release the previous resource, including pending preload/network work.
      program.removeAttribute("src");
      program.load();
    }
    program = src ? video(src, true) : null;
  }

  function powerOn() {
    if (api.state === "on") return;
    api.state = "on";
    canvas.style.visibility = "visible";
    blue.pause();
    blue.currentTime = 0;
    program?.pause();
    if (reduced.matches) {
      showBlue();
    } else {
      current = tvOn;
      tvOn.currentTime = 0;
      tvOn.play().catch(() => {});
    }
    loop();
  }
  function powerOff() {
    if (api.state !== "on") return;
    api.state = "collapsing";
    offStart = performance.now();
    loop();
  }
  function setViewScale(s) {
    viewScale = s;
    if (api.state !== "off") loop();
  }
  function loop() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function draw(now) {
    raf = 0;
    if (api.state === "off") return;
    // Device pixels per #tv-shot pixel = world zoom × page scale × DPR.
    const zoom = (window.__proxyScene?.state?.scale || 1) * viewScale;
    const backing = Math.min(2560, Math.max(512, Math.round(cw * zoom)));
    if (Math.abs(backing - lastBacking) > 48) {
      canvas.width = backing;
      canvas.height = Math.round((backing * ch) / cw);
      lastBacking = backing;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    const pxPerLocal = canvas.width / cw;
    // Glass height on screen, in device px. ~3 px per scanline stays visible
    // without moiré; NTSC's 480 visible lines are the upper bound.
    const glassPx = 2 * GLASS.hh * pxPerLocal;
    gl.uniform1f(U.uLines, Math.max(160, Math.min(480, Math.floor(glassPx / 3.2))));
    gl.uniform1f(U.uGrilleVis, Math.min(1, Math.max(0, (pxPerLocal * 2 * GLASS.hw - 1200) / 800)));
    gl.uniform1f(U.uPxPerLocal, pxPerLocal);

    let off = 0;
    if (api.state === "collapsing") {
      off = Math.min(1, (now - offStart) / OFF_MS);
      if (off >= 1) {
        api.state = "off";
        tvOn.pause();
        blue.pause();
        program?.pause();
        current = null;
        canvas.style.visibility = "hidden";
        return;
      }
    }
    if (api.state === "on") maybeStartProgram(now);
    const v = current;
    const hasVideo = v && v.readyState >= 2;
    if (hasVideo) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.uniform2f(U.uVideoSize, v.videoWidth, v.videoHeight);
    }
    const P = PARAMS;
    gl.uniform1f(U.uHasVideo, hasVideo ? 1 : 0);
    gl.uniform1f(U.uTime, now / 1000);
    gl.uniform1f(U.uPower, 1);
    gl.uniform1f(U.uOff, off);
    gl.uniform1f(U.uTrack, Math.max(0, Math.min(1, (trackUntil - now) / 450)));
    gl.uniform1f(U.uCurv, P.curvature);
    gl.uniform1f(U.uOverscan, P.overscan);
    gl.uniform1f(U.uRasterEdge, P.rasterEdge);
    gl.uniform1f(U.uConv, P.convergence);
    gl.uniform1f(U.uEdgeBlur, P.edgeBlur);
    gl.uniform1f(U.uBloom, P.bloom);
    gl.uniform1f(U.uScan, P.scanlines);
    gl.uniform1f(U.uGrille, P.grille);
    gl.uniform1f(U.uVig, P.vignette);
    gl.uniform1f(U.uFlicker, P.flicker);
    gl.uniform1f(U.uNoise, P.noise);
    gl.uniform1f(U.uRefl, P.reflection);
    gl.uniform1f(U.uFloor, P.glassFloor);
    gl.uniform1f(U.uGain, P.glow);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    loop();
  }
})();

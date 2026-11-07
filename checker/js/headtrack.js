// headtrack.js — on-device webcam head tracking for a head-coupled
// ("window") perspective camera. Video never leaves the browser: frames go
// straight from a hidden <video> into MediaPipe's FaceDetector (WASM/WebGL).
//
// Usage:
//   const ht = new HeadTracker();
//   button.onclick = async () => { const ok = await ht.start(); };
//   // every animation frame:
//   ht.update(performance.now());
//   const { x, y, z } = ht.pose;   // x,y ~[-1,1], z ~[0.6,1.6] (1 = neutral)

const MP_BASE = new URL('../vendor/mediapipe/', import.meta.url);
const BUNDLE_URL = new URL('vision_bundle.mjs', MP_BASE).href;
const WASM_LOADER_URL = new URL('wasm/vision_wasm_internal.js', MP_BASE).href;
const WASM_BINARY_URL = new URL('wasm/vision_wasm_internal.wasm', MP_BASE).href;
const MODEL_URL = new URL('blaze_face_short_range.tflite', MP_BASE).href;

const DETECT_INTERVAL_MS = 1000 / 30; // at most ~30 Hz
const CALIBRATE_MS = 1000;            // initial neutral averaging window
const RECENTER_TAU_S = 20;            // long-term re-centring time constant
const ACTIVE_WINDOW_MS = 1500;        // "active" if a face was seen this recently
const LOST_GRACE_MS = 250;            // short dropouts don't start the ease-back
const PRESENCE_TAU_S = 0.28;          // ease back to neutral over ~1 s (≈3.5 tau)
const XY_RANGE = 0.22;                // normalised image offset that maps to ±1
const Z_MIN = 0.6, Z_MAX = 1.6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// One Euro filter (Casiez et al. 2012): heavy smoothing when still, low lag
// when moving fast.
class OneEuro {
  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset(v) {
    this.x = v === undefined ? null : v;
    this.dx = 0;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v, dt) {
    if (this.x === null || !(dt > 0)) { this.x = v; this.dx = 0; return v; }
    const rawDx = (v - this.x) / dt;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    this.dx += ad * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cutoff, dt);
    this.x += a * (v - this.x);
    return this.x;
  }
}

export class HeadTracker {
  constructor() {
    this._video = null;
    this._stream = null;
    this._detector = null;
    this._vision = null;       // module namespace
    this._fileset = null;
    this._delegate = 'GPU';
    this._enabled = false;
    this._starting = null;
    this._gen = 0;             // bumps on stop() to cancel an in-flight start()
    this._errors = 0;

    this._lastDetectAt = -Infinity;
    this._lastVideoTime = -1;
    this._lastTs = 0;
    this._lastSeenAt = -Infinity;
    this._lastUpdateAt = null;

    // Calibration (image-space, normalised 0..1; size as fraction of width).
    this._calStart = null;
    this._calN = 0;
    this._calSum = { cx: 0, cy: 0, ls: 0 };
    this._neutral = null;      // { cx, cy, ls }  (ls = log size)

    // Filters operate on the neutral-relative pose (x, y, log z).
    // x/y: move a lot, want responsiveness; z (log scale) is noisier.
    this._fx = new OneEuro(1.2, 1.5);
    this._fy = new OneEuro(1.2, 1.5);
    this._fz = new OneEuro(0.8, 1.0);
    this._filtered = { x: 0, y: 0, z: 1 };
    this._lastSampleAt = null;

    this._presence = 0;
    this._pose = { x: 0, y: 0, z: 1 };
  }

  get enabled() { return this._enabled; }

  get active() {
    return this._enabled && (this._now() - this._lastSeenAt) < ACTIVE_WINDOW_MS;
  }

  get pose() { return this._pose; }

  /** Forget the neutral position and re-calibrate from the next ~1 s. */
  recalibrate() {
    this._neutral = null;
    this._calStart = null;
    this._calN = 0;
    this._calSum = { cx: 0, cy: 0, ls: 0 };
  }

  start() {
    if (this._enabled) return Promise.resolve(true);
    if (this._starting) return this._starting;
    const gen = ++this._gen;
    this._starting = this._start(gen)
      .catch((err) => {
        try { console.info('[headtrack] unavailable:', err && (err.name || err.message) || err); } catch (_) {}
        if (gen === this._gen) this._teardown();
        return false;
      })
      .finally(() => { if (gen === this._gen) this._starting = null; });
    return this._starting;
  }

  async _start(gen) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia unsupported');
    }
    if (typeof WebAssembly !== 'object') throw new Error('no WebAssembly');

    // Kick off library + camera in parallel (getUserMedia first so the
    // permission prompt still counts as coming from the user gesture).
    const streamP = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    const visionP = import(BUNDLE_URL);
    // Avoid an unhandled rejection on visionP if the camera fails first.
    visionP.catch(() => {});

    const stream = await streamP;
    if (gen !== this._gen) { stopStream(stream); return false; }
    this._stream = stream;

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute('aria-hidden', 'true');
    // In the DOM (Safari is happier decoding that way) but invisible and inert.
    video.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;' +
      'pointer-events:none;z-index:-1;';
    video.srcObject = stream;
    (document.body || document.documentElement).appendChild(video);
    this._video = video;
    await video.play().catch(() => {});

    const vision = await visionP;
    if (gen !== this._gen) return false;
    this._vision = vision;
    // Pass the fileset directly: only the SIMD build is vendored. If the
    // browser lacks wasm SIMD this throws and we report false.
    this._fileset = { wasmLoaderPath: WASM_LOADER_URL, wasmBinaryPath: WASM_BINARY_URL };

    const detector = await this._createDetector();
    if (gen !== this._gen) { safeClose(detector); return false; }
    this._detector = detector;

    // Wait (briefly) for the first frame so dimensions are known.
    if (!(video.videoWidth > 0)) {
      await new Promise((resolve) => {
        const done = () => { clearTimeout(t); video.removeEventListener('loadeddata', done); resolve(); };
        const t = setTimeout(done, 3000);
        video.addEventListener('loadeddata', done);
      });
    }
    if (gen !== this._gen) return false;
    if (!(video.videoWidth > 0)) throw new Error('no video frames');

    this._errors = 0;
    this._enabled = true;
    return true;
  }

  async _createDetector() {
    const { FaceDetector } = this._vision;
    const make = (delegate) => FaceDetector.createFromOptions(this._fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
      minSuppressionThreshold: 0.3,
    });
    if (this._delegate === 'GPU') {
      try {
        return await make('GPU');
      } catch (_) {
        this._delegate = 'CPU';
      }
    }
    return make('CPU');
  }

  stop() {
    this._gen++;
    this._starting = null;
    this._teardown();
  }

  _teardown() {
    this._enabled = false;
    safeClose(this._detector);
    this._detector = null;
    stopStream(this._stream);
    this._stream = null;
    if (this._video) {
      try { this._video.pause(); } catch (_) {}
      try { this._video.srcObject = null; } catch (_) {}
      try { this._video.remove(); } catch (_) {}
      this._video = null;
    }
    this._lastSeenAt = -Infinity;
    this._lastVideoTime = -1;
    this._lastDetectAt = -Infinity;
    this._presence = 0;
    this._pose = { x: 0, y: 0, z: 1 };
    this._lastUpdateAt = null;
  }

  _now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  update(nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : this._now();
    const prev = this._lastUpdateAt;
    this._lastUpdateAt = now;
    const dt = prev === null ? 0 : clamp((now - prev) / 1000, 0, 0.25);

    if (this._enabled) this._maybeDetect(now);

    // Presence easing: 1 while the face is (recently) seen, eases to 0 when
    // lost so the pose glides back to neutral instead of freezing or jumping.
    const seen = this._enabled && (now - this._lastSeenAt) < LOST_GRACE_MS;
    const target = seen ? 1 : 0;
    if (dt > 0 && this._presence !== target) {
      const k = 1 - Math.exp(-dt / PRESENCE_TAU_S);
      this._presence += (target - this._presence) * k;
      if (Math.abs(this._presence - target) < 1e-3) this._presence = target;
    }

    const p = this._presence;
    const f = this._filtered;
    const x = f.x * p;
    const y = f.y * p;
    const z = 1 + (f.z - 1) * p;
    const pose = this._pose;
    if (pose.x !== x || pose.y !== y || pose.z !== z) {
      this._pose = { x, y, z };
    }
  }

  _maybeDetect(now) {
    const video = this._video;
    const detector = this._detector;
    if (!video || !detector) return;
    if (now - this._lastDetectAt < DETECT_INTERVAL_MS) return;
    if (video.readyState < 2 || !(video.videoWidth > 0)) return;
    const vt = video.currentTime;
    if (vt === this._lastVideoTime) return;
    this._lastVideoTime = vt;
    this._lastDetectAt = now;

    // detectForVideo needs strictly increasing timestamps.
    const ts = Math.max(now, this._lastTs + 1);
    this._lastTs = ts;

    let result;
    try {
      result = detector.detectForVideo(video, ts);
      this._errors = 0;
    } catch (_) {
      this._onDetectError();
      return;
    }
    const dets = result && result.detections;
    if (!dets || !dets.length) return;

    // Pick the largest face (closest viewer).
    let best = dets[0];
    let bestArea = 0;
    for (const d of dets) {
      const b = d.boundingBox;
      const a = b ? b.width * b.height : 0;
      if (a > bestArea) { bestArea = a; best = d; }
    }
    const b = best.boundingBox;
    if (!b || !(b.width > 0)) return;

    const vw = video.videoWidth, vh = video.videoHeight;
    let cx = (b.originX + b.width / 2) / vw;
    let cy = (b.originY + b.height / 2) / vh;
    let size = b.width / vw;

    // Blaze face keypoints: 0 = right eye, 1 = left eye (normalised coords).
    // The eye midpoint is what a head-coupled camera really wants and it is
    // steadier than the box centre; blend the two.
    const kp = best.keypoints;
    if (kp && kp.length >= 2 && isFinite(kp[0].x) && isFinite(kp[1].x)) {
      const ex = (kp[0].x + kp[1].x) / 2;
      const ey = (kp[0].y + kp[1].y) / 2;
      cx = cx * 0.4 + ex * 0.6;
      cy = cy * 0.4 + ey * 0.6;
      // Inter-eye distance (in width units) is ~0.4x face width; blending a
      // little in steadies z without letting head yaw dominate.
      const ed = Math.hypot((kp[0].x - kp[1].x), (kp[0].y - kp[1].y) * vh / vw);
      if (ed > 0) size = size * 0.7 + (ed / 0.4) * 0.3;
    }
    if (!(size > 0) || !isFinite(cx) || !isFinite(cy)) return;
    this._onSample(now, cx, cy, Math.log(size));
  }

  _onDetectError() {
    this._errors++;
    if (this._errors < 3) return;
    // Persistent failures: try falling back to CPU once, else give up quietly.
    if (this._delegate === 'GPU' && this._vision) {
      this._delegate = 'CPU';
      const old = this._detector;
      this._detector = null;
      safeClose(old);
      const gen = this._gen;
      this._createDetector().then((d) => {
        if (gen === this._gen && this._enabled) { this._detector = d; this._errors = 0; }
        else safeClose(d);
      }).catch(() => { if (gen === this._gen) this._fail(); });
      return;
    }
    this._fail();
  }

  _fail() {
    try { console.info('[headtrack] detection failed; tracking stopped'); } catch (_) {}
    this.stop();
  }

  _onSample(now, cx, cy, ls) {
    const wasLost = (now - this._lastSeenAt) > ACTIVE_WINDOW_MS;
    const sdt = this._lastSampleAt === null ? 0 : clamp((now - this._lastSampleAt) / 1000, 0, 0.5);
    this._lastSampleAt = now;
    this._lastSeenAt = now;

    // --- calibration / slow re-centring of the neutral pose ---
    if (!this._neutral) {
      if (this._calStart === null) this._calStart = now;
      this._calN++;
      this._calSum.cx += cx; this._calSum.cy += cy; this._calSum.ls += ls;
      const n = this._calN;
      const avg = { cx: this._calSum.cx / n, cy: this._calSum.cy / n, ls: this._calSum.ls / n };
      if (now - this._calStart >= CALIBRATE_MS && n >= 5) {
        this._neutral = avg;
      } else {
        // While calibrating, treat the running average as neutral so the
        // pose stays near zero rather than snapping when calibration ends.
        this._applyFiltered(cx - avg.cx, cy - avg.cy, ls - avg.ls, sdt, wasLost);
        return;
      }
    } else if (sdt > 0) {
      const k = 1 - Math.exp(-sdt / RECENTER_TAU_S);
      const nn = this._neutral;
      nn.cx += (cx - nn.cx) * k;
      nn.cy += (cy - nn.cy) * k;
      nn.ls += (ls - nn.ls) * k;
    }
    const nn = this._neutral;
    this._applyFiltered(cx - nn.cx, cy - nn.cy, ls - nn.ls, sdt, wasLost);
  }

  _applyFiltered(dcx, dcy, dls, sdt, reset) {
    // Camera image is not mirrored: the viewer moving to THEIR right moves the
    // face toward image-left (smaller x). Image y grows downward.
    const vw = this._video ? this._video.videoWidth : 640;
    const vh = this._video ? this._video.videoHeight : 480;
    const aspect = vh > 0 ? vh / vw : 0.75;
    const rx = clamp(-dcx / XY_RANGE, -1.5, 1.5);
    const ry = clamp((-dcy * aspect) / XY_RANGE, -1.5, 1.5); // same physical scale as x
    const rlz = clamp(dls, Math.log(Z_MIN), Math.log(Z_MAX));

    if (reset) {
      this._fx.reset(rx); this._fy.reset(ry); this._fz.reset(rlz);
    }
    const fx = this._fx.filter(rx, sdt);
    const fy = this._fy.filter(ry, sdt);
    const flz = this._fz.filter(rlz, sdt);
    this._filtered = {
      x: clamp(fx, -1, 1),
      y: clamp(fy, -1, 1),
      z: clamp(Math.exp(flz), Z_MIN, Z_MAX),
    };
  }
}

function stopStream(stream) {
  if (!stream) return;
  try { for (const t of stream.getTracks()) { try { t.stop(); } catch (_) {} } } catch (_) {}
}

function safeClose(detector) {
  if (!detector) return;
  try { detector.close(); } catch (_) {}
}

export default HeadTracker;

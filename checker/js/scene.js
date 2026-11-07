// Sky dome (gradient, banded clouds, flat sun disc), distant hills, cloth material.
import * as THREE from '../vendor/three/three.module.js';

const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;

export function makeSky() {
  const uniforms = {
    uTop: { value: new THREE.Vector3() }, uMid: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() },
    uCloud: { value: new THREE.Vector3() }, uCover: { value: 0.5 }, uDrift: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1) }, uSunA: { value: new THREE.Vector3() }, uSunB: { value: new THREE.Vector3() },
    uSunR: { value: 0.12 }, uScan: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: NOISE + `
      varying vec3 vDir;
      uniform vec3 uTop, uMid, uHorizon, uCloud, uSunDir, uSunA, uSunB; uniform float uCover, uDrift, uSunR, uScan;
      void main(){
        vec3 d = normalize(vDir);
        float e = d.y;
        // banded gradient: horizon -> mid -> top
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.09, e));
        col = mix(col, uTop, smoothstep(0.05, 0.26, e));
        // long streaky clouds, stretched horizontally, thinning toward the zenith
        vec2 cp = vec2(atan(d.x, -d.z) * 2.2 + uDrift, e * 26.0);
        float n = fbm(cp * vec2(1.0, 1.0) + vec2(uDrift * 0.5, 0.0));
        n += 0.35 * fbm(cp * vec2(3.0, 2.0) - vec2(uDrift * 1.3, 3.1));
        float band = smoothstep(0.03, 0.12, e) * (1.0 - smoothstep(0.32, 0.62, e));
        float th = 0.98 - uCover * 0.3;
        // speckled print edges: threshold is jittered per pixel
        float speck = hash12(gl_FragCoord.xy) * 0.14 - 0.07;
        float c = smoothstep(th - 0.03, th + 0.06, n + speck) * band;
        col = mix(col, uCloud, c * 0.92);
        // flat sun disc
        float ang = acos(clamp(dot(d, normalize(uSunDir)), -1., 1.));
        float edge = fwidth(ang) * 1.2;
        float disc = 1.0 - smoothstep(uSunR - edge, uSunR + edge, ang);
        // vertical gradient across the disc (top colour -> bottom colour)
        vec3 up = vec3(0., 1., 0.);
        float yy = clamp(((e - uSunDir.y) / uSunR) * 0.5 + 0.5, 0., 1.);
        vec3 sc = mix(uSunB, uSunA, smoothstep(0.1, 0.95, yy));
        // faint horizontal heat-lines across the bottom of the disc when it is low
        float lines = step(0.5, fract((e - uSunDir.y) * 260.0)) * smoothstep(0.45, 0.0, yy) * uScan;
        sc = mix(sc, uHorizon, lines * 0.55);
        // soft glow around the sun
        float glow = exp(-max(ang - uSunR, 0.) * 9.0) * 0.18;
        col = mix(col, sc, glow * (1.0 - c * 0.6));
        col = mix(col, sc, disc * (1.0 - c * 0.35));
        if (e < 0.0) col = uHorizon;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 32), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function makeHills() {
  // A long ragged ridge line far behind the cloth.
  const segs = 360, x0 = -340, x1 = 340;
  const pos = [], idx = [], hgt = [];
  const ridge = (x) => {
    let h = 0;
    h += 6.5 * (0.5 + 0.5 * Math.sin(x * 0.012 + 1.3)) ;
    h += 3.2 * Math.sin(x * 0.031 + 0.4) + 1.6 * Math.sin(x * 0.071 + 2.0) + 0.7 * Math.sin(x * 0.19);
    return Math.max(0.8, h + 4.5);
  };
  for (let i = 0; i <= segs; i++) {
    const x = x0 + (x1 - x0) * i / segs;
    const z = -150 - 25 * Math.cos(x * 0.004);
    pos.push(x, -6, z, x, ridge(x), z);
    hgt.push(0, 1, 1, 1);
  }
  const top = [];
  for (let i = 0; i <= segs; i++) { top.push(0, 1); }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('top', new THREE.Float32BufferAttribute(top, 1));
  g.setIndex(idx);
  const uniforms = { uHill: { value: new THREE.Vector3() }, uHaze: { value: new THREE.Vector3() }, uScale: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float top; varying float vTop; uniform float uScale;
      void main(){ vec3 p = position; if (top > 0.5) p.y = mix(-1.0, p.y, uScale); vTop = top; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.); }`,
    fragmentShader: `varying float vTop; uniform vec3 uHill, uHaze;
      void main(){ vec3 c = mix(uHill, uHaze, 0.12 + 0.1 * (1.0 - vTop)); gl_FragColor = vec4(c, 1.); }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function makeClothMaterial() {
  const uniforms = {
    uLight: { value: new THREE.Vector3() }, uDark: { value: new THREE.Vector3() },
    uKey: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Vector3(0, 0.1, -1) },
    uSunCol: { value: new THREE.Vector3(1, 0.5, 0.4) }, uShadowTint: { value: new THREE.Vector3(0.2, 0.2, 0.3) },
    uHaze: { value: new THREE.Vector3() }, uLightAmt: { value: 0.5 },
    uHand: { value: new THREE.Vector4(0, 0, 0, 0) }, // xyz + strength
    uHandR: { value: 2.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    extensions: { derivatives: true },
    vertexShader: `
      attribute float shade;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vShade; varying float vRestY;
      void main(){
        vUv = uv; vN = normal; vShade = shade;
        vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: NOISE + `
      varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vShade;
      uniform vec3 uLight, uDark, uKey, uSun, uSunCol, uShadowTint, uHaze; uniform float uLightAmt;
      uniform vec4 uHand; uniform float uHandR;
      void main(){
        // hand-printed wobble on the square edges
        vec2 p = vUv + 0.035 * vec2(vnoise(vUv * 1.7), vnoise(vUv * 1.7 + 9.3)) - 0.0175;
        // filtered checker (box-filtered square wave) so far squares never alias
        vec2 w = max(fwidth(p), vec2(1e-4)) * 1.1;
        vec2 i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
        float ch = 0.5 - 0.5 * i.x * i.y;
        vec3 base = mix(uLight, uDark, ch);

        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vW);
        // soft wrapped key light from the sun side (above / in front of the folds)
        float lam = pow(clamp(dot(n, normalize(uKey)) * 0.55 + 0.45, 0., 1.), 1.6);
        float sh = mix(0.3, 1.0, vShade);
        float lit = lam * sh;
        vec3 shadeCol = mix(uShadowTint, vec3(1.0), 0.15 + 0.85 * lit);
        vec3 col = base * shadeCol;
        // warm sun tint on lit faces, stronger when the sun is low
        col *= mix(vec3(1.0), uSunCol * 1.35, (1.0 - uLightAmt) * 0.25 * lit);
        // rim / backlight from the real sun direction along silhouettes
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * max(dot(-v, normalize(uSun)), 0.0);
        col += uSunCol * rim * 0.35 * (0.3 + 0.7 * (1.0 - ch));
        // the hand: a soft warm glow on the surface right under the cursor
        float hd = length(vW.xz - uHand.xz) / uHandR;
        float glow = exp(-hd * hd * 2.5) * uHand.w;
        col = mix(col, col * 1.18 + uSunCol * 0.06, glow * 0.6);
        // a faint ring where the hand meets the cloth
        float ring = exp(-pow((hd - 0.42) / max(fwidth(hd) * 1.5, 0.025), 2.0)) * uHand.w;
        col = mix(col, mix(col, vec3(1.0) - col * 0.5, 0.5), ring * 0.45);
        // atmospheric depth toward the horizon
        float dist = length(vW - cameraPosition);
        float f = smoothstep(18.0, 92.0, dist);
        col = mix(col, uHaze, f * f * 0.85);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  return { mat, uniforms };
}

import * as THREE from "three";
import { GLTFLoader } from "./assets/vendor/three/GLTFLoader.js";

// One 3D cassette. The parent retains its static poster if WebGL cannot load;
// no photographic tape or shadow is layered behind the moving model.
const canvas = document.getElementById("tape-model");
const host = document.getElementById("tape-mask");
async function build() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(960, 640, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-480, 480, 320, -320, 0.1, 10000);
    camera.position.z = 5000;
    scene.add(new THREE.HemisphereLight(0xfff5e6, 0x999fa8, 2.4));
    const key = new THREE.DirectionalLight(0xfff1d7, 2.1);
    key.position.set(800, 1000, 1800);
    scene.add(key);
    const gltf = await new GLTFLoader().loadAsync("assets/model/proxy-vhs.glb");
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const cutoff = { value: box.max.y + 1 };
    model.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.roughness = Math.max(0.7, material.roughness || 0);
        material.metalness = Math.min(0.12, material.metalness || 0);
        // Meshy exports this rigid cassette as one identity-transform mesh.
        // Hide the portion beyond its longitudinal insertion plane. Unlike a
        // screen-space crop, this preserves the thickness inside the aperture.
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uTapeCutoff = cutoff;
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying float vTapeY;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTapeY = position.y;");
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying float vTapeY;\nuniform float uTapeCutoff;",
            )
            .replace("void main() {", "void main() {\nif (vTapeY > uTapeCutoff) discard;");
        };
        material.customProgramCacheKey = () => "proxy-vhs-insertion-v1";
      }
    });
    const centered = new THREE.Group();
    centered.add(model);
    // Restore the real VHS thickness; the generated mesh was a little too deep.
    centered.scale.z = ((25 / 187) * size.x) / size.z;
    const rig = new THREE.Group();
    rig.add(centered);
    scene.add(rig);
    window.__proxyScene.geometry = { lengthRatio: size.y / size.x, thicknessRatio: 25 / 187 };
    window.__proxyTapeRender = (state) => {
      if (state.opacity === 0) return;
      canvas.style.transform = `translate3d(${state.x - 480}px,${state.y - 320}px,0)`;
      rig.position.set(0, 0, state.depth);
      const scale = state.width / size.x;
      rig.scale.setScalar(scale);
      rig.rotation.x = THREE.MathUtils.degToRad(state.pitch);
      cutoff.value = state.insert > 0 ? box.max.y - size.y * state.insert : box.max.y + 1;
      renderer.render(scene, camera);
      window.__proxyScene.insertionPlane = {
        cutoff: cutoff.value,
        // Projected center of the cross-section entering the machine.
        x: state.x,
        y: state.y - (cutoff.value - center.y) * scale * Math.cos(rig.rotation.x),
        halfThickness: (state.width * (25 / 187) * Math.abs(Math.sin(rig.rotation.x))) / 2,
      };
    };
    window.__proxyScene.renderAt(window.__proxyScene.state.time);
    host.classList.add("model-ready");
    window.__proxyScene.model = { ready: true, size: size.toArray() };
  } catch (error) {
    renderer?.dispose();
    window.__proxyScene.model = { ready: false, reason: error.message };
  }
}
const ready = build();
window.__hf = window.__hf || {};
window.__hf.buildReady = { ...window.__hf.buildReady, tape: ready };

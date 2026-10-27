import * as THREE from "three";
import { GLTFLoader } from "./assets/vendor/three/GLTFLoader.js";

// Optional progressive enhancement. The photographic cutout remains if WebGL or
// the model cannot load; the same Hyperframes timeline drives both renderers.
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
    model.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.roughness = Math.max(0.7, material.roughness || 0);
        material.metalness = Math.min(0.12, material.metalness || 0);
      }
    });
    const rig = new THREE.Group();
    rig.add(model);
    scene.add(rig);
    window.__proxyTapeRender = (state) => {
      if (state.opacity === 0) return;
      canvas.style.transform = `translate3d(${state.x - 480}px,${state.y - 320}px,0)`;
      rig.position.set(0, 0, 0);
      const scale = state.width / size.x;
      rig.scale.setScalar(scale);
      rig.rotation.x = THREE.MathUtils.degToRad(state.pitch);
      renderer.render(scene, camera);
    };
    window.__proxyTapeRender(window.__proxyScene.state);
    host.classList.add("model-ready");
    window.__proxyScene.model = { ready: true, size: size.toArray() };
  } catch (error) {
    renderer?.dispose();
    // A missing optional asset is handled, never blocks the landing page.
    window.__proxyScene.model = { ready: false, reason: error.message };
  }
}
const ready = build();
window.__hf = window.__hf || {};
window.__hf.buildReady = { ...window.__hf.buildReady, tape: ready };

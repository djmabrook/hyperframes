// Feature "liveScopes": the RGB parade on the colour page reads the monitor picture, so it
// moves with playback, scrubbing, bin cues and the wheel grade. Off, the painted parade stays.
import { THREE } from "../motion/workspace/scene.js";

export function setupLiveScopes({ ws, monitor }) {
  const sample = document.createElement("canvas");
  sample.width = 64;
  sample.height = 36;
  const sg = sample.getContext("2d", { willReadFrequently: true });
  const scope = document.createElement("canvas");
  scope.width = 190;
  scope.height = 360;
  const g = scope.getContext("2d");
  const tex = new THREE.CanvasTexture(scope);
  tex.colorSpace = THREE.SRGBColorSpace;
  const colours = ["rgba(255,70,60,0.32)", "rgba(70,230,110,0.32)", "rgba(70,140,255,0.32)"];
  let attached = false;
  let skip = 0;

  return () => {
    const src = monitor.canvas();
    if (!src || (skip = (skip + 1) % 2)) return; // every other frame is plenty
    if (!attached) ws.setScope(tex), (attached = true);
    sg.drawImage(src, 0, 0, sample.width, sample.height);
    const px = sg.getImageData(0, 0, sample.width, sample.height).data;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#0a0b0c";
    g.fillRect(0, 0, scope.width, scope.height);
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i <= 4; i++) g.fillRect(0, 15 + i * 82.5, scope.width, 1);
    g.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      g.fillStyle = colours[k];
      const x0 = 8 + k * 60;
      for (let y = 0; y < sample.height; y++) {
        for (let x = 0; x < sample.width; x++) {
          const v = px[(y * sample.width + x) * 4 + k] / 255;
          g.fillRect(x0 + (x / sample.width) * 52, 15 + (1 - v) * 330, 2.5, 2.5);
        }
      }
    }
    tex.needsUpdate = true;
  };
}

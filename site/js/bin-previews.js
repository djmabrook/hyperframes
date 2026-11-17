// Feature "binPreviews": hovering (or focusing) a project in the Work bin cues it on the
// program monitor, like loading a clip into the source monitor. The camera leans toward the
// monitor, the picture restarts and takes on the project's label colour and its own
// waveform. Every project is a placeholder for now, so they share one composition.
export function setupBinPreviews({ ws, monitor }) {
  const items = [...document.querySelectorAll(".bin button")];
  const state = { hover: -1, lean: 0, tint: [1, 1, 1], mix: 0, seed: 0.5 };

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const cueOn = (i) => {
    if (!monitor.ready() || state.hover === i) return;
    state.hover = i;
    const chip = items[i].querySelector(".chip");
    state.tint = hex(getComputedStyle(chip).getPropertyValue("--c").trim());
    state.seed = ((i * 0.618) % 1) * 0.9 + 0.05;
    monitor.restart();
  };
  const cueOff = (i) => {
    if (state.hover === i) state.hover = -1;
  };
  items.forEach((el, i) => {
    el.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && cueOn(i));
    el.addEventListener("pointerleave", () => cueOff(i));
    el.addEventListener("focus", () => cueOn(i));
    el.addEventListener("blur", () => cueOff(i));
  });

  // Per frame: ease the lean and the tint, and send the tint while it's changing.
  return (dt) => {
    const on = state.hover >= 0 ? 1 : 0;
    const k = 1 - Math.exp(-dt * 4);
    state.lean += (on - state.lean) * k;
    ws.setPeek(state.lean * 0.85);
    if (!on && state.mix === 0) return;
    state.mix += (on - state.mix) * k;
    if (!on && state.mix < 0.01) state.mix = 0; // back to the monitor's own picture
    monitor.send("cue", { tint: state.tint, mix: state.mix, seed: state.mix ? state.seed : 0.5 });
  };
}

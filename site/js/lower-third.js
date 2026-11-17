// Feature "lowerThird": the name builds on like a broadcast lower third when the page opens,
// and builds on again when you hover it. Remove this file's import in site.js (or switch the
// feature off in features.js) and the slate simply sits still.
const slate = document.querySelector(".slate");
const lines = [...slate.children];
const ease = "cubic-bezier(0.2, 0.7, 0.2, 1)";
let running = null;

function build() {
  running?.forEach((a) => a.cancel());
  running = [
    // The plate wipes on from the left edge, then each line slides in behind it.
    slate.animate({ clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, { duration: 520, easing: ease, fill: "backwards" }),
    ...lines.map((el, i) =>
      el.animate(
        { opacity: [0, 1], transform: ["translateX(-14px)", "translateX(0)"] },
        { duration: 460, delay: 160 + i * 110, easing: ease, fill: "backwards" },
      ),
    ),
  ];
}

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  build();
  slate.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse") return;
    if (running?.some((a) => a.playState === "running")) return;
    build();
  });
}

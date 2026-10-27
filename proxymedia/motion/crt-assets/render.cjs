/* Render a seekable composition to H.264 by seeking its timeline frame by frame.
   Equivalent to `hf render` for these canvas-only compositions; use that instead
   where the HyperFrames CLI is installed.
   Usage: node render.cjs <composition-dir> <out.mp4> [fps] [crf] */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");
(async () => {
  const [dir, out, fps = "30", crf = "14"] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto("file://" + path.resolve(dir, "index.html"));
  const duration = await page.evaluate(() =>
    Number(document.getElementById("root").dataset.duration),
  );
  const frames = Math.round(duration * Number(fps));
  const ff = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", fps, "-i", "-",
     "-c:v", "libx264", "-preset", "slow", "-crf", crf, "-tune", "grain",
     "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
     "-color_trc", "bt709", "-movflags", "+faststart", out],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  for (let i = 0; i < frames; i++) {
    // Never return the timeline from evaluate: serialising it hangs.
    await page.evaluate((t) => {
      window.__timelines.main.seek(t, false);
    }, i / Number(fps));
    const png = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 30 === 0) console.log(`${dir}: frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  console.log(out, frames, "frames");
})();

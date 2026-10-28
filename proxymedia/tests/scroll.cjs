const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  fs.mkdirSync("work/qa", { recursive: true });
  const errors = [];
  const results = [];
  for (const viewport of [
    { width: 1440, height: 810 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.PROXY_URL || "http://127.0.0.1:4174");
    await page.waitForFunction(() => document.querySelector("#frame.ready"), null, {
      timeout: 20000,
    });
    const info = await page.evaluate(() => {
      const p = document.querySelector("hyperframes-player");
      const s = p.iframeElement.contentWindow.__proxyScene;
      return { model: s.model, duration: p.duration };
    });
    assert.equal(info.model.ready, true);
    assert.equal(info.duration, 14);
    // Seek into every meaningful pose, then backwards: identical input => identical output.
    const deterministic = await page.evaluate(() => {
      const w = document.querySelector("hyperframes-player").iframeElement.contentWindow;
      const tl = w.__timelines.main;
      tl.seek(6.2, false);
      const a = w.document.getElementById("world").style.transform;
      tl.seek(11, false);
      tl.seek(6.2, false);
      return a === w.document.getElementById("world").style.transform;
    });
    assert.equal(deterministic, true);
    for (const fraction of [0, 0.24, 0.385, 0.46, 0.565, 0.68, 1, 0]) {
      await page.evaluate(
        (f) => scrollTo(0, f * (document.getElementById("landing").offsetHeight - innerHeight)),
        fraction,
      );
      await page.waitForTimeout(1100);
      const read = await page.evaluate(() => {
        const p = document.querySelector("hyperframes-player");
        return { time: p.currentTime, state: p.iframeElement.contentWindow.__proxyScene.state };
      });
      assert.ok(
        Math.abs(read.time - fraction * 14) < 0.025,
        `${viewport.width}: scroll ${fraction} -> ${read.time}`,
      );
      if (viewport.width === 1440 && fraction !== 0)
        await page.screenshot({ path: `work/qa/desktop-${fraction}.png` });
      if (viewport.width === 390 && fraction === 1) {
        await page.screenshot({ path: "work/qa/mobile-end.png" });
        const bounds = await page.locator("#frame").boundingBox();
        assert.ok(bounds.height >= viewport.height - 1);
      }
    }
    // No coarse frame quantization, no discontinuity at approach/insert/tilt boundaries.
    const maxStep = await page.evaluate(() => {
      const s =
        document.querySelector("hyperframes-player").iframeElement.contentWindow.__proxyScene;
      let jump = 0;
      for (let t = 0; t < 14; t += 1 / 120) {
        const a = s.stateAt(t),
          b = s.stateAt(t + 1 / 120);
        jump = Math.max(jump, Math.abs(b.y - a.y), Math.abs(b.cameraY - a.cameraY));
      }
      return jump;
    });
    assert.ok(maxStep < 10, `state step ${maxStep}`);
    results.push({ viewport, model: info.model, maxStateStep: maxStep, forwardReverse: "pass" });
    await page.close();
  }
  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await reduced.goto(process.env.PROXY_URL || "http://127.0.0.1:4174");
  await reduced.waitForFunction(() => document.querySelector("#frame.ready"));
  await reduced.evaluate(() => scrollTo(0, document.getElementById("landing").offsetHeight - innerHeight));
  await reduced.waitForTimeout(150);
  assert.equal(await reduced.evaluate(() => document.body.dataset.sequenceComplete), "true");
  assert.deepEqual(errors, []);
  await browser.close();
  fs.writeFileSync(
    "work/qa/results.json",
    JSON.stringify({ results, reducedMotion: "pass", pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ results, reducedMotion: "pass", pageErrors: errors }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

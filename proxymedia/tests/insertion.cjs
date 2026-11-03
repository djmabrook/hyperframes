const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

let browser;
(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /THREE|shader|WebGL/i.test(message.text()))
      errors.push(message.text());
  });
  const base = process.env.PROXY_URL || "http://127.0.0.1:4174";
  await page.goto(base + "/motion/landing/index.html");
  await page.waitForFunction(() => window.__proxyScene?.model?.ready);
  assert.equal(await page.locator("#tape-fallback, #tape-shadow").count(), 0);
  assert.equal(await page.locator('img[src*="tape01"]').count(), 0);

  // Read the actual rendered model pixels, not just the authored animation values.
  // Aperture bounds were measured independently from vcr-open.webp at scene scale.
  const samples = [];
  async function sample(time) {
    return page.evaluate((time) => {
      window.__timelines.main.seek(time, false);
      const scene = window.__proxyScene;
      const canvas = document.getElementById("tape-model");
      const gl = canvas.getContext("webgl2");
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const state = scene.state;
      let top = Infinity,
        bottom = -Infinity,
        left = Infinity,
        right = -Infinity;
      let aperturePixels = 0,
        opaquePixels = 0,
        hash = 2166136261;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (pixels[i + 3] < 128) continue;
          const worldX = state.x - 480 + x;
          const worldY = state.y - 320 + canvas.height - 1 - y;
          top = Math.min(top, worldY);
          bottom = Math.max(bottom, worldY);
          left = Math.min(left, worldX);
          right = Math.max(right, worldX);
          opaquePixels++;
          if (worldX >= 651 && worldX <= 1251 && worldY >= 1580 && worldY <= 1654) aperturePixels++;
          for (let j = 0; j < 4; j++) hash = Math.imul(hash ^ pixels[i + j], 16777619) >>> 0;
        }
      return { time, top, bottom, left, right, aperturePixels, opaquePixels, hash };
    }, time);
  }
  fs.mkdirSync("work/qa/insertion", { recursive: true });
  for (const time of [5.8, 6.2, 6.6, 7.0, 7.3]) {
    const result = await sample(time);
    if (time < 7.2) assert.ok(result.aperturePixels > 1000, `Tape misses aperture at ${time}s`);
    else
      assert.ok(
        result.opaquePixels < 1000,
        "Only a subpixel tail may remain just before full insertion",
      );
    assert.ok(result.top >= 1579, `Tape leaks over upper slot bezel at ${time}s`);
    assert.ok(
      result.left >= 651 && result.right <= 1251,
      `Tape is wider than aperture at ${time}s`,
    );
    if (samples.length)
      assert.ok(
        result.opaquePixels <= samples.at(-1).opaquePixels,
        "Tape must progressively enter the machine",
      );
    samples.push(result);
    await page.screenshot({ path: `work/qa/insertion/${time}.png` });
  }
  const reverse = await sample(6.2);
  assert.equal(
    reverse.hash,
    samples[1].hash,
    "Reverse seek must restore exactly the same rendered pixels",
  );
  await page.evaluate(() => {
    window.__timelines.main.seek(7.35, false);
  });
  assert.equal(await page.locator("#tape-mask").evaluate((el) => el.style.opacity), "0");
  assert.deepEqual(errors, []);

  // Without WebGL/model loading, the host keeps its static poster, not a 2D
  // tape underneath the model or an empty scene.
  const fallback = await browser.newPage();
  await fallback.route("**/proxy-vhs.glb", (route) => route.abort());
  await fallback.goto(base);
  await fallback.waitForFunction(
    () =>
      document.querySelector("hyperframes-player")?.iframeElement?.contentWindow?.__proxyScene
        ?.model?.ready === false,
    null,
    { timeout: 15000 },
  );
  assert.equal(await fallback.locator("#frame.ready").count(), 0);
  assert.equal(
    await fallback.locator("#poster").evaluate((el) => getComputedStyle(el).opacity),
    "1",
  );
  await browser.close();
  fs.writeFileSync(
    "work/qa/insertion/results.json",
    JSON.stringify(
      {
        samples,
        reversePixels: "pass",
        cleanModelLayers: "pass",
        staticPosterFallback: "pass",
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        samples,
        reversePixels: "pass",
        cleanModelLayers: "pass",
        staticPosterFallback: "pass",
        errors,
      },
      null,
      2,
    ),
  );
})().catch(async (error) => {
  console.error(error);
  await browser?.close();
  process.exitCode = 1;
});

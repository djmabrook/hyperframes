const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const URL_ = process.env.PROXY_URL || "http://127.0.0.1:4174/";
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await b.newPage({ viewport: { width: 1440, height: 810 } });
  const posts = [];
  await page.route(URL_, (route) => {
    if (route.request().method() === "POST") { posts.push(route.request().postData()); return route.fulfill({ status: 200, body: "ok" }); }
    return route.continue();
  });
  await page.goto(URL_);
  await page.waitForTimeout(800);
  await page.evaluate(() => scrollTo(0, document.getElementById("notes").offsetTop));
  await page.waitForTimeout(5500);
  const box = await page.locator(".nt-ink").boundingBox();
  const inkPixels = () => page.evaluate(() => { const c = document.querySelector(".nt-ink"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  const colors = [];
  for (let s = 0; s < 3; s++) {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8 + s * 25);
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) await page.mouse.move(box.x + box.width * 0.3 + i * 12, box.y + box.height * 0.8 + s * 25 + Math.sin(i) * 15);
    await page.mouse.up();
    colors.push(await page.evaluate(([x, y]) => { const c = document.querySelector(".nt-ink"); const r = c.getBoundingClientRect(); const k = c.width / r.width; const d = c.getContext("2d").getImageData((x - r.left) * k, (y - r.top) * k, 1, 1).data; return [...d].join(","); }, [box.x + box.width * 0.3, box.y + box.height * 0.8 + s * 25]));
  }
  const drawn = await inkPixels();
  await page.click(".nt-roller");
  await page.waitForTimeout(700);
  assert.ok(drawn > 300, "strokes reach the ink layer");
  assert.ok(colors[0] !== colors[1] && colors[1] !== colors[2], "each stroke picks a new marker colour");
  assert.equal(await inkPixels(), 0, "the roller paints over the writing");
  const mb = await page.evaluate(() => { const s = document.getElementById("mailbox"); scrollTo(0, s.offsetTop + s.offsetHeight); return 0; });
  await page.waitForTimeout(3000);
  await page.fill("input[name=name]", "Test Person");
  await page.fill("input[name=email]", "test@example.com");
  await page.fill("textarea[name=message]", "Hello from the mailbox test");
  // keyboard-induced scroll while focused must not drop the form
  await page.focus("textarea[name=message]");
  await page.evaluate(() => scrollBy(0, -600));
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.querySelector(".mb-form").dataset.settled), "true", "focused form holds");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  await page.click(".mb-actions button");
  await page.waitForTimeout(800);
  assert.equal(posts.length, 1);
  assert.match(posts[0], /^form-name=contact&bot-field=&name=Test\+Person&email=test%40example\.com&message=/);
  assert.equal(await page.textContent(".mb-status"), "Sent.");
  console.log("sections ok");
  await b.close();
})();

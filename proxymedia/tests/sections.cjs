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
  await page.evaluate(() => scrollTo(0, document.getElementById("mailbox").offsetTop));
  await page.waitForTimeout(1500);
  assert.equal(
    await page.evaluate(() => [...document.querySelectorAll("#mailbox img")].filter((i) => i.complete && i.naturalWidth).length),
    9,
    "the mailbox, its door and the six lines of writing load",
  );
  const mb = await page.evaluate(() => { const s = document.getElementById("mailbox"); scrollTo(0, s.offsetTop + s.offsetHeight); return 0; });
  await page.waitForTimeout(3000);
  await page.fill("input[name=name]", "Test Person");
  await page.fill("input[name=email]", "test@example.com");
  await page.fill("textarea[name=message]", "Hello from the mailbox test");
  // keyboard-induced scroll while focused must not drop the form
  await page.focus("textarea[name=message]");
  await page.evaluate(() => scrollBy(0, -600));
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => document.getElementById("mailbox").dataset.form), "open", "focused form holds");
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

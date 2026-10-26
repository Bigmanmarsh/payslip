// Records the demo screens with Playwright. Each part is a separate video file,
// plus a JSON file of timestamps (seconds from the start of that video) so the
// editor can cut out the waiting while Zcash works.
//
// Usage: node record.mjs [home|employer|checker|github|all]
// Needs the app running at http://localhost:4321.

import { chromium } from "playwright";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:4321";
const OUT = "out/raw";
const SIZE = { width: 1280, height: 720 };
const PAYSLIP = { id: "008", name: "Worker", amount: "0.03", period: "2026-10" };
mkdirSync(OUT, { recursive: true });

// A visible mouse pointer and click ripple, since headless recordings have none.
const CURSOR = `
  window.addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;z-index:99999;left:0;top:0;width:22px;height:22px;pointer-events:none;transform:translate(-3px,-2px);transition:left .05s,top .05s";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#17140f" stroke="#fff" stroke-width="1.5"/></svg>';
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;z-index:99998;pointer-events:none;border-radius:50%;border:3px solid #f4b728;width:10px;height:10px;left:" + (e.clientX-5) + "px;top:" + (e.clientY-5) + "px;transition:all .45s ease-out;opacity:1";
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.width = r.style.height = "44px"; r.style.left = (e.clientX-22) + "px"; r.style.top = (e.clientY-22) + "px"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  });`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(name, fn) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, deviceScaleFactor: 1,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const t0 = Date.now();
  const marks = {};
  const mark = (k) => (marks[k] = (Date.now() - t0) / 1000);
  await page.mouse.move(640, 360);
  await fn(page, mark);
  mark("end");
  const video = page.video();
  await context.close();
  await browser.close();
  renameSync(await video.path(), `${OUT}/${name}.webm`);
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(marks, null, 2));
  console.log(name, marks);
}

// Smoothly move the pointer to an element, then click it.
async function moveTo(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await sleep(250);
}
async function click(page, locator) {
  await moveTo(page, locator);
  await locator.click();
}
async function smoothScroll(page, y, ms = 1200) {
  await page.evaluate(([y, ms]) => new Promise((r) => {
    const start = scrollY, t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms); scrollTo(0, start + (y - start) * (1 - (1 - k) ** 3)); k < 1 ? requestAnimationFrame(step) : r(); };
    requestAnimationFrame(step);
  }), [y, ms]);
}

async function workerInfo() {
  const { workers } = await (await fetch(`${BASE}/api/workers`)).json();
  return workers.find((w) => w.wallet === "worker");
}

const parts = {
  // Sections 1 + 2: problem and idea, over the home page.
  async home() {
    await session("home", async (page, mark) => {
      await page.goto(BASE);
      await page.waitForLoadState("networkidle");
      mark("start");
      await sleep(9000);
      await moveTo(page, page.locator(".role").nth(0));
      await sleep(5000);
      await smoothScroll(page, 400, 2500);
      await sleep(7000);
      mark("idea");
      await smoothScroll(page, 0, 1500);
      for (const i of [0, 1, 2]) {
        await moveTo(page, page.locator(".role").nth(i));
        await sleep(3500);
      }
      await sleep(4000);
    });
  },

  // Section 3a: the employer pays the team.
  async employer() {
    const worker = await workerInfo();
    await session("employer", async (page, mark) => {
      await page.goto(`${BASE}/employer.html`);
      await page.waitForFunction(() => /TAZ|unknown|unavailable/.test(document.querySelector("#emp-balance").textContent));
      mark("start");
      await sleep(1500);
      const row = page.locator("#rows tr").first();
      await click(page, row.locator('input[name="id"]'));
      await row.locator('input[name="id"]').pressSequentially(PAYSLIP.id, { delay: 90 });
      await click(page, row.locator('input[name="name"]'));
      await row.locator('input[name="name"]').pressSequentially(PAYSLIP.name, { delay: 90 });
      await click(page, row.locator('input[name="address"]'));
      await row.locator('input[name="address"]').fill(worker.address);
      await click(page, row.locator('input[name="amount"]'));
      await row.locator('input[name="amount"]').pressSequentially(PAYSLIP.amount, { delay: 90 });
      await sleep(500);
      mark("preview");
      await click(page, page.locator("#preview"));
      await page.waitForSelector("#out .msg.info");
      await sleep(4500);
      page.once("dialog", (d) => d.accept());
      await click(page, page.locator("#pay"));
      mark("payClicked");
      await page.waitForSelector("#out .msg.ok, #out .msg.err", { timeout: 300000 });
      mark("paid");
      const ok = await page.locator("#out .msg.ok").count();
      if (!ok) throw new Error(await page.locator("#out").innerText());
      await sleep(7000);
    });
  },

  // Sections 3b + 4: the worker shares the proof, the checker verifies it, then privacy.
  async checker() {
    const worker = await workerInfo();
    // Wait (unrecorded) until the new payslip is mined and visible to the checker.
    for (let i = 0; i < (process.env.SKIP_WAIT ? 0 : 30); i++) {
      const r = await (await fetch(`${BASE}/api/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proof: worker.proof }) })).json();
      if (r.results?.some((x) => x.status === "verified" && x.payslip?.id === PAYSLIP.id)) break;
      console.log("waiting for payslip to be mined...");
      await sleep(20000);
    }
    await session("checker", async (page, mark) => {
      await page.goto(`${BASE}/worker.html`);
      await page.waitForSelector("#workers textarea");
      mark("start");
      await sleep(2500);
      const copy = page.locator("[data-copy]").first();
      await moveTo(page, page.locator("#workers textarea").first());
      await sleep(1500);
      await click(page, copy);
      await sleep(2000);
      await page.goto(`${BASE}/check.html`);
      await page.waitForLoadState("networkidle");
      await click(page, page.locator("#proof"));
      await page.locator("#proof").fill(worker.proof);
      await sleep(1200);
      await click(page, page.locator("#check"));
      mark("checkClicked");
      await page.waitForSelector("#report .card, #out .msg.err", { timeout: 300000 });
      mark("results");
      await sleep(4000);
      await smoothScroll(page, 260, 1500);
      await sleep(5000);
      mark("skipped");
      await smoothScroll(page, 420, 1200);
      await sleep(5000);
      mark("privacy");
      await page.evaluate(() => document.querySelector("#report .privacy").scrollIntoView({ behavior: "smooth", block: "center" }));
      await sleep(1500);
      await moveTo(page, page.locator("#report .privacy .no"));
      await sleep(18000);
    });
  },

  // Section 5: the open-source repository.
  async github() {
    await session("github", async (page, mark) => {
      await page.goto("https://github.com/Bigmanmarsh/payslip");
      await page.waitForLoadState("networkidle").catch(() => {});
      mark("start");
      await sleep(3000);
      await smoothScroll(page, 500, 2500);
      await sleep(4000);
    });
  },
};

const which = process.argv[2] ?? "all";
for (const [name, fn] of Object.entries(parts)) {
  if (which === "all" || which === name) await fn();
}

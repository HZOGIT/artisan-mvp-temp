import { chromium } from "playwright";

const BASE = "https://staging.operioz.com";
const EMAIL = "dev@operioz.com";
const PASS = process.env.E2E_PASS || "Azerqsdf1234!";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

// Auth par API (même méthode que staging-e2e-sweep.mjs)
const signin = await ctx.request.post("/api/trpc/auth.signin?batch=1", {
  headers: { "content-type": "application/json" },
  data: { "0": { json: { email: EMAIL, password: PASS } } },
});
if (!signin.ok()) {
  console.log("LOGIN FAILED:", signin.status());
  await browser.close();
  process.exit(1);
}

const page = await ctx.newPage();
const apiCalls = [];
page.on("response", r => {
  if (r.url().includes("/api/")) apiCalls.push({ status: r.status(), url: r.url().replace(BASE, "").substring(0, 120) });
});

await page.goto(`${BASE}/v2/assistant?thread=90`);
await page.waitForTimeout(5000);

const text = await page.evaluate(() => document.body.innerText);
console.log("=== CONVERSATION (thread 90) ===");
console.log(text.substring(0, 5000));
console.log("\n=== API CALLS ===");
console.log(apiCalls.filter(c => c.url.includes("assistant") || c.url.includes("thread")).map(c => `${c.status} ${c.url}`).join("\n"));

await browser.close();

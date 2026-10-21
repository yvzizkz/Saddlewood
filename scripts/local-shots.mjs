// Phone (390 px) and desktop (1440 px) screenshots of app pages, signed in as
// a local owner on this worktree's OWN Supabase stack. Local only: it reads
// the stack's keys from `supabase status`, refuses any URL but 127.0.0.1:55321,
// and creates the local owner user if it is missing.
//
//   node scripts/local-shots.mjs /app/accounting/payroll?p=mtd /app/accounting …
//   SHOTS_DIR=/tmp/shots BASE=http://localhost:3100 (defaults)

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";
const DIR = process.env.SHOTS_DIR ?? "/tmp/shots";
const EMAIL = process.env.SHOTS_EMAIL ?? "lando@saddlewoodcontracting.com";
const CREW = process.env.SHOTS_CREW === "1";
const PASSWORD = "local-only-pass-1";

const env = Object.fromEntries(
  execSync("supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (env.API_URL !== "http://127.0.0.1:55321") throw new Error(`refusing: not this worktree's stack (${env.API_URL})`);

const admin = { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
await fetch(`${env.API_URL}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }) });
const session = await (
  await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
).json();
if (!session.access_token) throw new Error("local sign-in failed");
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch();
const sizes = [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
];
for (const [label, viewport] of sizes) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const cookies = [{ name: "sb-127-auth-token", value, domain: "localhost", path: "/" }];
  if (CREW) cookies.push({ name: "sw_crew", value: "1", domain: "localhost", path: "/" });
  await ctx.addCookies(cookies);
  // The owner onboarding sheet is seen once per address; mark it seen.
  await ctx.addInitScript((email) => localStorage.setItem(`sw_onboarded:${email}`, "1"), EMAIL);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const path of process.argv.slice(2)) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const file = `${DIR}/${path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home"}-${label}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${label} ${page.url().replace(BASE, "")} -> ${file}`);
  }
  if (errors.length) console.log(`${label} console errors:\n  ${[...new Set(errors)].join("\n  ")}`);
  await ctx.close();
}
await browser.close();

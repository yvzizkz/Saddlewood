// 0052: the six oldest tables (the Ops board and the progress trackers) give
// the browser's keys nothing, like every later table. The pages that use
// them read with the server key and keep working. Local database only.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const asRole = (role: string, q: string) => {
  try {
    return execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -qAtc ${JSON.stringify(`set role ${role}; ${q}`)}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr ?? e);
  }
};
const TABLES = ["ops_cards", "ops_card_events", "ops_card_comments", "ops_goals", "progress_trackers", "progress_tracker_invoices"];

test.describe("Old tables: no grants to the browser's keys", () => {
  test("anon and authenticated are refused, even TRUNCATE; the Ops board and trackers still load", async ({ owner: page }) => {
    for (const t of TABLES) {
      for (const role of ["anon", "authenticated"]) {
        expect(asRole(role, `select count(*) from public.${t}`), `${role} select ${t}`).toMatch(/permission denied/);
        // RLS does not cover TRUNCATE; only the grant stops it. Inside a rolled-back transaction in case it ever passes.
        expect(asRole(role, `begin; truncate public.${t} cascade; rollback;`), `${role} truncate ${t}`).toMatch(/permission denied/);
      }
    }
    expect(asRole("service_role", "select count(*) >= 0 from public.ops_cards")).toMatch(/t$/);

    const ops = await page.goto("/internal/ops");
    expect(ops?.status()).toBe(200);
    const trackers = await page.goto("/internal/trackers");
    expect(trackers?.status()).toBe(200);
    const res = await page.request.get("/api/ops/cards");
    expect(res.status()).toBe(200);
  });
});

// The old /internal/leads page moved into the Sales inbox: the same call list
// from the Mac, a caller marked called / texted / dismissed, and "Sync
// GoHighLevel" asking the office Mac. The list and its marks are seeded in
// this worktree's local database only, and put back after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -Atc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

function lead(phone: string, name: string, age: number) {
  return {
    phone, display: phone, named: true, name, unread: 1, last: "", last_ts: null, age_days: age, tags: ["Kitchen"], opps: 0,
    fanout: false, tollfree: false, score: 1, snippet: "Wants a quote", kb: null, dial_url: `tel:${phone}`, suggested_sms: "", sms_url: "",
  };
}

test.describe("Sales inbox: the call list that was /internal/leads", () => {
  test("Mark a caller, dismiss one, see the backlog, and sync GoHighLevel", async ({ owner: page }) => {
    const uid = Date.now().toString().slice(-6);
    const fresh = lead(`480555${uid.slice(-4)}`, `E2E Fresh ${uid}`, 0);
    const old = lead(`602555${uid.slice(-4)}`, `E2E Backlog ${uid}`, 25);
    const gone = lead(`623555${uid.slice(-4)}`, `E2E Gone ${uid}`, 1);
    const state = { generated: new Date().toISOString(), total_waiting: 3, fresh: 2, backlog: 1, backlog_with_history: 0, with_history: 0, named: 3, fresh_list: [fresh, gone], backlog_list: [old], gone_quiet: [], gone_quiet_total: 0 };
    const keep = sql("select coalesce(json_agg(json_build_object('key', key, 'data', data)), '[]') from public.bot_state where key in ('leads', 'leads_status')");
    const actionsBefore = Number(sql("select coalesce(max(id), 0) from public.bot_actions"));
    sql(`insert into public.bot_state (key, data, updated_at) values ('leads', '${JSON.stringify(state)}'::jsonb, now()), ('leads_status', '{}'::jsonb, now()) on conflict (key) do update set data = excluded.data, updated_at = now()`);
    try {
      // The old page sends people here.
      await page.goto("/internal/leads");
      await expect(page).toHaveURL(/\/app\/sales$/);

      const inbox = page.locator("section").filter({ has: page.getByRole("heading", { name: /Not tracked yet/ }) });
      await expect(inbox.getByText(/Call list pulled/)).toBeVisible();
      // Three callers, so all three show without "Show all".
      await expect(inbox.getByText(fresh.name, { exact: true })).toBeVisible();
      await expect(inbox.getByText(old.name, { exact: true }), "the backlog is in the inbox too").toBeVisible();

      // Mark the fresh caller called: the mark shows and is stored.
      await inbox.getByRole("button", { name: `${fresh.name}: mark called, texted or dismissed` }).click();
      await inbox.getByRole("button", { name: "Called", exact: true }).click();
      // The actions close and the row carries the mark.
      await expect(inbox.getByRole("button", { name: "Called", exact: true })).toHaveCount(0);
      await expect(inbox.getByRole("button", { name: `${fresh.name}: mark called, texted or dismissed` })).toContainText("Called");
      await expect.poll(() => sql(`select data->>'${fresh.phone}' from public.bot_state where key = 'leads_status'`)).toBe("called");

      // Dismiss one: it drops out of the inbox.
      await inbox.getByRole("button", { name: `${gone.name}: mark called, texted or dismissed` }).click();
      await inbox.getByRole("button", { name: "Dismiss", exact: true }).click();
      await expect(inbox.getByText(gone.name, { exact: true })).toHaveCount(0);

      // Sync asks the Mac (a leads.sync tap); when the Mac answers, the page says so.
      await inbox.getByRole("button", { name: "Sync GoHighLevel" }).click();
      await expect(inbox.getByText(/Asking the office Mac|The Mac is pulling/)).toBeVisible();
      await expect.poll(() => sql(`select count(*) from public.bot_actions where id > ${actionsBefore} and kind = 'leads.sync'`)).toBe("1");
      sql(`update public.bot_actions set status = 'done', result = 'E2E synced ${uid}' where id > ${actionsBefore} and kind = 'leads.sync'`);
      await expect(page.getByText(`E2E synced ${uid}`)).toBeVisible({ timeout: 10_000 });
      await expect(inbox.getByRole("button", { name: "Sync GoHighLevel" })).toBeEnabled();
    } finally {
      sql(`delete from public.bot_actions where id > ${actionsBefore} and kind = 'leads.sync'`);
      sql("delete from public.bot_state where key in ('leads', 'leads_status')");
      const rows = JSON.parse(keep) as { key: string; data: unknown }[];
      for (const r of rows) sql(`insert into public.bot_state (key, data, updated_at) values ('${r.key}', '${JSON.stringify(r.data).replace(/'/g, "''")}'::jsonb, now())`);
    }
  });
});

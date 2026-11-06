// The January move: a job that started before the app gets its schedule of
// values from its progress tracker or a spreadsheet, each line with what's
// billed to the penny, and its next draw runs in the app from there.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("Bringing in a schedule", () => {
  test("fills from the tracker, keeps billed to the penny, and the next draw bills only what moved", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-8);
    const prefix = `55${n}`;
    const client = sql("select id from public.clients order by id limit 1");
    const job = sql(`insert into public.jobs (name, number_prefix, client_id) values ('E2E schedule ${n}', '${prefix}', '${client}') returning id`).split("\n")[0];
    const line = (id: string, name: string, contract: number, changeOrder: number, completedPrior: number, thisInvoice: number, draw: number) => ({ id, name, contract, changeOrder, completedPrior, thisInvoice, draw, tbd: false, note: "" });
    const state = {
      schemaVersion: 1,
      project: { name: `E2E ${n}`, contractor: "Saddlewood", owners: "E2E", address: "" },
      invoice: { number: `${prefix}-13`, date: "2026-11-04", status: "issued" },
      payments: [],
      lines: [line("kitchen", "Kitchen", 89512, 0, 69000, 0, 0), line("fireplaces", "Fireplaces", 28087, 0, 0, 0, 15000), line("primary-bath", "Primary bath", 62055, 0, 46000, 5000, 0), line("attic", "Attic", 0, 0, 0, 0, 0)],
      pendingChangeOrders: [],
      notes: { mode: "auto", text: "" },
      meta: { updatedAt: "2026-11-04T00:00:00Z", updatedBy: "E2E" },
    };
    sql(`insert into public.progress_trackers (id, project_name, invoice_number, state) values ('e2e-${n}', 'E2E ${n}', '${prefix}-13', '${JSON.stringify(state)}'::jsonb)`);
    try {
      await page.goto(`/app/jobs/${job}?tab=money`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Bring in a schedule" }).click();
      const entry = page.getByRole("region", { name: "Bring in a schedule" });
      await entry.getByRole("button", { name: `Fill from E2E ${n} tracker #${prefix}-13` }).click();
      await expect(entry).toContainText("3 lines: $179,654.00 scheduled, $135,000.00 billed");

      // Billed past a line is stopped before it reaches the server.
      const lines = entry.getByLabel("Lines");
      const filled = await lines.inputValue();
      await lines.fill(filled.replace("69000.00", "99000.00"));
      await expect(entry.getByRole("alert")).toContainText("Kitchen: billed has to be between");
      await expect(entry.getByRole("button", { name: "Save the schedule" })).toBeDisabled();
      await lines.fill(filled);
      await entry.getByRole("button", { name: "Save the schedule" }).click();

      const billing = page.getByRole("region", { name: "Progress billing" });
      await expect(billing).toContainText("Kitchen");
      expect(sql(`select count(*) from public.sov_lines where job_id = '${job}'`)).toBe("3");

      // Nothing moved, so nothing bills, even though $69,000 of $89,512 isn't a round percent.
      const api = `/api/jobs/${job}/progress`;
      const state2 = await (await page.request.get(api)).json();
      const key = (name: string) => state2.lines.find((l: { description: string }) => l.description === name).key;
      expect(state2.openingCents).toBe(13_500_000);
      expect((await (await page.request.post(api, { data: { action: "preview", pcts: {} } })).json()).draw.grossCents).toBe(0);

      // Percents can't stand in for it: the button's gone, and a direct call leaves the cents alone.
      await expect(billing.getByRole("button", { name: "Change the schedule" })).toBeVisible();
      await expect(billing.getByRole("button", { name: "Billed before the app?" })).toHaveCount(0);
      const opening = await page.request.post(api, { data: { action: "opening", pcts: { [key("Kitchen")]: 10 } } });
      expect(opening.status()).toBe(409);
      expect((await opening.json()).error).toContain("Change the schedule");
      expect((await (await page.request.get(api)).json()).openingCents).toBe(13_500_000);

      // Kitchen to 100%: the rest of the line, to the penny.
      const made = await (await page.request.post(api, { data: { action: "draw", pcts: { [key("Kitchen")]: 100 } } })).json();
      expect(made).toMatchObject({ ok: true, dueCents: 2_051_200 });

      // With a draw on it, the schedule can't be replaced.
      const again = await page.request.post(api, { data: { action: "schedule", lines: [{ description: "X", amountCents: 100, billedCents: 0 }] } });
      expect(again.status()).toBe(409);
    } finally {
      sql(`begin; set local session_replication_role = replica; delete from public.progress_trackers where id = 'e2e-${n}'; delete from public.sov_progress where job_id = '${job}'; delete from public.documents where job_id = '${job}'; delete from public.sov_lines where job_id = '${job}'; delete from public.jobs where id = '${job}'; commit;`);
    }
  });

  test("a draft tracker's amounts stay to bill, and a signed change order is called before it can count twice", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-8);
    const prefix = `56${n}`;
    const client = sql("select id from public.clients order by id limit 1");
    const job = sql(`insert into public.jobs (name, number_prefix, client_id) values ('E2E draft ${n}', '${prefix}', '${client}') returning id`).split("\n")[0];
    const state = {
      schemaVersion: 1,
      project: { name: `E2E ${n}`, contractor: "Saddlewood", owners: "E2E", address: "" },
      invoice: { number: `${prefix}-14`, date: "2026-11-04", status: "draft" },
      payments: [],
      lines: [{ id: "deck", name: "Rear deck", contract: 0, changeOrder: 40000, completedPrior: 10000, thisInvoice: 5000, draw: 0, tbd: false, note: "" }],
      pendingChangeOrders: [],
      notes: { mode: "auto", text: "" },
      meta: { updatedAt: "2026-11-04T00:00:00Z", updatedBy: "E2E" },
    };
    sql(`insert into public.progress_trackers (id, project_name, invoice_number, state) values ('e2e-d${n}', 'E2E ${n}', '${prefix}-14', '${JSON.stringify(state)}'::jsonb)`);
    const api = `/api/jobs/${job}/progress`;
    const co = async (title: string) => {
      const { id } = await (await page.request.post("/api/change-orders", { data: { job, title } })).json();
      expect((await page.request.patch("/api/change-orders", { data: { id, status: "priced", amountCents: 4_000_000 } })).ok()).toBeTruthy();
      expect((await page.request.patch("/api/change-orders", { data: { id, status: "signed" } })).ok()).toBeTruthy();
      return id as number;
    };
    try {
      const netted = await co(`E2E deck ${n}`);
      const separate = await co(`E2E pergola ${n}`);

      await page.goto(`/app/jobs/${job}?tab=money`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Change the schedule" }).click();
      const entry = page.getByRole("region", { name: "Bring in a schedule" });
      await expect(entry).toContainText("is still a draft");
      await entry.getByRole("button", { name: `Fill from E2E ${n} tracker #${prefix}-14` }).click();
      await expect(entry).toContainText("1 lines: $40,000.00 scheduled, $10,000.00 billed");
      await expect(entry.getByRole("button", { name: "Save the schedule" })).toBeDisabled();

      // Not called, the server won't take it either.
      const line = { description: "Rear deck", amountCents: 4_000_000, billedCents: 1_000_000 };
      const refused = await page.request.post(api, { data: { action: "schedule", lines: [line] } });
      expect(refused.status()).toBe(409);
      expect((await refused.json()).error).toContain("already in these lines");

      await entry.getByLabel(new RegExp(`E2E deck ${n}`)).selectOption("true");
      await entry.getByLabel(new RegExp(`E2E pergola ${n}`)).selectOption("false");
      await entry.getByRole("button", { name: "Save the schedule" }).click();
      await expect(page.getByRole("region", { name: "Progress billing" })).toContainText("Rear deck");

      // The deck is the line now, once. The pergola keeps its own line, and the contract is the two.
      const after = await (await page.request.get(api)).json();
      expect(after.lines.map((l: { description: string }) => l.description)).toEqual(["Rear deck", expect.stringContaining("E2E pergola")]);
      expect(after.lines.reduce((a: number, l: { scheduledCents: number }) => a + l.scheduledCents, 0)).toBe(8_000_000);
      expect(sql(`select status from public.change_orders where id = ${netted}`)).toBe("billed");
      expect(sql(`select status from public.change_orders where id = ${separate}`)).toBe("signed");

      // The draft's $5,000 wasn't billed, so the next draw bills it: to 37.5% of $40,000 is $15,000 to date.
      const deck = after.lines[0];
      expect(deck.billedToDateCents).toBe(1_000_000);
      const made = await (await page.request.post(api, { data: { action: "draw", pcts: { [deck.key]: 37.5 } } })).json();
      expect(made).toMatchObject({ ok: true, dueCents: 500_000 });
    } finally {
      sql(`begin; set local session_replication_role = replica; delete from public.progress_trackers where id = 'e2e-d${n}'; delete from public.change_order_events where change_order_id in (select id from public.change_orders where job_id = '${job}'); delete from public.joist_jobs where change_order_id in (select id from public.change_orders where job_id = '${job}'); delete from public.change_orders where job_id = '${job}'; delete from public.sov_progress where job_id = '${job}'; delete from public.documents where job_id = '${job}'; delete from public.sov_lines where job_id = '${job}'; delete from public.jobs where id = '${job}'; commit;`);
    }
  });
});

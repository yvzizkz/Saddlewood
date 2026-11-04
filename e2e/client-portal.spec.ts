// The client's link (docs/SCENARIOS.md): an owner makes it and turns sections
// on; a client with no sign-in sees only those, never a draft or the crew's
// notes to the office; a complaint lands with the job's PM on the Policies
// clock; a link turned off is dead for good.

import { execSync } from "node:child_process";

import { OWNER, PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

const JOB = "8009-n-ironwood-dr";

test.describe("The client's link", () => {
  test("shares what an owner turned on, takes a complaint, and dies when turned off", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const tag = `E2E portal ${n}`;
    const pmCtx = await browser.newContext();
    await signIn(pmCtx, PM, { crew: true });
    const pm = await pmCtx.newPage();
    const clientCtx = await browser.newContext();
    const client = await clientCtx.newPage();
    const tok = (s: string) => `${s}${n}`.padEnd(32, "0");
    let token = "";
    let jobId = "";
    try {
      // A PM can't make or change one, and doesn't get the card.
      expect((await pm.request.post(`/api/jobs/${JOB}/portal`)).status()).toBe(403);
      await pm.goto(`/app/jobs/${JOB}`, { waitUntil: "networkidle" });
      await expect(pm.getByRole("region", { name: "Client link" })).toHaveCount(0);

      // The owner makes it. It shares nothing yet.
      await page.goto(`/app/jobs/${JOB}`, { waitUntil: "networkidle" });
      const card = page.getByRole("region", { name: "Client link" });
      await card.getByRole("button", { name: "Make a client link" }).click();
      const link = card.getByLabel("The client's link");
      const turnOn = async (name: RegExp) => {
        const saved = page.waitForResponse((r) => r.url().endsWith("/portal") && r.request().method() === "PATCH");
        await card.getByRole("checkbox", { name }).check();
        expect((await saved).status()).toBe(200);
      };
      await expect(link).toHaveValue(/\/c\/[0-9a-f]{32}$/);
      token = (await link.inputValue()).split("/c/")[1];
      jobId = sql(`select job_id from public.client_portals where token = '${token}'`);

      await client.goto(`/c/${token}`);
      await expect(client.getByText("Nothing has been shared here yet.")).toBeVisible();
      await expect(client).toHaveURL(new RegExp(`/c/${token}$`));
      expect((await client.request.post(`/api/c/${token}/complaint`, { data: { name: "A", title: "B" } })).status()).toBe(404);

      // What the job has: one of each thing a client may and may not see.
      const doc = (kind: string, number: string, status: string, t: string | null, extra = "") =>
        sql(`insert into public.documents (kind, job_id, number, title, status, total_cents, token, issued_at, void_reason, voided_at${extra ? ", supersedes" : ""}) values ('${kind}', '${jobId}', '${number}', '${tag}', '${status}', 123400, ${t ? `'${t}'` : "null"}, ${t ? "now()" : "null"}, ${status === "void" ? "'test', now()" : "'', null"}${extra ? `, '${extra}'` : ""}) returning id`);
      const v1 = doc("invoice", `P${n}-OLD`, "issued", tok("a"));
      doc("invoice", `P${n}-NEW`, "issued", tok("b"), v1.split("\n")[0]);
      doc("invoice", `P${n}-DRAFT`, "draft", null);
      doc("invoice", `P${n}-VOID`, "void", tok("c"));
      const co = doc("change_order", `P${n}-CO1`, "issued", tok("d")).split("\n")[0];
      const register = (number: string, status: string, id: string) =>
        sql(`insert into public.change_orders (job_id, number, title, status, amount_cents, document_id, priced_at, signed_on) values ('${jobId}', '${number}', '${tag}', '${status}', 123400, '${id}', now(), ${status === "signed" ? "current_date" : "null"})`);
      register(`P${n}-CO1`, "sent", co);
      register(`P${n}-CO2`, "signed", doc("change_order", `P${n}-CO2`, "issued", tok("e")).split("\n")[0]);
      register(`P${n}-CO3`, "rejected", doc("change_order", `P${n}-CO3`, "issued", tok("f")).split("\n")[0]);
      sql(`insert into public.crew_entries (email, kind, day, job_id, body, data) values ('${PM}', 'eod', (now() at time zone 'America/Phoenix')::date, '${JOB}', E'Hung board in the hall ${n}.\\nASK: who eats the extra sheets ${n}', '{"weather":"Clear","crewCount":4,"stuck":"Waiting on the sub ${n}","asked":"Owner wants a niche ${n}"}')`);

      // Documents on: issued and current only. The rest stays off until asked for.
      await turnOn(/^Documents/);
      await client.reload();
      const docs = client.getByTestId("portal-documents");
      await expect(docs).toContainText(`Invoice P${n}-NEW`);
      await expect(docs).toContainText("$1,234.00");
      await expect(docs.getByRole("listitem").filter({ hasText: `P${n}-CO1` })).toContainText("Needs your approval");
      await expect(docs.getByRole("listitem").filter({ hasText: `P${n}-CO2` })).toContainText("Approved");
      await expect(docs.getByRole("listitem").filter({ hasText: `P${n}-NEW` })).not.toContainText("Needs your approval");
      for (const hidden of ["-OLD", "-DRAFT", "-VOID", "-CO3"]) await expect(docs).not.toContainText(`P${n}${hidden}`);
      await expect(client.getByRole("heading", { name: "Daily log" })).toHaveCount(0);
      await expect(client.getByRole("heading", { name: "Something wrong?" })).toHaveCount(0);

      // A document opens on its own link.
      await docs.getByRole("link", { name: new RegExp(`P${n}-NEW`) }).click();
      await expect(client).toHaveURL(new RegExp(`/d/${tok("b")}$`));

      // Daily log on: the day, the weather and the work. Nothing written to the office.
      await turnOn(/^Daily log/);
      await client.goto(`/c/${token}`);
      const log = client.getByTestId("portal-log");
      await expect(log).toContainText(`Hung board in the hall ${n}.`);
      await expect(log).toContainText("Clear");
      // The raw page too: what's in the HTML or its data reaches the client even if nothing renders it.
      const raw = await client.content();
      for (const hidden of [`who eats the extra sheets ${n}`, `Waiting on the sub ${n}`, `Owner wants a niche ${n}`, PM]) expect(raw).not.toContain(hidden);
      expect(await client.locator("main").innerText()).not.toMatch(/margin|labor|cost to date|payroll/i);

      // A complaint: the same record the office logs, with the job's PM, on the clock.
      await turnOn(/^Complaint form/);
      await client.reload();
      await client.getByLabel("Your name").fill("Pat Homeowner");
      await client.getByLabel("Best phone or email to reach you").fill("480-555-0100");
      await client.getByLabel("What's wrong").fill(`${tag} paint on the floor`);
      await client.getByLabel("Anything else we should know").fill("Master bedroom");
      await client.getByRole("button", { name: "Send it" }).click();
      await expect(client.getByRole("status")).toContainText("You'll hear from us by");

      const row = sql(`select kind || '|' || role || '|' || assignee || '|' || created_by || '|' || (extract(isodow from due_on) < 6 and due_on - (now() at time zone 'America/Phoenix')::date between 1 and 3) from public.work_items where title = '${tag} paint on the floor'`);
      // Due the next business day on the Policies clock: never a weekend, at most three days out. The client is told that same day.
      expect(row).toBe(`complaint|pm|${PM}|client portal|true`);
      const due = sql(`select due_on from public.work_items where title = '${tag} paint on the floor'`);
      const told = new Date(`${due}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      await expect(client.getByRole("status")).toContainText(told);
      expect(sql(`select detail from public.work_items where title = '${tag} paint on the floor'`)).toContain("From Pat Homeowner, on their client link. Reach them at 480-555-0100.");

      await pm.goto("/app/tasks");
      const mine = pm.locator('[data-table="tasks-mine"]');
      await mine.getByRole("searchbox").fill(`${tag} paint on the floor`);
      await expect(mine.getByRole("row").filter({ hasText: tag })).toContainText("Client complaint");

      // Reads on a phone with nothing off the side.
      await client.setViewportSize({ width: 390, height: 844 });
      await client.reload();
      await expect(client.getByTestId("portal-documents")).toBeVisible();
      expect(await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await client.screenshot({ path: "docs/screenshots/client-portal/phone.png", fullPage: true });
      await card.screenshot({ path: "docs/screenshots/client-portal/owner-card.png" });

      // A pasted link can't flood the PM.
      const post = () => client.request.post(`/api/c/${token}/complaint`, { data: { name: "Pat", title: `${tag} again` } });
      for (let i = 0; i < 4; i++) expect((await post()).status()).toBe(200);
      expect((await post()).status()).toBe(429);

      // Turned off: dead, and a new link is a new one.
      await card.getByRole("button", { name: "Turn off this link" }).click();
      await card.getByRole("button", { name: "Yes, turn it off" }).click();
      await expect(card.getByRole("button", { name: "Make a client link" })).toBeVisible();
      await client.goto(`/c/${token}`);
      await expect(client.getByRole("heading", { name: "This link is not active" })).toBeVisible();
      await expect(client.getByText(tag)).toHaveCount(0);
      expect((await post()).status()).toBe(404);
      expect(sql(`select revoked_by from public.client_portals where token = '${token}'`)).toBe(OWNER);

      await card.getByRole("button", { name: "Make a client link" }).click();
      await expect(link).toHaveValue(/\/c\/[0-9a-f]{32}$/);
      expect((await link.inputValue()).split("/c/")[1]).not.toBe(token);
      await client.goto(`/c/${token}`);
      await expect(client.getByRole("heading", { name: "This link is not active" })).toBeVisible();

      // A made-up link says the same thing.
      await client.goto(`/c/${"0".repeat(32)}`);
      await expect(client.getByRole("heading", { name: "This link is not active" })).toBeVisible();
    } finally {
      await pmCtx.close();
      await clientCtx.close();
      if (jobId) {
        sql(`delete from public.work_items where title like '${tag}%'`);
        sql(`delete from public.crew_entries where job_id = '${JOB}' and body like '%${n}%'`);
        sql(`delete from public.change_orders where title = '${tag}'`);
        sql(
          `set session_replication_role = replica; ` +
            `delete from public.document_events where document_id in (select id from public.documents where title = '${tag}'); ` +
            `delete from public.documents where title = '${tag}'`,
        );
        sql(`delete from public.client_portals where job_id = '${jobId}'`);
      }
    }
  });
});

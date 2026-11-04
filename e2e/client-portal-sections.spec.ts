// Timeline and Payments on the client's link (docs/SCENARIOS.md §12): off until
// an owner turns them on, the same totals as the job's money card, no phase
// note or staff email on the page, and nothing at all on a job with nothing to show.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const JOB = "8009-n-ironwood-dr";

test.describe("The client's link: Timeline and Payments", () => {
  test("show what's on file, only when turned on, and nothing on an empty job", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const clientCtx = await browser.newContext();
    const client = await clientCtx.newPage();
    const empty = sql(`insert into public.jobs (name, address) values ('E2E empty ${n}', '${n} Empty Way') returning id`).split("\n")[0];
    const promised = sql(`select coalesce(promised::text, '') from public.crew_jobs where id = '${JOB}'`);
    let jobId = "";
    try {
      const made = await (await page.request.post(`/api/jobs/${JOB}/portal`)).json();
      const token = made.token as string;
      jobId = sql(`select job_id from public.client_portals where token = '${token}'`);
      const show = (job: string, sections: string[]) => page.request.patch(`/api/jobs/${job}/portal`, { data: { sections } });

      sql(`insert into public.crew_job_phases (job_id, ord, name, planned_from, planned_to, note, verified_by) values ('${JOB}', 9000 + 1, 'E2E Stucco ${n}', '2026-12-01', '2026-12-05', 'Rework after failed lath ${n}', 'eli.pm@example.com')`);
      sql(`update public.crew_jobs set promised = '2027-01-15' where id = '${JOB}'`);

      // Off: neither is on the page, though the job has both.
      await client.goto(`/c/${token}`);
      await expect(client.getByText("Nothing has been shared here yet.")).toBeVisible();
      await expect(client.getByTestId("portal-timeline")).toHaveCount(0);
      await expect(client.getByTestId("portal-payments")).toHaveCount(0);

      // The owner's card shows the figures before they go on, and they are the money card's.
      const money = (await (await page.request.get(`/api/crew/projects/money?job=${jobId}`)).json()).money;
      expect(money.billedCents).toBeGreaterThan(0);
      await page.goto(`/app/jobs/${JOB}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("region", { name: "Client link" })).toContainText(`The client will see:`);
      await expect(page.getByRole("region", { name: "Client link" })).toContainText(`Billed ${usd(money.billedCents)}`);

      expect((await show(JOB, ["timeline", "payments"])).status()).toBe(200);
      await client.reload();
      const payments = client.getByTestId("portal-payments");
      for (const [label, cents] of [["Billed", money.billedCents], ["Paid", money.paidCents], ["Open", money.owedCents]] as const) {
        await expect(payments.locator("div").filter({ hasText: label })).toContainText(usd(cents));
      }
      const timeline = client.getByTestId("portal-timeline");
      await expect(timeline).toContainText("Expected finish: Jan 15, 2027");
      await expect(timeline.getByRole("listitem").filter({ hasText: `E2E Stucco ${n}` })).toContainText("Dec 1, 2026 to Dec 5, 2026");

      // The raw page too: what's in the HTML or its data reaches the client even if nothing renders it.
      const raw = await client.content();
      for (const hidden of [`Rework after failed lath ${n}`, "eli.pm@example.com", "fee_cents", "feeCents"]) expect(raw).not.toContain(hidden);

      // Reads on a phone with nothing off the side.
      await client.setViewportSize({ width: 390, height: 844 });
      await client.reload();
      await expect(payments).toBeVisible();
      expect(await client.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await client.screenshot({ path: "docs/screenshots/client-portal/timeline-payments-phone.png", fullPage: true });

      // A job with nothing on file: both on, neither appears, and the card says why.
      const bare = await (await page.request.post(`/api/jobs/${empty}/portal`)).json();
      expect(bare.preview).toEqual({ money: null, timeline: false });
      expect((await show(empty, ["timeline", "payments"])).status()).toBe(200);
      await client.goto(`/c/${bare.token}`);
      await expect(client.getByRole("heading", { name: `E2E empty ${n}` })).toBeVisible();
      await expect(client.getByText("Nothing has been shared here yet.")).toBeVisible();
      await expect(client.getByTestId("portal-payments")).toHaveCount(0);
      expect(await client.locator("main").innerText()).not.toContain("$0");
      await page.goto(`/app/jobs/${empty}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("region", { name: "Client link" })).toContainText("so the client won't see this.");
    } finally {
      await clientCtx.close();
      sql(`delete from public.crew_job_phases where job_id = '${JOB}' and name = 'E2E Stucco ${n}'`);
      sql(`update public.crew_jobs set promised = ${promised ? `'${promised}'` : "null"} where id = '${JOB}'`);
      sql(`delete from public.client_portals where job_id in ('${empty}'${jobId ? `, '${jobId}'` : ""})`);
      sql(`delete from public.jobs where id = '${empty}'`);
    }
  });
});

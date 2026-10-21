// The job money card after #37 met the redesign stack: one card shows the
// stack's money (contract, billed, paid, owed, past-due invoices an owner can
// open) and #37's year from Joist and Buildertrend (0050). The history row is
// seeded on this worktree's local database only, and put back after.

import { execSync } from "node:child_process";

import { expect, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -Atc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("Job money card: the stack's money and this year from Joist and Buildertrend", () => {
  test("A job card shows Money with its figures and the year-to-date history block", async ({ owner: page }) => {
    // A field job with a billing job behind it, so the card has money as well as history.
    const [billingId, name, crewId] = sql("select j.id, cj.name, cj.id from public.jobs j join public.crew_jobs cj on cj.id = j.crew_job_id where cj.active order by cj.name limit 1").split("|");
    expect(crewId, "a linked field job in the local data").toBeTruthy();
    const before = sql(`select summary::text || '|' || as_of from public.job_history where crew_job_id = '${crewId}'`);
    const summary = {
      year: 2026,
      joist: {
        asOf: "2026-10-20",
        paidCents: 7_500_000,
        payments: 3,
        lastPaidOn: "2026-10-09",
        estimates: { count: 2, cents: 4_210_700 },
        approved: { count: 1, cents: 1_988_186 },
        changeOrders: { count: 2, cents: 3_728_186 },
        invoices: 1,
        docs: [{ kind: "invoice", number: "E2E-INV-1", title: "", date: "2026-09-30", totalCents: 1_000_000, paidCents: 500_000, status: "partial" }],
      },
      labor: { source: "buildertrend", asOf: "2026-10-20", jobToDate: true, hours: 812, people: [{ name: "Omar", hours: 412 }] },
      notes: [],
    };
    sql(
      `insert into public.job_history (crew_job_id, summary, as_of) values ('${crewId}', '${JSON.stringify(summary)}'::jsonb, now()) on conflict (crew_job_id) do update set summary = excluded.summary, as_of = excluded.as_of`,
    );
    try {
      const api = await (await page.request.get(`/api/crew/projects/money?job=${billingId}`)).json();
      expect(api).toMatchObject({ ok: true, crewJobId: crewId, canOpen: true, history: { year: 2026, joist: { paidCents: 7_500_000 } } });
      expect(api.money).toBeTruthy();

      await page.goto("/app/projects");
      const card = page.locator("div").filter({ has: page.getByRole("heading", { name, exact: true }) }).filter({ hasText: "so far · Joist and Buildertrend" }).last();
      // The stack's money figures.
      await expect(card.getByText("Money", { exact: true })).toBeVisible();
      for (const label of ["Contract", "Billed", "Paid", "Owed"]) await expect(card.locator("dt", { hasText: new RegExp(`^${label}$`) }).first()).toBeVisible();
      // An owner can open each past-due invoice (the stack's canOpen).
      const late = (api.money.open as { daysLate: number | null; documentId?: string | null; number: string }[]).find((o) => (o.daysLate ?? 0) >= 1 && o.documentId);
      if (late) await expect(card.getByRole("link", { name: late.number })).toHaveAttribute("href", `/app/money/${late.documentId}`);
      // #37's year from Joist and Buildertrend.
      await expect(card.getByText("2026 so far · Joist and Buildertrend")).toBeVisible();
      await expect(card).toContainText("$75,000.00");
      await expect(card).toContainText("Crew hours, job to date");
      await card.getByRole("button", { name: /Show the 1 Joist document/ }).click();
      await expect(card).toContainText("E2E-INV-1");
      await expect(card).toContainText("Not part of Billed or Paid above.");
    } finally {
      if (before) {
        const cut = before.lastIndexOf("|");
        sql(`update public.job_history set summary = '${before.slice(0, cut).replace(/'/g, "''")}'::jsonb, as_of = '${before.slice(cut + 1)}' where crew_job_id = '${crewId}'`);
      } else {
        sql(`delete from public.job_history where crew_job_id = '${crewId}'`);
      }
    }
  });
});

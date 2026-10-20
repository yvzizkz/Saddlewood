// Owner: Marco's week (docs/SCENARIOS.md §2), run as a local owner seat.
// Decisions and COs on the owner's department, a seat change that moves the
// work, a task handed out and moved up when overdue, and the job page agreeing
// with Accounting. Local stack only (support/env.ts).

import { cents, expect, test } from "./support/env";

const JOB = "8009-n-ironwood-dr";
const JOB_BILLING = "b0000001-0000-4000-8000-000000008009";

async function tile(page: import("@playwright/test").Page, label: string): Promise<number> {
  const card = page.locator("dl > div").filter({ has: page.locator("dt", { hasText: label }) });
  return Number((await card.locator("dd").first().textContent())?.replace(/[^0-9]/g, "") || "0");
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
}

test.describe("Owner: the owner's week", () => {
  test("the owner's department counts COs to price, and pricing one from the job page takes it off", async ({ owner: page }) => {
    await page.goto("/app/departments/decisions");
    const before = await tile(page, "Change orders to price");
    const title = `E2E valve move ${Date.now()}`;
    const made = await page.request.post("/api/change-orders", { data: { job: "9146-w-hutton-dr", title, source: "tm" } });
    expect(made.ok()).toBeTruthy();

    await page.reload();
    expect(await tile(page, "Change orders to price")).toBe(before + 1);

    await page.goto("/app/jobs/9146-w-hutton-dr?tab=changes");
    const row = page.getByRole("listitem").filter({ hasText: title });
    await row.getByPlaceholder("$ price").fill("2250");
    await row.getByRole("button", { name: "Price it" }).click();
    await expect(row).toContainText("Priced, not sent");

    await page.goto("/app/departments/decisions");
    expect(await tile(page, "Change orders to price")).toBe(before);
    // Close it out so reruns start clean.
    await page.goto("/app/jobs/9146-w-hutton-dr?tab=changes");
    await page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Signed" }).click();
    await page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Billed" }).click();
  });

  test("moving Finance's seat moves Finance's work, and moving it back returns it", async ({ owner: page }) => {
    const seat = async (holder: string) => {
      await page.goto("/app/policies/rights");
      const card = page.locator("div").filter({ has: page.getByText("Finance and admin", { exact: true }) }).filter({ has: page.getByLabel("Held by") }).last();
      await card.getByLabel("Held by").fill(holder);
      await card.getByRole("button", { name: "Save" }).click();
      await expect(card.getByText("Saved")).toBeVisible();
    };
    try {
      await seat("Lando");
      await page.goto("/app/departments/finance");
      await expect(page.getByText(/held by\s*Lando/)).toBeVisible();
      await page.goto("/app/tasks");
      await expect(page.locator('[data-table="tasks-mine"]').getByRole("row").filter({ hasText: "Invoice package for" }).first()).toBeVisible();
    } finally {
      await seat("Ilene");
    }
    await page.goto("/app/departments/finance");
    await expect(page.getByText(/held by\s*Ilene/)).toBeVisible();
  });

  test("a task handed to the PM shows on the job, moves up to the owner when overdue, and closes", async ({ owner: page }) => {
    const title = `E2E pre-cover photos ${Date.now()}`;
    const res = await page.request.post("/api/tasks", { data: { title, role: "pm", kind: "punch", job: JOB, dueOn: daysAgo(5) } });
    expect(res.ok()).toBeTruthy();
    const { id } = await res.json();

    await page.goto(`/app/jobs/${JOB}?tab=tasks`);
    await expect(page.locator(`[data-table="${JOB}-tasks"]`).getByRole("row").filter({ hasText: title })).toBeVisible();

    await page.goto("/app/departments/decisions");
    const row = page.locator('[data-table="department-decisions"]').getByRole("row").filter({ hasText: title });
    await expect(row).toContainText("from Project manager");

    expect((await page.request.patch("/api/tasks", { data: { id, status: "done" } })).ok()).toBeTruthy();
    await page.goto(`/app/jobs/${JOB}?tab=tasks`);
    await expect(page.locator(`[data-table="${JOB}-tasks"]`).getByRole("row").filter({ hasText: title })).toHaveCount(0);
  });

  test("a task created on Tasks for a role the owner holds can be closed from Tasks", async ({ owner: page }) => {
    const title = `E2E check the bot ${Date.now()}`;
    await page.goto("/app/tasks");
    await page.getByRole("button", { name: "New task" }).click();
    await page.getByLabel("What needs doing").fill(title);
    await page.getByLabel("Goes to").selectOption("ops");
    await page.getByRole("button", { name: "Save" }).click();
    const mine = page.getByRole("listitem").filter({ hasText: title });
    await expect(mine).toBeVisible();
    await mine.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
  });

  test("the job page's money agrees with Accounting", async ({ owner: page }) => {
    await page.goto(`/app/jobs/${JOB}`);
    const openTile = page.locator("a").filter({ has: page.getByText("Open", { exact: true }) }).first();
    const jobOpen = cents(await openTile.locator("p").nth(1).textContent());
    await page.goto(`/app/accounting/receivables?job=${JOB_BILLING}`);
    const arOpen = cents(await page.locator('[data-kpi="value"]').textContent());
    expect(jobOpen).not.toBeNull();
    expect(jobOpen).toBe(arOpen);
  });
});

// PM writes on the Schedule (docs/COHESIVE-APP-PLAN.md Phase 2 step 3): the
// synthetic PM opens the Schedule on his own jobs, puts an inspection on one
// for the field lead, and closes it; another job, a seat above his, and the
// company's pay runs stay the owners'. Local stack only (support/env.ts).

import { addDays, localDay } from "../src/lib/crew/time";
import { expect, PM, signIn, test as base } from "./support/env";

const test = base.extend<{ pm: import("@playwright/test").Page }>({
  pm: async ({ context, page }, provide) => {
    await signIn(context, PM, { crew: true });
    await provide(page);
  },
});

const HIS = "9146-w-hutton-dr";
const NOT_HIS = "4125-e-camelback-rd";

test.describe("PM on the Schedule: his jobs, his seat and the field's", () => {
  test("opens the Schedule on his jobs only, without pay runs or company dates", async ({ pm: page }) => {
    const res = await page.goto("/app/schedule?view=week");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/app/schedule");
    await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
    await expect(page.getByRole("link", { name: "9146 W Hutton Dr" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /4125 E Camelback/ })).toHaveCount(0);
    await expect(page.getByText("Billing, Pay Runs & Compliance")).toHaveCount(0);
    await expect(page.getByText("Company 30/90-day goals")).toHaveCount(0);
  });

  test("puts an inspection on his job for the field lead, sees it, and marks it done", async ({ pm: page }) => {
    const day = addDays(localDay(), 30);
    const title = `PM framing inspection ${Date.now().toString().slice(-6)} (Synth)`;
    const add = await page.request.post("/api/schedule", { data: { kind: "inspection", title, startDay: day, role: "field_lead", job: HIS } });
    expect(add.ok(), await add.text()).toBeTruthy();
    const id = (await add.json()).id as number;
    expect(id).toBeGreaterThan(0);

    try {
      // The job page's Schedule tab writes too: the add button and his item's status.
      await page.goto(`/app/jobs/${HIS}?tab=schedule`);
      await expect(page.getByRole("button", { name: "Add inspection, delivery or site visit" })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "Done" })).toBeVisible();

      // He marks it done on the Schedule's My day.
      await page.goto(`/app/schedule?view=day&day=${day}`);
      const row = page.getByRole("listitem").filter({ hasText: title }).first();
      await row.getByRole("button", { name: "Done" }).click();
      await expect(row.getByRole("button", { name: "Reopen" })).toBeVisible();
      await expect(page.locator("[data-table] tbody tr").filter({ hasText: title }).first()).toContainText("Done");
    } finally {
      // Schedule items stay as history; cancel it so repeated runs leave nothing open.
      await page.request.patch("/api/schedule", { data: { id, status: "cancelled" } });
    }
  });

  test("cannot schedule on another job, company-wide, or for a seat above his", async ({ pm: page }) => {
    const day = addDays(localDay(), 30);
    const base = { kind: "inspection", title: "Not his (Synth)", startDay: day };
    expect((await page.request.post("/api/schedule", { data: { ...base, role: "pm", job: NOT_HIS } })).status()).toBe(404);
    expect((await page.request.post("/api/schedule", { data: { ...base, role: "pm" } })).status()).toBe(404);
    expect((await page.request.post("/api/schedule", { data: { ...base, role: "finance", job: HIS } })).status()).toBe(403);
  });
});

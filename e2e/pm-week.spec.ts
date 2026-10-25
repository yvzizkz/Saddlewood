import { expect, test as base, type Page } from "@playwright/test";

import { OWNER, PM, signIn } from "./support/env";

// Scenario 9 (docs/SCENARIOS.md): Eli (project manager) runs his week from the
// job list, his job pages, and his scoped task list — without seeing labor
// dollars, margin, sub bills, invoice draw creation, or unassigned jobs.

const test = base.extend<{ pmPage: Page }>({
  pmPage: async ({ browser }, provide) => {
    const context = await browser.newContext();
    await signIn(context, PM, { crew: true });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

test.describe("PM week: Eli's jobs, tabs, change requests, and tasks", () => {
  test("reaches My jobs and Tasks from crew More, lists only Eli's assigned jobs without cost/margin columns, and 404s on an unassigned job", async ({
    pmPage: page,
  }) => {
    await page.goto("/app/more", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "My jobs", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tasks on my jobs" })).toBeVisible();
    await page.getByRole("link", { name: "My jobs", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/jobs$/);

    await expect(page.getByText("Materials on jobs")).toBeVisible();
    await expect(page.getByText("Margin", { exact: true })).toHaveCount(0);

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table).toContainText("8009 N Ironwood Dr");
    await expect(table).toContainText("9146 W Hutton Dr");
    await expect(table).toContainText("3526 Emerson Street");
    await expect(table).not.toContainText("4125 E Camelback Rd");

    const unassigned = await page.goto("/app/jobs/4125-e-camelback-rd", {
      waitUntil: "domcontentloaded",
    });
    expect(unassigned?.status()).toBe(404);
  });

  test("opens an assigned job across tabs without cost/margin/sub-bills/draw controls and records a field change request", async ({
    pmPage: page,
    browser,
  }) => {
    for (const tab of ["overview", "schedule", "money", "labor", "subs", "log"] as const) {
      const res = await page.goto(`/app/jobs/8009-n-ironwood-dr?tab=${tab}`, {
        waitUntil: "domcontentloaded",
      });
      expect(res?.status(), `tab=${tab}`).toBe(200);
      await expect(page.getByRole("heading", { name: /8009 N Ironwood Dr/ })).toBeVisible();
      await expect(page.getByText("Labor cost", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Margin", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Sub and vendor bills")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Make the draft invoice" })).toHaveCount(0);
      await expect(page.locator('a[href^="/app/accounting/payables"]')).toHaveCount(0);
      if (tab === "schedule") {
        await expect(page.locator('a[href^="/app/subs/bids"]')).toHaveCount(0);
        // He opens the Schedule on his jobs and writes on it (e2e/pm-schedule.spec.ts).
        await expect(page.getByRole("link", { name: "Open in Schedule" })).toBeVisible();
      }
    }

    // Record a change request on ?tab=changes; PM cannot price or sign it.
    const coTitle = `PM field extra — header furring ${Date.now()}`;
    let createdCoId: number | null = null;
    try {
      await page.goto("/app/jobs/8009-n-ironwood-dr?tab=changes", {
        waitUntil: "domcontentloaded",
      });
      await page.getByRole("button", { name: "Record a change" }).click();

      const waitCreate = page.waitForResponse(
        (r) => r.url().includes("/api/change-orders") && r.request().method() === "POST",
      );
      await page.getByLabel("What changed").fill(coTitle);
      await page.getByLabel("Details").fill("GC superintendent asked to fur out north header 1.5 in.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const createRes = await waitCreate;
      expect(createRes.status()).toBe(200);
      const createBody = (await createRes.json()) as { ok: boolean; id: number };
      expect(createBody.ok).toBe(true);
      createdCoId = createBody.id;

      const coTable = page.getByRole("table");
      await expect(coTable).toContainText(coTitle);
      await expect(coTable).toContainText("Awaiting price");
      await expect(page.getByRole("button", { name: "Price it" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Signed" })).toHaveCount(0);

      // API enforces owner-only pricing and job-scope on change orders.
      const patchRes = await page.request.patch("/api/change-orders", {
        data: { id: createdCoId, status: "priced", amountCents: 45000 },
      });
      expect(patchRes.status()).toBe(403);

      const offJobRes = await page.request.post("/api/change-orders", {
        data: { job: "4125-e-camelback-rd", title: "Should 404" },
      });
      expect(offJobRes.status()).toBe(404);
    } finally {
      if (createdCoId !== null) {
        const ownerCtx = await browser.newContext();
        await signIn(ownerCtx, OWNER);
        await ownerCtx.request.patch("/api/change-orders", {
          data: { id: createdCoId, status: "void" },
        });
        await ownerCtx.close();
      }
    }
  });

  test("hands a task to the field lead on an assigned job, sees it in Tasks (Mine / My jobs), and closes it", async ({
    pmPage: page,
  }) => {
    await page.goto("/app/jobs/8009-n-ironwood-dr?tab=tasks", {
      waitUntil: "domcontentloaded",
    });
    // A click before hydration opens nothing (a cold compile): click until the form shows.
    const roleSelect = page.getByLabel("Goes to");
    await expect(async () => {
      if (!(await roleSelect.isVisible())) await page.getByRole("button", { name: "New task" }).click();
      await expect(roleSelect).toBeVisible({ timeout: 1_000 });
    }).toPass();
    const roleValues = await roleSelect.locator("option").evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value),
    );
    expect(roleValues).toEqual(["pm", "field_lead"]);

    const taskTitle = `Check rough window bucks on north wall ${Date.now()}`;
    let taskId: number | null = null;
    try {
      const waitPost = page.waitForResponse(
        (r) => r.url().includes("/api/tasks") && r.request().method() === "POST",
      );
      await page.getByLabel("What needs doing").fill(taskTitle);
      await roleSelect.selectOption("field_lead");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const postRes = await waitPost;
      expect(postRes.status()).toBe(200);
      const postJson = (await postRes.json()) as { ok: boolean; id: number };
      expect(postJson.ok).toBe(true);
      taskId = postJson.id;

      await expect(page.locator('[data-table="8009-n-ironwood-dr-tasks"]')).toContainText(taskTitle);
      const handedCard = page.locator("div").filter({ hasText: "Handed out on this job" }).first();
      await expect(handedCard).toContainText(taskTitle);

      // API refuses handing tasks to finance (403) or on an unassigned job (404).
      const finRes = await page.request.post("/api/tasks", {
        data: { title: "Not allowed", role: "finance", job: "8009-n-ironwood-dr" },
      });
      expect(finRes.status()).toBe(403);

      const offJobRes = await page.request.post("/api/tasks", {
        data: { title: "Off job", role: "pm", job: "4125-e-camelback-rd" },
      });
      expect(offJobRes.status()).toBe(404);

      // Open /app/tasks: toggle is Mine / My jobs; task is visible and can be closed.
      await page.goto("/app/tasks", { waitUntil: "domcontentloaded" });
      const whose = page.getByRole("group", { name: "Whose" });
      await expect(whose.getByRole("link", { name: /^Mine \(/ })).toBeVisible();
      await expect(whose.getByRole("link", { name: /^My jobs \(/ })).toBeVisible();
      await expect(whose.getByRole("link", { name: /Everyone/ })).toHaveCount(0);

      await expect(page.getByRole("row").filter({ hasText: taskTitle })).toHaveCount(1);

      const handoffRow = page.locator("li", { hasText: taskTitle }).first();
      await expect(handoffRow).toBeVisible();
      const waitDone = page.waitForResponse(
        (r) => r.url().includes("/api/tasks") && r.request().method() === "PATCH",
      );
      await handoffRow.getByRole("button", { name: "Done" }).click();
      expect((await waitDone).status()).toBe(200);
      taskId = null;

      await expect(page.locator("li", { hasText: taskTitle })).toHaveCount(0);
      await expect(page.getByRole("row").filter({ hasText: taskTitle })).toHaveCount(0);
    } finally {
      if (taskId !== null) {
        await page.request.patch("/api/tasks", { data: { id: taskId, status: "dropped" } });
      }
    }
  });
});

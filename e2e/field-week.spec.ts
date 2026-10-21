// Field and crew: a real week on the jobs (docs/SCENARIOS.md §4).
// Hours by trade, unified schedule + Wednesday 2-week GC look-ahead + will-call
// delivery, field receipt normalizing into Purchases (reimbursed through the bot),
// 6 PM EOD daily log directive flowing into Changes & Owner decisions, and
// pre-cover quality checklists gating phase verification + punch list closeout.

import { expect, hours, test } from "./support/env";

const JOB = "9146-w-hutton-dr";

test.describe("Field and crew: the field week", () => {
  test("Job labor hours by trade agree between the job Labor tab and Accounting › Payroll", async ({ owner: page }) => {
    await page.goto(`/app/jobs/${JOB}?tab=labor&p=mtd`);
    const jobHours = hours(await page.locator('[data-kpi="value"]').textContent());
    const tableHours = hours(await page.locator(`[data-table="${JOB}-labor-mtd"] [data-total="minutes"]`).textContent());
    expect(jobHours).not.toBeNull();
    expect(jobHours).toBe(tableHours);

    await page.goto(`/app/accounting/payroll?p=mtd&job=${JOB}`);
    const payrollHours = hours(await page.locator('[data-kpi="value"]').textContent());
    expect(payrollHours).toBe(jobHours);
  });

  test("Unified Schedule shows My day, Week board, Wednesday 2-week GC look-ahead, and logs a will-call pickup on the job", async ({ owner: page }) => {
    await page.goto("/app/schedule");
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await expect(page.locator('[data-table^="schedule-week-"]')).toBeVisible();

    await page.goto(`/app/schedule?view=lookahead&job=${JOB}`);
    await expect(page.getByText(/Two-week look-ahead/i).first()).toBeVisible();
    await expect(page.getByText(/Schifferer|9146 W Hutton Dr/i).first()).toBeVisible();

    const title = `E2E Will-call corner bead pickup ${Date.now()}`;
    await page.goto(`/app/jobs/${JOB}?tab=schedule`);
    await page.getByRole("button", { name: "Add inspection, delivery or site visit" }).click();
    await page.getByLabel("Kind").selectOption("delivery");
    await page.getByPlaceholder(/What is happening\?/i).fill(title);
    await page.getByRole("button", { name: "Add to schedule" }).click();

    const itemRow = page.locator("li").filter({ hasText: title }).first();
    await expect(itemRow).toBeVisible();
    await itemRow.getByRole("button", { name: "Done" }).click();
    await expect(itemRow.getByRole("button", { name: "Reopen" })).toBeVisible();
  });

  test("A field receipt paid out of pocket normalizes into Purchases once, with no second reimbursement bill in Payables", async ({ owner: page }) => {
    const desc = `E2E out-of-pocket drywall router bits ${Date.now()}`;
    await page.goto(`/app/jobs/${JOB}?tab=log`);
    await page.getByRole("button", { name: "+ Field receipt (normalizes to Purchases)" }).click();

    const form = page.locator("form").filter({ hasText: "Add" }).first();
    await form.getByPlaceholder("Vendor").fill("Home Depot");
    await form.getByPlaceholder("Amount ($)").fill("64.25");
    await form.locator("select").nth(0).selectOption("me");
    await form.locator("select").nth(1).selectOption("drywall");
    await form.getByPlaceholder("Items purchased").fill(desc);
    await form.getByRole("button", { name: "Add" }).click();

    const receiptsTable = page.locator(`[data-table="${JOB}-field-receipts"]`);
    await expect(receiptsTable.getByRole("row").filter({ hasText: desc })).toContainText("$64.25");

    // Appears in Accounting > Purchases
    await page.goto("/app/accounting/purchases?p=wtd");
    const purchTable = page.locator('[data-table="purchases-items-wtd"]');
    await purchTable.getByRole("searchbox").fill(desc);
    await expect(purchTable.getByRole("row").filter({ hasText: desc })).toContainText("$64.25");

    await expect(purchTable.getByRole("row").filter({ hasText: desc })).toHaveCount(1);

    // No bill in Payables: the bot books an out-of-pocket receipt to reimburse (one owner, PR #32 review).
    await page.goto("/app/accounting/payables");
    const payTable = page.locator('[data-table="payables-open-mtd"]');
    await payTable.getByRole("searchbox").fill(desc);
    await expect(payTable.getByRole("row").filter({ hasText: desc })).toHaveCount(0);
  });

  test("6 PM EOD daily log with a field directive creates an unpriced CO on the job and a task in Owner decisions", async ({ owner: page }) => {
    const summary = `E2E Hung 42 sheets Type X in West corridor ${Date.now()}`;
    const directive = `E2E Super asked for 16-ga backing at corridor display ${Date.now()}`;
    let changeOrderId: number | null = null;
    let workItemIds: number[] = [];

    try {
      await page.goto(`/app/jobs/${JOB}?tab=log`);
      await page.getByRole("button", { name: "+ File daily log (SOP-006)" }).click();
      await page.getByPlaceholder("Work performed today (required)").fill(summary);
      await page.getByPlaceholder("Client / GC directive (creates CO awaiting price)").fill(directive);
      const waitLog = page.waitForResponse(
        (r) => r.url().includes("/api/field") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Save daily log" }).click();
      const logRes = await waitLog;
      if (logRes.ok()) {
        const logJson = (await logRes.json()) as {
          changeOrderId?: number | null;
          workItemIds?: number[];
        };
        changeOrderId = logJson.changeOrderId ?? null;
        workItemIds = logJson.workItemIds ?? [];
      }

      const logTable = page.locator(`[data-table="${JOB}-daily-logs"]`);
      await expect(logTable.getByRole("row").filter({ hasText: summary })).toBeVisible();

      // Directive automatically created an awaiting_price Change Order on Changes tab
      await page.goto(`/app/jobs/${JOB}?tab=changes`);
      const coRow = page.getByRole("listitem").filter({ hasText: directive });
      await expect(coRow).toContainText("Awaiting price");

      // And a co_price work item in Tasks for Owner decisions
      await page.goto("/app/tasks?view=all");
      const tasks = page.locator('[data-table="tasks-all"]');
      await tasks.getByRole("searchbox").fill(directive);
      const taskRow = tasks.getByRole("row").filter({ hasText: directive }).first();
      await expect(taskRow).toContainText("Owner");
      await expect(taskRow).toContainText("Change order to price");
    } finally {
      if (changeOrderId !== null) {
        await page.request.patch("/api/change-orders", {
          data: { id: changeOrderId, status: "void" },
        });
      }
      for (const wid of workItemIds) {
        await page.request.patch("/api/tasks", {
          data: { id: wid, status: "dropped" },
        });
      }
    }
  });

  test("Pre-cover quality checklist blocks phase verification until passed, and punch items track by room and wall face", async ({ owner: page }) => {
    const location = `E2E Corridor North Shaft ${Date.now()}`;
    await page.goto(`/app/jobs/${JOB}?tab=log`);
    await page.getByRole("button", { name: "+ Inspection checklist" }).click();

    const gateForm = page.locator("form").filter({ hasText: "Add gate" });
    const phaseSelect = gateForm.getByLabel("Checklist phase");
    const hangOpt = phaseSelect.locator("option").filter({ hasText: "Hang 5/8 XP Hi-Abuse Drywall" });
    const phaseId = Number(await hangOpt.getAttribute("value"));
    expect(phaseId).toBeGreaterThan(0);

    await phaseSelect.selectOption(String(phaseId));
    await gateForm.getByPlaceholder(/Room \/ wall face/i).fill(location);
    await gateForm.getByRole("button", { name: "Add gate" }).click();

    const card = page.locator("div.rounded-lg").filter({ hasText: location }).first();
    await expect(card).toBeVisible();

    // Attempting to verify the phase while the checklist is open must fail with 409
    const blockedRes = await page.request.post("/api/crew/admin", {
      data: { kind: "phase.verify", id: phaseId, note: "Attempt before checklist passed" },
    });
    expect(blockedRes.status()).toBe(409);
    const blockedJson = await blockedRes.json();
    expect(blockedJson.error).toContain("Pre-cover quality gate still open");

    // Pass the gate on the Log and QA tab
    await card.getByRole("button", { name: "Pass gate" }).click();
    await expect(card.getByRole("button", { name: "Reopen" })).toBeVisible();

    // Add two open room/wall-face punch items on the same job and resolve both (T44)
    const punchTitle1 = `E2E Skim coat nick ${Date.now()}`;
    const punchTitle2 = `E2E Corner bead touchup ${Date.now()}`;
    await page.getByRole("button", { name: "+ Punch item" }).click();
    const punchForm1 = page.locator("form").filter({ hasText: "Add punch" });
    await punchForm1.getByPlaceholder(/Punch item/i).fill(punchTitle1);
    await punchForm1.getByPlaceholder(/Room \/ wall face/i).fill("Room 104 — West Wall");
    await punchForm1.getByRole("button", { name: "Add punch" }).click();

    const punchRow1 = page.locator("li").filter({ hasText: punchTitle1 });
    await expect(punchRow1).toContainText("Room 104 — West Wall");

    await page.getByRole("button", { name: "+ Punch item" }).click();
    const punchForm2 = page.locator("form").filter({ hasText: "Add punch" });
    await punchForm2.getByPlaceholder(/Punch item/i).fill(punchTitle2);
    await punchForm2.getByPlaceholder(/Room \/ wall face/i).fill("Room 104 — East Wall");
    await punchForm2.getByRole("button", { name: "Add punch" }).click();

    const punchRow2 = page.locator("li").filter({ hasText: punchTitle2 });
    await expect(punchRow2).toContainText("Room 104 — East Wall");

    await punchRow1.getByRole("button", { name: "Mark done" }).click();
    await expect(punchRow1.getByRole("button", { name: "Reopen" })).toBeVisible();
    await punchRow2.getByRole("button", { name: "Mark done" }).click();
    await expect(punchRow2.getByRole("button", { name: "Reopen" })).toBeVisible();
  });
});

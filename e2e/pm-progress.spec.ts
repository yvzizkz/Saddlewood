import { expect, test as base, type Page } from "@playwright/test";

import { cents, cutoffInDays, OWNER, PM, signIn } from "./support/env";

// Scenario 8b / PM progress report (docs/SCENARIOS.md): Eli sends % complete
// from the job's Money tab before cutoff; the "% complete and photos" task
// clears once all of that client's SOV jobs report for the cycle; and the
// owner's Progress billing opens prefilled with Eli's percents so the draft
// invoice matches to the cent.

const POWELL = "3526-emerson-street";
const BELLEVUE = "9146-w-hutton-dr";
const OFF_JOB = "4125-e-camelback-rd";

const test = base.extend<{ pmPage: Page; ownerPage: Page }>({
  pmPage: async ({ browser }, provide) => {
    const context = await browser.newContext();
    await signIn(context, PM, { crew: true });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
  ownerPage: async ({ browser }, provide) => {
    const context = await browser.newContext();
    await signIn(context, OWNER);
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

test.describe("PM % complete report -> task clears & owner's draw opens prefilled", () => {
  test("reporting % complete on Schifferer's SOV job clears the client's '% complete and photos' task and enforces API guards", async ({
    pmPage,
    ownerPage,
  }) => {
    const initialRes = await ownerPage.request.get(`/api/jobs/${BELLEVUE}/progress`);
    expect(initialRes.ok()).toBeTruthy();
    const initialState = (await initialRes.json()) as {
      opening: Record<string, number>;
      lines: { key: string; description: string; pctToDate: number }[];
    };

    try {
      // Ensure clean baseline (no prior pmReport on 9146) and set Schifferer's
      // cutoff 3 days ahead of today so the task is always within the 7-day prep window.
      await ownerPage.request.post(`/api/jobs/${BELLEVUE}/progress`, {
        data: { action: "clearReport" },
      });
      await ownerPage.request.post(`/api/jobs/${BELLEVUE}/progress`, {
        data: { action: "cutoff", cutoffDay: cutoffInDays(3) },
      });

      // 1. Before reporting, '% complete and photos for Schifferer Built LLC (Synthetic)' is in PM's Tasks.
      await pmPage.goto("/app/tasks?view=all", { waitUntil: "domcontentloaded" });
      await pmPage.getByRole("searchbox", { name: "Search" }).fill("Schifferer");
      await expect(pmPage.getByRole("table")).toContainText(
        "% complete and photos for Schifferer Built LLC (Synthetic)",
      );
      await expect(pmPage.getByRole("table")).toContainText("0 of 1 reported");

      // 2. API guards: off-job report -> 404; PM attempting a draw -> 403.
      const offJobRes = await pmPage.request.post(`/api/jobs/${OFF_JOB}/progress`, {
        data: { action: "report", pcts: { "sov:0": 50 }, note: "Not my job" },
      });
      expect(offJobRes.status()).toBe(404);

      const drawAsPmRes = await pmPage.request.post(`/api/jobs/${BELLEVUE}/progress`, {
        data: { action: "draw", pcts: { "sov:0": 100 } },
      });
      expect(drawAsPmRes.status()).toBe(403);

      // 3. PM opens 9146 Money tab and sends % complete report.
      await pmPage.goto(`/app/jobs/${BELLEVUE}?tab=money`, { waitUntil: "domcontentloaded" });
      const card = pmPage.getByRole("region", { name: "Progress billing" });
      await expect(card).toContainText("Percent complete for this billing");
      await expect(card.getByRole("button", { name: "Make the draft invoice" })).toHaveCount(0);

      const sendBtn = card.getByRole("button", { name: "Send my % complete" });
      await expect(sendBtn).toBeDisabled();

      const firstLine = initialState.lines[0]!;
      const targetPct = Math.min(100, firstLine.pctToDate + 10);
      await card.getByLabel(`${firstLine.description} percent complete`).fill(String(targetPct));
      await card.getByLabel("Note for the owners").fill("Bellevue walk complete for the 20th cutoff");
      await expect(sendBtn).toBeEnabled();
      await sendBtn.click();

      await expect(card.locator('[data-report="banner"]')).toContainText("You sent your % complete");
      await expect(card.locator('[data-report="banner"]')).toContainText(
        "Bellevue walk complete for the 20th cutoff",
      );

      // 4. After reporting on Schifferer's only SOV job, the '% complete and photos' task clears.
      await pmPage.goto("/app/tasks?view=all", { waitUntil: "domcontentloaded" });
      await pmPage.getByRole("searchbox", { name: "Search" }).fill("Schifferer");
      await expect(
        pmPage.getByText("% complete and photos for Schifferer Built LLC (Synthetic)"),
      ).toHaveCount(0);
    } finally {
      await ownerPage.request.post(`/api/jobs/${BELLEVUE}/progress`, {
        data: { action: "clearReport" },
      });
      await ownerPage.request.post(`/api/jobs/${BELLEVUE}/progress`, {
        data: { action: "cutoff", cutoffDay: 20 },
      });
    }
  });

  test("PM reports % complete on Powell -> owner sees prefilled percents and bills the exact amount -> banner clears after draw", async ({
    pmPage,
    ownerPage,
  }) => {
    const powellOpening = { "sov:0": 90, "sov:1": 75, "sov:2": 45, "sov:3": 40 };
    let createdDocId: string | null = null;

    try {
      const priorRes = await ownerPage.request.get(`/api/jobs/${POWELL}/progress`);
      if (priorRes.ok()) {
        const prior = (await priorRes.json()) as { openDraft?: { id: string } | null };
        if (prior.openDraft?.id) {
          await ownerPage.request.post(`/api/billing/documents/${prior.openDraft.id}/issue`, {
            data: {},
          });
          await ownerPage.request.post(`/api/billing/documents/${prior.openDraft.id}/void`, {
            data: { reason: "e2e cleanup" },
          });
        }
      }
      await ownerPage.request.post(`/api/jobs/${POWELL}/progress`, {
        data: { action: "clearReport" },
      });
      const openRes = await ownerPage.request.post(`/api/jobs/${POWELL}/progress`, {
        data: { action: "opening", pcts: powellOpening },
      });
      expect(openRes.ok()).toBeTruthy();

      // 1. PM opens Powell Money tab: backward % is refused (UI + 400 API), valid report saves.
      await pmPage.goto(`/app/jobs/${POWELL}?tab=money`, { waitUntil: "domcontentloaded" });
      const pmCard = pmPage.getByRole("region", { name: "Progress billing" });
      await expect(pmCard).toContainText("Percent complete for this billing");

      const framingInput = pmCard.getByLabel("Main Residence & Casita Framing percent complete");
      const sendBtn = pmCard.getByRole("button", { name: "Send my % complete" });

      await framingInput.fill("85");
      await expect(pmCard).toContainText("85% is below the 90% already billed. Issue a credit instead.");
      await expect(sendBtn).toBeDisabled();

      const backApiRes = await pmPage.request.post(`/api/jobs/${POWELL}/progress`, {
        data: { action: "report", pcts: { "sov:0": 85 }, note: "Backwards" },
      });
      expect(backApiRes.status()).toBe(400);

      // Framing 90% -> 95% on $165,000 scheduled = +$8,250.00 (825,000 cents).
      const note = "Casita sheathing & main residence framing at 95%";
      await framingInput.fill("95");
      await pmCard.getByLabel("Note for the owners").fill(note);
      expect(cents(await pmCard.locator('[data-draw="gross"]').textContent())).toBe(825_000);
      await expect(sendBtn).toBeEnabled();
      await sendBtn.click();

      await expect(pmCard.locator('[data-report="banner"]')).toContainText("You sent your % complete");
      await expect(pmCard.locator('[data-report="banner"]')).toContainText(note);

      // 2. Owner opens Powell Money tab: sees Eli's report banner and prefilled 95% ($8,250.00).
      await ownerPage.goto(`/app/jobs/${POWELL}?tab=money`, { waitUntil: "domcontentloaded" });
      const ownerCard = ownerPage.getByRole("region", { name: "Progress billing" });
      await expect(ownerCard.locator('[data-report="banner"]')).toContainText(
        "Eli Ramirez's % complete",
      );
      await expect(ownerCard.locator('[data-report="banner"]')).toContainText(note);

      await expect(
        ownerCard.getByLabel("Main Residence & Casita Framing percent complete"),
      ).toHaveValue("95");
      await expect(
        ownerCard.getByLabel("Drywall Hang, Tape & Level 4 Finish percent complete"),
      ).toHaveValue("");
      expect(cents(await ownerCard.locator('[data-draw="gross"]').textContent())).toBe(825_000);
      expect(cents(await ownerCard.locator('[data-draw="due"]').textContent())).toBe(825_000);

      // 3. Owner clicks Make the draft invoice: draft matches $8,250.00 to the cent.
      await ownerCard.getByRole("button", { name: "Make the draft invoice" }).click();
      await ownerPage.waitForURL(/\/app\/money\/[0-9a-f-]{36}$/i);
      createdDocId = ownerPage.url().split("/").pop()!;

      const progressRes = await ownerPage.request.get(`/api/jobs/${POWELL}/progress`);
      const progressJson = (await progressRes.json()) as {
        lines: { key: string; billedToDateCents: number; pctToDate: number }[];
        report: unknown;
      };
      const framingAfter = progressJson.lines.find((l) => l.key === "sov:0")!;
      expect(framingAfter.pctToDate).toBe(95);
      expect(framingAfter.billedToDateCents).toBe(15_675_000); // $148,500 + $8,250 = $156,750
      expect(progressJson.report).toBeNull();

      // 4. Re-opening Powell Money tab as owner: report banner is gone after the draw spent it.
      await ownerPage.goto(`/app/jobs/${POWELL}?tab=money`, { waitUntil: "domcontentloaded" });
      await expect(ownerPage.locator('[data-report="banner"]')).toHaveCount(0);
    } finally {
      if (createdDocId) {
        await ownerPage.request.post(`/api/billing/documents/${createdDocId}/issue`, { data: {} });
        await ownerPage.request.post(`/api/billing/documents/${createdDocId}/void`, {
          data: { reason: "e2e cleanup" },
        });
      }
      await ownerPage.request.post(`/api/jobs/${POWELL}/progress`, {
        data: { action: "clearReport" },
      });
      await ownerPage.request.post(`/api/jobs/${POWELL}/progress`, {
        data: { action: "opening", pcts: powellOpening },
      });
    }
  });
});

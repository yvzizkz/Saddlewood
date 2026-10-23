// Powell progress payments (docs/SCENARIOS.md §8): percent complete on the
// schedule of values, Joist cutover opening percents, backward-percent &
// single-draft guards, draft -> issue -> check payment -> next draw roll-forward,
// plus a signed change order joining the schedule with retainage held.

import { cents, expect, sovKeys, test } from "./support/env";

const POWELL = "3526-emerson-street";
const BELLEVUE = "9146-w-hutton-dr";

test.describe("Powell: schedule-of-values progress draws", () => {
  test("Powell SOV draw: opening cutover, backward guard, Draw #1 -> issue -> check payment, and Draw #2 roll-forward", async ({ owner: page }) => {
    const drawDocs: string[] = [];
    const paymentIds: string[] = [];

    try {
      const sov = await sovKeys(page, POWELL);
      // 1. Set/verify Joist cutover opening percents before the first app draw
      const openRes = await page.request.post(`/api/jobs/${POWELL}/progress`, {
        data: {
          action: "opening",
          pcts: { [sov[0]]: 90, [sov[1]]: 75, [sov[2]]: 45, [sov[3]]: 40 },
        },
      });
      expect(openRes.ok()).toBeTruthy();

      await page.goto(`/app/jobs/${POWELL}?tab=money`);
      const card = page.getByRole("region", { name: "Progress billing" });
      await expect(card).toBeVisible();
      await expect(card).toContainText("Billed to date $298,500.00 of $420,000.00 ($298,500.00 of it before the app)");
      await expect(card.getByRole("row").filter({ hasText: "Main Residence & Casita Framing" })).toContainText("90% · $148,500.00");
      await expect(card.getByRole("row").filter({ hasText: "Drywall Hang, Tape & Level 4 Finish" })).toContainText("75% · $93,750.00");

      // 2. Guard: entering a percent lower than billed-to-date shows credit error & disables button
      const framingInput = card.getByLabel("Main Residence & Casita Framing percent complete");
      const drywallInput = card.getByLabel("Drywall Hang, Tape & Level 4 Finish percent complete");
      const makeBtn = card.getByRole("button", { name: "Make the draft invoice" });

      await framingInput.fill("85");
      await expect(card).toContainText("85% is below the 90% already billed. Issue a credit instead.");
      await expect(makeBtn).toBeDisabled();

      // 3. Draw #1: Framing 90% -> 95% (+$8,250) and Drywall 75% -> 85% (+$12,500) = $20,750
      await framingInput.fill("95");
      await drywallInput.fill("85");
      expect(cents(await card.locator('[data-draw="gross"]').textContent())).toBe(2_075_000);
      expect(cents(await card.locator('[data-draw="due"]').textContent())).toBe(2_075_000);
      await expect(makeBtn).toBeEnabled();

      await makeBtn.click();
      await page.waitForURL(/\/app\/money\/[0-9a-f-]{36}$/i);
      const draw1Id = page.url().split("/").pop()!;
      drawDocs.push(draw1Id);

      // 4. Guard: a second draw is refused with 409 while Draw #1 is still a draft
      const dupRes = await page.request.post(`/api/jobs/${POWELL}/progress`, {
        data: { action: "draw", pcts: { [sov[2]]: 65 } },
      });
      expect(dupRes.status()).toBe(409);

      // 4b. A mistyped draft is discarded from the card: back to where it was, nothing voided.
      await page.goto(`/app/jobs/${POWELL}?tab=money`);
      await expect(card.getByText(/is a draft, not sent/)).toBeVisible();
      await card.getByRole("button", { name: "Discard draw" }).click();
      await expect(card.getByText(/is a draft, not sent/)).toHaveCount(0);
      await expect(card).toContainText("Billed to date $298,500.00 of $420,000.00");
      drawDocs.splice(drawDocs.indexOf(draw1Id), 1);

      // Draw #1 again, then issue it from the card.
      await card.getByLabel("Main Residence & Casita Framing percent complete").fill("95");
      await card.getByLabel("Drywall Hang, Tape & Level 4 Finish percent complete").fill("85");
      expect(cents(await card.locator('[data-draw="due"]').textContent())).toBe(2_075_000);
      await makeBtn.click();
      await page.waitForURL(/\/app\/money\/[0-9a-f-]{36}$/i);
      const draw1 = page.url().split("/").pop()!;
      drawDocs.push(draw1);
      await page.goto(`/app/jobs/${POWELL}?tab=money`);
      await card.getByRole("button", { name: "Issue it" }).click();
      await expect(card.getByText(/is a draft, not sent/)).toHaveCount(0);

      // 5. Record Powell's check payment ($20,750) against the issued draw

      const payRes = await page.request.post("/api/billing/payments", {
        data: {
          documentId: draw1,
          amountCents: 2_075_000,
          method: "check",
          receivedOn: "2026-10-20",
          reference: "CHK-8841",
          confirm: true,
        },
      });
      expect(payRes.ok()).toBeTruthy();
      const payJson = await payRes.json();
      if (payJson.payment?.id) paymentIds.push(payJson.payment.id);

      // 6. Next draw rolls forward from Draw #1 ($319,250 billed to date)
      await page.goto(`/app/jobs/${POWELL}?tab=money`);
      await expect(card).toContainText("Billed to date $319,250.00 of $420,000.00 ($298,500.00 of it before the app)");
      await expect(card.getByRole("row").filter({ hasText: "Main Residence & Casita Framing" })).toContainText("95% · $156,750.00");
      await expect(card.getByRole("row").filter({ hasText: "Drywall Hang, Tape & Level 4 Finish" })).toContainText("85% · $106,250.00");

      // Draw #2: Finish 45% -> 65% (+$17,000) and Tile 40% -> 50% (+$4,500) = $21,500
      await card.getByLabel("Interior Trim, Doors & Paint percent complete").fill("65");
      await card.getByLabel("Primary Bath & Flooring percent complete").fill("50");
      expect(cents(await card.locator('[data-draw="due"]').textContent())).toBe(2_150_000);

      await makeBtn.click();
      await page.waitForURL(/\/app\/money\/[0-9a-f-]{36}$/i);
      const draw2Id = page.url().split("/").pop()!;
      drawDocs.push(draw2Id);

      await page.goto(`/app/jobs/${POWELL}?tab=money`);
      await card.getByRole("button", { name: "Issue it" }).click();
      await expect(card.getByText(/is a draft, not sent/)).toHaveCount(0);
      await expect(card.getByRole("button", { name: `Void draw ${(await (await page.request.get(`/api/jobs/${POWELL}/progress`)).json()).lastIssued.number}` })).toBeVisible();
      expect(draw2Id).toBeTruthy();
    } finally {
      // A draft left behind by a failure is discarded; issued draws are voided.
      await page.request.post(`/api/jobs/${POWELL}/progress`, { data: { action: "discard" } });
      for (const pid of paymentIds) {
        await page.request.post(`/api/billing/payments/${pid}/void`, {
          data: { reason: "e2e cleanup" },
        });
      }
      for (const docId of drawDocs) {
        await page.request.post(`/api/billing/documents/${docId}/void`, {
          data: { reason: "e2e cleanup" },
        });
      }
    }
  });

  test("A signed minor extra (Change Order) joins the schedule of values, holds client retainage, and marks the CO billed at 100%", async ({ owner: page }) => {
    const title = `E2E Corridor access panel ${Date.now()}`;
    let drawDocId: string | null = null;
    let coId: number | null = null;

    try {
      // 1. Create, price ($2,500), and sign a change order on Bellevue (10% retainage)
      const createCo = await page.request.post("/api/change-orders", {
        data: { job: BELLEVUE, title },
      });
      expect(createCo.ok()).toBeTruthy();
      coId = (await createCo.json()).id as number;

      await page.request.patch("/api/change-orders", {
        data: { id: coId, status: "priced", amountCents: 250_000 },
      });
      const signRes = await page.request.patch("/api/change-orders", {
        data: { id: coId, status: "signed" },
      });
      expect(signRes.ok()).toBeTruthy();

      // 2. Open Bellevue's Money tab: the signed CO appears on the SOV schedule with 10% retainage
      await page.goto(`/app/jobs/${BELLEVUE}?tab=money`);
      const card = page.getByRole("region", { name: "Progress billing" });
      const coRow = card.getByRole("row").filter({ hasText: title });
      await expect(coRow).toBeVisible();
      await expect(coRow).toContainText("change order");
      await expect(coRow).toContainText("$2,500");

      // 3. Bill the signed CO to 100%: gross $2,500, retainage 10% (-$250), due $2,250
      await card.getByLabel(new RegExp(`${title} percent complete`)).fill("100");
      expect(cents(await card.locator('[data-draw="gross"]').textContent())).toBe(250_000);
      await expect(card).toContainText("Retainage held (10%)");
      expect(cents(await card.locator('[data-draw="due"]').textContent())).toBe(225_000);

      await card.getByRole("button", { name: "Make the draft invoice" }).click();
      await page.waitForURL(/\/app\/money\/[0-9a-f-]{36}$/i);
      drawDocId = page.url().split("/").pop()!;

      const issueRes = await page.request.post(`/api/billing/documents/${drawDocId}/issue`, {
        data: {},
      });
      expect(issueRes.ok()).toBeTruthy();

      // 4. Drawing the signed CO to 100% automatically marked it Billed (leaves open Changes list)
      await page.goto(`/app/jobs/${BELLEVUE}?tab=changes`);
      await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
    } finally {
      if (drawDocId) {
        await page.request.post(`/api/billing/documents/${drawDocId}/void`, {
          data: { reason: "e2e cleanup" },
        });
      }
    }
  });
});

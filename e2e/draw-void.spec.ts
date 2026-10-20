// Voiding a draw that billed a change order (docs/SCENARIOS.md §8): the
// change order is owed again, back on Changes as signed and back on the
// schedule of values at 0%, so its money is not lost. Local stack only.

import { cents, expect, test } from "./support/env";

const BELLEVUE = "9146-w-hutton-dr";

test("voiding the draw that billed a change order puts it back to bill", async ({ owner: page }) => {
  const title = `E2E soffit drop ${Date.now()}`;
  const made = await page.request.post("/api/change-orders", { data: { job: BELLEVUE, title } });
  expect(made.ok()).toBeTruthy();
  const coId = (await made.json()).id as number;
  try {
    expect((await page.request.patch("/api/change-orders", { data: { id: coId, status: "priced", amountCents: 180_000 } })).ok()).toBeTruthy();
    expect((await page.request.patch("/api/change-orders", { data: { id: coId, status: "signed" } })).ok()).toBeTruthy();

    const state = await (await page.request.get(`/api/jobs/${BELLEVUE}/progress`)).json();
    const line = (state.lines as { key: string; description: string }[]).find((l) => l.description.endsWith(title))!;
    const draw = await page.request.post(`/api/jobs/${BELLEVUE}/progress`, { data: { action: "draw", pcts: { [line.key]: 100 } } });
    expect(draw.ok()).toBeTruthy();
    const { documentId } = await draw.json();
    expect((await page.request.post(`/api/billing/documents/${documentId}/issue`, { data: {} })).ok()).toBeTruthy();

    await page.goto(`/app/jobs/${BELLEVUE}?tab=changes`);
    await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);

    expect((await page.request.post(`/api/billing/documents/${documentId}/void`, { data: { reason: "e2e: wrong draw" } })).ok()).toBeTruthy();

    await page.goto(`/app/jobs/${BELLEVUE}?tab=changes`);
    await expect(page.getByRole("listitem").filter({ hasText: title })).toContainText("Signed, not billed");

    await page.goto(`/app/jobs/${BELLEVUE}?tab=money`);
    const row = page.getByRole("region", { name: "Progress billing" }).getByRole("row").filter({ hasText: title });
    await expect(row).toContainText("0% · $0.00");
    await row.getByLabel(`${line.description} percent complete`).fill("100");
    expect(cents(await page.locator('[data-draw="gross"]').textContent())).toBe(180_000);
  } finally {
    await page.request.patch("/api/change-orders", { data: { id: coId, status: "void" } });
  }
});

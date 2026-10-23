// The old contracts page drafts nothing now (T112): its generator is retired,
// agreements are drafted on the job. The page still lists what is there and
// /api/contracts answers 410 to a site draft. Reads only: nothing is saved.

import { expect, test } from "./support/env";

test("Old Contracts drafts nothing and points to the job", async ({ owner: page }) => {
  await page.goto("/internal/contracts");
  await expect(page.getByText(/Active Pipeline \(\d+\)/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Agreements are drafted on the job" })).toHaveAttribute("href", "/app/jobs");
  await expect(page.getByText("Draft New Agreement")).toHaveCount(0);
  const res = await page.request.post("/api/contracts", { data: { client_name: "E2E", amount: 1000, scope: "Drywall" } });
  expect(res.status()).toBe(410);
});

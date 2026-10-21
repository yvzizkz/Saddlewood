// The old proposal links stay open for clients who hold them (prp-001 went
// to Dean Schifferer on 9/24), view-only: no accept, no alternate picking,
// no notes form. The staff page sends people to Sales. Reads only: nothing
// here writes the Mac's proposals file.

import { expect, test } from "./support/env";

const TOKEN = "bellevue-church-schifferer-ac938";

test.describe("Old proposals: links already sent still open, view-only", () => {
  test("A client's /p/ link shows the proposal with a way to reach us and no accept", async ({ browser }) => {
    // A client is not signed in.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/p/${TOKEN}`);
    await expect(page.getByText("PRP-2026-001").first()).toBeVisible();
    await expect(page.getByText("Bellevue Heights Church").first()).toBeVisible();

    await expect(page.getByRole("button", { name: /Accept & Authorize/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Call to accept" })).toHaveAttribute("href", "tel:4809996100");
    const contact = page.getByTestId("proposal-contact");
    await expect(contact.getByRole("link", { name: "info@saddlewoodcontracting.com" })).toHaveAttribute("href", /^mailto:info@saddlewoodcontracting\.com\?subject=PRP-2026-001/);
    await expect(page.getByRole("button", { name: /Submit Scope Update/ })).toHaveCount(0);

    // Alternates are shown, not picked.
    const boxes = page.getByRole("checkbox");
    expect(await boxes.count()).toBeGreaterThan(0);
    for (const box of await boxes.all()) await expect(box).toBeDisabled();

    // The API says the same thing to anyone who tries.
    const accept = await page.request.post(`/api/proposals/${TOKEN}/accept`, { data: { name: "X", signature: "x" } });
    expect(accept.status()).toBe(410);
    const toggle = await page.request.patch(`/api/proposals/${TOKEN}`, { data: { alternate_id: "alt-1", selected: false } });
    expect(toggle.status()).toBe(410);

    // /share/ still forwards to the same page.
    await page.goto(`/share/${TOKEN}`);
    await expect(page).toHaveURL(new RegExp(`/p/${TOKEN}$`));
    await context.close();
  });

  test("The old staff page sends people to Sales", async ({ owner: page }) => {
    await page.goto("/internal/proposals");
    await expect(page).toHaveURL(/\/app\/sales$/);
  });
});

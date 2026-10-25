// Home's "Your tasks" (docs/COHESIVE-APP-PLAN.md §6.5): the owner's Home and
// the PM's Today count the same Mine that Tasks does, and each row opens where
// it is acted on. Local stack only (support/env.ts).

import type { Page } from "@playwright/test";
import { expect, PM, signIn, test } from "./support/env";

async function mineOnTasks(page: Page): Promise<number> {
  await page.goto("/app/tasks");
  const label = await page.getByRole("group", { name: "Whose" }).getByRole("link").first().textContent();
  const n = Number(label?.match(/\((\d+)\)/)?.[1]);
  expect(n).toBeGreaterThan(0);
  return n;
}

async function yourTasks(page: Page) {
  await page.goto("/app");
  const card = page.getByRole("region", { name: "Your tasks" });
  await expect(card).toBeVisible();
  const count = Number(await card.getByRole("heading").locator("span").textContent());
  expect(count).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/home-tasks-${page.viewportSize()?.width}.png`, fullPage: true });
  return { card, count };
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

test.describe("Home reads the task feed", () => {
  test("the owner's Home counts the same Mine as Tasks, and its rows open", async ({ owner: page }) => {
    const { card, count } = await yourTasks(page);
    expect(count).toBe(await mineOnTasks(page));
    await page.goto("/app");
    const first = card.getByRole("link").filter({ hasNotText: "See all" }).first();
    const href = await first.getAttribute("href");
    expect(href).toBeTruthy();
    await card.getByRole("link", { name: "See all" }).click();
    await expect(page).toHaveURL(/\/app\/tasks$/);
  });

  test("the PM's Today counts the same Mine as Tasks, on a phone too", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await signIn(ctx, PM, { crew: true });
    const page = await ctx.newPage();
    const { count } = await yourTasks(page);
    await noSideScroll(page);
    expect(count).toBe(await mineOnTasks(page));
    await ctx.close();
  });
});

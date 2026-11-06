// What the website sends lands in the app: a contact lead in the Sales inbox,
// with or without a phone, and trade-partner and job applications on their own
// page. Local has no GHL or Resend keys, so here the app is the only channel.

import { execSync } from "node:child_process";

import { PM, expect, signIn, test } from "./support/env";

const DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const sql = (q: string) => execSync(`psql "${DB}" -qAtc ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();

test.describe("What the website sends", () => {
  test("a contact lead with no phone reaches the Sales inbox and can be tracked or dismissed", async ({ owner: page }) => {
    const n = Date.now().toString().slice(-8);
    const track = `E2E Web Track ${n}`;
    const skip = `E2E Web Skip ${n}`;
    const email = (who: string) => `${who.toLowerCase().replaceAll(" ", ".")}@example.com`;
    try {
      for (const name of [track, skip]) {
        // Longer than a timeline note can hold, so Track has to cap it.
        const message = `Wants an island. ${"And more. ".repeat(500)}`;
        const res = await page.request.post("/api/contact", { data: { name, email: email(name), projectType: "Kitchen", budget: "$150k", message, company: "" } });
        expect(res.ok()).toBe(true);
        expect((await res.json()).delivered.app).toBe(true);
      }
      const bot = await page.request.post("/api/contact", { data: { name: `E2E Bot ${n}`, email: "bot@example.com", company: "filled" } });
      expect(bot.ok()).toBe(true);
      expect(sql(`select count(*) from public.web_submissions where name = 'E2E Bot ${n}'`)).toBe("0");

      await page.goto("/app/sales", { waitUntil: "networkidle" });
      const inbox = page.locator("section").filter({ has: page.getByRole("heading", { name: /Not tracked yet/ }) });
      const show = inbox.getByRole("button", { name: /Show all/ });
      if (await show.isVisible()) await show.click();
      await expect(inbox.getByText(track, { exact: true })).toBeVisible();
      await expect(inbox.getByRole("link", { name: `Email ${track}` })).toHaveAttribute("href", `mailto:${email(track)}`);

      const opens = (who: string) => inbox.getByRole("button", { name: `${who}: read what they sent, or mark called, texted or dismissed` });
      const row = inbox.locator("div.px-3\\.5").filter({ hasText: track });
      await opens(track).click();
      await expect(row).toContainText("Budget: $150k");
      await expect(row).toContainText("Message: Wants an island.");

      await opens(skip).click();
      await inbox.getByRole("button", { name: "Dismiss", exact: true }).click();
      await expect(inbox.getByText(skip, { exact: true })).toHaveCount(0);
      expect(sql(`select status from public.web_submissions where name = '${skip}'`)).toBe("dismissed");

      await row.getByRole("button", { name: "Track", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/sales\/[0-9a-f-]+$/);
      const note = page.getByRole("listitem").filter({ hasText: "Message: Wants an island." });
      await expect(note).toContainText("Budget: $150k");
      expect(sql(`select length(e.text) from public.sales_events e join public.sales_opportunities o on o.id = e.opportunity_id where o.title = '${track}' and e.kind = 'note'`)).toBe("4000");
      expect(sql(`select source || '|' || external_ref from public.sales_opportunities where title = '${track}'`)).toBe(`website|email:${email(track)}`);
      await page.goto("/app/sales", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: /Not tracked yet/ })).toBeVisible();
      await expect(inbox.getByText(track, { exact: true }), "tracked, it leaves the inbox").toHaveCount(0);
    } finally {
      sql(`begin; set local session_replication_role = replica; delete from public.sales_events where opportunity_id in (select id from public.sales_opportunities where title = '${track}'); delete from public.sales_opportunities where title = '${track}'; delete from public.web_submissions where name like 'E2E Web % ${n}'; commit;`);
    }
  });

  test("trade-partner and job applications wait on their own page; a PM can't open it", async ({ owner: page, browser }) => {
    const n = Date.now().toString().slice(-8);
    const firm = `E2E Framing ${n}`;
    const person = `E2E Applicant ${n}`;
    const pmCtx = await browser.newContext();
    try {
      const sub = await page.request.post("/api/trade-partners", { data: { businessName: firm, name: "Jo", email: "jo@example.com", classifications: ["Framing"], license: "ROC 123", company: "" } });
      expect(sub.ok()).toBe(true);
      const job = await page.request.post("/api/careers", { data: { role: "Carpenter", name: person, phone: "4805550123", salary: "$30/hr", company: "" } });
      expect(job.ok()).toBe(true);

      await page.goto("/app/sales", { waitUntil: "networkidle" });
      await page.getByRole("link", { name: /Website applications \(\d+ waiting\)/ }).click();
      await expect(page.getByRole("heading", { name: "Website applications" })).toBeVisible();
      const card = (text: string) => page.getByRole("listitem").filter({ hasText: text });
      await expect(card(firm)).toContainText("ROC 123");
      await expect(card(person)).toContainText("$30/hr");
      await expect(card(person).getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:4805550123");

      await card(firm).getByRole("button", { name: "Done" }).click();
      await expect(card(firm).getByRole("button", { name: "Reopen" })).toBeVisible();
      expect(sql(`select status from public.web_submissions where company = '${firm}'`)).toBe("dismissed");

      await signIn(pmCtx, PM, { crew: true });
      const pm = await pmCtx.newPage();
      await pm.goto("/app/sales/applications");
      await expect(pm).not.toHaveURL(/applications/);
      const id = sql(`select id from public.web_submissions where company = '${firm}'`);
      const refused = await pm.request.patch("/api/sales/inbox", { data: { webId: Number(id), status: "new" } });
      expect(refused.ok()).toBe(false);
    } finally {
      await pmCtx.close();
      sql(`delete from public.web_submissions where company = '${firm}' or name = '${person}'`);
    }
  });
});

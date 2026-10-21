// Our own trades (K12): Saddlewood is a GC (ROC 305762) with its own CR-11
// electrical, CR-37 plumbing and CR-39 HVAC licenses. A remodel awards from the
// whole-job template, a job's phases are picked by its trades, the field
// checklist follows the trade, and the purchase chips include HVAC.

import { expect, test } from "./support/env";

const FIELD_JOB = "9146-w-hutton-dr";

test.describe("Our own trades: GC, electrical, plumbing and HVAC", () => {
  test("A remodel awards from the whole-job GC template; the preview takes the job's trades instead", async ({ owner: page }) => {
    const uid = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const jobName = `8${uid.slice(0, 4)} N Trades Way`;
    const oppRes = await page.request.post("/api/sales", {
      data: {
        title: `Trades remodel ${uid}`,
        kind: "remodel",
        source: "referral",
        address: `${jobName}, Scottsdale, AZ 85251`,
        valueCents: 9_800_000,
        contact: { name: "Riley Remodel", company: "", email: `riley.${uid}@example.com`, phone: "480-555-0144" },
        nextStep: "Walk the house",
      },
    });
    expect(oppRes.status()).toBe(201);
    const { opportunity: opp } = await oppRes.json();
    expect((await page.request.patch(`/api/sales/${opp.id}`, { data: { stage: "won", why: "Signed on our paper" } })).ok()).toBeTruthy();

    // The default for a remodel is the whole job.
    const preview = await (await page.request.get(`/api/sales/${opp.id}/award`)).json();
    expect(preview.choices.template).toBe("gc");
    expect(preview.plan.crew.template).toBe("gc");
    // Picking the job's trades, in any order, comes back in build order; a trade with no template is ignored.
    const picked = await (await page.request.get(`/api/sales/${opp.id}/award?template=hvac,plumbing,electrical`)).json();
    expect(picked.plan.crew.template).toBe("hvac,plumbing,electrical");
    const bad = await (await page.request.get(`/api/sales/${opp.id}/award?template=roofing`)).json();
    expect(bad.plan.crew.template).toBe("gc");
    expect((await page.request.post(`/api/sales/${opp.id}/award`, { data: { template: "roofing" } })).status()).toBe(400);

    const awardRes = await page.request.post(`/api/sales/${opp.id}/award`, { data: { jobName, prefix: `T${uid.slice(-5)}`, deposit: false } });
    expect(awardRes.ok()).toBeTruthy();
    const awarded = await awardRes.json();
    expect(awarded.crewJobId).toBeTruthy();
    try {
      const projects = await (await page.request.get("/api/crew/projects")).json();
      const job = (projects.projects ?? projects.jobs ?? []).find((p: { id: string }) => p.id === awarded.crewJobId);
      expect(job, "the awarded job is on Projects").toBeTruthy();
      const names = (job.phases as { name: string; trade: string }[]).map((p) => p.name);
      expect(names[0]).toBe("demo");
      expect(names).toEqual(expect.arrayContaining(["footing and foundation", "plumbing top-out", "electrical rough", "HVAC rough and duct", "MEP rough inspections", "final inspection"]));
      expect((job.phases as { trade: string }[]).map((p) => p.trade)).toEqual(expect.arrayContaining(["plumbing", "electrical", "hvac"]));
    } finally {
      const detail = await (await page.request.get(`/api/sales/${opp.id}`)).json();
      for (const w of detail.job?.watches ?? []) await page.request.post(`/api/sales/${opp.id}/watches`, { data: { id: w.id, done: true } });
      await page.request.post("/api/crew/admin", { data: { kind: "job.update", id: awarded.crewJobId, active: false } });
    }
  });

  test("A job with no phases starts from the trades picked on Projects", async ({ owner: page }) => {
    const projects = await (await page.request.get("/api/crew/projects")).json();
    const list = (projects.projects ?? projects.jobs ?? []) as { id: string; name: string; phases: unknown[] }[];
    const job = list.find((p) => p.phases.length === 0);
    test.skip(!job, "every job on Projects already has phases");
    const { id, name } = job!;
    try {
      await page.goto("/app/projects");
      const card = page.locator("div").filter({ has: page.getByRole("heading", { name, exact: true }) }).filter({ has: page.getByRole("group", { name: "Phases to start from" }) }).last();
      const pick = card.getByRole("group", { name: "Phases to start from" });
      await expect(pick.getByRole("button", { name: "Whole job (GC)" })).toHaveAttribute("aria-pressed", "true");
      await expect(card.getByRole("button", { name: "Start from the whole job" })).toBeVisible();
      await pick.getByRole("button", { name: "Plumbing" }).click();
      await pick.getByRole("button", { name: "HVAC" }).click();
      await expect(pick.getByRole("button", { name: "Whole job (GC)" })).toHaveAttribute("aria-pressed", "false");
      await card.getByRole("button", { name: "Start from plumbing and HVAC" }).click();
      const strip = page.getByLabel(`${name}: phases`);
      await expect(strip).toContainText("plumbing underground");
      await expect(strip).toContainText("HVAC final");
    } finally {
      // Back to no phases: nothing on it was verified, so the list may be emptied.
      await page.request.post("/api/crew/admin", { data: { kind: "job.phases.set", jobId: id, phases: [] } });
    }
  });

  test("The field checklist follows the trade: plumbing pre-cover, and the drywall sequence as before", async ({ owner: page }) => {
    const location = `E2E Hall Bath Wet Wall ${Date.now()}`;
    await page.goto(`/app/jobs/${FIELD_JOB}?tab=log`);
    await page.getByRole("button", { name: "+ Inspection checklist" }).click();
    const form = page.locator("form").filter({ hasText: "Add gate" });
    const stage = form.getByLabel("Checklist stage");
    // Drywall's six stages until another trade is picked.
    await form.getByLabel("Checklist phase").selectOption("");
    await form.getByLabel("Checklist trade").selectOption("drywall");
    await expect(stage.locator("option")).toHaveCount(6);
    await expect(stage.locator("option").nth(4)).toHaveText("5. Pre-paint (500W raking-light check)");
    await form.getByLabel("Checklist trade").selectOption("plumbing");
    await expect(stage.locator("option")).toHaveText(["Plumbing 1. Rough-in (underground & top-out)", "Plumbing 2. Pre-cover (top-out & gas inspected)", "Plumbing 3. Final (fixtures, heater & gas)"]);
    await stage.selectOption("plumbing_precover");
    await form.getByPlaceholder(/Room \/ wall face/i).fill(location);
    await form.getByRole("button", { name: "Add gate" }).click();

    const card = page.locator("div.rounded-lg").filter({ hasText: location }).first();
    await expect(card).toContainText("Plumbing 2. Pre-cover");
    await expect(card).toContainText("Top-out inspection signed off by the city or county");
    await card.getByRole("button", { name: "Pass gate" }).click();
    await expect(card.getByRole("button", { name: "Reopen" })).toBeVisible();
  });

  test("The daily log's trades on site start empty and toggle our trades; receipts and purchase chips take any trade", async ({ owner: page }) => {
    await page.goto(`/app/jobs/${FIELD_JOB}?tab=log`);
    await page.getByRole("button", { name: /File daily log/ }).click();
    const onSite = page.getByLabel("Trades on site", { exact: true });
    await expect(onSite).toHaveValue("");
    const ours = page.getByRole("group", { name: "Our trades on site" });
    await ours.getByRole("button", { name: "Electrical" }).click();
    await ours.getByRole("button", { name: "HVAC" }).click();
    await expect(onSite).toHaveValue("Electrical, HVAC");
    await ours.getByRole("button", { name: "Electrical" }).click();
    await expect(onSite).toHaveValue("HVAC");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: /Field receipt/ }).click();
    const tradeSelect = page.getByLabel("Receipt trade");
    for (const t of ["Plumbing", "Electrical", "HVAC", "Framing", "Drywall"]) await expect(tradeSelect.locator("option", { hasText: t }).first()).toBeAttached();

    const search = await page.request.get("/api/crew/purchases/search?q=filter&trade=hvac");
    expect(search.status()).toBe(200);
    expect((await page.request.get("/api/crew/purchases/search?q=filter&trade=bananas")).status()).toBe(400);
  });
});

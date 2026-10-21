// Sales admin: lead with source -> estimate -> 5-day follow-up escalation ->
// proposal -> won -> award builds the job & Gate 0 handoff packet
// (docs/SCENARIOS.md §7).

import { expect, test } from "./support/env";

test.describe("Sales: the sales & estimating week", () => {
  test("Sales department home and pipeline show seeded opportunities, source tags, and >5d overdue follow-up escalation", async ({ owner: page }) => {
    await page.goto("/app/departments/sales");
    await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
    await expect(page.getByText(/Estimating and sales admin/i)).toBeVisible();
    await expect(page.getByText(/Open pipeline/i)).toBeVisible();
    await expect(page.getByText(/By source/i)).toBeVisible();

    // Kierland Commons Suite 210 is >5d overdue on follow-up, so it escalates to Owner decisions in Tasks
    await page.goto("/app/tasks?view=all");
    const tasks = page.locator('[data-table="tasks-all"]');
    await tasks.getByRole("searchbox").fill("Kierland Commons");
    await expect(tasks.getByRole("row").filter({ hasText: "Kierland Commons" }).first()).toContainText("Owner decisions");

    await page.goto("/app/sales");
    await expect(page.getByText(/Kierland Commons Suite 210/i).first()).toBeVisible();
    await page.getByRole("tab", { name: "Board" }).click();
    await expect(page.getByText(/Silverleaf Lot 18/i).first()).toBeVisible();
  });

  test("Lead with source -> priced estimate -> frozen proposal -> won -> Award builds the job and populates the Gate 0 Handoff Packet", async ({ owner: page }) => {
    const uid = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const streetNum = `7${uid.slice(0, 4)}`;
    const suite = `Ste ${uid.slice(-4)}`;
    const jobName = `${streetNum} E Camelback Rd ${suite}`;
    const address = `${jobName}, Scottsdale, AZ 85251`;
    const prefix = `C${uid.slice(-5)}`;
    const title = `Camelback ${suite} Framing & Drywall`;

    // 1. Create opportunity with source = "referral"
    const oppRes = await page.request.post("/api/sales", {
      data: {
        title,
        kind: "commercial_ti",
        source: "referral",
        address,
        valueCents: 1_450_000,
        contact: {
          name: "Devon Sterling",
          company: `Sterling Retail Group ${uid} (Synth)`,
          email: `devon.${uid}@example.com`,
          phone: "480-555-0188",
        },
        nextStep: "Walk suite and price framing",
      },
    });
    expect(oppRes.status()).toBe(201);
    const { opportunity: opp } = await oppRes.json();
    expect(opp.source).toBe("referral");

    // 2. Start an estimate from template "blank" and price a framing & drywall scope
    const estStart = await page.request.post(`/api/sales/${opp.id}/estimates`, {
      data: { template: "blank" },
    });
    expect(estStart.status()).toBe(201);
    const { estimate: draftEst } = await estStart.json();

    const body = {
      ...draftEst.body,
      title,
      sections: [
        {
          id: "sec-framing",
          name: "Metal Stud Framing & Type X Drywall",
          note: "Per Architectural Set A1.0–A4.2",
          items: [
            {
              id: "item-1",
              description: "3-5/8 20-ga metal stud framing & 5/8 Type X drywall both sides",
              kind: "installed",
              qty: 120,
              unit: "LF",
              mat: 38,
              wastePct: 5,
              hrs: 0.65,
              lab: 0,
              cost: 0,
              priceDate: "2026-10-20",
              source: "RATE_CARD",
            },
          ],
        },
      ],
      manifest: {
        basis: "site_walk",
        drawingSet: "",
        drawingDate: null,
        addenda: "",
        priorChecked: true,
      },
    };

    const saveEst = await page.request.patch(`/api/sales/estimates/${draftEst.id}`, {
      data: { body, name: "Rev 1 Base Scope" },
    });
    expect(saveEst.ok()).toBeTruthy();

    // 3. Issue the frozen proposal
    const issueRes = await page.request.post(`/api/sales/estimates/${draftEst.id}/issue`, {
      data: { confirm: true },
    });
    expect(issueRes.ok()).toBeTruthy();
    const issued = await issueRes.json();
    expect(issued.number).toContain("EST-");

    // 4. Mark opportunity Won
    const wonRes = await page.request.patch(`/api/sales/${opp.id}`, {
      data: { stage: "won", why: "Client approved Rev 1 proposal" },
    });
    expect(wonRes.ok()).toBeTruthy();

    // 5. Award the job (builds client, billing job, field job, phases, deposit draft, and Gate 0 watches)
    const awardRes = await page.request.post(`/api/sales/${opp.id}/award`, {
      data: {
        jobName,
        prefix,
        template: "both",
        pmEmail: "eli.pm@example.com",
        deposit: true,
      },
    });
    expect(awardRes.ok()).toBeTruthy();
    const awarded = await awardRes.json();
    expect(awarded.crewJobId).toBeTruthy();
    expect(awarded.watches).toBeGreaterThanOrEqual(2);

    try {
      // 6. Verify the Job Overview page renders the Gate 0 Handoff Packet (SOP-001)
      await page.goto(`/app/jobs/${awarded.crewJobId}`);
      await expect(page.getByText(/Gate 0 Handoff & Watches \(SOP-001\)/i)).toBeVisible();
      await expect(page.getByText(`Sale ${opp.number}`).first()).toBeVisible();
      await expect(page.getByText("Eli Ramirez").first()).toBeVisible();
      await expect(page.getByText(/20-day preliminary notice served/i)).toBeVisible();
    } finally {
      // Clean up open watches created by this test so repeated suite runs don't bloat the task feed
      const detailRes = await page.request.get(`/api/sales/${opp.id}`);
      if (detailRes.ok()) {
        const detail = await detailRes.json();
        for (const w of detail.job?.watches ?? []) {
          await page.request.post(`/api/sales/${opp.id}/watches`, {
            data: { id: w.id, done: true },
          });
        }
      }
    }
  });
});

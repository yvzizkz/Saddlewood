import { describe, expect, it } from "vitest";

import { priceEstimate, rollup } from "../calc";
import { screenRecipients } from "../mail";
import { buildProposal, presentAmounts } from "../presentation";
import { seatCan } from "../seat";
import { DEFAULT_SETTINGS, readSettings } from "../settings";
import { checkSignatureImage, isExecuted, readSignatureInput, snapshotHash } from "../signing";
import { DEFAULT_PRICING, newEstimateBody } from "../templates";
import type { EstimateBody, EstimateItem } from "../types";

function item(over: Partial<EstimateItem>): EstimateItem {
  return { id: over.id ?? Math.random().toString(36).slice(2), description: "x", kind: "other", qty: 1, unit: "LS", mat: 0, wastePct: 0, hrs: 0, lab: 0, cost: 0, ...over };
}

const P = { ...DEFAULT_PRICING };
const ITEMS = [
  item({ id: "lab", kind: "labor", qty: 37, hrs: 1 }),
  item({ id: "sub", kind: "sub", cost: 4210.33 }),
  item({ id: "al1", kind: "allowance", cost: 22000 }),
  item({ id: "al2", kind: "allowance", cost: 6500.5 }),
  item({ id: "mat", kind: "material", qty: 220, mat: 3.27, wastePct: 10 }),
];

describe("presentAmounts: where the markup shows", () => {
  const r = rollup(ITEMS, P);
  const sum = (a: ReturnType<typeof presentAmounts>) => [...a.lines.values()].reduce((x, y) => x + y, 0) + a.adjustments.reduce((x, y) => x + y.cents, 0);

  it("every mode adds up to the sell price", () => {
    for (const markup of ["included", "line"] as const) {
      for (const allowance of ["value", "budget_spread", "budget_line"] as const) {
        expect(sum(presentAmounts(ITEMS, P, r, markup, allowance)), `${markup}/${allowance}`).toBe(r.sell);
      }
    }
  });

  it("at value, an allowance carries overhead and profit (x1.265)", () => {
    const a = presentAmounts(ITEMS, P, r, "included", "value");
    expect(Math.abs(a.lines.get("al1")! - 2200000 * 1.265)).toBeLessThanOrEqual(2);
  });

  it("at budget, an allowance is its budget to the cent", () => {
    for (const mode of ["budget_spread", "budget_line"] as const) {
      const a = presentAmounts(ITEMS, P, r, "included", mode);
      expect(a.lines.get("al1")).toBe(2200000);
      expect(a.lines.get("al2")).toBe(650050);
    }
    expect(presentAmounts(ITEMS, P, r, "included", "budget_spread").adjustments).toEqual([]);
    expect(presentAmounts(ITEMS, P, r, "included", "budget_line").adjustments[0]).toMatchObject({ key: "allowance_markup", label: "Overhead and profit on allowances" });
  });

  it("markup as a line: prices before overhead and profit, then one line", () => {
    const a = presentAmounts(ITEMS, P, r, "line", "value");
    expect(a.lines.get("al1")).toBe(2200000);
    expect(a.adjustments).toHaveLength(1);
    // The lines are the price before overhead and profit: direct cost plus contingency.
    expect([...a.lines.values()].reduce((x, y) => x + y, 0)).toBe(r.direct + r.contingency);
    expect(a.adjustments[0].cents).toBe(r.overhead + r.profit + r.rounding);
  });
});

describe("buildProposal with the display choices", () => {
  function body(): EstimateBody {
    const b = newEstimateBody("blank", "Kitchen");
    b.sections = [{ id: "s1", name: "Work", items: ITEMS.map((i) => ({ ...i })) }];
    return b;
  }

  it("puts 'Overhead and profit' after the sections and the total still matches", () => {
    const b = body();
    b.present.markupDisplay = "line";
    const priced = priceEstimate(b);
    const p = buildProposal(b, "2026-10-19", priced);
    expect(p.adjustments.map((x) => x.label)).toEqual(["Overhead and profit"]);
    expect(p.packages[0].totalCents).toBe(priced.primary.sell);
  });

  it("can keep allowance amounts off the page", () => {
    const b = body();
    b.present.layout = "itemized";
    b.present.showAllowanceAmounts = false;
    const p = buildProposal(b, "2026-10-19");
    const lines = p.sections.flatMap((s) => s.lines);
    expect(lines.filter((l) => l.allowance).every((l) => l.amounts === undefined)).toBe(true);
    expect(lines.filter((l) => !l.allowance).every((l) => l.amounts !== undefined)).toBe(true);
  });

  it("freezes the signing terms with the proposal; a GC bid never asks for one", () => {
    const b = body();
    const p = buildProposal(b, "2026-10-19", priceEstimate(b), { ...DEFAULT_SETTINGS.signing, consentText: "I agree to all of it, electronically.", companyTitle: "Marco, Owner" });
    expect(p.sign).toMatchObject({ mode: "both", consent: "I agree to all of it, electronically.", companyTitle: "Marco, Owner" });
    b.present.allowAccept = false;
    expect(buildProposal(b, "2026-10-19").sign.mode).toBe("none");
  });
});

describe("readSettings", () => {
  it("fills anything missing or bad with the defaults", () => {
    const s = readSettings({ pricing: { profitPct: 500, overheadPct: 12 }, email: { fromAddress: "me@gmail.com", defaultLink: false, defaultAttachPdf: false } });
    expect(s.pricing.profitPct).toBe(DEFAULT_SETTINGS.pricing.profitPct);
    expect(s.pricing.overheadPct).toBe(12);
    expect(s.email.fromAddress).toBe("info@saddlewoodcontracting.com");
    expect(s.email.defaultLink).toBe(true);
    expect(readSettings("junk")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps only company addresses on the internal copy list", () => {
    const s = readSettings({ email: { notify: { internalCc: ["marco@saddlewoodcontracting.com", "x@gmail.com"] } } });
    expect(s.email.notify.internalCc).toEqual(["marco@saddlewoodcontracting.com"]);
  });
});

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// A real PNG large enough to pass the "not empty" check: the 1x1 with harmless padding chunks would be overkill; build one from bytes.
function bigPng(): string {
  const head = Buffer.from(PNG_1x1.split(",")[1], "base64");
  return `data:image/png;base64,${Buffer.concat([head, Buffer.alloc(200, 0)]).toString("base64")}`;
}

describe("signatures", () => {
  it("accepts a real PNG and refuses anything else", () => {
    expect(checkSignatureImage(bigPng()).ok).toBe(true);
    expect(checkSignatureImage("data:image/png;base64," + Buffer.alloc(300, 1).toString("base64")).ok).toBe(false);
    expect(checkSignatureImage("data:image/svg+xml;base64,PHN2Zz4=").ok).toBe(false);
    expect(checkSignatureImage(PNG_1x1).ok).toBe(false);
  });

  it("a typed signature needs its text and a style", () => {
    const base = { name: "Ana Hernandez", method: "type", image: bigPng(), agree: true };
    expect(readSignatureInput({ ...base, typed: "Ana Hernandez" }).ok).toBe(false);
    expect(readSignatureInput({ ...base, typed: "Ana Hernandez", font: "allura" }).ok).toBe(true);
    expect(readSignatureInput({ ...base, typed: "Ana Hernandez", font: "comic" }).ok).toBe(false);
    expect(readSignatureInput({ ...base, method: "draw", agree: false }).ok).toBe(false);
  });

  it("knows when every signature asked for is on", () => {
    expect(isExecuted("both", [{ role: "client" }])).toBe(false);
    expect(isExecuted("both", [{ role: "client" }, { role: "company" }])).toBe(true);
    expect(isExecuted("client", [{ role: "client" }])).toBe(true);
    expect(isExecuted("none", [{ role: "client" }])).toBe(false);
  });

  it("fingerprints the exact proposal", () => {
    expect(snapshotHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshotHash({ a: 1 })).not.toBe(snapshotHash({ a: 2 }));
  });
});

describe("who may send and sign", () => {
  const owners = DEFAULT_SETTINGS;
  const wide = { ...DEFAULT_SETTINGS, email: { ...DEFAULT_SETTINGS.email, whoMaySend: "owners_and_sales" as const }, signing: { ...DEFAULT_SETTINGS.signing, companySigners: "owners_and_sales" as const } };

  it("owners always; office staff and Sales seats when Settings allow; the token never", () => {
    expect(seatCan("owner", false, owners)).toMatchObject({ send: true, sign: true, openJob: true, editSettings: true });
    expect(seatCan("staff", false, owners)).toMatchObject({ send: false, sign: false, editSettings: false });
    expect(seatCan("staff", false, wide)).toMatchObject({ send: true, sign: true, openJob: false, editSettings: false });
    expect(seatCan("member", false, wide)).toMatchObject({ send: false, sign: false });
    expect(seatCan("member", true, wide)).toMatchObject({ send: true, sign: true });
    expect(seatCan("agent", true, wide)).toMatchObject({ send: false, sign: false, markWonLost: false });
  });
});

describe("screenRecipients", () => {
  const allow = { addresses: ["ana@example.com"], domains: ["builder.com"], updatedAt: new Date().toISOString() };

  it("ours always; outside only when the owner allowed it", () => {
    const r = screenRecipients(["marco@saddlewoodcontracting.com", "ana@example.com", "pm@builder.com", "stranger@gmail.com", "not-an-email"], allow);
    expect(r.ok).toEqual(["marco@saddlewoodcontracting.com", "ana@example.com", "pm@builder.com"]);
    expect(r.refused.map((x) => x.address)).toEqual(["stranger@gmail.com", "not-an-email"]);
    expect(r.refused[0].addCommand).toContain("outbound_allow.py add stranger@gmail.com");
  });

  it("refuses every outside address when the Mac's copy of the list is stale", () => {
    const stale = { ...allow, updatedAt: "2026-01-01T00:00:00Z" };
    const r = screenRecipients(["ana@example.com", "info@saddlewoodcontracting.com"], stale);
    expect(r.ok).toEqual(["info@saddlewoodcontracting.com"]);
    expect(r.refused[0].reason).toMatch(/allowlist lately/);
  });
});

describe("proposal recipients (owner decision 2026-10-19)", () => {
  const allow = { addresses: ["ana@example.com"], domains: [], updatedAt: new Date().toISOString() };

  it("a person's send goes to whoever they address, naming the ones off the allowlist", () => {
    const r = screenRecipients(["New.Client@Gmail.com", "ana@example.com", "marco@saddlewoodcontracting.com", "typo@@x"], allow, "addressed");
    expect(r.ok).toEqual(["new.client@gmail.com", "ana@example.com", "marco@saddlewoodcontracting.com"]);
    expect(r.unlisted).toEqual(["new.client@gmail.com"]);
    expect(r.refused.map((x) => x.address)).toEqual(["typo@@x"]);
  });

  it("does not depend on the Mac's copy of the list being fresh", () => {
    expect(screenRecipients(["new.client@gmail.com"], null, "addressed").ok).toEqual(["new.client@gmail.com"]);
  });

  it("the allowlist rule still refuses, with the owner's command", () => {
    const r = screenRecipients(["new.client@gmail.com"], allow, "allowlist");
    expect(r.ok).toEqual([]);
    expect(r.refused[0].addCommand).toMatch(/outbound_allow\.py/);
    expect(r.refused[0].addCommand).toContain("new.client@gmail.com");
  });

  it("is 'anyone you address' unless an owner chose otherwise", () => {
    expect(DEFAULT_SETTINGS.email.recipients).toBe("addressed");
    expect(readSettings({ email: { recipients: "allowlist" } }).email.recipients).toBe("allowlist");
    expect(readSettings({ email: { recipients: "everyone" } }).email.recipients).toBe("addressed");
  });

  it("signing notices go to the signer's email and every outside address the proposal was sent to", async () => {
    const { clientAddresses } = await import("../mail");
    const sigs = [{ role: "client", email: "Ana@Example.com" }] as Parameters<typeof clientAddresses>[0];
    const events = [
      { kind: "sent", detail: { mail: "proposal", to: ["ana@example.com"], cc: ["husband@example.com"] } },
      { kind: "sent", detail: { mail: "notice", to: ["someone@else.com"] } },
      { kind: "sent", detail: { mail: "proposal", to: ["info@saddlewoodcontracting.com"] } },
    ];
    expect(clientAddresses(sigs, events)).toEqual(["ana@example.com", "husband@example.com"]);
  });
});

describe("the proposal schedule's deposit follows Company policies", () => {
  it("sets the deposit step to the policy and shares the rest in proportion", async () => {
    const { scheduleWithDeposit } = await import("../settings");
    const { POLICY_DEFAULTS } = await import("@/lib/policies/rules");
    const s = [
      { label: "Deposit at signing", pct: 10 },
      { label: "Rough-in", pct: 40 },
      { label: "Finishes", pct: 40 },
      { label: "Final", pct: 10 },
    ];
    expect(scheduleWithDeposit(s, POLICY_DEFAULTS)).toEqual(s);
    const r = scheduleWithDeposit(s, { ...POLICY_DEFAULTS, "policy.deposit.pct": 25 });
    expect(r.map((x) => x.pct)).toEqual([25, 33.33, 33.33, 8.34]);
    expect(r.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100, 6);
    expect(scheduleWithDeposit([{ label: "Net 30", pct: 100 }], { ...POLICY_DEFAULTS, "policy.deposit.pct": 25 })).toEqual([{ label: "Net 30", pct: 100 }]);
  });
});

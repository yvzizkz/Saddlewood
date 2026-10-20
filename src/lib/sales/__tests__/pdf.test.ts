import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { pdfFileName, pdfSafe, renderProposalPdf, type PdfInput } from "../pdf";
import { buildProposal } from "../presentation";
import { newEstimateBody } from "../templates";
import type { EstimateBody, EstimateItem, PresentLayout } from "../types";

// A 1x1 PNG, the smallest signature picture the renderer has to take.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const JUNK = "Kitchen 🏠 — “quartz” ≤ 2½″ ✓ 東京 é ő ž́ ​ tab\there\nnew line";
const TODAY = "2026-10-19";

let n = 0;
function item(over: Partial<EstimateItem>): EstimateItem {
  return { id: `i${++n}`, description: "Line", kind: "other", qty: 1, unit: "LS", mat: 0, wastePct: 0, hrs: 0, lab: 0, cost: 100, ...over };
}

function kitchen(layout: PresentLayout, packages = true): EstimateBody {
  const b = newEstimateBody("blank", "Hernandez Kitchen Remodel");
  b.intro = "Thank you for walking the kitchen with us. Below is the work we discussed.";
  b.timeline = "About 6 weeks on site.";
  b.exclusions = ["Permits and permit fees unless listed above."];
  b.clarifications = ["Price is based on a site walk."];
  if (packages) {
    b.packages = [
      { id: "ess", name: "Essential", tagline: "Smart value", highlights: ["Stock cabinets", "Quartz"] },
      { id: "sig", name: "Signature", tagline: "Our most chosen", highlights: ["Semi-custom cabinets"], recommended: true },
      { id: "pre", name: "Premier", highlights: ["Custom inset"] },
    ];
  }
  b.sections = [
    { id: "s1", name: "Demolition", note: "Dust walls stay up.", items: [item({ description: "Demo kitchen", kind: "labor", qty: 40, unit: "HR", hrs: 1 }), item({ description: "Dumpster", kind: "equipment", cost: 650 })] },
    {
      id: "s2",
      name: "Cabinets",
      items: [
        item({ description: "Cabinet allowance", kind: "allowance", cost: 14000, packages: packages ? ["ess"] : [] }),
        item({ description: "Semi-custom cabinet allowance", kind: "allowance", cost: 22000, packages: packages ? ["sig", "pre"] : [] }),
        item({ description: "Drywall patch", kind: "installed", qty: 120, unit: "SF", mat: 0.54, hrs: 0.04, note: "Level 4 finish" }),
      ],
    },
    { id: "s3", name: "Add-ons", items: [item({ description: "Under-cabinet lighting", kind: "sub", cost: 1650, optional: true })] },
  ];
  b.present.layout = layout;
  b.present.showQuantities = layout === "itemized";
  b.present.showUnitPrices = layout === "itemized";
  return b;
}

const META: PdfInput["meta"] = {
  number: "EST-26-0001",
  date: TODAY,
  preparedFor: { name: "Ana Hernandez", attention: "Ana" },
  project: { name: "Hernandez kitchen", address: "7120 E Test Ln, Scottsdale AZ" },
};

async function check(bytes: Uint8Array): Promise<PDFDocument> {
  expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  return PDFDocument.load(bytes);
}

describe("pdfSafe", () => {
  it("keeps what the standard fonts set and never leaves what they cannot", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const out = pdfSafe(JUNK);
    for (const line of out.split("\n")) expect(() => font.widthOfTextAtSize(line, 10)).not.toThrow();
    expect(out).toContain("Kitchen");
    expect(out).toContain("—");
    expect(out).toContain("<=");
    expect(out).toContain("é");
    expect(out).toContain("o");
    expect(out).not.toMatch(/[🏠東京✓​]/u);
    // Every Latin-1 and Windows-1252 character, and the ones mapped, encode.
    let all = "";
    for (let c = 0x20; c <= 0x2fff; c++) all += String.fromCodePoint(c);
    expect(() => font.widthOfTextAtSize(pdfSafe(all).replace(/\n/g, " "), 10)).not.toThrow();
  });

  it("names the file after the number", () => {
    expect(pdfFileName("EST-26-0001", false)).toBe("Saddlewood-Proposal-EST-26-0001.pdf");
    expect(pdfFileName("EST 26/0001", true)).toBe("Saddlewood-Proposal-EST-26-0001-signed.pdf");
  });
});

describe("renderProposalPdf", () => {
  for (const layout of ["total", "sections", "itemized"] as const) {
    for (const packages of [true, false]) {
      it(`renders the ${layout} layout ${packages ? "with" : "without"} packages`, async () => {
        const proposal = buildProposal(kitchen(layout, packages), TODAY);
        const doc = await check(await renderProposalPdf({ proposal, meta: META, signatures: [] }));
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      });
    }
  }

  it("renders overhead and profit as its own line", async () => {
    const b = kitchen("sections");
    b.present.markupDisplay = "line";
    const proposal = buildProposal(b, TODAY);
    expect(proposal.adjustments.length).toBeGreaterThan(0);
    await check(await renderProposalPdf({ proposal, meta: META, signatures: [] }));
  });

  it("renders an accepted, signed copy with its signature record", async () => {
    const b = kitchen("sections");
    b.present.signing = "both";
    const proposal = buildProposal(b, TODAY);
    const opt = proposal.options[0];
    const doc = await check(
      await renderProposalPdf({
        proposal,
        meta: META,
        signatures: [
          { role: "client", name: "Ana Hernandez", title: "", method: "draw", image: PNG, at: "2026-10-20T03:50:00Z", snapshotSha256: "a".repeat(64) },
          { role: "company", name: "Marco Test", title: "Owner", method: "type", image: PNG, at: "2026-10-20T04:00:00Z", snapshotSha256: "a".repeat(64) },
        ],
        accepted: {
          name: "Ana Hernandez",
          at: "2026-10-20T03:50:00Z",
          packageId: "pre",
          packageName: "Premier",
          totalCents: proposal.packages[2].totalCents + opt.priceCents,
          options: [{ description: opt.description, priceCents: opt.priceCents }],
        },
        certificate: ["Client: Ana Hernandez, drew, Oct 19, 2026 8:50 PM, IP 203.0.113.9", `SHA-256 ${"a".repeat(64)}`],
        watermark: "Withdrawn",
      }),
    );
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("leaves blank lines for signatures still owed, and survives a bad signature picture", async () => {
    const b = kitchen("sections", false);
    b.present.signing = "both";
    const proposal = buildProposal(b, TODAY);
    await check(await renderProposalPdf({ proposal, meta: META, signatures: [] }));
    await check(
      await renderProposalPdf({
        proposal,
        meta: META,
        signatures: [{ role: "client", name: "Ana", title: "", method: "draw", image: "data:image/png;base64,AAAA", at: TODAY, snapshotSha256: "" }],
      }),
    );
  });

  it("paginates a long estimate", async () => {
    const b = kitchen("itemized", false);
    b.sections = Array.from({ length: 10 }, (_, s) => ({
      id: `sec${s}`,
      name: `Section ${s + 1}`,
      items: Array.from({ length: 30 }, (_, i) => item({ description: `Line ${s}-${i} with a fairly long description that needs to wrap onto a second line in the PDF`, qty: i + 1, unit: "EA", cost: 10 + i })),
    }));
    const doc = await check(await renderProposalPdf({ proposal: buildProposal(b, TODAY), meta: META, signatures: [] }));
    expect(doc.getPageCount()).toBeGreaterThan(5);
  });

  it("never throws on text the fonts cannot set", async () => {
    const b = kitchen("itemized");
    b.title = JUNK;
    b.intro = JUNK;
    b.timeline = JUNK;
    b.terms = `${JUNK}\n${JUNK}`;
    b.exclusions = [JUNK];
    b.clarifications = [JUNK];
    b.packages[0].name = JUNK;
    b.packages[0].tagline = JUNK;
    b.packages[0].highlights = [JUNK];
    for (const s of b.sections) {
      s.name = JUNK;
      s.note = JUNK;
      for (const i of s.items) {
        i.description = JUNK;
        i.note = JUNK;
      }
    }
    b.manifest = { basis: "plans", drawingSet: JUNK, drawingDate: TODAY, addenda: JUNK, priorChecked: true };
    const proposal = buildProposal(b, TODAY);
    const meta = { number: `EST-${JUNK}`, date: TODAY, preparedFor: { name: JUNK, attention: JUNK }, project: { name: JUNK, address: JUNK } };
    await check(
      await renderProposalPdf({
        proposal,
        meta,
        signatures: [{ role: "client", name: JUNK, title: JUNK, method: "type", image: PNG, at: TODAY, snapshotSha256: "" }],
        certificate: [JUNK],
        watermark: JUNK,
      }),
    );
  });
});

import { describe, expect, it } from "vitest";

import { joistPayload, readJoistReport } from "../joistSync";

describe("joistPayload", () => {
  it("hands the Mac our number, the lines as priced (no charge at $0), what is not included and the files", () => {
    const p = joistPayload({
      jobId: 3,
      changeOrderId: 7,
      reason: "priced",
      attempt: 1,
      joistId: null,
      number: "8009-CO50",
      title: "Shear wall",
      status: "sent",
      snapshot: {
        billTo: { name: "A Finer Touch Construction", attention: "Chris Turner" },
        job: { name: "8009 N Ironwood Dr", address: "8009 N Ironwood Dr, Paradise Valley, AZ" },
        lines: [
          { description: "Hold-downs", quantity: 10, unit: "ea", amountCents: 190000, note: "Set in epoxy" },
          { description: "Materials", amountCents: 5000, noCharge: true },
        ],
        notIncluded: [{ description: "Paneling", note: "By others" }],
        note: "Per SK8",
      },
      attachments: [{ label: "SK8", url: "https://example.test/f" }],
    });
    expect(p).toMatchObject({ jobId: 3, joistId: null, number: "8009-CO50", client: { name: "A Finer Touch Construction", attention: "Chris Turner" }, totalCents: 190000, note: "Per SK8" });
    expect(p.lines).toEqual([
      { description: "Hold-downs", quantity: 10, unit: "ea", note: "Set in epoxy", amountCents: 190000, noCharge: false },
      { description: "Materials", quantity: null, unit: "", note: "", amountCents: 0, noCharge: true },
    ]);
    expect(p.notIncluded).toEqual([{ description: "Paneling", note: "By others" }]);
  });
});

describe("readJoistReport", () => {
  it("takes a saved estimate with its numeric id and a joistapp.com link", () => {
    expect(readJoistReport({ ok: true, joistId: "52782795", joistUrl: "https://pro.joistapp.com/x/1" })).toEqual({ ok: true, value: { ok: true, joistId: 52782795, joistUrl: "https://pro.joistapp.com/x/1" } });
  });
  it("refuses a link anywhere else, a missing id, and a failure with no reason", () => {
    expect(readJoistReport({ ok: true, joistId: 1, joistUrl: "https://evil.example/joistapp.com/" }).ok).toBe(false);
    expect(readJoistReport({ ok: true, joistId: "abc" }).ok).toBe(false);
    expect(readJoistReport({ ok: false, error: "  " }).ok).toBe(false);
    expect(readJoistReport(null).ok).toBe(false);
  });
  it("keeps a failure's reason, trimmed", () => {
    expect(readJoistReport({ ok: false, error: " Record not found " })).toEqual({ ok: true, value: { ok: false, error: "Record not found" } });
  });
});

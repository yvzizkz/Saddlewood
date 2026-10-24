import { describe, expect, it } from "vitest";

import { botPaymentSchema, normInvoiceNo } from "../botPayments";

describe("normInvoiceNo (the bot's rule)", () => {
  it("drops AFT's job code and pads the sequence", () => {
    expect(normInvoiceNo("AFT123-8009-7")).toBe("8009-07");
    expect(normInvoiceNo("Inv AFT123-8009-04")).toBe("8009-04");
    expect(normInvoiceNo(" 8009-4 ")).toBe("8009-04");
    expect(normInvoiceNo("8009-13")).toBe("8009-13");
    expect(normInvoiceNo("SWC-12")).toBe("SWC-12");
  });
});

describe("botPaymentSchema", () => {
  const P = { pNumber: 12, invoice: "8009-14", client: "AFT", amountCents: 50_000, receivedOn: "2026-10-20", method: "melio", joistId: 991, evidence: "melio receipt" };

  it("takes what accounting.py sends", () => {
    expect(botPaymentSchema.parse(P)).toEqual({ ...P, joistId: "991" });
  });

  it("an unknown method is other; a missing one too", () => {
    expect(botPaymentSchema.parse({ ...P, method: "chase" }).method).toBe("other");
    const { method: _m, ...rest } = P;
    void _m;
    expect(botPaymentSchema.parse(rest).method).toBe("other");
  });

  it("refuses what cannot be recorded", () => {
    for (const bad of [{ pNumber: 0 }, { pNumber: 1.5 }, { invoice: "" }, { amountCents: 0 }, { amountCents: 10.5 }, { receivedOn: "10/20/2026" }]) {
      expect(botPaymentSchema.safeParse({ ...P, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

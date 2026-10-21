import { describe, expect, it } from "vitest";

import { usd } from "../money";

// The copies it replaced (cleanup Batch 4), each with what it printed: the
// one formatter prints the same for amounts the app shows.

const AMOUNTS = [0, 1, 99, 100, 5_000, 50_025, 123_456, 1_000_000, 2_500_000_00];

describe("usd", () => {
  it("is the old currency format (Money, documents, PDFs, mail, view alerts, bids)", () => {
    for (const c of AMOUNTS) expect(usd(c)).toBe((c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));
    expect(usd(123_456)).toBe("$1,234.56");
  });

  it("whole is the old whole-dollar copies (checks, policies, Waiting on you, sub rules)", () => {
    for (const c of AMOUNTS) {
      expect(usd(c, { whole: true })).toBe((c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
      expect(usd(c, { whole: true })).toBe(`$${Math.round(c / 100).toLocaleString("en-US")}`);
    }
  });

  it("is the award note's $-and-two-decimals for any amount above zero", () => {
    for (const c of AMOUNTS) expect(usd(c)).toBe(`$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  });

  it("cents auto is the material requests' format", () => {
    for (const c of AMOUNTS) {
      const whole = c % 100 === 0;
      expect(usd(c, { cents: "auto" })).toBe(`$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`);
    }
    expect(usd(50_000, { cents: "auto" })).toBe("$500");
    expect(usd(50_025, { cents: "auto" })).toBe("$500.25");
  });

  it("compact from $100,000", () => {
    expect(usd(2_500_000_00, { compact: true })).toBe("$2.5M");
    expect(usd(99_999_00, { compact: true })).toBe("$99,999.00");
  });
});

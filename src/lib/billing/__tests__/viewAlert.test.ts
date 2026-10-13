import { describe, expect, it } from "vitest";

import type { DocumentEvent } from "../types";
import { alertMessage, QUIET_MINUTES, shouldAlert } from "../viewAlert";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const NOW = new Date("2026-10-13T16:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function ev(over: Partial<DocumentEvent>): DocumentEvent {
  return { id: 1, documentId: "d", kind: "viewed", at: ago(1), actor: "client link", automatic: false, emailId: null, detail: {}, ...over };
}

describe("view alerts to Marco", () => {
  it("alerts on the first opening", () => {
    expect(shouldAlert([ev({ kind: "sent", actor: "billing_send" })], NOW)).toBe(true);
  });

  it("folds openings close together into one alert", () => {
    expect(shouldAlert([ev({ at: ago(2) })], NOW)).toBe(false);
    expect(shouldAlert([ev({ kind: "downloaded", at: ago(QUIET_MINUTES - 1) })], NOW)).toBe(false);
  });

  it("alerts again after a quiet spell", () => {
    expect(shouldAlert([ev({ at: ago(QUIET_MINUTES + 1) })], NOW)).toBe(true);
  });

  it("does not let a mail scanner's opening swallow the person's", () => {
    expect(shouldAlert([ev({ automatic: true, at: ago(1) })], NOW)).toBe(true);
  });

  it("says who, what, when and on what", () => {
    const m = alertMessage({
      doc: { id: "abc", kind: "invoice", number: "8009-13", totalCents: 964300, revision: 2 },
      clientName: "A Finer Touch Construction LLC",
      kind: "viewed",
      at: NOW,
      userAgent: IPHONE,
      siteUrl: "https://saddlewoodcontracting.com/",
    });
    expect(m.subject).toBe("A Finer Touch Construction LLC opened Invoice 8009-13");
    expect(m.text).toContain("($9,643.00)");
    expect(m.text).toContain("9:00 AM");
    expect(m.text).toContain("iPhone");
    expect(m.text).toContain("https://saddlewoodcontracting.com/app/money/abc");
  });

  it("names the file on a download", () => {
    const m = alertMessage({
      doc: { id: "abc", kind: "invoice", number: "8009-14", totalCents: 1988186, revision: 1 },
      clientName: "A Finer Touch Construction LLC",
      kind: "downloaded",
      what: "Conditional waiver 8009-14",
      at: NOW,
      userAgent: null,
      siteUrl: "https://saddlewoodcontracting.com",
    });
    expect(m.subject).toBe("A Finer Touch Construction LLC downloaded Conditional waiver 8009-14 (Invoice 8009-14)");
  });
});

describe("our people's copy of a billing message", () => {
  it("marks our document pages so opening them from the copy is not the client", async () => {
    const { copyLinks } = await import("../send");
    const out = copyLinks([
      { label: "Invoice 8009-14", url: "https://saddlewoodcontracting.com/d/abc" },
      { label: "In Joist", url: "https://client.joistapp.com/invoices/x" },
      { label: "Already", url: "https://saddlewoodcontracting.com/d/abc?copy=1" },
    ]);
    expect(out[0].url).toBe("https://saddlewoodcontracting.com/d/abc?copy=1");
    expect(out[1].url).toBe("https://client.joistapp.com/invoices/x");
    expect(out[2].url).toBe("https://saddlewoodcontracting.com/d/abc?copy=1");
  });

  it("puts the document's button and the others in one row when {link} sits above {links}", async () => {
    const { buildMessage } = await import("../send");
    const m = buildMessage({
      subject: "s",
      body: "Hello\n\n{link}\n{links}\n\nThanks",
      document: { link: "https://saddlewoodcontracting.com/d/abc", label: "View invoice" },
      links: [{ label: "Invoice 8009-14", url: "https://saddlewoodcontracting.com/d/def" }],
    });
    if ("error" in m) throw new Error(m.error);
    const rows = m.html.match(/<p style="margin:4px 0 12px">.*?<\/p>/g) ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("View invoice");
    expect(rows[0]).toContain("Invoice 8009-14");
    expect(m.text).toContain("View invoice: https://saddlewoodcontracting.com/d/abc");
  });
});

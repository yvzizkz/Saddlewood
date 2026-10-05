import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import { totalOf } from "../documents";
import { readMailReport, verifyMailSignature } from "../mailEvents";
import { nextChangeOrderNumber, nextNumber, normalizeNumber, sequenceOf } from "../numbering";
import { describeDevice, looksAutomatic, summarizeProof } from "../proof";
import type { DocumentEvent } from "../types";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

describe("document numbers", () => {
  it("stores one spelling of a number", () => {
    // Joist held "4847-  16" and "4847- 16" as two invoices, and "3526--02".
    expect(normalizeNumber("4847-  16")).toBe("4847-16");
    expect(normalizeNumber(" 4847- 16 ")).toBe("4847-16");
    expect(normalizeNumber("3526--02")).toBe("3526-02");
    expect(normalizeNumber("#8009-10")).toBe("8009-10");
    expect(normalizeNumber("co-3")).toBe("CO-3");
  });

  it("reads the sequence only from our own pattern", () => {
    expect(sequenceOf("8009-10", "8009")).toBe(10);
    expect(sequenceOf("8009-09", "8009")).toBe(9);
    expect(sequenceOf("80091-10", "8009")).toBeNull();
    expect(sequenceOf("8009-10-A", "8009")).toBeNull();
    expect(sequenceOf("4125-082326CO", "4125")).toBeNull();
  });

  it("hands out one past the highest, never a number already used", () => {
    expect(nextNumber("8009", [])).toBe("8009-01");
    expect(nextNumber("8009", ["8009-09", "8009-10", "8009- 10"])).toBe("8009-11");
    expect(nextNumber("8009", ["8009-03", "8009-01"])).toBe("8009-04");
    expect(nextNumber("8009", ["8009-99"])).toBe("8009-100");
    // Old hand-typed variants and another job's numbers do not count.
    expect(nextNumber("5203", ["5203-12", "5203-MAY MASTER INVOICE", "8009-40"])).toBe("5203-13");
  });

  it("refuses to number a job that has no prefix", () => {
    expect(() => nextNumber(" ", [])).toThrow(/prefix/);
  });

  it("numbers change orders CO-1, CO-2", () => {
    expect(nextChangeOrderNumber([])).toBe("CO-1");
    expect(nextChangeOrderNumber(["CO-1", "co-2"])).toBe("CO-3");
    expect(nextChangeOrderNumber(["CO-9"])).toBe("CO-10");
  });
});

describe("document totals", () => {
  it("adds the lines in whole cents", () => {
    expect(totalOf({ lines: [{ description: "Framing", amountCents: 2225719 }, { description: "Credit", amountCents: -50000 }] })).toBe(2175719);
    expect(totalOf({})).toBe(0);
  });

  it("refuses a fraction of a cent", () => {
    expect(() => totalOf({ lines: [{ description: "x", amountCents: 10.5 }] })).toThrow(/whole cents/);
  });
});

describe("is a view a person or a scanner", () => {
  const at = new Date("2026-10-06T16:00:00Z");

  it("takes an ordinary browser, well after sending, as a person", () => {
    expect(looksAutomatic({ userAgent: IPHONE, at, lastSentOrDeliveredAt: new Date("2026-10-06T15:00:00Z") })).toBe(false);
    expect(looksAutomatic({ userAgent: CHROME_WIN, at, lastSentOrDeliveredAt: null })).toBe(false);
  });

  it("marks scanners, scripts and missing agents", () => {
    for (const ua of ["", null, "curl/8.4.0", "python-requests/2.32", "Mozilla/5.0 (compatible; Proofpoint)", "Barracuda Sentinel (EE)", "Mozilla/5.0 HeadlessChrome/120", "Slackbot-LinkExpanding 1.0", "Mozilla/5.0 (compatible; Googlebot/2.1)"]) {
      expect(looksAutomatic({ userAgent: ua, at }), String(ua)).toBe(true);
    }
  });

  it("marks an opening within seconds of delivery, whatever it calls itself", () => {
    expect(looksAutomatic({ userAgent: CHROME_WIN, at, lastSentOrDeliveredAt: new Date(at.getTime() - 4_000) })).toBe(true);
    expect(looksAutomatic({ userAgent: CHROME_WIN, at, lastSentOrDeliveredAt: new Date(at.getTime() - 60_000) })).toBe(false);
  });

  it("marks prefetches and anything that is not a page load", () => {
    expect(looksAutomatic({ userAgent: CHROME_WIN, at, purpose: "prefetch" })).toBe(true);
    expect(looksAutomatic({ userAgent: CHROME_WIN, at, method: "HEAD" })).toBe(true);
  });

  it("describes a device plainly", () => {
    expect(describeDevice(IPHONE)).toBe("Safari on iPhone");
    expect(describeDevice(CHROME_WIN)).toBe("Chrome on Windows");
    expect(describeDevice(null)).toBe("unknown device");
  });
});

describe("the proof summary", () => {
  let id = 0;
  const ev = (kind: DocumentEvent["kind"], at: string, extra: Partial<DocumentEvent> = {}): DocumentEvent => ({
    id: ++id,
    documentId: "d1",
    kind,
    at,
    actor: "",
    automatic: false,
    emailId: null,
    detail: {},
    ...extra,
  });

  it("says not sent when nothing happened", () => {
    const s = summarizeProof([]);
    expect(s.state).toBe("not_sent");
    expect(s.viewCount).toBe(0);
  });

  it("tells the July story: sent, delivered, viewed twice by a person, once by a scanner", () => {
    const s = summarizeProof([
      ev("viewed", "2026-07-09T17:02:00Z", { detail: { ua: CHROME_WIN } }),
      ev("sent", "2026-07-08T15:00:00Z", { detail: { to: ["AP@client.example"] } }),
      ev("delivered", "2026-07-08T15:00:03Z"),
      ev("viewed", "2026-07-08T15:00:05Z", { automatic: true, detail: { ua: "Proofpoint" } }),
      ev("viewed", "2026-07-21T20:15:00Z", { detail: { ua: IPHONE } }),
    ]);
    expect(s.state).toBe("viewed");
    expect(s.sentTo).toEqual(["ap@client.example"]);
    expect(s.deliveredAt).toBe("2026-07-08T15:00:03Z");
    expect(s.viewCount).toBe(2);
    expect(s.automaticViewCount).toBe(1);
    expect(s.firstViewedAt).toBe("2026-07-09T17:02:00Z");
    expect(s.lastViewedAt).toBe("2026-07-21T20:15:00Z");
    expect(s.views.map((v) => v.device)).toEqual(["Chrome on Windows", "Safari on iPhone"]);
  });

  it("does not call a scanner's visit a view", () => {
    const s = summarizeProof([ev("sent", "2026-07-08T15:00:00Z"), ev("delivered", "2026-07-08T15:00:03Z"), ev("viewed", "2026-07-08T15:00:05Z", { automatic: true })]);
    expect(s.state).toBe("delivered");
    expect(s.firstViewedAt).toBeNull();
  });

  it("reports a bounce until a later send is delivered", () => {
    const bounced = [ev("sent", "2026-07-08T15:00:00Z"), ev("bounced", "2026-07-08T15:00:04Z")];
    expect(summarizeProof(bounced).state).toBe("bounced");
    expect(summarizeProof([...bounced, ev("sent", "2026-07-09T15:00:00Z"), ev("delivered", "2026-07-09T15:00:02Z")]).state).toBe("delivered");
  });

  it("counts a hand-recorded portal upload as delivered", () => {
    const s = summarizeProof([ev("portal_submitted", "2026-09-20T18:00:00Z")]);
    expect(s.state).toBe("delivered");
    expect(s.portalSubmittedAt).toBe("2026-09-20T18:00:00Z");
  });
});

describe("delivery reports from the mail service", () => {
  const secretBytes = Buffer.from("0123456789abcdef0123456789abcdef");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const now = new Date("2026-10-06T16:00:00Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const body = JSON.stringify({ type: "email.delivered", created_at: "2026-10-06T15:59:58.000Z", data: { email_id: "em_123", to: ["ap@client.example"] } });
  const sign = (id: string, ts: string, b: string, key = secretBytes) =>
    `v1,${createHmac("sha256", key).update(`${id}.${ts}.${b}`).digest("base64")}`;
  const good = { id: "msg_1", timestamp, signature: sign("msg_1", timestamp, body) };

  it("accepts a report signed with our secret", () => {
    expect(verifyMailSignature(secret, good, body, now)).toBe(true);
    expect(verifyMailSignature(secret, { ...good, signature: `v1,AAAA ${good.signature}` }, body, now)).toBe(true);
  });

  it("refuses everything else", () => {
    expect(verifyMailSignature(undefined, good, body, now)).toBe(false);
    expect(verifyMailSignature("", good, body, now)).toBe(false);
    expect(verifyMailSignature("whsec_c2hvcnQ=", good, body, now)).toBe(false);
    expect(verifyMailSignature(secret, good, body.replace("em_123", "em_999"), now)).toBe(false);
    expect(verifyMailSignature(secret, { ...good, id: "msg_2" }, body, now)).toBe(false);
    expect(verifyMailSignature(secret, { ...good, signature: null }, body, now)).toBe(false);
    expect(verifyMailSignature(secret, { ...good, signature: sign("msg_1", timestamp, body, Buffer.from("another-secret-of-enough-length!")) }, body, now)).toBe(false);
    // The same report, replayed an hour later.
    expect(verifyMailSignature(secret, good, body, new Date(now.getTime() + 3600_000))).toBe(false);
  });

  it("keeps delivered, bounced and complained, and nothing else", () => {
    expect(readMailReport(JSON.parse(body))).toEqual({
      kind: "delivered",
      emailId: "em_123",
      at: "2026-10-06T15:59:58.000Z",
      detail: { to: ["ap@client.example"] },
    });
    expect(readMailReport({ type: "email.bounced", data: { email_id: "em_1", bounce: { type: "Permanent", message: "no such user" } } })?.kind).toBe("bounced");
    expect(readMailReport({ type: "email.complained", data: { email_id: "em_1" } })?.kind).toBe("complained");
    for (const type of ["email.sent", "email.opened", "email.clicked", "email.delivery_delayed", "toString"]) {
      expect(readMailReport({ type, data: { email_id: "em_1" } }), type).toBeNull();
    }
    expect(readMailReport({ type: "email.delivered", data: {} })).toBeNull();
    expect(readMailReport(null)).toBeNull();
  });
});

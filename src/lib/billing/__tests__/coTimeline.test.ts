import { describe, expect, it } from "vitest";

import { buildTimeline, type CoEvent } from "../coTimeline";
import type { DocumentEvent } from "../types";

const co = (kind: CoEvent["kind"], at: string, actor = "", detail: Record<string, unknown> = {}): CoEvent => ({ kind, at, actor, detail });
const doc = (kind: DocumentEvent["kind"], at: string, over: Partial<DocumentEvent> = {}): DocumentEvent => ({
  id: 0,
  documentId: "d1",
  kind,
  at,
  actor: "client link",
  automatic: false,
  emailId: null,
  detail: {},
  ...over,
});

describe("buildTimeline", () => {
  const register = [
    co("requested", "2026-10-30T15:00:00Z", "Chris Turner (AFT)", { subject: "Sheer wall change at garage" }),
    co("drafted", "2026-10-30T15:00:01Z", "ops", { number: "8009-CO50" }),
    co("priced", "2026-10-30T18:00:00Z", "marco@saddlewoodcontracting.com", { amountCents: 300050 }),
    co("sent", "2026-10-30T18:00:01Z", "marco@saddlewoodcontracting.com", { to: ["pm.aft@example.com"] }),
  ];

  it("reads in order, with who and the amounts", () => {
    const lines = buildTimeline(register);
    expect(lines.map((l) => l.text)).toEqual([
      'Asked for by Chris Turner (AFT) (email "Sheer wall change at garage")',
      "Draft 8009-CO50 made by ops",
      "Priced at $3,000.50 by marco@saddlewoodcontracting.com",
      "Sent to pm.aft@example.com by marco@saddlewoodcontracting.com",
    ]);
  });

  it("leaves amounts out for a seat without money", () => {
    const lines = buildTimeline(register, [], { money: false });
    expect(lines[2].text).toBe("Priced by marco@saddlewoodcontracting.com");
    expect(lines.some((l) => l.text.includes("$"))).toBe(false);
  });

  it("folds the client's openings into one line a day, and skips scanners and staff", () => {
    const events = [
      doc("delivered", "2026-10-30T18:00:05Z", { actor: "resend", automatic: true }),
      doc("viewed", "2026-10-30T18:01:00Z", { automatic: true }),
      doc("viewed", "2026-10-30T19:00:00Z"),
      doc("viewed", "2026-10-30T19:05:00Z"),
      doc("downloaded", "2026-10-30T19:06:00Z"),
      doc("viewed", "2026-10-30T19:30:00Z", { actor: "staff" }),
      doc("viewed", "2026-10-31T16:00:00Z"),
    ];
    const lines = buildTimeline([], events, { dayOf: (at) => at.slice(0, 10) });
    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ["delivered", "Delivered to their inbox"],
      ["viewed", "Opened by the client (2 times), downloaded a file"],
      ["viewed", "Opened by the client"],
    ]);
  });

  it("marks bounces, rejections and a voided invoice that reopened it", () => {
    const lines = buildTimeline(
      [co("rejected", "2026-11-02T10:00:00Z", "marco@x.com", { note: "Client went another way" }), co("updated", "2026-11-03T10:00:00Z", "", { status: "signed", why: "INV-12 was voided" })],
      [doc("bounced", "2026-11-01T10:00:00Z", { actor: "resend", automatic: true })],
    );
    expect(lines.map((l) => [l.tone, l.text])).toEqual([
      ["warn", "The email bounced: check the address"],
      ["warn", "Rejected by marco@x.com: Client went another way"],
      ["warn", "Back to signed: INV-12 was voided"],
    ]);
  });

  it("shows the client's signature but not ours", () => {
    const lines = buildTimeline([], [doc("signed", "2026-11-01T10:00:00Z", { detail: { role: "client" } }), doc("signed", "2026-11-01T11:00:00Z", { actor: "owner", detail: { role: "company" } })]);
    expect(lines.map((l) => l.text)).toEqual(["The client signed it on the link"]);
  });
});

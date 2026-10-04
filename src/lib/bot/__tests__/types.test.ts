import { describe, expect, it } from "vitest";

import {
  actionSchema,
  describeCadence,
  laneForAction,
  newMessageSchema,
  parseSection,
  pathThreadKey,
  safeFileName,
  syncPostSchema,
  type BotActionInput,
} from "../types";

const FILE = "u/0123456789abcdef/202610/a1b2c3d4e5f6-receipt.jpg";

describe("what a person may send", () => {
  it("takes an approval for a numbered draft and nothing looser", () => {
    expect(actionSchema.safeParse({ kind: "draft.approve", payload: { n: 18 } }).success).toBe(true);
    expect(actionSchema.safeParse({ kind: "draft.approve", payload: { n: "18" } }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "draft.approve", payload: {} }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "draft.send-everything", payload: {} }).success).toBe(false);
  });

  it("only takes a 24-hour clock time for a scheduled send", () => {
    expect(actionSchema.safeParse({ kind: "draft.schedule", payload: { n: 4, at: "08:05" } }).success).toBe(true);
    expect(actionSchema.safeParse({ kind: "draft.schedule", payload: { n: 4, at: "8:05 pm" } }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "draft.schedule", payload: { n: 4, at: "24:00" } }).success).toBe(false);
  });

  it("has no way to turn automatic sending ON", () => {
    expect(actionSchema.safeParse({ kind: "autosend.off", payload: {} }).success).toBe(true);
    expect(actionSchema.safeParse({ kind: "autosend.on", payload: {} }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "autosend.set", payload: { on: true } }).success).toBe(false);
  });

  it("requires the weekday for a weekly duty and caps the day of the month at 28", () => {
    const duty = (cadence: unknown) =>
      actionSchema.safeParse({
        kind: "duty.add",
        payload: { title: "Unpaid invoices", instruction: "List what is unpaid past 30 days.", cadence },
      }).success;
    expect(duty({ type: "weekdays", time: "07:00" })).toBe(true);
    expect(duty({ type: "weekly", time: "07:00" })).toBe(false);
    expect(duty({ type: "weekly", time: "07:00", weekday: 5 })).toBe(true);
    expect(duty({ type: "monthly", time: "07:00", monthday: 31 })).toBe(false);
  });

  it("sends the slow work to the lane that is allowed to be slow", () => {
    const lane = (a: BotActionInput) => laneForAction(a);
    expect(lane({ kind: "draft.approve", payload: { n: 1 } })).toBe("fast");
    expect(lane({ kind: "payment.confirm", payload: { n: 1, yes: false } })).toBe("fast");
    expect(lane({ kind: "payment.confirm", payload: { n: 1, yes: true } })).toBe("agent");
    expect(lane({ kind: "duty.run", payload: { id: "unpaid-invoices" } })).toBe("agent");
  });

  it("needs words or a file in a message, and only files this app issued", () => {
    expect(newMessageSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(newMessageSchema.safeParse({ body: "what is waiting on me" }).success).toBe(true);
    expect(newMessageSchema.safeParse({ body: "", attachments: [{ path: FILE, name: "receipt.jpg" }] }).success).toBe(true);
    for (const path of ["../../etc/passwd", "u/short/202610/a1b2c3d4e5f6-x.jpg", "x/0123456789abcdef/202610/a1b2c3d4e5f6-x.jpg"]) {
      expect(newMessageSchema.safeParse({ body: "", attachments: [{ path, name: "x" }] }).success).toBe(false);
    }
  });
});

describe("file paths", () => {
  it("reads the owner's folder out of an issued path", () => {
    expect(pathThreadKey(FILE)).toBe("0123456789abcdef");
    expect(pathThreadKey("u/0123456789abcdef/../x")).toBeNull();
  });

  it("makes any file name safe for a storage path", () => {
    expect(safeFileName("IMG 4521 (1).HEIC")).toBe("IMG-4521-1-.HEIC");
    expect(safeFileName("../../secret")).toBe("secret");
    expect(safeFileName("###")).toBe("file");
  });
});

describe("what the Mac reports", () => {
  it("keeps the rows that parse and drops the ones that do not", () => {
    const drafts = parseSection("drafts", [
      { n: 18, subject: "Powell payment 10", to: "mark@example.com", created: "2026-09-30T04:28:02Z", status: "open", held: false, approvers: ["Lando", "Marco"] },
      { subject: "no number" },
      "junk",
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ n: 18, held: false, blocked: null, cc: [], sendAt: null, approvers: ["Lando", "Marco"] });
  });

  it("falls back to an empty picture instead of throwing", () => {
    expect(parseSection("drafts", "nope")).toEqual([]);
    expect(parseSection("health", null).problems).toEqual({});
    expect(parseSection("people", { "eli@saddlewoodcontracting.com": { name: "Eli", role: "admin" } })).toEqual({
      "eli@saddlewoodcontracting.com": { name: "Eli", role: "requester" },
    });
  });

  it("only lets a notification point back into the app", () => {
    const kept = (url: string) =>
      syncPostSchema.parse({ lane: "fast", notify: [{ to: "owners", title: "Draft #21 needs your OK", url }] }).notify.length;
    expect(kept("/app")).toBe(1);
    expect(kept("/app/ask")).toBe(1);
    expect(kept("https://evil.example/app")).toBe(0);
    expect(kept("//evil.example")).toBe(0);
    expect(kept("/internal/ops")).toBe(0);
  });

  it("stores what the Mac sends without choking on it", () => {
    const report = syncPostSchema.parse({
      lane: "agent",
      messages: [{ id: 7, outcome: "reply", body: `ok\u0000${"x".repeat(70000)}` }, { id: "x", outcome: "reply" }, "junk"],
      posts: [{ thread: "Lando@SaddlewoodContracting.com", body: "report" }, { thread: "not-an-email", body: "x" }],
    });
    expect(report.messages).toHaveLength(1);
    expect(report.messages[0].body).toHaveLength(60000);
    expect(report.messages[0].body.includes("\u0000")).toBe(false);
    expect(report.posts).toEqual([{ thread: "lando@saddlewoodcontracting.com", body: "report", files: [], meta: {} }]);
  });

  it("treats a draft whose hold flag is unreadable as held", () => {
    const [draft] = parseSection("drafts", [
      { n: 18, subject: "s", to: "a@b.example", created: "2026-10-01T00:00:00Z", status: "open", held: "no", approvers: ["Lando"] },
    ]);
    expect(draft.held).toBe(true);
  });
});

describe("cadence in words", () => {
  it("says it the way a person would", () => {
    expect(describeCadence({ type: "weekdays", time: "07:00" })).toBe("Weekdays at 7:00 AM");
    expect(describeCadence({ type: "weekly", time: "15:00", weekday: 5 })).toBe("Every Friday at 3:00 PM");
    expect(describeCadence({ type: "monthly", time: "12:30", monthday: 23 })).toBe("The 23rd of each month at 12:30 PM");
    expect(describeCadence({ type: "monthly", time: "00:05", monthday: 11 })).toBe("The 11th of each month at 12:05 AM");
  });
});

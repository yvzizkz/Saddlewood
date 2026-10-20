import { describe, expect, it } from "vitest";

import { allowAddCommand, allowedByMirror, checkRecipients, mirrorIsFresh, recipientStatus, type AllowMirror } from "../send";
import { readMessage, readMessageInput } from "../sendGroups";

// Billing step 3: both lists must agree, on the server. The client's contacts
// are the site's; the owner's allowlist lives on the Mac and is mirrored
// read-only. A missing or stale mirror vouches for nobody outside.

const NOW = Date.parse("2026-10-19T20:00:00Z");
const fresh: AllowMirror = { addresses: ["AP@aft.com", "chris.t@aftconstruction.com"], domains: ["@schiffererbuilt.com"], updatedAt: "2026-10-19T19:00:00Z" };
const stale: AllowMirror = { ...fresh, updatedAt: "2026-10-16T19:00:00Z" };
const CONTACTS = ["ap@aft.com", "jenelle@aft.com", "pay@schiffererbuilt.com"];

describe("the allowlist mirror", () => {
  it("is fresh for two days, then not", () => {
    expect(mirrorIsFresh(fresh, NOW)).toBe(true);
    expect(mirrorIsFresh(stale, NOW)).toBe(false);
    expect(mirrorIsFresh(null, NOW)).toBe(false);
    expect(mirrorIsFresh({ ...fresh, updatedAt: "yesterday" }, NOW)).toBe(false);
  });

  it("allows an address, a whole domain, and always the company", () => {
    expect(allowedByMirror("ap@aft.com", fresh)).toBe(true);
    expect(allowedByMirror("someone@schiffererbuilt.com", fresh)).toBe(true);
    expect(allowedByMirror("marco@saddlewoodcontracting.com", fresh)).toBe(true);
    expect(allowedByMirror("x@evil.com", fresh)).toBe(false);
  });

  it("names the owner's command, never runs it", () => {
    expect(allowAddCommand("New@Client.com")).toBe('python3 ~/dev/Saddlewood-KB/bot/outbound_allow.py add new@client.com --who "<name>" --note "<why>"');
  });
});

describe("where a recipient stands", () => {
  it("marks each address against the two lists", () => {
    expect(recipientStatus("info@saddlewoodcontracting.com", CONTACTS, fresh, NOW)).toEqual({ status: "company" });
    expect(recipientStatus("ap@aft.com", CONTACTS, fresh, NOW)).toEqual({ status: "ok" });
    expect(recipientStatus("chris.t@aftconstruction.com", CONTACTS, fresh, NOW)).toEqual({ status: "allowed_not_contact" });
    expect(recipientStatus("jenelle@aft.com", CONTACTS, fresh, NOW).status).toBe("contact_not_allowed");
    expect(recipientStatus("jenelle@aft.com", CONTACTS, fresh, NOW).addCommand).toContain("jenelle@aft.com");
    expect(recipientStatus("x@evil.com", CONTACTS, fresh, NOW).status).toBe("unknown");
    expect(recipientStatus("ap@aft.com", CONTACTS, stale, NOW)).toEqual({ status: "no_mirror" });
    expect(recipientStatus("ap@aft.com", CONTACTS, null, NOW)).toEqual({ status: "no_mirror" });
  });
});

describe("checkRecipients with the mirror", () => {
  it("passes a contact the owner allowed, by address or by domain", () => {
    const r = checkRecipients(["ap@aft.com"], ["pay@schiffererbuilt.com", "info@saddlewoodcontracting.com"], CONTACTS, fresh, NOW);
    expect(r).toEqual({ ok: true, recipients: { to: ["ap@aft.com"], cc: ["pay@schiffererbuilt.com", "info@saddlewoodcontracting.com"] } });
  });

  it("refuses a contact the owner never allowed, and says how an owner adds it", () => {
    const r = checkRecipients(["jenelle@aft.com"], [], CONTACTS, fresh, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not on the owner's outbound allowlist .*outbound_allow\.py add jenelle@aft\.com/);
  });

  it("still names a stranger as not a contact first", () => {
    const r = checkRecipients(["x@evil.com"], [], CONTACTS, fresh, NOW);
    expect(r).toEqual({ ok: false, error: "x@evil.com is not a contact on file for this client" });
  });

  it("refuses every outside address while the Mac has not reported the list", () => {
    for (const allow of [null, undefined, stale]) {
      const r = checkRecipients(["ap@aft.com"], [], CONTACTS, allow, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("the Mac has not reported the owner allowlist");
    }
    // Our own people still get a plain note.
    expect(checkRecipients(["info@saddlewoodcontracting.com"], [], [], null, NOW).ok).toBe(true);
  });
});

describe("the group's working message", () => {
  it("reads what is stored leniently", () => {
    expect(readMessage(null)).toEqual({});
    expect(readMessage({ subject: "s", body: "b", to: ["AP@aft.com", "bad"], cc: [], sentAt: "2026-10-19T20:00:00Z", junk: 1 })).toEqual({
      subject: "s",
      body: "b",
      to: ["ap@aft.com"],
      cc: [],
      sentAt: "2026-10-19T20:00:00Z",
    });
  });

  it("reads a change strictly", () => {
    expect(readMessageInput({ subject: " Hi ", to: ["AP@aft.com", "ap@aft.com"] })).toEqual({ ok: true, value: { subject: "Hi", to: ["ap@aft.com"] } });
    expect(readMessageInput({ sentAt: "now" })).toEqual({ ok: false, error: "message.sentAt is not something a message has" });
    expect(readMessageInput({ to: ["not an address"] })).toEqual({ ok: false, error: "message.to has an address that is not valid" });
    expect(readMessageInput({ body: "x".repeat(6001) }).ok).toBe(false);
    expect(readMessageInput("hi").ok).toBe(false);
  });
});

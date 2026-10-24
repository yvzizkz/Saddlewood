import { describe, expect, it } from "vitest";

import { matchContact, type ContactRow } from "../contacts";

// Award's rule, the same as 0056's client_contact_match(): the email when
// there is one, else the name; case-insensitive; active contacts; oldest first.

const row = (id: string, name: string, email: string, over: Partial<ContactRow> = {}): ContactRow => ({ id, name, email, active: true, created_at: `2026-10-0${id}T00:00:00Z`, ...over });

describe("matchContact", () => {
  const rows = [row("2", "Dana Patrick", "dana@example.com"), row("1", "Dana Patrick", "DANA@example.com"), row("3", "Sam Lee", ""), row("4", "Old Dana", "old@example.com", { active: false })];

  it("matches by email, any case, oldest first", () => {
    expect(matchContact(rows, "Someone Else", " Dana@Example.com ")).toBe("1");
  });

  it("matches by name only when no email is given", () => {
    expect(matchContact(rows, "sam lee", "")).toBe("3");
    expect(matchContact(rows, "Sam Lee", "sam@example.com")).toBeNull();
  });

  it("never matches an inactive contact, or nothing", () => {
    expect(matchContact(rows, "", "old@example.com")).toBeNull();
    expect(matchContact(rows, "", "")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { hasInbox, loginEmail } from "../username";

describe("loginEmail", () => {
  it("turns a username into its crew-domain seat", () => {
    expect(loginEmail("angel.l")).toBe("angel.l@crew.saddlewoodcontracting.com");
    expect(loginEmail("  Omar.P ")).toBe("omar.p@crew.saddlewoodcontracting.com");
  });
  it("keeps an email as typed, lowercased", () => {
    expect(loginEmail("Marcus.Ulm@Outlook.com")).toBe("marcus.ulm@outlook.com");
  });
  it("is empty for anything that is neither", () => {
    expect(loginEmail("")).toBe("");
    expect(loginEmail("two words")).toBe("");
    expect(loginEmail("a@b")).toBe("");
    expect(loginEmail(".dot")).toBe("");
  });
});

describe("hasInbox", () => {
  it("is false only for the crew domain", () => {
    expect(hasInbox("angel.l@crew.saddlewoodcontracting.com")).toBe(false);
    expect(hasInbox("eli@saddlewoodcontracting.com")).toBe(true);
    expect(hasInbox("jlupillo.900@gmail.com")).toBe(true);
  });
});

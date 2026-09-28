import { describe, expect, it } from "vitest";
import {
  allowedEmails,
  isAllowedEmail,
  normalizePhone,
  emailForPhone,
  isAllowedPhone,
  isAllowedIdentity,
} from "../allowlist";

describe("ops allowlist", () => {
  it("accepts the default addresses, case-insensitively", () => {
    expect(isAllowedEmail("Marco@SaddlewoodContracting.com", "")).toBe(true);
    expect(isAllowedEmail("ilene8a@gmail.com ", "")).toBe(true);
    expect(isAllowedEmail("bot@saddlewoodcontracting.com", "")).toBe(true);
  });
  it("refuses anyone else", () => {
    expect(isAllowedEmail("jon@gimmegolflife.com", "")).toBe(false);
    expect(isAllowedEmail("", "")).toBe(false);
    expect(isAllowedEmail(null, "")).toBe(false);
  });
  it("lets OPS_ALLOWED_EMAILS replace the list", () => {
    expect(allowedEmails("a@x.com, B@Y.com")).toEqual(["a@x.com", "b@y.com"]);
    expect(isAllowedEmail("marco@saddlewoodcontracting.com", "a@x.com")).toBe(false);
  });

  it("normalizes phone numbers to E.164 standard", () => {
    expect(normalizePhone("(602) 218-1191")).toBe("+16022181191");
    expect(normalizePhone("480-655-6565")).toBe("+14806556565");
    expect(normalizePhone("+1 (602) 743-1766")).toBe("+16027431766");
    expect(normalizePhone("")).toBe("");
  });

  it("maps authorized phone numbers to staff emails", () => {
    expect(emailForPhone("(602) 218-1191")).toBe("lando@saddlewoodcontracting.com");
    expect(emailForPhone("480.655.6565")).toBe("marco@saddlewoodcontracting.com");
    expect(emailForPhone("602-743-1766")).toBe("ilene8a@gmail.com");
    expect(emailForPhone("555-555-5555")).toBeNull();
  });

  it("verifies allowed phone numbers", () => {
    expect(isAllowedPhone("602-218-1191")).toBe(true);
    expect(isAllowedPhone("480-655-6565")).toBe(true);
    expect(isAllowedPhone("602-743-1766")).toBe(true);
    expect(isAllowedPhone("999-999-9999")).toBe(false);
  });

  it("verifies identity across phone or email inputs", () => {
    expect(isAllowedIdentity("602-218-1191")).toEqual({
      allowed: true,
      email: "lando@saddlewoodcontracting.com",
      phone: "+16022181191",
    });
    expect(isAllowedIdentity("marco@saddlewoodcontracting.com")).toEqual({
      allowed: true,
      email: "marco@saddlewoodcontracting.com",
    });
    expect(isAllowedIdentity("outsider@example.com")).toEqual({
      allowed: false,
    });
    expect(isAllowedIdentity("555-000-1111")).toEqual({
      allowed: false,
    });
  });
});

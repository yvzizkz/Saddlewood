import { describe, expect, it } from "vitest";
import { allowedEmails, isAllowedEmail } from "../allowlist";

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
});

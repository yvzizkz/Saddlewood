import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { genMock, sendMock } = vi.hoisted(() => ({ genMock: vi.fn(), sendMock: vi.fn() }));
vi.mock("@/lib/auth/magicLink", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, generateSignInLink: genMock, sendEmail: sendMock };
});

import { POST } from "../route";

function req(body: unknown) {
  return new Request("http://localhost/api/auth/send-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  genMock.mockReset();
  sendMock.mockReset();
  genMock.mockResolvedValue({ email: "x", link: "https://saddlewoodcontracting.com/auth/confirm?token_hash=abc&type=magiclink&next=%2Finternal%2Fops", code: "12345678", next: "/internal/ops" });
  sendMock.mockResolvedValue({ id: "re_1" });
  vi.stubEnv("OPS_ALLOWED_EMAILS", "marco@saddlewoodcontracting.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/send-link", () => {
  it("emails an allowlisted address a link and a code", async () => {
    const res = await POST(req({ email: "Marco@SaddlewoodContracting.com" }) as never);
    expect(res.status).toBe(200);
    expect(genMock).toHaveBeenCalledWith("marco@saddlewoodcontracting.com", "/internal/ops");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const msg = sendMock.mock.calls[0][0];
    expect(msg.to).toBe("marco@saddlewoodcontracting.com");
    expect(msg.html).toContain("token_hash=abc");
    expect(msg.text).toContain("12345678");
  });

  it("silently ignores an address that is not on the list", async () => {
    const res = await POST(req({ email: "jon@gimmegolflife.com" }) as never);
    expect(res.status).toBe(200);
    expect(genMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("throttles a second request inside a minute", async () => {
    // The throttle map lives for the module, so use an address no other test touches.
    vi.stubEnv("OPS_ALLOWED_EMAILS", "bot@saddlewoodcontracting.com");
    await POST(req({ email: "bot@saddlewoodcontracting.com" }) as never);
    const res = await POST(req({ email: "bot@saddlewoodcontracting.com" }) as never);
    const json = await res.json();
    expect(json.throttled).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing email", async () => {
    const res = await POST(req({}) as never);
    expect(res.status).toBe(400);
  });

  it("never sends a person off-site after sign-in", async () => {
    vi.stubEnv("OPS_ALLOWED_EMAILS", "ilene8a@gmail.com");
    await POST(req({ email: "ilene8a@gmail.com", next: "https://evil.example/x" }) as never);
    expect(genMock).toHaveBeenCalledWith("ilene8a@gmail.com", "/internal/ops");
  });
});

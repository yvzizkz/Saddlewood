import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { genMock, sendMock } = vi.hoisted(() => ({ genMock: vi.fn(), sendMock: vi.fn() }));
vi.mock("@/lib/auth/magicLink", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, generateSignInLink: genMock, sendEmail: sendMock };
});

const { crew } = vi.hoisted(() => ({ crew: new Map<string, { active: boolean; lang: "en" | "es" }>() }));
vi.mock("@/lib/crew/queries", () => ({ getPerson: async (email: string) => crew.get(email) ?? null }));

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
  crew.clear();
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
    // Nothing more is sent, and the answer does not say why.
    expect(await res.json()).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("says the same thing whether or not the address has access", async () => {
    vi.stubEnv("OPS_ALLOWED_EMAILS", "lando@saddlewoodcontracting.com");
    crew.set("arnold@example.com", { active: true, lang: "en" });
    const answers = [];
    for (const email of ["lando@saddlewoodcontracting.com", "lando@saddlewoodcontracting.com", "arnold@example.com", "jon@gimmegolflife.com"]) {
      answers.push(await (await POST(req({ email }) as never)).json());
    }
    // staff, staff again (throttled), crew, a stranger: one answer
    expect(answers).toEqual([{ ok: true }, { ok: true }, { ok: true }, { ok: true }]);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("emails a crew member their code, in their language, with a link that lands in the app", async () => {
    crew.set("beto@example.com", { active: true, lang: "es" });
    const res = await POST(req({ identifier: " Beto@Example.com ", next: "/internal/ops" }) as never);
    expect(await res.json()).toEqual({ ok: true });
    expect(genMock).toHaveBeenCalledWith("beto@example.com", "/app");
    const msg = sendMock.mock.calls[0][0];
    expect(msg.to).toBe("beto@example.com");
    expect(msg.subject).toBe("Tu código de Saddlewood");
    expect(msg.text).toContain("12345678");
    expect(msg.text).toContain("O escribe este código en");
  });

  it("sends nothing to a crew member whose seat was taken away", async () => {
    crew.set("gone@example.com", { active: false, lang: "en" });
    const res = await POST(req({ email: "gone@example.com" }) as never);
    expect(await res.json()).toEqual({ ok: true });
    expect(genMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
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

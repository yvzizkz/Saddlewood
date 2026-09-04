import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { genMock, sendMock } = vi.hoisted(() => ({ genMock: vi.fn(), sendMock: vi.fn() }));
vi.mock("@/lib/auth/magicLink", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, generateSignInLink: genMock, sendEmail: sendMock };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }),
}));

import { POST } from "../route";

const TOKEN = "test-token-with-enough-length-1234";

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/ops/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  genMock.mockReset();
  sendMock.mockReset();
  genMock.mockResolvedValue({ email: "marco@saddlewoodcontracting.com", link: "https://saddlewoodcontracting.com/auth/confirm?token_hash=t&type=magiclink&next=%2Finternal%2Fops", code: "87654321", next: "/internal/ops" });
  sendMock.mockResolvedValue({ id: "re_9" });
  vi.stubEnv("OPS_AGENT_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/ops/invite", () => {
  it("refuses without the agent token", async () => {
    const res = await POST(req({ email: "marco@saddlewoodcontracting.com" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns a link without sending when send is false", async () => {
    const res = await POST(req({ email: "marco@saddlewoodcontracting.com" }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.link).toContain("/auth/confirm?token_hash=");
    expect(json.sent).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends a written email from a custom sender when asked", async () => {
    const res = await POST(
      req(
        {
          email: "marco@saddlewoodcontracting.com",
          send: true,
          subject: "How Saddlewood runs from here",
          from: "Saddlewood Operations <ops@saddlewoodcontracting.com>",
          replyTo: "ops@saddlewoodcontracting.com",
          message: { headline: "Operating Model v1", paragraphs: ["One rule.", "Two tranches."], buttonLabel: "Open the operating model" },
        },
        { Authorization: `Bearer ${TOKEN}`, "X-Ops-Actor": "claude-session" },
      ) as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe("re_9");
    const msg = sendMock.mock.calls[0][0];
    expect(msg.subject).toBe("How Saddlewood runs from here");
    expect(msg.from).toContain("ops@saddlewoodcontracting.com");
    expect(msg.html).toContain("Operating Model v1");
    expect(msg.html).toContain("Open the operating model");
  });

  it("refuses an address off the allowlist", async () => {
    const res = await POST(req({ email: "jon@gimmegolflife.com" }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(403);
    expect(genMock).not.toHaveBeenCalled();
  });
});

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

  it("passes a future scheduledAt through to the sender", async () => {
    const at = new Date(Date.now() + 3600_000).toISOString();
    const res = await POST(req({ email: "marco@saddlewoodcontracting.com", send: true, scheduledAt: at }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(200);
    expect(sendMock.mock.calls[0][0].scheduledAt).toBe(at);
    expect((await res.json()).scheduledAt).toBe(at);
  });

  it("refuses a scheduledAt in the past", async () => {
    const res = await POST(req({ email: "marco@saddlewoodcontracting.com", send: true, scheduledAt: "2026-01-01T00:00:00Z" }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses an address off the allowlist", async () => {
    const res = await POST(req({ email: "jon@gimmegolflife.com" }, { Authorization: `Bearer ${TOKEN}` }) as never);
    expect(res.status).toBe(403);
    expect(genMock).not.toHaveBeenCalled();
  });

  it("passes attachments through to the sender", async () => {
    const res = await POST(
      req(
        {
          email: "marco@saddlewoodcontracting.com",
          send: true,
          from: "Saddlewood Operations <ops@saddlewoodcontracting.com>",
          attachments: [{ filename: "Packet.pdf", content: "JVBERi0xLjQK", contentType: "application/pdf" }],
        },
        { Authorization: `Bearer ${TOKEN}` },
      ) as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attachments).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].attachments).toEqual([
      { filename: "Packet.pdf", content: "JVBERi0xLjQK", contentType: "application/pdf" },
    ]);
  });

  it("refuses attachments on a scheduled send", async () => {
    const at = new Date(Date.now() + 3600 * 1000).toISOString();
    const res = await POST(
      req(
        {
          email: "marco@saddlewoodcontracting.com",
          send: true,
          scheduledAt: at,
          attachments: [{ filename: "Packet.pdf", content: "JVBERi0xLjQK" }],
        },
        { Authorization: `Bearer ${TOKEN}` },
      ) as never,
    );
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// A sign-in link is the person's session. The agent token gets it back; a
// signed-in person never does, and only an owner may send one to someone else.
describe("POST /api/ops/invite from a signed-in person", () => {
  const people = {
    "lando@saddlewoodcontracting.com": { name: "Lando", role: "owner" },
    "ilene8a@gmail.com": { name: "Ilene Ochoa", role: "requester" },
  };

  async function as(email: string, body: unknown) {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u", email } }, error: null }) } }),
    }));
    vi.doMock("@/lib/bot/queries", () => ({ readState: async () => ({ sections: { people } }) }));
    const { POST: post } = await import("../route");
    return post(req(body) as never);
  }

  it("emails the link to its owner and never returns it", async () => {
    const res = await as("lando@saddlewoodcontracting.com", { email: "marco@saddlewoodcontracting.com" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.link).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("token_hash");
    expect(json.sent).toBe("re_9");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe("marco@saddlewoodcontracting.com");
  });

  it("does not let a non-owner get a link sent for someone else", async () => {
    const res = await as("ilene8a@gmail.com", { email: "marco@saddlewoodcontracting.com", send: true });
    expect(res.status).toBe(403);
    expect(genMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("lets anyone send themselves a link, still without returning it", async () => {
    const res = await as("ilene8a@gmail.com", { email: "ilene8a@gmail.com" });
    expect(res.status).toBe(200);
    expect((await res.json()).link).toBeUndefined();
  });
});

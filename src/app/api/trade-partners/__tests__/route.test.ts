import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the Resend send call. The route does `new Resend(key).emails.send(...)`.
const sendMock = vi.fn();
vi.mock("resend", () => ({
  // Must be a real constructor — the route calls `new Resend(key)`.
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { POST } from "../route";

function makeRequest(body: unknown | string): Request {
  return new Request("http://localhost/api/trade-partners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = {
  businessName: "Acme Framing LLC",
  name: "Jane Doe",
  email: "jane@acmeframing.com",
  phone: "4805550123",
  classifications: ["Framing / Rough Carpentry"],
  source: "Website Trade Partner Application",
  tags: ["subcontractor", "bid-list", "trade:Framing / Rough Carpentry"],
  company: "", // honeypot empty
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/trade-partners", () => {
  it("returns 400 on malformed JSON", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("drops a honeypot submission with a fake 200 and sends nothing", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const res = await POST(makeRequest({ ...VALID, company: "bot-filled" }));
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when businessName or email is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const { businessName: _omit, ...noBusiness } = VALID;
    void _omit;
    const res = await POST(makeRequest(noBusiness));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("emails info@ and marco@ and reports success on a valid submission", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.delivered.email).toBe(true);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toEqual(
      expect.arrayContaining([
        "info@saddlewoodcontracting.com",
        "marco@saddlewoodcontracting.com",
      ])
    );
    expect(arg.replyTo).toBe(VALID.email);
    expect(arg.subject).toContain("Acme Framing LLC");
  });

  it("returns 500 when no channel is configured (no email, no CRM)", async () => {
    vi.stubEnv("RESEND_API_KEY", ""); // email no-ops; GHL creds unset at import
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

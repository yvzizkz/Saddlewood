import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));

const clientContactEmails = vi.fn();
const recordEvent = vi.fn();
vi.mock("@/lib/billing/documents", () => ({
  clientContactEmails: (...a: unknown[]) => clientContactEmails(...a),
  recordEvent: (...a: unknown[]) => recordEvent(...a),
}));

import { POST } from "../route";

const NOTE = { to: ["marco@saddlewoodcontracting.com"], subject: "A note", body: "Hello Marco" };

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/billing/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ data: { id: "em_9" }, error: null });
  authorizeOps.mockReset().mockResolvedValue({ actor: "agent", via: "token" });
  clientContactEmails.mockReset();
  recordEvent.mockReset();
  vi.stubEnv("RESEND_API_KEY", "re_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/billing/mail", () => {
  it("answers 401 to anyone who is not staff", async () => {
    authorizeOps.mockResolvedValue(null);
    expect((await call({ ...NOTE, confirm: true })).status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("previews until confirmed, then sends one message from accounting@ with no proof line", async () => {
    expect((await (await call(NOTE)).json()).sent).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    const json = await (await call({ ...NOTE, confirm: true })).json();
    expect(json).toMatchObject({ sent: true, recorded: null, copySent: null });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0][0];
    expect(mail.from).toContain("accounting@saddlewoodcontracting.com");
    expect(mail.text).toBe("Hello Marco");
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("never reaches an outside address, since no client vouches for one", async () => {
    for (const bad of [{ to: ["ap@client.com"] }, { cc: ["ap@client.com"] }]) {
      expect((await call({ ...NOTE, ...bad, confirm: true })).status).toBe(400);
    }
    expect(clientContactEmails).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("drops a document marker from a note that has no document", async () => {
    await call({ ...NOTE, body: "Hello\n\n{link}", confirm: true });
    expect(sendMock.mock.calls[0][0].text).toBe("Hello");
  });
});

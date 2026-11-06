import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The careers form: never lose a submission. The app is a channel like GHL and email:
// any one of them is enough, and only all of them failing is an error.

const { sendMock, keepMock } = vi.hoisted(() => ({ sendMock: vi.fn(), keepMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@/lib/webforms/store", () => ({ keepSubmission: keepMock }));

import { POST } from "../route";

const post = (body: unknown) => POST(new Request("http://localhost/api/x", { method: "POST", body: JSON.stringify(body) }));
const VALID = { role: "Carpenter", name: "Luis Soto", phone: "4805550123", salary: "$30/hr", company: "" };

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ error: null });
  keepMock.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/careers", () => {
  it("keeps it in the app, with no other channel configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(keepMock.mock.calls[0][0]).toMatchObject({ form: "careers", name: "Luis Soto", about: "Carpenter", summary: expect.stringContaining("$30/hr") });
  });

  it("still succeeds by email when the app can't keep it", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    keepMock.mockResolvedValue(false);
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("fails when every channel fails, so the visitor isn't told it was sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    keepMock.mockResolvedValue(false);
    expect((await post(VALID)).status).toBe(500);
  });

  it("keeps nothing from a bot", async () => {
    await post({ ...VALID, company: "bot-filled" });
    expect(keepMock).not.toHaveBeenCalled();
  });
});

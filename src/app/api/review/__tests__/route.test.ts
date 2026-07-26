import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("@/lib/reviewData", () => ({ REVIEW_TOKEN: "tok" }));

import { POST } from "../route";

function req(body: unknown | string): Request {
  return new Request("http://localhost/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BASE = { k: "tok", batch: "m1", item: "logo", decision: "Approved" };
const png = (bytes: number) => Buffer.alloc(bytes, 7).toString("base64");
const file = (over: Record<string, unknown> = {}) => ({
  name: "site.jpg",
  type: "image/jpeg",
  b64: png(1000),
  ...over,
});

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/review attachments", () => {
  it("still works with no files at all", async () => {
    const res = await POST(req(BASE) as never);
    expect(res.status).toBe(200);
    expect(sendMock.mock.calls[0][0].attachments).toBeUndefined();
  });

  it("attaches a valid photo to the decision email", async () => {
    const res = await POST(req({ ...BASE, files: [file()] }) as never);
    expect(res.status).toBe(200);
    const sent = sendMock.mock.calls[0][0];
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0].filename).toBe("site.jpg");
    expect(Buffer.isBuffer(sent.attachments[0].content)).toBe(true);
    expect(sent.attachments[0].content.length).toBe(1000);
  });

  it("names the files in the body so the KB can find them by text", async () => {
    await POST(req({ ...BASE, files: [file({ name: "punchlist.pdf", type: "application/pdf" })] }) as never);
    expect(sendMock.mock.calls[0][0].html).toContain("punchlist.pdf");
  });

  it("rejects a type that is not on the allowlist", async () => {
    const res = await POST(
      req({ ...BASE, files: [file({ name: "x.svg", type: "image/svg+xml" })] }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_type" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects more than four files", async () => {
    const res = await POST(
      req({ ...BASE, files: [file(), file(), file(), file(), file()] }) as never,
    );
    expect(res.status).toBe(413);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a payload over the decoded size ceiling", async () => {
    const res = await POST(
      req({ ...BASE, files: [file({ b64: png(1_600_000) }), file({ b64: png(1_600_000) })] }) as never,
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "too_large" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("strips a path out of the filename", async () => {
    await POST(req({ ...BASE, files: [file({ name: "../../etc/passwd.png", type: "image/png" })] }) as never);
    expect(sendMock.mock.calls[0][0].attachments[0].filename).toBe("passwd.png");
  });

  it("still refuses a bad token even with files present", async () => {
    const res = await POST(req({ ...BASE, k: "wrong", files: [file()] }) as never);
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects an empty file rather than sending a zero-byte attachment", async () => {
    const res = await POST(req({ ...BASE, files: [file({ b64: "" })] }) as never);
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

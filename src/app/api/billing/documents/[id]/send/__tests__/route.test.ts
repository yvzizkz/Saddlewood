import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));

const getDocument = vi.fn();
const clientContactEmails = vi.fn();
const recordEvent = vi.fn();
vi.mock("@/lib/billing/documents", () => ({
  getDocument: (...a: unknown[]) => getDocument(...a),
  clientContactEmails: (...a: unknown[]) => clientContactEmails(...a),
  recordEvent: (...a: unknown[]) => recordEvent(...a),
}));

import { POST } from "../route";

const ID = "11111111-2222-3333-4444-555555555555";
const TOKEN = "a".repeat(32);
const DOC = { id: ID, kind: "statement", number: "AFT-100526", status: "issued", token: TOKEN, clientId: "c1" };
const GOOD = { to: ["ap@client.com"], cc: ["marco@saddlewoodcontracting.com"], subject: "Open invoices", body: "Hi,\n\nThe statement is here:\n{link}\n\nThank you" };

function call(body: unknown, id = ID) {
  const request = new Request(`http://localhost/api/billing/documents/${id}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(request as never, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ data: { id: "em_1" }, error: null });
  authorizeOps.mockReset().mockResolvedValue({ actor: "lando@saddlewoodcontracting.com", via: "session" });
  getDocument.mockReset().mockResolvedValue(DOC);
  clientContactEmails.mockReset().mockResolvedValue(["ap@client.com"]);
  recordEvent.mockReset().mockResolvedValue(true);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://saddlewoodcontracting.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/billing/documents/[id]/send", () => {
  it("answers 401 to anyone who is not staff, before looking anything up", async () => {
    authorizeOps.mockResolvedValue(null);
    const res = await call({ ...GOOD, confirm: true });
    expect(res.status).toBe(401);
    expect(getDocument).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("shows the exact message and sends nothing until confirm is true", async () => {
    for (const confirm of [undefined, false, "true", 1]) {
      const res = await call({ ...GOOD, confirm });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.sent).toBe(false);
      expect(json.preview.from).toContain("accounting@saddlewoodcontracting.com");
      expect(json.preview.to).toEqual(["ap@client.com"]);
      expect(json.preview.body).toContain(`https://saddlewoodcontracting.com/d/${TOKEN}`);
    }
    expect(sendMock).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("sends from accounting@ and writes the sent line with the mail id", async () => {
    const res = await call({ ...GOOD, confirm: true });
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, sent: true, emailId: "em_1", recorded: true });
    const mail = sendMock.mock.calls[0][0];
    expect(mail.from).toBe("Saddlewood Contracting Accounting <accounting@saddlewoodcontracting.com>");
    expect(mail.replyTo).toBe("accounting@saddlewoodcontracting.com");
    expect(mail.to).toEqual(["ap@client.com"]);
    expect(mail.cc).toEqual(["marco@saddlewoodcontracting.com"]);
    expect(mail.text).toContain(`/d/${TOKEN}`);
    expect(mail.text).not.toContain("{link}");
    expect(mail.html).toContain(`<a href="https://saddlewoodcontracting.com/d/${TOKEN}">`);
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: ID, kind: "sent", emailId: "em_1", actor: "lando@saddlewoodcontracting.com", dedupe: "sent:em_1" }),
    );
  });

  it("adds the link when the body left it out", async () => {
    await call({ ...GOOD, body: "Please see the statement.", confirm: true });
    expect(sendMock.mock.calls[0][0].text).toBe(`Please see the statement.\n\nhttps://saddlewoodcontracting.com/d/${TOKEN}`);
  });

  it("refuses an outside address that is not a contact of this client", async () => {
    for (const bad of [{ to: ["someone@else.com"] }, { cc: ["someone@else.com"] }, { to: ["AP@client.com", "x@evil.com"] }]) {
      const res = await call({ ...GOOD, ...bad, confirm: true });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/not a contact on file/);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses a document with no client to any outside address", async () => {
    getDocument.mockResolvedValue({ ...DOC, clientId: null });
    const res = await call({ ...GOOD, confirm: true });
    expect(res.status).toBe(400);
    expect(clientContactEmails).not.toHaveBeenCalled();
    const inside = await call({ ...GOOD, to: ["info@saddlewoodcontracting.com"], cc: [], confirm: true });
    expect((await inside.json()).sent).toBe(true);
  });

  it("refuses malformed input", async () => {
    expect((await call("{nope")).status).toBe(400);
    expect((await call([])).status).toBe(400);
    expect((await call({ ...GOOD, to: [] })).status).toBe(400);
    expect((await call({ ...GOOD, to: "ap@client.com" })).status).toBe(400);
    expect((await call({ ...GOOD, to: ["ap@client.com\nBcc: x@evil.com"] })).status).toBe(400);
    expect((await call({ ...GOOD, subject: " " })).status).toBe(400);
    expect((await call({ ...GOOD, body: "" })).status).toBe(400);
    expect((await call(GOOD, "not-an-id")).status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("keeps a line break out of the subject", async () => {
    await call({ ...GOOD, subject: "Open invoices\r\nBcc: x@evil.com", confirm: true });
    expect(sendMock.mock.calls[0][0].subject).toBe("Open invoices Bcc: x@evil.com");
  });

  it("escapes the body in the HTML copy", async () => {
    await call({ ...GOOD, body: "<script>alert(1)</script> {link}", confirm: true });
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("only sends an issued document", async () => {
    for (const d of [{ ...DOC, status: "draft", token: null }, { ...DOC, status: "void" }]) {
      getDocument.mockResolvedValue(d);
      expect((await call({ ...GOOD, confirm: true })).status).toBe(409);
    }
    getDocument.mockResolvedValue(null);
    expect((await call({ ...GOOD, confirm: true })).status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("says nothing was sent when the mail service refuses, and records nothing", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const res = await call({ ...GOOD, confirm: true });
    expect(res.status).toBe(502);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("does not fail a message that went out when the record could not be written", async () => {
    recordEvent.mockRejectedValue(new Error("db down"));
    const res = await call({ ...GOOD, confirm: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: true, recorded: false, emailId: "em_1" });
  });

  it("answers 503 when the mail key is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await call({ ...GOOD, confirm: true })).status).toBe(503);
  });
});

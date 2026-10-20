import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));
// Billing changes are for the owners (src/lib/billing/access.ts).
const readState = vi.fn();
vi.mock("@/lib/bot/queries", () => ({ readState: (...a: unknown[]) => readState(...a) }));
// The owner's allowlist as the Mac mirrors it: the contacts these tests mail are on it.
const ALLOW = { addresses: ["ap@client.com", "pw@client.joistapp.com"], domains: ["aft.com"], updatedAt: new Date().toISOString() };
const OWNERS = {
  "lando@saddlewoodcontracting.com": { name: "Lando", role: "owner" },
  "ilene@saddlewoodcontracting.com": { name: "Ilene Ochoa", role: "owner" },
  "bot@saddlewoodcontracting.com": { name: "Bot", role: "requester" },
};

const getDocument = vi.fn();
const clientContactEmails = vi.fn();
const recordEvent = vi.fn();
// Sending a draft issues it: held first, issued only once the message is out.
const claimForSend = vi.fn();
const releaseClaim = vi.fn();
const issueDocument = vi.fn();
const { DocumentError } = vi.hoisted(() => ({
  DocumentError: class DocumentError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/billing/documents", () => ({
  getDocument: (...a: unknown[]) => getDocument(...a),
  clientContactEmails: (...a: unknown[]) => clientContactEmails(...a),
  recordEvent: (...a: unknown[]) => recordEvent(...a),
  claimForSend: (...a: unknown[]) => claimForSend(...a),
  releaseClaim: (...a: unknown[]) => releaseClaim(...a),
  issueDocument: (...a: unknown[]) => issueDocument(...a),
  DocumentError,
}));

import { POST } from "../route";

const ID = "11111111-2222-3333-4444-555555555555";
const TOKEN = "a".repeat(32);
const LINK = `https://saddlewoodcontracting.com/d/${"a".repeat(32)}`;
const DOC = { id: ID, kind: "statement", number: "AFT-100526", status: "issued", token: TOKEN, clientId: "c1" };
const HELD = "d".repeat(32);
const DRAFT = { ...DOC, status: "draft", token: null, previewToken: "e".repeat(32) };
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
  readState.mockReset().mockResolvedValue({ sections: { people: OWNERS, outboundAllow: ALLOW }, bridge: {} });
  getDocument.mockReset().mockResolvedValue(DOC);
  clientContactEmails.mockReset().mockResolvedValue(["ap@client.com"]);
  recordEvent.mockReset().mockResolvedValue(true);
  claimForSend.mockReset().mockResolvedValue(HELD);
  releaseClaim.mockReset().mockResolvedValue(undefined);
  issueDocument.mockReset().mockImplementation(async (id: string) => ({ ...DRAFT, id, status: "issued", token: HELD }));
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

  it("answers 403 to staff who are not owners; the Mac's token may still send", async () => {
    authorizeOps.mockResolvedValue({ actor: "bot@saddlewoodcontracting.com", via: "session" });
    expect((await call({ ...GOOD, confirm: true })).status).toBe(403);
    expect(getDocument).not.toHaveBeenCalled();
    authorizeOps.mockResolvedValue({ actor: "billing_send", via: "token" });
    expect((await call(GOOD)).status).toBe(200);
  });

  it("shows the exact message and sends nothing until confirm is true", async () => {
    for (const confirm of [undefined, false, "true", 1]) {
      const res = await call({ ...GOOD, confirm });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.sent).toBe(false);
      expect(json.preview.from).toContain("accounting@saddlewoodcontracting.com");
      expect(json.preview.to).toEqual(["ap@client.com"]);
      expect(json.preview.body).toContain(LINK);
      expect(json.preview.internalCopy.to).toEqual(["marco@saddlewoodcontracting.com", "info@saddlewoodcontracting.com"]);
    }
    expect(sendMock).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("sends from accounting@ and writes the sent line with the mail id", async () => {
    const res = await call({ ...GOOD, cc: [], confirm: true });
    const json = await res.json();
    // The office copy (info@) goes out even when no one of ours is on the message.
    expect(json).toMatchObject({ ok: true, sent: true, emailId: "em_1", recorded: true, copySent: true });
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1][0].to).toEqual(["info@saddlewoodcontracting.com"]);
    const mail = sendMock.mock.calls[0][0];
    expect(mail.from).toBe("Saddlewood Contracting Accounting <accounting@saddlewoodcontracting.com>");
    expect(mail.replyTo).toBe("accounting@saddlewoodcontracting.com");
    expect(mail.to).toEqual(["ap@client.com"]);
    expect(mail.cc).toBeUndefined();
    expect(mail.text).toContain(`View statement: ${LINK}`);
    expect(mail.text).not.toContain("{link}");
    expect(mail.html).toContain(`<a href="${LINK}" style=`);
    expect(mail.html).toContain(">View statement</a>");
    expect(mail.html).not.toContain(`>${LINK}<`);
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: ID, kind: "sent", emailId: "em_1", actor: "lando@saddlewoodcontracting.com", dedupe: "sent:em_1" }),
    );
  });

  it("gives our own people a separate copy whose link is not counted as a viewing", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "em_1" }, error: null }).mockResolvedValueOnce({ data: { id: "em_2" }, error: null });
    const res = await call({ ...GOOD, confirm: true });
    expect(await res.json()).toMatchObject({ sent: true, emailId: "em_1", copySent: true });
    expect(sendMock).toHaveBeenCalledTimes(2);
    const [client, ours] = sendMock.mock.calls.map((c) => c[0]);
    expect(client.to).toEqual(["ap@client.com"]);
    expect(client.cc).toBeUndefined();
    expect(client.text).toContain(LINK);
    expect(client.text).not.toContain("copy=1");
    expect(ours.to).toEqual(["marco@saddlewoodcontracting.com", "info@saddlewoodcontracting.com"]);
    expect(ours.text).toContain(`${LINK}?copy=1`);
    expect(ours.text).toContain("This went to ap@client.com.");
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent.mock.calls[0][0].detail).toMatchObject({ to: ["ap@client.com"], internalCopy: ["marco@saddlewoodcontracting.com", "info@saddlewoodcontracting.com"] });
  });

  it("still answers sent when only the internal copy fails", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "em_1" }, error: null }).mockRejectedValueOnce(new Error("down"));
    const res = await call({ ...GOOD, confirm: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: true, recorded: true, copySent: false });
  });

  it("uses the uncounted link when a document goes only to our own people", async () => {
    await call({ ...GOOD, to: ["marco@saddlewoodcontracting.com"], cc: [], confirm: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].text).toContain(`${LINK}?copy=1`);
  });

  it("names the document's button when asked", async () => {
    const res = await call({ ...GOOD, cc: [], linkLabel: "Invoice 8009-13", confirm: true });
    expect((await res.json()).sent).toBe(true);
    expect(sendMock.mock.calls[0][0].html).toContain(">Invoice 8009-13</a>");
    expect(sendMock.mock.calls[0][0].text).toContain(`Invoice 8009-13: ${LINK}`);
  });

  it("adds the link when the body left it out", async () => {
    await call({ ...GOOD, cc: [], body: "Please see the statement.", confirm: true });
    expect(sendMock.mock.calls[0][0].text).toBe(`Please see the statement.\n\nView statement: ${LINK}`);
  });

  it("turns approved extra links into buttons and spells them out in the text copy", async () => {
    const joist = "https://client.joistapp.com/invoices/2353052f82941ffa2cf7381f?source=email";
    await call({ ...GOOD, cc: [], links: [{ label: "Invoice 5203-12", url: joist }], confirm: true });
    const mail = sendMock.mock.calls[0][0];
    expect(mail.text).toContain(`Invoice 5203-12: ${joist}`);
    expect(mail.html).toContain(`<a href="${joist}" style=`);
    expect(mail.html).toContain(">Invoice 5203-12</a>");
    expect(recordEvent.mock.calls[0][0].detail.links).toEqual(["Invoice 5203-12"]);
  });

  it("refuses a link to a site that is not approved, or one that is not plain https", async () => {
    for (const url of [
      "https://evil.example.com/pay",
      "https://joistapp.com.evil.example/x",
      "http://client.joistapp.com/invoices/1",
      "https://user:pw@client.joistapp.com/x",
      "javascript:alert(1)",
      "not a url",
    ]) {
      const res = await call({ ...GOOD, links: [{ label: "Invoice", url }], confirm: true });
      expect(res.status).toBe(400);
    }
    expect((await call({ ...GOOD, links: [{ label: "", url: "https://client.joistapp.com/x" }], confirm: true })).status).toBe(400);
    expect((await call({ ...GOOD, links: "https://client.joistapp.com/x", confirm: true })).status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("attaches files and names them in the proof record", async () => {
    const pdf = Buffer.from("%PDF-1.4 waiver").toString("base64");
    const res = await call({ ...GOOD, cc: [], attachments: [{ filename: "Waiver Jury 8009-10.pdf", content: pdf }], confirm: true });
    expect((await res.json()).preview.attachments).toEqual([{ filename: "Waiver Jury 8009-10.pdf", bytes: 15 }]);
    const mail = sendMock.mock.calls[0][0];
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe("Waiver Jury 8009-10.pdf");
    expect(mail.attachments[0].contentType).toBe("application/pdf");
    expect(Buffer.isBuffer(mail.attachments[0].content)).toBe(true);
    expect(recordEvent.mock.calls[0][0].detail.attachments).toEqual(["Waiver Jury 8009-10.pdf"]);
  });

  it("refuses attachments that are the wrong kind, unreadable, repeated or too large", async () => {
    const ok = Buffer.from("x").toString("base64");
    const big = Buffer.alloc(3 * 1024 * 1024 + 1, 1).toString("base64");
    for (const attachments of [
      [{ filename: "run.exe", content: ok }],
      [{ filename: "page.html", content: ok }],
      [{ filename: "noext", content: ok }],
      [{ filename: "a.pdf", content: "***" }],
      [{ filename: "a.pdf", content: "" }],
      [{ filename: "a.pdf", content: ok }, { filename: "A.PDF", content: ok }],
      [{ filename: "a.pdf", content: big }],
      "a.pdf",
    ]) {
      expect((await call({ ...GOOD, attachments, confirm: true })).status).toBe(400);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("keeps folders out of an attachment's name", async () => {
    const ok = Buffer.from("x").toString("base64");
    await call({ ...GOOD, cc: [], attachments: [{ filename: "../../etc/waiver.pdf", content: ok }], confirm: true });
    expect(sendMock.mock.calls[0][0].attachments[0].filename).not.toMatch(/[\\/]/);
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
    await call({ ...GOOD, cc: [], body: "<script>alert(1)</script> {link}", confirm: true });
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never sends a void document, or one that is not there", async () => {
    getDocument.mockResolvedValue({ ...DOC, status: "void" });
    const res = await call({ ...GOOD, confirm: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("a void document cannot be sent");
    getDocument.mockResolvedValue(null);
    expect((await call({ ...GOOD, confirm: true })).status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not hold or issue an issued document again when it is resent", async () => {
    const res = await call({ ...GOOD, confirm: true });
    const json = await res.json();
    expect(json.sent).toBe(true);
    expect(json).not.toHaveProperty("issued");
    expect(claimForSend).not.toHaveBeenCalled();
    expect(issueDocument).not.toHaveBeenCalled();
    expect(recordEvent.mock.calls[0][0].detail).not.toHaveProperty("issued");
  });

  describe("sending a draft issues it", () => {
    beforeEach(() => getDocument.mockResolvedValue(DRAFT));

    it("shows the message with the link still to be made, and holds nothing, until confirmed", async () => {
      const res = await call(GOOD);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.sent).toBe(false);
      expect(json.preview.document).toEqual({ number: "AFT-100526", kind: "statement", link: null, issuesOnSend: true });
      expect(json.preview.body).toContain("View statement: https://saddlewoodcontracting.com/d/(made when sent)");
      expect(claimForSend).not.toHaveBeenCalled();
      expect(issueDocument).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("holds the draft, sends it with its new link, and only then issues it with that same token", async () => {
      const order: string[] = [];
      claimForSend.mockImplementation(async () => (order.push("hold"), HELD));
      sendMock.mockImplementation(async () => (order.push("send"), { data: { id: "em_9" }, error: null }));
      issueDocument.mockImplementation(async () => (order.push("issue"), { ...DRAFT, status: "issued", token: HELD }));
      recordEvent.mockImplementation(async () => (order.push("record"), true));

      const res = await call({ ...GOOD, cc: [], confirm: true });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json).toMatchObject({ ok: true, sent: true, emailId: "em_9", recorded: true, issued: [ID], notIssued: [] });
      expect(json.preview.document.link).toBe(`https://saddlewoodcontracting.com/d/${HELD}`);
      // The client's message, then our copy, both before the issue.
      expect(order).toEqual(["hold", "send", "send", "issue", "record"]);
      expect(claimForSend).toHaveBeenCalledWith(ID);
      expect(sendMock.mock.calls[0][0].text).toContain(`View statement: https://saddlewoodcontracting.com/d/${HELD}`);
      expect(sendMock.mock.calls[0][0].text).not.toContain("made when sent");
      expect(issueDocument).toHaveBeenCalledWith(ID, "lando@saddlewoodcontracting.com", expect.any(Date), { token: HELD });
      expect(recordEvent).toHaveBeenCalledTimes(1);
      expect(recordEvent.mock.calls[0][0]).toMatchObject({ documentId: ID, kind: "sent", emailId: "em_9", dedupe: "sent:em_9", detail: { issued: true } });
      expect(releaseClaim).not.toHaveBeenCalled();
    });

    it("leaves it a draft when the mail service refuses: the hold is let go, nothing is issued or recorded", async () => {
      sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
      const res = await call({ ...GOOD, confirm: true });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toBe("the mail service refused the message; nothing was sent, and the drafts are still drafts");
      expect(releaseClaim).toHaveBeenCalledWith(ID, HELD);
      expect(issueDocument).not.toHaveBeenCalled();
      expect(recordEvent).not.toHaveBeenCalled();
    });

    it("leaves it a draft when the mail service cannot be reached", async () => {
      sendMock.mockRejectedValue(new Error("network down"));
      const res = await call({ ...GOOD, confirm: true });
      expect(res.status).toBe(502);
      expect(releaseClaim).toHaveBeenCalledWith(ID, HELD);
      expect(issueDocument).not.toHaveBeenCalled();
    });

    it("leaves it a draft when the mail key is missing, without holding it", async () => {
      vi.stubEnv("RESEND_API_KEY", "");
      expect((await call({ ...GOOD, confirm: true })).status).toBe(503);
      expect(claimForSend).not.toHaveBeenCalled();
      expect(issueDocument).not.toHaveBeenCalled();
    });

    it("refuses a second send while the first holds the draft", async () => {
      claimForSend.mockRejectedValue(new DocumentError("this draft is being sent right now; try again in a minute", 409));
      const res = await call({ ...GOOD, confirm: true });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/being sent right now/);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("still answers sent when the message left but the issue failed, and says so", async () => {
      issueDocument.mockRejectedValue(new Error("db down"));
      getDocument.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce({ ...DRAFT, token: HELD });
      const res = await call({ ...GOOD, confirm: true });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json).toMatchObject({ sent: true, issued: [], notIssued: [ID] });
      expect(json.warning).toMatch(/issue it now/);
      expect(releaseClaim).not.toHaveBeenCalled();
      expect(recordEvent).toHaveBeenCalledTimes(1);
    });

    it("counts it issued when someone pressed Issue meanwhile with the same token", async () => {
      issueDocument.mockRejectedValue(new DocumentError("this document is not a draft, so it cannot be issued", 409));
      getDocument.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce({ ...DRAFT, status: "issued", token: HELD });
      const json = await (await call({ ...GOOD, confirm: true })).json();
      expect(json).toMatchObject({ sent: true, issued: [ID], notIssued: [] });
    });
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

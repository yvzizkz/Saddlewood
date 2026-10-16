import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Several documents in one email (8009-13 and 8009-14 on 10/12): one message,
// one button per document, one "sent" line on each document's proof record,
// and every draft in it issued only once the message has left.

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));
const readState = vi.fn();
vi.mock("@/lib/bot/queries", () => ({ readState: (...a: unknown[]) => readState(...a) }));
const OWNERS = { "lando@saddlewoodcontracting.com": { name: "Lando", role: "owner" } };

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
const getDocument = vi.fn();
const updateDraft = vi.fn();
const documentsInGroup = vi.fn();
const clientContactEmails = vi.fn();
const recordEvent = vi.fn();
const claimForSend = vi.fn();
const releaseClaim = vi.fn();
const issueDocument = vi.fn();
vi.mock("@/lib/billing/documents", () => ({
  DocumentError,
  getDocument: (...a: unknown[]) => getDocument(...a),
  updateDraft: (...a: unknown[]) => updateDraft(...a),
  documentsInGroup: (...a: unknown[]) => documentsInGroup(...a),
  clientContactEmails: (...a: unknown[]) => clientContactEmails(...a),
  recordEvent: (...a: unknown[]) => recordEvent(...a),
  claimForSend: (...a: unknown[]) => claimForSend(...a),
  releaseClaim: (...a: unknown[]) => releaseClaim(...a),
  issueDocument: (...a: unknown[]) => issueDocument(...a),
}));
const createSendGroup = vi.fn();
const getSendGroup = vi.fn();
vi.mock("@/lib/billing/sendGroups", () => ({
  createSendGroup: (...a: unknown[]) => createSendGroup(...a),
  getSendGroup: (...a: unknown[]) => getSendGroup(...a),
}));

import { POST as createGroup } from "../route";
import { GET as lookGroup } from "../[id]/route";
import { POST as sendGroup } from "../[id]/send/route";

const GID = "99999999-2222-3333-4444-555555555555";
const A = "aaaaaaaa-2222-3333-4444-555555555555";
const B = "bbbbbbbb-2222-3333-4444-555555555555";
const CLIENT = "77777777-2222-3333-4444-555555555555";
const GROUP = { id: GID, name: "JURY-1012", clientId: CLIENT, note: "", createdBy: "x", createdAt: "2026-10-12T00:00:00Z" };
const TA = "1".repeat(32);
const TB = "2".repeat(32);
const DOC_A = { id: A, kind: "invoice", number: "8009-13", status: "draft", token: null, previewToken: "3".repeat(32), clientId: CLIENT, sendGroupId: GID };
const DOC_B = { id: B, kind: "invoice", number: "8009-14", status: "draft", token: null, previewToken: "4".repeat(32), clientId: CLIENT, sendGroupId: GID };
const SITE = "https://saddlewoodcontracting.com";
const MSG = { to: ["ap@aft.com"], cc: ["chris@aft.com"], subject: "Change orders 8009-13 and 8009-14", body: "Hi,\n\nThe two change orders:\n{link}\n\nThank you" };

function req(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const send = (body: unknown) => sendGroup(req("POST", `/api/billing/send-groups/${GID}/send`, body), { params: Promise.resolve({ id: GID }) });

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ data: { id: "em_g" }, error: null });
  authorizeOps.mockReset().mockResolvedValue({ actor: "lando@saddlewoodcontracting.com", via: "session" });
  readState.mockReset().mockResolvedValue({ sections: { people: OWNERS }, bridge: {} });
  getDocument.mockReset().mockImplementation(async (id: string) => ({ [A]: DOC_A, [B]: DOC_B })[id] ?? null);
  updateDraft.mockReset().mockImplementation(async (id: string, c: Record<string, unknown>) => ({ ...(id === A ? DOC_A : DOC_B), ...c }));
  documentsInGroup.mockReset().mockResolvedValue([DOC_A, DOC_B]);
  clientContactEmails.mockReset().mockResolvedValue(["ap@aft.com", "chris@aft.com"]);
  recordEvent.mockReset().mockResolvedValue(true);
  claimForSend.mockReset().mockImplementation(async (id: string) => (id === A ? TA : TB));
  releaseClaim.mockReset().mockResolvedValue(undefined);
  issueDocument.mockReset().mockImplementation(async (id: string, _by: string, _at: Date, o: { token: string }) => ({ ...(id === A ? DOC_A : DOC_B), status: "issued", token: o.token }));
  createSendGroup.mockReset().mockResolvedValue(GROUP);
  getSendGroup.mockReset().mockResolvedValue(GROUP);
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/billing/send-groups (make a group)", () => {
  it("makes the group and puts the drafts in it", async () => {
    const res = await createGroup(req("POST", "/api/billing/send-groups", { name: "JURY-1012", documents: [A, B] }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(createSendGroup).toHaveBeenCalledWith({ name: "JURY-1012", clientId: CLIENT, note: "", createdBy: "lando@saddlewoodcontracting.com" });
    expect(updateDraft.mock.calls).toEqual([[A, { sendGroupId: GID }], [B, { sendGroupId: GID }]]);
    expect(json.documents.map((d: { previewLink: string }) => d.previewLink)).toEqual([`${SITE}/d/p/${"3".repeat(32)}`, `${SITE}/d/p/${"4".repeat(32)}`]);
  });

  it("checks every document before making anything: drafts only, one client", async () => {
    getDocument.mockImplementation(async (id: string) => (id === A ? DOC_A : { ...DOC_B, status: "issued", token: TB }));
    expect((await createGroup(req("POST", "/api/billing/send-groups", { name: "X", documents: [A, B] }))).status).toBe(409);
    getDocument.mockImplementation(async (id: string) => (id === A ? DOC_A : { ...DOC_B, clientId: "88888888-2222-3333-4444-555555555555" }));
    expect((await createGroup(req("POST", "/api/billing/send-groups", { name: "X", documents: [A, B] }))).status).toBe(409);
    expect((await createGroup(req("POST", "/api/billing/send-groups", { name: "", documents: [A] }))).status).toBe(400);
    expect((await createGroup(req("POST", "/api/billing/send-groups", { name: "X", documents: ["nope"] }))).status).toBe(400);
    expect(createSendGroup).not.toHaveBeenCalled();
  });

  it("is for owners (or the Mac); others are refused", async () => {
    authorizeOps.mockResolvedValue(null);
    expect((await createGroup(req("POST", "/api/billing/send-groups", { name: "X" }))).status).toBe(401);
    authorizeOps.mockResolvedValue({ actor: "bot@saddlewoodcontracting.com", via: "session" });
    expect((await createGroup(req("POST", "/api/billing/send-groups", { name: "X" }))).status).toBe(403);
    authorizeOps.mockResolvedValue({ actor: "billing.py", via: "token" });
    expect((await createGroup(req("POST", "/api/billing/send-groups", { name: "X" }))).status).toBe(201);
  });

  it("GET shows the group and its documents to staff", async () => {
    const res = await lookGroup(req("GET", `/api/billing/send-groups/${GID}`), { params: Promise.resolve({ id: GID }) });
    expect((await res.json()).documents).toHaveLength(2);
    authorizeOps.mockResolvedValue(null);
    expect((await lookGroup(req("GET", `/api/billing/send-groups/${GID}`), { params: Promise.resolve({ id: GID }) })).status).toBe(401);
  });
});

describe("POST /api/billing/send-groups/<id>/send", () => {
  it("previews one message with a button per document, and holds nothing", async () => {
    const json = await (await send(MSG)).json();
    expect(json.sent).toBe(false);
    expect(json.preview.group).toEqual({ id: GID, name: "JURY-1012" });
    expect(json.preview.documents.map((d: { number: string; issuesOnSend: boolean }) => [d.number, d.issuesOnSend])).toEqual([
      ["8009-13", true],
      ["8009-14", true],
    ]);
    expect(json.preview.body).toContain("View invoice 8009-13: ");
    expect(json.preview.body).toContain("View invoice 8009-14: ");
    expect(claimForSend).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends one message, issues each draft with the token its button carries, and writes one sent line each", async () => {
    const res = await send({ ...MSG, linkLabels: { "8009-13": "Change order 8009-13", [B]: "Change order 8009-14" }, confirm: true });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, sent: true, emailId: "em_g", recorded: true, issued: [A, B], notIssued: [] });

    // The client's message, then our own copy: two sends, one message to the client.
    expect(sendMock).toHaveBeenCalledTimes(2);
    const client = sendMock.mock.calls[0][0];
    expect(client.to).toEqual(["ap@aft.com"]);
    expect(client.cc).toEqual(["chris@aft.com"]);
    expect(client.text).toContain(`Change order 8009-13: ${SITE}/d/${TA}\nChange order 8009-14: ${SITE}/d/${TB}`);
    expect(client.html).toContain(`<a href="${SITE}/d/${TA}" style=`);
    expect(client.html).toContain(`<a href="${SITE}/d/${TB}" style=`);
    expect(client.html).toContain(">Change order 8009-14</a>");
    const ours = sendMock.mock.calls[1][0];
    expect(ours.to).toEqual(["info@saddlewoodcontracting.com"]);
    expect(ours.text).toContain(`${SITE}/d/${TA}?copy=1`);
    expect(ours.text).toContain(`${SITE}/d/${TB}?copy=1`);

    expect(issueDocument.mock.calls.map((c) => [c[0], c[3]])).toEqual([[A, { token: TA }], [B, { token: TB }]]);
    expect(recordEvent).toHaveBeenCalledTimes(2);
    const [ea, eb] = recordEvent.mock.calls.map((c) => c[0]);
    expect(ea).toMatchObject({ documentId: A, kind: "sent", emailId: "em_g", dedupe: `sent:em_g:${A}` });
    expect(eb).toMatchObject({ documentId: B, kind: "sent", emailId: "em_g", dedupe: `sent:em_g:${B}` });
    for (const e of [ea, eb]) {
      expect(e.detail).toMatchObject({ to: ["ap@aft.com"], cc: ["chris@aft.com"], issued: true, group: { id: GID, name: "JURY-1012", documents: ["8009-13", "8009-14"] } });
    }
  });

  it("names each button by its document when the sender does not", async () => {
    await send({ ...MSG, confirm: true });
    expect(sendMock.mock.calls[0][0].html).toContain(">View invoice 8009-13</a>");
    expect(sendMock.mock.calls[0][0].html).toContain(">View invoice 8009-14</a>");
  });

  it("can carry a document already issued beside a draft: only the draft is held and issued", async () => {
    documentsInGroup.mockResolvedValue([{ ...DOC_A, status: "issued", token: TA }, DOC_B]);
    const json = await (await send({ ...MSG, confirm: true })).json();
    expect(claimForSend.mock.calls).toEqual([[B]]);
    expect(json.issued).toEqual([B]);
    expect(recordEvent.mock.calls[0][0].detail).not.toHaveProperty("issued");
    expect(recordEvent.mock.calls[1][0].detail.issued).toBe(true);
  });

  it("leaves every draft a draft when the mail service refuses", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "no" } });
    const res = await send({ ...MSG, confirm: true });
    expect(res.status).toBe(502);
    expect(releaseClaim.mock.calls).toEqual([[A, TA], [B, TB]]);
    expect(issueDocument).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("lets go of the first hold when the second cannot be had, and sends nothing", async () => {
    claimForSend.mockImplementation(async (id: string) => {
      if (id === B) throw new DocumentError("this draft is being sent right now; try again in a minute", 409);
      return TA;
    });
    const res = await send({ ...MSG, confirm: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("8009-14: this draft is being sent right now; try again in a minute");
    expect(releaseClaim.mock.calls).toEqual([[A, TA]]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses a void document, mixed clients, an empty group, or a stranger's address", async () => {
    documentsInGroup.mockResolvedValue([DOC_A, { ...DOC_B, status: "void" }]);
    expect((await send({ ...MSG, confirm: true })).status).toBe(409);
    documentsInGroup.mockResolvedValue([DOC_A, { ...DOC_B, clientId: "88888888-2222-3333-4444-555555555555" }]);
    expect((await send({ ...MSG, confirm: true })).status).toBe(409);
    documentsInGroup.mockResolvedValue([]);
    expect((await send({ ...MSG, confirm: true })).status).toBe(409);
    documentsInGroup.mockResolvedValue([DOC_A, DOC_B]);
    expect((await send({ ...MSG, to: ["someone@else.com"], confirm: true })).status).toBe(400);
    getSendGroup.mockResolvedValue(null);
    expect((await send({ ...MSG, confirm: true })).status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
    expect(claimForSend).not.toHaveBeenCalled();
  });

  it("is for owners (or the Mac)", async () => {
    authorizeOps.mockResolvedValue(null);
    expect((await send({ ...MSG, confirm: true })).status).toBe(401);
    authorizeOps.mockResolvedValue({ actor: "bot@saddlewoodcontracting.com", via: "session" });
    expect((await send({ ...MSG, confirm: true })).status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

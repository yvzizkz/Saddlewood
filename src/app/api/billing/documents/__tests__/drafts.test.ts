import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The doors onto drafts: create (POST /api/billing/documents), look and change
// (GET/PATCH .../<id>), issue and void. Who may use them is checked through
// the real gate (src/lib/ops/auth.ts and src/lib/billing/access.ts), with only
// the sign-in itself and the owners' list faked.

let user: { email: string; app_metadata?: Record<string, unknown> } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));
const readState = vi.fn();
vi.mock("@/lib/bot/queries", () => ({ readState: (...a: unknown[]) => readState(...a) }));
const OWNERS = {
  "lando@saddlewoodcontracting.com": { name: "Lando", role: "owner" },
  "bot@saddlewoodcontracting.com": { name: "Bot", role: "requester" },
};

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
const createDraft = vi.fn();
const getDocument = vi.fn();
const updateDraft = vi.fn();
const ensurePreviewToken = vi.fn();
const issueDocument = vi.fn();
const voidDocument = vi.fn();
vi.mock("@/lib/billing/documents", () => ({
  DocumentError,
  createDraft: (...a: unknown[]) => createDraft(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  updateDraft: (...a: unknown[]) => updateDraft(...a),
  ensurePreviewToken: (...a: unknown[]) => ensurePreviewToken(...a),
  issueDocument: (...a: unknown[]) => issueDocument(...a),
  voidDocument: (...a: unknown[]) => voidDocument(...a),
}));
const getSendGroup = vi.fn();
vi.mock("@/lib/billing/sendGroups", () => ({ getSendGroup: (...a: unknown[]) => getSendGroup(...a) }));

import { POST as create } from "../route";
import { GET as look, PATCH as change } from "../[id]/route";
import { POST as issue } from "../[id]/issue/route";
import { POST as voidIt } from "../[id]/void/route";

const ID = "11111111-2222-3333-4444-555555555555";
const GROUP = "99999999-2222-3333-4444-555555555555";
const CLIENT = "77777777-2222-3333-4444-555555555555";
const AGENT = "agent-token-for-tests-0123456789";
const PREVIEW = "e".repeat(32);
const TOKEN = "c".repeat(32);
const DRAFT = {
  id: ID,
  kind: "invoice",
  number: "8009-13",
  status: "draft",
  token: null,
  previewToken: PREVIEW,
  clientId: CLIENT,
  revision: 1,
  snapshot: { lines: [{ description: "Framing", amountCents: 964300 }] },
};
const ISSUED = { ...DRAFT, status: "issued", token: TOKEN };
const BODY = { kind: "invoice", number: "8009-13", clientId: CLIENT, snapshot: { lines: [{ description: "Framing", amountCents: 964300 }] } };

const LANDO = { email: "lando@saddlewoodcontracting.com" };
const BOT_SESSION = { email: "bot@saddlewoodcontracting.com" };
const CREW = { email: "omar.p@crew.saddlewoodcontracting.com", app_metadata: { sw_role: "crew" } };
const FORMER = { email: "test.pm@crew.saddlewoodcontracting.com", app_metadata: { sw_role: "former" } };

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const asAgent = { authorization: `Bearer ${AGENT}`, "x-ops-actor": "billing.py" };

beforeEach(() => {
  user = LANDO;
  readState.mockReset().mockResolvedValue({ sections: { people: OWNERS }, bridge: {} });
  createDraft.mockReset().mockImplementation(async (input: Record<string, unknown>) => ({ ...DRAFT, ...input, id: ID, status: "draft" }));
  getDocument.mockReset().mockResolvedValue(DRAFT);
  updateDraft.mockReset().mockImplementation(async (_id: string, changes: Record<string, unknown>) => ({ ...DRAFT, ...changes }));
  ensurePreviewToken.mockReset().mockImplementation(async (d: unknown) => d);
  issueDocument.mockReset().mockResolvedValue(ISSUED);
  voidDocument.mockReset().mockImplementation(async (_id: string, reason: string) => ({ ...ISSUED, status: "void", voidReason: reason }));
  getSendGroup.mockReset().mockResolvedValue({ id: GROUP, name: "JURY-1012", clientId: CLIENT });
  vi.stubEnv("OPS_AGENT_TOKEN", AGENT);
  vi.stubEnv("INTERNAL_ALLOWED_EMAILS", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://saddlewoodcontracting.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const allDoors = () => [
  () => create(req("POST", "/api/billing/documents", BODY)),
  () => look(req("GET", `/api/billing/documents/${ID}`), ctx()),
  () => change(req("PATCH", `/api/billing/documents/${ID}`, { title: "x" }), ctx()),
  () => issue(req("POST", `/api/billing/documents/${ID}/issue`, {}), ctx()),
  () => voidIt(req("POST", `/api/billing/documents/${ID}/void`, { reason: "wrong" }), ctx()),
];

describe("who may use the draft doors", () => {
  it("refuses anyone not signed in, before looking anything up", async () => {
    user = null;
    for (const door of allDoors()) expect((await door()).status).toBe(401);
    expect(getDocument).not.toHaveBeenCalled();
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("refuses a crew seat, and a seat that was taken away (sw_role marked)", async () => {
    for (const seat of [CREW, FORMER]) {
      user = seat;
      for (const door of allDoors()) expect((await door()).status).toBe(401);
    }
    expect(getDocument).not.toHaveBeenCalled();
    expect(createDraft).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
    expect(issueDocument).not.toHaveBeenCalled();
    expect(voidDocument).not.toHaveBeenCalled();
  });

  it("refuses a wrong agent token", async () => {
    user = null;
    const res = await create(req("POST", "/api/billing/documents", BODY, { authorization: "Bearer not-the-token-at-all-xx" }));
    expect(res.status).toBe(401);
  });

  it("lets staff who are not owners look, not change", async () => {
    user = BOT_SESSION;
    expect((await look(req("GET", `/api/billing/documents/${ID}`), ctx())).status).toBe(200);
    expect((await create(req("POST", "/api/billing/documents", BODY))).status).toBe(403);
    expect((await change(req("PATCH", `/api/billing/documents/${ID}`, { title: "x" }), ctx())).status).toBe(403);
    expect((await issue(req("POST", `/api/billing/documents/${ID}/issue`, {}), ctx())).status).toBe(403);
    expect((await voidIt(req("POST", `/api/billing/documents/${ID}/void`, { reason: "x" }), ctx())).status).toBe(403);
    expect(createDraft).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("lets the Mac's billing tool create, change and issue, but never void", async () => {
    user = null;
    expect((await create(req("POST", "/api/billing/documents", BODY, asAgent))).status).toBe(201);
    expect(createDraft.mock.calls[0][0].createdBy).toBe("billing.py");
    expect((await change(req("PATCH", `/api/billing/documents/${ID}`, { title: "x" }, asAgent), ctx())).status).toBe(200);
    expect((await issue(req("POST", `/api/billing/documents/${ID}/issue`, {}, asAgent), ctx())).status).toBe(200);
    getDocument.mockResolvedValue(ISSUED);
    expect((await voidIt(req("POST", `/api/billing/documents/${ID}/void`, { reason: "x" }, asAgent), ctx())).status).toBe(403);
    expect(voidDocument).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/documents (create a draft)", () => {
  it("makes a draft and answers with its preview link, never a client link", async () => {
    const res = await create(req("POST", "/api/billing/documents", { ...BODY, title: "Change order", dueDate: "2026-10-23" }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.document.previewLink).toBe(`https://saddlewoodcontracting.com/d/p/${PREVIEW}`);
    expect(json.document.link).toBeNull();
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "invoice", number: "8009-13", clientId: CLIENT, title: "Change order", dueDate: "2026-10-23", createdBy: "lando@saddlewoodcontracting.com", supersedes: null }),
    );
  });

  it("refuses what a document does not have, by name", async () => {
    for (const [body, msg] of [
      [{ ...BODY, kind: "receipt" }, /kind must be one of/],
      [{ ...BODY, number: "" }, /number is required/],
      [{ ...BODY, snapshot: { lines: [{ description: "x", amountCents: 10.5 }] } }, /whole cents/],
      [{ ...BODY, snapshot: { lines: [{ description: "x", amount: 100 }] } }, /snapshot\.lines\[0\]\.amount is not something/],
      [{ ...BODY, snapshot: { total: 5 } }, /snapshot\.total is not something/],
      [{ ...BODY, dueDate: "2026-02-30" }, /not a real date/],
      [{ ...BODY, clientId: "acme" }, /clientId must be an id/],
      [{ ...BODY, status: "issued" }, /body\.status is not something/],
      [{ ...BODY, token: TOKEN }, /body\.token is not something/],
    ] as const) {
      const res = await create(req("POST", "/api/billing/documents", body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(msg);
    }
    expect((await create(req("POST", "/api/billing/documents", "{nope"))).status).toBe(400);
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("passes a refusal from the database on in words (a number already used)", async () => {
    createDraft.mockRejectedValue(new DocumentError("number 8009-13 is already in use on this job", 409));
    const res = await create(req("POST", "/api/billing/documents", BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already in use/);
  });

  it("makes a revision of an issued document, never of a draft", async () => {
    getDocument.mockResolvedValue({ ...ISSUED, revision: 2 });
    expect((await create(req("POST", "/api/billing/documents", { ...BODY, supersedes: ID }))).status).toBe(201);
    expect(createDraft.mock.calls[0][0].supersedes).toEqual({ id: ID, revision: 2 });
    getDocument.mockResolvedValue(DRAFT);
    expect((await create(req("POST", "/api/billing/documents", { ...BODY, supersedes: ID }))).status).toBe(409);
  });

  it("puts it in a send group only for the group's client", async () => {
    expect((await create(req("POST", "/api/billing/documents", { ...BODY, sendGroupId: GROUP }))).status).toBe(201);
    getSendGroup.mockResolvedValue({ id: GROUP, name: "X", clientId: "88888888-2222-3333-4444-555555555555" });
    expect((await create(req("POST", "/api/billing/documents", { ...BODY, sendGroupId: GROUP }))).status).toBe(409);
    getSendGroup.mockResolvedValue(null);
    expect((await create(req("POST", "/api/billing/documents", { ...BODY, sendGroupId: GROUP }))).status).toBe(400);
  });
});

describe("PATCH /api/billing/documents/<id> (change a draft)", () => {
  it("changes a draft as many times as needed", async () => {
    for (const title of ["First wording", "Second wording"]) {
      const res = await change(req("PATCH", `/api/billing/documents/${ID}`, { title }), ctx());
      expect(res.status).toBe(200);
      expect((await res.json()).document.title).toBe(title);
    }
    const lines = { snapshot: { lines: [{ description: "Framing", amountCents: 1000, parts: [{ description: "Blocking", amountCents: 0, label: "No charge" }] }] } };
    expect((await change(req("PATCH", `/api/billing/documents/${ID}`, lines), ctx())).status).toBe(200);
    expect(updateDraft).toHaveBeenCalledTimes(3);
    expect(updateDraft.mock.calls[2][1]).toEqual(lines);
  });

  it("is refused once the document is issued, or void", async () => {
    for (const d of [ISSUED, { ...ISSUED, status: "void" }]) {
      getDocument.mockResolvedValue(d);
      const res = await change(req("PATCH", `/api/billing/documents/${ID}`, { title: "Late fix" }), ctx());
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/cannot be changed; issue a new revision/);
    }
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("is refused when it became issued between the look and the change (the conditional update)", async () => {
    updateDraft.mockRejectedValue(new DocumentError("this invoice was issued and cannot be changed; issue a new revision instead", 409));
    expect((await change(req("PATCH", `/api/billing/documents/${ID}`, { title: "x" }), ctx())).status).toBe(409);
  });

  it("refuses an empty change, a status, or a token", async () => {
    for (const body of [{}, { status: "issued" }, { token: TOKEN }, { previewToken: PREVIEW }]) {
      expect((await change(req("PATCH", `/api/billing/documents/${ID}`, body), ctx())).status).toBe(400);
    }
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown id", async () => {
    getDocument.mockResolvedValue(null);
    expect((await change(req("PATCH", `/api/billing/documents/${ID}`, { title: "x" }), ctx())).status).toBe(404);
    expect((await change(req("PATCH", `/api/billing/documents/nope`, { title: "x" }), ctx("nope"))).status).toBe(404);
  });
});

describe("GET /api/billing/documents/<id>", () => {
  it("shows a draft with its preview link and an issued one with its client link", async () => {
    let json = await (await look(req("GET", `/api/billing/documents/${ID}`), ctx())).json();
    expect(json.document).toMatchObject({ previewLink: `https://saddlewoodcontracting.com/d/p/${PREVIEW}`, link: null });
    getDocument.mockResolvedValue(ISSUED);
    json = await (await look(req("GET", `/api/billing/documents/${ID}`), ctx())).json();
    expect(json.document).toMatchObject({ previewLink: null, link: `https://saddlewoodcontracting.com/d/${TOKEN}` });
  });
});

describe("POST .../issue and .../void", () => {
  it("issues a draft and answers with the client link", async () => {
    const res = await issue(req("POST", `/api/billing/documents/${ID}/issue`, {}), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).document.link).toBe(`https://saddlewoodcontracting.com/d/${TOKEN}`);
    expect(issueDocument).toHaveBeenCalledWith(ID, "lando@saddlewoodcontracting.com");
  });

  it("refuses to issue twice", async () => {
    issueDocument.mockRejectedValue(new DocumentError("this document is not a draft, so it cannot be issued", 409));
    const res = await issue(req("POST", `/api/billing/documents/${ID}/issue`, {}), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not a draft/);
  });

  it("voids an issued document only with a reason", async () => {
    getDocument.mockResolvedValue(ISSUED);
    for (const body of [{}, { reason: "" }, { reason: "   " }, { reason: 5 }]) {
      const res = await voidIt(req("POST", `/api/billing/documents/${ID}/void`, body), ctx());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("voiding a document needs a reason");
    }
    expect(voidDocument).not.toHaveBeenCalled();
    const res = await voidIt(req("POST", `/api/billing/documents/${ID}/void`, { reason: "  wrong   amount " }), ctx());
    expect(res.status).toBe(200);
    expect(voidDocument).toHaveBeenCalledWith(ID, "wrong amount");
    expect((await res.json()).document).toMatchObject({ status: "void", voidReason: "wrong amount" });
  });

  it("does not void a draft (never sent) or a void one", async () => {
    getDocument.mockResolvedValue(DRAFT);
    let res = await voidIt(req("POST", `/api/billing/documents/${ID}/void`, { reason: "not needed" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/never sent/);
    getDocument.mockResolvedValue({ ...ISSUED, status: "void" });
    res = await voidIt(req("POST", `/api/billing/documents/${ID}/void`, { reason: "again" }), ctx());
    expect(res.status).toBe(409);
    expect(voidDocument).not.toHaveBeenCalled();
  });
});

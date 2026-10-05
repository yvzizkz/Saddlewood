import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeOps = vi.fn();
vi.mock("@/lib/ops/auth", () => ({ authorizeOps: (...a: unknown[]) => authorizeOps(...a) }));

const getDocument = vi.fn();
vi.mock("@/lib/billing/documents", () => ({ getDocument: (...a: unknown[]) => getDocument(...a) }));

const addLinkExhibit = vi.fn();
const addFileExhibit = vi.fn();
const listExhibits = vi.fn();
const removeExhibit = vi.fn();
vi.mock("@/lib/billing/exhibits", () => ({
  addLinkExhibit: (...a: unknown[]) => addLinkExhibit(...a),
  addFileExhibit: (...a: unknown[]) => addFileExhibit(...a),
  listExhibits: (...a: unknown[]) => listExhibits(...a),
  removeExhibit: (...a: unknown[]) => removeExhibit(...a),
}));

import { POST } from "../route";

const ID = "11111111-2222-3333-4444-555555555555";
const DOC = { id: ID, status: "issued", snapshot: { lines: [{ description: "a", amountCents: 1 }, { description: "b", amountCents: 2 }] } };
const JOIST = "https://client.joistapp.com/invoices/31987ab3725d81e564edb528";
const PDF = Buffer.from("%PDF-1.4").toString("base64");

function call(body: unknown, id = ID) {
  return POST(
    new Request(`http://localhost/api/billing/documents/${id}/exhibits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  authorizeOps.mockReset().mockResolvedValue({ actor: "lando@saddlewoodcontracting.com", via: "session" });
  getDocument.mockReset().mockResolvedValue(DOC);
  addLinkExhibit.mockReset().mockResolvedValue({ id: "e1" });
  addFileExhibit.mockReset().mockResolvedValue({ id: "e2" });
  removeExhibit.mockReset().mockResolvedValue(true);
});

describe("POST /api/billing/documents/[id]/exhibits", () => {
  it("answers 401 to anyone who is not staff", async () => {
    authorizeOps.mockResolvedValue(null);
    expect((await call({ label: "View original invoice", url: JOIST })).status).toBe(401);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("adds an original-invoice link under a line", async () => {
    const res = await call({ label: "View original invoice", url: JOIST, lineIndex: 1 });
    expect(res.status).toBe(200);
    expect(addLinkExhibit).toHaveBeenCalledWith({ documentId: ID, lineIndex: 1, label: "View original invoice", url: JOIST, addedBy: "lando@saddlewoodcontracting.com" });
  });

  it("adds a waiver file", async () => {
    const res = await call({ label: "View waiver", file: { filename: "Waiver_Carder_4125-03_13250.pdf", content: PDF } });
    expect(res.status).toBe(200);
    const arg = addFileExhibit.mock.calls[0][0];
    expect(arg).toMatchObject({ documentId: ID, lineIndex: null, label: "View waiver", contentType: "application/pdf" });
    expect(Buffer.isBuffer(arg.content)).toBe(true);
  });

  it("refuses links to other sites, other file kinds, a line that is not there, and both or neither", async () => {
    const bad = [
      { label: "x", url: "https://evil.example.com/a" },
      { label: "x", url: "http://client.joistapp.com/invoices/1" },
      { label: "", url: JOIST },
      { label: "x", file: { filename: "run.exe", content: PDF } },
      { label: "", file: { filename: "a.pdf", content: PDF } },
      { label: "x", url: JOIST, lineIndex: 2 },
      { label: "x", url: JOIST, lineIndex: -1 },
      { label: "x", url: JOIST, lineIndex: 1.5 },
      { label: "x", url: JOIST, file: { filename: "a.pdf", content: PDF } },
      { label: "x" },
    ];
    for (const body of bad) expect((await call(body)).status).toBe(400);
    expect(addLinkExhibit).not.toHaveBeenCalled();
    expect(addFileExhibit).not.toHaveBeenCalled();
  });

  it("takes one down only with a reason", async () => {
    expect((await call({ remove: "e1" })).status).toBe(400);
    expect(removeExhibit).not.toHaveBeenCalled();
    expect((await call({ remove: "e1", reason: "wrong waiver" })).status).toBe(200);
    expect(removeExhibit).toHaveBeenCalledWith("e1", ID, "wrong waiver");
    removeExhibit.mockResolvedValue(false);
    expect((await call({ remove: "e1", reason: "again" })).status).toBe(404);
  });

  it("adds nothing to a voided document or one that does not exist", async () => {
    getDocument.mockResolvedValue({ ...DOC, status: "void" });
    expect((await call({ label: "x", url: JOIST })).status).toBe(409);
    getDocument.mockResolvedValue(null);
    expect((await call({ label: "x", url: JOIST })).status).toBe(404);
    expect((await call({ label: "x", url: JOIST }, "nope")).status).toBe(404);
    expect(addLinkExhibit).not.toHaveBeenCalled();
  });
});

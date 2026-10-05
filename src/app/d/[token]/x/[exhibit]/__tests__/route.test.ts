import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocumentByToken = vi.fn();
vi.mock("@/lib/billing/documents", () => ({ getDocumentByToken: (...a: unknown[]) => getDocumentByToken(...a) }));

const getExhibit = vi.fn();
const readExhibitFile = vi.fn();
vi.mock("@/lib/billing/exhibits", () => ({
  getExhibit: (...a: unknown[]) => getExhibit(...a),
  readExhibitFile: (...a: unknown[]) => readExhibitFile(...a),
}));

const recordOpening = vi.fn();
vi.mock("@/lib/billing/opening", () => ({ recordOpening: (...a: unknown[]) => recordOpening(...a) }));

import { NextRequest } from "next/server";
import { GET } from "../route";

const TOKEN = "b".repeat(32);
const EX = "99999999-2222-3333-4444-555555555555";
const DOC = { id: "doc-1", status: "issued", token: TOKEN };
const LINK = { id: EX, documentId: "doc-1", kind: "link", label: "View original invoice", url: "https://client.joistapp.com/invoices/abc", storagePath: null, removedAt: null };
const FILE = { id: EX, documentId: "doc-1", kind: "file", label: "View waiver", url: null, storagePath: "doc-1/x.pdf", contentType: "application/pdf", removedAt: null };

function call(query = "") {
  return GET(new NextRequest(`https://saddlewoodcontracting.com/d/${TOKEN}/x/${EX}${query}`), {
    params: Promise.resolve({ token: TOKEN, exhibit: EX }),
  });
}

beforeEach(() => {
  getDocumentByToken.mockReset().mockResolvedValue(DOC);
  getExhibit.mockReset().mockResolvedValue(LINK);
  readExhibitFile.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4"));
  recordOpening.mockReset().mockResolvedValue(undefined);
});

describe("GET /d/[token]/x/[exhibit]", () => {
  it("records the opening, then sends the client on to the original invoice", async () => {
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://client.joistapp.com/invoices/abc");
    expect(recordOpening).toHaveBeenCalledWith(DOC, "downloaded", { exhibit: "View original invoice", exhibitId: EX });
  });

  it("serves a waiver file inline and never lets it be cached", async () => {
    getExhibit.mockResolvedValue(FILE);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="View waiver.pdf"');
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF-1.4");
    expect(recordOpening).toHaveBeenCalledTimes(1);
  });

  it("does not count our own people's copy", async () => {
    expect((await call("?copy=1")).status).toBe(302);
    expect(recordOpening).not.toHaveBeenCalled();
  });

  it("answers 404, with nothing recorded, when the token, document or exhibit does not line up", async () => {
    const cases: (() => void)[] = [
      () => getDocumentByToken.mockResolvedValue(null),
      () => getDocumentByToken.mockResolvedValue({ ...DOC, status: "draft" }),
      () => getExhibit.mockResolvedValue(null),
      () => getExhibit.mockResolvedValue({ ...LINK, documentId: "another-document" }),
      () => getExhibit.mockResolvedValue({ ...LINK, removedAt: "2026-10-05T00:00:00Z" }),
    ];
    for (const arrange of cases) {
      getDocumentByToken.mockResolvedValue(DOC);
      getExhibit.mockResolvedValue(LINK);
      arrange();
      expect((await call()).status).toBe(404);
    }
    expect(recordOpening).not.toHaveBeenCalled();
    expect(readExhibitFile).not.toHaveBeenCalled();
  });
});

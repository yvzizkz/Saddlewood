import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { NextRequest } from "next/server";

// The draft's preview, /d/p/<preview token>: the client's page under a
// "PREVIEW, not sent" band, that counts nothing and tells no one, and closes
// once the document is issued.

const getDocumentByToken = vi.fn();
const getDocumentByPreviewToken = vi.fn();
const recordEvent = vi.fn();
vi.mock("@/lib/billing/documents", () => ({
  getDocumentByToken: (...a: unknown[]) => getDocumentByToken(...a),
  getDocumentByPreviewToken: (...a: unknown[]) => getDocumentByPreviewToken(...a),
  recordEvent: (...a: unknown[]) => recordEvent(...a),
}));
const listExhibits = vi.fn();
const getExhibit = vi.fn();
const readExhibitFile = vi.fn();
vi.mock("@/lib/billing/exhibits", () => ({
  listExhibits: (...a: unknown[]) => listExhibits(...a),
  getExhibit: (...a: unknown[]) => getExhibit(...a),
  readExhibitFile: (...a: unknown[]) => readExhibitFile(...a),
}));
// Neither of these may ever be reached from a preview.
const recordOpening = vi.fn();
vi.mock("@/lib/billing/opening", () => ({ recordOpening: (...a: unknown[]) => recordOpening(...a) }));
const sendViewAlert = vi.fn();
vi.mock("@/lib/billing/viewAlert", () => ({ sendViewAlert: (...a: unknown[]) => sendViewAlert(...a) }));

import PreviewPage from "../page";
import ClientPage from "../../../[token]/page";
import { GET as previewExhibit } from "../x/[exhibit]/route";

const PREVIEW = "e".repeat(32);
const TOKEN = "c".repeat(32);
const DRAFT = {
  id: "doc-1",
  kind: "change_order",
  jobId: null,
  clientId: "client-1",
  number: "8009-14",
  title: "Change order: stair framing",
  status: "draft",
  revision: 1,
  supersedes: null,
  snapshot: {
    billTo: { name: "A Finer Touch Construction" },
    date: "2026-10-12",
    lines: [
      { description: "Stair framing", amountCents: 1988186, parts: [{ description: "Blocking", amountCents: 0 }] },
      { description: "Credit", amountCents: -10000 },
    ],
    notIncluded: [{ description: "Paint" }],
    terms: "Due in 7 days.",
  },
  totalCents: 1978186,
  dueDate: "2026-10-19",
  token: null,
  issuedAt: null,
  issuedBy: "",
  voidReason: "",
  createdAt: "2026-10-12T20:00:00.000Z",
  previewToken: PREVIEW,
};
const EXHIBITS = [
  { id: "ex-1", documentId: "doc-1", lineIndex: 0, label: "View original invoice", kind: "link", url: "https://client.joistapp.com/x", storagePath: null, removedAt: null },
  { id: "ex-2", documentId: "doc-1", lineIndex: null, label: "Waiver (PDF)", kind: "file", url: null, storagePath: "doc-1/w.pdf", contentType: "application/pdf", removedAt: null },
];

async function preview(token = PREVIEW): Promise<string> {
  return renderToStaticMarkup((await PreviewPage({ params: Promise.resolve({ token }) })) as ReactElement);
}

beforeEach(() => {
  getDocumentByPreviewToken.mockReset().mockResolvedValue(DRAFT);
  getDocumentByToken.mockReset();
  listExhibits.mockReset().mockResolvedValue(EXHIBITS);
  getExhibit.mockReset().mockImplementation(async (id: string) => EXHIBITS.find((e) => e.id === id) ?? null);
  readExhibitFile.mockReset().mockResolvedValue(Buffer.from("%PDF-1.4"));
  recordOpening.mockReset();
  recordEvent.mockReset();
  sendViewAlert.mockReset();
});

describe("/d/p/[token] (a draft's preview)", () => {
  it("renders the draft under the PREVIEW band", async () => {
    const html = await preview();
    expect(html).toContain("PREVIEW, not sent.");
    expect(html).toContain("Change Order");
    expect(html).toContain("No. 8009-14");
    expect(html).toContain("Stair framing");
    expect(html).toContain("$19,781.86");
    expect(html).toContain("Not included in this total");
    expect(getDocumentByPreviewToken).toHaveBeenCalledWith(PREVIEW);
    // The client's token lookup is not how a preview is found.
    expect(getDocumentByToken).not.toHaveBeenCalled();
  });

  it("records no view and alerts no one, however often it is opened", async () => {
    for (let i = 0; i < 3; i++) await preview();
    expect(recordOpening).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
    expect(sendViewAlert).not.toHaveBeenCalled();
  });

  it("is exactly the client's page, but for the band and where its exhibits open", async () => {
    const draftHtml = await preview();
    getDocumentByToken.mockResolvedValue({ ...DRAFT, status: "issued", token: TOKEN, issuedAt: "2026-10-12T21:00:00Z" });
    const clientHtml = renderToStaticMarkup(
      (await ClientPage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve({}) })) as ReactElement,
    );
    const withoutBand = draftHtml.replace(/<div role="status"[^>]*>.*?<\/div>/, "");
    expect(withoutBand).not.toContain("PREVIEW");
    expect(withoutBand.split(`/d/p/${PREVIEW}/x/`).join(`/d/${TOKEN}/x/`)).toBe(clientHtml);
  });

  it("sends its exhibits through the preview's own door", async () => {
    const html = await preview();
    expect(html).toContain(`href="/d/p/${PREVIEW}/x/ex-1"`);
    expect(html).toContain(`href="/d/p/${PREVIEW}/x/ex-2?dl=1"`);
    expect(html).not.toMatch(/href="\/d\/[0-9a-f]{32}\/x\//);
  });

  it("shows today as the date when the draft has none of its own", async () => {
    getDocumentByPreviewToken.mockResolvedValue({ ...DRAFT, snapshot: { ...DRAFT.snapshot, date: undefined } });
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
    expect(await preview()).toContain(today);
  });

  it("stops working once the document is issued, or voided: it says it was sent", async () => {
    for (const status of ["issued", "void"]) {
      getDocumentByPreviewToken.mockResolvedValue({ ...DRAFT, status, token: TOKEN, issuedAt: "2026-10-12T21:00:00Z" });
      listExhibits.mockClear();
      const html = await preview();
      expect(html).toContain("This change order was sent");
      expect(html).toContain("Ask for the current link");
      expect(html).not.toContain("PREVIEW");
      expect(html).not.toContain("Stair framing");
      expect(html).not.toContain(TOKEN);
      expect(listExhibits).not.toHaveBeenCalled();
    }
    expect(recordOpening).not.toHaveBeenCalled();
  });

  it("does not open for an unknown token", async () => {
    getDocumentByPreviewToken.mockResolvedValue(null);
    expect(await preview("f".repeat(32))).toContain("This preview link does not open a document");
  });
});

describe("/d/p/[token]/x/[exhibit] (an exhibit opened from a preview)", () => {
  const open = (id: string, query = "") =>
    previewExhibit(new NextRequest(`https://saddlewoodcontracting.com/d/p/${PREVIEW}/x/${id}${query}`), {
      params: Promise.resolve({ token: PREVIEW, exhibit: id }),
    });

  it("opens the link or the file, and records nothing", async () => {
    const link = await open("ex-1");
    expect(link.status).toBe(302);
    expect(link.headers.get("location")).toBe("https://client.joistapp.com/x");
    const file = await open("ex-2", "?dl=1");
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toBe('attachment; filename="Waiver PDF.pdf"');
    expect(file.headers.get("cache-control")).toContain("no-store");
    expect(recordOpening).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("closes once the document is issued, and never opens another document's exhibit", async () => {
    getDocumentByPreviewToken.mockResolvedValue({ ...DRAFT, status: "issued", token: TOKEN });
    expect((await open("ex-1")).status).toBe(404);
    getDocumentByPreviewToken.mockResolvedValue(DRAFT);
    getExhibit.mockResolvedValue({ ...EXHIBITS[0], documentId: "doc-2" });
    expect((await open("ex-1")).status).toBe(404);
    getExhibit.mockResolvedValue({ ...EXHIBITS[0], removedAt: "2026-10-13T00:00:00Z" });
    expect((await open("ex-1")).status).toBe(404);
  });
});

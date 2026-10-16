import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

// The client's page, /d/<token>, is live: real clients hold these links. These
// tests pin exactly what it renders and what it writes to the proof record, so
// that sharing its layout with the preview page (/d/p/<token>) cannot change
// an issued document by a single character. The .html files beside this test
// were written from the page as it stood before the split (main 6a168f5).

const getDocumentByToken = vi.fn();
vi.mock("@/lib/billing/documents", () => ({ getDocumentByToken: (...a: unknown[]) => getDocumentByToken(...a) }));

const listExhibits = vi.fn();
vi.mock("@/lib/billing/exhibits", () => ({ listExhibits: (...a: unknown[]) => listExhibits(...a) }));

const recordOpening = vi.fn();
vi.mock("@/lib/billing/opening", () => ({ recordOpening: (...a: unknown[]) => recordOpening(...a) }));

import DocumentPage from "../page";

const TOKEN = "c".repeat(32);

const ISSUED = {
  id: "doc-1",
  kind: "invoice",
  jobId: "job-1",
  clientId: "client-1",
  number: "8009-13",
  title: "Change order: added framing at the stair",
  status: "issued",
  revision: 2,
  supersedes: null,
  snapshot: {
    billTo: { name: "A Finer Touch Construction", attention: "Accounts Payable", address: "123 Main St\nScottsdale, AZ 85251" },
    job: { name: "Jury Residence", address: "4632 E Example Rd\nPhoenix, AZ" },
    lines: [
      {
        description: "Framing changes at the stair",
        amountCents: 964300,
        note: "Per the walk on 10/2.\nTwo lines of note.",
        parts: [
          { description: "Header at opening", amountCents: 160000 },
          { description: "Blocking for rail", amountCents: 0 },
          { description: "Owner-supplied hardware", amountCents: 0, label: "By owner" },
        ],
      },
      { description: "Lumber", amountCents: 120050, quantity: 12, unit: "sheets" },
      { description: "Credit for unused labor", amountCents: -50000 },
    ],
    notIncluded: [{ description: "Paint", note: "By others" }, { description: "Permit fees" }],
    terms: "Due in 7 days. Pay by Melio or check.",
    note: "Thank you for the work.",
  },
  totalCents: 1034350,
  dueDate: "2026-10-19",
  token: TOKEN,
  issuedAt: "2026-10-12T21:30:00.000Z",
  issuedBy: "lando@saddlewoodcontracting.com",
  voidReason: "",
  createdAt: "2026-10-12T20:00:00.000Z",
};

const EXHIBITS = [
  { id: "ex-link-0", documentId: "doc-1", lineIndex: 0, label: "View original invoice", kind: "link", url: "https://client.joistapp.com/x", storagePath: null, contentType: null, bytes: null, addedAt: "2026-10-12T21:31:00Z", addedBy: "x", removedAt: null },
  { id: "ex-file-0", documentId: "doc-1", lineIndex: 0, label: "View waiver (PDF)", kind: "file", url: null, storagePath: "doc-1/a.pdf", contentType: "application/pdf", bytes: 10, addedAt: "2026-10-12T21:32:00Z", addedBy: "x", removedAt: null },
  { id: "ex-file-g", documentId: "doc-1", lineIndex: null, label: "Signed change order", kind: "file", url: null, storagePath: "doc-1/b.pdf", contentType: "application/pdf", bytes: 10, addedAt: "2026-10-12T21:33:00Z", addedBy: "x", removedAt: null },
  { id: "ex-link-9", documentId: "doc-1", lineIndex: 9, label: "Schedule of values", kind: "link", url: "https://client.joistapp.com/y", storagePath: null, contentType: null, bytes: null, addedAt: "2026-10-12T21:34:00Z", addedBy: "x", removedAt: null },
];

async function render(token: string, copy?: string): Promise<string> {
  const el = await DocumentPage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve(copy === undefined ? {} : { copy }),
  });
  return renderToStaticMarkup(el as ReactElement);
}

beforeEach(() => {
  getDocumentByToken.mockReset().mockResolvedValue(ISSUED);
  listExhibits.mockReset().mockResolvedValue(EXHIBITS);
  recordOpening.mockReset().mockResolvedValue(undefined);
});

describe("/d/[token] (the client's page) renders exactly as before", () => {
  it("an issued invoice with parts, a credit, exhibits, not-included and terms", async () => {
    const html = await render(TOKEN);
    await expect(html).toMatchFileSnapshot("./__snapshots__/issued.html");
    expect(html).not.toContain("PREVIEW");
  });

  it("our own people's copy (?copy=1): the same page, its links carry copy=1", async () => {
    await expect(await render(TOKEN, "1")).toMatchFileSnapshot("./__snapshots__/issued-copy.html");
  });

  it("a void document carries the void notice", async () => {
    getDocumentByToken.mockResolvedValue({ ...ISSUED, status: "void", voidReason: "wrong amount" });
    await expect(await render(TOKEN)).toMatchFileSnapshot("./__snapshots__/void.html");
  });

  it("a statement with no exhibits, title, due date or terms", async () => {
    getDocumentByToken.mockResolvedValue({
      ...ISSUED,
      kind: "statement",
      title: "",
      dueDate: null,
      snapshot: { lines: [{ description: "Invoice 8009-08", amountCents: 2225719 }], date: "2026-10-05" },
    });
    listExhibits.mockResolvedValue([]);
    await expect(await render(TOKEN)).toMatchFileSnapshot("./__snapshots__/statement-bare.html");
  });

  it("still shows the document when its exhibits fail to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    listExhibits.mockRejectedValue(new Error("db down"));
    const html = await render(TOKEN);
    expect(html).toContain("No. 8009-13");
    expect(html).not.toContain("View waiver");
  });

  it("a draft, or an unknown token, does not open", async () => {
    getDocumentByToken.mockResolvedValue({ ...ISSUED, status: "draft", token: null });
    const draft = await render(TOKEN);
    await expect(draft).toMatchFileSnapshot("./__snapshots__/not-found.html");
    getDocumentByToken.mockResolvedValue(null);
    expect(await render("nope")).toBe(draft);
    expect(recordOpening).not.toHaveBeenCalled();
    expect(listExhibits).not.toHaveBeenCalled();
  });
});

describe("/d/[token] writes the proof record exactly as before", () => {
  it("records one 'viewed' opening for the client", async () => {
    await render(TOKEN);
    expect(recordOpening).toHaveBeenCalledTimes(1);
    expect(recordOpening).toHaveBeenCalledWith(ISSUED, "viewed");
  });

  it("records a void document's opening too", async () => {
    const v = { ...ISSUED, status: "void", voidReason: "wrong amount" };
    getDocumentByToken.mockResolvedValue(v);
    await render(TOKEN);
    expect(recordOpening).toHaveBeenCalledWith(v, "viewed");
  });

  it("does not record our own people's copy", async () => {
    await render(TOKEN, "1");
    expect(recordOpening).not.toHaveBeenCalled();
  });

  it("looks the document up by the token in the link", async () => {
    await render(TOKEN);
    expect(getDocumentByToken).toHaveBeenCalledWith(TOKEN);
    expect(listExhibits).toHaveBeenCalledWith("doc-1");
  });
});

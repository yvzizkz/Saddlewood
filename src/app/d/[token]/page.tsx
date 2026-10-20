import type { Metadata } from "next";
import { getDocumentByToken } from "@/lib/billing/documents";
import { listExhibits, type Exhibit } from "@/lib/billing/exhibits";
import { listEvents } from "@/lib/billing/documents";
import { recordOpening } from "@/lib/billing/opening";
import { proposalFromDocument } from "@/lib/sales/store";
import { publicSignature, signaturesOf, type PublicSignature } from "@/lib/sales/signing";
import { ProposalView } from "@/components/sales/ProposalView";
import { DocumentView } from "../DocumentView";

// The client's copy of a document we issued: /d/<token>.
//
// Opening this page is what "viewed" means in the proof record. The email we
// send carries a summary and this link, so reading the document itself leaves
// a line here: when, and on what kind of device. Staff looking at it while
// signed in are not counted, and an opening that looks like a mail scanner is
// kept but marked (src/lib/billing/proof.ts).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saddlewood Contracting",
  robots: { index: false, follow: false },
};

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ copy?: string | string[] }>;
}) {
  const { token } = await params;
  // Our own people's copy of a billing message links here with ?copy=1, and
  // that opening is not counted: a "viewed" line has to mean the client.
  const ownCopy = (await searchParams).copy === "1";
  const doc = await getDocumentByToken(token);

  if (!doc || doc.status === "draft") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-white">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            This link does not open a document
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Check that the whole link was copied, or ask us to send it again:
            accounting@saddlewoodcontracting.com
          </p>
        </div>
      </main>
    );
  }

  if (!ownCopy) await recordOpening(doc, "viewed");

  // A proposal from Sales (kind estimate, with its proposal frozen in the
  // snapshot): the client chooses a package and add-ons and accepts here.
  const proposal = proposalFromDocument(doc);
  if (proposal) {
    let accepted = null;
    let signatures: PublicSignature[] = [];
    try {
      const events = await listEvents(doc.id);
      const a = events.find((e) => e.kind === "accepted");
      if (a) {
        accepted = {
          at: a.at,
          name: String(a.detail.name ?? ""),
          packageName: String(a.detail.packageName ?? ""),
          totalCents: Number(a.detail.totalCents) || 0,
          packageId: String(a.detail.packageId ?? ""),
          optionIds: Array.isArray(a.detail.options) ? (a.detail.options as { id?: string }[]).map((o) => String(o.id ?? "")) : [],
        };
      }
      // What the page shows of each signature: never where it was signed from.
      signatures = signaturesOf(events).map(publicSignature);
    } catch (err) {
      console.error("acceptance not loaded:", err);
    }
    const s = doc.snapshot;
    return (
      <ProposalView
        proposal={proposal}
        mode={ownCopy ? "preview" : "client"}
        token={doc.token ?? undefined}
        meta={{
          number: doc.number,
          date: s.date ?? doc.issuedAt,
          preparedFor: { name: s.billTo?.name ?? "", attention: s.billTo?.attention },
          project: { name: s.job?.name ?? doc.title, address: s.job?.address },
          accepted,
          signatures,
          void: doc.status === "void",
        }}
      />
    );
  }

  // The original invoice and the waiver for each line, when we have put them
  // here. A failure to load them must not keep the client from the document.
  let exhibits: Exhibit[] = [];
  try {
    exhibits = await listExhibits(doc.id);
  } catch (err) {
    console.error("exhibits not loaded:", err);
  }
  const href = (e: Exhibit) =>
    `/d/${doc.token}/x/${e.id}${ownCopy ? "?copy=1" : ""}`;
  // The same file, saved instead of opened in the browser.
  const saveHref = (e: Exhibit) =>
    `/d/${doc.token}/x/${e.id}?dl=1${ownCopy ? "&copy=1" : ""}`;

  return (
    <DocumentView
      doc={doc}
      exhibits={exhibits}
      href={href}
      saveHref={saveHref}
    />
  );
}

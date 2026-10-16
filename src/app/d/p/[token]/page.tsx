import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getDocumentByPreviewToken } from "@/lib/billing/documents";
import { listExhibits, type Exhibit } from "@/lib/billing/exhibits";
import { DocumentView, KIND_LABEL } from "../../DocumentView";

// A draft's preview: /d/p/<preview token>. Exactly the page the client will
// get (the same DocumentView as /d/<token>), under a thin "PREVIEW, not sent"
// band, so it can be checked on a phone from the preview email without
// signing in.
//
// Opening it writes nothing: no "viewed" line in the proof record and no
// notice to Marco, whoever opens it. It works only while the document is a
// draft. Once the document is issued (which is the moment it is sent) this
// link closes and says so; the client's own link is the only way in.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview · Saddlewood Contracting",
  robots: { index: false, follow: false },
};

function Closed({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{children}</p>
      </div>
    </main>
  );
}

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await getDocumentByPreviewToken(token);

  if (!doc) {
    return (
      <Closed title="This preview link does not open a document">
        Check that the whole link was copied.
      </Closed>
    );
  }

  if (doc.status !== "draft") {
    const what = KIND_LABEL[doc.kind].toLowerCase();
    return (
      <Closed title={`This ${what} was sent`}>
        {KIND_LABEL[doc.kind]} No. {doc.number} has been sent, so its preview is
        closed. Ask for the current link: accounting@saddlewoodcontracting.com
      </Closed>
    );
  }

  let exhibits: Exhibit[] = [];
  try {
    exhibits = await listExhibits(doc.id);
  } catch (err) {
    console.error("exhibits not loaded:", err);
  }
  const href = (e: Exhibit) => `/d/p/${doc.previewToken}/x/${e.id}`;
  const saveHref = (e: Exhibit) => `/d/p/${doc.previewToken}/x/${e.id}?dl=1`;

  const band = (
    <div
      role="status"
      className="-mx-4 -mt-8 mb-6 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900 sm:-mt-12"
    >
      <span className="font-semibold tracking-wide">PREVIEW, not sent.</span>{" "}
      This is how the client will see it. Opening this link is not counted and
      tells no one.
    </div>
  );

  return (
    <DocumentView
      doc={doc}
      exhibits={exhibits}
      href={href}
      saveHref={saveHref}
      band={band}
      // Issued today, if it were sent now.
      dateIfUnset={new Date().toISOString()}
    />
  );
}

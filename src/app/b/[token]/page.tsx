import type { Metadata } from "next";
import { headers } from "next/headers";

import { BidForm } from "@/components/subs/BidForm";
import { inviteByToken, noteViewed } from "@/lib/subs/store";
import { publicPackage } from "@/lib/subs/types";

// A sub's own bid package: /b/<token>. No account; the link is the key and
// is theirs alone. They read the scope and the plans, and send a signed bid
// (or pass). Opening it is written to the proof record, except our own copy
// (?copy=1, the "Open as the sub" link on the package screen).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bid package · Saddlewood Contracting",
  robots: { index: false, follow: false },
};

export default async function BidPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ copy?: string | string[] }> }) {
  const { token } = await params;
  const ownCopy = (await searchParams).copy === "1";
  const view = await inviteByToken(token);
  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-cream)] px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-[var(--color-charcoal)]">This link does not open a bid package</h1>
          <p className="mt-2 text-sm text-[var(--color-charcoal-light)]">Check that the whole link was copied, or ask us to send it again: info@saddlewoodcontracting.com</p>
        </div>
      </main>
    );
  }
  const now = new Date();
  if (!ownCopy) {
    const h = await headers();
    await noteViewed(view, { ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim(), ua: h.get("user-agent") ?? "" }).catch((e) => console.error("[b] viewed:", (e as Error).message));
  }
  const pkg = publicPackage(view.pkg, view.job, view.addenda, now);
  const latest = view.latest
    ? {
        revision: view.latest.revision,
        submittedAt: view.latest.submittedAt,
        totalCents: view.latest.totalCents,
        lines: view.latest.lines,
        inclusions: view.latest.inclusions,
        exclusions: view.latest.exclusions,
        startOn: view.latest.startOn,
        duration: view.latest.duration,
        validDays: view.latest.validDays,
        deviations: view.latest.deviations,
        note: view.latest.note,
        signerName: view.latest.signerName,
        signerTitle: view.latest.signerTitle,
        files: view.latest.files.map((f) => ({ name: f.name })),
        // Addenda issued after this bid: it was priced without them.
        missesAddenda: view.addenda.filter((a) => a.createdAt > view.latest!.submittedAt).map((a) => a.n),
      }
    : null;
  return (
    <BidForm
      token={token}
      ownCopy={ownCopy}
      sub={{ name: view.sub.name, contact: view.invite.contactName }}
      pkg={pkg}
      status={view.invite.status}
      declineNote={view.invite.declineNote}
      latest={latest}
    />
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { localDay } from "@/lib/crew/time";
import { usd } from "@/lib/money";
import { KIND_LABEL, type PortalSection } from "@/lib/portal/rules";
import { portalByToken, portalDocuments, portalLog, type ClientDoc, type ClientLog } from "@/lib/portal/store";
import { ComplaintForm } from "./ComplaintForm";

// The client's page for their job: /c/<token>. No sign-in, like every document
// we send: the link is the key, an owner can turn it off, and it shows only the
// sections they turned on. A section that fails to load says so and leaves the
// rest of the page up.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saddlewood Contracting",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const dayOf = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Off() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link is not active</h1>
        <p className="mt-2 text-sm text-slate-600">Check that the whole link was copied, or ask us for a new one: info@saddlewoodcontracting.com</p>
      </div>
    </main>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-xl font-semibold text-slate-900">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Failed = () => <p className="text-sm text-slate-600">This couldn&apos;t be loaded right now. Please try again in a few minutes.</p>;

function Documents({ docs }: { docs: ClientDoc[] }) {
  if (!docs.length) return <p className="text-sm text-slate-600">Nothing issued on this job yet.</p>;
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200" data-testid="portal-documents">
      {docs.map((d) => (
        <li key={d.id}>
          <Link href={`/d/${d.token}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">
                {KIND_LABEL[d.kind]} {d.number}
              </span>
              <span className="block truncate text-xs text-slate-600">
                {[d.title, dayOf(localDay(d.issuedAt))].filter(Boolean).join(" · ")}
              </span>
              {d.needsApproval ? <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Needs your approval</span> : null}
            </span>
            <span className="shrink-0 text-sm font-medium text-slate-900">{usd(d.totalCents)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Log({ entries }: { entries: ClientLog[] }) {
  if (!entries.length) return <p className="text-sm text-slate-600">No daily logs yet.</p>;
  return (
    <ul className="space-y-4" data-testid="portal-log">
      {entries.map((e) => (
        <li key={e.id}>
          <p className="text-xs font-medium text-slate-500">{[dayOf(e.day), e.weather].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{e.text}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const live = await portalByToken(token).catch((err) => {
    console.error("portal:", err);
    return null;
  });
  if (!live) return <Off />;
  const { portal, ref } = live;
  const on = (s: PortalSection) => portal.sections.includes(s);
  const quiet = <T,>(p: Promise<T>) =>
    p.catch((err) => {
      console.error("portal section:", err);
      return null;
    });
  const [docs, log] = await Promise.all([on("documents") ? quiet(portalDocuments(portal.jobId)) : null, on("log") ? quiet(portalLog(ref)) : null]);

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Saddlewood Contracting</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{ref.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{[ref.address, ref.pm.length ? `Project manager: ${ref.pm.join(", ")}` : null].filter(Boolean).join(" · ")}</p>

        {!portal.sections.length ? <p className="mt-8 text-sm text-slate-600">Nothing has been shared here yet.</p> : null}
        {on("documents") ? <Section title="Documents" id="documents">{docs ? <Documents docs={docs} /> : <Failed />}</Section> : null}
        {on("log") ? <Section title="Daily log" id="log">{log ? <Log entries={log} /> : <Failed />}</Section> : null}
        {on("complaint") ? (
          <Section title="Something wrong?" id="complaint">
            <ComplaintForm token={token} />
          </Section>
        ) : null}

        <p className="mt-10 text-xs text-slate-500">Questions: info@saddlewoodcontracting.com</p>
      </div>
    </main>
  );
}

import { Fragment, type ReactNode } from "react";
import type { Exhibit } from "@/lib/billing/exhibits";
import type { BillingDocument, DocumentKind } from "@/lib/billing/types";
import { PrintButton } from "./[token]/PrintButton";
import { usd } from "@/lib/money";

// What a client sees of one document: the page behind /d/<token>, and the
// same page behind a draft's preview link, /d/p/<token>. One layout, so a
// preview is exactly what the client will get. The pages around it decide
// what is counted (the client's page writes "viewed"; a preview writes
// nothing) and where the documents shown with it open from.
//
// The client's page renders this without a band; its markup is pinned by
// src/app/d/[token]/__tests__/page.test.ts.

export const KIND_LABEL: Record<DocumentKind, string> = {
  estimate: "Estimate",
  change_order: "Change Order",
  invoice: "Invoice",
  statement: "Statement",
  notice: "Notice",
  agreement: "Agreement",
};


function day(iso: string | null | undefined): string {
  if (!iso) return "";
  // A plain date (2026-10-05) is a calendar day, not an instant: keep it out of time zones.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00Z`)
    : new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
}

export function DocumentView({
  doc,
  exhibits,
  href,
  saveHref,
  band,
  dateIfUnset,
}: {
  doc: BillingDocument;
  exhibits: Exhibit[];
  /** Where an exhibit opens. */
  href: (e: Exhibit) => string;
  /** Where it is saved from instead. */
  saveHref: (e: Exhibit) => string;
  /** Shown above everything else (the preview's "not sent" band). */
  band?: ReactNode;
  /** The date shown when the document has none of its own and is not issued yet (a preview: today). */
  dateIfUnset?: string;
}) {
  const s = doc.snapshot;
  const lines = s.lines ?? [];
  const files = exhibits.filter((e) => e.kind === "file");
  const forLine = (i: number) => exhibits.filter((e) => e.lineIndex === i);
  const general = exhibits.filter(
    (e) => e.lineIndex === null || e.lineIndex >= lines.length,
  );

  const linkClass =
    "font-medium text-teal underline decoration-gold/60 underline-offset-4 hover:decoration-gold";

  return (
    <main className="min-h-screen bg-off-white px-4 py-8 sm:py-12 print:bg-white print:py-0">
      {band}
      {/* What a client's accounting team needs to file it: a printout or PDF of
          this page, and the documents that go with it. Not printed. */}
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center gap-2 print:hidden">
        <PrintButton />
        {files.map((e) => (
          <a
            key={e.id}
            href={saveHref(e)}
            className="rounded-md border border-stone-mid bg-white px-3 py-1.5 text-sm font-medium text-teal hover:border-gold-muted"
          >
            Download {e.label.replace(/\s*\(PDF\)\s*$/i, "")}
          </a>
        ))}
      </div>

      <article className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-stone bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1 bg-gold print:hidden" />
        <div className="p-6 sm:p-10 print:p-0">
          {doc.status === "void" && (
            <p className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              This {KIND_LABEL[doc.kind].toLowerCase()} was voided and is no
              longer in effect.
            </p>
          )}

          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-stone pb-6">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/logo-roundel.png"
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 rounded-full"
              />
              <div>
                <p className="font-heading text-lg text-teal">
                  Saddlewood Contracting
                </p>
                <p className="text-xs text-charcoal-light">
                  ROC 305762 · accounting@saddlewoodcontracting.com
                </p>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="font-heading text-2xl text-teal">
                {KIND_LABEL[doc.kind]}
              </p>
              {/* The number only: a revision is our own record-keeping, not the client's concern. */}
              <p className="text-sm text-charcoal">No. {doc.number}</p>
              <p className="text-sm text-charcoal-light">
                {day(s.date ?? doc.issuedAt ?? dateIfUnset)}
              </p>
            </div>
          </header>

          <section className="grid gap-6 py-6 sm:grid-cols-2">
            {s.billTo && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-accessible">
                  To
                </p>
                <p className="mt-1 text-sm font-medium text-charcoal">
                  {s.billTo.name}
                </p>
                {s.billTo.attention && (
                  <p className="text-sm text-charcoal-light">
                    Attn: {s.billTo.attention}
                  </p>
                )}
                {s.billTo.address && (
                  <p className="text-sm text-charcoal-light whitespace-pre-line">
                    {s.billTo.address}
                  </p>
                )}
              </div>
            )}
            {s.job && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-accessible">
                  Job
                </p>
                <p className="mt-1 text-sm font-medium text-charcoal">
                  {s.job.name}
                </p>
                {s.job.address && (
                  <p className="text-sm text-charcoal-light whitespace-pre-line">
                    {s.job.address}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Not an <h1>: the site-wide heading size would make it a headline on a phone. */}
          {doc.title && (
            <p className="pb-4 font-heading text-lg leading-snug text-teal">
              {doc.title}
            </p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-mid text-left text-[11px] uppercase tracking-[0.14em] text-charcoal-light">
                <th className="py-2 pr-4 font-semibold">Description</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <Fragment key={i}>
                  <tr
                    className={`${line.parts?.length ? "" : "border-b border-stone/70 "}align-top`}
                  >
                    <td className="py-4 pr-4 text-charcoal">
                      <span className="font-medium whitespace-pre-line">
                        {line.description}
                      </span>
                      {line.quantity !== undefined && (
                        <span className="block text-xs text-charcoal-light">
                          {line.quantity} {line.unit ?? ""}
                        </span>
                      )}
                      {line.note && (
                        <span className="mt-1 block text-xs leading-relaxed text-charcoal-light whitespace-pre-line">
                          {line.note}
                        </span>
                      )}
                      {forLine(i).length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs print:hidden">
                          {forLine(i).map((e) => (
                            <a
                              key={e.id}
                              href={href(e)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={linkClass}
                            >
                              {e.label}
                            </a>
                          ))}
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-4 text-right font-medium tabular-nums ${line.amountCents < 0 ? "text-gold-accessible" : "text-charcoal"}`}
                    >
                      {line.noCharge && line.amountCents === 0 ? (
                        <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-gold-accessible">No charge</span>
                      ) : (
                        usd(line.amountCents)
                      )}
                    </td>
                  </tr>
                  {/* The pieces of a lump line, each with its price, across the full width. */}
                  {line.parts && line.parts.length > 0 && (
                    <tr className="border-b border-stone/70">
                      <td colSpan={2} className="pb-4">
                        <ul className="space-y-1.5 border-l-2 border-stone pl-3 sm:mr-28">
                          {line.parts.map((p, j) => (
                            <li
                              key={j}
                              className="flex items-baseline justify-between gap-4 text-xs"
                            >
                              <span className="text-charcoal-light">
                                {p.description}
                              </span>
                              {p.amountCents === 0 ? (
                                <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-gold-accessible">
                                  {p.label ?? "No charge"}
                                </span>
                              ) : (
                                <span className="shrink-0 tabular-nums text-charcoal">
                                  {usd(p.amountCents)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-5 pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-charcoal-light">
                  Total
                </td>
                <td className="pt-5 text-right font-heading text-2xl tabular-nums text-teal">
                  {usd(doc.totalCents)}
                </td>
              </tr>
              {doc.dueDate && (
                <tr>
                  <td className="pt-1 pr-4 text-right text-charcoal-light">
                    Due
                  </td>
                  <td className="pt-1 text-right text-charcoal">
                    {day(doc.dueDate)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>

          {s.notIncluded && s.notIncluded.length > 0 && (
            <section className="mt-8 rounded-md border border-gold-muted/50 border-l-4 border-l-gold bg-cream/40 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-accessible">
                Not included in this total
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {s.notIncluded.map((x, k) => (
                  <li key={k} className="text-sm text-charcoal">
                    <span className="font-medium">{x.description}</span>
                    {x.note && (
                      <span className="block text-xs text-charcoal-light">
                        {x.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {general.length > 0 && (
            <section className="mt-10 border-t border-stone pt-5 print:hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-accessible">
                {doc.kind === "statement" ? "Previously sent" : "Documents"}
              </p>
              <ul className="mt-2 divide-y divide-stone/70 text-sm">
                {general.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <a
                      href={href(e)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      {e.label}
                    </a>
                    {e.kind === "file" && (
                      <a
                        href={saveHref(e)}
                        className="shrink-0 text-xs text-charcoal-light underline underline-offset-4 hover:text-teal"
                      >
                        Download
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(s.note || s.terms) && (
            <section className="mt-8 space-y-2 border-t border-stone pt-5 text-sm text-charcoal-light">
              {s.note && (
                <p className="whitespace-pre-line text-charcoal">{s.note}</p>
              )}
              {s.terms && <p className="whitespace-pre-line">{s.terms}</p>}
            </section>
          )}
        </div>
      </article>
      <p className="mx-auto mt-6 max-w-3xl text-center text-[11px] tracking-wide text-charcoal-light print:hidden">
        Saddlewood Contracting LLC · 480-999-6100
      </p>
    </main>
  );
}

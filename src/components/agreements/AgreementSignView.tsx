"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";

import { OpsMarkdown } from "@/components/ops/OpsMarkdown";
import { SignaturePad, type PadValue } from "@/components/sales/SignaturePad";
import { usd } from "@/lib/money";
import type { SignatureFont } from "@/lib/sales/settings";

// The job's agreement as the client sees it on their link, /d/<token> (T130):
// the words exactly as issued, and a place to sign them once. After signing
// the page is read-only and shows the signature; a void agreement takes none.

export type AgreementSigned = { name: string; method: "draw" | "type"; image: string; at: string; snapshotSha256: string };

function longDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

export function AgreementSignView({
  token,
  number,
  title,
  project,
  preparedFor,
  date,
  totalCents,
  text,
  consent,
  fonts,
  isVoid,
  signed,
}: {
  token: string;
  number: string;
  title: string;
  project: { name: string; address?: string };
  preparedFor: string;
  date: string | null;
  totalCents: number;
  text: string;
  consent: string;
  fonts: SignatureFont[];
  isVoid: boolean;
  signed: AgreementSigned | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pad, setPad] = useState<PadValue>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Shown from this screen once signed, not by loading the page again: a
  // reload would count as another viewing in the proof record.
  const [mine, setMine] = useState<AgreementSigned | null>(null);
  const sig = signed ?? mine;

  async function sign() {
    if (!pad) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/d/${token}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email: email.trim() || undefined, method: pad.method, typed: pad.typed, font: pad.font, image: pad.image, agree: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "We could not record that. Please call us.");
      setMine({ name: j.signed?.name ?? name.trim(), method: pad.method, image: pad.image, at: j.signed?.at ?? new Date().toISOString(), snapshotSha256: "" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream/40 px-3 py-6 sm:px-6 sm:py-10 print:bg-white print:p-0">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-stone bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="relative bg-teal px-6 pb-7 pt-7 text-off-white sm:px-10 print:bg-white print:px-0 print:text-teal">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold" aria-hidden="true" />
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-roundel.png" alt="" width={44} height={44} className="h-11 w-11 rounded-full ring-1 ring-gold/40" />
            <div>
              <p className="font-heading text-lg leading-tight">Saddlewood Contracting</p>
              <p className="text-[11px] opacity-70">ROC 305762 · Scottsdale, Arizona</p>
            </div>
          </div>
          <h1 className="mt-6 font-heading text-2xl leading-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm opacity-80">
            Agreement {number}
            {date ? ` · ${longDay(date)}` : ""}
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wider opacity-60">Prepared for</dt>
              <dd>{preparedFor || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider opacity-60">Project</dt>
              <dd>
                {project.name}
                {project.address ? <span className="block opacity-80">{project.address}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider opacity-60">Contract price</dt>
              <dd className="font-heading text-xl tabular-nums" data-testid="agreement-price">
                {usd(totalCents)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="px-6 py-8 sm:px-10">
          {isVoid ? (
            <p className="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="agreement-void">
              This agreement was withdrawn and can no longer be signed. Ask us for the current one.
            </p>
          ) : null}

          <div className="text-sm leading-relaxed text-charcoal" data-testid="agreement-text">
            <OpsMarkdown>{text}</OpsMarkdown>
          </div>

          {!sig && !isVoid ? (
            <section id="sign" className="mt-10 rounded-2xl border-2 border-teal px-5 py-6 print:hidden" data-testid="agreement-sign">
              <h2 className="text-xl text-teal">Sign the agreement</h2>
              <p className="mt-1 text-sm text-charcoal-light">Read it through first. Once signed it cannot be changed, and you can print or save this page for your records.</p>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-charcoal">Your full name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="w-full rounded-xl border border-stone-mid bg-white px-3 py-2.5 text-base text-charcoal focus:border-teal focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-charcoal">Your email, for your records (optional)</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    className="w-full rounded-xl border border-stone-mid bg-white px-3 py-2.5 text-base text-charcoal focus:border-teal focus:outline-none"
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-charcoal">Your signature</span>
                  <SignaturePad name={name} fonts={fonts} onChange={setPad} />
                </div>
                <label className="flex items-start gap-2.5 text-sm text-charcoal">
                  <input type="checkbox" className="mt-1 size-4 accent-[var(--teal)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>{consent}</span>
                </label>
                {err ? <p className="text-sm text-red-700">{err}</p> : null}
                <button
                  type="button"
                  disabled={busy || !agree || name.trim().length < 3 || !pad}
                  onClick={sign}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-base font-medium text-off-white transition-colors hover:bg-teal-dark disabled:opacity-40"
                >
                  <PenLine className="size-4" aria-hidden="true" />
                  {busy ? "Recording…" : "Sign the agreement"}
                </button>
              </div>
            </section>
          ) : null}

          {sig ? (
            <section className="mt-10 break-inside-avoid" data-testid="agreement-signed">
              <h2 className="text-xl text-teal">Signed</h2>
              <div className="mt-3 flex h-20 max-w-sm items-end border-b border-charcoal/40 pb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sig.image} alt={`Signature of ${sig.name}`} className="max-h-[72px] max-w-full object-contain" />
              </div>
              <p className="mt-1.5 text-sm font-medium text-charcoal">{sig.name}</p>
              <p className="text-xs text-charcoal-light">Client · Signed {longDay(sig.at)}</p>
              {sig.snapshotSha256 ? (
                <p className="mt-4 break-all text-[10px] text-charcoal-light">Signed electronically. Agreement fingerprint (SHA-256) {sig.snapshotSha256}.</p>
              ) : (
                <p className="mt-4 text-xs text-charcoal-light">Thank you. We have your signature and will be in touch about the schedule.</p>
              )}
            </section>
          ) : null}

          <p className="mt-10 text-center text-xs text-charcoal-light">Saddlewood Contracting · ROC 305762 · info@saddlewoodcontracting.com</p>
        </div>
      </article>
    </main>
  );
}

"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";

import { SignaturePad, type PadValue } from "@/components/sales/SignaturePad";
import { usd } from "@/lib/money";
import type { SignatureFont } from "@/lib/sales/settings";

// Under a change order on the client's link (T256): approve it once with a
// name, a signature and the consent box. After that, or when it can no
// longer be approved, the panel says so instead.

export type CoApproved = { name: string; image: string; at: string; snapshotSha256: string };

function longDay(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

export function CoApprovePanel({
  token,
  number,
  totalCents,
  consent,
  fonts,
  blocked,
  approved,
}: {
  token: string;
  number: string;
  totalCents: number;
  consent: string;
  fonts: SignatureFont[];
  /** Why it cannot be approved here (void, replaced, not open); null when it can. */
  blocked: string | null;
  approved: CoApproved | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pad, setPad] = useState<PadValue>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Shown from this screen once approved, not by loading the page again: a
  // reload would count as another viewing in the proof record.
  const [mine, setMine] = useState<CoApproved | null>(null);
  const sig = approved ?? mine;

  async function approve() {
    if (!pad) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/d/${token}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email: email.trim() || undefined, method: pad.method, typed: pad.typed, font: pad.font, image: pad.image, agree: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "We could not record that. Please call us.");
      setMine({ name: j.signed?.name ?? name.trim(), image: pad.image, at: j.signed?.at ?? new Date().toISOString(), snapshotSha256: "" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const box = "mx-auto mt-6 max-w-3xl rounded-2xl bg-white px-5 py-6 sm:px-8";

  if (sig) {
    return (
      <section className={`${box} break-inside-avoid border border-stone`} aria-label="Approval" data-testid="co-approved">
        <h2 className="text-xl text-teal">Approved</h2>
        <div className="mt-3 flex h-20 max-w-sm items-end border-b border-charcoal/40 pb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sig.image} alt={`Signature of ${sig.name}`} className="max-h-[72px] max-w-full object-contain" />
        </div>
        <p className="mt-1.5 text-sm font-medium text-charcoal">{sig.name}</p>
        <p className="text-xs text-charcoal-light">Client · Signed {longDay(sig.at)}</p>
        {sig.snapshotSha256 ? (
          <p className="mt-4 break-all text-[10px] text-charcoal-light">Signed electronically. Change order fingerprint (SHA-256) {sig.snapshotSha256}.</p>
        ) : (
          <p className="mt-4 text-xs text-charcoal-light">Thank you. We have your approval of change order {number} and will schedule the work.</p>
        )}
      </section>
    );
  }

  if (blocked) {
    return (
      <p className="mx-auto mt-6 max-w-3xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden" data-testid="co-approve-blocked">
        {blocked}
      </p>
    );
  }

  return (
    <section className={`${box} border-2 border-teal print:hidden`} aria-label="Approve this change order" data-testid="co-approve">
      <h2 className="text-xl text-teal">Approve change order {number}</h2>
      <p className="mt-1 text-sm text-charcoal-light">
        {usd(totalCents)} added to the contract. Read it through first; once approved it cannot be changed, and you can print or save this page for your records.
      </p>
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
          onClick={approve}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-base font-medium text-off-white transition-colors hover:bg-teal-dark disabled:opacity-40"
        >
          <PenLine className="size-4" aria-hidden="true" />
          {busy ? "Recording…" : "Approve and sign"}
        </button>
      </div>
    </section>
  );
}

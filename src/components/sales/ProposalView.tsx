"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, CircleCheck, FileDown, PenLine, Printer, Sparkles } from "lucide-react";

import { scheduleAmounts, type ProposalSnapshot } from "@/lib/sales/presentation";
import type { SignatureFont } from "@/lib/sales/settings";
import type { PublicSignature } from "@/lib/sales/signing";
import { SignaturePad, type PadValue } from "./SignaturePad";
import { usd } from "@/lib/money";

// The proposal as the client sees it: on their link (/d/<token>), and inside
// the builder as its live preview, so what the office previews is what goes
// out. The client picks a package and any add-ons, watches the total and the
// payment schedule follow, and accepts with their name. The total they see is
// worked out from the frozen proposal, and the server works it out again on
// accept (src/lib/sales/presentation.ts, acceptedTotal).


function longDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" });
}

function qty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export type ProposalMeta = {
  number: string;
  date: string | null;
  preparedFor: { name: string; attention?: string };
  project: { name: string; address?: string };
  /** Set once the client has accepted (with what they chose, to show that package). */
  accepted?: { at: string; name: string; packageName: string; totalCents: number; packageId?: string; optionIds?: string[] } | null;
  /** Signatures on it so far, oldest first. */
  signatures?: PublicSignature[];
  void?: boolean;
};

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-accessible">{children}</p>;
}

function Block({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-stone pt-6 mt-8 break-inside-avoid ${className}`}>
      <h3 className="mb-3 text-xl text-teal">{title}</h3>
      {children}
    </section>
  );
}

export function ProposalView({
  proposal: p,
  meta,
  mode,
  token,
  band,
  compact = false,
}: {
  proposal: ProposalSnapshot;
  meta: ProposalMeta;
  /** "client": the live link, accept enabled. "preview": the office's view, nothing is sent. */
  mode: "client" | "preview";
  token?: string;
  band?: ReactNode;
  /** Inside the builder's preview pane: no page padding. */
  compact?: boolean;
}) {
  const lead = p.packages.find((x) => x.recommended) ?? p.packages[0];
  const [pkgId, setPkgId] = useState(meta.accepted?.packageId ?? lead?.id ?? "");
  const [opts, setOpts] = useState<string[]>(meta.accepted?.optionIds ?? []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState("");
  const [pad, setPad] = useState<PadValue>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ totalCents: number; packageName: string; executed: boolean } | null>(null);
  const signMode = p.sign?.mode ?? "none";
  const signs = signMode !== "none";
  const [mine, setMine] = useState<PublicSignature | null>(null);
  const sigs = mine && !(meta.signatures ?? []).some((x) => x.role === "client") ? [...(meta.signatures ?? []), mine] : (meta.signatures ?? []);
  const clientSig = sigs.find((x) => x.role === "client");
  const companySig = sigs.find((x) => x.role === "company");
  const executed = signMode === "client" ? !!clientSig : signMode === "both" ? !!clientSig && !!companySig : false;

  const pkg = p.packages.find((x) => x.id === pkgId) ?? lead;
  const available = p.options.filter((o) => o.packages.length === 0 || o.packages.includes(pkg?.id ?? ""));
  const chosen = available.filter((o) => opts.includes(o.id));
  const total = (pkg?.totalCents ?? 0) + chosen.reduce((a, o) => a + o.priceCents, 0);
  const steps = useMemo(() => scheduleAmounts(p.schedule, total), [p.schedule, total]);
  const accepted = done ? { ...done, name, at: new Date().toISOString() } : meta.accepted ?? null;
  const many = p.choosePackage;

  const sections = p.sections.filter((s) => s.pkgs.includes(pkg?.id ?? ""));
  const allowances = sections.flatMap((s) => s.lines.filter((l) => l.allowance && l.pkgs.includes(pkg?.id ?? "")));

  async function accept() {
    if (mode !== "client" || !token || !pkg) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/d/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          packageId: pkg.id,
          optionIds: chosen.map((o) => o.id),
          note: note || undefined,
          agree: true,
          ...(signs && pad ? { signature: { name, email: email.trim() || undefined, method: pad.method, typed: pad.typed, font: pad.font, image: pad.image, agree: true } } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "We could not record that. Please call us.");
      setDone({ totalCents: j.totalCents, packageName: j.packageName, executed: !!j.executed });
      // Shown from this screen, not by loading the page again: a reload would
      // count as another viewing in the proof record.
      if (signs && pad) setMine({ role: "client", name: name.trim(), title: "", method: pad.method, image: pad.image, at: new Date().toISOString(), snapshotSha256: "" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setOpts((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const canChoose = !accepted && !meta.void;

  return (
    <div className={compact ? "" : "min-h-screen bg-off-white px-4 pb-28 pt-8 sm:py-12 print:bg-white print:py-0"}>
      {band}
      {!compact ? (
        <div className="mx-auto mb-4 flex max-w-3xl items-center justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-mid bg-white px-3 py-1.5 text-sm font-medium text-teal hover:border-gold-muted"
          >
            <Printer className="size-4" aria-hidden="true" /> Print
          </button>
          {mode === "client" && token ? (
            <a
              href={`/d/${token}/pdf?dl=1`}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-mid bg-white px-3 py-1.5 text-sm font-medium text-teal hover:border-gold-muted"
            >
              <FileDown className="size-4" aria-hidden="true" /> Download PDF
            </a>
          ) : null}
        </div>
      ) : null}

      <article
        className={`mx-auto max-w-3xl overflow-hidden bg-white ${compact ? "" : "rounded-xl border border-stone shadow-sm print:rounded-none print:border-0 print:shadow-none"}`}
      >
        {/* The cover band: who it is from, what it is, for whom. */}
        <div className="relative bg-teal px-6 pb-8 pt-7 text-off-white sm:px-10 print:bg-white print:text-teal print:px-0">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-roundel.png" alt="" width={44} height={44} className="h-11 w-11 rounded-full ring-1 ring-gold/40" />
              <div>
                <p className="font-heading text-lg leading-tight">Saddlewood Contracting</p>
                <p className="text-[11px] opacity-70">ROC 305762 · Scottsdale, Arizona</p>
              </div>
            </div>
            <div className="text-right text-xs opacity-80">
              <p>No. {meta.number}</p>
              {meta.date ? <p>{longDay(meta.date)}</p> : null}
            </div>
          </div>
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-champagne print:text-gold-accessible">Proposal</p>
          <h1 className="mt-1 font-heading text-3xl leading-tight sm:text-4xl">{p.title || meta.project.name}</h1>
          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">Prepared for</p>
              <p className="font-medium">{meta.preparedFor.name}</p>
              {meta.preparedFor.attention ? <p className="opacity-80">Attn: {meta.preparedFor.attention}</p> : null}
            </div>
            {meta.project.address ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">Project</p>
                <p className="font-medium">{meta.project.address}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-6 pb-10 pt-6 sm:px-10 print:px-0">
          {meta.void ? (
            <p className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              This proposal was withdrawn and is no longer in effect.
            </p>
          ) : null}
          {accepted ? (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#2f6b4a]/30 bg-[#2f6b4a]/10 px-4 py-3 text-sm text-[#2f6b4a]">
              <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>
                <span className="font-semibold">{executed || done?.executed ? "Signed by everyone" : signs && (clientSig || done) ? "Signed" : "Accepted"}</span> by {accepted.name} on {longDay(accepted.at)}: {accepted.packageName}, {usd(accepted.totalCents)}.
                {signMode === "both" && !companySig && !done?.executed ? " Saddlewood countersigns next; you will get the signed copy." : ""}
                {done ? " Thank you. We will be in touch to schedule." : ""}
              </p>
            </div>
          ) : null}

          {p.intro ? <p className="whitespace-pre-line text-[15px] leading-relaxed text-charcoal">{p.intro}</p> : null}

          {/* Packages: the choice, side by side. */}
          {many ? (
            <section className="mt-8">
              <Eyebrow>Choose your package</Eyebrow>
              <div className={`mt-3 grid gap-3 ${p.packages.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`} role="radiogroup" aria-label="Packages">
                {p.packages.map((x) => {
                  const on = x.id === pkg?.id;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!canChoose}
                      onClick={() => setPkgId(x.id)}
                      className={`relative flex flex-col rounded-xl border p-4 text-left transition-all disabled:cursor-default ${
                        on ? "border-teal bg-teal text-off-white shadow-lg print:bg-white print:text-teal" : "border-stone-mid bg-white text-charcoal hover:border-gold-muted"
                      }`}
                    >
                      {x.recommended ? (
                        <span className={`absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${on ? "bg-gold text-teal" : "bg-gold/20 text-gold-accessible"}`}>
                          <Sparkles className="size-3" aria-hidden="true" /> Recommended
                        </span>
                      ) : null}
                      <span className="font-heading text-lg">{x.name}</span>
                      {x.tagline ? <span className={`text-xs ${on ? "opacity-80" : "text-charcoal-light"}`}>{x.tagline}</span> : null}
                      <span className="mt-3 font-heading text-2xl tabular-nums">{usd(x.totalCents, { whole: true })}</span>
                      {x.highlights.length ? (
                        <ul className="mt-3 space-y-1 text-xs">
                          {x.highlights.map((h) => (
                            <li key={h} className="flex gap-1.5">
                              <Check className={`mt-0.5 size-3.5 shrink-0 ${on ? "text-gold" : "text-gold-accessible"}`} aria-hidden="true" />
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Scope. */}
          <Block title={p.layout === "total" ? "Scope of work" : "Scope and price"}>
            <div className="divide-y divide-stone">
              {sections.map((s) => (
                <div key={s.name} className="py-4 first:pt-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-medium text-charcoal">{s.name}</p>
                    {p.layout !== "total" && s.amounts?.[pkg?.id ?? ""] !== undefined ? (
                      <p className="shrink-0 font-medium tabular-nums text-charcoal">{usd(s.amounts[pkg!.id])}</p>
                    ) : null}
                  </div>
                  {s.note ? <p className="mt-1 text-sm text-charcoal-light">{s.note}</p> : null}
                  <ul className="mt-2 space-y-1.5">
                    {s.lines
                      .filter((l) => l.pkgs.includes(pkg?.id ?? ""))
                      .map((l, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-4 text-sm">
                          <span className="min-w-0 text-charcoal">
                            <span className="text-gold-accessible">—</span> {l.description}
                            {l.allowance ? <span className="ml-1.5 rounded bg-cream px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-accessible">Allowance</span> : null}
                            {l.qty !== undefined ? (
                              <span className="ml-1.5 text-charcoal-light">
                                {qty(l.qty)} {l.unit}
                                {l.unitCents !== undefined ? ` × ${usd(l.unitCents)}` : ""}
                              </span>
                            ) : null}
                            {l.note ? <span className="block pl-4 text-xs text-charcoal-light">{l.note}</span> : null}
                          </span>
                          {l.amounts?.[pkg?.id ?? ""] !== undefined ? (
                            <span className="shrink-0 tabular-nums text-charcoal-light">{usd(l.amounts[pkg!.id])}</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
            {(p.adjustments ?? [])
              .filter((a) => a.amounts[pkg?.id ?? ""] !== undefined)
              .map((a) => (
                <div key={a.key} className="flex items-baseline justify-between gap-4 border-t border-stone py-3">
                  <p className="font-medium text-charcoal">{a.label}</p>
                  <p className="shrink-0 font-medium tabular-nums text-charcoal">{usd(a.amounts[pkg!.id])}</p>
                </div>
              ))}
            {p.layout === "total" && allowances.length && p.show.showAllowanceAmounts !== false ? (
              <p className="mt-3 text-xs text-charcoal-light">The price includes the allowances marked above, each at the value shown.</p>
            ) : null}
          </Block>

          {/* Add-ons. */}
          {available.length ? (
            <Block title="Add-ons">
              <p className="-mt-1 mb-3 text-sm text-charcoal-light">Optional. Tick any you would like included; the total updates.</p>
              <div className="space-y-2">
                {available.map((o) => {
                  const on = opts.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${on ? "border-teal bg-cream/60" : "border-stone-mid bg-white"} ${!canChoose ? "cursor-default" : ""}`}
                    >
                      <input type="checkbox" className="mt-1 size-4 accent-[var(--teal)]" checked={on} disabled={!canChoose} onChange={() => toggle(o.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-charcoal">{o.description}</span>
                        {o.note ? <span className="block text-xs text-charcoal-light">{o.note}</span> : null}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-charcoal">+{usd(o.priceCents, { cents: "auto" })}</span>
                    </label>
                  );
                })}
              </div>
            </Block>
          ) : null}

          {/* The total. */}
          <div className="mt-8 rounded-2xl bg-cream px-5 py-5 break-inside-avoid">
            <div className="flex items-end justify-between gap-4">
              <div>
                <Eyebrow>{many ? `${pkg?.name} total` : "Total"}</Eyebrow>
                {chosen.length ? <p className="mt-1 text-xs text-charcoal-light">incl. {chosen.map((o) => o.description).join(", ")}</p> : null}
              </div>
              <p className="font-heading text-3xl tabular-nums text-teal sm:text-4xl">{usd(total)}</p>
            </div>
            {p.validUntil ? <p className="mt-2 text-xs text-charcoal-light">Valid until {longDay(p.validUntil)}.</p> : null}
          </div>

          {p.timeline ? (
            <Block title="Timeline">
              <p className="text-sm text-charcoal">{p.timeline}</p>
            </Block>
          ) : null}

          {steps.length ? (
            <Block title="Payment schedule">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-stone">
                  {steps.map((s) => (
                    <tr key={s.label}>
                      <td className="py-2 pr-3 text-charcoal">{s.label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-charcoal-light">{s.pct}%</td>
                      <td className="py-2 text-right font-medium tabular-nums text-charcoal">{usd(s.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          ) : null}

          {p.exclusions.length || p.clarifications.length ? (
            <Block title="What this price assumes">
              {p.clarifications.length ? (
                <>
                  <Eyebrow>Clarifications</Eyebrow>
                  <ul className="mb-4 mt-2 list-disc space-y-1 pl-5 text-sm text-charcoal">
                    {p.clarifications.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {p.exclusions.length ? (
                <>
                  <Eyebrow>Not included</Eyebrow>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-charcoal">
                    {p.exclusions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Block>
          ) : null}

          {p.basis ? <p className="mt-6 text-xs text-charcoal-light">{p.basis}.</p> : null}

          {p.terms ? (
            <Block title="Terms">
              <ul className="space-y-1.5 text-xs leading-relaxed text-charcoal-light">
                {p.terms.split("\n").filter(Boolean).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Block>
          ) : null}

          {/* Accept, and sign when the proposal asks for it. */}
          {p.allowAccept && !accepted && !meta.void ? (
            <section id="accept" className="mt-10 rounded-2xl border-2 border-teal px-5 py-6 print:hidden">
              <h3 className="text-xl text-teal">{signs ? "Accept and sign" : "Accept this proposal"}</h3>
              <p className="mt-1 text-sm text-charcoal-light">
                {many ? `${pkg?.name}` : "The work above"}
                {chosen.length ? ` with ${chosen.length} add-on${chosen.length === 1 ? "" : "s"}` : ""}, {usd(total)}.{" "}
                {signMode === "both" ? "Saddlewood countersigns and you receive the signed copy." : "We follow up with the schedule."}
              </p>
              {mode === "preview" ? (
                <p className="mt-4 rounded-lg bg-cream px-3 py-2 text-xs text-charcoal-light">
                  Preview: the client {signs ? "signs here (draw or type, in the styles you allow)" : "accepts here with their name"}.
                </p>
              ) : (
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
                  {signs ? (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-charcoal">Your email, for your signed copy (optional)</span>
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
                        <SignaturePad name={name} fonts={(p.sign?.fonts ?? []) as SignatureFont[]} onChange={setPad} />
                      </div>
                    </>
                  ) : null}
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-charcoal">Anything we should know (optional)</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-stone-mid bg-white px-3 py-2.5 text-base text-charcoal focus:border-teal focus:outline-none"
                    />
                  </label>
                  <label className="flex items-start gap-2.5 text-sm text-charcoal">
                    <input type="checkbox" className="mt-1 size-4 accent-[var(--teal)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>{signs ? p.sign.consent : "I accept this proposal, its terms and the price shown, and ask Saddlewood to prepare the agreement."}</span>
                  </label>
                  {err ? <p className="text-sm text-red-700">{err}</p> : null}
                  <button
                    type="button"
                    disabled={busy || !agree || name.trim().length < 3 || (signs && !pad)}
                    onClick={accept}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-5 text-base font-medium text-off-white transition-colors hover:bg-teal-dark disabled:opacity-40"
                  >
                    {signs ? <PenLine className="size-4" aria-hidden="true" /> : null}
                    {busy ? "Recording…" : `${signs ? "Accept and sign" : "Accept"} · ${usd(total)}`}
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {/* Signatures: who has signed, and whose signature is still to come. */}
          {signs && (accepted || sigs.length) ? (
            <Block title="Signatures">
              <div className="grid gap-6 sm:grid-cols-2">
                {(["client", ...(signMode === "both" ? ["company"] : [])] as ("client" | "company")[]).map((role) => {
                  const sig = role === "client" ? clientSig : companySig;
                  return (
                    <div key={role} className="break-inside-avoid">
                      <div className="flex h-20 items-end border-b border-charcoal/40 pb-1">
                        {sig?.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sig.image} alt={`Signature of ${sig.name}`} className="max-h-[72px] max-w-full object-contain" />
                        ) : (
                          <span className="pb-2 text-xs italic text-charcoal-light">Awaiting signature</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-charcoal">{sig?.name ?? (role === "client" ? meta.preparedFor.name : p.sign.companyTitle)}</p>
                      <p className="text-xs text-charcoal-light">
                        {role === "client" ? "Client" : sig?.title || p.sign.companyTitle}
                        {sig ? ` · Signed ${longDay(sig.at)}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
              {sigs[0]?.snapshotSha256 ? (
                <p className="mt-4 break-all text-[10px] text-charcoal-light">
                  Signed electronically. Proposal fingerprint (SHA-256) {sigs[0].snapshotSha256}. The full signature record is in the PDF.
                </p>
              ) : null}
            </Block>
          ) : null}

          <p className="mt-10 text-center text-xs text-charcoal-light">
            Saddlewood Contracting · ROC 305762 · info@saddlewoodcontracting.com
          </p>
        </div>
      </article>

      {/* On a phone the total and the accept button stay in reach. */}
      {mode === "client" && p.allowAccept && !accepted && !meta.void && !compact ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone bg-white/95 px-4 py-3 backdrop-blur sm:hidden print:hidden" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-charcoal-light">{many ? pkg?.name : "Total"}</p>
              <p className="font-heading text-xl tabular-nums text-teal">{usd(total)}</p>
            </div>
            <a href="#accept" className="inline-flex min-h-11 items-center rounded-xl bg-teal px-5 text-sm font-medium text-off-white">
              {signs ? "Review & sign" : "Review & accept"}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

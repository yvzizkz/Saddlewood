'use client';

import { useState, useEffect, use } from 'react';
import {
  ShieldCheck,
  MapPin,
  Phone,
  Mail,
  Printer,
  CheckCircle2,
  AlertCircle,
  Layers,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';
import type { ProposalItem } from '@/lib/proposals/types';

interface Props {
  params: Promise<{ token: string }>;
}

export default function ClientProposalPage({ params }: Props) {
  const { token } = use(params);
  const [proposal, setProposal] = useState<ProposalItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/proposals/${token}`);
        if (!res.ok) throw new Error('Proposal not found or expired link');
        const json = await res.json();
        // The Mac's older proposals file lacks some lists; show them empty.
        const p = json.proposal as ProposalItem;
        if (live) {
          setProposal({
            ...p,
            line_items: p.line_items ?? [],
            alternates: p.alternates ?? [],
            clarifications: p.clarifications ?? [],
            exclusions: p.exclusions ?? [],
          });
        }
      } catch (err) {
        if (live) setError((err as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center">
          <div className="size-8 border-2 border-[var(--color-teal)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--color-charcoal)]">
            Loading Proposal Presentation...
          </p>
        </div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] px-4">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-[var(--color-stone)] text-center shadow-sm">
          <AlertCircle className="size-10 text-rose-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[var(--color-charcoal)] mb-1">
            Proposal Not Accessible
          </h2>
          <p className="text-xs text-[var(--color-charcoal-light)]">
            {error || 'This proposal link could not be loaded.'}
          </p>
        </div>
      </div>
    );
  }

  const selectedAlternatesTotal = proposal.alternates
    .filter((a) => a.selected)
    .reduce((sum, a) => sum + a.amount, 0);

  const grandTotal = proposal.base_amount + selectedAlternatesTotal;
  const isAccepted = proposal.status === 'accepted';

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[var(--color-charcoal)] font-sans antialiased py-6 px-4 md:py-12 md:px-8 print:p-0 print:bg-white">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-[var(--color-stone)] shadow-sm overflow-hidden print:border-none print:shadow-none">
        {/* Top Brand Bar */}
        <div className="bg-[var(--color-teal)] text-white px-6 py-3 flex items-center justify-between text-xs print:bg-slate-900">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-wider uppercase text-[10px]">
              Saddlewood Contracting LLC
            </span>
            <span className="opacity-60">|</span>
            <span className="opacity-90">AZ ROC #305762</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity print:hidden cursor-pointer"
            >
              <Printer className="size-3.5" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Accepted Banner */}
        {isAccepted && (
          <div className="bg-emerald-600 text-white px-6 py-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              <span className="font-semibold">
                Accepted & Authorized by {proposal.accepted_by}
              </span>
            </div>
            <span className="text-[11px] opacity-90">
              {proposal.accepted_at ? new Date(proposal.accepted_at).toLocaleString() : ''}
            </span>
          </div>
        )}

        <div className="p-6 md:p-10 space-y-8">
          {/* Header & Meta */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-[var(--color-stone)]/80 pb-6">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--color-gold-accessible)] font-bold">
                {proposal.archetype === 'commercial_gc'
                  ? 'Commercial Subcontract Bid Proposal'
                  : proposal.archetype === 'scope_addendum'
                  ? 'Scope Adjustment & Bid Addendum'
                  : 'Custom Residential Construction Proposal'}
              </span>
              <h1
                style={{ fontFamily: 'var(--font-fraunces)' }}
                className="text-2xl md:text-3xl text-[var(--color-charcoal)] mt-1"
              >
                {proposal.project_name}
              </h1>
              <div className="flex items-center gap-2 text-xs text-[var(--color-charcoal-light)] mt-1.5">
                <MapPin className="size-3.5 text-slate-400" />
                <span>{proposal.project_address}</span>
              </div>
            </div>

            <div className="text-left md:text-right shrink-0">
              <div className="text-xs font-mono font-semibold text-[var(--color-charcoal-light)]">
                Proposal #: <span className="text-[var(--color-charcoal)]">{proposal.proposal_number}</span>
              </div>
              <div className="text-xs text-[var(--color-charcoal-light)] mt-1">
                Issued: {new Date(proposal.created_at).toLocaleDateString()}
              </div>
              <div className="text-xs text-[var(--color-charcoal-light)]">
                Valid Through: <span className="font-semibold text-amber-800">{proposal.valid_until}</span>
              </div>
            </div>
          </div>

          {/* Client & Contractor Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-[var(--color-cream)]/40 border border-[var(--color-stone)]/70 text-xs">
            <div>
              <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">
                Prepared For:
              </span>
              <div className="font-bold text-sm text-[var(--color-charcoal)] mt-0.5">
                {proposal.client_name}
              </div>
              {proposal.client_company && (
                <div className="text-[var(--color-charcoal)] font-medium">{proposal.client_company}</div>
              )}
              {proposal.client_email && (
                <div className="text-slate-600 mt-0.5">{proposal.client_email}</div>
              )}
              {proposal.client_phone && (
                <div className="text-slate-600">{proposal.client_phone}</div>
              )}
            </div>

            <div>
              <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-500">
                Drawing Revision Basis:
              </span>
              <div className="font-bold text-sm text-[var(--color-charcoal)] mt-0.5">
                {proposal.drawing_basis.set_name}
              </div>
              <div className="text-[var(--color-charcoal)] mt-0.5 font-mono">
                Current Set: <span className="font-bold text-[var(--color-teal)]">{proposal.drawing_basis.current_rev}</span>
              </div>
              {proposal.drawing_basis.base_rev && (
                <div className="text-slate-600 font-mono text-[11px]">
                  Original Takeoff: {proposal.drawing_basis.base_rev}
                </div>
              )}
              {proposal.drawing_basis.notes && (
                <div className="text-[11px] text-slate-500 italic mt-1">
                  &quot;{proposal.drawing_basis.notes}&quot;
                </div>
              )}
            </div>
          </div>

          {/* Base Scope Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[var(--color-charcoal)] flex items-center gap-2">
                <Layers className="size-4 text-[var(--color-teal)]" />
                <span>Base Scope of Work & Assemblies</span>
              </h2>
              <span className="text-xs font-mono font-semibold text-[var(--color-charcoal-light)]">
                Base Subtotal: ${proposal.base_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="border border-[var(--color-stone)] rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-slate-50 border-b border-[var(--color-stone)] px-4 py-2.5 text-[11px] font-semibold text-slate-600 grid grid-cols-12 gap-2">
                <span className="col-span-8 md:col-span-9">Item / Phase & Assembly Description</span>
                <span className="col-span-4 md:col-span-3 text-right">Amount</span>
              </div>

              <div className="divide-y divide-[var(--color-stone)]/60 bg-white">
                {proposal.line_items.map((li) => (
                  <div key={li.id} className="p-4 grid grid-cols-12 gap-2 text-xs">
                    <div className="col-span-8 md:col-span-9">
                      <div className="font-semibold text-[var(--color-charcoal)]">{li.phase}</div>
                      <div className="text-slate-600 mt-0.5">{li.description}</div>
                      {(li.qty || li.sheet_detail || li.notes) && (
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-mono">
                          {li.qty && li.unit && (
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                              {li.qty.toLocaleString()} {li.unit}
                            </span>
                          )}
                          {li.sheet_detail && (
                            <span className="text-slate-600">Ref: {li.sheet_detail}</span>
                          )}
                          {li.notes && <span className="italic text-slate-500">{li.notes}</span>}
                        </div>
                      )}
                    </div>
                    <div className="col-span-4 md:col-span-3 text-right font-mono font-bold text-sm text-[var(--color-charcoal)] self-start">
                      ${li.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Alternates Section */}
          {proposal.alternates.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-bold text-[var(--color-charcoal)] flex items-center gap-2">
                    <TrendingUp className="size-4 text-amber-700" />
                    <span>Project Alternates & Scope Options</span>
                  </h2>
                  <p className="text-xs text-[var(--color-charcoal-light)]">
                    Options priced alongside the base bid. Tell us which ones you want when you accept.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {proposal.alternates.map((alt) => (
                  <div
                    key={alt.id}
                    className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
                      alt.selected
                        ? 'bg-amber-50/40 border-amber-300 shadow-2xs'
                        : 'bg-white border-[var(--color-stone)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={alt.selected}
                        readOnly
                        disabled
                        aria-label={`${alt.title}: ${alt.selected ? 'included' : 'not included'}`}
                        className="mt-0.5 size-4 rounded text-[var(--color-teal)]"
                      />
                      <div>
                        <div className="font-bold text-xs text-[var(--color-charcoal)]">
                          {alt.title}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                          {alt.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-[var(--color-charcoal)]">
                        {alt.amount >= 0 ? '+' : ''}${alt.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {alt.selected ? 'Included' : 'Excluded'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing Summary Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 print:bg-white print:text-black print:border print:border-black">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Total Proposed Investment
              </span>
              <div
                style={{ fontFamily: 'var(--font-fraunces)' }}
                className="text-3xl md:text-4xl font-bold mt-1 text-white print:text-black"
              >
                ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-300 mt-1">
                Base Bid: ${proposal.base_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                {selectedAlternatesTotal !== 0 && (
                  <span>
                    {' '}
                    + Selected Alternates: ${selectedAlternatesTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 print:hidden">
              {!isAccepted ? (
                <a
                  href="tel:4809996100"
                  className="px-6 py-3 rounded-xl bg-[var(--color-teal)] text-white text-sm font-semibold hover:opacity-95 shadow-md transition-all flex items-center gap-2"
                >
                  <Phone className="size-4" />
                  <span>Call to accept</span>
                </a>
              ) : (
                <div className="px-4 py-2 rounded-xl bg-emerald-800/80 border border-emerald-600 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  <span>Agreement Executed</span>
                </div>
              )}
            </div>
          </div>

          {/* Clarifications, Exclusions & Escalation Terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--color-stone)]/80 text-xs">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-[var(--color-charcoal)] mb-2">
                Inclusions & Clarifications
              </h3>
              <ul className="space-y-1.5 text-slate-600">
                {proposal.clarifications.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[var(--color-teal)] font-bold">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-rose-800 mb-2">
                Explicit Exclusions
              </h3>
              <ul className="space-y-1.5 text-slate-600">
                {proposal.exclusions.map((ex, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-rose-600 font-bold">✕</span>
                    <span>{ex}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Material Escalation & Legal Clauses */}
          {proposal.material_escalation_clause && (
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs text-amber-950">
              <span className="font-bold flex items-center gap-1.5 mb-1 text-amber-900">
                <ShieldCheck className="size-3.5 text-amber-700" />
                Material Price Escalation Protection Clause
              </span>
              <p className="leading-relaxed text-[11px] text-amber-900/90">
                {proposal.material_escalation_clause}
              </p>
            </div>
          )}

          {/* This link is view-only (2026-10-21): the old proposal store lives on
              the office Mac, so on the live site an acceptance, a picked
              alternate or a sent note was dropped without anyone seeing it.
              Accepting or asking for changes goes through Saddlewood. */}
          <div className="border border-[var(--color-stone)] rounded-2xl p-6 bg-slate-50/60 space-y-3 print:hidden" data-testid="proposal-contact">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-[var(--color-teal)]" />
              <h3 className="font-bold text-sm text-[var(--color-charcoal)]">
                {isAccepted ? 'Questions about this proposal?' : 'Ready to go ahead, or need changes?'}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {isAccepted
                ? 'Call or email us and we will help.'
                : 'This page is for review. To accept the proposal, choose alternates, or send revised plans and questions, call or email Saddlewood and we will send the agreement to sign.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href="tel:4809996100"
                className="min-h-11 px-4 rounded-xl bg-[var(--color-teal)] text-white text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Phone className="size-4" />
                <span>(480) 999-6100</span>
              </a>
              <a
                href={`mailto:info@saddlewoodcontracting.com?subject=${encodeURIComponent(`${proposal.proposal_number} ${proposal.project_name}`)}`}
                className="min-h-11 px-4 rounded-xl border border-[var(--color-stone)] bg-white text-sm font-semibold text-[var(--color-charcoal)] flex items-center justify-center gap-2"
              >
                <Mail className="size-4" />
                <span>info@saddlewoodcontracting.com</span>
              </a>
            </div>
          </div>

          {/* Commercial Terms & Conditions */}
          <div className="border-t border-[var(--color-stone)]/80 pt-4 text-[11px] text-slate-500 space-y-1">
            <div>
              <strong className="text-slate-700">Payment Terms:</strong> {proposal.payment_terms}
            </div>
            <div>
              <strong className="text-slate-700">Warranty:</strong> {proposal.warranty_terms}
            </div>
            <div>
              <strong className="text-slate-700">Contractor License:</strong> Saddlewood Contracting LLC holds valid Arizona ROC License #305762 (Dual Residential / Small Commercial), bonded and insured.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

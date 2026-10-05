'use client';

import React, { useState, useEffect, use } from 'react';
import {
  Building2,
  FileCheck2,
  ShieldCheck,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Printer,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowRight,
  TrendingUp,
  X,
  FileText,
  DollarSign,
  ChevronDown,
  UploadCloud,
  Paperclip,
  MessageSquare,
  Send,
  ExternalLink,
} from 'lucide-react';
import type { ProposalItem, ProposalAlternate, ProposalUpdateCategory } from '@/lib/proposals/types';

interface Props {
  params: Promise<{ token: string }>;
}

export default function ClientProposalPage({ params }: Props) {
  const { token } = use(params);
  const [proposal, setProposal] = useState<ProposalItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signing Modal State
  const [showSignModal, setShowSignModal] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Scope Clarification & File Intake State
  const [updateCategory, setUpdateCategory] = useState<ProposalUpdateCategory>('drawing_revision');
  const [updateAuthorName, setUpdateAuthorName] = useState('');
  const [updateAuthorEmail, setUpdateAuthorEmail] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [stagedFiles, setStagedFiles] = useState<{ name: string; size: number; type: string; data_url: string }[]>([]);
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);
  const [updateSuccessMsg, setUpdateSuccessMsg] = useState<string | null>(null);

  const fetchProposal = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/proposals/${token}`);
      if (!res.ok) {
        throw new Error('Proposal not found or expired link');
      }
      const json = await res.json();
      setProposal(json.proposal);
      setSignerName(json.proposal.client_name || '');
      setUpdateAuthorName(json.proposal.client_name || '');
      setUpdateAuthorEmail(json.proposal.client_email || '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 15 * 1024 * 1024) {
        showToast(`File ${file.name} exceeds 15MB limit`, 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setStagedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            data_url: dataUrl,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateMessage.trim()) return;

    try {
      setIsSubmittingUpdate(true);
      const res = await fetch(`/api/proposals/${token}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_name: updateAuthorName.trim() || proposal?.client_name || 'Client',
          author_email: updateAuthorEmail.trim() || proposal?.client_email || undefined,
          category: updateCategory,
          message: updateMessage.trim(),
          attachments: stagedFiles,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to submit update');
      }

      const json = await res.json();
      setProposal(json.proposal);
      setUpdateMessage('');
      setStagedFiles([]);
      setUpdateSuccessMsg('✓ Received! Routed to Saddlewood estimating team and logged to project.');
      setTimeout(() => setUpdateSuccessMsg(null), 6000);
      showToast('Scope update & attachments routed to Saddlewood estimating', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setIsSubmittingUpdate(false);
    }
  };

  useEffect(() => {
    fetchProposal();
  }, [token]);

  const handleToggleAlternate = async (altId: string, currentSelected: boolean) => {
    if (!proposal || proposal.status === 'accepted') return;
    const newSelected = !currentSelected;

    // Optimistic update
    setProposal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        alternates: prev.alternates.map((a) =>
          a.id === altId ? { ...a, selected: newSelected } : a
        ),
      };
    });

    try {
      await fetch(`/api/proposals/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alternate_id: altId, selected: newSelected }),
      });
    } catch (err) {
      console.error('Failed to toggle alternate', err);
    }
  };

  const handleAcceptProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposal || !signerName.trim() || !agreeTerms) return;

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/proposals/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signerName.trim(),
          signature: `Signed by ${signerName.trim()} via Saddlewood Client Portal`,
        }),
      });

      if (!res.ok) {
        throw new Error('Could not record proposal acceptance');
      }

      const json = await res.json();
      setProposal(json.proposal);
      setShowSignModal(false);
      showToast('Proposal successfully accepted & executed! 🎉');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-900 text-white border-rose-700'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          <span>{toast.text}</span>
        </div>
      )}

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
                    Check or uncheck options below to adjust total project scope before signing.
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                  Interactive Selector
                </span>
              </div>

              <div className="space-y-3">
                {proposal.alternates.map((alt) => (
                  <div
                    key={alt.id}
                    onClick={() => handleToggleAlternate(alt.id, alt.selected)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-4 ${
                      alt.selected
                        ? 'bg-amber-50/40 border-amber-300 shadow-2xs'
                        : 'bg-white border-[var(--color-stone)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={alt.selected}
                        onChange={() => {}} // handled by parent div click
                        disabled={isAccepted}
                        className="mt-0.5 size-4 rounded text-[var(--color-teal)] focus:ring-[var(--color-teal)] cursor-pointer"
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
                <button
                  onClick={() => setShowSignModal(true)}
                  className="px-6 py-3 rounded-xl bg-[var(--color-teal)] text-white text-sm font-semibold hover:opacity-95 shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FileCheck2 className="size-4" />
                  <span>Accept & Authorize Proposal</span>
                </button>
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

          {/* Scope Clarifications, Jobsite Photos & Plan Updates */}
          <div className="border border-[var(--color-stone)] rounded-2xl p-6 bg-slate-50/60 space-y-5 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-[var(--color-teal)]" />
                  <h3 className="font-bold text-sm text-[var(--color-charcoal)]">
                    Scope Clarifications, Site Photos & Plan Updates
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Need changes to wall layouts, questions on specs, or revised plan sheets? Leave notes or attach drawings below. Our estimating team will review and incorporate any approved updates.
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 shrink-0 self-start sm:self-auto font-semibold">
                Direct Intake
              </span>
            </div>

            {/* Category selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                What type of update is this?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  { id: 'drawing_revision', label: '📐 Plan Revision / Markup', desc: 'Rev 5 sheets, details' },
                  { id: 'site_photo', label: '📸 Jobsite Conditions', desc: 'Ceiling, framing, access' },
                  { id: 'scope_change', label: '📝 Scope Adjustment', desc: 'Add / deduct wall items' },
                  { id: 'clarification', label: '💬 Question / RFI', desc: 'Finishes, alternates' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setUpdateCategory(cat.id as ProposalUpdateCategory)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      updateCategory === cat.id
                        ? 'bg-white border-[var(--color-teal)] ring-2 ring-[var(--color-teal)]/20 shadow-xs'
                        : 'bg-white/70 border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <div className="font-semibold text-[11px]">{cat.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{cat.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Note & File Form */}
            <form onSubmit={handleSubmitUpdate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={updateAuthorName}
                    onChange={(e) => setUpdateAuthorName(e.target.value)}
                    placeholder="e.g. Dean Schifferer or Paul Johnson"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-[var(--color-teal)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Your Email (for notifications)</label>
                  <input
                    type="email"
                    value={updateAuthorEmail}
                    onChange={(e) => setUpdateAuthorEmail(e.target.value)}
                    placeholder="e.g. deans@schiffererbuilt.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-[var(--color-teal)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 text-xs mb-1">
                  Context, Drawing Revisions or Scope Request *
                </label>
                <textarea
                  required
                  rows={3}
                  value={updateMessage}
                  onChange={(e) => setUpdateMessage(e.target.value)}
                  placeholder={
                    updateCategory === 'drawing_revision'
                      ? 'Specify sheet numbers, details, or room locations (e.g., "See attached Rev 5 sheet A102 where we adjusted Classroom 111 wall 3 feet east; please price the delta")...'
                      : updateCategory === 'site_photo'
                      ? 'Describe site conditions shown in photos (e.g., "Photo of existing mechanical duct interference over sanctuary lobby")...'
                      : 'Enter questions or requested additions/deductions to the proposal scope...'
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-[var(--color-teal)] resize-y leading-relaxed"
                />
              </div>

              {/* File Uploader Dropzone */}
              <div>
                <label className="block font-semibold text-slate-700 text-xs mb-1">
                  Attach Plan Sheets, Sketches, or Site Photos
                </label>
                <div className="relative border-2 border-dashed border-slate-200 hover:border-[var(--color-teal)] rounded-2xl p-4 bg-white text-center cursor-pointer transition-colors group">
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.dwg"
                    onChange={handleFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                    <div className="size-8 rounded-full bg-slate-100 group-hover:bg-teal-50 flex items-center justify-center transition-colors">
                      <UploadCloud className="size-4 text-slate-400 group-hover:text-[var(--color-teal)]" />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 group-hover:text-[var(--color-teal)]">
                      Click or drag files here to attach
                    </span>
                    <span className="text-[10px] text-slate-400">
                      PDF Plan Sheets, Site Photos (PNG/JPG), Sketches • Max 15MB each
                    </span>
                  </div>
                </div>

                {/* Staged Files Preview */}
                {stagedFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-600">
                      Staged Attachments ({stagedFiles.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {stagedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {file.type.startsWith('image/') ? (
                              <img
                                src={file.data_url}
                                alt={file.name}
                                className="size-8 rounded object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="size-8 rounded bg-red-50 text-red-600 flex items-center justify-center shrink-0 font-bold text-[10px]">
                                PDF
                              </div>
                            )}
                            <div className="truncate">
                              <div className="font-medium text-slate-700 truncate">{file.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {Math.round(file.size / 1024)} KB
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeStagedFile(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg cursor-pointer"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit button & feedback */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                {updateSuccessMsg ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>{updateSuccessMsg}</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Routes directly into Saddlewood's estimating queue and Marco's mobile digest.
                  </span>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingUpdate || !updateMessage.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--color-teal)] text-white text-xs font-semibold hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  {isSubmittingUpdate ? (
                    <>
                      <div className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Update...</span>
                    </>
                  ) : (
                    <>
                      <Send className="size-3.5" />
                      <span>Submit Scope Update & Files</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Prior Submissions & Updates Feed */}
            {proposal.updates && proposal.updates.length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-200/90 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Scope & Plan Revision Activity Log ({proposal.updates.length})
                  </span>
                  <span className="text-[10px] text-slate-400">Chronological history</span>
                </div>

                <div className="space-y-3">
                  {proposal.updates.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              item.category === 'drawing_revision'
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : item.category === 'site_photo'
                                ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                : item.category === 'scope_change'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {item.category.replace('_', ' ')}
                          </span>
                          <span className="font-semibold text-slate-800">{item.author_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                              item.status === 'incorporated'
                                ? 'bg-emerald-50 text-emerald-700'
                                : item.status === 'acknowledged'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {item.status === 'incorporated'
                              ? '✓ In Bid'
                              : item.status === 'acknowledged'
                              ? 'Acknowledged'
                              : 'Under Review'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-600 leading-relaxed text-[11px] whitespace-pre-wrap">
                        {item.message}
                      </p>

                      {item.attachments && item.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {item.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.data_url}
                              target="_blank"
                              rel="noreferrer"
                              download={att.name}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              <Paperclip className="size-3 text-slate-400" />
                              <span className="font-medium truncate max-w-[180px]">{att.name}</span>
                              <span className="text-slate-400">({Math.round(att.size / 1024)} KB)</span>
                              <ExternalLink className="size-2.5 text-slate-400" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      {/* Signature & Authorization Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-xl border border-[var(--color-stone)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-[var(--color-teal)]" />
                <h3 className="font-bold text-base text-[var(--color-charcoal)]">
                  Authorize & Accept Proposal
                </h3>
              </div>
              <button
                onClick={() => setShowSignModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleAcceptProposal} className="space-y-4 text-xs">
              <div className="p-3 bg-[var(--color-cream)]/50 rounded-xl border border-[var(--color-stone)]">
                <div className="text-[11px] text-slate-500">Total Authorized Amount:</div>
                <div className="text-xl font-bold font-mono text-[var(--color-charcoal)]">
                  ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Includes base bid + {proposal.alternates.filter((a) => a.selected).length} selected alternate(s).
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700">
                  Authorized Signer Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="e.g. Dean Schifferer"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white focus:outline-none focus:border-[var(--color-teal)] text-sm"
                />
              </div>

              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="agree-proposal-terms"
                  required
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 size-4 rounded text-[var(--color-teal)] focus:ring-[var(--color-teal)]"
                />
                <label htmlFor="agree-proposal-terms" className="text-[11px] text-slate-600 leading-tight">
                  I represent that I have authority to execute this proposal for{' '}
                  <strong className="text-slate-800">{proposal.client_company || proposal.client_name}</strong>,
                  accepting the scope, alternates, and commercial terms listed above.
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSignModal(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-stone)] text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !agreeTerms || !signerName.trim()}
                  className="px-5 py-2 rounded-xl bg-[var(--color-teal)] text-white font-semibold hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Authorizing...' : 'Authorize Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

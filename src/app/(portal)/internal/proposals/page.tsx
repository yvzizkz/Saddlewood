'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Copy,
  ExternalLink,
  CheckCircle2,
  Clock,
  Building2,
  Layers,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
  MessageSquare,
  Paperclip,
  Check,
} from 'lucide-react';
import type { ProposalItem, ProposalArchetype, DraftProposalInput } from '@/lib/proposals/types';

export default function InternalProposalsPage() {
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'updates' | 'delta' | 'draft'>('pipeline');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleUpdateStatus = async (
    proposalId: string,
    updateId: string,
    status: 'pending_review' | 'acknowledged' | 'incorporated'
  ) => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/updates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: updateId, status }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      showToast(`Update marked as ${status.replace('_', ' ')}`, 'success');
      fetchProposals();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  // Form State for new proposal
  const [formData, setFormData] = useState<DraftProposalInput>({
    client_name: '',
    client_company: '',
    client_email: '',
    client_phone: '',
    project_name: '',
    project_address: '',
    archetype: 'commercial_gc',
    current_rev: 'Rev. 1',
    base_rev: '',
    set_name: 'Architectural Construction Documents',
    base_amount: 50000,
    line_items: [
      {
        id: 'li-new-1',
        phase: 'Cold-Formed Metal Framing (09 22 16)',
        description: 'Light gauge metal stud framing, structural headers, and tracks',
        amount: 28000,
      },
      {
        id: 'li-new-2',
        phase: 'Gypsum Board Assemblies (09 29 00)',
        description: '5/8" Type X drywall hung, taped, and finished to Level 4',
        amount: 22000,
      },
    ],
    alternates: [
      {
        id: 'alt-new-1',
        title: 'Alternate 1: Acoustic Sound Insulation Package',
        description: 'R-11 sound attenuation batts in all interior partition walls',
        amount: 4500,
        selected: false,
      },
    ],
  });

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchProposals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/proposals');
      if (res.ok) {
        const json = await res.json();
        setProposals(json.proposals || []);
      }
    } catch (err) {
      console.error(err);
      showToast('Could not load proposals', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/p/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    showToast('Client proposal link copied! 📋');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error('Failed to create proposal');
      }

      const json = await res.json();
      setProposals((prev) => [json.proposal, ...prev]);
      setActiveTab('pipeline');
      showToast(`Created proposal ${json.proposal.proposal_number}! 🚀`);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const filteredProposals = proposals.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.project_name.toLowerCase().includes(q) ||
      p.client_name.toLowerCase().includes(q) ||
      p.client_company?.toLowerCase().includes(q) ||
      p.proposal_number.toLowerCase().includes(q)
    );
  });

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-6xl mx-auto pb-16">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-20 right-6 md:bottom-8 md:right-8 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-900 text-white border-rose-700'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p
            className="text-[11px] tracking-[0.14em] uppercase mb-2 font-semibold"
            style={{ color: 'var(--color-gold-accessible)' }}
          >
            Sales & Commercial Proposals · September 2026
          </p>
          <h1
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-3xl md:text-4xl text-[var(--color-charcoal)]"
          >
            Proposal & Bid Engine
          </h1>
          <p className="text-sm mt-1 text-[var(--color-charcoal-light)] max-w-2xl">
            Flexible, multi-archetype proposal builder for Commercial GCs and Custom Residential.
            Enforces drawing revision tracking (Rev 3 vs Rev 5), interactive alternates, and 1-tap client e-sign links.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab(activeTab === 'draft' ? 'pipeline' : 'draft')}
            className="px-4 py-2 rounded-xl bg-[var(--color-teal)] text-white text-xs font-semibold flex items-center gap-2 shadow-2xs hover:opacity-95 transition-all cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>{activeTab === 'draft' ? 'View Pipeline' : 'Create Proposal'}</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="text-xs text-[var(--color-charcoal-light)] font-semibold mb-1">
            Active Proposals
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-charcoal)]">
            {proposals.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Pipeline total</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="text-xs text-[var(--color-charcoal-light)] font-semibold mb-1">
            Commercial GCs
          </div>
          <div className="text-2xl font-bold font-mono text-purple-700">
            {proposals.filter((p) => p.archetype === 'commercial_gc').length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Schifferer, JK, McCully</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="text-xs text-[var(--color-charcoal-light)] font-semibold mb-1">
            Pipeline Value
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700">
            ${proposals.reduce((sum, p) => sum + p.base_amount, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Base contract volume</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="text-xs text-[var(--color-charcoal-light)] font-semibold mb-1">
            Tomorrow Onsite
          </div>
          <div className="text-2xl font-bold font-mono text-amber-700">
            12:30 PM
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Bellevue (Dean Schifferer)</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-[var(--color-stone)] pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'pipeline'
                ? 'bg-[var(--color-teal)] text-white shadow-2xs'
                : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]/40'
            }`}
          >
            📋 Proposals Pipeline ({proposals.length})
          </button>
          <button
            onClick={() => setActiveTab('updates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'updates'
                ? 'bg-[var(--color-teal)] text-white shadow-2xs'
                : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]/40'
            }`}
          >
            <MessageSquare className="size-3.5" />
            <span>Client Notes & Media</span>
            {proposals.reduce((acc, p) => acc + (p.updates?.length || 0), 0) > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'updates'
                    ? 'bg-white text-teal-800'
                    : 'bg-teal-100 text-teal-800'
                }`}
              >
                {proposals.reduce((acc, p) => acc + (p.updates?.length || 0), 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('delta')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'delta'
                ? 'bg-[var(--color-teal)] text-white shadow-2xs'
                : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]/40'
            }`}
          >
            🔍 Plan Revision Delta Tool (Rev 3 vs Rev 5)
          </button>
          <button
            onClick={() => setActiveTab('draft')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'draft'
                ? 'bg-[var(--color-teal)] text-white shadow-2xs'
                : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]/40'
            }`}
          >
            ✍️ Draft Builder
          </button>
        </div>

        {activeTab === 'pipeline' && (
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search project or client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded-lg border border-[var(--color-stone)] bg-white w-48 sm:w-56 focus:outline-none focus:border-[var(--color-teal)]"
            />
          </div>
        )}
      </div>

      {/* Tab 1: Proposals Pipeline */}
      {activeTab === 'pipeline' && (
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-[var(--color-charcoal-light)]">
              <RefreshCw className="size-4 animate-spin mx-auto mb-2 text-[var(--color-teal)]" />
              Loading proposals...
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[var(--color-stone)] p-8">
              <CheckCircle2 className="size-8 text-emerald-600 mx-auto mb-2" />
              <h3 className="font-bold text-sm text-[var(--color-charcoal)]">No Proposals Found</h3>
              <p className="text-xs text-[var(--color-charcoal-light)] mt-1">
                Create your first proposal using the Draft Builder.
              </p>
            </div>
          ) : (
            filteredProposals.map((p) => {
              const isBellevue = p.id === 'prp-001';
              return (
                <div
                  key={p.id}
                  className={`p-5 rounded-2xl border bg-white shadow-2xs transition-all ${
                    isBellevue
                      ? 'border-amber-300 ring-2 ring-amber-100'
                      : 'border-[var(--color-stone)] hover:border-[var(--color-teal)]/70'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {p.proposal_number}
                        </span>
                        <h3 className="font-bold text-base text-[var(--color-charcoal)]">
                          {p.project_name}
                        </h3>
                        {isBellevue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            ⭐ Meeting Tomorrow 12:30 PM
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            p.status === 'accepted'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.status === 'sent'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {p.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 mb-2">
                        Client: <strong className="text-slate-800">{p.client_name}</strong>
                        {p.client_company && <span> · {p.client_company}</span>}
                        {p.project_address && <span> · {p.project_address}</span>}
                      </div>

                      {/* Drawing Basis */}
                      <div className="p-2.5 rounded-lg bg-[var(--color-cream)]/50 border border-[var(--color-stone)]/70 text-xs mb-3">
                        <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                          <Layers className="size-3.5 text-[var(--color-teal)]" />
                          <span>Drawing Revision Basis: {p.drawing_basis.set_name}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                          Current Set: <strong className="text-[var(--color-teal)]">{p.drawing_basis.current_rev}</strong>
                          {p.drawing_basis.base_rev && (
                            <span> · Base Set: {p.drawing_basis.base_rev}</span>
                          )}
                        </div>
                      </div>

                      {/* Line Item Preview & Updates */}
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span>{p.line_items.length} line item(s) · {p.alternates.length} alternate(s) attached</span>
                        {p.updates && p.updates.length > 0 && (
                          <button
                            onClick={() => setActiveTab('updates')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold hover:bg-teal-100 transition-colors cursor-pointer"
                          >
                            <MessageSquare className="size-3 text-teal-600" />
                            <span>{p.updates.length} Client Scope Note(s)</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Right Side: Total & Actions */}
                    <div className="text-left md:text-right shrink-0 flex flex-col justify-between">
                      <div>
                        <div className="text-[11px] text-slate-500 font-medium">Base Contract Value</div>
                        <div className="text-2xl font-bold font-mono text-[var(--color-charcoal)]">
                          ${p.base_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        {p.alternates.length > 0 && (
                          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                            +{p.alternates.length} Alternates Available
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-4">
                        <button
                          onClick={() => handleCopyLink(p.token)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-[var(--color-stone)] hover:border-[var(--color-teal)] text-xs font-semibold text-[var(--color-charcoal)] flex items-center gap-1.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                        >
                          <Copy className="size-3.5" />
                          <span>{copiedToken === p.token ? 'Copied Link!' : 'Copy Client Link'}</span>
                        </button>

                        <Link
                          href={`/p/${p.token}`}
                          target="_blank"
                          className="px-3 py-1.5 rounded-lg bg-[var(--color-teal)] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs hover:opacity-95 transition-all"
                        >
                          <span>Open Presentation</span>
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Revision Delta Tool (Rev 3 vs Rev 5) */}
      {activeTab === 'delta' && (
        <div className="p-6 rounded-2xl bg-white border border-[var(--color-stone)] shadow-sm space-y-6">
          <div className="border-b border-[var(--color-stone)] pb-4">
            <h2 className="text-xl font-bold text-[var(--color-charcoal)] flex items-center gap-2">
              <TrendingUp className="size-5 text-[var(--color-teal)]" />
              <span>Bellevue Heights Church (AC938) — Revision Delta Reconciler</span>
            </h2>
            <p className="text-xs text-[var(--color-charcoal-light)] mt-1">
              Tool for tomorrow&apos;s 12:30 PM meeting with Dean Schifferer. Original takeoff was on <strong>Rev. 3 (05/27)</strong>;
              Dean is running on <strong>Rev. 5 (07/20 Stamped Set)</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                Original 04/27 Bid Basis
              </span>
              <div className="text-xl font-bold font-mono text-slate-800 mt-1">$144,913.00</div>
              <div className="text-[11px] text-slate-600 mt-1">
                Franklin Hall + Sanctuary Lobby (Direct $120,546 + 5% contingency + 7% G&A + 7% profit)
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <span className="font-semibold text-amber-800 uppercase tracking-wider text-[10px]">
                07/09 Revised Proposal (8150-42428-R)
              </span>
              <div className="text-xl font-bold font-mono text-amber-900 mt-1">$176,713.00</div>
              <div className="text-[11px] text-amber-800 mt-1">
                Base ($144,913) + ChamClad labor ($15,000) + Mineral wool ($6,700) + Classroom 111 lid ($6,600) + 10CR allowance ($3,500)
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <span className="font-semibold text-blue-800 uppercase tracking-wider text-[10px]">
                Steel Inflation Exposure
              </span>
              <div className="text-xl font-bold font-mono text-blue-900 mt-1">+6.6% to +13%</div>
              <div className="text-[11px] text-blue-800 mt-1">
                Cold-rolled stud feedstock up. Ask for BLS WPU101 ±5% clause pointed forward instead of backwards repricing.
              </div>
            </div>
          </div>

          {/* Key Discussion Checklist for Dean */}
          <div className="p-5 rounded-xl bg-[var(--color-cream)]/50 border border-[var(--color-stone)] space-y-3">
            <h3 className="text-sm font-bold text-[var(--color-charcoal)]">
              Meeting Action Checklist for Dean Schifferer (Tomorrow 12:30 PM):
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-[var(--color-teal)] shrink-0 mt-0.5" />
                <span>
                  <strong>Rev 5 Drawings:</strong> Request the stamped Rev 5 sheet list and confirm whether 10CR walls now show exact lengths/heights to convert the $3,500 allowance.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-[var(--color-teal)] shrink-0 mt-0.5" />
                <span>
                  <strong>ChamClad Material:</strong> Confirm GC orders ChamClad planks with 12-15% waste; Saddlewood performs labor & high-reach access only ($15,000).
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-[var(--color-teal)] shrink-0 mt-0.5" />
                <span>
                  <strong>Steel Escalation:</strong> Protect future months with the BLS WPU101 5% trigger clause rather than reopening the base bid.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-[var(--color-teal)] shrink-0 mt-0.5" />
                <span>
                  <strong>Subcontract Value:</strong> Verify subcontract matches the $176,713 total with all 4 alternates cleanly accounted for.
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link
              href="/p/bellevue-church-schifferer-ac938"
              target="_blank"
              className="px-4 py-2 rounded-xl bg-[var(--color-teal)] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs hover:opacity-95"
            >
              <span>Preview Live Bellevue Client Proposal</span>
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Tab: Inbound Client Updates & Media Feed */}
      {activeTab === 'updates' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-[var(--color-stone)] shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-stone)] pb-4">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-charcoal)] flex items-center gap-2">
                  <MessageSquare className="size-5 text-[var(--color-teal)]" />
                  <span>Inbound Scope Clarifications & Plan Markups</span>
                </h2>
                <p className="text-xs text-[var(--color-charcoal-light)] mt-1">
                  Client and superintendent feedback, site photos, and revised drawing sheets submitted through proposal presentation links.
                </p>
              </div>
              <div className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 shrink-0 self-start sm:self-auto">
                {proposals.reduce((acc, p) => acc + (p.updates?.length || 0), 0)} Total Updates Logged
              </div>
            </div>

            {proposals.reduce((acc, p) => acc + (p.updates?.length || 0), 0) === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <CheckCircle2 className="size-8 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-[var(--color-charcoal)]">All Clear — No Pending Scope Updates</h3>
                <p className="text-xs text-slate-400 mt-1">
                  When a GC or homeowner submits comments, sketches, or photos on their proposal page, they will land here in real time.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {proposals.flatMap((p) =>
                  (p.updates || []).map((u) => ({ proposal: p, update: u }))
                ).map(({ proposal: p, update: u }) => (
                  <div
                    key={u.id}
                    className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-sm text-[var(--color-charcoal)]">
                          {p.project_name}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-medium text-slate-600">
                          {p.client_company || p.client_name}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            u.category === 'drawing_revision'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : u.category === 'site_photo'
                              ? 'bg-purple-50 text-purple-800 border border-purple-200'
                              : u.category === 'scope_change'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {u.category.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">
                          {new Date(u.created_at).toLocaleString()}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                            u.status === 'incorporated'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : u.status === 'acknowledged'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {u.status === 'incorporated'
                            ? '✓ Incorporated'
                            : u.status === 'acknowledged'
                            ? 'Acknowledged'
                            : 'Under Review'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Submitted by: <strong>{u.author_name}</strong> {u.author_email ? `(${u.author_email})` : ''}</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                      {u.message}
                    </div>

                    {u.attachments && u.attachments.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-bold text-slate-600">Attached Media & Drawings:</div>
                        <div className="flex flex-wrap gap-2">
                          {u.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.data_url}
                              target="_blank"
                              rel="noreferrer"
                              download={att.name}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs text-slate-700 transition-colors"
                            >
                              <Paperclip className="size-3.5 text-slate-400" />
                              <span className="font-semibold">{att.name}</span>
                              <span className="text-slate-400 text-[10px]">({Math.round(att.size / 1024)} KB)</span>
                              <ExternalLink className="size-3 text-slate-400" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                      <Link
                        href={`/p/${p.token}`}
                        target="_blank"
                        className="text-[var(--color-teal)] hover:underline flex items-center gap-1 font-semibold"
                      >
                        <span>Open Client Proposal</span>
                        <ExternalLink className="size-3" />
                      </Link>

                      <div className="flex items-center gap-2">
                        {u.status !== 'acknowledged' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(p.id, u.id, 'acknowledged')}
                            className="px-3 py-1 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            Acknowledge
                          </button>
                        )}
                        {u.status !== 'incorporated' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(p.id, u.id, 'incorporated')}
                            className="px-3 py-1 rounded-lg bg-[var(--color-teal)] text-white font-semibold hover:opacity-95 transition-opacity cursor-pointer flex items-center gap-1"
                          >
                            <Check className="size-3.5" />
                            <span>Mark Incorporated into Bid</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Draft Builder */}
      {activeTab === 'draft' && (
        <form onSubmit={handleCreateProposal} className="p-6 rounded-2xl bg-white border border-[var(--color-stone)] shadow-sm space-y-6 text-xs">
          <div className="border-b border-[var(--color-stone)] pb-3">
            <h2 className="text-lg font-bold text-[var(--color-charcoal)]">
              Create New Proposal / Scope Estimate
            </h2>
            <p className="text-xs text-[var(--color-charcoal-light)]">
              Choose an archetype tailored to the client: Commercial GC, Custom Residential, or Scope Addendum.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1 text-slate-700">Proposal Archetype</label>
              <select
                value={formData.archetype}
                onChange={(e) => setFormData({ ...formData, archetype: e.target.value as ProposalArchetype })}
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white text-xs"
              >
                <option value="commercial_gc">Commercial GC (CSI Divisions, Drawing Revisions, Alternates)</option>
                <option value="luxury_residential">Luxury Residential (Editorial, Phases, Equipment Carve-Outs)</option>
                <option value="scope_addendum">Scope Addendum (Delta Over Contract Base)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700">Client Contact Name *</label>
              <input
                type="text"
                required
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                placeholder="e.g. Dean Schifferer"
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700">Client Company / Entity</label>
              <input
                type="text"
                value={formData.client_company || ''}
                onChange={(e) => setFormData({ ...formData, client_company: e.target.value })}
                placeholder="e.g. Schifferer Built, LLC"
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700">Project Name *</label>
              <input
                type="text"
                required
                value={formData.project_name}
                onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                placeholder="e.g. Bellevue Heights Church TI"
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700">Project Address *</label>
              <input
                type="text"
                required
                value={formData.project_address}
                onChange={(e) => setFormData({ ...formData, project_address: e.target.value })}
                placeholder="e.g. 9440 W Hutton Dr, Sun City, AZ"
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700">Drawing Revision Set *</label>
              <input
                type="text"
                required
                value={formData.current_rev}
                onChange={(e) => setFormData({ ...formData, current_rev: e.target.value })}
                placeholder="e.g. Rev. 5 (07/20 Stamped Set)"
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700">Base Contract Amount ($) *</label>
              <input
                type="number"
                required
                value={formData.base_amount}
                onChange={(e) => setFormData({ ...formData, base_amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl border border-[var(--color-stone)] bg-white text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-stone)]">
            <button
              type="button"
              onClick={() => setActiveTab('pipeline')}
              className="px-4 py-2 rounded-xl border border-[var(--color-stone)] text-slate-600 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[var(--color-teal)] text-white font-semibold hover:opacity-95"
            >
              Publish & Generate Client Link
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Plus,
  Copy,
  Printer,
  ChevronRight,
  AlertTriangle,
  Building,
  DollarSign,
  Layers,
  Scale,
  RefreshCw,
  X,
  FileCheck,
  Send,
  ExternalLink,
} from 'lucide-react';
import type { ContractItem, ContractStatus, ContractType, DraftContractInput } from '@/lib/contracts/types';
import { generateContractText } from '@/lib/contracts/generator';

export default function ContractsPortalPage() {
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'draft'>('pipeline');
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all');
  const [viewingContract, setViewingContract] = useState<ContractItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State for New Contract
  const [formData, setFormData] = useState<DraftContractInput>({
    client_name: '',
    client_entity: '',
    project_name: '',
    project_address: '',
    amount: 45000,
    deposit: 4500,
    scope: 'Structural framing, drywall hung/taped Level 4, and HVAC equipment coordination',
    scope_details: '',
    type: 'prime_residential',
    warranty_years: 2,
    late_interest: '1.5% per month (18% per annum)',
    remobilization_fee: 1500,
  });

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchContracts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/contracts');
      if (res.ok) {
        const json = await res.json();
        setContracts(json.contracts || []);
      }
    } catch (err) {
      console.error('Failed to load contracts', err);
      showToast('Could not load contracts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Contract text copied to clipboard! 📋');
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleStatusChange = async (id: string, newStatus: ContractStatus) => {
    try {
      const res = await fetch(`/api/contracts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const json = await res.json();
        setContracts((prev) => prev.map((c) => (c.id === id ? json.contract : c)));
        if (viewingContract?.id === id) {
          setViewingContract(json.contract);
        }
        showToast(`Agreement status updated to ${newStatus.replace('_', ' ')} ✅`);
      } else {
        showToast('Failed to update contract status', 'error');
      }
    } catch {
      showToast('Network error while updating status', 'error');
    }
  };

  const handleApplyPreset = (preset: {
    client_name: string;
    project_address: string;
    amount: number;
    scope: string;
    scope_details: string;
    type: ContractType;
  }) => {
    setFormData({
      ...formData,
      client_name: preset.client_name,
      project_address: preset.project_address,
      amount: preset.amount,
      deposit: preset.amount * 0.1,
      scope: preset.scope,
      scope_details: preset.scope_details,
      type: preset.type,
      warranty_years: preset.type === 'prime_residential' ? 2 : 1,
    });
    showToast(`Loaded ${preset.client_name} preset`);
  };

  const handleSubmitDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_name || !formData.amount || !formData.scope) {
      showToast('Please provide client name, amount, and scope', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const json = await res.json();
        setContracts((prev) => [json.contract, ...prev]);
        showToast(`Agreement ${json.contract.contract_number} drafted successfully! 🎉`);
        setActiveTab('pipeline');
        setViewingContract(json.contract);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to draft agreement', 'error');
      }
    } catch {
      showToast('Network error while drafting agreement', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredContracts = contracts.filter((c) => {
    if (statusFilter === 'all') return true;
    return c.status === statusFilter;
  });

  const totalValue = contracts.reduce((acc, c) => acc + (c.amount || 0), 0);
  const signedValue = contracts
    .filter((c) => c.status === 'signed')
    .reduce((acc, c) => acc + (c.amount || 0), 0);

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-6xl mx-auto pb-16">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 border transition-all ${
            toast.type === 'success'
              ? 'bg-[var(--color-teal)] text-white border-teal-600'
              : 'bg-red-600 text-white border-red-700'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header & Department Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--color-gold-accessible)' }}>
            <span>Legal & Accounting Dept</span>
            <span>·</span>
            <span>Risk-Allocation Engine</span>
          </div>
          <h1
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-3xl md:text-4xl text-[var(--color-charcoal)]"
          >
            Contract Drafting & Risk Safeguards
          </h1>
          <p className="text-sm text-[var(--color-charcoal-light)] mt-1 max-w-2xl">
            Prime construction contracts and subcontractor agreements with mandatory risk-allocation:
            equipment defect carve-outs, 1.5% late payment penalties, written change orders, and 20-day prelim lien protection.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchContracts}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-[var(--color-stone)] bg-white text-xs font-medium text-[var(--color-charcoal)] hover:bg-[var(--color-cream)] transition-colors"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <button
            onClick={() => setActiveTab(activeTab === 'draft' ? 'pipeline' : 'draft')}
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-[var(--color-teal)] text-white text-xs font-medium hover:opacity-90 shadow-sm transition-all"
          >
            {activeTab === 'draft' ? (
              <>
                <FileText className="size-3.5" />
                View Pipeline
              </>
            ) : (
              <>
                <Plus className="size-3.5" />
                Draft New Agreement
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mandatory Safeguard Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="p-3.5 rounded-lg border border-[var(--color-stone)] bg-[var(--color-cream)]/50">
          <div className="flex items-center gap-2 text-[var(--color-charcoal)] font-semibold text-xs mb-1">
            <ShieldCheck className="size-4 text-[var(--color-teal)]" />
            HVAC & Defect Carve-Out
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--color-charcoal-light)]">
            Absolute disclaimer for manufacturer equipment defects (compressors, heat pumps, coils). Warranties pass through; zero secondary liability.
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-[var(--color-stone)] bg-[var(--color-cream)]/50">
          <div className="flex items-center gap-2 text-[var(--color-charcoal)] font-semibold text-xs mb-1">
            <Scale className="size-4 text-[var(--color-gold-accessible)]" />
            1.5% Late Penalty & Suspension
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--color-charcoal-light)]">
            Twice-monthly billing, 7-day payment due, 1.5%/mo late interest, 5-day Notice to Suspend, day-for-day extension, $1,500 remobilization.
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-[var(--color-stone)] bg-[var(--color-cream)]/50">
          <div className="flex items-center gap-2 text-[var(--color-charcoal)] font-semibold text-xs mb-1">
            <FileCheck className="size-4 text-[var(--color-teal)]" />
            Zero Verbal Change Orders
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--color-charcoal-light)]">
            100% written change orders required. 50% cash deposit on COs ≥ $5,000 before ordering materials. Standard 20% OH&P markup.
          </p>
        </div>

        <div className="p-3.5 rounded-lg border border-[var(--color-stone)] bg-[var(--color-cream)]/50">
          <div className="flex items-center gap-2 text-[var(--color-charcoal)] font-semibold text-xs mb-1">
            <Shield className="size-4 text-emerald-700" />
            20-Day Preliminary Lien Notice
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--color-charcoal-light)]">
            AZ A.R.S. § 33-992.01 statutory preliminary lien notice preservation disclosure with progress lien waiver attachments.
          </p>
        </div>
      </div>

      {/* Key Metric Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 bg-white p-4 rounded-xl border border-[var(--color-stone)] shadow-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Total Agreements</div>
          <div className="text-xl md:text-2xl font-bold text-[var(--color-charcoal)] mt-0.5">{contracts.length}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Pipeline Value</div>
          <div className="text-xl md:text-2xl font-bold text-[var(--color-teal)] mt-0.5">${totalValue.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Draft / Under Review</div>
          <div className="text-xl md:text-2xl font-bold text-[var(--color-gold-accessible)] mt-0.5">
            {contracts.filter((c) => c.status === 'draft' || c.status === 'under_review').length}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-charcoal-light)]">Executed & Signed</div>
          <div className="text-xl md:text-2xl font-bold text-emerald-700 mt-0.5">
            ${signedValue.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-[var(--color-stone)] mb-6">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'pipeline'
              ? 'border-[var(--color-teal)] text-[var(--color-teal)]'
              : 'border-transparent text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
          }`}
        >
          <Layers className="size-4" />
          Active Pipeline ({contracts.length})
        </button>
        <button
          onClick={() => setActiveTab('draft')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'draft'
              ? 'border-[var(--color-teal)] text-[var(--color-teal)]'
              : 'border-transparent text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
          }`}
        >
          <Plus className="size-4" />
          Draft New Agreement
        </button>
      </div>

      {/* TAB 1: PIPELINE */}
      {activeTab === 'pipeline' && (
        <div>
          {/* Status Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-[var(--color-charcoal-light)] mr-1">Filter:</span>
            {(['all', 'draft', 'under_review', 'sent', 'signed'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  statusFilter === st
                    ? 'bg-[var(--color-charcoal)] text-white shadow-xs'
                    : 'bg-white border border-[var(--color-stone)] text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]'
                }`}
              >
                {st === 'all' ? 'All Contracts' : st.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>

          {/* Contracts List */}
          {loading ? (
            <div className="p-12 text-center text-sm text-[var(--color-charcoal-light)] bg-white rounded-xl border border-[var(--color-stone)]">
              <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-[var(--color-teal)]" />
              Loading contracts and legal safeguards...
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="p-12 text-center text-sm text-[var(--color-charcoal-light)] bg-white rounded-xl border border-[var(--color-stone)]">
              No contracts found matching this filter.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredContracts.map((c) => {
                const deposit = c.deposit || c.amount * 0.1;
                return (
                  <div
                    key={c.id}
                    className="p-4 rounded-xl border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[var(--color-stone)] text-[var(--color-charcoal)]">
                          {c.contract_number}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            c.status === 'signed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : c.status === 'under_review'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {c.status.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-[var(--color-charcoal-light)]">
                          {c.type === 'prime_residential'
                            ? 'Prime Residential'
                            : c.type === 'prime_commercial'
                            ? 'Commercial TI'
                            : 'Subcontractor Trade'}
                        </span>
                      </div>

                      <div className="font-semibold text-base text-[var(--color-charcoal)]">
                        {c.client_name} · {c.project_name}
                      </div>

                      <div className="text-xs text-[var(--color-charcoal-light)] flex items-center gap-1.5">
                        <Building className="size-3.5 shrink-0" />
                        <span>{c.project_address}</span>
                      </div>

                      <div className="text-xs text-[var(--color-charcoal-light)] line-clamp-1 italic">
                        "{c.scope}"
                      </div>

                      {/* Protection Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                          🛡️ HVAC Defect Carve-Out
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-800 border border-amber-200">
                          ⚡ 1.5% Late Penalty
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-50 text-slate-700 border border-slate-200">
                          📝 Zero Verbal COs
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-50 text-sky-700 border border-sky-200">
                          ⚖️ 20-Day Prelim Lien
                        </span>
                      </div>
                    </div>

                    <div className="flex md:flex-col items-end justify-between md:justify-center border-t md:border-t-0 pt-3 md:pt-0 border-[var(--color-stone)] gap-2">
                      <div className="text-right">
                        <div className="text-lg font-bold text-[var(--color-charcoal)]">
                          ${c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-[var(--color-charcoal-light)]">
                          Deposit: ${deposit.toLocaleString(undefined, { minimumFractionDigits: 2 })} (10%)
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewingContract(c)}
                          className="px-3 py-1.5 rounded bg-[var(--color-cream)] hover:bg-[var(--color-stone)] text-xs font-semibold text-[var(--color-charcoal)] flex items-center gap-1 transition-colors"
                        >
                          <FileText className="size-3.5" />
                          View
                        </button>
                        <a
                          href={`/sign/${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded bg-[var(--color-teal)] hover:opacity-90 text-xs font-semibold text-white flex items-center gap-1 transition-all"
                        >
                          <ExternalLink className="size-3.5" />
                          <span>Client Sign Link</span>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DRAFT NEW CONTRACT */}
      {activeTab === 'draft' && (
        <div className="bg-white rounded-xl border border-[var(--color-stone)] p-4 md:p-6 shadow-sm">
          {/* Quick Presets */}
          <div className="mb-6 p-4 rounded-lg bg-[var(--color-cream)]/60 border border-[var(--color-stone)]">
            <div className="text-xs font-bold text-[var(--color-charcoal)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-[var(--color-gold-accessible)]" />
              Quick Scope & Project Presets
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  handleApplyPreset({
                    client_name: 'Mark & Heather Powell',
                    project_address: '3526 Emerson St, San Diego CA 92106',
                    amount: 45000,
                    scope: 'Structural framing, drywall hung/taped Level 4, and HVAC equipment coordination',
                    scope_details: 'Includes addition framing, structural headers, drywall hung & finished to Level 4 smooth, multi-zone heat pump coordination.',
                    type: 'prime_residential',
                  })
                }
                className="p-2.5 text-left rounded border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] text-xs transition-all"
              >
                <div className="font-semibold text-[var(--color-charcoal)]">Powell Residence</div>
                <div className="text-[11px] text-[var(--color-charcoal-light)]">Framing & Drywall · $45,000</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleApplyPreset({
                    client_name: 'North Lane Medical Group',
                    project_address: '7401 E North Lane, Scottsdale AZ 85258',
                    amount: 32000,
                    scope: 'Commercial TI: metal stud framing, sound-rated drywall assemblies, and rooftop HVAC RTU installation coordination',
                    scope_details: 'Metal stud partitions, double-layer Type X drywall with resilient channels and sound batts, rooftop unit placement coordination.',
                    type: 'prime_commercial',
                  })
                }
                className="p-2.5 text-left rounded border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] text-xs transition-all"
              >
                <div className="font-semibold text-[var(--color-charcoal)]">North Lane TI</div>
                <div className="text-[11px] text-[var(--color-charcoal-light)]">Commercial HVAC & Framing · $32,000</div>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleApplyPreset({
                    client_name: 'Billy Boy Drywall Finishes',
                    project_address: '6602 N 40th St, Phoenix AZ 85018',
                    amount: 18500,
                    scope: 'Subcontract trade work: tape, bed, and Level 4 drywall texture finish',
                    scope_details: 'Furnish finishing labor and taping mud to finish 14,200 SF of drywall to Level 4 smooth finish.',
                    type: 'subcontractor',
                  })
                }
                className="p-2.5 text-left rounded border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] text-xs transition-all"
              >
                <div className="font-semibold text-[var(--color-charcoal)]">Subcontractor Agreement</div>
                <div className="text-[11px] text-[var(--color-charcoal-light)]">Finishing Labor · $18,500</div>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmitDraft} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1">
                  Agreement Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as ContractType,
                      warranty_years: e.target.value === 'prime_residential' ? 2 : 1,
                    })
                  }
                  className="w-full text-sm p-2.5 rounded border border-[var(--color-stone)] bg-white focus:outline-none focus:border-[var(--color-teal)]"
                >
                  <option value="prime_residential">Prime Residential Agreement</option>
                  <option value="prime_commercial">Prime Commercial Agreement</option>
                  <option value="subcontractor">Subcontractor Trade Agreement</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1">
                  Client / Trade Partner Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mark & Heather Powell"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  className="w-full text-sm p-2.5 rounded border border-[var(--color-stone)] bg-white focus:outline-none focus:border-[var(--color-teal)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1">
                  Legal Entity (if different)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Powell Family Trust LLC"
                  value={formData.client_entity}
                  onChange={(e) => setFormData({ ...formData, client_entity: e.target.value })}
                  className="w-full text-sm p-2.5 rounded border border-[var(--color-stone)] bg-white focus:outline-none focus:border-[var(--color-teal)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1">
                  Jobsite / Project Location *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3526 Emerson St, San Diego CA 92106"
                  value={formData.project_address}
                  onChange={(e) => setFormData({ ...formData, project_address: e.target.value })}
                  className="w-full text-sm p-2.5 rounded border border-[var(--color-stone)] bg-white focus:outline-none focus:border-[var(--color-teal)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1">
                  Contract Amount ($) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="100"
                  value={formData.amount}
                  onChange={(e) => {
                    const amt = Number(e.target.value);
                    setFormData({ ...formData, amount: amt, deposit: amt * 0.1 });
                  }}
                  className="w-full text-sm p-2.5 rounded border border-[var(--color-stone)] bg-white font-mono focus:outline-none focus:border-[var(--color-teal)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1">
                Specified Work Scope *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Framing, drywall hung/finished Level 4, and HVAC equipment coordination"
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                className="w-full text-sm p-2.5 rounded border border-[var(--color-stone)] bg-white focus:outline-none focus:border-[var(--color-teal)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1">
                Scope Breakdown / Inclusions / Details
              </label>
              <textarea
                rows={3}
                placeholder="Itemized breakdown of framing members, drywall layers, specific HVAC units, etc."
                value={formData.scope_details}
                onChange={(e) => setFormData({ ...formData, scope_details: e.target.value })}
                className="w-full text-sm p-2.5 rounded border border-[var(--color-stone)] bg-white focus:outline-none focus:border-[var(--color-teal)]"
              />
            </div>

            {/* Active Protection Toggles Note */}
            <div className="p-3.5 rounded-lg border border-teal-200 bg-teal-50/50">
              <div className="text-xs font-bold text-teal-900 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-teal-700" />
                Active Legal Safeguards Automatically Embedded
              </div>
              <ul className="text-xs text-teal-800 space-y-1 list-disc list-inside">
                <li><strong>Section 4:</strong> Absolute HVAC / Manufacturer equipment defect disclaimer (zero delay or secondary liability).</li>
                <li><strong>Section 3:</strong> 1.5%/month late interest, 5-day Notice of Intent to Suspend, $1,500 remobilization fee, 100% legal fees.</li>
                <li><strong>Section 6:</strong> 100% written change order mandate; 50% deposit on COs ≥ $5,000; 20% OH&P markup.</li>
                <li><strong>Section 7:</strong> AZ A.R.S. § 33-992.01 20-Day Preliminary Lien Notice statutory disclosure & waiver exchange.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-stone)]">
              <button
                type="button"
                onClick={() => setActiveTab('pipeline')}
                className="px-4 py-2 rounded text-sm text-[var(--color-charcoal)] hover:bg-[var(--color-cream)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded bg-[var(--color-teal)] text-white text-sm font-semibold hover:opacity-90 shadow-sm flex items-center gap-2 transition-all"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileCheck className="size-4" />
                    Generate & Save Contract
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: VIEW / PRINT / COPY CONTRACT */}
      {viewingContract && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[var(--color-stone)] shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-stone)]">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm bg-[var(--color-stone)] px-2 py-0.5 rounded text-[var(--color-charcoal)]">
                  {viewingContract.contract_number}
                </span>
                <span className="font-semibold text-[var(--color-charcoal)] text-base">
                  {viewingContract.client_name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyText(viewingContract.contract_text)}
                  className="px-3 py-1.5 rounded border border-[var(--color-stone)] text-xs font-semibold text-[var(--color-charcoal)] hover:bg-[var(--color-cream)] flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="size-3.5" />
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/sign/${viewingContract.id}`;
                    navigator.clipboard.writeText(url);
                    alert(`Copied 1-Tap Client Sign Link to clipboard:\n${url}`);
                  }}
                  className="px-3 py-1.5 rounded bg-[var(--color-teal)] text-white hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <ExternalLink className="size-3.5" />
                  Copy Client Sign Link
                </button>
                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 rounded border border-[var(--color-stone)] text-xs font-semibold text-[var(--color-charcoal)] hover:bg-[var(--color-cream)] flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="size-3.5" />
                  Print / PDF
                </button>
                <button
                  onClick={() => setViewingContract(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Status Change Toolbar */}
            <div className="px-6 py-2.5 bg-[var(--color-cream)]/50 border-b border-[var(--color-stone)] flex flex-wrap items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--color-charcoal-light)]">Status:</span>
                <span className="font-bold text-[var(--color-charcoal)] uppercase tracking-wider">
                  {viewingContract.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {viewingContract.status !== 'under_review' && (
                  <button
                    onClick={() => handleStatusChange(viewingContract.id, 'under_review')}
                    className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium hover:bg-amber-100"
                  >
                    Mark Under Review
                  </button>
                )}
                {viewingContract.status !== 'sent' && (
                  <button
                    onClick={() => handleStatusChange(viewingContract.id, 'sent')}
                    className="px-2.5 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium hover:bg-blue-100"
                  >
                    Mark Sent to Client
                  </button>
                )}
                {viewingContract.status !== 'signed' && (
                  <button
                    onClick={() => handleStatusChange(viewingContract.id, 'signed')}
                    className="px-2.5 py-1 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                  >
                    Mark Signed & Executed
                  </button>
                )}
              </div>
            </div>

            {/* Document Content */}
            <div className="p-6 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--color-charcoal)] selection:bg-[var(--color-gold)]/20">
              {viewingContract.contract_text}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-[var(--color-stone)] bg-slate-50 flex items-center justify-between text-xs text-[var(--color-charcoal-light)]">
              <div>
                Created on {new Date(viewingContract.created_at).toLocaleDateString()} by {viewingContract.created_by}
              </div>
              <button
                onClick={() => setViewingContract(null)}
                className="px-4 py-1.5 rounded bg-white border border-[var(--color-stone)] font-medium text-[var(--color-charcoal)] hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkles({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

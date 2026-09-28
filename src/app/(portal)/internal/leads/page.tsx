'use client';

import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  MessageSquare,
  Copy,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Filter,
  UserCheck,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Flame,
  Archive,
  PhoneForwarded,
  Sparkles,
} from 'lucide-react';
import type { LeadsState, LeadItem } from '@/lib/leads/types';

export default function LeadsPage() {
  const [state, setState] = useState<LeadsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'fresh' | 'backlog' | 'quiet'>('fresh');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchLeads = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const url = forceRefresh ? '/api/leads?refresh=true' : '/api/leads';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setState(json.state);
        if (forceRefresh) showToast('Synced live from GoHighLevel! 🚀');
      } else {
        showToast('Failed to load leads from CRM', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error loading leads', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleStatusChange = async (
    phone: string,
    newStatus: 'pending' | 'called' | 'texted' | 'dismissed'
  ) => {
    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, status: newStatus }),
      });
      if (res.ok) {
        setState((prev) => {
          if (!prev) return prev;
          const updateItem = (item: LeadItem) =>
            item.phone === phone ? { ...item, callback_status: newStatus } : item;

          return {
            ...prev,
            fresh_list: prev.fresh_list.map(updateItem),
            backlog_list: prev.backlog_list.map(updateItem),
          };
        });
        showToast(`Updated status to ${newStatus}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Could not update status', 'error');
    }
  };

  const copyToClipboard = (text: string, phone: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPhone(phone);
    showToast('Suggested SMS copied to clipboard! 📋');
    setTimeout(() => setCopiedPhone(null), 2500);
  };

  // Filter list based on tab, tag filter, and search
  const currentList: LeadItem[] =
    activeTab === 'fresh'
      ? state?.fresh_list || []
      : activeTab === 'backlog'
      ? state?.backlog_list || []
      : (state?.gone_quiet as unknown as LeadItem[]) || [];

  const filteredList = currentList.filter((item) => {
    if (filterTag !== 'all') {
      if (filterTag === 'past-client' && !item.kb) return false;
      if (filterTag === 'callback-requested' && !item.tags?.includes('callback-requested')) return false;
      if (filterTag === 'commercial-bid' && !item.tags?.includes('commercial-bid')) return false;
      if (filterTag === 'pending-only' && item.callback_status && item.callback_status !== 'pending') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDisplay = item.display?.toLowerCase().includes(q);
      const matchPhone = item.phone?.includes(q);
      const matchSnippet = item.snippet?.toLowerCase().includes(q);
      const matchKB = item.kb?.subjects?.toLowerCase().includes(q);
      const matchTags = item.tags?.some((t) => t.toLowerCase().includes(q));
      return matchDisplay || matchPhone || matchSnippet || matchKB || matchTags;
    }

    return true;
  });

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-6xl mx-auto pb-16">
      {/* Toast Notification */}
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
            Sales & CRM · GoHighLevel Live Engine
          </p>
          <h1
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-3xl md:text-4xl text-[var(--color-charcoal)]"
          >
            Lead Triage & Callback Queue
          </h1>
          <p className="text-sm mt-1 text-[var(--color-charcoal-light)] max-w-2xl">
            Ranked speed-to-lead queue. Unknown numbers are auto-resolved against past emails & bids in the
            Knowledge Base so you know who is calling before you dial.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLeads(true)}
            disabled={refreshing || loading}
            className="px-3.5 py-2 rounded-xl bg-white border border-[var(--color-stone)] hover:border-[var(--color-teal)] text-xs font-semibold text-[var(--color-charcoal)] flex items-center gap-2 shadow-2xs hover:shadow-xs transition-all disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[var(--color-teal)]' : ''}`} />
            <span>{refreshing ? 'Syncing GHL...' : 'Sync GoHighLevel'}</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-charcoal-light)] mb-1">
            <span className="font-semibold flex items-center gap-1.5 text-amber-700">
              <Flame className="size-3.5" />
              Fresh (Hot)
            </span>
            <span className="text-[10px]">&lt; 14 days</span>
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-charcoal)]">
            {state?.fresh ?? '—'}
          </div>
          <div className="text-[11px] text-[var(--color-charcoal-light)] mt-0.5">Call today first</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-charcoal-light)] mb-1">
            <span className="font-semibold flex items-center gap-1.5 text-purple-700">
              <UserCheck className="size-3.5" />
              Past Clients
            </span>
            <span className="text-[10px]">KB Index</span>
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-charcoal)]">
            {state?.with_history ?? '—'}
          </div>
          <div className="text-[11px] text-[var(--color-charcoal-light)] mt-0.5">Known to us in emails</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-charcoal-light)] mb-1">
            <span className="font-semibold flex items-center gap-1.5 text-blue-700">
              <PhoneForwarded className="size-3.5" />
              Overdue Known
            </span>
            <span className="text-[10px]">&gt; 14 days</span>
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-charcoal)]">
            {state?.backlog_with_history ?? '—'}
          </div>
          <div className="text-[11px] text-[var(--color-charcoal-light)] mt-0.5">High-value winback</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--color-stone)] bg-white shadow-2xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-charcoal-light)] mb-1">
            <span className="font-semibold flex items-center gap-1.5 text-slate-700">
              <Archive className="size-3.5" />
              Total Backlog
            </span>
            <span className="text-[10px]">Unanswered</span>
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--color-charcoal)]">
            {state?.total_waiting ?? '—'}
          </div>
          <div className="text-[11px] text-[var(--color-charcoal-light)] mt-0.5">Unread conversations</div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-[var(--color-stone)] pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('fresh')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'fresh'
                ? 'bg-[var(--color-teal)] text-white shadow-2xs'
                : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]/40'
            }`}
          >
            🔥 Hot Callbacks ({state?.fresh || 0})
          </button>
          <button
            onClick={() => setActiveTab('backlog')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'backlog'
                ? 'bg-[var(--color-teal)] text-white shadow-2xs'
                : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]/40'
            }`}
          >
            🌟 Known Past Clients ({state?.backlog_with_history || 0})
          </button>
          <button
            onClick={() => setActiveTab('quiet')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'quiet'
                ? 'bg-[var(--color-teal)] text-white shadow-2xs'
                : 'text-[var(--color-charcoal)] hover:bg-[var(--color-stone)]/40'
            }`}
          >
            💬 Gone Quiet ({state?.gone_quiet_total || 0})
          </button>
        </div>

        {/* Search & Tag Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search caller, project, tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded-lg border border-[var(--color-stone)] bg-white w-48 sm:w-56 focus:outline-none focus:border-[var(--color-teal)]"
            />
          </div>

          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg border border-[var(--color-stone)] bg-white text-[var(--color-charcoal)] focus:outline-none focus:border-[var(--color-teal)]"
          >
            <option value="all">All Intent Types</option>
            <option value="callback-requested">Callback Requested</option>
            <option value="commercial-bid">Commercial Bid</option>
            <option value="past-client">Past Client in KB</option>
            <option value="pending-only">Pending Action Only</option>
          </select>
        </div>
      </div>

      {/* Leads List */}
      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--color-charcoal-light)]">
          <RefreshCw className="size-5 animate-spin mx-auto mb-2 text-[var(--color-teal)]" />
          Loading GoHighLevel lead triage...
        </div>
      ) : filteredList.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-[var(--color-stone)] p-8">
          <CheckCircle2 className="size-8 text-emerald-600 mx-auto mb-2" />
          <h3 className="text-base font-bold text-[var(--color-charcoal)]">All Clear in this Lane!</h3>
          <p className="text-xs text-[var(--color-charcoal-light)] mt-1">
            No callers currently match the selected filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((lead, idx) => {
            const isCalled = lead.callback_status === 'called';
            const isTexted = lead.callback_status === 'texted';
            const isDismissed = lead.callback_status === 'dismissed';

            return (
              <div
                key={lead.phone || idx}
                className={`p-4 rounded-xl border bg-white shadow-2xs transition-all ${
                  isDismissed
                    ? 'opacity-40 border-slate-200'
                    : isCalled || isTexted
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-[var(--color-stone)] hover:border-[var(--color-teal)]/70'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  {/* Left Column: Caller identity & details */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-sm text-[var(--color-charcoal)]">
                        {idx + 1}. {lead.display}
                      </span>
                      {lead.phone && (
                        <span className="text-xs font-mono text-[var(--color-charcoal-light)]">
                          {lead.phone}
                        </span>
                      )}

                      {/* Age Pill */}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          lead.age_days <= 2
                            ? 'bg-rose-100 text-rose-800'
                            : lead.age_days <= 5
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        waiting {lead.age_days}d
                      </span>

                      {/* Unread Pill */}
                      {lead.unread > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800">
                          {lead.unread} unread
                        </span>
                      )}

                      {/* Opportunities */}
                      {lead.opps > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-800">
                          {lead.opps} pipeline opp{lead.opps > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Intent Tags */}
                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap my-1.5">
                        {lead.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* KB Past History Box */}
                    {lead.kb && (
                      <div className="mt-2 p-2.5 rounded-lg bg-purple-50/70 border border-purple-200 text-xs text-purple-950">
                        <div className="font-semibold flex items-center gap-1 mb-0.5 text-purple-900">
                          <UserCheck className="size-3.5 text-purple-700" />
                          <span>Known Past Client ({lead.kb.docs} records in Saddlewood emails)</span>
                        </div>
                        <div className="text-[11px] text-purple-800 leading-tight">
                          Last project contact: {lead.kb.last} · {lead.kb.subjects}
                        </div>
                      </div>
                    )}

                    {/* Last Inbound Message Snippet */}
                    {lead.snippet && (
                      <div className="mt-2 text-xs italic text-[var(--color-charcoal-light)] bg-slate-50 p-2 rounded border border-slate-100">
                        &quot;{lead.snippet}&quot;
                      </div>
                    )}

                    {/* Suggested SMS Draft Preview */}
                    {lead.suggested_sms && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-[var(--color-cream)]/50 border border-[var(--color-stone)] text-xs">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--color-charcoal)] mb-1">
                          <span className="flex items-center gap-1 text-[var(--color-teal)]">
                            <Sparkles className="size-3" />
                            AI-Drafted Response SMS
                          </span>
                          <button
                            onClick={() => copyToClipboard(lead.suggested_sms, lead.phone)}
                            className="text-[10px] text-slate-600 hover:text-[var(--color-teal)] flex items-center gap-1 underline cursor-pointer"
                          >
                            <Copy className="size-3" />
                            {copiedPhone === lead.phone ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-[11px] text-[var(--color-charcoal)] font-sans">
                          &quot;{lead.suggested_sms}&quot;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column: 1-Tap Action Center */}
                  <div className="flex flex-row md:flex-col gap-2 shrink-0 md:min-w-[170px] pt-1">
                    {/* Direct Dial Link */}
                    <a
                      href={lead.dial_url}
                      onClick={() => handleStatusChange(lead.phone, 'called')}
                      className="flex-1 md:flex-initial px-3 py-2 rounded-lg bg-[var(--color-teal)] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs hover:opacity-95 transition-all text-center"
                    >
                      <PhoneCall className="size-3.5" />
                      <span>1-Tap Call</span>
                    </a>

                    {/* 1-Tap SMS Link */}
                    <a
                      href={lead.sms_url}
                      onClick={() => handleStatusChange(lead.phone, 'texted')}
                      className="flex-1 md:flex-initial px-3 py-2 rounded-lg bg-white border border-[var(--color-teal)] text-[var(--color-teal)] text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs hover:bg-[var(--color-cream)]/30 transition-all text-center"
                    >
                      <MessageSquare className="size-3.5" />
                      <span>1-Tap SMS</span>
                    </a>

                    {/* Status Select */}
                    <select
                      value={lead.callback_status || 'pending'}
                      onChange={(e) =>
                        handleStatusChange(
                          lead.phone,
                          e.target.value as 'pending' | 'called' | 'texted' | 'dismissed'
                        )
                      }
                      className="px-2 py-1.5 rounded-lg border border-[var(--color-stone)] bg-white text-[11px] font-medium text-[var(--color-charcoal)] focus:outline-none focus:border-[var(--color-teal)]"
                    >
                      <option value="pending">⏳ Pending Callback</option>
                      <option value="called">✅ Spoke / Called</option>
                      <option value="texted">💬 Texted Reply</option>
                      <option value="dismissed">🚫 Dismiss / Vendor</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

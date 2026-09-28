'use client';

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  ShoppingBag,
  Users,
  Building,
  Tag,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Smartphone,
  Mail,
  Globe,
  Filter,
} from 'lucide-react';
import type {
  AccountingDashboardState,
  ExpenseCategory,
  ExpenseItem,
} from '@/lib/expenses/types';

const CATEGORIES: ExpenseCategory[] = [
  'Materials',
  'Subcontractor',
  'Labor',
  'Equipment & Tools',
  'Permits & Fees',
  'Fuel & Travel',
  'Office & Overhead',
  'Other',
];

export default function ExpensesPortalPage() {
  const [data, setData] = useState<AccountingDashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'purchases' | 'labor' | 'history'>('pending');
  const [selectedProjects, setSelectedProjects] = useState<Record<string, string>>({});
  const [selectedTypes, setSelectedTypes] = useState<Record<string, string>>({});
  const [customProjects, setCustomProjects] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchState = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/expenses');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load expenses state', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCategorize = async (item: ExpenseItem) => {
    const chosenProject = showCustomInput[item.id]
      ? customProjects[item.id]
      : selectedProjects[item.id];
    const chosenType = selectedTypes[item.id];

    if (!chosenProject) {
      showToast('Please select or enter a Project', 'error');
      return;
    }
    if (!chosenType) {
      showToast('Please select an Expense Category', 'error');
      return;
    }

    setProcessingId(item.id);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'categorize',
          id: item.id,
          n: item.n,
          project: chosenProject,
          expenseType: chosenType,
          via: 'portal',
        }),
      });

      if (res.ok) {
        // Optimistically update
        setData((prev) => {
          if (!prev) return prev;
          const nextExpenses = prev.expenses.map((e) =>
            e.id === item.id
              ? {
                  ...e,
                  status: 'categorized' as const,
                  project: chosenProject,
                  expenseType: chosenType,
                  decidedAt: new Date().toISOString(),
                  clearedVia: 'portal' as const,
                }
              : e
          );
          return { ...prev, expenses: nextExpenses };
        });
        const label = (item.source === 'receipt' ? 'R' : 'Z') + item.n;
        showToast(`✅ ${label} tagged as ${chosenType} for ${chosenProject}. Cleared!`);
      } else {
        const err = await res.json();
        showToast(`Failed: ${err.error || 'Server error'}`, 'error');
      }
    } catch {
      showToast('Network error while saving expense', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismiss = async (item: ExpenseItem) => {
    setProcessingId(item.id);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dismiss',
          id: item.id,
          n: item.n,
          via: 'portal',
        }),
      });

      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          const nextExpenses = prev.expenses.map((e) =>
            e.id === item.id
              ? {
                  ...e,
                  status: 'dismissed' as const,
                  decidedAt: new Date().toISOString(),
                  clearedVia: 'portal' as const,
                }
              : e
          );
          return { ...prev, expenses: nextExpenses };
        });
        const label = (item.source === 'receipt' ? 'R' : 'Z') + item.n;
        showToast(`👍 ${label} dismissed (cleared across text, email & portal)`);
      } else {
        const err = await res.json();
        showToast(`Failed: ${err.error || 'Server error'}`, 'error');
      }
    } catch {
      showToast('Network error while dismissing expense', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const pendingExpenses = data?.expenses.filter((e) => e.status === 'pending') || [];
  const clearedExpenses = data?.expenses.filter((e) => e.status !== 'pending') || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:px-8 md:py-10 pb-24 md:pb-12 text-[var(--color-charcoal)]">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
              : 'bg-rose-900 text-rose-100 border-rose-700'
          }`}
        >
          {notification.text}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs uppercase tracking-wider font-semibold text-[var(--color-gold-accessible)]">
            Accounting System
          </span>
          <span className="text-xs bg-[var(--color-stone)]/40 px-2 py-0.5 rounded-full text-stone-600">
            Bidirectional Sync
          </span>
        </div>
        <h1
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-3xl md:text-4xl text-[var(--color-charcoal)] tracking-tight"
        >
          Expenses & Project Tracking
        </h1>
        <p className="text-sm md:text-base text-[var(--color-charcoal-light)] mt-1.5 leading-relaxed">
          Tag weekly Zelle disbursements to projects, review material purchases, and monitor crew labor hours from Buildertrend. Any clearance here updates text & email digests in real time.
        </p>
      </div>

      {/* Quick Metric Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-[var(--color-stone)] rounded-xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-charcoal-light)] mb-1">
            <span>Pending Zelle</span>
            <Clock className="size-3.5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--color-charcoal)]">
            {pendingExpenses.length}
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-0.5">
            Needs Project Tag
          </div>
        </div>

        <div className="bg-white border border-[var(--color-stone)] rounded-xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-charcoal-light)] mb-1">
            <span>Weekly Spend</span>
            <ShoppingBag className="size-3.5 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-[var(--color-charcoal)]">
            ${data?.weeklyPurchases.totalSpend ? Math.round(data.weeklyPurchases.totalSpend).toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-teal-700 font-medium mt-0.5">
            {data?.weeklyPurchases.count || 0} Receipts
          </div>
        </div>

        <div className="bg-white border border-[var(--color-stone)] rounded-xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--color-charcoal-light)] mb-1">
            <span>Crew Hours</span>
            <Users className="size-3.5 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-[var(--color-charcoal)]">
            {data?.weeklyLabor.totalHours || 0}
          </div>
          <div className="text-[11px] text-indigo-700 font-medium mt-0.5">
            Buildertrend Total
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-stone)] mb-6 overflow-x-auto scrollbar-none gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'pending'
              ? 'border-[var(--color-teal)] text-[var(--color-teal)] font-semibold'
              : 'border-transparent text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
          }`}
        >
          <Clock className="size-4" />
          <span>Pending Review</span>
          {pendingExpenses.length > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pendingExpenses.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('purchases')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'purchases'
              ? 'border-[var(--color-teal)] text-[var(--color-teal)] font-semibold'
              : 'border-transparent text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
          }`}
        >
          <ShoppingBag className="size-4" />
          <span>Weekly Purchases</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('labor')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'labor'
              ? 'border-[var(--color-teal)] text-[var(--color-teal)] font-semibold'
              : 'border-transparent text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
          }`}
        >
          <Users className="size-4" />
          <span>Buildertrend Labor</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'history'
              ? 'border-[var(--color-teal)] text-[var(--color-teal)] font-semibold'
              : 'border-transparent text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]'
          }`}
        >
          <CheckCircle2 className="size-4" />
          <span>Cleared / History</span>
          <span className="text-xs text-stone-400">({clearedExpenses.length})</span>
        </button>
      </div>

      {/* Content Sections */}
      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--color-charcoal-light)] flex flex-col items-center gap-2">
          <RefreshCw className="size-6 animate-spin text-[var(--color-teal)]" />
          <span>Syncing accounting state...</span>
        </div>
      ) : activeTab === 'pending' ? (
        <div className="flex flex-col gap-4">
          {pendingExpenses.length === 0 ? (
            <div className="bg-white border border-[var(--color-stone)] rounded-2xl p-8 text-center">
              <CheckCircle2 className="size-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-[var(--color-charcoal)]">
                All Zelle Expenses Cleared!
              </h3>
              <p className="text-sm text-[var(--color-charcoal-light)] max-w-sm mx-auto mt-1">
                No disbursements waiting for project classification. New transactions detected via Chase alerts or text will appear here automatically.
              </p>
            </div>
          ) : (
            pendingExpenses.map((item) => {
              const isBusy = processingId === item.id;
              const currentProject = showCustomInput[item.id]
                ? customProjects[item.id]
                : selectedProjects[item.id];
              const currentType = selectedTypes[item.id];
              const isReadyToSave = Boolean(currentProject && currentType);

              return (
                <div
                  key={item.id}
                  className="bg-white border border-[var(--color-stone)] rounded-2xl p-4 md:p-5 shadow-xs hover:border-[var(--color-teal)]/40 transition-all"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            item.source === 'receipt'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.source === 'receipt' ? `R${item.n}` : `Z${item.n}`}
                        </span>
                        <h2 className="text-base md:text-lg font-bold text-[var(--color-charcoal)]">
                          {item.recipient}
                        </h2>
                        {item.source === 'receipt' && (
                          <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <span>🧾 Store Receipt</span>
                          </span>
                        )}
                        {item.receiptUrl && (
                          <a
                            href={item.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[var(--color-teal)] hover:underline font-medium inline-flex items-center gap-0.5"
                          >
                            <span>View Scan ↗</span>
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-charcoal-light)] mt-0.5">
                        {item.date} · {item.notes || (item.source === 'receipt' ? 'Paper Receipt Scan' : 'Chase Zelle')}
                        {item.memo && (
                          <span className="ml-1.5 italic font-medium text-stone-700">
                            &ldquo;{item.memo}&rdquo;
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl md:text-2xl font-bold text-stone-900 tabular-nums">
                        ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                        {item.source === 'receipt' ? 'Counter Receipt' : 'Disbursement'}
                      </span>
                    </div>
                  </div>

                  {/* Step 1: Project Selection */}
                  <div className="mb-3 pt-2 border-t border-stone-100">
                    <label className="block text-[11px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">
                      1. Assign Project
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {data?.activeProjects.map((proj) => {
                        const isSelected = selectedProjects[item.id] === proj && !showCustomInput[item.id];
                        return (
                          <button
                            key={proj}
                            type="button"
                            onClick={() => {
                              setSelectedProjects((prev) => ({ ...prev, [item.id]: proj }));
                              setShowCustomInput((prev) => ({ ...prev, [item.id]: false }));
                            }}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                              isSelected
                                ? 'bg-[var(--color-teal)] text-white border-[var(--color-teal)] shadow-xs'
                                : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {proj}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomInput((prev) => ({ ...prev, [item.id]: true }));
                        }}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                          showCustomInput[item.id]
                            ? 'bg-[var(--color-teal)] text-white border-[var(--color-teal)] shadow-xs'
                            : 'bg-stone-50 text-stone-600 border-dashed border-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        + Other Project
                      </button>
                    </div>

                    {showCustomInput[item.id] && (
                      <input
                        type="text"
                        placeholder="Type job name or address..."
                        value={customProjects[item.id] || ''}
                        onChange={(e) =>
                          setCustomProjects((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="mt-2 w-full text-xs px-3 py-2 border rounded-lg border-stone-300 focus:outline-none focus:ring-1 focus:ring-[var(--color-teal)]"
                      />
                    )}
                  </div>

                  {/* Step 2: Expense Type Selection */}
                  <div className="mb-4">
                    <label className="block text-[11px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">
                      2. Expense Category
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORIES.map((cat) => {
                        const isSelected = selectedTypes[item.id] === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedTypes((prev) => ({ ...prev, [item.id]: cat }))}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                              isSelected
                                ? 'bg-stone-800 text-white border-stone-800 shadow-xs'
                                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-stone-100 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDismiss(item)}
                      className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors"
                    >
                      Dismiss (Personal / Ignore)
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || !isReadyToSave}
                      onClick={() => handleCategorize(item)}
                      className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all ${
                        isReadyToSave && !isBusy
                          ? 'bg-[var(--color-teal)] text-white hover:opacity-90 shadow-sm cursor-pointer'
                          : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      }`}
                    >
                      {isBusy ? (
                        <>
                          <RefreshCw className="size-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          <span>Save & Clear {(item.source === 'receipt' ? 'R' : 'Z') + item.n}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : activeTab === 'purchases' ? (
        /* Weekly Purchases */
        <div className="flex flex-col gap-6">
          <div className="bg-stone-50 border border-[var(--color-stone)] rounded-xl p-4 text-xs leading-relaxed text-stone-600 flex items-start gap-2">
            <ShoppingBag className="size-4 text-[var(--color-teal)] shrink-0 mt-0.5" />
            <div>
              <b className="font-semibold text-stone-800">Weekly Materials & Vendor Tracking:</b> Automatically synced from Home Depot PRO purchase reports and email receipt parsing (Lowe&apos;s, Floor &amp; Decor, Central Arizona Supply).
            </div>
          </div>

          {Object.entries(data?.weeklyPurchases.byProject || {}).map(([projectName, summary]) => (
            <div
              key={projectName}
              className="bg-white border border-[var(--color-stone)] rounded-2xl overflow-hidden shadow-xs"
            >
              <div className="bg-stone-50/80 px-4 py-3 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm md:text-base text-stone-900">
                    {projectName}
                  </h3>
                  <span className="text-xs text-stone-500">
                    {summary.count} line items / receipts
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base md:text-lg font-bold text-teal-800">
                    ${summary.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                    Project Total
                  </div>
                </div>
              </div>

              <div className="divide-y divide-stone-100">
                {summary.items.map((line) => (
                  <div key={line.id} className="p-3.5 flex items-start justify-between gap-3 text-xs">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900">{line.vendor}</span>
                        <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
                          {line.category}
                        </span>
                      </div>
                      <p className="text-stone-600 mt-1 leading-snug">{line.description}</p>
                      <span className="text-[11px] text-stone-400 mt-0.5 block">{line.date}</span>
                    </div>
                    <div className="font-bold text-stone-900 text-sm tabular-nums whitespace-nowrap">
                      ${line.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'labor' ? (
        /* Buildertrend Labor */
        <div className="flex flex-col gap-6">
          <div className="bg-stone-50 border border-[var(--color-stone)] rounded-xl p-4 text-xs leading-relaxed text-stone-600 flex items-start gap-2">
            <Users className="size-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <b className="font-semibold text-stone-800">Buildertrend Labor Tracking:</b> Live crew hours registered on jobsites. Hours are reported point-in-time from employee timecard punches and weekly job snapshots.
            </div>
          </div>

          {Object.entries(data?.weeklyLabor.byProject || {}).map(([projectName, projLabor]) => (
            <div
              key={projectName}
              className="bg-white border border-[var(--color-stone)] rounded-2xl overflow-hidden shadow-xs"
            >
              <div className="bg-stone-50/80 px-4 py-3 border-b border-stone-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm md:text-base text-stone-900">
                    {projectName}
                  </h3>
                  <span className="text-xs text-stone-500">
                    {projLabor.employees.length} crew members active
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base md:text-lg font-bold text-indigo-900">
                    {projLabor.totalHours.toFixed(1)} hrs
                  </span>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
                    Weekly Total
                  </div>
                </div>
              </div>

              <div className="divide-y divide-stone-100">
                {projLabor.employees.map((emp) => (
                  <div key={emp.name} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center font-bold text-indigo-700 text-xs">
                        {emp.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <span className="font-semibold text-stone-900">{emp.name}</span>
                        <div className="text-[11px] text-stone-400">
                          {emp.regularHours} regular {emp.overtimeHours > 0 ? `+ ${emp.overtimeHours} OT` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-stone-900 text-sm tabular-nums">
                        {emp.totalHours.toFixed(1)} hrs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* History */
        <div className="flex flex-col gap-3">
          {clearedExpenses.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-10">No cleared expenses yet.</p>
          ) : (
            clearedExpenses.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-stone-200 rounded-xl p-3.5 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-stone-800 text-sm">
                      {(item.source === 'receipt' ? 'R' : 'Z') + item.n} · {item.recipient}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.status === 'dismissed'
                          ? 'bg-stone-100 text-stone-600'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {item.status === 'dismissed' ? 'Dismissed' : 'Categorized'}
                    </span>
                    {item.source === 'receipt' && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                        🧾 Receipt
                      </span>
                    )}
                    {item.receiptUrl && (
                      <a
                        href={item.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[var(--color-teal)] hover:underline font-medium inline-flex items-center gap-0.5"
                      >
                        <span>Scan ↗</span>
                      </a>
                    )}
                  </div>
                  <p className="text-stone-500 mt-0.5">
                    {item.status === 'categorized' ? (
                      <>
                        Tagged to <b className="text-stone-700">{item.project}</b> ({item.expenseType})
                      </>
                    ) : (
                      'Non-project expense / dismissed'
                    )}
                    {item.clearedVia && (
                      <span className="ml-2 text-stone-400">
                        via {item.clearedVia === 'portal' ? '🌐 Portal' : item.clearedVia === 'text' ? '📱 Text' : '📧 Email'}
                      </span>
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <div className="font-bold text-stone-900 text-sm">
                    ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-stone-400">{item.date}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

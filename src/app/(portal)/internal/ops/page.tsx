import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  DollarSign,
  FileText,
  Scale,
  Sparkles,
  Layers,
  Building,
  CheckCircle2,
  Users,
  PhoneCall,
} from 'lucide-react';

import OpsBoard from '@/components/ops/OpsBoard';
import OpsSubnav from '@/components/ops/OpsSubnav';
import { OPS_DOCS } from '@/content/ops/docs.generated';
import { listCards } from '@/lib/ops/queries';
import { OPS_DEPARTMENTS, inferCardDepartment, type OpsCard } from '@/lib/ops/types';
import { getAccountingState } from '@/lib/expenses/store';
import { getContractsState } from '@/lib/contracts/store';
import { getLeadsState } from '@/lib/leads/store';
import { countPendingEstimates } from '@/lib/estimates/queries';

// Auth is enforced by the (portal)/internal layout: only allowlisted emails
// reach this page. The board's first paint comes from the server so the page
// is never an empty shell; moves and adds go through /api/ops/cards.

export const dynamic = 'force-dynamic';

const GROUP_ORDER = ['Operating model', 'Roles', 'SOPs', 'Crew guides', 'Jobs'];

const DEPT_INFO: Record<string, { lead: string; focus: string; color: string }> = {
  Sales: { lead: 'Marco', focus: 'Lead intake, client qualification, bid proposals', color: '#1d4ed8' },
  Marketing: { lead: 'Marco & Lando', focus: 'Brand, portfolio showcase, organic reputation', color: '#be185d' },
  'Project Management': { lead: 'Eli & Lando', focus: 'Submittals, schedules, material staging, zero verbal COs', color: '#047857' },
  Accounting: { lead: 'Ilene', focus: 'Twice-monthly progress billing, Zelle project tagging, payroll', color: '#8f6c18' },
  Legal: { lead: 'Lando & Marco', focus: 'Contract drafting, HVAC defect carve-outs, 1.5% late terms, 20-day liens', color: '#6d28d9' },
  HR: { lead: 'Ilene', focus: 'Trade partner compliance, W-9s, insurance, recruiting', color: '#c2410c' },
  'Field Operations': { lead: 'Eli & Marco', focus: 'Framing & drywall execution, QA/QC, jobsite clean', color: '#182828' },
  Training: { lead: 'Eli', focus: 'Apprentice curriculum, framing speed drills, tool standards', color: '#0f766e' },
  IT: { lead: 'Lando', focus: 'Autonomous agents, iMessage bot, mobile portal, telemetry', color: '#4338ca' },
};

export default async function OpsPage() {
  let cards: OpsCard[] = [];
  let loadError: string | null = null;
  try {
    cards = await listCards();
  } catch (e) {
    loadError = (e as Error).message;
  }

  // Load Executive Action Inbox metrics
  let pendingExpensesCount = 0;
  let pendingContractsCount = 0;
  let pendingEstimatesCount = 0;

  try {
    const acctState = await getAccountingState();
    pendingExpensesCount = acctState.expenses.filter((e) => e.status === 'pending').length;
  } catch {
    // fallback
  }

  try {
    const cntState = await getContractsState();
    pendingContractsCount = cntState.contracts.filter(
      (c) => c.status === 'draft' || c.status === 'under_review'
    ).length;
  } catch {
    // fallback
  }

  try {
    pendingEstimatesCount = await countPendingEstimates();
  } catch {
    // fallback
  }

  let freshLeadsCount = 0;
  try {
    const lState = await getLeadsState();
    freshLeadsCount = lState.fresh || 0;
  } catch {
    // fallback
  }

  const docTitles = Object.fromEntries(OPS_DOCS.map((d) => [d.slug, d.title]));

  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    docs: OPS_DOCS.filter((d) => d.group === g),
  })).filter((g) => g.docs.length > 0);

  const totalActionItems = pendingExpensesCount + pendingContractsCount + pendingEstimatesCount + freshLeadsCount;

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-10 max-w-6xl mx-auto">
      <p
        className="text-[11px] tracking-[0.14em] uppercase mb-2"
        style={{ color: 'var(--color-gold-accessible)' }}
      >
        Autonomous Multi-Department Operations · September 2026
      </p>
      <h1
        style={{ fontFamily: 'var(--font-fraunces)' }}
        className="text-3xl md:text-4xl mb-3 text-[var(--color-charcoal)]"
      >
        How Saddlewood runs
      </h1>
      <p className="max-w-2xl text-[15px] leading-relaxed mb-6" style={{ color: 'var(--color-charcoal-light)' }}>
        Every system and department has an autonomous head, clear written rules, and equal visibility.
        The executive action inbox highlights decisions waiting on owners; the 9-department Kanban keeps every division expanding in lockstep.
      </p>

      {/* EXECUTIVE ACTION INBOX ("Decisions Waiting on You") */}
      <section className="mb-8 p-5 rounded-2xl border border-[var(--color-stone)] bg-gradient-to-br from-white to-[var(--color-cream)]/70 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[var(--color-teal)] text-white">
              <Sparkles className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[var(--color-charcoal)]">Executive Action Inbox</h2>
              <p className="text-xs text-[var(--color-charcoal-light)]">
                {totalActionItems > 0
                  ? `${totalActionItems} item(s) currently require owner decisions or sign-off`
                  : 'All operational items cleared across text, email & portal ✅'}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-white border border-[var(--color-stone)] text-[var(--color-charcoal)]">
            Autonomous Two-Tier Model
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* CRM Leads Action Item */}
          <Link
            href="/internal/leads"
            className="p-3.5 rounded-xl border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                  <PhoneCall className="size-3.5" />
                  CRM & Leads
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold font-mono ${
                    freshLeadsCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {freshLeadsCount}
                </span>
              </div>
              <div className="text-sm font-semibold text-[var(--color-charcoal)]">
                Inbound Calls Waiting
              </div>
              <p className="text-[11px] text-[var(--color-charcoal-light)] mt-1">
                GoHighLevel callers awaiting phone callbacks and AI SMS replies.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-[var(--color-teal)] mt-3 group-hover:translate-x-0.5 transition-transform">
              <span>Open Queue</span>
              <ArrowRight className="size-3.5 ml-1" />
            </div>
          </Link>
          {/* Contracts Action Item */}
          <Link
            href="/internal/contracts"
            className="p-3.5 rounded-xl border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                  <Scale className="size-3.5" />
                  Legal & Risk
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold font-mono ${
                    pendingContractsCount > 0 ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {pendingContractsCount}
                </span>
              </div>
              <div className="text-sm font-semibold text-[var(--color-charcoal)]">
                Agreements Awaiting Review
              </div>
              <p className="text-[11px] text-[var(--color-charcoal-light)] mt-1">
                Prime contracts & sub agreements with equipment carve-outs & late penalties.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-[var(--color-teal)] mt-3 group-hover:translate-x-0.5 transition-transform">
              <span>Open Contracts</span>
              <ArrowRight className="size-3.5 ml-1" />
            </div>
          </Link>

          {/* Expenses Action Item */}
          <Link
            href="/internal/expenses"
            className="p-3.5 rounded-xl border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                  <DollarSign className="size-3.5" />
                  Accounting
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold font-mono ${
                    pendingExpensesCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {pendingExpensesCount}
                </span>
              </div>
              <div className="text-sm font-semibold text-[var(--color-charcoal)]">
                Zelle Tagging & Clearance
              </div>
              <p className="text-[11px] text-[var(--color-charcoal-light)] mt-1">
                Disbursements from Chase needing project tagging or dismissal.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-[var(--color-teal)] mt-3 group-hover:translate-x-0.5 transition-transform">
              <span>Open Expenses</span>
              <ArrowRight className="size-3.5 ml-1" />
            </div>
          </Link>

          {/* Estimating / Sales Action Item */}
          <Link
            href="/internal?tab=pending"
            className="p-3.5 rounded-xl border border-[var(--color-stone)] bg-white hover:border-[var(--color-teal)] shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                  <FileText className="size-3.5" />
                  Sales & Takeoffs
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold font-mono ${
                    pendingEstimatesCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {pendingEstimatesCount}
                </span>
              </div>
              <div className="text-sm font-semibold text-[var(--color-charcoal)]">
                Estimates Awaiting Sign-Off
              </div>
              <p className="text-[11px] text-[var(--color-charcoal-light)] mt-1">
                Bids and takeoffs prepared by estimator bot awaiting final owner pricing.
              </p>
            </div>
            <div className="flex items-center text-xs font-semibold text-[var(--color-teal)] mt-3 group-hover:translate-x-0.5 transition-transform">
              <span>Review Bids</span>
              <ArrowRight className="size-3.5 ml-1" />
            </div>
          </Link>
        </div>
      </section>

      {/* 9-DEPARTMENT SADDLEWOOD STRUCTURE */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2
            style={{ fontFamily: 'var(--font-fraunces)' }}
            className="text-xl md:text-2xl text-[var(--color-charcoal)]"
          >
            9-Department Operating Architecture
          </h2>
          <span className="text-xs text-[var(--color-charcoal-light)]">
            Balanced expansion roadmap
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {OPS_DEPARTMENTS.map((dept) => {
            const info = DEPT_INFO[dept] || { lead: 'Team', focus: 'Operations', color: '#182828' };
            const deptCards = cards.filter((c) => (c.dept || inferCardDepartment(c)) === dept);
            return (
              <div
                key={dept}
                className="p-3 rounded-lg border border-[var(--color-stone)] bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[var(--color-charcoal)]">{dept}</span>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.2 rounded-full"
                      style={{ backgroundColor: `${info.color}15`, color: info.color }}
                    >
                      {deptCards.length} tasks
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--color-charcoal-light)] mt-0.5 line-clamp-1">
                    {info.focus}
                  </div>
                </div>
                <div className="text-[10px] text-[var(--color-gold-accessible)] font-medium mt-2">
                  Lead: {info.lead}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <OpsSubnav />

      {/* OPS KANBAN BOARD */}
      <section aria-labelledby="ops-board-heading" className="mb-12">
        <h2
          id="ops-board-heading"
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-2xl mb-3 text-[var(--color-charcoal)]"
        >
          Ops board
        </h2>
        {loadError ? (
          <p className="text-sm rounded border px-4 py-3" style={{ borderColor: 'var(--color-stone)', color: 'var(--color-charcoal)' }}>
            The board could not load its cards. {loadError}
          </p>
        ) : (
          <OpsBoard initialCards={cards} docTitles={docTitles} />
        )}
      </section>

      {/* OPERATIONS DOCUMENTS & RULES */}
      <section aria-labelledby="ops-docs-heading">
        <h2
          id="ops-docs-heading"
          style={{ fontFamily: 'var(--font-fraunces)' }}
          className="text-2xl mb-4 text-[var(--color-charcoal)]"
        >
          Documents & Written Rules
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.name}>
              <h3 className="text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: 'var(--color-gold-accessible)', fontFamily: 'var(--font-sans)' }}>
                {g.name}
              </h3>
              <ul className="flex flex-col divide-y rounded border" style={{ borderColor: 'var(--color-stone)' }}>
                {g.docs.map((d) => (
                  <li key={d.slug} style={{ borderColor: 'var(--color-stone)' }}>
                    <Link
                      href={`/internal/ops/docs/${d.slug}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-[var(--color-cream)] transition-colors"
                      style={{ color: 'var(--color-charcoal)' }}
                    >
                      <span>{d.title}</span>
                      {d.status && (
                        <span
                          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.08em]"
                          style={
                            d.status.toUpperCase().startsWith('APPROVED')
                              ? { backgroundColor: 'rgba(47,107,74,0.14)', color: '#2f6b4a' }
                              : { backgroundColor: 'rgba(212,175,55,0.18)', color: 'var(--color-gold-accessible)' }
                          }
                        >
                          {d.status}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

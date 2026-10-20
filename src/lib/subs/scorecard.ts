import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadPayables } from "@/lib/accounting/payables";
import { phoenixToday } from "@/lib/sales/access";
import { snapshotHash } from "@/lib/sales/signing";
import type { Policies } from "@/lib/policies/rules";
import { coiDaysLeft, readiness } from "./rules";
import { listSubs, type InviteRowView, type PackageDetail } from "./store";
import type { Sub, SubStatus } from "./types";

// Subcontractor Scorecard (S1), Compliance Register (S8), Frozen Work Order /
// Subcontract (S7), and Award / Thank-You Email Drafts (S6) per SOP-008.

export type CoiState = "ok" | "expiring_30d" | "expired" | "missing";

export type SubScorecard = {
  subId: string;
  name: string;
  status: SubStatus;
  trades: string[];
  rocLicense: string;
  // Compliance (S8)
  coiExpiresOn: string | null;
  coiDaysLeft: number | null;
  coiState: CoiState;
  w9OnFile: boolean;
  msaSignedOn: string | null;
  rocVerified: boolean;
  achConfirmed: boolean;
  readyToMobilize: boolean;
  missing: string[];
  // Scorecard (S1)
  invitedCount: number;
  submittedCount: number;
  declinedCount: number;
  awardedCount: number;
  responseRatePct: number | null;
  hitRatePct: number | null;
  openBillsCount: number;
  openBillsCents: number;
  heldBillsCount: number;
  punchOpenCount: number;
};

export type ComplianceSummary = {
  totalSubs: number;
  readyCount: number;
  expiredOrMissingCoiCount: number;
  expiring30dCoiCount: number;
  missingW9OrMsaCount: number;
};

export function classifyCoi(coiExpiresOn: string | null, today: string): { daysLeft: number | null; state: CoiState } {
  const days = coiDaysLeft(coiExpiresOn, today);
  if (days === null) return { daysLeft: null, state: "missing" };
  if (days < 0) return { daysLeft: days, state: "expired" };
  if (days <= 30) return { daysLeft: days, state: "expiring_30d" };
  return { daysLeft: days, state: "ok" };
}

export function computeSubScorecards(
  subs: Sub[],
  invites: { sub_id: string; status: string }[],
  bills: { vendorName: string; balanceCents: number; status: string }[],
  openPunchByAssignee: Map<string, number>,
  today: string,
): { scorecards: SubScorecard[]; summary: ComplianceSummary } {
  const invitesBySub = new Map<string, { status: string }[]>();
  for (const inv of invites) {
    if (inv.status === "withdrawn") continue;
    const list = invitesBySub.get(inv.sub_id) ?? [];
    list.push(inv);
    invitesBySub.set(inv.sub_id, list);
  }

  const scorecards: SubScorecard[] = subs.map((s) => {
    const r = readiness(s, today);
    const coi = classifyCoi(s.coiExpiresOn, today);
    const myInvites = invitesBySub.get(s.id) ?? [];
    const invitedCount = myInvites.length;
    const submittedCount = myInvites.filter((i) => i.status === "submitted" || i.status === "awarded" || i.status === "not_awarded").length;
    const declinedCount = myInvites.filter((i) => i.status === "declined").length;
    const awardedCount = myInvites.filter((i) => i.status === "awarded").length;
    const responseRatePct = invitedCount > 0 ? Math.round(((submittedCount + declinedCount) / invitedCount) * 100) : null;
    const hitRatePct = submittedCount > 0 ? Math.round((awardedCount / submittedCount) * 100) : null;

    const lowerName = s.name.toLowerCase();
    const myBills = bills.filter((b) => b.vendorName.toLowerCase() === lowerName && b.balanceCents > 0);
    const openBillsCount = myBills.length;
    const openBillsCents = myBills.reduce((acc, b) => acc + b.balanceCents, 0);
    const heldBillsCount = myBills.filter((b) => b.status === "hold").length;

    let punchOpenCount = 0;
    for (const [assignee, count] of openPunchByAssignee.entries()) {
      if (assignee.toLowerCase().includes(lowerName) || s.trades.some((t) => assignee.toLowerCase().includes(t.toLowerCase()))) {
        punchOpenCount += count;
      }
    }

    return {
      subId: s.id,
      name: s.name,
      status: s.status,
      trades: s.trades,
      rocLicense: s.rocLicense,
      coiExpiresOn: s.coiExpiresOn,
      coiDaysLeft: coi.daysLeft,
      coiState: coi.state,
      w9OnFile: s.w9OnFile,
      msaSignedOn: s.msaSignedOn,
      rocVerified: Boolean(s.rocVerifiedAt),
      achConfirmed: Boolean(s.achConfirmedAt),
      readyToMobilize: r.ready,
      missing: r.missing,
      invitedCount,
      submittedCount,
      declinedCount,
      awardedCount,
      responseRatePct,
      hitRatePct,
      openBillsCount,
      openBillsCents,
      heldBillsCount,
      punchOpenCount,
    };
  });

  const activeSubs = scorecards.filter((s) => s.status !== "inactive");
  const summary: ComplianceSummary = {
    totalSubs: activeSubs.length,
    readyCount: activeSubs.filter((s) => s.readyToMobilize).length,
    expiredOrMissingCoiCount: activeSubs.filter((s) => s.coiState === "expired" || s.coiState === "missing").length,
    expiring30dCoiCount: activeSubs.filter((s) => s.coiState === "expiring_30d").length,
    missingW9OrMsaCount: activeSubs.filter((s) => !s.w9OnFile || !s.msaSignedOn).length,
  };

  return { scorecards, summary };
}

export async function loadSubScorecards(today = phoenixToday()): Promise<{ subs: Sub[]; scorecards: SubScorecard[]; summary: ComplianceSummary }> {
  const db = getSupabaseAdmin();
  const [subs, invitesRes, payables, punchRes] = await Promise.all([
    listSubs(),
    db.from("bid_invites").select("sub_id, status").limit(5000),
    loadPayables(today).catch(() => ({ rows: [], summary: { openCents: 0, overdueCents: 0, dueThisWeekCents: 0, holdCount: 0 } })),
    db.from("job_punch_items").select("assignee, status").eq("status", "open").limit(2000),
  ]);
  const openPunchByAssignee = new Map<string, number>();
  if (!punchRes.error && punchRes.data) {
    for (const p of punchRes.data as { assignee: string; status: string }[]) {
      const key = (p.assignee ?? "").trim();
      if (!key) continue;
      openPunchByAssignee.set(key, (openPunchByAssignee.get(key) ?? 0) + 1);
    }
  }
  const invites = ((invitesRes.data ?? []) as { sub_id: string; status: string }[]);
  const bills = payables.rows.map((r) => ({ vendorName: r.vendorName, balanceCents: r.balanceCents, status: r.status }));
  const { scorecards, summary } = computeSubScorecards(subs, invites, bills, openPunchByAssignee, today);
  return { subs, scorecards, summary };
}

// ---- Frozen Work Order / Subcontract (S7) & Award / Thank-you Drafts (S6) --------

export type WorkOrderLine = {
  id: string;
  description: string;
  qty: number | null;
  unit: string;
  subCents: number | null;
};

export type WorkOrderView = {
  woNumber: string;
  packageId: string;
  inviteId: string;
  subId: string;
  subName: string;
  contactName: string;
  contactEmail: string;
  rocLicense: string;
  jobName: string;
  jobAddress: string;
  trade: string;
  title: string;
  scope: string;
  lines: WorkOrderLine[];
  inclusions: string;
  exclusions: string;
  deviations: string;
  headlineCents: number;
  leveledCents: number;
  workFrom: string | null;
  workTo: string | null;
  startOn: string | null;
  duration: string;
  terms: string;
  retainagePct: number;
  waiverRule: string;
  coiRule: string;
  awardedAt: string | null;
  awardedBy: string;
  signerName: string;
  signerTitle: string;
  bidRevision: number;
  bidFingerprint: string;
  workOrderHash: string;
  mobilizationGate: {
    canMobilize: boolean;
    blockers: string[];
  };
};

export type EmailDraftView = {
  kind: "award" | "thanks";
  inviteId: string;
  subName: string;
  to: string;
  subject: string;
  body: string;
};

function usdText(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "team";
}

export function buildWorkOrder(
  detail: PackageDetail,
  subFullById: Map<string, Sub>,
  policies: Policies,
  today: string,
): WorkOrderView | null {
  const { pkg, job, invites, leveling } = detail;
  if (pkg.status !== "awarded" || !pkg.awardedInviteId) return null;
  const win = invites.find((i: InviteRowView) => i.id === pkg.awardedInviteId);
  if (!win || !win.latest) return null;
  const lv = leveling.bids.find((b) => b.inviteId === win.id);
  const fullSub = subFullById.get(win.subId);
  const r = readiness(win.sub, today);

  const streetPrefix = /^\s*(\d{1,6})\b/.exec(job.address || job.name)?.[1] ?? pkg.id.slice(0, 4).toUpperCase();
  const tradeCode = pkg.trade.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "SUB";
  const woNumber = `WO-${streetPrefix}-${tradeCode}`;

  const lines: WorkOrderLine[] = pkg.lines.map((l) => {
    const bidLine = win.latest!.lines.find((bl) => bl.lineId === l.id);
    return {
      id: l.id,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      subCents: bidLine?.cents ?? null,
    };
  });

  const retainagePct = typeof policies["policy.subs.retainagePct"] === "number" ? (policies["policy.subs.retainagePct"] as number) : 10;
  const headlineCents = lv?.headlineCents ?? win.latest.totalCents;
  const leveledCents = lv?.leveledCents ?? win.latest.totalCents;

  const payload = {
    woNumber,
    packageId: pkg.id,
    inviteId: win.id,
    subName: win.sub.name,
    jobName: job.name,
    jobAddress: job.address,
    trade: pkg.trade,
    lines,
    headlineCents,
    leveledCents,
    bidRevision: win.latest.revision,
    bidFingerprint: win.latest.fingerprint,
  };

  return {
    woNumber,
    packageId: pkg.id,
    inviteId: win.id,
    subId: win.subId,
    subName: win.sub.name,
    contactName: win.contactName,
    contactEmail: win.contactEmail,
    rocLicense: fullSub?.rocLicense || "On file",
    jobName: job.name,
    jobAddress: job.address,
    trade: pkg.trade,
    title: pkg.title,
    scope: pkg.scope,
    lines,
    inclusions: win.latest.inclusions,
    exclusions: win.latest.exclusions,
    deviations: win.latest.deviations,
    headlineCents,
    leveledCents,
    workFrom: pkg.workFrom,
    workTo: pkg.workTo,
    startOn: win.latest.startOn,
    duration: win.latest.duration,
    terms: pkg.terms || "Per Saddlewood Master Subcontract Agreement (SOP-008).",
    retainagePct,
    waiverRule: "Conditional lien waiver required with each progress billing; unconditional waiver required prior to final release.",
    coiRule: "Current GL & Workers Comp COI naming Saddlewood Contracting LLC as Additional Insured required before mobilization.",
    awardedAt: pkg.awardedAt,
    awardedBy: pkg.awardedBy,
    signerName: win.latest.signerName,
    signerTitle: win.latest.signerTitle,
    bidRevision: win.latest.revision,
    bidFingerprint: win.latest.fingerprint,
    workOrderHash: snapshotHash(payload),
    mobilizationGate: {
      canMobilize: r.ready,
      blockers: r.missing,
    },
  };
}

export function buildAwardEmailDrafts(
  detail: PackageDetail,
  workOrder: WorkOrderView | null,
  senderName: string,
): { awardDraft: EmailDraftView | null; thankYouDrafts: EmailDraftView[] } {
  const where = detail.job.address || detail.job.name;
  const sender = senderName || "Saddlewood Contracting";

  let awardDraft: EmailDraftView | null = null;
  if (workOrder) {
    const gateNote = workOrder.mobilizationGate.canMobilize
      ? "Your compliance file (COI, W-9, MSA, ROC) is complete and cleared for mobilization."
      : `Before mobilization on site, please send over: ${workOrder.mobilizationGate.blockers.join(", ")}.`;

    const windowText =
      workOrder.workFrom || workOrder.workTo
        ? `${workOrder.workFrom ?? "TBD"} to ${workOrder.workTo ?? "TBD"}`
        : workOrder.startOn
          ? `Starting ${workOrder.startOn} (${workOrder.duration || "per schedule"})`
          : "Per job schedule";

    awardDraft = {
      kind: "award",
      inviteId: workOrder.inviteId,
      subName: workOrder.subName,
      to: workOrder.contactEmail,
      subject: `Award & Work Order ${workOrder.woNumber}: ${detail.pkg.trade} at ${detail.job.name}`,
      body: [
        `Hi ${firstName(workOrder.contactName)},`,
        "",
        `Saddlewood Contracting is awarding ${detail.pkg.title} (${detail.pkg.trade}) at ${where} to ${workOrder.subName} under Work Order ${workOrder.woNumber}.`,
        "",
        `• Contract Amount: ${usdText(workOrder.headlineCents)} (Bid Rev ${workOrder.bidRevision})`,
        `• Schedule Window: ${windowText}`,
        `• Billing & Waivers: ${workOrder.waiverRule}`,
        `• Pre-Mobilization Gate: ${gateNote}`,
        "",
        "Please reply to confirm your mobilization date and crew lead.",
        "",
        "Thank you,",
        sender,
        "Saddlewood Contracting LLC",
      ].join("\n"),
    };
  }

  const thankYouDrafts: EmailDraftView[] = detail.invites
    .filter((i) => i.status === "not_awarded")
    .map((i) => ({
      kind: "thanks" as const,
      inviteId: i.id,
      subName: i.sub.name,
      to: i.contactEmail,
      subject: `Thank you for your bid: ${detail.pkg.trade}, ${detail.job.name}`,
      body: [
        `Hi ${firstName(i.contactName)},`,
        "",
        `Thank you for bidding ${detail.pkg.trade} at ${where}. We went another way on this package, and we appreciate the time you put into pricing it. We will keep ${i.sub.name} on our invite list for upcoming work.`,
        "",
        "Thank you,",
        sender,
        "Saddlewood Contracting LLC",
      ].join("\n"),
    }));

  return { awardDraft, thankYouDrafts };
}

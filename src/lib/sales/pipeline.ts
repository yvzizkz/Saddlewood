import { OPEN_STAGES, stageInfo, type IssuedProposal, type Opportunity } from "./types";
import { localDay } from "@/lib/crew/time";

// The numbers on top of the Sales screen and the "do this today" list, worked
// out from the opportunities as they stand. Pure, so it is tested without a
// database and the screen can recompute it after every change.

export type OpportunityRow = Opportunity & {
  /** The lead package's sell price of its newest estimate, if it has one. */
  estimateCents: number | null;
  /** Its newest proposal sent, and how that stands. */
  proposal: IssuedProposal | null;
  /** The newest thing on its timeline. */
  lastActivityAt: string;
};

/** What the opportunity is worth for the pipeline: the estimate once there is one, else the guess. */
export function valueOf(o: OpportunityRow): number {
  if (o.proposal?.accepted) return o.proposal.accepted.totalCents;
  if (o.proposal && o.proposal.status === "issued") return o.proposal.totalCents;
  return o.estimateCents ?? o.valueCents;
}

export function probabilityOf(o: Opportunity): number {
  return o.probability ?? stageInfo(o.stage).probability;
}

/** The Phoenix calendar day of an instant; a plain day (YYYY-MM-DD) is already one, so it is kept as is. */
function dayOf(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return localDay(iso);
}

export function daysSince(iso: string, today: string): number {
  return Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dayOf(iso)}T12:00:00Z`)) / 86400000);
}

export type Metrics = {
  openCount: number;
  openCents: number;
  weightedCents: number;
  wonCents90: number;
  wonCount90: number;
  lostCount90: number;
  /** Won / (won + lost) over 90 days, percent; null with nothing decided. */
  winRate90: number | null;
  /** Days from first contact to won, median over 90 days. */
  medianDaysToWin: number | null;
  dueToday: number;
};

export function metrics(rows: OpportunityRow[], today: string): Metrics {
  const open = rows.filter((o) => OPEN_STAGES.includes(o.stage));
  const recent = (o: OpportunityRow) => !!o.closedAt && daysSince(o.closedAt, today) <= 90;
  const won = rows.filter((o) => o.stage === "won" && recent(o));
  const lost = rows.filter((o) => o.stage === "lost" && recent(o));
  const toWin = won.map((o) => daysSince(o.createdAt, today) - daysSince(o.closedAt!, today)).sort((a, b) => a - b);
  return {
    openCount: open.length,
    openCents: open.reduce((a, o) => a + valueOf(o), 0),
    weightedCents: Math.round(open.reduce((a, o) => a + (valueOf(o) * probabilityOf(o)) / 100, 0)),
    wonCents90: won.reduce((a, o) => a + valueOf(o), 0),
    wonCount90: won.length,
    lostCount90: lost.length,
    winRate90: won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    medianDaysToWin: toWin.length ? toWin[Math.floor((toWin.length - 1) / 2)] : null,
    dueToday: today ? agenda(rows, today).length : 0,
  };
}

export type AgendaReason = "overdue" | "today" | "new_lead" | "viewed_quiet" | "not_viewed" | "bid_due" | "stale" | "accepted";

export type AgendaItem = { row: OpportunityRow; reason: AgendaReason; label: string; tone: "bad" | "warn" | "ok" | "ink" };

/**
 * What to do today, most urgent first. One line per opportunity, its most
 * pressing reason. "Viewed, quiet" is the bot's bid follow-up rule ("opened
 * twice, no reply in five days") moved into the screen people already open.
 */
export function agenda(rows: OpportunityRow[], today: string): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const o of rows) {
    if (o.stage === "won" && o.proposal?.accepted && !o.jobId) {
      out.push({ row: o, reason: "accepted", label: "Accepted: open the job", tone: "ok" });
      continue;
    }
    if (!OPEN_STAGES.includes(o.stage)) continue;
    const quiet = daysSince(o.lastActivityAt, today);
    if (o.nextStepOn && o.nextStepOn < today) {
      out.push({ row: o, reason: "overdue", label: `${o.nextStep || "Next step"}: ${daysSince(o.nextStepOn, today)}d late`, tone: "bad" });
    } else if (o.bidDue && o.bidDue >= today && daysSince(today, o.bidDue) <= 3 && o.stage !== "proposal_sent" && o.stage !== "negotiating") {
      out.push({ row: o, reason: "bid_due", label: o.bidDue === today ? "Bid due today" : `Bid due ${o.bidDue}`, tone: "warn" });
    } else if (o.nextStepOn === today) {
      out.push({ row: o, reason: "today", label: o.nextStep || "Follow up today", tone: "ink" });
    } else if (o.stage === "lead" && daysSince(o.createdAt, today) >= 1 && quiet >= 1) {
      out.push({ row: o, reason: "new_lead", label: "New lead: nobody has reached out", tone: "bad" });
    } else if (o.proposal && o.proposal.status === "issued" && !o.proposal.accepted) {
      const sentDays = daysSince(o.proposal.issuedAt, today);
      if (o.proposal.views >= 2 && quiet >= 5) {
        out.push({ row: o, reason: "viewed_quiet", label: `Opened ${o.proposal.views}×, quiet ${quiet}d: call`, tone: "warn" });
      } else if (o.proposal.views === 0 && sentDays >= 2) {
        out.push({ row: o, reason: "not_viewed", label: `Not opened in ${sentDays}d: resend or call`, tone: "warn" });
      }
    } else if (quiet >= 14) {
      out.push({ row: o, reason: "stale", label: `No activity in ${quiet}d`, tone: "warn" });
    }
  }
  const order: Record<AgendaReason, number> = { accepted: 0, overdue: 1, bid_due: 2, new_lead: 3, today: 4, viewed_quiet: 5, not_viewed: 6, stale: 7 };
  return out.sort((a, b) => order[a.reason] - order[b.reason] || valueOf(b.row) - valueOf(a.row));
}

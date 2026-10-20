// The shapes behind the sub directory and the bid-out (supabase/migrations/
// 0028_subs_bids.sql; SOP-008 §1 and §2; KB docs/JOB-LIFECYCLE-PLAN §7).

export const SUB_STATUSES = ["prospect", "onboarding", "approved", "inactive"] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

export const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  prospect: "Prospect",
  onboarding: "Onboarding",
  approved: "Approved",
  inactive: "Inactive",
};

/** The trades the directory offers first; anything typed is kept as written. */
export const COMMON_TRADES = [
  "insulation",
  "electrical",
  "plumbing",
  "hvac",
  "drywall",
  "framing",
  "concrete",
  "roofing",
  "stucco",
  "paint",
  "tile",
  "flooring",
  "cabinets",
  "countertops",
  "windows and doors",
  "fire sprinklers",
  "low voltage",
  "landscape",
  "demolition",
  "cleaning",
] as const;

export type SubContact = {
  id: string;
  subId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
  active: boolean;
};

export type Sub = {
  id: string;
  name: string;
  trades: string[];
  status: SubStatus;
  phone: string;
  email: string;
  address: string;
  rocLicense: string;
  rocVerifiedAt: string | null;
  rocVerifiedBy: string;
  coiExpiresOn: string | null;
  w9OnFile: boolean;
  msaSignedOn: string | null;
  achConfirmedAt: string | null;
  achConfirmedBy: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contacts: SubContact[];
};

/** One line of a package's scope. `ourCents` is our own cost for it: internal, the leveling plug, never sent to a sub. */
export type PackageLine = { id: string; description: string; qty: number | null; unit: string; note: string; ourCents: number | null };

export type StoredFile = { id: string; name: string; path: string; size: number; type: string; at: string; by: string };

export const PACKAGE_STATUSES = ["draft", "out", "closed", "awarded", "cancelled"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export type BidPackage = {
  id: string;
  jobId: string | null;
  opportunityId: string | null;
  trade: string;
  title: string;
  scope: string;
  lines: PackageLine[];
  exclusions: string[];
  files: StoredFile[];
  workFrom: string | null;
  workTo: string | null;
  siteWalk: string;
  dueAt: string | null;
  terms: string;
  status: PackageStatus;
  awardedInviteId: string | null;
  awardedAt: string | null;
  awardedBy: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Addendum = { id: number; packageId: string; n: number; text: string; createdBy: string; createdAt: string };

export const INVITE_STATUSES = ["invited", "declined", "submitted", "awarded", "not_awarded", "withdrawn"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export type BidInvite = {
  id: string;
  packageId: string;
  subId: string;
  contactName: string;
  contactEmail: string;
  token: string;
  status: InviteStatus;
  sentAt: string | null;
  viewedAt: string | null;
  declinedAt: string | null;
  declineNote: string;
  levelAddCents: number;
  levelNote: string;
  createdBy: string;
  createdAt: string;
};

/** A sub's price for one line; null = not in their bid. */
export type BidLine = { lineId: string; cents: number | null; note: string };

export type BidSignature = { method: "draw" | "type"; typed?: string; font?: string; image: string };

export type BidResponse = {
  id: number;
  inviteId: string;
  revision: number;
  lines: BidLine[];
  totalCents: number;
  inclusions: string;
  exclusions: string;
  startOn: string | null;
  duration: string;
  validDays: number;
  deviations: string;
  note: string;
  files: StoredFile[];
  signerName: string;
  signerTitle: string;
  signature: BidSignature;
  consent: string;
  fingerprint: string;
  submittedAt: string;
};

export const BID_EVENT_KINDS = [
  "created",
  "invited",
  "sent",
  "viewed",
  "downloaded",
  "submitted",
  "declined",
  "addendum",
  "awarded",
  "not_awarded",
  "thanked",
  "note",
  "reopened",
  "cancelled",
] as const;
export type BidEventKind = (typeof BID_EVENT_KINDS)[number];

export type BidEvent = { id: number; packageId: string; inviteId: string | null; kind: BidEventKind; at: string; actor: string; detail: Record<string, unknown> };

/** What a sub sees of a package: never our own cost, never the other bidders. */
export type PublicPackage = {
  title: string;
  trade: string;
  scope: string;
  lines: Omit<PackageLine, "ourCents">[];
  exclusions: string[];
  files: Pick<StoredFile, "id" | "name" | "size" | "type">[];
  workFrom: string | null;
  workTo: string | null;
  siteWalk: string;
  dueAt: string | null;
  terms: string;
  job: { name: string; address: string };
  addenda: Pick<Addendum, "n" | "text" | "createdAt">[];
  open: boolean;
};

export function publicPackage(p: BidPackage, job: { name: string; address: string }, addenda: Addendum[], now: Date): PublicPackage {
  return {
    title: p.title,
    trade: p.trade,
    scope: p.scope,
    lines: p.lines.map(({ ourCents: _o, ...l }) => {
      void _o;
      return l;
    }),
    exclusions: p.exclusions,
    files: p.files.map((f) => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
    workFrom: p.workFrom,
    workTo: p.workTo,
    siteWalk: p.siteWalk,
    dueAt: p.dueAt,
    terms: p.terms,
    job,
    addenda: addenda.map((a) => ({ n: a.n, text: a.text, createdAt: a.createdAt })),
    open: isOpenForBids(p, now),
  };
}

/** A sub may bid or revise while the package is out and the due time has not passed. */
export function isOpenForBids(p: Pick<BidPackage, "status" | "dueAt">, now: Date): boolean {
  if (p.status !== "out") return false;
  return !p.dueAt || now.getTime() <= Date.parse(p.dueAt);
}

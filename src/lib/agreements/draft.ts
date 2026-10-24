// The agreement drafted on an awarded job (T112, docs/CONTRACTS-MOVE.md). Its
// price is the job's contract figure and its scope the accepted proposal's:
// nobody types either. The words are contract.py's (text.ts), filled from
// Company policies. Pure: the store (store.ts) reads the rows and saves what
// this returns.

import type { AwardRecord } from "@/lib/sales/award";
import type { ProposalSnapshot } from "@/lib/sales/presentation";
import type { AgreementSnapshot, DocumentSnapshot } from "@/lib/billing/types";

import { agreementText, longDate, type ContractType } from "./text";

export type AgreementSource = {
  job: { id: string; name: string; address: string | null; numberPrefix: string | null; contractCents: number | null };
  client: { name: string; kind: string } | null;
  award: AwardRecord | null;
  /** The accepted proposal the award names (its frozen snapshot), or null when it can't be read. */
  proposal: { number: string; revision: number; snapshot: ProposalSnapshot } | null;
};

/** What staff may set on a draft. Never the price or the scope. */
export type AgreementChoices = { type?: ContractType; clientName?: string; clientEntity?: string };

export type AgreementPlan =
  | { ok: true; number: string; title: string; snapshot: DocumentSnapshot & { agreement: AgreementSnapshot }; totalCents: number }
  | { ok: false; error: string };

/** A client of kind gc signs their own subcontract (the agreement watch says so); the type follows the client. */
export function defaultType(clientKind: string | undefined): ContractType {
  if (clientKind === "gc") return "subcontractor";
  if (clientKind === "homeowner") return "prime_residential";
  return "prime_commercial";
}

/** One number per job: "<job prefix>-AGR". A redraft after a void is the same number, next revision. */
export function agreementNumber(job: AgreementSource["job"]): string {
  const prefix = (job.numberPrefix ?? "").trim();
  return prefix ? `${prefix}-AGR` : `AGR-${job.id.slice(0, 8)}`;
}

/** The accepted package's sections and the add-ons the client chose, as the agreement's scope list. */
export function scopeDetails(award: AwardRecord, number: string, revision: number, p: ProposalSnapshot): string {
  const pkg = p.packages.find((x) => x.id === award.packageId) ?? (p.packages.length === 1 ? p.packages[0] : undefined);
  const sections = p.sections.filter((s) => !pkg || s.pkgs.includes(pkg.id)).map((s) => `* ${s.name}`);
  const options = award.options.map((o) => `* Add-on: ${o}`);
  const head = `Per Proposal ${number}${revision > 1 ? ` rev ${revision}` : ""}${pkg && p.packages.length > 1 ? ` (${pkg.name})` : ""}, accepted ${longDate(award.acceptedAt.slice(0, 10))}:`;
  const out = [head, "", ...sections, ...options];
  if (p.exclusions.length) out.push("", `Not included: ${p.exclusions.join("; ")}.`);
  return out.join("\n");
}

export function planAgreement(src: AgreementSource, policies: Record<string, unknown>, today: string, choices: AgreementChoices = {}): AgreementPlan {
  const { job, award, proposal } = src;
  if (!award) return { ok: false, error: "Award the job first: the agreement's price and scope come from the accepted proposal." };
  if (!award.documentId || !proposal) return { ok: false, error: "This job was awarded without a proposal on file, so there is no scope to put in an agreement." };
  const cents = job.contractCents ?? 0;
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: "The job has no contract figure yet." };
  const type = choices.type ?? defaultType(src.client?.kind);
  const entity = choices.clientEntity?.trim() || src.client?.name || "";
  const number = agreementNumber(job);
  const scope = proposal.snapshot.title.trim() || job.name;
  const text = agreementText(
    {
      contractNumber: number,
      type,
      clientName: choices.clientName?.trim() || entity,
      clientEntity: entity,
      projectName: job.name,
      projectAddress: job.address ?? "",
      amount: cents / 100,
      scope,
      scopeDetails: scopeDetails(award, proposal.number, proposal.revision, proposal.snapshot),
      date: longDate(today),
    },
    policies,
    today,
  );
  return {
    ok: true,
    number,
    title: `Agreement: ${scope}`,
    totalCents: cents,
    snapshot: {
      billTo: entity ? { name: entity } : undefined,
      job: { name: job.name, ...(job.address ? { address: job.address } : {}) },
      date: today,
      lines: [{ description: "Contract Price", amountCents: cents }],
      agreement: {
        v: 1,
        type,
        text,
        proposal: { documentId: award.documentId, number: proposal.number, revision: proposal.revision, packageName: award.packageName, options: award.options },
      },
    },
  };
}

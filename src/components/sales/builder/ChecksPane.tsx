"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { Draft } from "immer";

import { INPUT } from "@/components/bot/ui";
import { shortDay, usd } from "@/components/sales/format";
import type { Check } from "@/lib/sales/checks";
import type { EstimateBody, IssuedProposal, Manifest } from "@/lib/sales/types";
import { Panel, Pill, Toggle } from "./fields";

// Before a number leaves: where the quantities came from, what was already
// sent, and every check the estimate fails. Stops block issuing; warnings go
// out with the owner's eyes on them; notes are for the estimator.

type Update = (recipe: (d: Draft<EstimateBody>) => void, opts?: { coalesce?: boolean }) => void;

const LEVEL = {
  stop: { icon: AlertOctagon, color: "#9a2a1f", bg: "rgba(154,42,31,0.08)", label: "Must fix" },
  warn: { icon: AlertTriangle, color: "#8f6c18", bg: "rgba(212,175,55,0.16)", label: "Look at" },
  info: { icon: Info, color: "#5a5a5a", bg: "rgba(44,41,38,0.05)", label: "Note" },
} as const;

export function CheckList({ checks, onJump }: { checks: Check[]; onJump?: (ids: string[]) => void }) {
  if (checks.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-[rgba(47,107,74,0.12)] px-3 py-3 text-sm text-[#2f6b4a]">
        <CheckCircle2 className="size-5" aria-hidden="true" /> Every check passes.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {checks.map((c) => {
        const L = LEVEL[c.level];
        const Icon = L.icon;
        return (
          <li key={c.id} className="rounded-xl px-3 py-2.5" style={{ background: L.bg }}>
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0" style={{ color: L.color }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: L.color }}>
                  {c.title}
                </p>
                {c.detail ? <p className="mt-0.5 text-xs text-[var(--color-charcoal)]">{c.detail}</p> : null}
                {c.itemIds?.length && onJump ? (
                  <button type="button" onClick={() => onJump(c.itemIds!)} className="mt-1 text-xs font-medium text-[var(--color-teal)] underline">
                    Show {c.itemIds.length === 1 ? "the line" : `the ${c.itemIds.length} lines`}
                  </button>
                ) : null}
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: L.color }}>
                {L.label}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ChecksPane({
  body,
  checks,
  proposals,
  update,
  onJump,
}: {
  body: EstimateBody;
  checks: Check[];
  proposals: IssuedProposal[];
  update: Update;
  onJump: (ids: string[]) => void;
}) {
  const m = body.manifest;
  const setM = (patch: Partial<Manifest>) =>
    update(
      (d) => {
        Object.assign(d.manifest, patch);
      },
      { coalesce: true },
    );
  const sent = proposals.filter((p) => p.status === "issued");

  return (
    <div className="space-y-3">
      <Panel title="Sources">
        <p className="mb-2 text-xs text-[var(--color-charcoal-light)]">What the quantities came from. Plans need the set by name and date and every ASI, addendum and RFI after it.</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              ["site_walk", "Site walk"],
              ["plans", "Plans"],
              ["client_scope", "Client's scope"],
              ["pipeline", "Pipeline takeoff"],
            ] as const
          ).map(([k, label]) => (
            <Pill key={k} on={m.basis === k} onClick={() => setM({ basis: k })}>
              {label}
            </Pill>
          ))}
        </div>
        {m.basis === "plans" || m.basis === "pipeline" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_9.5rem] gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Drawing set</span>
                <input className={INPUT} placeholder="BGW Permit Set, stamped" value={m.drawingSet ?? ""} onChange={(e) => setM({ drawingSet: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Dated</span>
                <input type="date" className={INPUT} value={m.drawingDate ?? ""} onChange={(e) => setM({ drawingDate: e.target.value || null })} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium">ASIs, addenda, answered RFIs after it</span>
              <textarea className={INPUT} rows={2} placeholder={'One per line, or "none"'} value={m.addenda ?? ""} onChange={(e) => setM({ addenda: e.target.value })} />
            </label>
          </div>
        ) : null}
        <div className="mt-2 border-t border-[var(--color-stone)]">
          <Toggle
            on={!!m.priorChecked}
            onChange={(v) => setM({ priorChecked: v })}
            label="Nothing else was already sent for this job"
            hint="Checked sent mail (mail.py sent), Joist and DocuSign for an estimate or proposal"
          />
        </div>
        {sent.length ? (
          <div className="mt-2 rounded-xl bg-[var(--color-cream)] px-3 py-2 text-xs">
            <p className="mb-1 font-medium">Sent from the app on this opportunity</p>
            {sent.map((p) => (
              <p key={p.documentId} className="flex justify-between">
                <span>
                  {p.number} rev {p.revision} · {shortDay(p.issuedAt)}
                  {p.views ? ` · viewed ${p.views}×` : " · not opened"}
                </span>
                <span className="tabular-nums">{usd(p.totalCents, { whole: true })}</span>
              </p>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title={`Checks · ${checks.filter((c) => c.level === "stop").length} to fix`}>
        <CheckList checks={checks} onJump={onJump} />
      </Panel>
    </div>
  );
}

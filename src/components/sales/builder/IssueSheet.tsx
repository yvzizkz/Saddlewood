"use client";

import { useState } from "react";
import { Check as CheckIcon, Copy, ExternalLink, Mail, MessageSquare, Send, Share2 } from "lucide-react";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/bot/ui";
import { usd } from "@/components/sales/format";
import type { Check } from "@/lib/sales/checks";
import type { ProposalSnapshot } from "@/lib/sales/presentation";
import type { Opportunity } from "@/lib/sales/types";
import { EmailProposalSheet, type EmailDefaults } from "../EmailProposalSheet";
import { CheckList } from "./ChecksPane";

// Issuing: the estimate is frozen as the proposal the client gets, and its
// link comes back to share from this phone (text, email, the GC's portal).
// Nothing is emailed by the app here. Stops block it; warnings are shown with
// the button so they are read first. Owners only (the server says so too).

type Issued = { documentId: string; link: string; ownLink: string; number: string; revision: number; totalCents: number };

export function IssueSheet({
  open,
  onClose,
  estimateId,
  proposal,
  opportunity,
  checks,
  beforeIssue,
  onIssued,
  emailDefaults,
}: {
  open: boolean;
  onClose: () => void;
  estimateId: string;
  proposal: ProposalSnapshot;
  opportunity: Opportunity;
  checks: Check[];
  /** Save pending edits first, so what is frozen is what is on screen. */
  beforeIssue: () => Promise<void>;
  onIssued: () => void;
  /** When given (the person may send), the ready sheet offers to email it from the app. */
  emailDefaults?: EmailDefaults;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const stops = checks.filter((c) => c.level === "stop");
  const warns = checks.filter((c) => c.level === "warn");
  const first = (opportunity.contact.name || "").split(" ")[0];

  async function issue() {
    setBusy(true);
    setErr("");
    try {
      await beforeIssue();
      const res = await fetch(`/api/sales/estimates/${estimateId}/issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || `could not issue (${res.status})`);
      setDone(j as Issued);
      onIssued();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const message = done
    ? `${first ? `Hi ${first}, ` : ""}here is our proposal for ${proposal.title || opportunity.title}: ${done.link}\nYou can choose options and accept right on the page. — Saddlewood Contracting`
    : "";

  return (
    <BottomSheet isOpen={open} onClose={onClose} title={done ? "Proposal ready" : "Issue the proposal"} maxHeightDvh={92} narrow>
      {done ? (
        <div className="space-y-3 pb-4">
          <div className="rounded-2xl bg-[var(--color-teal)] px-4 py-4 text-white">
            <p className="text-xs opacity-70">
              {done.number} · revision {done.revision}
            </p>
            <p className="font-heading text-2xl" style={{ fontFamily: "var(--font-fraunces)" }}>
              {usd(done.totalCents)}
            </p>
            <p className="mt-1 break-all text-xs opacity-80">{done.link}</p>
          </div>
          <p className="text-sm text-[var(--color-charcoal-light)]">
            Frozen now: what the client opens is exactly this. Every opening is recorded, and accepting on the link pushes to Marco&apos;s phone.
          </p>
          {emailDefaults ? (
            <Button variant="primary" full onClick={() => setEmailing(true)}>
              <Send className="size-4" /> Email from the app (link or PDF)
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Button
                variant={emailDefaults ? "secondary" : "primary"}
                onClick={() => navigator.share({ title: proposal.title, text: message, url: done.link }).catch(() => {})}
              >
                <Share2 className="size-4" /> Share
              </Button>
            ) : null}
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(done.link).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <CheckIcon className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
            </Button>
            {opportunity.contact.phone ? (
              <a
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-stone-mid)] bg-white px-4 text-sm font-medium"
                href={`sms:${opportunity.contact.phone.replace(/[^\d+]/g, "")}${/iPhone|iPad/.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? "&" : "?"}body=${encodeURIComponent(message)}`}
              >
                <MessageSquare className="size-4" /> Text {first || "them"}
              </a>
            ) : null}
            {opportunity.contact.email ? (
              <a
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-stone-mid)] bg-white px-4 text-sm font-medium"
                href={`mailto:${opportunity.contact.email}?subject=${encodeURIComponent(`Proposal: ${proposal.title || opportunity.title}`)}&body=${encodeURIComponent(message)}`}
              >
                <Mail className="size-4" /> My mail app
              </a>
            ) : null}
            <a
              className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-[var(--color-teal)]"
              href={done.ownLink}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-4" /> Open as staff (not counted as a viewing)
            </a>
          </div>
          <Button full onClick={onClose}>
            Done
          </Button>
          {emailing && emailDefaults ? (
            <EmailProposalSheet
              open
              onClose={() => setEmailing(false)}
              documentId={done.documentId}
              opportunity={opportunity}
              proposalTitle={proposal.title || opportunity.title}
              number={done.number}
              defaults={emailDefaults}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 pb-4">
          <div className="rounded-2xl border border-[var(--color-stone)] bg-white px-4 py-3">
            <p className="text-xs text-[var(--color-charcoal-light)]">For</p>
            <p className="text-sm font-medium">
              {opportunity.contact.company || opportunity.contact.name || opportunity.title}
              {opportunity.contact.company && opportunity.contact.name ? ` · ${opportunity.contact.name}` : ""}
            </p>
            <div className="mt-2 space-y-1">
              {proposal.packages.map((p) => (
                <p key={p.id} className="flex justify-between text-sm">
                  <span>{proposal.packages.length > 1 ? p.name : "Total"}</span>
                  <span className="font-medium tabular-nums">{usd(p.totalCents)}</span>
                </p>
              ))}
              {proposal.options.length ? (
                <p className="text-xs text-[var(--color-charcoal-light)]">
                  + {proposal.options.length} add-on{proposal.options.length === 1 ? "" : "s"} to choose
                </p>
              ) : null}
              <p className="text-xs text-[var(--color-charcoal-light)]">Valid until {proposal.validUntil}</p>
            </div>
          </div>
          {stops.length || warns.length ? <CheckList checks={[...stops, ...warns]} /> : <CheckList checks={[]} />}
          {err ? <p className="text-sm text-[#9a2a1f]">{err}</p> : null}
          <Button variant="primary" full busy={busy} disabled={stops.length > 0} onClick={issue}>
            {stops.length ? `Fix ${stops.length} first` : "Issue and get the link"}
          </Button>
          <p className="text-center text-[11px] text-[var(--color-charcoal-light)]">The app sends nothing. You share the link.</p>
        </div>
      )}
    </BottomSheet>
  );
}

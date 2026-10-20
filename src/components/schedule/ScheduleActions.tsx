"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus, X } from "lucide-react";

import type { GcLookAheadDraft } from "@/lib/schedule/feed";

type Opt = { value: string; label: string };

export function NewScheduleItem({
  job,
  jobs,
  kinds,
  roles,
  defaultDay,
}: {
  job?: string;
  jobs: Opt[];
  kinds: Opt[];
  roles: Opt[];
  defaultDay: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(kinds[0]?.value ?? "inspection");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [jobKey, setJobKey] = useState(job ?? "");
  const [startDay, setStartDay] = useState(defaultDay);
  const [endDay, setEndDay] = useState(defaultDay);
  const [startTime, setStartTime] = useState("09:00");
  const [role, setRole] = useState("pm");
  const [who, setWho] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-stone)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-charcoal)] hover:border-[var(--color-charcoal-light)]"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add inspection, delivery or site visit
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        startTransition(async () => {
          const res = await fetch("/api/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              title,
              detail,
              job: job ?? jobKey,
              startDay,
              endDay: endDay || startDay,
              startTime,
              role,
              who,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) {
            setErr(data.error ?? "Could not save schedule event");
            return;
          }
          setTitle("");
          setDetail("");
          setOpen(false);
          router.refresh();
        });
      }}
      className="rounded-xl border border-[var(--color-stone)] bg-white p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-charcoal-light)]">
          New schedule event
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]"
        >
          Cancel
        </button>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Kind"
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {!job ? (
          <select
            value={jobKey}
            onChange={(e) => setJobKey(e.target.value)}
            aria-label="Job"
            className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
          >
            <option value="">Company-wide / any job</option>
            {jobs.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="date"
          value={startDay}
          onChange={(e) => {
            setStartDay(e.target.value);
            if (!endDay || endDay < e.target.value) setEndDay(e.target.value);
          }}
          aria-label="Start date"
          required
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        />
        <input
          type="date"
          value={endDay}
          min={startDay}
          onChange={(e) => setEndDay(e.target.value)}
          aria-label="End date"
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        />
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          aria-label="Start time"
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Owner role"
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        >
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="Who (optional: Eli, Mateo, Inspector…)"
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is happening? (e.g. City of Phoenix pre-cover inspection)"
          required
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        />
        <input
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Notes, gate code, inspector or delivery ref…"
          className="h-9 rounded-lg border border-[var(--color-stone)] bg-white px-2.5 text-sm text-[var(--color-charcoal)]"
        />
      </div>
      {err ? <p className="text-xs text-[#9a2a1f]">{err}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-charcoal)] px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add to schedule"}
        </button>
      </div>
    </form>
  );
}

export function ScheduleStatusButton({ id, status }: { id: number; status: "scheduled" | "done" | "overdue" | "cancelled" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const update = (next: "done" | "scheduled" | "cancelled") => {
    startTransition(async () => {
      await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      router.refresh();
    });
  };

  return (
    <div className="inline-flex items-center gap-1">
      {status !== "done" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => update("done")}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-stone)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--color-charcoal)] hover:bg-[var(--color-cream)]"
        >
          <Check className="size-3" aria-hidden="true" />
          Done
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => update("scheduled")}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-stone)] bg-white px-2 py-1 text-[11px] text-[var(--color-charcoal-light)]"
        >
          Reopen
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => update("cancelled")}
        aria-label="Cancel event"
        className="inline-flex items-center rounded-md border border-[var(--color-stone)] bg-white p-1 text-[11px] text-[var(--color-charcoal-light)] hover:text-[#9a2a1f]"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </div>
  );
}

export function LookAheadDraftCard({ draft }: { draft: GcLookAheadDraft }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-[var(--color-stone)] bg-white p-4 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-gold-accessible)]">
            Wednesday two-week look-ahead · Draft only (never auto-sent)
          </p>
          <h3 className="text-base font-semibold text-[var(--color-charcoal)]">{draft.client}</h3>
          <p className="text-xs text-[var(--color-charcoal-light)]">
            {draft.jobs.join(" · ")} ({draft.eventCount} {draft.eventCount === 1 ? "event" : "events"})
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-stone)] bg-[var(--color-cream)] px-3 py-1.5 text-xs font-medium text-[var(--color-charcoal)] hover:bg-white"
        >
          <Copy className="size-3.5" aria-hidden="true" />
          {copied ? "Copied draft" : "Copy email draft"}
        </button>
      </div>
      <div className="rounded-xl border border-[var(--color-stone)] bg-[var(--color-background)] p-3 font-mono text-xs whitespace-pre-wrap text-[var(--color-charcoal)]">
        <div className="mb-1.5 font-semibold">Subject: {draft.subject}</div>
        {draft.body}
      </div>
    </div>
  );
}

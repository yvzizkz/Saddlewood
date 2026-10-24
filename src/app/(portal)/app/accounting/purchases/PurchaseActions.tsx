"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, Check, Tag } from "lucide-react";

import { formatValue } from "@/lib/analytics/format";
import type { Trade } from "@/lib/accounting/trades";
import type { UnmatchedPurchase } from "@/lib/crew/purchases";
import type { UntaggedSpend } from "@/lib/expenses/store";

export function UnmatchedBanner({
  unmatched,
  jobs,
}: {
  unmatched: UnmatchedPurchase[];
  jobs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!unmatched.length) return null;

  const assign = async (u: UnmatchedPurchase, jobId: string | null) => {
    setBusyKey(u.key);
    try {
      const res = await fetch("/api/accounting/purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "alias_rule",
          jobKey: u.key,
          jobId,
        }),
      });
      if (res.ok) {
        start(() => router.refresh());
      }
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section
      aria-label="Unassigned register names"
      className="rounded-2xl border border-[#d6b36a] bg-[#fdf9ef] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-[var(--color-gold-accessible)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--color-charcoal)]">
            Which job is this? ({unmatched.length} register {unmatched.length === 1 ? "name" : "names"} unassigned)
          </h2>
        </div>
        <p className="text-xs text-[var(--color-charcoal-light)]">
          Assigning a register PO saves the alias and links every receipt under that name.
        </p>
      </div>
      <ul className="mt-3 divide-y divide-[var(--color-stone)]">
        {unmatched.map((u) => {
          const val = picked[u.key] ?? "";
          const isBusy = busyKey === u.key || pending;
          return (
            <li key={u.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-charcoal)]">
                  &ldquo;{u.name}&rdquo;{" "}
                  <span className="ml-1.5 font-semibold tabular-nums text-[var(--color-charcoal)]">
                    {formatValue("money", u.cents)}
                  </span>
                </p>
                <p className="text-xs text-[var(--color-charcoal-light)]">
                  {u.trips} {u.trips === 1 ? "trip" : "trips"} · {u.lines} {u.lines === 1 ? "line" : "lines"} · last on{" "}
                  {formatValue("date", u.lastOn)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`assign-${u.key}`}>
                  Assign {u.name} to job
                </label>
                <select
                  id={`assign-${u.key}`}
                  value={val}
                  onChange={(e) => setPicked((p) => ({ ...p, [u.key]: e.target.value }))}
                  className="rounded-xl border border-[var(--color-stone-mid)] bg-white px-3 py-1.5 text-sm text-[var(--color-charcoal)]"
                >
                  <option value="">Choose a job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                  <option value="__ignore__">Set aside (overhead / not a job)</option>
                </select>
                <button
                  type="button"
                  disabled={!val || isBusy}
                  onClick={() => assign(u, val === "__ignore__" ? null : val)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--color-teal)] px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  Save rule
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SOURCE_LABEL: Record<string, string> = { zelle: "Zelle", receipt: "Texted receipt", app: "App receipt", hd: "Home Depot", vendor: "Supplier", manual: "Typed in" };

/**
 * Tag spend: payments and receipts on no job with no name to answer by (a
 * Zelle payment, a receipt with no job typed). One line at a time; the
 * register names are answered once each in "Which job is this?" above.
 */
export function TagSpend({ rows, count, jobs }: { rows: UntaggedSpend[]; count: number; jobs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!rows.length) return null;

  const save = async (key: string, val: string) => {
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/accounting/purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          val === "__ignore__" || val === "__bill__"
            ? { action: "set_aside", sourceKeys: [key], reason: val === "__bill__" ? "paid_bill" : "not_a_job" }
            : { action: "assign_job", sourceKeys: [key], jobId: val },
        ),
      });
      if (res.ok) start(() => router.refresh());
      else setError("Could not save that; try again.");
    } catch {
      setError("No connection");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section id="tag-spend" aria-label="Tag spend" data-testid="tag-spend" className="scroll-mt-20 rounded-2xl border border-[#d6b36a] bg-[#fdf9ef] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag className="size-4 shrink-0 text-[var(--color-gold-accessible)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--color-charcoal)]">
            Tag spend ({count} {count === 1 ? "payment or receipt" : "payments and receipts"} on no job)
          </h2>
        </div>
        <p className="text-xs text-[var(--color-charcoal-light)]">Zelle payments and receipts land here until they are on a job.</p>
      </div>
      <p className="mt-1 text-xs text-[var(--color-charcoal-light)]" data-testid="tag-spend-zelle-note">
        A Zelle payment is not counted in job cost: what it paid is counted from its bill in Payables. Pick &ldquo;Paid a bill&rdquo; for one that paid a sub or vendor bill.
      </p>
      {error ? <p className="mt-2 text-sm text-[#9a2a1f]">{error}</p> : null}
      <ul className="mt-3 divide-y divide-[var(--color-stone)]">
        {rows.map((r) => {
          const val = picked[r.sourceKey] ?? "";
          const isBusy = busyKey === r.sourceKey || pending;
          const id = `tag-${r.sourceKey.replace(/[^a-z0-9-]/gi, "-")}`;
          return (
            <li key={r.sourceKey} data-testid={id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-charcoal)]">
                  {r.description || r.vendor}{" "}
                  <span className="ml-1.5 font-semibold tabular-nums">{formatValue("money", r.cents)}</span>
                </p>
                <p className="text-xs text-[var(--color-charcoal-light)]">
                  {SOURCE_LABEL[r.source] ?? r.source} · {formatValue("date", r.purchasedOn)}
                  {r.typed ? <> · filed as &ldquo;{r.typed}&rdquo;</> : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={id + "-job"}>
                  Job for {r.description || r.vendor}
                </label>
                <select
                  id={id + "-job"}
                  value={val}
                  onChange={(e) => setPicked((p) => ({ ...p, [r.sourceKey]: e.target.value }))}
                  className="min-h-9 rounded-xl border border-[var(--color-stone-mid)] bg-white px-3 py-1.5 text-sm text-[var(--color-charcoal)]"
                >
                  <option value="">Choose a job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                  <option value="__ignore__">Not a job (overhead, personal)</option>
                  <option value="__bill__">Paid a bill (counted in Payables)</option>
                </select>
                <button
                  type="button"
                  disabled={!val || isBusy}
                  onClick={() => save(r.sourceKey, val)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--color-teal)] px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  Save
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {count > rows.length ? <p className="mt-2 text-xs text-[var(--color-charcoal-light)]">Showing the newest {rows.length}.</p> : null}
    </section>
  );
}

export function LineTradeSelector({
  sourceKey,
  currentTrade,
  tradeManual,
  trades,
}: {
  sourceKey: string;
  currentTrade: string;
  tradeManual: boolean;
  trades: Trade[];
}) {
  const router = useRouter();
  const [trade, setTrade] = useState(currentTrade);
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();

  const onChange = async (next: string) => {
    setTrade(next);
    setSaved(false);
    const res = await fetch("/api/accounting/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_trade",
        sourceKeys: [sourceKey],
        trade: next,
      }),
    });
    if (res.ok) {
      setSaved(true);
      start(() => router.refresh());
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        aria-label="Trade category"
        value={trade}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-charcoal)]"
      >
        {trades.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.label}
          </option>
        ))}
      </select>
      {saved ? (
        <span className="text-[11px] font-medium text-[#2f6b4a]">Saved</span>
      ) : tradeManual ? (
        <span className="text-[10px] text-[var(--color-charcoal-light)]" title="Manually categorized">
          manual
        </span>
      ) : null}
    </div>
  );
}

export function TripJobAndTradeControl({
  tripKey,
  currentJobId,
  trades,
  jobs,
}: {
  tripKey: string;
  currentJobId: string | null;
  trades: Trade[];
  jobs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState(currentJobId ?? "");
  const [bulkTrade, setBulkTrade] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [, start] = useTransition();

  const saveJob = async (nextJobId: string) => {
    setJobId(nextJobId);
    setStatus(null);
    const res = await fetch("/api/accounting/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // This trip only: the register name's rule stays as it is.
        action: "assign_job",
        tripKey,
        jobId: nextJobId || null,
      }),
    });
    if (res.ok) {
      setStatus("Job updated");
      start(() => router.refresh());
    }
  };

  const applyAllTrade = async (nextTrade: string) => {
    if (!nextTrade) return;
    setBulkTrade(nextTrade);
    setStatus(null);
    const res = await fetch("/api/accounting/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_trade",
        tripKey,
        trade: nextTrade,
      }),
    });
    if (res.ok) {
      setStatus("All lines categorized");
      start(() => router.refresh());
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-stone)] bg-[#faf7f2] p-3">
      <div className="flex items-center gap-2">
        <label htmlFor="trip-job-select" className="text-xs font-medium text-[var(--color-charcoal-light)]">
          Job
        </label>
        <select
          id="trip-job-select"
          value={jobId}
          onChange={(e) => saveJob(e.target.value)}
          className="rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-charcoal)]"
        >
          <option value="">Unassigned</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Tag className="size-3.5 text-[var(--color-charcoal-light)]" aria-hidden="true" />
        <label htmlFor="trip-trade-select" className="text-xs font-medium text-[var(--color-charcoal-light)]">
          Categorize entire trip
        </label>
        <select
          id="trip-trade-select"
          value={bulkTrade}
          onChange={(e) => applyAllTrade(e.target.value)}
          className="rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-charcoal)]"
        >
          <option value="">Set all lines to trade…</option>
          {trades.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {status ? <span className="text-xs font-medium text-[#2f6b4a]">{status}</span> : null}
    </div>
  );
}

/**
 * Owners: count each Home Depot trip once for the past year. New purchases
 * are checked as they come in; this catches the receipts filed before that.
 */
export function DedupeReceiptsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const run = async () => {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/accounting/purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dedupe_receipts" }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; covered?: number; cleared?: number; linked?: number; error?: string } | null;
      if (!res.ok || !d?.ok) {
        setNote(d?.error || "Could not check the receipts");
        return;
      }
      setNote(
        d.covered || d.cleared
          ? `${d.covered} receipt${d.covered === 1 ? "" : "s"} matched to a Pro Xtra trip${d.cleared ? `, ${d.cleared} unmatched` : ""}${d.linked ? `, ${d.linked} trip line${d.linked === 1 ? "" : "s"} put on the receipt's job` : ""}.`
          : "No receipt is counted twice.",
      );
      start(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        onClick={run}
        disabled={busy || pending}
        className="min-h-11 rounded-xl border border-[var(--color-stone-mid)] bg-white px-3 font-medium text-[var(--color-charcoal)] disabled:opacity-50"
      >
        {busy ? "Checking…" : "Find receipts filed twice"}
      </button>
      <span className="text-[var(--color-charcoal-light)]" aria-live="polite">
        {note}
      </span>
    </div>
  );
}

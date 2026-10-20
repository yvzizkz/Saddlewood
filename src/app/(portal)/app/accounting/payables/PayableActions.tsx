"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, CreditCard, ShieldAlert } from "lucide-react";

import { formatValue } from "@/lib/analytics/format";
import type { PayableRow } from "@/lib/accounting/payables";

export function ComplianceHoldBanner({ heldBills }: { heldBills: PayableRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!heldBills.length) return null;

  const clearHold = async (b: PayableRow) => {
    setBusyId(b.id);
    try {
      const res = await fetch("/api/accounting/payables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_bill",
          billId: b.id,
          waiverReceived: true,
          clearHold: true,
        }),
      });
      if (res.ok) start(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-label="Bills on compliance hold"
      className="rounded-2xl border border-[#d49a89] bg-[#fdf5f3] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 shrink-0 text-[#9a2a1f]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--color-charcoal)]">
            Compliance & approval hold — {heldBills.length} {heldBills.length === 1 ? "bill" : "bills"} blocked from Friday Melio run
          </h2>
        </div>
        <p className="text-xs text-[var(--color-charcoal-light)]">
          SOP-004: PM verification, conditional lien waiver & active COI required before disbursement.
        </p>
      </div>
      <ul className="mt-3 divide-y divide-[var(--color-stone)]">
        {heldBills.map((b) => {
          const isBusy = busyId === b.id || pending;
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-charcoal)]">
                  <Link href={`/app/accounting/payables/bill/${b.id}`} className="underline underline-offset-2">
                    {b.vendorName} · {b.billNumber}
                  </Link>{" "}
                  <span className="ml-1.5 font-semibold tabular-nums">{formatValue("money", b.balanceCents)}</span>
                </p>
                <p className="text-xs text-[#9a2a1f]">
                  {b.holdReason || b.statusLabel} · {b.job}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => clearHold(b)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--color-teal)] px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Verify & queue for Friday run
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BillDetailControls({ bill }: { bill: PayableRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState("melio");
  const [reference, setReference] = useState("");
  const [amountDollars, setAmountDollars] = useState((bill.balanceCents / 100).toFixed(2));
  const [msg, setMsg] = useState<string | null>(null);

  const approveOrClearHold = async () => {
    setMsg(null);
    const res = await fetch("/api/accounting/payables", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_bill",
        billId: bill.id,
        waiverReceived: true,
        clearHold: true,
      }),
    });
    if (res.ok) {
      setMsg("Bill verified & scheduled for Friday pay run");
      start(() => router.refresh());
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const cents = Math.round(Number(amountDollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return;

    const res = await fetch("/api/accounting/payables", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record_payment",
        billId: bill.id,
        amountCents: cents,
        method,
        reference: reference || `${method.toUpperCase()}-${new Date().toISOString().slice(0, 10)}`,
      }),
    });
    if (res.ok) {
      setMsg("Payment recorded");
      start(() => router.refresh());
    }
  };

  if (bill.balanceCents <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-stone)] bg-[#faf7f2] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {bill.isOnHold ? (
          <button
            type="button"
            disabled={pending}
            onClick={approveOrClearHold}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--color-teal)] px-3.5 text-xs font-medium text-white disabled:opacity-50"
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Verify waiver & schedule for Friday run
          </button>
        ) : null}
        {msg ? <span className="text-xs font-medium text-[#2f6b4a]">{msg}</span> : null}
      </div>

      <form onSubmit={recordPayment} className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--color-charcoal-light)]">
          Pay amount ($)
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            className="ml-1.5 w-28 rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-1.5 text-xs font-medium tabular-nums text-[var(--color-charcoal)]"
          />
        </label>
        <label className="sr-only" htmlFor="pay-method">
          Payment method
        </label>
        <select
          id="pay-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-charcoal)]"
        >
          <option value="melio">Melio ACH</option>
          <option value="ach">Direct ACH</option>
          <option value="check">Check</option>
          <option value="card">Card</option>
        </select>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Ref / Melio ID (optional)"
          className="w-40 rounded-lg border border-[var(--color-stone-mid)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-charcoal)]"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--color-teal)] bg-white px-3 text-xs font-medium text-[var(--color-teal)] hover:bg-[var(--color-cream)] disabled:opacity-50"
        >
          <CreditCard className="size-3.5" aria-hidden="true" />
          Record payment
        </button>
      </form>
    </div>
  );
}

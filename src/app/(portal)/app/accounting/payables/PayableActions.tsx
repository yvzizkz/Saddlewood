"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, CreditCard, ShieldAlert } from "lucide-react";

import { formatValue } from "@/lib/analytics/format";
import type { PayableRow } from "@/lib/accounting/payables";
import { holdsOf, type Hold } from "@/lib/accounting/payablesRules";

// One button per hold (SOP-004): the waiver came in, the PM approved, the COI
// was renewed. A COI hold clears only once the sub's COI is current again.
const HOLD_ACTION: Record<Hold, string> = { waiver: "Waiver received", approval: "Approve", coi: "COI renewed" };

function holdsOfRow(b: PayableRow): Hold[] {
  return holdsOf({
    kind: b.vendorKind,
    status: b.status,
    waiverStatus: b.waiverStatus,
    coiExpired: b.coiStatus === "expired",
    coiMissing: b.coiStatus === "missing",
  });
}

async function clearHoldRequest(billId: string, hold: Hold): Promise<string | null> {
  const res = await fetch("/api/accounting/payables", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update_bill", billId, clearHold: hold }),
  });
  if (res.ok) return null;
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not clear the hold.";
}

function HoldButtons({ bill, busy, onClear }: { bill: PayableRow; busy: boolean; onClear: (hold: Hold) => void }) {
  return (
    <>
      {holdsOfRow(bill).map((hold) =>
        hold === "coi" && (bill.coiStatus === "expired" || bill.coiStatus === "missing") ? (
          <Link key={hold} href="/app/subs" className="text-xs font-medium text-[#9a2a1f] underline underline-offset-2">
            {bill.coiStatus === "missing" ? "COI missing: add it on the sub" : "COI expired: renew it on the sub"}
          </Link>
        ) : (
          <button
            key={hold}
            type="button"
            disabled={busy}
            onClick={() => onClear(hold)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--color-teal)] px-3 text-xs font-medium text-white disabled:opacity-50"
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {HOLD_ACTION[hold]}
          </button>
        ),
      )}
    </>
  );
}

export function ComplianceHoldBanner({ heldBills }: { heldBills: PayableRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!heldBills.length) return null;

  const clear = async (b: PayableRow, hold: Hold) => {
    setBusyId(b.id);
    setError(null);
    try {
      const err = await clearHoldRequest(b.id, hold);
      if (err) setError(`${b.vendorName} ${b.billNumber}: ${err}`);
      else start(() => router.refresh());
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
                  <span className="ml-1.5 font-semibold tabular-nums">{formatValue("money", b.payableNowCents)}</span>
                </p>
                <p className="text-xs text-[#9a2a1f]">
                  {b.holdReason || b.statusLabel} · {b.job}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <HoldButtons bill={b} busy={isBusy} onClear={(hold) => clear(b, hold)} />
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-xs text-[#9a2a1f]">{error}</p> : null}
    </section>
  );
}

export function BillDetailControls({ bill }: { bill: PayableRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState("melio");
  const [reference, setReference] = useState("");
  // What is payable now; retainage is paid only when an owner releases it (below).
  const [amountDollars, setAmountDollars] = useState(((bill.payableNowCents || bill.retainageHeldCents) / 100).toFixed(2));
  const [releaseRetainage, setReleaseRetainage] = useState(bill.payableNowCents <= 0);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [waiverInHand, setWaiverInHand] = useState(false);
  const isSub = bill.vendorKind === "sub";

  const clear = async (hold: Hold) => {
    setMsg(null);
    setErr(null);
    const e = await clearHoldRequest(bill.id, hold);
    if (e) return setErr(e);
    setMsg(`${HOLD_ACTION[hold]}: done`);
    start(() => router.refresh());
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const cents = Math.round(Number(amountDollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return;
    if (isSub && !waiverInHand) return setErr("Check that the lien waiver for this payment is in hand (SOP-004).");
    if (cents > bill.payableNowCents && !releaseRetainage) {
      return setErr(`Only ${formatValue("money", bill.payableNowCents)} is payable now; the rest is retainage. Tick "Release retainage" to pay it.`);
    }

    const res = await fetch("/api/accounting/payables", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record_payment",
        billId: bill.id,
        amountCents: cents,
        method,
        reference: reference || `${method.toUpperCase()}-${new Date().toISOString().slice(0, 10)}`,
        waiverCollected: isSub ? waiverInHand : undefined,
        releaseRetainage: cents > bill.payableNowCents && releaseRetainage ? true : undefined,
      }),
    });
    if (res.ok) {
      setMsg("Payment recorded");
      start(() => router.refresh());
    } else {
      setErr(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not record the payment.");
    }
  };

  if (bill.balanceCents <= 0 || bill.status === "void") return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-stone)] bg-[#faf7f2] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {bill.isOnHold ? <HoldButtons bill={bill} busy={pending} onClear={clear} /> : null}
        {msg ? <span className="text-xs font-medium text-[#2f6b4a]">{msg}</span> : null}
        {err ? <span className="text-xs font-medium text-[#9a2a1f]">{err}</span> : null}
      </div>

      {bill.isOnHold ? (
        <p className="text-xs text-[var(--color-charcoal-light)]">Payment opens once every hold is cleared.</p>
      ) : (
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
        {isSub ? (
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-charcoal)]">
            <input type="checkbox" checked={waiverInHand} onChange={(e) => setWaiverInHand(e.target.checked)} />
            Lien waiver for this payment is in hand
          </label>
        ) : null}
        {bill.retainageHeldCents > 0 ? (
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-charcoal)]">
            <input type="checkbox" checked={releaseRetainage} onChange={(e) => setReleaseRetainage(e.target.checked)} />
            Release retainage ({formatValue("money", bill.retainageHeldCents)} held)
          </label>
        ) : null}
      </form>
      )}
    </div>
  );
}

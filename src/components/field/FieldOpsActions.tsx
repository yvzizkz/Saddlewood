"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_TRADES, SELF_PERFORMED, tradeLabel } from "@/lib/accounting/tradeList";
import {
  CHECKLIST_SETS,
  CHECKLIST_STAGE_LABEL,
  CHECKLIST_TRADES,
  checklistTradeFor,
  type ChecklistRow,
  type ChecklistStage,
  type ChecklistTrade,
} from "@/lib/field/checklists";
import { onSite, toggleOnSite } from "@/lib/field/tradesOnSite";

export function ChecklistCard({ checklist }: { checklist: ChecklistRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggleItem(itemKey: string) {
    setBusy(true);
    await fetch("/api/field", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checklist.toggle", id: checklist.id, itemKey }),
    });
    setBusy(false);
    router.refresh();
  }

  async function setStatus(status: "open" | "passed" | "blocked") {
    setBusy(true);
    await fetch("/api/field", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "checklist.toggle", id: checklist.id, status }),
    });
    setBusy(false);
    router.refresh();
  }

  const badgeClass =
    checklist.status === "passed"
      ? "bg-[#e7f4ea] text-[#1f6a3b]"
      : checklist.status === "blocked"
        ? "bg-[#fae8e6] text-[#9a2a1f]"
        : "bg-[#fdf3dc] text-[#8a6100]";

  return (
    <div className="rounded-lg border border-[var(--color-stone)] bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--color-charcoal)]">{checklist.stageLabel}</p>
          <p className="text-xs text-[var(--color-charcoal-light)]">
            {[checklist.phaseName, checklist.locationLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${badgeClass}`}>
            {checklist.status}
          </span>
          {checklist.status !== "passed" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus("passed")}
              className="rounded border border-[var(--color-stone)] px-2 py-0.5 text-xs text-[var(--color-charcoal)] hover:border-[var(--color-teal)]"
            >
              Pass gate
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus("open")}
              className="rounded border border-[var(--color-stone)] px-2 py-0.5 text-xs text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      <ul className="mt-2.5 space-y-1.5 border-t border-[var(--color-stone)]/70 pt-2.5">
        {checklist.items.map((it) => (
          <li key={it.key} className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={it.checked}
              disabled={busy}
              onChange={() => toggleItem(it.key)}
              className="mt-0.5 rounded border-[var(--color-stone)]"
            />
            <span className={it.checked ? "text-[var(--color-charcoal-light)] line-through" : "text-[var(--color-charcoal)]"}>
              {it.label}
              {it.note ? <span className="ml-1 text-[var(--color-charcoal-light)]">({it.note})</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {checklist.note ? <p className="mt-2 text-xs text-[var(--color-charcoal-light)]">{checklist.note}</p> : null}
    </div>
  );
}

export function NewChecklistForm({
  jobKey,
  phases,
}: {
  jobKey: string;
  phases: { id: number; ord: number; name: string; trade?: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phaseId, setPhaseId] = useState<string>(phases[0]?.id ? String(phases[0].id) : "");
  // The checklist follows the trade: the phase's own when it has one (plumbing, electrical, HVAC), else drywall's sequence.
  const [trade, setTrade] = useState<ChecklistTrade>(checklistTradeFor(phases[0]?.trade));
  const [stage, setStage] = useState<ChecklistStage>(CHECKLIST_SETS[checklistTradeFor(phases[0]?.trade)][0]);

  function pickTrade(t: ChecklistTrade) {
    setTrade(t);
    setStage(CHECKLIST_SETS[t][0]);
  }

  function pickPhase(id: string) {
    setPhaseId(id);
    const ph = phases.find((p) => String(p.id) === id);
    if (ph?.trade) pickTrade(checklistTradeFor(ph.trade));
  }
  const [locationLabel, setLocationLabel] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--color-stone)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-charcoal)] hover:border-[var(--color-teal)]"
      >
        + Inspection checklist
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "checklist.create",
        job: jobKey,
        stage,
        phaseId: phaseId ? Number(phaseId) : null,
        locationLabel,
        note,
      }),
    });
    setBusy(false);
    setOpen(false);
    setLocationLabel("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-[var(--color-stone)] bg-white p-3 text-sm md:grid-cols-6">
      <select aria-label="Checklist trade" value={trade} onChange={(e) => pickTrade(e.target.value as ChecklistTrade)} className="rounded border border-[var(--color-stone)] px-2.5 py-1.5">
        {CHECKLIST_TRADES.map((t) => (
          <option key={t} value={t}>
            {tradeLabel(t)}
          </option>
        ))}
      </select>
      <select aria-label="Checklist stage" value={stage} onChange={(e) => setStage(e.target.value as ChecklistStage)} className="rounded border border-[var(--color-stone)] px-2.5 py-1.5">
        {CHECKLIST_SETS[trade].map((st) => (
          <option key={st} value={st}>
            {CHECKLIST_STAGE_LABEL[st]}
          </option>
        ))}
      </select>
      <select aria-label="Checklist phase" value={phaseId} onChange={(e) => pickPhase(e.target.value)} className="rounded border border-[var(--color-stone)] px-2.5 py-1.5">
        <option value="">Any phase</option>
        {phases.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.ord}. {p.name}
          </option>
        ))}
      </select>
      <input
        value={locationLabel}
        onChange={(e) => setLocationLabel(e.target.value)}
        placeholder="Room / wall face (e.g. Kitchen South Wall)"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Inspection note"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Add gate
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--color-charcoal-light)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NewDailyLogForm({ jobKey, today }: { jobKey: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [done, setDone] = useState("");
  const [weather, setWeather] = useState("Clear · 88°F");
  const [crewCount, setCrewCount] = useState("3");
  const [tradesOnSite, setTradesOnSite] = useState("");
  const [deliveries, setDeliveries] = useState("");
  const [visits, setVisits] = useState("");
  const [inspections, setInspections] = useState("");
  const [asked, setAsked] = useState("");
  const [decision, setDecision] = useState("");
  const [safety, setSafety] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white"
      >
        + File daily log (SOP-006)
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (done.trim().length < 2) return;
    setBusy(true);
    await fetch("/api/field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "daily_log.add",
        job: jobKey,
        day,
        done,
        weather,
        crewCount: Number(crewCount) || null,
        tradesOnSite,
        deliveries,
        visits,
        inspections,
        asked,
        decision,
        safety,
      }),
    });
    setBusy(false);
    setOpen(false);
    setDone("");
    setAsked("");
    setDecision("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2.5 rounded-lg border border-[var(--color-stone)] bg-white p-3.5 text-sm md:grid-cols-3">
      <input
        required
        value={done}
        onChange={(e) => setDone(e.target.value)}
        placeholder="Work performed today (required)"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5 md:col-span-2"
      />
      <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <input value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="Weather" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <input
        type="number"
        min={1}
        max={50}
        value={crewCount}
        onChange={(e) => setCrewCount(e.target.value)}
        placeholder="Crew count"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <div className="flex flex-col gap-1">
        <input value={tradesOnSite} onChange={(e) => setTradesOnSite(e.target.value)} placeholder="Trades on site" aria-label="Trades on site" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Our trades on site">
          {SELF_PERFORMED.map((t) => {
            const on = onSite(tradesOnSite).includes(tradeLabel(t));
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTradesOnSite(toggleOnSite(tradesOnSite, tradeLabel(t)))}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-white" : "border-[var(--color-stone)] text-[var(--color-charcoal)]"}`}
              >
                {tradeLabel(t)}
              </button>
            );
          })}
        </div>
      </div>
      <input value={deliveries} onChange={(e) => setDeliveries(e.target.value)} placeholder="Deliveries" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <input value={visits} onChange={(e) => setVisits(e.target.value)} placeholder="GC / client / architect visits" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <input value={inspections} onChange={(e) => setInspections(e.target.value)} placeholder="Inspections" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <input
        value={asked}
        onChange={(e) => setAsked(e.target.value)}
        placeholder="Client / GC directive (creates CO awaiting price)"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <input
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        placeholder="ASK: owner decision needed (routes to Marco)"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <input value={safety} onChange={(e) => setSafety(e.target.value)} placeholder="Safety notes / incidents" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <div className="flex items-center gap-2 md:col-span-3">
        <button type="submit" disabled={busy} className="rounded bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Save daily log
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--color-charcoal-light)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NewFieldReceiptForm({ jobKey, today }: { jobKey: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState("Home Depot");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<"company" | "me">("company");
  const [trade, setTrade] = useState("general");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--color-stone)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-charcoal)] hover:border-[var(--color-teal)]"
      >
        + Field receipt (normalizes to Purchases)
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number(amount)) return;
    setBusy(true);
    await fetch("/api/field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "receipt.add",
        job: jobKey,
        day: today,
        vendor,
        amount: Number(amount),
        paidBy,
        trade,
        note,
      }),
    });
    setBusy(false);
    setOpen(false);
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-[var(--color-stone)] bg-white p-3 text-sm md:grid-cols-6">
      <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <input
        required
        type="number"
        step="0.01"
        min="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount ($)"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <select value={paidBy} onChange={(e) => setPaidBy(e.target.value as "company" | "me")} className="rounded border border-[var(--color-stone)] px-2.5 py-1.5">
        <option value="company">Company card</option>
        <option value="me">Worker out-of-pocket (reimburse)</option>
      </select>
      <select aria-label="Receipt trade" value={trade} onChange={(e) => setTrade(e.target.value)} className="rounded border border-[var(--color-stone)] px-2.5 py-1.5">
        {DEFAULT_TRADES.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.label}
          </option>
        ))}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Items purchased" className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--color-charcoal-light)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NewPunchForm({ jobKey }: { jobKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [detail, setDetail] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--color-stone)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-charcoal)] hover:border-[var(--color-teal)]"
      >
        + Punch item
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 2) return;
    setBusy(true);
    await fetch("/api/field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "punch.add",
        job: jobKey,
        title,
        location,
        detail,
        dueOn: dueOn || null,
      }),
    });
    setBusy(false);
    setOpen(false);
    setTitle("");
    setLocation("");
    setDetail("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-[var(--color-stone)] bg-white p-3 text-sm md:grid-cols-5">
      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Punch item (e.g. Feather seam at reveal)"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Room / wall face (e.g. Hallway S Wall)"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <input
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Detail / trade"
        className="rounded border border-[var(--color-stone)] px-2.5 py-1.5"
      />
      <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className="rounded border border-[var(--color-stone)] px-2.5 py-1.5" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Add punch
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--color-charcoal-light)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PunchStatusButton({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = status === "open" ? "done" : "open";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/field", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "punch.status", id, status: next }),
        });
        setBusy(false);
        router.refresh();
      }}
      className="rounded border border-[var(--color-stone)] px-2 py-0.5 text-xs text-[var(--color-charcoal-light)] hover:text-[var(--color-charcoal)]"
    >
      {status === "open" ? "Mark done" : "Reopen"}
    </button>
  );
}

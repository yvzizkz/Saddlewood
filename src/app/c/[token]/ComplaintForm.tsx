"use client";

import { useState } from "react";

const INPUT = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900";

const dayOf = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** Files a complaint and says by when we'll answer. */
export function ComplaintForm({ token }: { token: string }) {
  const [f, setF] = useState({ name: "", reach: "", title: "", detail: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [replyBy, setReplyBy] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (replyBy) {
    return (
      <p role="status" className="rounded-lg bg-slate-100 p-4 text-sm text-slate-900">
        We have it. You&apos;ll hear from us by {dayOf(replyBy)}.
      </p>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/c/${token}/complaint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const body = ((await res?.json().catch(() => null)) ?? null) as { replyBy?: string; error?: string } | null;
    setBusy(false);
    if (res?.ok && body?.replyBy) setReplyBy(body.replyBy);
    else setErr(body?.error ?? "That didn't go through. Please try again.");
  };

  return (
    <form onSubmit={send} className="grid gap-3">
      <label className="text-sm font-medium text-slate-800">
        Your name
        <input className={INPUT} value={f.name} onChange={set("name")} maxLength={120} required autoComplete="name" />
      </label>
      <label className="text-sm font-medium text-slate-800">
        Best phone or email to reach you (optional)
        <input className={INPUT} value={f.reach} onChange={set("reach")} maxLength={120} />
      </label>
      <label className="text-sm font-medium text-slate-800">
        What&apos;s wrong
        <input className={INPUT} value={f.title} onChange={set("title")} maxLength={200} required />
      </label>
      <label className="text-sm font-medium text-slate-800">
        Anything else we should know
        <textarea className={INPUT} rows={4} value={f.detail} onChange={set("detail")} maxLength={2000} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? "Sending…" : "Send it"}
        </button>
        {err ? <span className="text-sm text-red-700">{err}</span> : null}
      </div>
    </form>
  );
}

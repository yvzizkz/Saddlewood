"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Calculator, CheckCircle2, CloudOff, Eye, Hammer, Loader2, Presentation as PresentIcon, Redo2, Send, ShieldCheck, Undo2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/bot/ui";
import { usd } from "@/components/sales/format";
import { ProposalView } from "@/components/sales/ProposalView";
import { priceEstimate } from "@/lib/sales/calc";
import { runChecks } from "@/lib/sales/checks";
import { buildProposal } from "@/lib/sales/presentation";
import { localId } from "@/lib/sales/templates";
import type { EstimateItem } from "@/lib/sales/types";
import { BuildPane } from "./BuildPane";
import { ChecksPane } from "./ChecksPane";
import { IssueSheet } from "./IssueSheet";
import { ItemSheet } from "./ItemSheet";
import { PresentPane } from "./PresentPane";
import { PricePane } from "./PricePane";
import { useEstimateEditor, type SaveState } from "./useEstimateEditor";
import { localDay } from "@/lib/crew/time";

// The estimate builder. It takes the whole screen: on a phone one pane at a
// time with the tabs at the thumb and the price always in view; on a laptop
// the editor on the left and the client's page, live, on the right. Every
// key re-prices the estimate, re-runs the checks and re-draws the preview, so
// what is on screen is always what would go out.

type Tab = "build" | "price" | "present" | "check" | "preview";

const TABS: { key: Tab; label: string; icon: LucideIcon; desktop: boolean }[] = [
  { key: "build", label: "Build", icon: Hammer, desktop: true },
  { key: "price", label: "Price", icon: Calculator, desktop: true },
  { key: "present", label: "Present", icon: PresentIcon, desktop: true },
  { key: "check", label: "Check", icon: ShieldCheck, desktop: true },
  { key: "preview", label: "Preview", icon: Eye, desktop: false },
];

function SaveBadge({ state, error }: { state: SaveState; error: string }) {
  const map: Record<SaveState, { text: string; tone: string; icon?: LucideIcon }> = {
    saved: { text: "Saved", tone: "text-[var(--color-charcoal-light)]", icon: CheckCircle2 },
    dirty: { text: "Editing…", tone: "text-[var(--color-charcoal-light)]" },
    saving: { text: "Saving…", tone: "text-[var(--color-charcoal-light)]", icon: Loader2 },
    offline: { text: "Offline: kept on this phone", tone: "text-[#8f6c18]", icon: CloudOff },
    conflict: { text: "Changed elsewhere", tone: "text-[#9a2a1f]", icon: AlertTriangle },
    error: { text: "Not saved", tone: "text-[#9a2a1f]", icon: AlertTriangle },
  };
  const m = map[state];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${m.tone}`} title={error || undefined} aria-live="polite">
      {Icon ? <Icon className={`size-3.5 ${state === "saving" ? "animate-spin" : ""}`} aria-hidden="true" /> : null}
      {m.text}
    </span>
  );
}

export function EstimateBuilder({ estimateId }: { estimateId: string }) {
  const ed = useEstimateEditor(estimateId);
  const [tab, setTab] = useState<Tab>("build");
  const [open, setOpen] = useState<{ sectionId: string; itemId: string } | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [issuing, setIssuing] = useState(false);

  const body = ed.body;
  const today = ed.loaded?.today ?? localDay();
  const priced = useMemo(() => (body ? priceEstimate(body) : null), [body]);
  const checks = useMemo(
    () =>
      body && priced && ed.loaded
        ? runChecks(
            body,
            {
              today,
              kind: ed.loaded.opportunity.kind,
              bidDue: ed.loaded.opportunity.bidDue,
              prior: ed.loaded.proposals.filter((p) => p.status === "issued").map((p) => ({ number: p.number, revision: p.revision, totalCents: p.totalCents, issuedAt: p.issuedAt })),
            },
            priced,
          )
        : [],
    [body, priced, ed.loaded, today],
  );
  const proposal = useMemo(() => (body && priced ? buildProposal(body, today, priced) : null), [body, priced, today]);
  const flagged = useMemo(() => new Set([...highlight, ...checks.filter((c) => c.level === "stop" && c.area === "lines").flatMap((c) => c.itemIds ?? [])]), [checks, highlight]);
  const stale = useMemo(() => new Set(checks.find((c) => c.id === "lines-stale")?.itemIds ?? []), [checks]);
  const stops = checks.filter((c) => c.level === "stop").length;

  const openItem = open && body ? body.sections.find((s) => s.id === open.sectionId)?.items.find((i) => i.id === open.itemId) ?? null : null;

  const patchItem = useCallback(
    (patch: Partial<EstimateItem>) => {
      if (!open) return;
      ed.update(
        (d) => {
          const it = d.sections.find((s) => s.id === open.sectionId)?.items.find((i) => i.id === open.itemId);
          if (it) Object.assign(it, patch);
        },
        { coalesce: true },
      );
    },
    [open, ed],
  );

  const jump = (ids: string[]) => {
    setHighlight(new Set(ids));
    setTab("build");
    setTimeout(() => document.querySelector(`[data-item="${ids[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    setTimeout(() => setHighlight(new Set()), 6000);
  };

  if (ed.loadError) {
    return (
      <div className="fixed inset-0 z-[35] flex items-center justify-center bg-[var(--color-background)] px-6">
        <div className="max-w-sm text-center">
          <p className="text-base font-medium">This estimate did not open</p>
          <p className="mt-1 text-sm text-[var(--color-charcoal-light)]">{ed.loadError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/app/sales" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--color-stone-mid)] bg-white px-4 text-sm">
              Back to Sales
            </Link>
            <Button variant="primary" onClick={() => void ed.reload()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!body || !priced || !proposal || !ed.loaded) {
    return (
      <div className="fixed inset-0 z-[35] flex items-center justify-center bg-[var(--color-background)]">
        <Loader2 className="size-6 animate-spin text-[var(--color-charcoal-light)]" aria-label="Loading" />
      </div>
    );
  }

  const o = ed.loaded.opportunity;
  const canSend = ed.loaded.can?.send ?? false;
  const r = priced.primary;
  const lead = proposal.packages.find((p) => p.recommended) ?? proposal.packages[0];
  const meta = {
    number: `EST-${o.number}`,
    date: today,
    preparedFor: { name: o.contact.company?.trim() || o.contact.name || o.title, attention: o.contact.company?.trim() ? o.contact.name : undefined },
    project: { name: o.title, address: o.address || undefined },
  };

  const pane = (t: Tab) => {
    switch (t) {
      case "build":
        return <BuildPane body={body} priced={priced} update={ed.update} flagged={flagged} stale={stale} onOpenItem={(sectionId, itemId) => setOpen({ sectionId, itemId })} />;
      case "price":
        return <PricePane body={body} priced={priced} update={ed.update} />;
      case "present":
        return <PresentPane body={body} update={ed.update} defaults={ed.loaded?.defaults?.present} />;
      case "check":
        return <ChecksPane body={body} checks={checks} proposals={ed.loaded!.proposals} update={ed.update} onJump={jump} />;
      case "preview":
        return (
          <div className="-mx-4 overflow-hidden border-y border-[var(--color-stone)] sm:mx-0 sm:rounded-2xl sm:border">
            <ProposalView proposal={proposal} meta={meta} mode="preview" compact />
          </div>
        );
    }
  };

  return (
    <div className="bot-app ph-no-capture fixed inset-0 z-[35] flex flex-col bg-[var(--color-background)]">
      {/* Top bar: back, name, save state, undo, issue. */}
      <header className="shrink-0 border-b border-[var(--color-stone)] bg-[var(--color-background)]/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur">
        <div className="flex h-14 items-center gap-1 px-2 lg:px-4">
          <Link href={`/app/sales/${o.id}`} aria-label="Back to the opportunity" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-[var(--color-charcoal)]">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-[var(--color-charcoal-light)]">
              {o.number} · {o.title}
            </p>
            <div className="flex items-center gap-2">
              <input
                value={ed.name}
                onChange={(e) => ed.setName(e.target.value)}
                aria-label="Version name"
                className="min-w-0 max-w-[14rem] flex-1 truncate bg-transparent text-[15px] font-medium text-[var(--color-charcoal)] focus:outline-none"
              />
              <SaveBadge state={ed.save} error={ed.saveError} />
            </div>
          </div>
          <button type="button" aria-label="Undo" disabled={!ed.canUndo} onClick={ed.undo} className="inline-flex size-11 items-center justify-center rounded-xl text-[var(--color-charcoal)] disabled:opacity-30">
            <Undo2 className="size-5" />
          </button>
          <button type="button" aria-label="Redo" disabled={!ed.canRedo} onClick={ed.redo} className="hidden size-11 items-center justify-center rounded-xl text-[var(--color-charcoal)] disabled:opacity-30 sm:inline-flex">
            <Redo2 className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setIssuing(true)}
            disabled={!canSend}
            title={canSend ? undefined : "The owners issue proposals (Sales settings can widen it)"}
            className="ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--color-teal)] px-3 text-sm font-medium text-white disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden="true" />
            <span>Issue</span>
          </button>
        </div>

        {/* The price, always in view. Tap to see how it is built. */}
        <button
          type="button"
          onClick={() => setTab("price")}
          className="flex w-full items-center justify-between gap-3 border-t border-[var(--color-stone)] bg-[var(--color-teal)] px-4 py-2 text-left text-white lg:hidden"
        >
          <span>
            <span className="block text-[10px] uppercase tracking-wider opacity-70">{proposal.packages.length > 1 ? lead.name : "Price"}</span>
            <span className="font-heading text-xl tabular-nums" style={{ fontFamily: "var(--font-fraunces)" }}>
              {usd(r?.sell ?? 0, { whole: true })}
            </span>
          </span>
          <span className="text-right text-xs">
            <span className={`block font-medium ${r && r.marginPct < body.pricing.marginFloorPct ? "text-[#f3b3a8]" : "text-[var(--color-gold-champagne)]"}`}>{(r?.marginPct ?? 0).toFixed(1)}% margin</span>
            <span className="block opacity-70">
              cost {usd(r?.cost ?? 0, { whole: true })}
              {stops ? ` · ${stops} to fix` : ""}
            </span>
          </span>
        </button>
      </header>

      {ed.restore ? (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Changes from {new Date(ed.restore.at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })} were kept on this device and never saved.
          <span className="ml-2 inline-flex gap-3">
            <button type="button" className="font-medium underline" onClick={ed.acceptRestore}>
              Restore them
            </button>
            <button type="button" className="underline" onClick={ed.dismissRestore}>
              Discard
            </button>
          </span>
        </div>
      ) : null}
      {ed.save === "conflict" ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {ed.saveError}.{" "}
          <button type="button" className="font-medium underline" onClick={() => void ed.reload()}>
            Load their version
          </button>{" "}
          (your copy stays on this device until you do).
        </div>
      ) : null}

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,500px)]">
        <main className="h-full overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-2xl px-4 pb-28 pt-4 lg:pb-10">
            {/* Desktop tabs. */}
            <div role="tablist" aria-label="Builder" className="mb-4 hidden rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 lg:flex">
              {TABS.filter((t) => t.desktop).map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium ${tab === t.key ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"}`}
                >
                  <t.icon className="size-4" aria-hidden="true" /> {t.label}
                  {t.key === "check" && stops ? <span className="rounded-full bg-[#9a2a1f] px-1.5 text-[10px] text-white">{stops}</span> : null}
                </button>
              ))}
            </div>
            {pane(tab === "preview" ? "preview" : tab)}
          </div>
        </main>

        {/* Desktop: the client's page, live. */}
        <aside className="hidden h-full overflow-y-auto border-l border-[var(--color-stone)] bg-[var(--color-cream)] lg:block">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-stone)] bg-[var(--color-cream)]/95 px-4 py-2 backdrop-blur">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] font-mono text-[var(--color-gold-accessible)]">What the client sees</p>
            <span className="text-xs text-[var(--color-charcoal-light)]">live</span>
          </div>
          <div className="p-4">
            <div className="overflow-hidden rounded-xl border border-[var(--color-stone)] shadow-sm">
              <ProposalView proposal={proposal} meta={meta} mode="preview" compact />
            </div>
          </div>
        </aside>
      </div>

      {/* Phone tabs, at the thumb. */}
      <nav aria-label="Builder" className="shrink-0 border-t border-[var(--color-stone)] bg-[var(--color-background)] pb-safe lg:hidden">
        <div className="flex">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setTab(t.key)}
                className="relative flex h-14 flex-1 flex-col items-center justify-center gap-1"
                style={{ color: on ? "var(--color-teal)" : "var(--color-charcoal-light)" }}
              >
                {on ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--color-gold)]" /> : null}
                <span className="relative">
                  <t.icon className="size-5" strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />
                  {t.key === "check" && stops ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#9a2a1f] px-1 text-[9px] font-bold text-white">{stops}</span>
                  ) : null}
                </span>
                <span className="text-[11px] font-medium leading-none">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <ItemSheet
        item={openItem}
        body={body}
        today={today}
        onChange={patchItem}
        onClose={() => setOpen(null)}
        onDelete={() => {
          if (!open) return;
          ed.update((d) => {
            const s = d.sections.find((x) => x.id === open.sectionId);
            if (s) s.items = s.items.filter((i) => i.id !== open.itemId);
          });
          setOpen(null);
        }}
        onDuplicate={() => {
          if (!open || !openItem) return;
          const copy = { ...structuredClone(openItem), id: localId() };
          ed.update((d) => {
            const s = d.sections.find((x) => x.id === open.sectionId);
            if (!s) return;
            const at = s.items.findIndex((i) => i.id === open.itemId);
            s.items.splice(at + 1, 0, copy);
          });
          setOpen({ sectionId: open.sectionId, itemId: copy.id });
        }}
      />

      <IssueSheet
        open={issuing}
        onClose={() => setIssuing(false)}
        estimateId={estimateId}
        proposal={proposal}
        opportunity={o}
        checks={checks}
        beforeIssue={async () => {
          await ed.saveNow();
        }}
        onIssued={() => void ed.reload()}
        emailDefaults={canSend ? ed.loaded.emailDefaults : undefined}
      />
    </div>
  );
}

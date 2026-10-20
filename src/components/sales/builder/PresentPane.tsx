"use client";

import { useState } from "react";
import { FileText, LayoutList, ListOrdered, Plus, RotateCcw, Rows3, Scale, Trash2, Trophy, type LucideIcon } from "lucide-react";
import type { Draft } from "immer";

import { INPUT } from "@/components/bot/ui";
import { localId } from "@/lib/sales/templates";
import { ALLOWANCE_DISPLAYS, MARKUP_DISPLAYS, SIGNING_MODES, type EstimateBody, type Presentation } from "@/lib/sales/types";
import { NumberField, Panel, Pill, Toggle } from "./fields";

// How the estimate goes out. The same numbers can be shown several ways:
// one price for a homeowner who wants a number, a scope with prices, every
// line, a unit-price schedule for a GC, or packages side by side. A variation
// is a set of switches; pick one, adjust any switch, and the preview follows.

type Update = (recipe: (d: Draft<EstimateBody>) => void, opts?: { coalesce?: boolean }) => void;

type Variation = { key: string; label: string; hint: string; icon: LucideIcon; set: Partial<Presentation>; needsPackages?: boolean };

export const VARIATIONS: Variation[] = [
  {
    key: "simple",
    label: "One price",
    hint: "Scope in words, one number. Homeowners who want the bottom line.",
    icon: FileText,
    set: { layout: "total", showPackages: false, showQuantities: false, showUnitPrices: false, showOptions: true, showSchedule: true, allowAccept: true },
  },
  {
    key: "scope",
    label: "Scope & prices",
    hint: "Each section with its price. The usual proposal.",
    icon: Rows3,
    set: { layout: "sections", showPackages: false, showQuantities: false, showUnitPrices: false, showOptions: true, showSchedule: true, allowAccept: true },
  },
  {
    key: "detailed",
    label: "Detailed",
    hint: "Every line with quantity and price. For the client who wants to see it all.",
    icon: LayoutList,
    set: { layout: "itemized", showPackages: false, showQuantities: true, showUnitPrices: false, showOptions: true, allowAccept: true },
  },
  {
    key: "units",
    label: "Unit-price schedule",
    hint: "Quantity × unit price = amount. Lines multiply out exactly.",
    icon: ListOrdered,
    set: { layout: "itemized", showQuantities: true, showUnitPrices: true, showPackages: false, showOptions: true },
  },
  {
    key: "choice",
    label: "Good · Better · Best",
    hint: "Packages side by side; the client picks one and adds options.",
    icon: Trophy,
    set: { layout: "sections", showPackages: true, showQuantities: false, showUnitPrices: false, showOptions: true, showSchedule: true, allowAccept: true },
    needsPackages: true,
  },
  {
    key: "gc",
    label: "GC bid",
    hint: "Scope by section, clarifications and exclusions; accepted by their subcontract, not on the link.",
    icon: Scale,
    set: { layout: "sections", showPackages: false, showOptions: true, showQuantities: false, showUnitPrices: false, showSchedule: true, showExclusions: true, allowAccept: false },
  },
];

// Each variation sets showPackages, so at most one matches what is on (the
// "choose a package" switch is what tells Scope & prices from Good-Better-Best).
function matches(p: Presentation, v: Variation): boolean {
  return Object.entries(v.set).every(([k, val]) => p[k as keyof Presentation] === val);
}

/** Library of common lines, so the usual ones are a tap away. */
const EXCLUSION_LIBRARY = [
  "Permits and permit fees unless listed above.",
  "Engineering, architectural drawings and HOA approvals.",
  "Asbestos, lead, mold or other hazardous material testing and abatement.",
  "Repair of concealed conditions found during demolition; priced by change order.",
  "Utility company fees and service upgrades.",
  "Landscaping and hardscape restoration beyond rough grade.",
  "Appliances and their installation unless listed above.",
  "Painting and wall coverings beyond the finish level stated.",
  "Bonds, unless listed above.",
  "MEP, fire protection and specialty trades.",
];

const CLARIFICATION_LIBRARY = [
  "We assume the GC / owner pulls and pays the building permit and we work under it; if directed to pull it, the fee is added by change order.",
  "Bid per the drawing set and addenda listed in this proposal; later revisions are priced by change order.",
  "Layout from the GC's control lines; dumpster by the GC.",
  "Price is based on a site walk; selections not yet made are carried as allowances.",
  "Work is scheduled Monday to Friday during normal hours; after-hours work is priced separately.",
];

function ListEditor({
  label,
  items,
  library,
  onChange,
}: {
  label: string;
  items: string[];
  library: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const suggestions = library.filter((l) => !items.includes(l));
  return (
    <div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            <textarea
              rows={Math.max(1, Math.ceil(t.length / 48))}
              className={`${INPUT} py-1.5 text-sm`}
              value={t}
              aria-label={`${label} ${i + 1}`}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))} className="inline-flex size-10 shrink-0 items-center justify-center text-[#9a2a1f]">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          className={`${INPUT} py-1.5 text-sm`}
          placeholder={`Add ${label.toLowerCase()}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <button
          type="button"
          aria-label={`Add ${label.toLowerCase()}`}
          disabled={!draft.trim()}
          onClick={() => {
            onChange([...items, draft.trim()]);
            setDraft("");
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-stone-mid)] text-[var(--color-teal)] disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {suggestions.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 6).map((s) => (
            <button key={s} type="button" onClick={() => onChange([...items, s])} className="rounded-full border border-dashed border-[var(--color-stone-mid)] px-2.5 py-1 text-left text-[11px] text-[var(--color-charcoal-light)]">
              + {s.length > 60 ? `${s.slice(0, 58)}…` : s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PresentPane({ body, update, defaults }: { body: EstimateBody; update: Update; defaults?: Presentation }) {
  const pr = body.present;
  const set = (patch: Partial<Presentation>) =>
    update((d) => {
      Object.assign(d.present, patch);
    });
  const scheduleSum = body.schedule.reduce((a, s) => a + (Number(s.pct) || 0), 0);
  // With overhead and profit on their own line every price is before markup,
  // so allowances are at budget already and the allowance choice has no effect.
  const markupLine = pr.markupDisplay === "line";
  const hasAllowances = body.sections.some((sec) => sec.items.some((i) => i.kind === "allowance" && !i.optional));

  return (
    <div className="space-y-3">
      <Panel
        title="Variation"
        action={
          defaults ? (
            <button
              type="button"
              onClick={() => set({ ...defaults, packageIds: pr.packageIds })}
              className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-[var(--color-teal)]"
              title="Every switch below back to the company settings"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Use company defaults
            </button>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {VARIATIONS.map((v) => {
            const on = matches(pr, v) && (!v.needsPackages || body.packages.length > 1);
            const Icon = v.icon;
            const disabled = v.needsPackages && body.packages.length < 2;
            return (
              <button
                key={v.key}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                title={disabled ? "Add two or more packages on the Price tab first" : v.hint}
                onClick={() => set(v.set)}
                className={`flex min-h-[88px] flex-col items-start rounded-xl border p-3 text-left transition-colors disabled:opacity-40 ${
                  on ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-white" : "border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]"
                }`}
              >
                <Icon className={`size-5 ${on ? "text-[var(--color-gold)]" : "text-[var(--color-gold-accessible)]"}`} aria-hidden="true" />
                <span className="mt-1.5 text-sm font-medium">{v.label}</span>
                <span className={`mt-0.5 text-[11px] leading-snug ${on ? "opacity-80" : "text-[var(--color-charcoal-light)]"}`}>{disabled ? "Needs 2+ packages" : v.hint}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="What the client sees">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(["total", "sections", "itemized"] as const).map((l) => (
            <Pill key={l} on={pr.layout === l} onClick={() => set({ layout: l })}>
              {l === "total" ? "One price" : l === "sections" ? "By section" : "Every line"}
            </Pill>
          ))}
        </div>
        <div className="divide-y divide-[var(--color-stone)]">
          {pr.layout === "itemized" ? (
            <>
              <Toggle on={pr.showQuantities} onChange={(v) => set({ showQuantities: v })} label="Quantities" />
              <Toggle on={pr.showUnitPrices} onChange={(v) => set({ showUnitPrices: v })} label="Unit prices" hint="Each line becomes quantity × unit price" />
            </>
          ) : null}
          {body.packages.length > 1 ? <Toggle on={pr.showPackages} onChange={(v) => set({ showPackages: v })} label="Let the client choose a package" hint={pr.showPackages ? undefined : "Only the recommended package goes out"} /> : null}
          <Toggle on={pr.showOptions} onChange={(v) => set({ showOptions: v })} label="Add-ons the client can tick" />
          <Toggle on={pr.showSectionNotes} onChange={(v) => set({ showSectionNotes: v })} label="Section notes" />
          <Toggle on={pr.showTimeline} onChange={(v) => set({ showTimeline: v })} label="Timeline" />
          <Toggle on={pr.showSchedule} onChange={(v) => set({ showSchedule: v })} label="Payment schedule" />
          <Toggle on={pr.showExclusions} onChange={(v) => set({ showExclusions: v })} label="What is not included" />
          <Toggle on={pr.allowAccept} onChange={(v) => set({ allowAccept: v })} label="Accept on the link" hint="Off for a GC who answers with their own subcontract" />
        </div>
        <div className="mt-3 border-t border-[var(--color-stone)] pt-3">
          <p className="mb-1.5 text-xs font-medium">Overhead and profit</p>
          <div className="flex flex-wrap gap-1.5">
            {MARKUP_DISPLAYS.map((m) => (
              <Pill key={m.key} on={pr.markupDisplay === m.key} title={m.hint} onClick={() => set({ markupDisplay: m.key })}>
                {m.label}
              </Pill>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">{MARKUP_DISPLAYS.find((m) => m.key === pr.markupDisplay)?.hint}</p>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium">Allowances</p>
          <div className="flex flex-wrap gap-1.5">
            {ALLOWANCE_DISPLAYS.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-pressed={!markupLine && pr.allowanceDisplay === a.key}
                disabled={markupLine}
                title={a.hint}
                onClick={() => set({ allowanceDisplay: a.key })}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-40 ${
                  !markupLine && pr.allowanceDisplay === a.key ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-white" : "border-[var(--color-stone-mid)] bg-white text-[var(--color-charcoal)]"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">
            {markupLine ? "Overhead and profit are on their own line, so allowances show at budget." : ALLOWANCE_DISPLAYS.find((a) => a.key === pr.allowanceDisplay)?.hint}
            {!hasAllowances ? " (No allowances in this estimate yet.)" : ""}
          </p>
          <Toggle
            on={pr.showAllowanceAmounts}
            onChange={(v) => set({ showAllowanceAmounts: v })}
            label="Show allowance amounts"
            hint={pr.showAllowanceAmounts ? "Each allowance is named with its dollar value" : "Allowances are named; their values stay inside the price"}
          />
        </div>
        {body.packages.length > 1 && pr.showPackages ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium">Packages that go out</p>
            <div className="flex flex-wrap gap-1.5">
              {body.packages.map((pk) => {
                const on = pr.packageIds.length === 0 || pr.packageIds.includes(pk.id);
                return (
                  <Pill
                    key={pk.id}
                    on={on}
                    onClick={() => {
                      const all = body.packages.map((x) => x.id);
                      const cur = pr.packageIds.length === 0 ? all : pr.packageIds;
                      const next = on ? cur.filter((x) => x !== pk.id) : [...cur, pk.id];
                      set({ packageIds: next.length === all.length ? [] : next.length === 0 ? cur : next });
                    }}
                  >
                    {pk.name}
                  </Pill>
                );
              })}
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel title="Signing">
        <div className="space-y-2" role="radiogroup" aria-label="Who signs">
          {SIGNING_MODES.map((m) => {
            const on = pr.signing === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!pr.allowAccept}
                onClick={() => set({ signing: m.key })}
                className={`flex min-h-12 w-full flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                  on ? "border-[var(--color-teal)] bg-[var(--color-cream)] ring-1 ring-[var(--color-teal)]" : "border-[var(--color-stone-mid)] bg-white"
                }`}
              >
                <span className="text-sm font-medium text-[var(--color-charcoal)]">{m.label}</span>
                <span className="text-[11px] text-[var(--color-charcoal-light)]">{m.hint}</span>
              </button>
            );
          })}
        </div>
        {!pr.allowAccept ? <p className="mt-2 text-[11px] text-[var(--color-charcoal-light)]">Turn on &ldquo;Accept on the link&rdquo; for the client to sign here.</p> : null}
      </Panel>

      <Panel title="The words">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Title</span>
            <input className={INPUT} value={body.title} onChange={(e) => update((d) => void (d.title = e.target.value), { coalesce: true })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Opening note</span>
            <textarea
              className={INPUT}
              rows={3}
              placeholder="Thank you for having us out. Below is the work we walked through on Tuesday…"
              value={body.intro}
              onChange={(e) => update((d) => void (d.intro = e.target.value), { coalesce: true })}
            />
          </label>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Timeline</span>
              <input className={INPUT} placeholder="6–8 weeks once permits are in hand" value={body.timeline} onChange={(e) => update((d) => void (d.timeline = e.target.value), { coalesce: true })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Valid for</span>
              <NumberField label="Valid days" suffix="days" min={1} max={365} value={body.validDays} onChange={(v) => update((d) => void (d.validDays = Math.round(v) || 30), { coalesce: true })} />
            </label>
          </div>
        </div>
      </Panel>

      <Panel
        title="Payment schedule"
        action={<span className={`text-xs tabular-nums ${Math.abs(scheduleSum - 100) > 0.001 ? "text-[#9a2a1f]" : "text-[var(--color-charcoal-light)]"}`}>{scheduleSum}%</span>}
      >
        <ul className="space-y-1.5">
          {body.schedule.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <input
                className={`${INPUT} py-1.5 text-sm`}
                value={s.label}
                aria-label={`Payment step ${i + 1}`}
                onChange={(e) =>
                  update(
                    (d) => {
                      d.schedule[i].label = e.target.value;
                    },
                    { coalesce: true },
                  )
                }
              />
              <NumberField
                label={`Percent for step ${i + 1}`}
                suffix="%"
                max={100}
                value={s.pct}
                className="w-24 shrink-0"
                onChange={(v) =>
                  update(
                    (d) => {
                      d.schedule[i].pct = v;
                    },
                    { coalesce: true },
                  )
                }
              />
              <button
                type="button"
                aria-label="Remove step"
                onClick={() =>
                  update((d) => {
                    d.schedule.splice(i, 1);
                  })
                }
                className="inline-flex size-10 shrink-0 items-center justify-center text-[#9a2a1f]"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[var(--color-teal)]"
          onClick={() =>
            update((d) => {
              d.schedule.push({ id: localId("p"), label: "", pct: Math.max(0, 100 - scheduleSum) });
            })
          }
        >
          <Plus className="size-4" /> Add a step
        </button>
      </Panel>

      <Panel title="Clarifications">
        <ListEditor label="Clarification" items={body.clarifications} library={CLARIFICATION_LIBRARY} onChange={(next) => update((d) => void (d.clarifications = next), { coalesce: true })} />
      </Panel>
      <Panel title="Not included">
        <ListEditor label="Exclusion" items={body.exclusions} library={EXCLUSION_LIBRARY} onChange={(next) => update((d) => void (d.exclusions = next), { coalesce: true })} />
      </Panel>
      <Panel title="Terms">
        <textarea className={`${INPUT} text-sm`} rows={8} value={body.terms} onChange={(e) => update((d) => void (d.terms = e.target.value), { coalesce: true })} />
        <p className="mt-1 text-[11px] text-[var(--color-charcoal-light)]">One term per line. The default is SOP-007&apos;s short form: Marco&apos;s values, pending counsel&apos;s review.</p>
      </Panel>
    </div>
  );
}

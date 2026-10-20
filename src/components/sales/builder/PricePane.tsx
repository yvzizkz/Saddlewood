"use client";

import { useState } from "react";
import { Plus, Sparkles, Star, Trash2 } from "lucide-react";
import type { Draft } from "immer";

import { Button, Chip, INPUT } from "@/components/bot/ui";
import { usd } from "@/components/sales/format";
import { perSquareFoot, profitForTarget, upliftFactor, type Priced, type Rollup } from "@/lib/sales/calc";
import { RATE_CARD } from "@/lib/sales/catalog";
import { localId } from "@/lib/sales/templates";
import type { EstimateBody, Pricing } from "@/lib/sales/types";
import { NumberField, Panel, Toggle } from "./fields";

// The money side: the markups, the cascade worked out line by line, the
// margin against the floor, packages, and "hit a number" (the client said 85:
// what profit is left at 85?). The cascade is the pipeline's, so a price
// built here matches one built on the Mac.

type Update = (recipe: (d: Draft<EstimateBody>) => void, opts?: { coalesce?: boolean }) => void;

function Waterfall({ r, label }: { r: Rollup; label: string }) {
  const rows: [string, number, string?][] = [
    ["Material", r.material],
    ["Waste", r.waste],
    ["Material tax", r.tax],
    [`Labor${r.laborHours ? ` · ${r.laborHours.toLocaleString("en-US")} hr` : ""}`, r.labor],
    ["Hidden uplift", r.uplift, "never shown to the client"],
    ["Subcontractors", r.sub],
    ["GC markup on subs", r.subMarkup],
    ["Equipment", r.equipment],
    ["Other costs", r.other],
    ["Allowances", r.allowance],
  ];
  const tail: [string, number][] = [
    ["Contingency", r.contingency],
    ["Overhead", r.overhead],
    ["Profit", r.profit],
    ["Rounding", r.rounding],
  ];
  const bar = (v: number) => (r.sell > 0 ? Math.max(1.5, (v / r.sell) * 100) : 0);
  return (
    <div>
      <p className="mb-2 text-xs text-[var(--color-charcoal-light)]">{label}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows
            .filter(([, v]) => v !== 0)
            .map(([k, v, hint]) => (
              <tr key={k}>
                <td className="py-1 pr-2 text-[var(--color-charcoal)]">
                  {k}
                  {hint ? <span className="block text-[10px] text-[var(--color-charcoal-light)]">{hint}</span> : null}
                </td>
                <td className="w-24 py-1">
                  <span className="block h-1.5 rounded-full bg-[var(--color-stone-mid)]" style={{ width: `${bar(v)}%` }} />
                </td>
                <td className="py-1 text-right tabular-nums">{usd(v)}</td>
              </tr>
            ))}
          <tr className="border-t border-[var(--color-stone)] font-medium">
            <td className="py-1.5">Direct cost</td>
            <td />
            <td className="py-1.5 text-right tabular-nums">{usd(r.direct)}</td>
          </tr>
          {tail
            .filter(([, v]) => v !== 0)
            .map(([k, v]) => (
              <tr key={k}>
                <td className="py-1 pr-2 text-[var(--color-charcoal)]">{k}</td>
                <td className="w-24 py-1">
                  <span className="block h-1.5 rounded-full bg-[var(--color-gold)]" style={{ width: `${bar(v)}%` }} />
                </td>
                <td className="py-1 text-right tabular-nums">{usd(v)}</td>
              </tr>
            ))}
          <tr className="border-t-2 border-[var(--color-teal)] text-base font-semibold">
            <td className="py-2">Sell</td>
            <td />
            <td className="py-2 text-right tabular-nums text-[var(--color-teal)]">{usd(r.sell)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Pct({ label, value, onChange, hint }: { label: string; value: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-[var(--color-charcoal)]">
        {label}
        {hint ? <span className="font-normal text-[var(--color-charcoal-light)]">{hint}</span> : null}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={40}
          step={0.5}
          value={value}
          aria-label={`${label} slider`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 min-w-0 flex-1 accent-[var(--color-teal)]"
        />
        <NumberField label={label} value={value} suffix="%" max={100} onChange={onChange} className="w-24" />
      </div>
    </label>
  );
}

export function PricePane({ body, priced, update }: { body: EstimateBody; priced: Priced; update: Update }) {
  const p = body.pricing;
  const set = <K extends keyof Pricing>(k: K, v: Pricing[K]) =>
    update(
      (d) => {
        d.pricing[k] = v as Draft<Pricing>[K];
      },
      { coalesce: true },
    );
  const [target, setTarget] = useState(0);
  const [advanced, setAdvanced] = useState(p.targetOverheadPct != null || p.targetProfitPct != null);
  const r = priced.primary;
  const lead = body.packages.find((x) => x.recommended) ?? body.packages[0];
  const solved = target > 0 ? profitForTarget(body, Math.round(target * 100)) : null;
  const psf = r ? perSquareFoot(body, r.sell) : null;
  const floorOk = r ? r.marginPct >= p.marginFloorPct : true;

  return (
    <div className="space-y-3">
      {/* The headline: price, margin, against the floor. */}
      {r ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-[var(--color-teal)] px-3 py-3 text-white">
            <p className="text-[10px] uppercase tracking-wider opacity-70">Sell{lead ? ` · ${lead.name}` : ""}</p>
            <p className="font-heading text-xl tabular-nums" style={{ fontFamily: "var(--font-fraunces)" }}>
              {usd(r.sell, { whole: true })}
            </p>
          </div>
          <div className={`rounded-2xl px-3 py-3 ${floorOk ? "bg-[rgba(47,107,74,0.12)] text-[#2f6b4a]" : "bg-[rgba(154,42,31,0.10)] text-[#9a2a1f]"}`}>
            <p className="text-[10px] uppercase tracking-wider opacity-80">Margin</p>
            <p className="font-heading text-xl tabular-nums" style={{ fontFamily: "var(--font-fraunces)" }}>
              {r.marginPct.toFixed(1)}%
            </p>
            <p className="text-[10px]">floor {p.marginFloorPct}%</p>
          </div>
          <div className="rounded-2xl bg-[var(--color-cream)] px-3 py-3 text-[var(--color-charcoal)]">
            <p className="text-[10px] uppercase tracking-wider opacity-70">{psf ? "Per SF" : "Gross profit"}</p>
            <p className="font-heading text-xl tabular-nums" style={{ fontFamily: "var(--font-fraunces)" }}>
              {psf ? `$${psf.toFixed(2)}` : usd(r.sell - r.cost, { whole: true })}
            </p>
          </div>
        </div>
      ) : null}

      <Panel title="Markups">
        <div className="space-y-3">
          <Pct label="Contingency" value={p.contingencyPct} onChange={(v) => set("contingencyPct", v)} hint="not on allowances" />
          <Pct label="Overhead" value={p.overheadPct} onChange={(v) => set("overheadPct", v)} />
          <Pct label="Profit" value={p.profitPct} onChange={(v) => set("profitPct", v)} />
          <Pct label="GC markup on subs" value={p.subMarkupPct} onChange={(v) => set("subMarkupPct", v)} />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Labor rate (loaded)</span>
              <NumberField label="Labor rate" prefix="$" suffix="/hr" value={p.laborRate} onChange={(v) => set("laborRate", v)} />
              {Math.abs(p.laborRate - RATE_CARD.laborRate) > 0.005 ? (
                <button type="button" className="mt-1 text-[11px] text-[var(--color-teal)] underline" onClick={() => set("laborRate", RATE_CARD.laborRate)}>
                  Rate card: ${RATE_CARD.laborRate}
                </button>
              ) : (
                <span className="mt-1 block text-[11px] text-[var(--color-charcoal-light)]">Rate card, effective {RATE_CARD.effective.slice(0, 7)}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Material tax</span>
              <NumberField label="Material tax" suffix="%" max={20} value={p.materialTaxPct} onChange={(v) => set("materialTaxPct", v)} />
              <span className="mt-1 block text-[11px] text-[var(--color-charcoal-light)]">0 under the prime&apos;s 5005</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Round the price up to</span>
              <select className={INPUT} value={p.roundTo} onChange={(e) => set("roundTo", Number(e.target.value))}>
                <option value={0}>The cent</option>
                <option value={1}>$1</option>
                <option value={10}>$10</option>
                <option value={50}>$50</option>
                <option value={100}>$100</option>
                <option value={500}>$500</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Margin floor</span>
              <NumberField label="Margin floor" suffix="%" max={90} value={p.marginFloorPct} onChange={(v) => set("marginFloorPct", v)} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium">Square feet (for $/SF)</span>
              <NumberField
                label="Square feet"
                suffix="SF"
                value={body.area ?? 0}
                placeholder="optional"
                onChange={(v) =>
                  update(
                    (d) => {
                      d.area = v > 0 ? v : null;
                    },
                    { coalesce: true },
                  )
                }
              />
            </label>
          </div>
          <div className="border-t border-[var(--color-stone)] pt-1">
            <Toggle
              on={advanced}
              onChange={(on) => {
                setAdvanced(on);
                if (!on)
                  update((d) => {
                    d.pricing.targetOverheadPct = null;
                    d.pricing.targetProfitPct = null;
                  });
              }}
              label="Show lean markup, recover the target"
              hint="A hidden uplift in material and labor (PREFERENCES, Margin Strategy)"
            />
            {advanced ? (
              <div className="grid grid-cols-2 gap-2 pb-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">Target overhead</span>
                  <NumberField label="Target overhead" suffix="%" value={p.targetOverheadPct ?? p.overheadPct} onChange={(v) => set("targetOverheadPct", v)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">Target profit</span>
                  <NumberField label="Target profit" suffix="%" value={p.targetProfitPct ?? p.profitPct} onChange={(v) => set("targetProfitPct", v)} />
                </label>
                <p className="col-span-2 text-[11px] text-[var(--color-charcoal-light)]">Uplift ×{upliftFactor(p).toFixed(4)} on material and labor.</p>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="Hit a number">
        <p className="mb-2 text-xs text-[var(--color-charcoal-light)]">The client has a figure in mind. See the profit left at that price{lead ? ` for ${lead.name}` : ""}.</p>
        <div className="flex gap-2">
          <NumberField label="Target price" prefix="$" value={target} placeholder="85,000" onChange={setTarget} className="flex-1" />
          <Button
            disabled={solved === null}
            onClick={() => {
              if (solved !== null) update((d) => void (d.pricing.profitPct = solved));
            }}
          >
            Use it
          </Button>
        </div>
        {target > 0 ? (
          solved === null ? (
            <p className="mt-2 text-sm text-[#9a2a1f]">Below what the work costs with contingency and overhead. Cut scope, not profit.</p>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-charcoal)]">
              Profit would be <strong>{solved.toFixed(2)}%</strong>
              {solved < p.profitPct ? <Chip tone="warn">down from {p.profitPct}%</Chip> : <Chip tone="ok">up from {p.profitPct}%</Chip>}
            </p>
          )
        ) : null}
      </Panel>

      <Panel
        title="Packages"
        action={
          body.packages.length < 4 ? (
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-[var(--color-teal)]"
              onClick={() =>
                update((d) => {
                  const names = ["Essential", "Signature", "Premier", "Custom"];
                  d.packages.push({ id: localId("p"), name: names[d.packages.length] ?? "Package", highlights: [], recommended: d.packages.length === 1 });
                })
              }
            >
              <Plus className="size-3.5" /> Add
            </button>
          ) : null
        }
      >
        {body.packages.length === 0 ? (
          <p className="text-sm text-[var(--color-charcoal-light)]">
            One price. Add packages (good, better, best) to give the client a choice; each line then says which packages carry it.
          </p>
        ) : (
          <div className="space-y-3">
            {body.packages.map((pk) => {
              const pr = priced.packages[pk.id];
              return (
                <div key={pk.id} className="rounded-xl border border-[var(--color-stone)] p-3">
                  <div className="flex items-center gap-2">
                    <input
                      className={`${INPUT} py-1.5`}
                      value={pk.name}
                      aria-label="Package name"
                      onChange={(e) =>
                        update(
                          (d) => {
                            const t = d.packages.find((x) => x.id === pk.id);
                            if (t) t.name = e.target.value;
                          },
                          { coalesce: true },
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={pk.recommended ? "Recommended" : "Make recommended"}
                      aria-pressed={!!pk.recommended}
                      onClick={() =>
                        update((d) => {
                          for (const x of d.packages) x.recommended = x.id === pk.id;
                        })
                      }
                      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl border ${pk.recommended ? "border-[var(--color-gold)] bg-[rgba(212,175,55,0.2)] text-[#8f6c18]" : "border-[var(--color-stone-mid)] text-[var(--color-charcoal-light)]"}`}
                    >
                      <Star className="size-4" fill={pk.recommended ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete package"
                      onClick={() =>
                        update((d) => {
                          d.packages = d.packages.filter((x) => x.id !== pk.id);
                          for (const s of d.sections) for (const i of s.items) if (i.packages) i.packages = i.packages.filter((x) => x !== pk.id);
                          if (d.packages.length && !d.packages.some((x) => x.recommended)) d.packages[0].recommended = true;
                        })
                      }
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-stone-mid)] text-[#9a2a1f]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <input
                    className={`${INPUT} mt-2 py-1.5 text-sm`}
                    placeholder="Tagline: e.g. Quality finishes, smart value"
                    value={pk.tagline ?? ""}
                    onChange={(e) =>
                      update(
                        (d) => {
                          const t = d.packages.find((x) => x.id === pk.id);
                          if (t) t.tagline = e.target.value;
                        },
                        { coalesce: true },
                      )
                    }
                  />
                  <textarea
                    className={`${INPUT} mt-2 py-1.5 text-sm`}
                    rows={2}
                    placeholder={"Highlights, one per line:\nQuartz countertops\nSoft-close drawers"}
                    value={(pk.highlights ?? []).join("\n")}
                    onChange={(e) =>
                      update(
                        (d) => {
                          const t = d.packages.find((x) => x.id === pk.id);
                          if (t) t.highlights = e.target.value.split("\n").slice(0, 8);
                        },
                        { coalesce: true },
                      )
                    }
                  />
                  {pr ? (
                    <p className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-[var(--color-charcoal-light)]">
                        {pr.marginPct.toFixed(1)}% margin · cost {usd(pr.cost, { whole: true })}
                      </span>
                      <span className="font-medium tabular-nums">{usd(pr.sell, { whole: true })}</span>
                    </p>
                  ) : null}
                </div>
              );
            })}
            <p className="flex items-start gap-1.5 text-[11px] text-[var(--color-charcoal-light)]">
              <Sparkles className="mt-0.5 size-3 shrink-0" /> Lines marked for one package (in the line editor) price only there; unmarked lines are in every package.
            </p>
          </div>
        )}
      </Panel>

      <Panel title="How the price is built">
        {Object.entries(priced.packages).map(([id, roll]) => (
          <div key={id || "base"} className="mb-4 last:mb-0">
            <Waterfall r={roll} label={body.packages.find((x) => x.id === id)?.name ?? "Base price"} />
          </div>
        ))}
        {Object.keys(priced.options).length ? (
          <div className="mt-3 border-t border-[var(--color-stone)] pt-3">
            <p className="mb-1 text-xs text-[var(--color-charcoal-light)]">Add-ons, each priced on its own</p>
            {body.sections
              .flatMap((s) => s.items)
              .filter((i) => i.optional)
              .map((i) => (
                <p key={i.id} className="flex justify-between text-sm">
                  <span className="truncate pr-2">{i.description}</span>
                  <span className="tabular-nums">{usd(priced.options[i.id]?.sell ?? 0)}</span>
                </p>
              ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

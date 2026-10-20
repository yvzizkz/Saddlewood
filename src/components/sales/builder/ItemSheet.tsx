"use client";

import { Copy, Trash2 } from "lucide-react";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, Field, INPUT } from "@/components/bot/ui";
import { usd } from "@/components/sales/format";
import { itemDollars, rollup } from "@/lib/sales/calc";
import { ITEM_KINDS, UNITS, type EstimateBody, type EstimateItem } from "@/lib/sales/types";
import { NumberField, Pill, Toggle } from "./fields";

// One line, all of it: what the client reads, what only we read, how it is
// priced. The fields shown follow the kind of cost (an installed line has
// material and labor; a sub has the sub's price). The live readout under it
// is the line's cost and what it sells for with the markups on it.

export function ItemSheet({
  item,
  body,
  today,
  onChange,
  onDelete,
  onDuplicate,
  onClose,
}: {
  item: EstimateItem | null;
  body: EstimateBody;
  today: string;
  onChange: (patch: Partial<EstimateItem>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const open = !!item;
  const i = item;
  const p = body.pricing;
  const d = i ? itemDollars(i, p) : null;
  const r = i ? rollup([{ ...i, optional: false }], p) : null;
  const usesMat = i?.kind === "installed" || i?.kind === "material";
  const usesLab = i?.kind === "installed" || i?.kind === "labor";
  const usesCost = i && !usesMat && !usesLab;

  return (
    <BottomSheet isOpen={open} onClose={onClose} title={i?.description || "Line"} maxHeightDvh={92} narrow>
      {i && d && r ? (
        <div className="space-y-4 pb-4 ph-no-capture">
          <Field label="Description (the client reads this)">
            <input className={INPUT} value={i.description} onChange={(e) => onChange({ description: e.target.value })} />
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">Kind of cost</p>
            <div className="flex flex-wrap gap-1.5">
              {ITEM_KINDS.map((k) => (
                <Pill key={k.key} on={i.kind === k.key} onClick={() => onChange({ kind: k.key })}>
                  {k.short}
                </Pill>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Field label="Quantity">
              <NumberField label="Quantity" value={i.qty} onChange={(qty) => onChange({ qty })} />
            </Field>
            <Field label="Unit">
              <select className={INPUT} value={i.unit} onChange={(e) => onChange({ unit: e.target.value })}>
                {[...new Set([i.unit, ...UNITS])].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
          </div>

          {usesMat ? (
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Field label={`Material $ / ${i.unit}`}>
                <NumberField label="Material per unit" prefix="$" value={i.mat} onChange={(mat) => onChange({ mat })} />
              </Field>
              <Field label="Waste">
                <NumberField label="Waste percent" suffix="%" value={i.wastePct} max={100} onChange={(wastePct) => onChange({ wastePct })} />
              </Field>
            </div>
          ) : null}

          {usesLab ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Hours / ${i.unit}`} hint={i.hrs > 0 ? `at $${(i.rate ?? p.laborRate).toFixed(2)}/hr loaded` : "or a labor $ per unit →"}>
                <NumberField label="Hours per unit" value={i.hrs} onChange={(hrs) => onChange({ hrs })} />
              </Field>
              <Field label={`Labor $ / ${i.unit}`} hint={i.hrs > 0 ? "hours win while set" : "a piece rate"}>
                <NumberField label="Labor dollars per unit" prefix="$" value={i.lab} onChange={(lab) => onChange({ lab })} />
              </Field>
            </div>
          ) : null}

          {usesLab && i.hrs > 0 ? (
            <Field label="Labor rate for this line" hint="Blank = the estimate's rate. Rates are fully loaded: never add burden on top.">
              <NumberField
                label="Labor rate override"
                prefix="$"
                suffix="/hr"
                placeholder={p.laborRate.toFixed(2)}
                value={i.rate ?? 0}
                onChange={(rate) => onChange({ rate: rate > 0 ? rate : null })}
              />
            </Field>
          ) : null}

          {usesCost ? (
            <Field
              label={`${i.kind === "sub" ? "Sub's price" : i.kind === "allowance" ? "Allowance" : i.kind === "equipment" ? "Rental" : "Cost"} $ / ${i.unit}`}
              hint={i.kind === "sub" ? `${p.subMarkupPct}% GC markup goes on first` : i.kind === "allowance" ? "No contingency on allowances" : undefined}
            >
              <NumberField label="Cost per unit" prefix="$" value={i.cost} onChange={(cost) => onChange({ cost })} />
            </Field>
          ) : null}

          {/* The line, worked out. */}
          <div className="rounded-xl bg-[var(--color-cream)] px-3 py-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-charcoal-light)]">Our cost</span>
              <span className="tabular-nums">{usd(r.cost)}</span>
            </div>
            {d.hours > 0 ? (
              <div className="flex justify-between text-xs text-[var(--color-charcoal-light)]">
                <span>Labor hours</span>
                <span className="tabular-nums">{d.hours.toLocaleString("en-US", { maximumFractionDigits: 1 })} hr</span>
              </div>
            ) : null}
            <div className="flex justify-between font-medium">
              <span>Sells for</span>
              <span className="tabular-nums">{usd(r.sell)}</span>
            </div>
            {i.qty > 0 ? (
              <div className="flex justify-between text-xs text-[var(--color-charcoal-light)]">
                <span>per {i.unit}</span>
                <span className="tabular-nums">{usd(Math.round(r.sell / i.qty))}</span>
              </div>
            ) : null}
          </div>

          {body.packages.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--color-charcoal)]">In which packages</p>
              <div className="flex flex-wrap gap-1.5">
                <Pill on={!i.packages || i.packages.length === 0} onClick={() => onChange({ packages: [] })}>
                  All
                </Pill>
                {body.packages.map((pk) => {
                  const on = !!i.packages?.includes(pk.id);
                  return (
                    <Pill
                      key={pk.id}
                      on={on}
                      onClick={() => onChange({ packages: on ? (i.packages ?? []).filter((x) => x !== pk.id) : [...(i.packages ?? []), pk.id] })}
                    >
                      {pk.name}
                    </Pill>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-[var(--color-stone)] rounded-xl border border-[var(--color-stone)] px-3">
            <Toggle on={!!i.optional} onChange={(optional) => onChange({ optional })} label="Add-on the client can choose" hint="Priced on its own, not in the base" />
          </div>

          <Field label="Note under the line (the client reads this)">
            <input className={INPUT} value={i.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} />
          </Field>
          <Field label="Internal memo (never shown to a client)">
            <textarea className={INPUT} rows={2} value={i.memo ?? ""} onChange={(e) => onChange({ memo: e.target.value })} />
          </Field>
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label="Price confirmed on">
              <input type="date" className={INPUT} value={i.priceDate ?? ""} onChange={(e) => onChange({ priceDate: e.target.value || null })} />
            </Field>
            <Button onClick={() => onChange({ priceDate: today })}>Today</Button>
          </div>
          <Field label="Source (quote no., supplier, catalog)">
            <input className={INPUT} value={i.source ?? ""} onChange={(e) => onChange({ source: e.target.value })} />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button onClick={onDuplicate} className="flex-1">
              <Copy className="size-4" aria-hidden="true" /> Duplicate
            </Button>
            <Button variant="danger" onClick={onDelete} className="flex-1">
              <Trash2 className="size-4" aria-hidden="true" /> Delete
            </Button>
          </div>
          <Button variant="primary" full onClick={onClose}>
            Done
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}

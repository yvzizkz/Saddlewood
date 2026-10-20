"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, ChevronRight, CornerDownLeft, Plus, Trash2 } from "lucide-react";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, Chip, INPUT } from "@/components/bot/ui";
import { usd } from "@/components/sales/format";
import { inPackage, rollup, sectionSells, primaryPackageId, type Priced } from "@/lib/sales/calc";
import { CATALOG, catalogGroups, itemFromCatalog, searchCatalog, type CatalogEntry } from "@/lib/sales/catalog";
import { parseQuickLine } from "@/lib/sales/quickline";
import { localId } from "@/lib/sales/templates";
import { ITEM_KINDS, type EstimateBody, type EstimateItem, type EstimateSection } from "@/lib/sales/types";
import type { Draft } from "immer";
import { NumberField, Pill } from "./fields";

// The lines, by section. Each row says what it is, how much and what it sells
// for; tap it for everything else. At the foot of each section a line can be
// typed the way it is said ("120 sf drywall @ 2.50") or picked from the
// catalog, which carries a dated, sourced price.

type Update = (recipe: (d: Draft<EstimateBody>) => void, opts?: { coalesce?: boolean }) => void;

const KIND_SHORT = Object.fromEntries(ITEM_KINDS.map((k) => [k.key, k.short]));

function qtyText(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function unitPrice(i: EstimateItem, rate: number): string {
  const parts: string[] = [];
  if (i.mat > 0) parts.push(`$${i.mat} mat`);
  if (i.hrs > 0) parts.push(`${i.hrs} hr @ $${(i.rate ?? rate).toFixed(0)}`);
  else if (i.lab > 0) parts.push(`$${i.lab} lab`);
  if (i.cost > 0) parts.push(`$${i.cost.toLocaleString("en-US")}`);
  return parts.join(" + ") || "no price";
}

function Row({
  item,
  body,
  flagged,
  stale,
  onOpen,
}: {
  item: EstimateItem;
  body: EstimateBody;
  flagged: boolean;
  stale: boolean;
  onOpen: () => void;
}) {
  const sell = rollup([{ ...item, optional: false }], body.pricing).sell;
  const pk = body.packages.filter((p) => item.packages?.includes(p.id));
  return (
    <button
      type="button"
      onClick={onOpen}
      data-item={item.id}
      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors active:bg-[var(--color-cream)] ${flagged ? "bg-[rgba(154,42,31,0.05)]" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-[var(--color-charcoal)]">{item.description || <em className="text-[var(--color-charcoal-light)]">No description</em>}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--color-charcoal-light)]">
          <span className="tabular-nums">
            {item.qty > 0 ? `${qtyText(item.qty)} ${item.unit}` : <span className="text-[#9a2a1f]">qty?</span>}
          </span>
          <span>·</span>
          <span>{KIND_SHORT[item.kind]}</span>
          <span>·</span>
          <span className="truncate">{unitPrice(item, body.pricing.laborRate)}</span>
          {item.optional ? <Chip tone="warn">Add-on</Chip> : null}
          {pk.map((p) => (
            <Chip key={p.id} tone="ink">
              {p.name}
            </Chip>
          ))}
          {stale ? <Chip tone="bad">Old price</Chip> : null}
        </span>
      </span>
      <span className="shrink-0 pt-0.5 text-right text-[15px] font-medium tabular-nums text-[var(--color-charcoal)]">{sell > 0 ? usd(sell, { whole: true }) : "—"}</span>
    </button>
  );
}

function QuickAdd({ body, onAdd, onCatalog }: { body: EstimateBody; onAdd: (i: EstimateItem) => void; onCatalog: () => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseQuickLine(text, body.pricing.laborRate), [text, body.pricing.laborRate]);
  const add = () => {
    if (!parsed) return;
    onAdd({ id: localId(), wastePct: parsed.kind === "material" || parsed.kind === "installed" ? 10 : 0, rate: null, priceDate: null, source: "manual", ...parsed });
    setText("");
  };
  return (
    <div className="border-t border-dashed border-[var(--color-stone-mid)] px-3 py-2.5">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          enterKeyHint="done"
          placeholder={'Add a line: "120 sf drywall @ 2.50"'}
          aria-label="Add a line"
          className={`${INPUT} py-2`}
        />
        <button
          type="button"
          onClick={onCatalog}
          aria-label="Add from the catalog"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--color-stone-mid)] bg-white text-[var(--color-teal)]"
        >
          <BookOpen className="size-5" aria-hidden="true" />
        </button>
      </div>
      {parsed && text.trim() ? (
        <button type="button" onClick={add} className="mt-2 flex w-full items-center gap-2 rounded-lg bg-[var(--color-cream)] px-3 py-2 text-left text-xs text-[var(--color-charcoal)]">
          <CornerDownLeft className="size-3.5 shrink-0 text-[var(--color-gold-accessible)]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <strong>{parsed.description}</strong> · {qtyText(parsed.qty)} {parsed.unit} · {KIND_SHORT[parsed.kind]}
            {parsed.mat || parsed.lab || parsed.cost ? ` · $${(parsed.mat || parsed.lab || parsed.cost).toLocaleString("en-US")}/${parsed.unit}` : parsed.hrs ? " · at the labor rate" : " · price it next"}
          </span>
          <span className="font-medium text-[var(--color-teal)]">Add</span>
        </button>
      ) : null}
    </div>
  );
}

export function CatalogSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: CatalogEntry, qty: number) => void }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [qty, setQty] = useState(0);
  const list = searchCatalog(q).filter((c) => !group || c.group === group);
  return (
    <BottomSheet isOpen={open} onClose={onClose} title="Catalog" maxHeightDvh={90} narrow>
      {picked ? (
        <div className="space-y-3 pb-4">
          <p className="text-sm font-medium text-[var(--color-charcoal)]">{picked.description}</p>
          <p className="text-xs text-[var(--color-charcoal-light)]">
            {picked.source} · confirmed {picked.priceDate}
          </p>
          {picked.caution ? <p className="rounded-lg bg-[rgba(212,175,55,0.2)] px-3 py-2 text-xs text-[#8f6c18]">{picked.caution}</p> : null}
          <label className="block">
            <span className="mb-1 block text-xs font-medium">How many {picked.unit}?</span>
            <NumberField label="Quantity" value={qty} onChange={setQty} autoFocus />
          </label>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setPicked(null)}>
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                onPick(picked, qty);
                setPicked(null);
                setQty(0);
              }}
            >
              Add line
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 pb-4">
          <input className={INPUT} placeholder="Search: stud, drywall, foreman, lift…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the catalog" />
          <div className="flex flex-wrap gap-1.5">
            <Pill on={!group} onClick={() => setGroup(null)}>
              All
            </Pill>
            {catalogGroups().map((g) => (
              <Pill key={g} on={group === g} onClick={() => setGroup(g)}>
                {g}
              </Pill>
            ))}
          </div>
          <ul className="divide-y divide-[var(--color-stone)] rounded-xl border border-[var(--color-stone)] bg-white">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left" onClick={() => setPicked(c)}>
                  <span className="min-w-0">
                    <span className="block text-sm text-[var(--color-charcoal)]">{c.description}</span>
                    <span className="block text-[11px] text-[var(--color-charcoal-light)]">
                      {c.group} · {c.priceDate}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-[var(--color-charcoal)]">
                    {c.mat ? `$${c.mat}` : c.cost ? `$${c.cost}` : c.lab ? `$${c.lab}` : ""}
                    {c.hrs ? `${c.mat ? " + " : ""}${c.hrs} hr` : ""}
                    <span className="text-[var(--color-charcoal-light)]">/{c.unit}</span>
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 ? <li className="px-3 py-4 text-sm text-[var(--color-charcoal-light)]">Nothing matches. Type the line instead.</li> : null}
          </ul>
          <p className="text-[11px] text-[var(--color-charcoal-light)]">{CATALOG.length} entries from the rate card, verified Phoenix prices and production rates. Each keeps its date so it can go stale.</p>
        </div>
      )}
    </BottomSheet>
  );
}

export function BuildPane({
  body,
  priced,
  update,
  flagged,
  stale,
  onOpenItem,
}: {
  body: EstimateBody;
  priced: Priced;
  update: Update;
  flagged: Set<string>;
  stale: Set<string>;
  onOpenItem: (sectionId: string, itemId: string) => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [catalogFor, setCatalogFor] = useState<string | null>(null);
  const pid = primaryPackageId(body);
  const sells = sectionSells(body, pid, priced.primary?.sell ?? 0);

  const addItem = (sectionId: string, item: EstimateItem) =>
    update((d) => {
      d.sections.find((s) => s.id === sectionId)?.items.push(item);
    });

  const moveSection = (idx: number, by: number) =>
    update((d) => {
      const j = idx + by;
      if (j < 0 || j >= d.sections.length) return;
      const [s] = d.sections.splice(idx, 1);
      d.sections.splice(j, 0, s);
    });

  // The same package as the section's price beside it, or a package-only line reads as a loss.
  const sectionCost = (s: EstimateSection) => rollup(s.items.filter((i) => inPackage(i, pid)), body.pricing).cost;

  return (
    <div className="space-y-3">
      {body.sections.map((s, idx) => {
        const open = !closed.has(s.id);
        const sell = sells.get(s.id) ?? 0;
        const issues = s.items.filter((i) => flagged.has(i.id)).length;
        return (
          <section key={s.id} className="overflow-hidden rounded-2xl border border-[var(--color-stone)] bg-white">
            <div className="flex items-center gap-1 border-b border-[var(--color-stone)] bg-[var(--color-background)]/60 pl-1 pr-3">
              <button
                type="button"
                aria-label={open ? "Collapse section" : "Expand section"}
                aria-expanded={open}
                onClick={() => setClosed((c) => (c.has(s.id) ? new Set([...c].filter((x) => x !== s.id)) : new Set([...c, s.id])))}
                className="inline-flex min-h-11 min-w-9 items-center justify-center text-[var(--color-charcoal-light)]"
              >
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              <input
                value={s.name}
                aria-label="Section name"
                onChange={(e) =>
                  update(
                    (d) => {
                      const t = d.sections.find((x) => x.id === s.id);
                      if (t) t.name = e.target.value;
                    },
                    { coalesce: true },
                  )
                }
                className="min-w-0 flex-1 bg-transparent py-2 font-heading text-[17px] text-[var(--color-teal)] focus:outline-none"
                style={{ fontFamily: "var(--font-fraunces)" }}
              />
              {issues ? <Chip tone="bad">{issues}</Chip> : null}
              <span className="text-right">
                <span className="block text-sm font-medium tabular-nums text-[var(--color-charcoal)]">{usd(sell, { whole: true })}</span>
                <span className="block text-[10px] tabular-nums text-[var(--color-charcoal-light)]">cost {usd(sectionCost(s), { whole: true })}</span>
              </span>
            </div>
            {open ? (
              <>
                <div className="divide-y divide-[var(--color-stone)]">
                  {s.items.map((i) => (
                    <Row key={i.id} item={i} body={body} flagged={flagged.has(i.id)} stale={stale.has(i.id)} onOpen={() => onOpenItem(s.id, i.id)} />
                  ))}
                  {s.items.length === 0 ? <p className="px-3 py-3 text-sm text-[var(--color-charcoal-light)]">No lines yet.</p> : null}
                </div>
                <QuickAdd body={body} onAdd={(i) => addItem(s.id, i)} onCatalog={() => setCatalogFor(s.id)} />
                <div className="flex items-center gap-1 border-t border-[var(--color-stone)] px-2 py-1.5">
                  <input
                    value={s.note ?? ""}
                    placeholder="Section note for the client (optional)"
                    aria-label="Section note"
                    onChange={(e) =>
                      update(
                        (d) => {
                          const t = d.sections.find((x) => x.id === s.id);
                          if (t) t.note = e.target.value;
                        },
                        { coalesce: true },
                      )
                    }
                    className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-[var(--color-charcoal)] placeholder:text-[#9a938a] focus:outline-none"
                  />
                  <button type="button" aria-label="Move section up" disabled={idx === 0} onClick={() => moveSection(idx, -1)} className="inline-flex size-10 items-center justify-center text-[var(--color-charcoal-light)] disabled:opacity-30">
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move section down"
                    disabled={idx === body.sections.length - 1}
                    onClick={() => moveSection(idx, 1)}
                    className="inline-flex size-10 items-center justify-center text-[var(--color-charcoal-light)] disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete section"
                    onClick={() => {
                      if (s.items.length === 0 || window.confirm(`Delete "${s.name}" and its ${s.items.length} line${s.items.length === 1 ? "" : "s"}? (Undo brings it back.)`)) {
                        update((d) => {
                          d.sections = d.sections.filter((x) => x.id !== s.id);
                        });
                      }
                    }}
                    className="inline-flex size-10 items-center justify-center text-[#9a2a1f]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </>
            ) : null}
          </section>
        );
      })}

      <Button
        full
        onClick={() =>
          update((d) => {
            d.sections.push({ id: localId("s"), name: "New section", items: [] });
          })
        }
      >
        <Plus className="size-4" aria-hidden="true" /> Add a section
      </Button>

      <CatalogSheet
        open={!!catalogFor}
        onClose={() => setCatalogFor(null)}
        onPick={(c, qty) => {
          if (catalogFor) addItem(catalogFor, itemFromCatalog(c, localId(), qty));
          setCatalogFor(null);
        }}
      />
    </div>
  );
}

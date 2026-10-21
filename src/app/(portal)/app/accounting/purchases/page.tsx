import Link from "next/link";
import { redirect } from "next/navigation";

import AccountingFrame from "@/components/accounting/AccountingFrame";
import PurchaseSearch from "@/components/purchases/PurchaseSearch";
import DataTable, { type Column, type TableRow } from "@/components/data/DataTable";
import KpiHeader from "@/components/data/KpiHeader";
import { loadPurchases, type PurchaseItemRow } from "@/lib/accounting/purchases";
import CappedNotice from "@/components/accounting/CappedNotice";
import { drill, hrefOf, type DrillSpec } from "@/lib/analytics/drill";
import { inRange, periodParams, resolvePeriod } from "@/lib/analytics/period";
import { moneySeatForPage, seesCrewJob } from "@/lib/accounting/access";
import { SMALL_TRIP_CENTS } from "@/lib/crew/purchases";
import { UnmatchedBanner } from "./PurchaseActions";

export const dynamic = "force-dynamic";

const PATH = "/app/accounting/purchases";

type SP = Record<string, string | string[] | undefined>;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const seat = await moneySeatForPage("purchases");
  if (!seat) redirect("/app");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined));
  const period = resolvePeriod({ p: one("p"), from: one("from"), to: one("to") }, undefined, "mtd");
  const view = one("view") === "trips" ? "trips" : "items";

  const loaded = await loadPurchases(period.previous.from, period.to);
  // A PM's seat sees the lines on their own jobs; unmatched lines ("Which job is this?") stay with the owners.
  const allRows = loaded.rows.filter((r) => seesCrewJob(seat, r.rawJobId));
  const jobs = loaded.jobs.filter((j) => seesCrewJob(seat, j.id));
  const unmatched = seat.owner ? loaded.unmatched : [];
  const capped = loaded.capped;
  const now = allRows.filter((r) => inRange(r.purchasedOn, period.from, period.to));
  const before = allRows.filter((r) => inRange(r.purchasedOn, period.previous.from, period.previous.to));

  const spec: DrillSpec<PurchaseItemRow> = {
    path: PATH,
    title: "Purchases",
    dims: [
      { key: "trade", label: "Trade", plural: "trades", of: (r) => ({ key: r.trade, label: r.tradeLabel }), trades: true },
      { key: "job", label: "Project", plural: "projects", of: (r) => ({ key: r.jobId, label: r.job }) },
      { key: "vendor", label: "Vendor", plural: "vendors", of: (r) => ({ key: r.vendor, label: r.vendor }) },
      { key: "store", label: "Store", plural: "stores", of: (r) => ({ key: r.store, label: `${r.vendor} · ${r.store}` }) },
    ],
    value: (r) => r.lineTotalCents,
    dayOf: (r) => r.purchasedOn,
  };

  const d = drill(spec, now, period, sp, { previousRows: before });
  if (view === "trips") {
    for (const o of d.byOptions) o.href = `${o.href}&view=trips`;
    for (const s of d.breakdown.slices) if (s.href) s.href = `${s.href}&view=trips`;
  }

  const totalSpendCents = d.rows.reduce((a, r) => a + r.lineTotalCents, 0);
  const returnsCents = d.rows.reduce((a, r) => (r.lineTotalCents < 0 ? a - r.lineTotalCents : a), 0);
  const unassignedCents = d.rows.reduce((a, r) => (!r.rawJobId && !r.ignored ? a + r.lineTotalCents : a), 0);

  // Roll up trips to count total trips and small trips (< $75)
  const tripTotals = new Map<string, number>();
  for (const r of d.rows) {
    tripTotals.set(r.tripKey, (tripTotals.get(r.tripKey) ?? 0) + r.lineTotalCents);
  }
  const tripsCount = tripTotals.size;
  let smallTrips = 0;
  for (const cents of tripTotals.values()) {
    if (cents > 0 && cents < SMALL_TRIP_CENTS) smallTrips++;
  }
  const activeProjects = new Set(d.rows.map((r) => r.rawJobId).filter(Boolean)).size;

  const base = {
    ...periodParams(period),
    ...Object.fromEntries(d.filters.map((f) => [f.dim, f.key])),
    ...(view === "trips" ? { view: "trips" } : {}),
  };

  // Build either item-level rows or trip-level rows for the table
  let tableRows: TableRow[];
  let columns: Column[];
  let searchKeys: string[];

  if (view === "trips") {
    const grouped = new Map<
      string,
      {
        tripKey: string;
        purchasedOn: string;
        vendor: string;
        store: string;
        orderRef: string;
        jobId: string;
        job: string;
        trades: Set<string>;
        tradeKey: string;
        lines: number;
        totalCents: number;
        descriptions: string[];
        runner: string | null;
      }
    >();

    for (const r of d.rows) {
      const g = grouped.get(r.tripKey) ?? {
        tripKey: r.tripKey,
        purchasedOn: r.purchasedOn,
        vendor: r.vendor,
        store: r.store,
        orderRef: r.orderRef,
        jobId: r.jobId,
        job: r.job,
        trades: new Set<string>(),
        tradeKey: r.trade,
        lines: 0,
        totalCents: 0,
        descriptions: [],
        runner: r.runner,
      };
      g.trades.add(r.tradeLabel);
      g.lines += 1;
      g.totalCents += r.lineTotalCents;
      if (g.descriptions.length < 2 && r.description) g.descriptions.push(r.description);
      grouped.set(r.tripKey, g);
    }

    tableRows = [...grouped.values()].map((g) => {
      const tripHref = `${PATH}/trip/${encodeURIComponent(g.tripKey)}`;
      return {
        id: g.tripKey,
        purchasedOn: g.purchasedOn,
        tripSummary: g.descriptions.join(" · ") || g.orderRef || g.tripKey,
        tripSub: [g.orderRef ? `PO ${g.orderRef}` : "", g.runner ? `Runner: ${g.runner}` : ""].filter(Boolean).join(" · "),
        tripHref,
        trade: [...g.trades].join(", "),
        tradeHref: hrefOf(PATH, { ...base, trade: g.tradeKey }),
        job: g.job,
        jobHref: hrefOf(PATH, { ...base, job: g.jobId }),
        vendor: g.vendor,
        storeSub: g.store,
        vendorHref: hrefOf(PATH, { ...base, vendor: g.vendor }),
        lines: g.lines,
        amount: g.totalCents,
        href: tripHref,
      };
    });

    columns = [
      { key: "purchasedOn", header: "Date", kind: "date", phone: "detail" },
      { key: "tripSummary", header: "Trip / Receipt", kind: "text", subKey: "tripSub", hrefKey: "tripHref", phone: "title" },
      { key: "job", header: "Project", kind: "text", filter: true, hrefKey: "jobHref" },
      { key: "trade", header: "Trade", kind: "text", filter: true, hrefKey: "tradeHref" },
      { key: "vendor", header: "Vendor", kind: "text", filter: true, subKey: "storeSub", hrefKey: "vendorHref" },
      { key: "lines", header: "Items", kind: "count", total: true, phone: "hide" },
      { key: "amount", header: "Amount", kind: "money", total: true, phone: "value" },
    ];
    searchKeys = ["tripSummary", "tripSub", "job", "trade", "vendor", "storeSub"];
  } else {
    tableRows = d.rows.map((r) => {
      const tripHref = `${PATH}/trip/${encodeURIComponent(r.tripKey)}`;
      const skuParts = [
        r.sku ? `SKU ${r.sku}` : "",
        r.department ? `${r.department}${r.class ? ` / ${r.class}` : ""}` : "",
        r.orderRef ? `PO ${r.orderRef}` : "",
        r.runner ? `Runner: ${r.runner}` : "",
      ].filter(Boolean);

      return {
        id: r.sourceKey,
        purchasedOn: r.purchasedOn,
        description: r.description || r.sku || "Receipt item",
        skuSub: skuParts.join(" · "),
        tripHref,
        trade: r.tradeLabel,
        tradeSub: r.tradeManual ? "Manual override" : "",
        tradeHref: hrefOf(PATH, { ...base, trade: r.trade }),
        job: r.job,
        jobHref: hrefOf(PATH, { ...base, job: r.jobId }),
        vendor: r.vendor,
        storeSub: r.store,
        vendorHref: hrefOf(PATH, { ...base, vendor: r.vendor }),
        qty: r.qty,
        amount: r.lineTotalCents,
        href: tripHref,
      };
    });

    columns = [
      { key: "purchasedOn", header: "Date", kind: "date", phone: "detail" },
      { key: "description", header: "Item", kind: "text", subKey: "skuSub", hrefKey: "tripHref", phone: "title" },
      { key: "trade", header: "Trade", kind: "text", filter: true, subKey: "tradeSub", hrefKey: "tradeHref" },
      { key: "job", header: "Project", kind: "text", filter: true, hrefKey: "jobHref" },
      { key: "vendor", header: "Vendor", kind: "text", filter: true, subKey: "storeSub", hrefKey: "vendorHref" },
      { key: "qty", header: "Qty", kind: "count", phone: "hide" },
      { key: "amount", header: "Amount", kind: "money", total: true, phone: "value" },
    ];
    searchKeys = ["description", "skuSub", "trade", "job", "vendor", "storeSub"];
  }

  const toggleView = (v: "items" | "trips") =>
    hrefOf(PATH, { ...d.params, view: v === "trips" ? "trips" : undefined });

  return (
    <AccountingFrame
      sections={seat.sections}
      title="Purchases and materials"
      intro="Home Depot Pro Xtra, supply-house orders and field receipts — categorized by trade and linked to each project."
      period={period}
      crumbs={[{ label: "Accounting", href: "/app/accounting" }, ...d.crumbs]}
      filters={d.filters}
      actions={
        <div
          className="flex rounded-xl border border-[var(--color-stone)] bg-[var(--color-cream)] p-1 text-[13px] font-medium"
          role="group"
          aria-label="Rows view"
        >
          {(["items", "trips"] as const).map((v) => (
            <Link
              key={v}
              href={toggleView(v)}
              scroll={false}
              aria-current={view === v ? "true" : undefined}
              className={`rounded-lg px-3 py-1.5 ${
                view === v ? "bg-white text-[var(--color-charcoal)] shadow-sm" : "text-[var(--color-charcoal-light)]"
              }`}
            >
              {v === "items" ? "Items" : "Trips"}
            </Link>
          ))}
        </div>
      }
    >
      {capped ? <CappedNotice what="purchase lines" /> : null}
      <KpiHeader
        label="Material & purchase spend"
        value={totalSpendCents}
        kind="money"
        change={d.change}
        upIsGood={false}
        compareLabel={period.previous.label}
        stats={[
          {
            label: "Trips",
            value: tripsCount,
            kind: "count",
            hint: smallTrips > 0 ? `${smallTrips} under $75` : undefined,
          },
          {
            label: "Line items",
            value: d.rows.length,
            kind: "count",
          },
          {
            label: "Projects",
            value: activeProjects,
            kind: "count",
          },
          unassignedCents > 0
            ? {
                label: "Unassigned POs",
                value: unassignedCents,
                kind: "money",
                hint: "Tap to filter",
                href: hrefOf(PATH, { ...base, job: "unassigned" }),
              }
            : {
                label: "Returns credited",
                value: returnsCents,
                kind: "money",
              },
        ]}
        trend={d.trend}
        trendLabel={period.grain === "day" ? "Per day" : period.grain === "week" ? "Per week" : "Per month"}
        breakdown={d.breakdown}
        byOptions={d.byOptions}
      />

      {unmatched.length > 0 ? <UnmatchedBanner unmatched={unmatched} jobs={jobs} /> : null}

      <DataTable
        rows={tableRows}
        columns={columns}
        searchKeys={searchKeys}
        name={`purchases-${view}-${period.key}`}
        rowHrefKey="href"
        initialSort={{ key: "purchasedOn", dir: "desc" }}
        empty="No purchases recorded in this period."
      />
      {/* Any purchase, any job, any year (0026); moved here from Money so purchases have one home. */}
      <section id="find" aria-label="Find a purchase" className="rounded-2xl border border-[var(--color-stone)] bg-white p-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-charcoal-light)]">Find any purchase, any year</p>
        <PurchaseSearch />
      </section>
    </AccountingFrame>
  );
}

// How a measure reads. Server pages pass the kind by name (a function cannot
// cross into a client component), and every block formats through here.

import { compact } from "./aggregate";

export type ValueKind = "money" | "hours" | "count" | "text" | "date" | "percent";

/** money: cents. hours: minutes. percent: 0..1. date: YYYY-MM-DD or ISO. */
export function formatValue(kind: ValueKind, v: unknown, opts: { compact?: boolean } = {}): string {
  if (v === null || v === undefined || v === "") return kind === "text" || kind === "date" ? "" : "–";
  switch (kind) {
    case "money": {
      const cents = Number(v);
      if (opts.compact) return compact(cents / 100, { money: true });
      return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    }
    case "hours": {
      const h = Number(v) / 60;
      if (opts.compact && h >= 10_000) return `${compact(h)} h`;
      return `${h.toLocaleString("en-US", { minimumFractionDigits: h < 100 ? 1 : 0, maximumFractionDigits: 1 })} h`;
    }
    case "count":
      return opts.compact ? compact(Number(v)) : Number(v).toLocaleString("en-US");
    case "percent":
      return `${Math.round(Number(v) * 100)}%`;
    case "date": {
      const s = String(v);
      const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s);
      const tz = /^\d{4}-\d{2}-\d{2}$/.test(s) ? "UTC" : "America/Phoenix";
      // The year only when it is not this one: "Oct 23", "Dec 30, 2025".
      const thisYear = new Date().toLocaleDateString("en-US", { year: "numeric", timeZone: "America/Phoenix" });
      const year = d.toLocaleDateString("en-US", { year: "numeric", timeZone: tz });
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year === thisYear ? {} : { year: "numeric" }), timeZone: tz });
    }
    default:
      return String(v);
  }
}

/** The raw value a spreadsheet should get: dollars and hours as numbers. */
export function exportValue(kind: ValueKind, v: unknown): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (kind === "money") return Math.round(Number(v)) / 100;
  if (kind === "hours") return Math.round((Number(v) / 60) * 100) / 100;
  if (kind === "count" || kind === "percent") return Number(v);
  return String(v);
}

export function excelFormat(kind: ValueKind): string | undefined {
  if (kind === "money") return '"$"#,##0.00';
  if (kind === "hours") return "0.00";
  if (kind === "percent") return "0%";
  return undefined;
}
